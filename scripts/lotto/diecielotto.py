"""The 10eLotto draw tied to Lotto, derived from the Lotto draw of the same evening.

Nothing here is downloaded. The 20 numbers, the gold numbers and the extra numbers are
a pure function of what the ten city wheels (and, rarely, Nazionale) drew.
"""

from __future__ import annotations

import datetime

from .archive import ALL_FILE, ALL_MIN_FILE, LATEST_FILE, render_json, render_json_min
from .model import WHEELS, DrawSet, LottoError, contest_numbers, iso

DATA_DIR = "data/10elotto"

#: The game starts here; the first draw is the day after.
START = datetime.date(2009, 6, 10)
#: First draw that carries each optional field. Before it the key is absent.
FIELD_START = {
    "gold": datetime.date(2014, 6, 26),
    "double_gold": datetime.date(2017, 10, 3),
    "extra": datetime.date(2021, 10, 21),
}

TIED_WHEELS = tuple(wheel for wheel in WHEELS if wheel != "nazionale")
NUMBERS = 20
EXTRA = 15


def derive(day: datetime.date, wheels: dict[str, list[int]]) -> dict | None:
    """The 10eLotto fields for one Lotto draw, or ``None`` while a tied wheel is missing.

    Walk the first two numbers of every wheel, then the third of every wheel, the
    fourth, the fifth, and last Nazionale, dropping numbers already seen. The first 20
    are the draw, the next 15 the extra numbers.
    """
    if any(wheel not in wheels for wheel in TIED_WHEELS):
        return None
    rows = [wheels[wheel] for wheel in TIED_WHEELS]
    walk = [number for row in rows for number in row[:2]]
    walk += [row[column] for column in (2, 3, 4) for row in rows]
    walk += wheels.get("nazionale", [])
    distinct = list(dict.fromkeys(walk))

    fields = {
        "numbers": sorted(distinct[:NUMBERS]),
        "gold": rows[0][0],
        "double_gold": rows[0][1],
        "extra": sorted(distinct[NUMBERS : NUMBERS + EXTRA]),
    }
    record = {
        key: value
        for key, value in fields.items()
        if key not in FIELD_START or day >= FIELD_START[key]
    }
    needed = NUMBERS + EXTRA if "extra" in record else NUMBERS
    if len(distinct) < needed:
        raise LottoError(f"{iso(day)}: only {len(distinct)} distinct numbers, {needed} needed")
    return record


def build(draws: DrawSet) -> tuple[list[dict], list[str]]:
    """Every record from ``START`` on, oldest first, plus the draws that failed to derive."""
    # The contest is the Lotto one, so it is numbered over every Lotto draw of the year.
    contests = contest_numbers(list(draws))
    records: list[dict] = []
    errors: list[str] = []
    for day in sorted(day for day in draws if day >= START):
        try:
            fields = derive(day, draws[day])
        except LottoError as exc:
            errors.append(str(exc))
            continue
        if fields is not None:
            records.append({"date": iso(day), "contest": contests[day], **fields})
    return records, errors


def render(records: list[dict]) -> dict[str, str]:
    """File name -> content of everything under ``data/10elotto/``."""
    if not records:
        return {}
    files: dict[str, str] = {}
    for year in sorted({record["date"][:4] for record in records}):
        files[f"{year}.json"] = render_json(_payload(records, year))
    combined = _payload(records)
    files[ALL_FILE] = render_json(combined)
    files[ALL_MIN_FILE] = render_json_min(combined)
    files[LATEST_FILE] = render_json(records[-1])
    return files


def _payload(records: list[dict], year: str | None = None) -> dict:
    draws = [r for r in records if year is None or r["date"].startswith(year)]
    head = {} if year is None else {"year": int(year)}
    return {
        **head,
        "draw_count": len(draws),
        "first_date": draws[0]["date"],
        "last_date": draws[-1]["date"],
        "draws": draws,
    }
