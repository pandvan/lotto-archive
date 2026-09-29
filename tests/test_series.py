import datetime
import math

import pytest

from lotto import series
from lotto.series import Entry


def day(n):
    return datetime.date(2026, 1, n)


def entries(*rows):
    return [Entry(day(n), tuple(numbers)) for n, numbers in rows]


# ------------------------------------------------------------------- series_for


def test_series_skips_dates_the_wheel_did_not_play():
    draws = {
        day(1): {"bari": [1, 2, 3, 4, 5], "roma": [6, 7, 8, 9, 10]},
        day(2): {"roma": [11, 12, 13, 14, 15]},
        day(3): {"bari": [16, 17, 18, 19, 20]},
    }
    bari = series.series_for(draws, "bari")
    assert [entry.date for entry in bari] == [day(1), day(3)]
    # Consecutive entries are consecutive draws *of that wheel*, so 1 is one draw
    # behind, not two: the date bari sat out must not count against it.
    assert series.gaps(bari, series.number_keys, [1])[1].delay == 1


def test_series_preserves_extraction_order():
    draws = {day(1): {"bari": [5, 4, 3, 2, 1]}}
    assert series.series_for(draws, "bari")[0].numbers == (5, 4, 3, 2, 1)


def test_all_wheels_unions_the_date_and_sorts():
    draws = {day(1): {"bari": [3, 1, 2, 4, 5], "roma": [5, 6, 7, 8, 9]}}
    entry = series.series_for(draws, series.ALL_WHEELS)[0]
    assert entry.numbers == (1, 2, 3, 4, 5, 6, 7, 8, 9)


# ------------------------------------------------------------------------ gaps


def test_delay_is_zero_for_the_most_recent_draw():
    got = series.gaps(entries((1, [1, 2]), (2, [3, 4]), (3, [1, 5])), series.number_keys, [1, 3])
    assert got[1].delay == 0
    assert got[3].delay == 1


def test_a_number_never_drawn_is_delayed_by_the_whole_series():
    got = series.gaps(entries((1, [1]), (2, [2]), (3, [3])), series.number_keys, [90])
    assert got[90].delay == 3
    assert got[90].frequency == 0
    assert got[90].last_seen is None
    assert got[90].max_delay == 3


def test_the_running_absence_counts_towards_the_record():
    # 7 came out first and has been missing ever since: its current delay *is* its
    # record, and the table must say so rather than reporting the largest closed gap.
    got = series.gaps(entries((1, [7]), (2, [1]), (3, [2]), (4, [3])), series.number_keys, [7])
    assert got[7].delay == 3
    assert got[7].max_delay == 3


def test_the_initial_absence_counts_as_a_gap():
    got = series.gaps(entries((1, [1]), (2, [1]), (3, [9])), series.number_keys, [9])
    assert got[9].max_delay == 2
    assert got[9].delay == 0


def test_frequency_and_last_seen():
    got = series.gaps(entries((1, [4]), (2, [4]), (3, [5])), series.number_keys, [4])
    assert got[4].frequency == 2
    assert got[4].last_seen == day(2)


def test_pairs_of_a_draw_are_the_ten_ambi():
    pairs = list(series.pair_keys(Entry(day(1), (5, 1, 4, 2, 3))))
    assert len(pairs) == 10
    assert (1, 2) in pairs
    assert all(a < b for a, b in pairs)


# ----------------------------------------------------------------------- window


@pytest.mark.parametrize("size, expected", [(None, 3), (2, 2), (10, 3)])
def test_window_takes_the_last_n(size, expected):
    got = series.window(entries((1, [1]), (2, [2]), (3, [3])), size)
    assert len(got) == expected
    assert got[-1].date == day(3)


# ------------------------------------------------------------------- groupings


@pytest.mark.parametrize("number, expected", [(1, 1), (10, 0), (83, 3), (90, 0)])
def test_cadenza_is_the_last_digit(number, expected):
    assert series.cadenza(number) == expected


@pytest.mark.parametrize("number, expected", [(1, 1), (9, 9), (18, 9), (45, 9), (90, 9)])
def test_figura_is_the_reduced_digit_sum(number, expected):
    assert series.figura(number) == expected


@pytest.mark.parametrize("number, expected", [(1, 0), (10, 0), (11, 1), (90, 8)])
def test_decina_groups_by_ten(number, expected):
    assert series.decina(number) == expected


def test_every_grouping_partitions_the_ninety_numbers():
    for _id, (mapper, keys) in series.GROUPINGS.items():
        sizes = {key: sum(1 for n in series.NUMBERS if mapper(n) == key) for key in keys}
        assert sum(sizes.values()) == 90
        assert all(size > 0 for size in sizes.values())


def test_decina_range_spans_ten():
    assert series.decina_range(0) == "1-10"
    assert series.decina_range(8) == "81-90"


# ----------------------------------------------------------------- chi square


def chi2_sf_exact_even_df(x, df):
    """Closed form of the upper tail, valid only for even degrees of freedom."""
    half = df // 2
    return math.exp(-x / 2) * sum((x / 2) ** i / math.factorial(i) for i in range(half))


@pytest.mark.parametrize("chi2", [40.0, 70.0, 88.0, 110.0, 140.0])
def test_wilson_hilferty_matches_the_exact_tail(chi2):
    # The docstring claims the approximation is good to well under a thousandth at the
    # degrees of freedom this code uses; df=88 is even, so an exact value exists.
    assert series.chi_square_sf(chi2, 88) == pytest.approx(chi2_sf_exact_even_df(chi2, 88), abs=1e-3)


def test_chi_square_sf_is_bounded_and_decreasing():
    values = [series.chi_square_sf(x, 89) for x in (40, 89, 140, 200)]
    assert all(0.0 <= v <= 1.0 for v in values)
    assert values == sorted(values, reverse=True)


def test_chi_square_is_zero_when_every_count_matches():
    assert series.chi_square([10] * 90, 10) == 0.0
