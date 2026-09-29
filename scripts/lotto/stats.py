"""Every statistic the site publishes, derived from the committed JSON archive.

Each function takes one wheel's series (see :mod:`lotto.series`) and returns a
structure ready to serialise. None of these statistics predicts anything: they
describe what came out. Wherever a reference value exists -- the frequency expected
under equiprobability, the chi-square, the standard-score of a follower count -- it is
published beside the observed value, because that comparison is the only thing that
separates a real departure from the noise any random series produces anyway.

Keys are English, and no function here emits a string meant for a reader: the web
layer owns every label. The exception is the ids of the three classical groupings --
``cadenze``, ``figure``, ``decine`` -- which are lotto terms of art naming the concept
itself, and would lose their meaning translated.

:func:`build` assembles the whole site payload: one metadata block plus one file per
wheel.
"""

from __future__ import annotations

import datetime
import statistics
from collections import Counter
from math import comb
from typing import Sequence

from .model import WHEELS, DrawSet, iso
from .series import (
    ALL_PAIRS,
    ALL_WHEELS,
    FIVE_NUMBER_ONLY,
    GROUPINGS,
    LOW_HIGH_SPLIT,
    NUMBERS,
    NUMBERS_PER_DRAW,
    SERIES_KEYS,
    WINDOWS,
    Entry,
    chi_square,
    chi_square_sf,
    decina_range,
    drawn_count,
    gaps,
    pair_keys,
    series_for,
    window,
)

#: How many combinations to list in each pair ranking.
TOP_PAIRS = 60
#: How many followers to list for each number.
TOP_FOLLOWERS = 6
#: Width of the bins in the sum histogram.
SUM_BIN = 10


def _iso_or_none(day: datetime.date | None) -> str | None:
    return iso(day) if day else None


# -------------------------------------------------------------------- positions


def positions(series: Sequence[Entry]) -> dict:
    """How often each number came out in each of the five extraction positions.

    The order is the one the upstream source publishes. The five positions are
    equiprobable, so there is nothing to find here: the table exists to show that,
    and it is the only place where extraction order is used at all.
    """
    out: dict[str, list[list[int]]] = {}
    for window_id, size in WINDOWS:
        counts = [[0] * NUMBERS_PER_DRAW for _ in NUMBERS]
        for entry in window(series, size):
            for position, number in enumerate(entry.numbers[:NUMBERS_PER_DRAW]):
                counts[number - 1][position] += 1
        out[window_id] = counts
    return out


# ------------------------------------------------------------------------ pairs


def pairs(series: Sequence[Entry]) -> dict:
    """Pair (*ambo*) rankings: the most frequent per window, and the most delayed.

    An ambo is any two of the five numbers on one wheel, so every draw produces ten
    of them. One of the 4005 possible pairs is expected roughly every 400 draws, so
    over a long history nearly all of the spread between the most and least frequent
    is noise -- which is why the expected frequency travels with the ranking.

    Delays are always measured over the whole history, as in the tabellone, so the
    delay column does not change with the window.
    """
    history = gaps(series, pair_keys, ALL_PAIRS)
    possible = len(ALL_PAIRS)
    pairs_per_draw = NUMBERS_PER_DRAW * (NUMBERS_PER_DRAW - 1) // 2

    def row(pair: tuple[int, int], frequency: int) -> dict:
        gap = history[pair]
        return {
            "a": pair[0],
            "b": pair[1],
            "frequency": frequency,
            "delay": gap.delay,
            "max_delay": gap.max_delay,
            "last_seen": _iso_or_none(gap.last_seen),
        }

    most_frequent: dict[str, list[dict]] = {}
    expected: dict[str, float] = {}
    for window_id, size in WINDOWS:
        sliced = window(series, size)
        counts: Counter[tuple[int, int]] = Counter()
        for entry in sliced:
            counts.update(pair_keys(entry))
        ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        most_frequent[window_id] = [row(pair, count) for pair, count in ranked[:TOP_PAIRS]]
        expected[window_id] = round(len(sliced) * pairs_per_draw / possible, 2)

    most_delayed = sorted(ALL_PAIRS, key=lambda pair: (-history[pair].delay, pair))

    return {
        "possible_pairs": possible,
        "expected": expected,
        "most_frequent": most_frequent,
        "most_delayed": [
            row(pair, history[pair].frequency) for pair in most_delayed[:TOP_PAIRS]
        ],
    }


# ----------------------------------------------------------------------- groups


