"""Structural and semantic checks on the archive.

Everything here is hand-rolled so the runtime needs no JSON-Schema dependency; the
schemas under ``schema/`` are published for consumers, not used by this code.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path

from .archive import DATA_DIR, INDEX_FILE, YEAR_FILE_RE
from .model import (
    FIRST_DATE,
    MAX_NUMBER,
    MIN_NUMBER,
    NUMBERS_PER_WHEEL,
    WHEELS,
    WHEEL_SET,
    DrawSet,
    contest_numbers,
    count_rows,
    expected_wheels,
    iso,
)


class Report:
    """Collected problems. ``errors`` block a commit; ``warnings`` do not."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    @property
    def ok(self) -> bool:
        return not self.errors

    def summary(self) -> str:
        return f"{len(self.errors)} error(s), {len(self.warnings)} warning(s)"


def check_draws(draws: DrawSet, report: Report, *, today: datetime.date | None = None) -> None:
    """Validate an in-memory draw set."""
    today = today or datetime.date.today()
    if not draws:
        report.error("archive is empty")
        return

    for day in sorted(draws):
        where = iso(day)
        if day < FIRST_DATE:
            report.error(f"{where}: predates the first known draw {iso(FIRST_DATE)}")
        if day > today:
            report.error(f"{where}: draw is in the future")

        wheels = draws[day]
        if not wheels:
            report.error(f"{where}: no wheels")
            continue

        unknown = sorted(set(wheels) - WHEEL_SET)
        if unknown:
            report.error(f"{where}: unknown wheel(s) {unknown}")

        for wheel in sorted(set(wheels) & WHEEL_SET):
            numbers = wheels[wheel]
            if len(numbers) != NUMBERS_PER_WHEEL:
                report.error(f"{where} {wheel}: {len(numbers)} numbers, expected {NUMBERS_PER_WHEEL}")
                continue
            if not all(isinstance(n, int) and not isinstance(n, bool) for n in numbers):
                report.error(f"{where} {wheel}: non-integer value in {numbers}")
                continue
            out_of_range = [n for n in numbers if not MIN_NUMBER <= n <= MAX_NUMBER]
            if out_of_range:
                report.error(f"{where} {wheel}: out-of-range {out_of_range}")
            if len(set(numbers)) != len(numbers):
                report.error(f"{where} {wheel}: repeated number in {numbers}")

        missing = sorted(expected_wheels(day) - set(wheels))
        if missing:
            report.warn(f"{where}: missing expected wheel(s) {missing}")


def check_files(root: Path, report: Report) -> DrawSet:
    """Validate the on-disk layout, returning the draw set it describes."""
    data_dir = root / DATA_DIR
    if not data_dir.is_dir():
        report.error(f"missing {DATA_DIR}/ directory")
        return {}

    draws: DrawSet = {}
    year_files = sorted(p for p in data_dir.iterdir() if YEAR_FILE_RE.match(p.name))
    if not year_files:
        report.error(f"no year files in {DATA_DIR}/")
        return {}

    for path in year_files:
        year = int(YEAR_FILE_RE.match(path.name).group(1))
        payload = json.loads(path.read_text(encoding="utf-8"))
        rel = f"{DATA_DIR}/{path.name}"

        if payload.get("year") != year:
            report.error(f"{rel}: 'year' is {payload.get('year')!r}, expected {year}")

        entries = payload.get("draws")
        if not isinstance(entries, list) or not entries:
            report.error(f"{rel}: 'draws' missing or empty")
            continue
        if payload.get("draw_count") != len(entries):
            report.error(f"{rel}: draw_count {payload.get('draw_count')} != {len(entries)} draws")

        days: list[datetime.date] = []
        for entry in entries:
            day = datetime.date.fromisoformat(entry["date"])
            if day.year != year:
                report.error(f"{rel}: draw dated {iso(day)} does not belong to {year}")
            if day in draws:
                report.error(f"{rel}: duplicate draw for {iso(day)}")
            days.append(day)
            draws[day] = {name: list(v) for name, v in entry["wheels"].items()}
            keys = list(entry["wheels"])
            if keys != [w for w in WHEELS if w in set(keys)]:
                report.error(f"{rel} {iso(day)}: wheels are not in canonical order")

        if days != sorted(days):
            report.error(f"{rel}: draws are not sorted by date")
        if payload.get("first_date") != iso(min(days)) or payload.get("last_date") != iso(max(days)):
            report.error(f"{rel}: first_date/last_date do not match the draws")

        expected_contests = contest_numbers(days)
        for entry, day in zip(entries, days):
            if entry.get("contest") != expected_contests[day]:
                report.error(
                    f"{rel} {iso(day)}: contest {entry.get('contest')!r}, "
                    f"expected {expected_contests[day]}"
                )

    _check_index(root, draws, report)
    return draws


def _check_index(root: Path, draws: DrawSet, report: Report) -> None:
    path = root / INDEX_FILE
    if not path.exists():
        report.error(f"missing {INDEX_FILE}")
        return
    index = json.loads(path.read_text(encoding="utf-8"))
    days = sorted(draws)
    checks = {
        "draw_count": len(days),
        "wheel_rows": count_rows(draws),
        "first_date": iso(days[0]) if days else None,
        "last_date": iso(days[-1]) if days else None,
    }
    for key, expected in checks.items():
        if index.get(key) != expected:
            report.error(f"{INDEX_FILE}: {key} is {index.get(key)!r}, expected {expected!r}")
    if index.get("wheels") != list(WHEELS):
        report.error(f"{INDEX_FILE}: 'wheels' does not match the canonical wheel list")

    per_year = {row["year"]: row for row in index.get("years", [])}
    actual_years = {day.year for day in days}
    if set(per_year) != actual_years:
        report.error(f"{INDEX_FILE}: 'years' does not match the year files on disk")
    for year, row in per_year.items():
        count = sum(1 for day in days if day.year == year)
        if row.get("draw_count") != count:
            report.error(f"{INDEX_FILE}: year {year} draw_count {row.get('draw_count')} != {count}")


def validate_tree(root: Path, *, today: datetime.date | None = None) -> Report:
    """Full on-disk validation."""
    report = Report()
    draws = check_files(root, report)
    if draws:
        check_draws(draws, report, today=today)
    return report
