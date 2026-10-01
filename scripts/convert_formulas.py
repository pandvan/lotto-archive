#!/usr/bin/env python3
"""Convert lotto-convergence ``.frm`` listings into the JSON formula format.

``.frm`` is a positional text format: four header lines, then one formula per line
with its bets separated by ``#`` and their kind implied by how many numbers each holds.
The JSON form says all of that out loud -- the header as named fields, the bets already
split into the five lists -- so a formula can be read, edited and checked without
knowing the original layout. ``schema/formula.schema.json`` is its schema.

The output is a conversion of someone else's files and is **not** part of this archive:
it is written to ``formulas/``, which is git-ignored.

    python scripts/convert_formulas.py ../lotto-convergence/frm
    python scripts/convert_formulas.py ../lotto-convergence/frm/nsla.frm --out /tmp/f
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _common import REPO_ROOT

from lotto.archive import render_json
from lotto.listing import parse, to_json
from lotto.model import LottoError

OUT_DIR = "formulas"

#: What a listing file is called. The ``.no`` ones are listings their author disabled;
#: a directory sweep leaves them alone, but naming one converts it like any other.
SUFFIX = ".frm"
DISABLED_SUFFIX = ".no"


def out_name(path: Path) -> str:
    """``ripetuti.2010.frm.no`` -> ``ripetuti.2010.json``.

    The original file name is kept inside the document, so dropping it here loses
    nothing.
    """
    name = path.name
    if name.endswith(DISABLED_SUFFIX):
        name = name[: -len(DISABLED_SUFFIX)]
    if name.endswith(SUFFIX):
        name = name[: -len(SUFFIX)]
    return f"{name}.json"


def sources(paths: list[Path]) -> list[Path]:
    """Every listing to convert: named files as given, directories swept for ``.frm``."""
    found: list[Path] = []
    for path in paths:
        if path.is_dir():
            found += sorted(path.glob(f"*{SUFFIX}"))
        else:
            found.append(path)
    return found


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "paths",
        type=Path,
        nargs="+",
        metavar="PATH",
        help=f"a {SUFFIX} file, or a directory to sweep for them",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=REPO_ROOT / OUT_DIR,
        help=f"where to write the JSON (default: <root>/{OUT_DIR})",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    paths = sources(args.paths)
    if not paths:
        print(f"error: no {SUFFIX} listing found", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    failed = 0
    for path in paths:
        try:
            listing = parse(path)
        except (LottoError, OSError) as error:
            print(f"error: {path.name}: {error}", file=sys.stderr)
            failed += 1
            continue
        target = args.out / out_name(path)
        target.write_text(render_json(to_json(listing, source=path.name)), encoding="utf-8")
        print(
            f"{path.name:<28} -> {target.name:<24} "
            f"{len(listing.formulas):>3} formulas, "
            f"{listing.size}/{listing.wheel_count}/{listing.lookback}"
        )

    print(f"{len(paths) - failed} converted into {args.out}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