def groups(series: Sequence[Entry]) -> dict:
    """The three classical groupings: cadenza, figura, decina.

    ``frequency`` counts the drawn numbers falling in the group; ``delay`` counts the
    draws since the group failed to appear *at all*. With five numbers per draw a
    group turns up almost every time, so delays here are small by construction: a
    delay of eight on a cadenza is a rare event, not the modest wait the same figure
    would be for a single number.
    """
    out: dict[str, dict] = {}
    for grouping_id, (mapper, keys) in GROUPINGS.items():
        size_of = {key: sum(1 for n in NUMBERS if mapper(n) == key) for key in keys}
        history = gaps(series, lambda entry: {mapper(n) for n in entry.numbers}, keys)

        frequency: dict[str, dict[int, int]] = {}
        expected: dict[str, dict[int, float]] = {}
        for window_id, window_size in WINDOWS:
            sliced = window(series, window_size)
            counts = {key: 0 for key in keys}
            for entry in sliced:
                for number in entry.numbers:
                    counts[mapper(number)] += 1
            frequency[window_id] = counts
            drawn = drawn_count(sliced)
            expected[window_id] = {
                key: round(drawn * size_of[key] / len(NUMBERS), 2) for key in keys
            }

        out[grouping_id] = {
            "groups": [
                {
                    "id": key,
                    "span": decina_range(key) if grouping_id == "decine" else str(key),
                    "group_size": size_of[key],
                    "delay": history[key].delay,
                    "max_delay": history[key].max_delay,
                    "last_seen": _iso_or_none(history[key].last_seen),
                    "frequency": {w: frequency[w][key] for w, _ in WINDOWS},
                    "expected": {w: expected[w][key] for w, _ in WINDOWS},
                }
                for key in keys
            ]
        }
    return out


# ---------------------------------------------------------------- distributions


def distributions(series: Sequence[Entry]) -> dict:
    """What a draw is made of: odd/even, high/low, and the sum of the five numbers.

    The odd/even and high/low histograms are published next to their exact expectation.
    Both sit very close to it, which is exactly the comparison that would make a real
    departure legible if there ever were one.
    """
    out: dict[str, dict] = {}
    for window_id, size in WINDOWS:
        sliced = window(series, size)
        odd = [0] * (NUMBERS_PER_DRAW + 1)
        high = [0] * (NUMBERS_PER_DRAW + 1)
        sums: list[int] = []
        for entry in sliced:
            numbers = entry.numbers
            odd[sum(1 for n in numbers if n % 2)] += 1
            high[sum(1 for n in numbers if n > LOW_HIGH_SPLIT)] += 1
            sums.append(sum(numbers))

        # 45 of the 90 numbers are odd, and 45 are above the high/low split, so both
        # histograms share the same expectation.
        expected = _group_expectation(len(sliced), LOW_HIGH_SPLIT)

        out[window_id] = {
            "draws": len(sliced),
            "odd": {"observed": odd, "expected": expected},
            "high": {"observed": high, "expected": expected},
            "sum": _sum_stats(sums),
        }
    return out


def _group_expectation(draws: int, group_size: int) -> list[float]:
    """Expected count of draws by how many of the five numbers fall in a group.

    The five numbers come out of the urn without replacement, so the exact law is
    hypergeometric. The distinction is not academic: treating the draws as independent
    (binomial) overstates the 0-odd and 5-odd tails by about 12% and understates the
    middle, which on the chart would look like a real departure from chance where there
    is none.
    """
    n = NUMBERS_PER_DRAW
    total = comb(len(NUMBERS), n)
    return [
        round(draws * comb(group_size, k) * comb(len(NUMBERS) - group_size, n - k) / total, 1)
        for k in range(n + 1)
    ]


