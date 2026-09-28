"""Parser for the primary source: tab-separated ``storico.txt``.

Format, one line per (date, wheel)::

    1939/01/07<TAB>BA<TAB>58<TAB>22<TAB>47<TAB>49<TAB>69

Numbers are not zero-padded. The file is ASCII and sorted by date.
"""

from __future__ import annotations

import datetime

from .model import (
    MAX_NUMBER,
    MIN_NUMBER,
    NUMBERS_PER_WHEEL,
    DrawSet,
    LottoError,
    wheel_from_code,
)

FIELDS_PER_LINE = 2 + NUMBERS_PER_WHEEL


def parse(text: str) -> DrawSet:
    """Parse the primary archive into a draw set."""
    draws: DrawSet = {}
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        fields = line.split("\t")
        if len(fields) != FIELDS_PER_LINE:
            raise LottoError(
                f"line {lineno}: expected {FIELDS_PER_LINE} tab-separated fields, "
                f"got {len(fields)}: {raw!r}"
            )
        day = _parse_date(fields[0], lineno)
        wheel = wheel_from_code(fields[1])
        numbers = [_parse_number(value, lineno) for value in fields[2:]]
        per_date = draws.setdefault(day, {})
        if wheel in per_date:
            raise LottoError(f"line {lineno}: duplicate wheel {wheel} for {day}")
        per_date[wheel] = numbers
    if not draws:
        raise LottoError("primary archive contained no draws")
    return draws


def _parse_date(value: str, lineno: int) -> datetime.date:
    try:
        return datetime.datetime.strptime(value, "%Y/%m/%d").date()
    except ValueError:
        raise LottoError(f"line {lineno}: bad date {value!r}") from None


def _parse_number(value: str, lineno: int) -> int:
    try:
        number = int(value)
    except ValueError:
        raise LottoError(f"line {lineno}: non-numeric draw value {value!r}") from None
    if not MIN_NUMBER <= number <= MAX_NUMBER:
        raise LottoError(f"line {lineno}: number {number} out of range")
    return number
