"""Canonical data model for the Lotto archive.

A draw set is represented as ``dict[datetime.date, dict[str, list[int]]]``:
date -> wheel name -> the five extracted numbers, in extraction order.
"""

from __future__ import annotations

import datetime

#: Canonical wheel names, in the order they are emitted in JSON.
WHEELS: tuple[str, ...] = (
    "bari",
    "cagliari",
    "firenze",
    "genova",
    "milano",
    "napoli",
    "palermo",
    "roma",
    "torino",
    "venezia",
    "nazionale",
)

WHEEL_SET = frozenset(WHEELS)

#: Upstream two-letter codes -> canonical wheel name.
#: The primary source calls Nazionale ``RN``; the fallback DBF calls it ``NZ``.
WHEEL_BY_CODE: dict[str, str] = {
    "BA": "bari",
    "CA": "cagliari",
    "FI": "firenze",
    "GE": "genova",
    "MI": "milano",
    "NA": "napoli",
    "PA": "palermo",
    "RM": "roma",
    "TO": "torino",
    "VE": "venezia",
    "RN": "nazionale",
    "NZ": "nazionale",
}

#: First draw in the archive.
FIRST_DATE = datetime.date(1939, 1, 7)
#: Cagliari and Genova join the draw.
CA_GE_FIRST_DATE = datetime.date(1939, 7, 8)
#: The Nazionale wheel is introduced; every date from here on has all 11 wheels.
NAZIONALE_FIRST_DATE = datetime.date(2005, 5, 4)

MIN_NUMBER = 1
MAX_NUMBER = 90
NUMBERS_PER_WHEEL = 5

DrawSet = dict[datetime.date, dict[str, list[int]]]


class LottoError(Exception):
    """Raised when upstream data cannot be trusted or understood."""


def wheel_from_code(code: str) -> str:
    """Map an upstream wheel code to its canonical name, loudly rejecting unknowns."""
    try:
        return WHEEL_BY_CODE[code.strip().upper()]
    except KeyError:
        raise LottoError(f"unknown wheel code {code!r}") from None


def order_wheels(wheels: dict[str, list[int]]) -> dict[str, list[int]]:
    """Return ``wheels`` re-keyed in canonical order."""
    return {name: wheels[name] for name in WHEELS if name in wheels}


def contest_numbers(dates: list[datetime.date]) -> dict[datetime.date, int]:
    """Derive the official *concorso* number for each date.

    The concorso is the 1-based index of the draw within its calendar year,
    resetting every January. Verified against the upstream DBF for all 88 years.
    """
    per_year: dict[int, int] = {}
    out: dict[datetime.date, int] = {}
    for day in sorted(dates):
        per_year[day.year] = per_year.get(day.year, 0) + 1
        out[day] = per_year[day.year]
    return out


def expected_wheels(day: datetime.date) -> frozenset[str]:
    """Wheels that are expected to have drawn on ``day``."""
    wheels = set(WHEELS)
    if day < CA_GE_FIRST_DATE:
        wheels -= {"cagliari", "genova"}
    if day < NAZIONALE_FIRST_DATE:
        wheels -= {"nazionale"}
    return frozenset(wheels)


def iso(day: datetime.date) -> str:
    return day.isoformat()


def count_rows(draws: DrawSet) -> int:
    """Total number of (date, wheel) rows in a draw set."""
    return sum(len(w) for w in draws.values())