def _sum_stats(sums: list[int]) -> dict:
    if not sums:
        return {"min": None, "max": None, "mean": None, "median": None, "bins": []}
    lo = min(sums) // SUM_BIN * SUM_BIN
    hi = max(sums) // SUM_BIN * SUM_BIN
    counts: Counter[int] = Counter(value // SUM_BIN * SUM_BIN for value in sums)
    return {
        "min": min(sums),
        "max": max(sums),
        "mean": round(statistics.fmean(sums), 1),
        "median": round(statistics.median(sums), 1),
        "bins": [
            {"from": start, "to": start + SUM_BIN - 1, "count": counts.get(start, 0)}
            for start in range(lo, hi + SUM_BIN, SUM_BIN)
        ],
    }


# -------------------------------------------------------------------- followers


def followers(series: Sequence[Entry]) -> list[dict]:
    """*Numeri spia*: what comes out in the draw **after** the one containing N.

    For each number, the numbers that most often follow it, always beside the expected
    count and the departure in standard deviations. The standard score is the figure to
    read: with a few hundred occurrences per number the expected count is around twenty
    and its standard deviation around four and a half, so nothing below three sigma is
    worth a second look -- and across the 8100 ordered pairs of one wheel a handful of
    three-sigma departures will show up by chance regardless.
    """
    total = len(series)
    if total < 2:
        return []

    frequency = Counter(n for entry in series for n in entry.numbers)
    # Probability that a number shows up in any one draw of this wheel.
    probability = {n: frequency[n] / total for n in NUMBERS}

    occurrences: Counter[int] = Counter()
    followed: dict[int, Counter[int]] = {n: Counter() for n in NUMBERS}
    for current, following in zip(series, series[1:]):
        for number in current.numbers:
            occurrences[number] += 1
            followed[number].update(following.numbers)

    out: list[dict] = []
    for number in NUMBERS:
        trials = occurrences[number]
        rows: list[dict] = []
        for follower, count in followed[number].most_common(TOP_FOLLOWERS):
            p = probability[follower]
            expected = trials * p
            sd = (trials * p * (1 - p)) ** 0.5
            rows.append(
                {
                    "number": follower,
                    "count": count,
                    "expected": round(expected, 1),
                    "lift": round(count / expected, 2) if expected else None,
                    "z": round((count - expected) / sd, 2) if sd else None,
                }
            )
        out.append({"number": number, "occurrences": trials, "followed_by": rows})
    return out


# ------------------------------------------------------------------- uniformity


def uniformity(series: Sequence[Entry]) -> dict:
    """Chi-square test of equiprobability across the 90 numbers, per window.

    This is the most important statistic on the page, and the one nobody comes looking
    for: it measures whether the observed frequencies depart from the expected ones by
    more than chance accounts for. Over the whole archive they do not, and that is
    precisely why none of the other tables can be used to predict.
    """
    out: dict[str, dict] = {}
    for window_id, size in WINDOWS:
        sliced = window(series, size)
        counts = Counter(n for entry in sliced for n in entry.numbers)
        observed = [counts.get(n, 0) for n in NUMBERS]
        drawn = sum(observed)
        expected = drawn / len(NUMBERS)
        chi2 = chi_square(observed, expected)
        df = len(NUMBERS) - 1
        out[window_id] = {
            "drawn": drawn,
            "expected": round(expected, 2),
            "chi_square": round(chi2, 2),
            "df": df,
            "p": round(chi_square_sf(chi2, df), 4),
        }
    return out


# --------------------------------------------------------------------- coverage


def coverage(draws: DrawSet) -> dict:
    """What the archive holds: draws per year, per weekday, and per wheel."""
    days = sorted(draws)
    by_year: Counter[int] = Counter(day.year for day in days)
    by_weekday: Counter[int] = Counter(day.weekday() for day in days)

    by_wheel = []
    for wheel in WHEELS:
        wheel_days = [day for day in days if wheel in draws[day]]
        if not wheel_days:
            continue
        by_wheel.append(
            {
                "wheel": wheel,
                "draws": len(wheel_days),
                "first": iso(wheel_days[0]),
                "last": iso(wheel_days[-1]),
            }
        )

    return {
        "by_year": [{"year": year, "draws": by_year[year]} for year in sorted(by_year)],
        # Monday is 0, matching datetime.date.weekday(); the web layer names the days.
        "by_weekday": [
            {"weekday": index, "draws": by_weekday.get(index, 0)} for index in range(7)
        ],
        "by_wheel": by_wheel,
    }


# ------------------------------------------------------------------------ build


def build_wheel(series: Sequence[Entry], wheel: str) -> dict:
    """Every statistic for one wheel."""
    from . import tabellone

    five_numbers = wheel != ALL_WHEELS
    payload: dict = {
        "wheel": wheel,
        "five_numbers": five_numbers,
        "tabellone": tabellone.compute(list(series)),
        "groups": groups(series),
        "uniformity": uniformity(series),
    }
    if five_numbers:
        payload["positions"] = positions(series)
        payload["pairs"] = pairs(series)
        payload["distributions"] = distributions(series)
        payload["followers"] = followers(series)
    else:
        payload["unavailable"] = sorted(FIVE_NUMBER_ONLY)
    return payload


def build(draws: DrawSet, *, generated_at: str) -> tuple[dict, dict[str, dict]]:
    """The complete site payload: ``(meta, {wheel: statistics})``."""
    if not draws:
        raise ValueError("empty archive")

    per_wheel: dict[str, dict] = {}
    for wheel in SERIES_KEYS:
        series = series_for(draws, wheel)
        if series:
            per_wheel[wheel] = build_wheel(series, wheel)

    days = sorted(draws)
    meta = {
        "generated_at": generated_at,
        "first_draw": iso(days[0]),
        "last_draw": iso(days[-1]),
        "total_draws": len(days),
        "windows": [{"id": window_id, "draws": size} for window_id, size in WINDOWS],
        "wheels": [
            {
                "id": wheel,
                "file": f"wheels/{wheel}.json",
                "draws": payload["tabellone"]["draws"],
                "first": payload["tabellone"]["first_draw"],
                "last": payload["tabellone"]["last_draw"],
                "five_numbers": payload["five_numbers"],
            }
            for wheel, payload in per_wheel.items()
        ],
        "uniformity": {
            wheel: payload["uniformity"]["all"] for wheel, payload in per_wheel.items()
        },
        "latest": {
            "date": iso(days[-1]),
            "wheels": {wheel: list(numbers) for wheel, numbers in draws[days[-1]].items()},
        },
        "coverage": coverage(draws),
    }
    return meta, per_wheel
