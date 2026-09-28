"""Shared helpers for the command-line entrypoints."""

from __future__ import annotations

import datetime
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def utc_stamp() -> str:
    return datetime.datetime.now(tz=datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def set_output(**values: object) -> None:
    """Publish step outputs when running inside GitHub Actions."""
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            if isinstance(value, bool):
                value = "true" if value else "false"
            handle.write(f"{key}={value}\n")


def summary(text: str) -> None:
    """Append to the GitHub Actions job summary, and always echo to stdout."""
    print(text)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(text + "\n")
