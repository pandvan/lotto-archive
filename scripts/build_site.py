#!/usr/bin/env python3
"""Build the static statistics site from the committed archive.

Reads ``data/<year>.json``, computes every statistic in :mod:`lotto.stats`, and
writes a self-contained directory ready for GitHub Pages: the hand-written assets
from ``web/`` copied verbatim, plus one JSON file of metadata and one per wheel
under ``data/``.

The output is entirely derived and is not committed -- ``.github/workflows/pages.yml``
rebuilds it whenever the archive changes.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from _common import REPO_ROOT, summary, utc_stamp

from lotto.archive import load, render_json, render_json_min
from lotto.stats import build

WEB_DIR = "web"
OUT_DIR = "site"
DATA_SUBDIR = "data"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help=f"output directory (default: <root>/{OUT_DIR})",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="indent the generated JSON, for inspecting it by hand",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root: Path = args.root
    out: Path = args.out or root / OUT_DIR
    render = render_json if args.pretty else render_json_min

    draws = load(root)
    if not draws:
        raise SystemExit("error: no archive found; run scripts/bootstrap.py first")

    meta, per_wheel = build(draws, generated_at=utc_stamp())

    if out.exists():
        shutil.rmtree(out)
    web = root / WEB_DIR
    shutil.copytree(web, out)
    # GitHub Pages serves the directory as-is only when Jekyll is switched off.
    (out / ".nojekyll").write_text("", encoding="utf-8")

    data_dir = out / DATA_SUBDIR
    wheels_dir = data_dir / "wheels"
    wheels_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "meta.json").write_text(render(meta), encoding="utf-8")
    for wheel, payload in per_wheel.items():
        (wheels_dir / f"{wheel}.json").write_text(render(payload), encoding="utf-8")

    written = sorted(path for path in out.rglob("*") if path.is_file())
    total = sum(path.stat().st_size for path in written)
    summary(
        f"built {out.relative_to(root) if out.is_relative_to(root) else out}: "
        f"{len(written)} files, {total / 1024:.0f} KiB, "
        f"{len(per_wheel)} wheels, archive through {meta['last_draw']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
