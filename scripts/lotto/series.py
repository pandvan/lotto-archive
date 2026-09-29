"""Primitives shared by every statistic: per-wheel series, gaps, derived groups.

Every statistic in this package is computed over a *wheel series*: the draws of one
wheel, in chronological order. That is deliberately not the same as the dates in the
archive -- the wheels have different histories (Cagliari and Genova start on
1939-07-08, Nazionale on 2005-05-04) and several wartime dates carry only some
wheels. A date on which a wheel did not play must not count towards that wheel's
delay, so the series, and not the archive, is the unit of counting.

The pseudo-wheel ``tutte`` collapses a date to the set of numbers drawn on *any*
wheel. It answers "when was 47 last seen anywhere", but it holds up to 55 numbers
per entry rather than five, so the statistics that only make sense for a real
five-number draw (positions, ambi, somma, pari/dispari) are not computed for it --
see :data:`FIVE_NUMBER_ONLY`.
"""

from __future__ import annotations

import datetime
import math
from dataclasses import dataclass
from itertools import combinations
from typing import Callable, Hashable, Iterable, Sequence

from .model import MAX_NUMBER, MIN_NUMBER, NUMBERS_PER_WHEEL, WHEELS, DrawSet

#: Key of the pseudo-wheel that unions every wheel of a date.
ALL_WHEELS = "tutte"

#: Every wheel a statistic can be asked for, in display order.
SERIES_KEYS: tuple[str, ...] = (ALL_WHEELS, *WHEELS)

#: Statistics that require an entry to be exactly one five-number draw.
FIVE_NUMBER_ONLY = frozenset({"positions", "pairs", "distributions", "followers"})

NUMBERS: tuple[int, ...] = tuple(range(MIN_NUMBER, MAX_NUMBER + 1))

#: Numbers drawn on one wheel. Re-exported from the model for convenience.
NUMBERS_PER_DRAW = NUMBERS_PER_WHEEL

#: Analysis windows: the last N draws of the wheel, ``None`` meaning the whole archive.
#: The ids are what the JSON and the web page use as keys.
WINDOWS: tuple[tuple[str, int | None], ...] = (
    ("all", None),
    ("500", 500),
    ("100", 100),
)

#: Numbers 1-45 are *bassi*, 46-90 *alti*.
LOW_HIGH_SPLIT = 45


@dataclass(frozen=True)
class Entry:
    """One draw of one series."""

    date: datetime.date
    #: Extraction order is preserved for a real wheel; ``tutte`` is sorted.
    numbers: tuple[int, ...]


@dataclass(frozen=True)
class Gap:
    """How a key behaves over a series: how often, how long ago, how long ever."""

    frequency: int
    delay: int
    max_delay: int
    last_seen: datetime.date | None


def series_for(draws: DrawSet, wheel: str) -> list[Entry]:
    """The draws of ``wheel`` in chronological order.

    Dates on which the wheel did not play are absent, so consecutive entries are
    consecutive *draws of that wheel*.
    """
    if wheel == ALL_WHEELS:
        return [
            Entry(day, tuple(sorted({n for row in draws[day].values() for n in row})))
            for day in sorted(draws)
        ]
    return [
        Entry(day, tuple(draws[day][wheel])) for day in sorted(draws) if wheel in draws[day]
    ]


def window(series: Sequence[Entry], size: int | None) -> Sequence[Entry]:
    """The last ``size`` entries, or all of them when ``size`` is ``None``."""
    if size is None or size >= len(series):
        return series
    return series[-size:]


