#!/usr/bin/env python3
"""One-off initial import of the whole archive.

Fetches *both* upstream sources, proves they agree, proves the derived contest
numbers match the fallback's authoritative ``CONCORSO``, and only then writes the
year files. Run once; ``update.py`` maintains the archive from there.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from _common import REPO_ROOT, summary, utc_stamp

from lotto import parse_dbf, parse_txt, sources
from lotto.archive import write
from lotto.model import contest_numbers, count_rows
from lotto.validate import validate_tree


def load_sources(args) -> tuple[dict, dict, dict, dict]:
    """Return ``(primary, fallback, contests, source_state)``."""
    state: dict = {}
    if args.primary_file:
        text = args.primary_file.read_text(encoding="ascii")
        state["primary"] = {"url": sources.PRIMARY_URL, "local_file": str(args.primary_file)}
    else:
        session = sources.build_session()
        fetched, text = sources.fetch_primary(session)
        state["primary"] = {
            "url": sources.PRIMARY_URL,
            "etag": fetched.etag,
            "last_modified": fetched.last_modified,
        }

    if args.fallback_file:
        raw = args.fallback_file.read_bytes()
        state["fallback"] = {"url": sources.FALLBACK_URL, "local_file": str(args.fallback_file)}
    else:
        session = sources.build_session()
        fetched, raw = sources.fetch_fallback(session)
        state["fallback"] = {
            "url": sources.FALLBACK_URL,
            "last_modified": fetched.last_modified,
        }

    primary = parse_txt.parse(text)
    fallback, contests = parse_dbf.parse(raw)
    return primary, fallback, contests, state


def compare(primary: dict, fallback: dict, contests: dict) -> list[str]:
    """Every way the two sources could disagree."""
    problems: list[str] = []

    only_primary = sorted(set(primary) - set(fallback))
    only_fallback = sorted(set(fallback) - set(primary))
    if only_primary:
        problems.append(f"{len(only_primary)} date(s) only in the primary, e.g. {only_primary[:5]}")
    if only_fallback:
        problems.append(f"{len(only_fallback)} date(s) only in the fallback, e.g. {only_fallback[:5]}")

    mismatches = []
    for day in sorted(set(primary) & set(fallback)):
        wheels = set(primary[day]) | set(fallback[day])
        for wheel in sorted(wheels):
            if primary[day].get(wheel) != fallback[day].get(wheel):
                mismatches.append(f"{day} {wheel}")
    if mismatches:
        problems.append(f"{len(mismatches)} row mismatch(es), e.g. {mismatches[:5]}")

    derived = contest_numbers(list(primary))
    bad = [f"{d} derived={derived[d]} dbf={contests[d]}" for d in sorted(derived) if d in contests and derived[d] != contests[d]]
    if bad:
        problems.append(f"{len(bad)} contest mismatch(es), e.g. {bad[:5]}")

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT)
    parser.add_argument("--dry-run", action="store_true", help="write to a temp dir instead")
    parser.add_argument("--primary-file", type=Path, help="use a local storico.txt")
    parser.add_argument("--fallback-file", type=Path, help="use a local estratti.dbf")
    parser.add_argument(
        "--allow-disagreement",
        action="store_true",
        help="write the primary's data even if the sources disagree",
    )
    args = parser.parse_args()

    primary, fallback, contests, state = load_sources(args)
    summary(
        f"primary:  {len(primary)} dates, {count_rows(primary)} rows, "
        f"{min(primary)} .. {max(primary)}"
    )
    summary(
        f"fallback: {len(fallback)} dates, {count_rows(fallback)} rows, "
        f"{min(fallback)} .. {max(fallback)}"
    )

    problems = compare(primary, fallback, contests)
    if problems:
        for problem in problems:
            print(f"disagreement: {problem}", file=sys.stderr)
        if not args.allow_disagreement:
            return 1
    else:
        summary("sources agree exactly, and derived contest numbers match CONCORSO")

    state["primary"]["used"] = True
    state["fallback"]["used"] = True
    state["fallback"]["last_reconciled"] = utc_stamp()

    root = args.root
    if args.dry_run:
        tmp = tempfile.TemporaryDirectory()
        root = Path(tmp.name)

    changed = write(root, primary, generated_at=utc_stamp(), sources=state)
    summary(f"wrote {len(changed)} file(s) under {root}")

    report = validate_tree(root)
    for warning in report.warnings[:10]:
        print(f"warning: {warning}")
    if len(report.warnings) > 10:
        print(f"... and {len(report.warnings) - 10} more warning(s)")
    for error in report.errors:
        print(f"error: {error}", file=sys.stderr)
    summary(f"validation: {report.summary()}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
