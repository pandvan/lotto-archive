"""Parser for the fallback source: dBase III ``estratti.dbf``.

One record per draw date, with all eleven wheels as fixed-width character columns
(``BA1``..``BA5``, ``CA1``.., ..., ``NZ1``..``NZ5``) plus ``ESTRAZ`` (date) and
``CONCORSO`` (the official contest number). A wheel that did not draw on a given
date has all five of its columns blank.
"""

from __future__ import annotations

import datetime
import tempfile
from pathlib import Path

from dbfread import DBF

from .model import (
    MAX_NUMBER,
    MIN_NUMBER,
    NUMBERS_PER_WHEEL,
    DrawSet,
    LottoError,
    wheel_from_code,
)

DATE_FIELD = "ESTRAZ"
CONTEST_FIELD = "CONCORSO"

#: Wheel codes as they appear in the DBF column names, in file order.
DBF_WHEEL_CODES = ("BA", "CA", "FI", "GE", "MI", "NA", "PA", "RM", "TO", "VE", "NZ")

EXPECTED_FIELDS = (DATE_FIELD, CONTEST_FIELD) + tuple(
    f"{code}{index}" for code in DBF_WHEEL_CODES for index in range(1, NUMBERS_PER_WHEEL + 1)
)


def parse(data: bytes) -> tuple[DrawSet, dict[datetime.date, int]]:
    """Parse the fallback archive, returning ``(draws, contest_by_date)``."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "estratti.dbf"
        path.write_bytes(data)
        table = DBF(
            str(path),
            encoding="latin-1",
            char_decode_errors="replace",
            ignore_missing_memofile=True,
        )
        _check_schema(table)
        return _read(table)


def _check_schema(table: DBF) -> None:
    """Fail loudly if upstream changes the DBF layout, rather than reading garbage."""
    names = tuple(field.name.upper() for field in table.fields)
    if names != EXPECTED_FIELDS:
        missing = set(EXPECTED_FIELDS) - set(names)
        extra = set(names) - set(EXPECTED_FIELDS)
        raise LottoError(
            f"unexpected DBF schema: {len(names)} fields "
            f"(missing={sorted(missing)}, unexpected={sorted(extra)})"
        )


def _read(table: DBF) -> tuple[DrawSet, dict[datetime.date, int]]:
    draws: DrawSet = {}
    contests: dict[datetime.date, int] = {}
    for record in table:
        day = record[DATE_FIELD]
        if day is None:
            raise LottoError("DBF record with an empty draw date")
        if not isinstance(day, datetime.date):
            raise LottoError(f"DBF draw date is not a date: {day!r}")
        if day in draws:
            raise LottoError(f"duplicate DBF record for {day}")
        contests[day] = _parse_contest(record[CONTEST_FIELD], day)
        per_date: dict[str, list[int]] = {}
        for code in DBF_WHEEL_CODES:
            numbers = _parse_wheel(record, code, day)
            if numbers is not None:
                per_date[wheel_from_code(code)] = numbers
        if not per_date:
            raise LottoError(f"DBF record for {day} has no wheels")
        draws[day] = per_date
    if not draws:
        raise LottoError("fallback archive contained no draws")
    return draws, contests


def _parse_wheel(record, code: str, day: datetime.date) -> list[int] | None:
    """Five numbers for one wheel, or ``None`` when the wheel did not draw."""
    raw = [str(record[f"{code}{i}"] or "").strip() for i in range(1, NUMBERS_PER_WHEEL + 1)]
    if not any(raw):
        return None
    if not all(raw):
        raise LottoError(f"{day} wheel {code}: partially filled row {raw!r}")
    numbers = []
    for value in raw:
        try:
            number = int(value)
        except ValueError:
            raise LottoError(f"{day} wheel {code}: non-numeric value {value!r}") from None
        if not MIN_NUMBER <= number <= MAX_NUMBER:
            raise LottoError(f"{day} wheel {code}: number {number} out of range")
        numbers.append(number)
    return numbers


def _parse_contest(value, day: datetime.date) -> int:
    text = str(value or "").strip()
    if not text.isdigit():
        raise LottoError(f"{day}: bad contest number {value!r}")
    return int(text)