def gaps(
    series: Sequence[Entry],
    keys_of: Callable[[Entry], Iterable[Hashable]],
    universe: Iterable[Hashable],
) -> dict[Hashable, Gap]:
    """Frequency and absence statistics for every key in ``universe``.

    ``delay`` is the number of draws since the key last came out -- 0 when it came out
    in the most recent draw, and the length of the whole series when it has never come
    out. The absence still running counts towards ``max_delay``: a number setting its
    own record right now should be shown as doing so.
    """
    total = len(series)
    last_index: dict[Hashable, int] = {}
    frequency: dict[Hashable, int] = {}
    max_gap: dict[Hashable, int] = {}
    last_date: dict[Hashable, datetime.date] = {}

    for index, entry in enumerate(series):
        for key in keys_of(entry):
            previous = last_index.get(key, -1)
            # The absence this appearance closes. For a first appearance that is the
            # number of draws it sat out at the start of the series.
            gap = index - previous - 1
            if gap > max_gap.get(key, 0):
                max_gap[key] = gap
            last_index[key] = index
            frequency[key] = frequency.get(key, 0) + 1
            last_date[key] = entry.date

    out: dict[Hashable, Gap] = {}
    for key in universe:
        if key in last_index:
            delay = total - 1 - last_index[key]
        else:
            delay = total
        out[key] = Gap(
            frequency=frequency.get(key, 0),
            delay=delay,
            max_delay=max(max_gap.get(key, 0), delay),
            last_seen=last_date.get(key),
        )
    return out


def drawn_count(series: Sequence[Entry]) -> int:
    """Total numbers drawn across the series -- the denominator of every frequency."""
    return sum(len(entry.numbers) for entry in series)


# ------------------------------------------------------------------ derived groups
#
# The three classical groupings. Each maps a number to exactly one group, so the
# five numbers of a draw hit between one and five groups.


def cadenza(number: int) -> int:
    """Last digit, 0-9. 90 has cadenza 0, like 10, 20, ..."""
    return number % 10


def figura(number: int) -> int:
    """Digit sum reduced to 1-9. 18 and 90 are both figura 9."""
    return (number - 1) % 9 + 1


def decina(number: int) -> int:
    """0-based group of ten: 1-10 is 0, 11-20 is 1, ..., 81-90 is 8."""
    return (number - 1) // 10


#: Grouping id -> (mapper, group keys). The ids keep their Italian names because
#: cadenza, figura and decina are lotto terms of art with no English equivalent;
#: every string the reader sees is supplied by the web layer, not from here.
GROUPINGS: dict[str, tuple[Callable[[int], int], tuple[int, ...]]] = {
    "cadenze": (cadenza, tuple(range(10))),
    "figure": (figura, tuple(range(1, 10))),
    "decine": (decina, tuple(range(9))),
}


def decina_range(group: int) -> str:
    """The span a decina covers, as data rather than a translatable label."""
    return f"{group * 10 + 1}-{group * 10 + 10}"


# ----------------------------------------------------------------------- key sets


def number_keys(entry: Entry) -> tuple[int, ...]:
    return entry.numbers


def pair_keys(entry: Entry) -> Iterable[tuple[int, int]]:
    """The ten ambi of a five-number draw, each as an ordered pair."""
    return combinations(sorted(entry.numbers), 2)


ALL_PAIRS: tuple[tuple[int, int], ...] = tuple(combinations(NUMBERS, 2))


# --------------------------------------------------------------------- statistics


def chi_square(observed: Sequence[int], expected: float) -> float:
    """Pearson's chi-square against a flat expectation."""
    if expected <= 0:
        return 0.0
    return sum((count - expected) ** 2 / expected for count in observed)


def chi_square_sf(chi2: float, df: int) -> float:
    """Upper tail of the chi-square distribution.

    Wilson-Hilferty cube-root transformation to the normal. The error is well under
    a thousandth for the degrees of freedom used here (89 for the 90 numbers), and it
    keeps the package free of a SciPy dependency.
    """
    if df <= 0 or chi2 <= 0:
        return 1.0
    t = (chi2 / df) ** (1 / 3)
    mean = 1 - 2 / (9 * df)
    sd = math.sqrt(2 / (9 * df))
    z = (t - mean) / sd
    return 0.5 * math.erfc(z / math.sqrt(2))
