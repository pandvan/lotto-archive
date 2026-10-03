"""Loading, merging and writing the on-disk JSON archive."""

from __future__ import annotations

import datetime
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from .model import (
    WHEELS,
    DrawSet,
    LottoError,
    contest_numbers,
    count_rows,
    iso,
    order_wheels,
)

DATA_DIR = "data"
INDEX_FILE = "index.json"
ALL_FILE = "all.json"
ALL_MIN_FILE = "all.min.json"
LATEST_FILE = "latest.json"
README_FILE = "README.md"

YEAR_FILE_RE = re.compile(r"^(\d{4})\.json$")
#: Collapses arrays that hold only integers onto a single line. Arrays of objects
#: contain '{' and so are never matched.
#: The README's one-line summary of the archive, kept in step with the data.
_README_SUMMARY_RE = re.compile(
    r"^[\d,]+ draws · [\d,]+ wheel results · \d{4}-\d\d-\d\d → \d{4}-\d\d-\d\d$",
    re.MULTILINE,
)
_INT_ARRAY_RE = re.compile(r"\[\s*((?:\d+,\s*)*\d+)\s*\]")


@dataclass
class Conflict:
    """An already-published row whose numbers changed upstream."""

    date: datetime.date
    wheel: str
    stored: list[int]
    incoming: list[int]

    def __str__(self) -> str:
        return f"{iso(self.date)} {self.wheel}: stored {self.stored} -> incoming {self.incoming}"


@dataclass
class MergeResult:
    draws: DrawSet
    added_dates: list[datetime.date] = field(default_factory=list)
    added_rows: int = 0
    conflicts: list[Conflict] = field(default_factory=list)




def _compact_int_arrays(text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        numbers = [part.strip() for part in match.group(1).split(",")]
        return "[" + ", ".join(numbers) + "]"

    return _INT_ARRAY_RE.sub(repl, text)


def render_json(obj) -> str:
    """Indented JSON with integer arrays inlined, plus a trailing newline."""
    return _compact_int_arrays(json.dumps(obj, indent=2, ensure_ascii=False)) + "\n"


def render_json_min(obj) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n"


# --------------------------------------------------------------------------- load


def load(root: Path) -> DrawSet:
    """Read every ``data/<year>.json`` back into a draw set."""
    draws: DrawSet = {}
    data_dir = root / DATA_DIR
    if not data_dir.is_dir():
        return draws
    for path in sorted(data_dir.iterdir()):
        match = YEAR_FILE_RE.match(path.name)
        if not match:
            continue
        year = int(match.group(1))
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("year") != year:
            raise LottoError(f"{path}: 'year' is {payload.get('year')!r}, expected {year}")
        for entry in payload["draws"]:
            day = datetime.date.fromisoformat(entry["date"])
            if day.year != year:
                raise LottoError(f"{path}: contains a draw dated {day}")
            if day in draws:
                raise LottoError(f"duplicate draw for {day}")
            draws[day] = {name: list(numbers) for name, numbers in entry["wheels"].items()}
    return draws


# -------------------------------------------------------------------------- merge


def merge(base: DrawSet, incoming: DrawSet) -> MergeResult:
    """Merge ``incoming`` into ``base`` without mutating either.

    Rows already present are never overwritten; any that disagree are reported as
    conflicts so the caller can refuse to publish a rewritten history.
    """
    merged: DrawSet = {day: dict(wheels) for day, wheels in base.items()}
    result = MergeResult(draws=merged)

    for day in sorted(incoming):
        per_date = merged.setdefault(day, {})
        is_new_date = day not in base
        for wheel in WHEELS:
            if wheel not in incoming[day]:
                continue
            numbers = list(incoming[day][wheel])
            stored = per_date.get(wheel)
            if stored is None:
                per_date[wheel] = numbers
                result.added_rows += 1
            elif stored != numbers:
                result.conflicts.append(Conflict(day, wheel, stored, numbers))
        if is_new_date:
            result.added_dates.append(day)

    return result


# -------------------------------------------------------------------------- write


def build_year_payload(year: int, draws: DrawSet, contests: dict[datetime.date, int]) -> dict:
    days = sorted(day for day in draws if day.year == year)
    return {
        "year": year,
        "draw_count": len(days),
        "first_date": iso(days[0]),
        "last_date": iso(days[-1]),
        "draws": [
            {
                "date": iso(day),
                "contest": contests[day],
                "wheels": order_wheels(draws[day]),
            }
            for day in days
        ],
    }


def build_index(
    draws: DrawSet,
    contests: dict[datetime.date, int],
    *,
    generated_at: str,
    sources: dict,
) -> dict:
    days = sorted(draws)
    years = sorted({day.year for day in days})
    return {
        "generated_at": generated_at,
        "first_date": iso(days[0]),
        "last_date": iso(days[-1]),
        "draw_count": len(days),
        "wheel_rows": count_rows(draws),
        "wheels": list(WHEELS),
        "sources": sources,
        "years": [
            {
                "year": year,
                "file": f"{DATA_DIR}/{year}.json",
                "draw_count": sum(1 for day in days if day.year == year),
                "first_date": iso(min(d for d in days if d.year == year)),
                "last_date": iso(max(d for d in days if d.year == year)),
            }
            for year in years
        ],
    }


def write(
    root: Path,
    draws: DrawSet,
    *,
    generated_at: str,
    sources: dict,
) -> list[Path]:
    """Write the archive, touching only files whose content actually changes."""
    if not draws:
        raise LottoError("refusing to write an empty archive")

    contests = contest_numbers(list(draws))
    days = sorted(draws)
    data_dir = root / DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)
    changed: list[Path] = []

    for year in sorted({day.year for day in days}):
        payload = build_year_payload(year, draws, contests)
        changed += _write_if_changed(data_dir / f"{year}.json", render_json(payload))

    everything = [
        {
            "date": iso(day),
            "contest": contests[day],
            "wheels": order_wheels(draws[day]),
        }
        for day in days
    ]
    combined = {
        "first_date": iso(days[0]),
        "last_date": iso(days[-1]),
        "draw_count": len(days),
        "draws": everything,
    }
    changed += _write_if_changed(data_dir / ALL_FILE, render_json(combined))
    changed += _write_if_changed(data_dir / ALL_MIN_FILE, render_json_min(combined))
    changed += _write_if_changed(data_dir / LATEST_FILE, render_json(everything[-1]))

    # index.json carries a timestamp and the upstream ETag, so writing it
    # unconditionally would produce a commit every single day even when no draw
    # happened. Only refresh it when the data itself moved (or it is missing).
    index_path = root / INDEX_FILE
    if changed or not index_path.exists():
        index = build_index(draws, contests, generated_at=generated_at, sources=sources)
        changed += _write_if_changed(index_path, render_json(index))

    # The README quotes the archive's size and span. It holds no timestamp, so it can be
    # checked on every write and still changes only when the figures do.
    readme = root / README_FILE
    if readme.exists():
        summary = (
            f"{len(days):,} draws · {count_rows(draws):,} wheel results · "
            f"{iso(days[0])} → {iso(days[-1])}"
        )
        text = readme.read_text(encoding="utf-8")
        changed += _write_if_changed(readme, _README_SUMMARY_RE.sub(summary, text, count=1))
    return changed


def _write_if_changed(path: Path, text: str) -> list[Path]:
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return []
    path.write_text(text, encoding="utf-8")
    return [path]


def read_index(root: Path) -> dict:
    path = root / INDEX_FILE
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))
