#!/usr/bin/env python3
"""Incremental archive update: primary source first, fallback only when it lags.

Safe to run at any time and as often as you like -- it is idempotent, and a run
with nothing to do costs one conditional HTTP request.
"""

from __future__ import annotations

import argparse
import datetime
import sys
from pathlib import Path

from _common import REPO_ROOT, set_output, summary, utc_stamp

from lotto import calendar_it, parse_dbf, parse_txt, sources
from lotto.archive import load, merge, read_index, write
from lotto.model import LottoError, count_rows, iso
from lotto.validate import Report, check_draws


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT)
    parser.add_argument("--dry-run", action="store_true", help="do not write any file")
    parser.add_argument(
        "--force-refetch",
        action="store_true",
        help="ignore the stored ETag and download the primary unconditionally",
    )
    parser.add_argument(
        "--allow-history-rewrite",
        action="store_true",
        help="accept upstream changes to already-published draws",
    )
    parser.add_argument(
        "--now",
        type=datetime.datetime.fromisoformat,
        help="override the current time (ISO 8601) when judging staleness",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    now = args.now or calendar_it.now_rome()
    if now.tzinfo is None:
        now = now.replace(tzinfo=calendar_it.ROME)

    root = args.root
    archive = load(root)
    stored_last = max(archive) if archive else None
    expected = calendar_it.expected_last_draw(now)
    summary(
        f"archive holds {len(archive)} draws, last {iso(stored_last) if stored_last else 'n/a'}; "
        f"most recent expected draw is {iso(expected) if expected else 'n/a'}"
    )

    index = read_index(root)
    primary_state = dict(index.get("sources", {}).get("primary") or {})
    session = sources.build_session()

    # --- primary -----------------------------------------------------------
    conditional = {} if args.force_refetch else {
        "etag": primary_state.get("etag"),
        "last_modified": primary_state.get("last_modified"),
    }
    fetched, text = sources.fetch_primary(session, **conditional)

    if fetched.not_modified:
        summary("primary: 304 Not Modified")
        incoming = {}
    else:
        incoming = parse_txt.parse(text)
        summary(
            f"primary: {len(incoming)} dates, {count_rows(incoming)} rows, "
            f"last {iso(max(incoming))}"
        )

    result = merge(archive, incoming)
    used_fallback = False
    fallback_state = dict(index.get("sources", {}).get("fallback") or {})

    # --- fallback, only if the primary has not caught up -------------------
    merged_last = max(result.draws) if result.draws else None
    if merged_last is not None and expected is not None and merged_last < expected:
        summary(f"primary is behind ({iso(merged_last)} < {iso(expected)}); trying the fallback")
        # The fallback is a second chance, not a requirement: the primary is also
        # "behind" the morning after a holiday with no draw, and what it did supply
        # must still be published. A draw that stays missing fails the run below.
        try:
            fb_fetched, raw = sources.fetch_fallback(session)
            fallback, _contests = parse_dbf.parse(raw)
        except LottoError as exc:
            summary(f"fallback unavailable, keeping the primary result: {exc}")
        else:
            summary(f"fallback: {len(fallback)} dates, last {iso(max(fallback))}")
            # Only the draws the primary lacks. Comparing the history the two sources
            # share is the weekly reconcile's job; doing it here would let one old
            # disagreement block every new draw.
            newer = {day: rows for day, rows in fallback.items() if day > merged_last}
            fallback_result = merge(result.draws, newer)
            fallback_result.added_dates = sorted(set(fallback_result.added_dates) | set(result.added_dates))
            fallback_result.added_rows += result.added_rows
            fallback_result.conflicts = result.conflicts + fallback_result.conflicts
            result = fallback_result
            used_fallback = True
            fallback_state = {
                "url": sources.FALLBACK_URL,
                "last_modified": fb_fetched.last_modified,
                "last_reconciled": fallback_state.get("last_reconciled"),
            }
            merged_last = max(result.draws)

    # --- refuse to rewrite history ----------------------------------------
    if result.conflicts:
        for conflict in result.conflicts[:20]:
            print(f"conflict: {conflict}", file=sys.stderr)
        if len(result.conflicts) > 20:
            print(f"... and {len(result.conflicts) - 20} more", file=sys.stderr)
        if not args.allow_history_rewrite:
            print(
                f"refusing to publish: {len(result.conflicts)} already-published row(s) "
                "changed upstream. Re-run with --allow-history-rewrite once verified.",
                file=sys.stderr,
            )
            set_output(changed=False, conflicts=len(result.conflicts))
            return 1
        summary(f"accepting {len(result.conflicts)} history rewrite(s) as instructed")
        for conflict in result.conflicts:
            result.draws[conflict.date][conflict.wheel] = conflict.incoming

    # --- validate before writing ------------------------------------------
    report = Report()
    check_draws(result.draws, report, today=now.date())
    for error in report.errors:
        print(f"error: {error}", file=sys.stderr)
    if not report.ok:
        print(f"refusing to publish: {report.summary()}", file=sys.stderr)
        set_output(changed=False)
        return 1

    # --- write -------------------------------------------------------------
    state = {
        "primary": {
            "url": sources.PRIMARY_URL,
            "etag": fetched.etag,
            "last_modified": fetched.last_modified,
            "used": not fetched.not_modified,
        },
        "fallback": {
            "url": sources.FALLBACK_URL,
            "last_modified": fallback_state.get("last_modified"),
            "used": used_fallback,
            "last_reconciled": fallback_state.get("last_reconciled"),
        },
    }

    if args.dry_run:
        summary(
            f"dry run: would add {len(result.added_dates)} draw(s) / "
            f"{result.added_rows} row(s)"
        )
        changed = []
    else:
        changed = write(root, result.draws, generated_at=utc_stamp(), sources=state)

    if result.added_dates:
        first, last = iso(result.added_dates[0]), iso(result.added_dates[-1])
        span = first if first == last else f"{first} .. {last}"
        summary(f"added {len(result.added_dates)} draw(s) ({span}), {result.added_rows} rows")
    elif result.added_rows:
        summary(f"added {result.added_rows} row(s) to existing draws")
    else:
        summary("no new draws")

    # --- staleness ---------------------------------------------------------
    behind = calendar_it.staleness(merged_last, now) if merged_last else datetime.timedelta(0)
    if behind > datetime.timedelta(0):
        summary(f"archive is {behind} behind the expected draw {iso(expected)}")
    set_output(
        changed=bool(changed),
        added=len(result.added_dates),
        last_date=iso(merged_last) if merged_last else "",
        stale_hours=round(behind.total_seconds() / 3600, 1),
    )
    if changed:
        summary("changed files: " + ", ".join(str(p.relative_to(root)) for p in changed[:10]))

    if behind > calendar_it.STALE_GRACE:
        print(
            f"both sources are still missing the draw of {iso(expected)} "
            f"({behind} late)",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LottoError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
