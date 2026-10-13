#!/usr/bin/env python3
"""Compare one derived 10eLotto draw with what ADM, the regulator, publishes.

By default the latest draw in ``data/10elotto/``. The archive keeps the derived value
whatever the answer: this only reports. Exits non-zero on a difference, or when ADM
cannot be fetched or understood. A draw ADM has not published yet is not a difference.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from _common import REPO_ROOT, summary

from lotto import sources
from lotto.model import LottoError
from lotto.diecielotto import ADM_URL, DATA_DIR, parse_adm


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root")
    parser.add_argument("--year", type=int, help="with --contest: the draw to check")
    parser.add_argument("--contest", type=int)
    parser.add_argument("--file", type=Path, help="read the ADM page from a local file")
    args = parser.parse_args()
    if (args.year is None) != (args.contest is None):
        parser.error("--year and --contest go together")

    data_dir = args.root / DATA_DIR
    if args.year is None:
        derived = json.loads((data_dir / "latest.json").read_text(encoding="utf-8"))
        year, contest = int(derived["date"][:4]), derived["contest"]
    else:
        year, contest = args.year, args.contest
        path = data_dir / f"{year}.json"
        draws = json.loads(path.read_text(encoding="utf-8"))["draws"] if path.exists() else []
        derived = next((d for d in draws if d["contest"] == contest), None)

    if args.file:
        html = args.file.read_text(encoding="utf-8")
    else:
        url = ADM_URL.format(year=year, contest=contest)
        html = sources.fetch(sources.build_session(), url).content.decode("utf-8")
    official = parse_adm(html)

    where = f"10eLotto {year} contest {contest}"
    if official is None:
        summary(f"{where}: not published by ADM yet")
        return 0
    if derived is None:
        summary(f"{where}: ADM has the draw of {official['date']}, the archive does not")
        return 1
    different = [key for key in derived.keys() | official.keys() if derived.get(key) != official.get(key)]
    for key in sorted(different):
        summary(f"{where} {key}: derived {derived.get(key)}, ADM {official.get(key)}")
    if not different:
        summary(f"{where} ({derived['date']}): equal to ADM")
    return 1 if different else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except LottoError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
