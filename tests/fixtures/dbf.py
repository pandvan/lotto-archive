"""Build a minimal dBase III file with the layout the fallback source uses.

Writing one by hand keeps the tests independent of a 900 KB binary fixture and, more
usefully, lets them exercise the quirks that matter: single-digit numbers are stored
left-aligned ("7 "), and a wheel that did not draw has all five columns blank.
"""

from __future__ import annotations

import datetime
import struct

from lotto.parse_dbf import DBF_WHEEL_CODES

FIELDS: list[tuple[str, str, int]] = [("ESTRAZ", "D", 8), ("CONCORSO", "C", 3)]
FIELDS += [(f"{code}{i}", "C", 2) for code in DBF_WHEEL_CODES for i in range(1, 6)]


def _cell(value: int | None) -> bytes:
    """Two characters, left-aligned, exactly as the real file stores them."""
    if value is None:
        return b"  "
    return f"{value}".ljust(2).encode("ascii")


def build(rows: list[tuple[datetime.date, int, dict[str, list[int]]]], *, fields=None) -> bytes:
    """``rows`` is a list of ``(date, contest, {wheel_code: [n1..n5]})``."""
    fields = fields or FIELDS
    record_len = 1 + sum(length for _, _, length in fields)
    header_len = 32 + 32 * len(fields) + 1

    today = datetime.date.today()
    out = bytearray()
    out += struct.pack(
        "<BBBBIHH20x",
        0x03,
        today.year - 1900,
        today.month,
        today.day,
        len(rows),
        header_len,
        record_len,
    )
    for name, ftype, length in fields:
        out += name.encode("ascii").ljust(11, b"\0")
        out += ftype.encode("ascii")
        out += b"\0" * 4
        out += bytes([length, 0])
        out += b"\0" * 14
    out += b"\x0d"

    for day, contest, wheels in rows:
        out += b" "                                        # not deleted
        out += day.strftime("%Y%m%d").encode("ascii")      # ESTRAZ
        out += str(contest).encode("ascii").ljust(3)       # CONCORSO
        for code in DBF_WHEEL_CODES:
            numbers = wheels.get(code)
            for i in range(5):
                out += _cell(None if numbers is None else numbers[i])
    out += b"\x1a"
    return bytes(out)
