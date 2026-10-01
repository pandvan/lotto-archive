#!/usr/bin/env python3
"""Run a formula listing against the committed archive.

A formula says which numbers to look for in one draw and which bets to play when they
are there. It matches when every one of its *numeri di ricerca* came out on **exactly
one** wheel -- a number on two wheels makes the play *sporca* -- and those wheels number
exactly as many as the listing asks for. Its bets are then checked against the preceding
draws on the matching wheels: one whose numbers already came out there is reported as
rejected, and what is left is the clean play. ``--scope`` widens or narrows the wheels
that check searches.

Formulas come either from a file -- ``.frm`` or its JSON form, see
``schema/formula.schema.json`` -- or typed out on the command line in the same syntax,
numbers first and a bet per ``#`` column.

The rule selects; it does not predict. Every draw is independent of the ones before it,
so removing a bet whose numbers came out recently does not make the remaining ones more
likely to come out.
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

from _common import REPO_ROOT

from lotto.archive import load
from lotto.listing import (
    DEFAULT_LOOKBACK,
    DEFAULT_SCOPE,
    DEFAULT_WHEELS,
    SCOPES,
    Listing,
    ListingReport,
    Match,
    apply,
    one_formula,
    read,
    scan,
)
from lotto.model import LottoError, contest_numbers, iso


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root")

    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--listing",
        type=Path,
        default=None,
        metavar="FILE",
        help="a listing to run: a .frm file, or the .json form of one",
    )
    source.add_argument(
        "-s",
        "--search",
        nargs="+",
        default=None,
        metavar="N",
        help="a single formula, written as a listing line: the numbers to look for, "
        "then a bet per '#' column — '-s \"14 1 62 # 43 19 # 27\"'. Commas work too, "
        "and --wheels and --lookback stand in for the header",
    )

    parser.add_argument(
        "-w",
        "--wheels",
        type=int,
        default=DEFAULT_WHEELS,
        metavar="Y",
        help=f"wheels the numbers must be spread over, with --search (default: {DEFAULT_WHEELS})",
    )
    parser.add_argument(
        "-z",
        "--lookback",
        type=int,
        default=DEFAULT_LOOKBACK,
        metavar="Z",
        help=f"draws the retrovisione reaches back, with --search (default: {DEFAULT_LOOKBACK})",
    )
    parser.add_argument(
        "--scope",
        choices=SCOPES,
        default=DEFAULT_SCOPE,
        help="which wheels the retrovisione searches: strict every wheel, medium the "
        f"wheels of the match, loose each of them on its own (default: {DEFAULT_SCOPE}, "
        "what lotto-convergence does)",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="keep only matches the retrovisione left untouched — every bet still "
        "playable, none already out on the matching wheels. A formula that plays no "
        "bets has nothing to burn and is kept",
    )
    parser.add_argument(
        "--date",
        type=datetime.date.fromisoformat,
        default=None,
        help="the draw to test, ISO 8601 (default: the most recent one)",
    )
    parser.add_argument(
        "--scan",
        action="store_true",
        help="test every draw in the range instead of a single one",
    )
    parser.add_argument(
        "--since",
        type=datetime.date.fromisoformat,
        default=None,
        help="first draw of a --scan (default: the start of the archive)",
    )
    parser.add_argument(
        "--until",
        type=datetime.date.fromisoformat,
        default=None,
        help="last draw of a --scan (default: the end of the archive)",
    )
    parser.add_argument("--json", action="store_true", help="emit the report as JSON")
    return parser.parse_args()


# ------------------------------------------------------------------- formatting


def _combo(numbers: tuple[int, ...]) -> str:
    return "-".join(str(n) for n in numbers)


def format_match(match: Match, ordinal: int) -> list[str]:
    found = " · ".join(
        f"{wheel} {' '.join(str(n) for n in numbers)}"
        for wheel, numbers in match.found.items()
    )
    isotopy = "   isotopi" if match.isotopic else ""
    lines = [
        f"{ordinal:>3}. formula {match.formula.index}  "
        f"{_combo(match.formula.numbers)}  on {found}{isotopy}"
    ]
    # One line per bet list the formula actually plays; an empty list says nothing.
    for name, bets in match.by_type.items():
        if not bets:
            continue
        played = " · ".join(
            _combo(checked.bet.numbers)
            # Under loose each wheel gets its own verdict, so say which one this is.
            + (f" on {checked.play[0]}" if len(checked.play) < len(match.wheels) else "")
            + (
                ""
                if checked.clean
                else f" (out: {checked.seen_number} on {checked.seen_wheel}"
                f" {iso(checked.seen_date)}, position {checked.seen_position})"
            )
            for checked in bets
        )
        lines.append(f"     {name:<9} {played}")
    return lines


def format_report(report: ListingReport, contest: int) -> list[str]:
    head = f"{iso(report.date)}  concorso {contest}"
    if report.short_history:
        lookback = report.listing.lookback
        return [f"{head} — only {report.history} draws precede it, {lookback} required"]
    if not report.satisfied:
        return [f"{head} — no formula matched"]
    lines = [f"{head} — {len(report.matches)} matched", ""]
    for ordinal, match in enumerate(report.matches, start=1):
        lines += format_match(match, ordinal)
        lines.append("")
    return lines


# -------------------------------------------------------------------------- run


def listing_from(args) -> Listing:
    """The listing the flags name: a file, or one formula typed out."""
    if args.listing:
        return read(args.listing)
    line = " ".join(args.search).replace(",", " ")
    return one_formula(line, wheel_count=args.wheels, lookback=args.lookback)


def run(args, draws, contests) -> int:
    listing = listing_from(args)
    if args.scan:
        reports = scan(
            draws,
            listing,
            since=args.since,
            until=args.until,
            clean_only=args.clean,
            scope=args.scope,
        )
    else:
        reports = [
            apply(
                draws,
                args.date or max(draws),
                listing,
                clean_only=args.clean,
                scope=args.scope,
            )
        ]

    if args.json:
        payload = [report.as_dict() for report in reports]
        print(json.dumps(payload if args.scan else payload[0], indent=2))
        return 0

    print(
        f"listing: {listing.name} — {listing.size} numbers over "
        f"{listing.wheel_count} wheels, retrovisione {listing.lookback} draws, "
        f"{len(listing.formulas)} formula{'s' if len(listing.formulas) != 1 else ''}"
        + f", {args.scope} retrovisione"
        + (", clean only" if args.clean else "")
    )
    print()
    for report in reports:
        for line in format_report(report, contests[report.date]):
            print(line)
    if args.scan:
        print(f"{len(reports)} draw{'s' if len(reports) != 1 else ''} matched")
    return 0


def main() -> int:
    args = parse_args()
    draws = load(args.root)
    if not draws:
        print("error: no archive found", file=sys.stderr)
        return 1

    try:
        return run(args, draws, contest_numbers(list(draws)))
    except (LottoError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
