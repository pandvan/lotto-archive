"""The *tabellone analitico*: per wheel, one row for each of the 90 numbers.

The name is the Italian one for this table, which is how players know it. Each row
carries:

``delay``
    draws *of that wheel* since the number last came out.
``max_delay``
    the longest absence ever recorded, the one still running included.
``last_seen``
    date of the number's last appearance, or ``null``.
``frequency``
    how many times it was drawn, one count per analysis window.

``delay``, ``max_delay`` and ``last_seen`` are always measured over the wheel's whole
history: a current delay is an absolute fact, and measuring it inside a window of a
hundred draws would simply truncate it at a hundred. Only ``frequency`` is windowed,
and it ships next to the frequency *expected* under equiprobability -- an observed
frequency without its reference value says nothing at all.

Counting runs over the draws of the single wheel, not over the dates in the archive;
see :mod:`lotto.series`.
"""

from __future__ import annotations

from .model import DrawSet, iso
from .series import (
    NUMBERS,
    WINDOWS,
    Entry,
    drawn_count,
    gaps,
    number_keys,
    window,
)


def compute(series: list[Entry]) -> dict:
    """The tabellone for a single wheel."""
    if not series:
        raise ValueError("empty series")

    history = gaps(series, number_keys, NUMBERS)

    frequency: dict[str, dict[int, int]] = {}
    expected: dict[str, float] = {}
    draws_in_window: dict[str, int] = {}
    for window_id, size in WINDOWS:
        sliced = window(series, size)
        counts = {number: 0 for number in NUMBERS}
        for entry in sliced:
            for number in entry.numbers:
                counts[number] += 1
        frequency[window_id] = counts
        draws_in_window[window_id] = len(sliced)
        expected[window_id] = round(drawn_count(sliced) / len(NUMBERS), 2)

    return {
        "draws": len(series),
        "first_draw": iso(series[0].date),
        "last_draw": iso(series[-1].date),
        "window_draws": draws_in_window,
        "expected": expected,
        "numbers": [
            {
                "number": number,
                "delay": history[number].delay,
                "max_delay": history[number].max_delay,
                "last_seen": (
                    iso(history[number].last_seen) if history[number].last_seen else None
                ),
                "frequency": {
                    window_id: frequency[window_id][number] for window_id, _ in WINDOWS
                },
            }
            for number in NUMBERS
        ],
    }


def compute_all(draws: DrawSet) -> dict:
    """The tabellone for every wheel, for consumers who want only this table."""
    from .series import SERIES_KEYS, series_for

    if not draws:
        raise ValueError("empty archive")
    wheels = {}
    for wheel in SERIES_KEYS:
        series = series_for(draws, wheel)
        if series:
            wheels[wheel] = compute(series)
    return {
        "last_draw": iso(max(draws)),
        "total_draws": len(draws),
        "wheels": wheels,
    }
