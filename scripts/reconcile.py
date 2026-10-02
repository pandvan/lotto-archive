#!/usr/bin/env python3
"""Weekly cross-check of the archive against the fallback source.

The normal update path uses only the primary, so nothing would otherwise notice if
the two upstream archives drifted apart. This job downloads the fallback DBF and
compares every row, and every derived contest number, against what is committed.

A contest mismatch is the important one: the contest number is derived as the
position of a draw within its calendar year, so a *missing* draw silently shifts
every later contest number in that year. Comparing against the DBF's authoritative
CONCORSO is what makes that derivation safe.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _common import REPO_ROOT, set_output, summary, utc_stamp

from lotto import parse_dbf, sources
from lotto.archive import load, merge, read_index, write
from lotto.model import LottoError, contest_numbers, count_rows, iso
from lotto.validate import Report, check_draws


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fallback-file", type=Path, help="use a local estratti.dbf")
    parser.add_argument(
        "--repair",
        action="store_true",
        help="add draws the fallback has and the archive lacks",
    )
    args = parser.parse_args()

    root = args.root
    archive = load(root)
    if not archive:
        print("error: archive is empty; run bootstrap.py first", file=sys.stderr)
        return 1

    if args.fallback_file:
        raw = args.fallback_file.read_bytes()
        last_modified = None
    else:
        fetched, raw = sources.fetch_fallback(sources.build_session())
        last_modified = fetched.last_modified

    fallback, contests = parse_dbf.parse(raw)
    summary(f"archive:  {len(archive)} draws, {count_rows(archive)} rows, last {iso(max(archive))}")
    summary(f"fallback: {len(fallback)} draws, {count_rows(fallback)} rows, last {iso(max(fallback))}")

    # Repair before judging: a missing draw also shifts every later contest number of
    # its year, so the checks below must see the archive as the repair leaves it. A
    # draw that was added is no longer a problem, and the run can then end clean.
    missing = sorted(set(fallback) - set(archive))
    changed: list[Path] = []
    if missing and args.repair:
        result = merge(archive, {day: fallback[day] for day in missing})
        report = Report()
        check_draws(result.draws, report)
        if not report.ok:
            for error in report.errors:
                print(f"error: {error}", file=sys.stderr)
            return 1
        if args.dry_run:
            summary(f"dry run: would repair {len(missing)} missing draw(s)")
        else:
            state = read_index(root).get("sources", {})
            state.setdefault("primary", {"url": sources.PRIMARY_URL})
            state["fallback"] = {
                "url": sources.FALLBACK_URL,
                "last_modified": last_modified,
                "used": True,
                "last_reconciled": utc_stamp(),
            }
            changed = write(root, result.draws, generated_at=utc_stamp(), sources=state)
            summary(f"repaired {len(missing)} missing draw(s)")
            archive, missing = result.draws, []

    problems: list[str] = []

    # Rows that exist in both but disagree: the archive is wrong, or upstream is.
    mismatches = [
        f"{iso(day)} {wheel}: archive {archive[day].get(wheel)} != fallback {fallback[day].get(wheel)}"
        for day in sorted(set(archive) & set(fallback))
        for wheel in sorted(set(archive[day]) | set(fallback[day]))
        if archive[day].get(wheel) != fallback[day].get(wheel)
    ]
    if mismatches:
        problems.append(f"{len(mismatches)} row mismatch(es)")

    if missing:
        problems.append(
            f"{len(missing)} draw(s) in the fallback but not the archive: "
            f"{[iso(d) for d in missing[:5]]}"
        )

    extra = sorted(set(archive) - set(fallback))
    if extra:
        problems.append(
            f"{len(extra)} draw(s) in the archive but not the fallback: "
            f"{[iso(d) for d in extra[:5]]}"
        )

    derived = contest_numbers(list(archive))
    contest_bad = [
        f"{iso(day)}: derived {derived[day]} != CONCORSO {contests[day]}"
        for day in sorted(set(derived) & set(contests))
        if derived[day] != contests[day]
    ]
    if contest_bad:
        problems.append(f"{len(contest_bad)} contest mismatch(es)")

    for line in mismatches[:10] + contest_bad[:10]:
        print(f"discrepancy: {line}", file=sys.stderr)

    set_output(changed=bool(changed), discrepancies=len(problems))

    if problems:
        for problem in problems:
            summary(f"PROBLEM: {problem}")
        return 1

    summary("reconcile clean: every row and contest number agrees with the fallback")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LottoError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
