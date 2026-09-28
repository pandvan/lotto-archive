#!/usr/bin/env python3
"""Validate the committed archive. Exits non-zero if anything is wrong."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _common import REPO_ROOT
from lotto.validate import validate_tree


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root")
    parser.add_argument(
        "--strict", action="store_true", help="treat warnings as errors"
    )
    args = parser.parse_args()

    report = validate_tree(args.root)
    for warning in report.warnings:
        print(f"warning: {warning}")
    for error in report.errors:
        print(f"error: {error}", file=sys.stderr)

    print(f"validation: {report.summary()}")
    if report.errors or (args.strict and report.warnings):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
