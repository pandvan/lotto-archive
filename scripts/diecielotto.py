#!/usr/bin/env python3
"""Derive the 10eLotto archive under ``data/10elotto/`` from the committed Lotto archive.

Reads ``data/lotto/``, idempotent. The one exception is a draw whose extra numbers ADM
had to draw itself: they are kept from ``data/10elotto/`` or, the first time, fetched
from ADM; ``--check`` never fetches. A draw that cannot be derived is skipped and
reported, the others are still written, and the exit is non-zero.
"""

from __future__ import annotations

import argparse
import datetime
import sys
from pathlib import Path

from _common import REPO_ROOT, summary

from lotto import sources
from lotto.archive import load
from lotto.model import LottoError, iso
from lotto.diecielotto import ADM_URL, DATA_DIR, build, parse_adm, recorded, render


def fetch_adm(year: int, contest: int) -> dict | None:
    """The record ADM publishes for a contest, or ``None`` when it has no such draw yet."""
    url = ADM_URL.format(year=year, contest=contest)
    return parse_adm(sources.fetch(sources.build_session(), url).content.decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root")
    parser.add_argument(
        "--check",
        action="store_true",
        help="write nothing; fail when the files differ from what would be written",
    )
    args = parser.parse_args()

    known = recorded(args.root)

    def published(day: datetime.date, contest: int) -> dict | None:
        if iso(day) in known or args.check:
            return known.get(iso(day))
        return fetch_adm(day.year, contest)

    records, errors = build(load(args.root), published)
    for error in errors:
        print(f"error: {error}", file=sys.stderr)

    files = render(records)
    data_dir = args.root / DATA_DIR
    on_disk = {p.name: p for p in data_dir.glob("*.json")} if data_dir.is_dir() else {}
    stale = sorted(
        name
        for name in files.keys() | on_disk.keys()
        if name not in on_disk
        or on_disk[name].read_text(encoding="utf-8") != files.get(name)
    )

    if args.check:
        for name in stale:
            print(f"error: {DATA_DIR}/{name} is not what the Lotto archive derives", file=sys.stderr)
        print(f"10eLotto check: {len(records)} draw(s), {len(stale)} file(s) differ")
        return 1 if stale or errors else 0

    data_dir.mkdir(parents=True, exist_ok=True)
    for name in stale:
        if name in files:
            (data_dir / name).write_text(files[name], encoding="utf-8")
        else:
            on_disk[name].unlink()
    last = records[-1]["date"] if records else "n/a"
    summary(f"10eLotto: {len(records)} draw(s), last {last}, {len(stale)} file(s) changed")
    if errors:
        summary(f"10eLotto: {len(errors)} draw(s) could not be derived")
    return 1 if errors else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LottoError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
