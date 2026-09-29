import datetime
import json

import pytest

from lotto import stats, tabellone
from lotto.series import ALL_WHEELS, Entry, series_for


def day(n):
    return datetime.date(2026, 1, 1) + datetime.timedelta(days=n)


def entries(*rows):
    return [Entry(day(i), tuple(numbers)) for i, numbers in enumerate(rows)]


@pytest.fixture
def archive():
    """Four dates; bari plays on all of them, roma misses the third."""
    return {
        day(0): {"bari": [1, 2, 3, 4, 5], "roma": [10, 20, 30, 40, 50]},
        day(1): {"bari": [1, 6, 7, 8, 9], "roma": [10, 21, 31, 41, 51]},
        day(2): {"bari": [11, 12, 13, 14, 15]},
        day(3): {"bari": [1, 2, 16, 17, 18], "roma": [10, 22, 32, 42, 52]},
    }


# ------------------------------------------------------------------- tabellone


def test_tabellone_rows_cover_every_number(archive):
    board = tabellone.compute(series_for(archive, "bari"))
    assert [row["number"] for row in board["numbers"]] == list(range(1, 91))
    assert board["draws"] == 4
    assert board["first_draw"] == "2026-01-01"
    assert board["last_draw"] == "2026-01-04"


def test_tabellone_delay_counts_draws_of_the_wheel(archive):
    board = tabellone.compute(series_for(archive, "roma"))
    rows = {row["number"]: row for row in board["numbers"]}
    # roma drew three times; 20 came out only in the first of them.
    assert rows[20]["delay"] == 2
    assert rows[10]["delay"] == 0
    assert rows[10]["frequency"]["all"] == 3
    assert rows[20]["last_seen"] == "2026-01-01"


def test_tabellone_expected_is_the_flat_share(archive):
    board = tabellone.compute(series_for(archive, "bari"))
    # Four draws of five numbers, spread over 90 numbers.
    assert board["expected"]["all"] == pytest.approx(20 / 90, abs=0.01)


def test_tabellone_frequency_is_windowed_but_delay_is_not():
    # 40 draws so the 100-draw window is the whole series and the 500 one too; what
    # matters is that both report the same delay as the full history.
    series = entries(*([1, 2, 3, 4, 5] for _ in range(40)))
    board = tabellone.compute(series)
    row = next(r for r in board["numbers"] if r["number"] == 1)
    assert row["delay"] == 0
    assert row["frequency"]["all"] == 40


# ------------------------------------------------------------------- positions


def test_positions_follow_extraction_order():
    got = stats.positions(entries([7, 8, 9, 10, 11], [8, 7, 9, 10, 11]))
    # 7 came out first once and second once; index is number - 1.
    assert got["all"][6] == [1, 1, 0, 0, 0]
    assert got["all"][7] == [1, 1, 0, 0, 0]
    assert got["all"][8] == [0, 0, 2, 0, 0]


# ----------------------------------------------------------------------- pairs


def test_pairs_counts_every_ambo_of_a_draw():
    got = stats.pairs(entries([1, 2, 3, 4, 5], [1, 2, 6, 7, 8]))
    top = got["most_frequent"]["all"][0]
    assert (top["a"], top["b"]) == (1, 2)
    assert top["frequency"] == 2
    assert got["possible_pairs"] == 4005


def test_pairs_expected_frequency_is_ten_per_draw_over_all_pairs():
    got = stats.pairs(entries(*([1, 2, 3, 4, 5] for _ in range(400))))
    assert got["expected"]["all"] == pytest.approx(400 * 10 / 4005, abs=0.01)


def test_most_delayed_pairs_are_the_ones_never_drawn():
    got = stats.pairs(entries([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]))
    # Only ten pairs have ever come out, so the ranking's top is a pair at full delay.
    assert got["most_delayed"][0]["delay"] == 2
    assert got["most_delayed"][0]["frequency"] == 0


# ---------------------------------------------------------------------- groups


def test_groups_frequency_counts_numbers_not_draws():
    # Five numbers all of cadenza 0 means five hits for that group in one draw.
    got = stats.groups(entries([10, 20, 30, 40, 50]))
    cadenze = {g["id"]: g for g in got["cadenze"]["groups"]}
    assert cadenze[0]["frequency"]["all"] == 5
    assert cadenze[0]["delay"] == 0
    assert cadenze[1]["frequency"]["all"] == 0
    assert cadenze[1]["delay"] == 1


def test_groups_expected_scales_with_group_size():
    got = stats.groups(entries([1, 2, 3, 4, 5]))
    cadenze = {g["id"]: g for g in got["cadenze"]["groups"]}
    # Nine of the ninety numbers share a cadenza: 5 drawn numbers * 9/90.
    assert cadenze[0]["group_size"] == 9
    assert cadenze[0]["expected"]["all"] == pytest.approx(0.5, abs=0.01)


def test_decine_carry_their_span():
    got = stats.groups(entries([1, 2, 3, 4, 5]))
    assert [g["span"] for g in got["decine"]["groups"]][0] == "1-10"


# --------------------------------------------------------------- distributions


def test_odd_and_high_histograms_count_draws():
    got = stats.distributions(entries([1, 3, 5, 7, 9], [2, 4, 6, 8, 10]))["all"]
    assert got["draws"] == 2
    assert got["odd"]["observed"][5] == 1  # the all-odd draw
    assert got["odd"]["observed"][0] == 1  # the all-even draw
    assert got["high"]["observed"][0] == 2  # both draws are entirely below 46


def test_expected_histogram_is_hypergeometric_not_binomial():
    got = stats.distributions(entries(*([1, 2, 3, 4, 5] for _ in range(1000))))["all"]
    expected = got["odd"]["expected"]
    assert sum(expected) == pytest.approx(1000, abs=0.5)
    # Drawing without replacement narrows the distribution: the binomial would put
    # 1000 * (1/2)**5 = 31.25 in each tail, the hypergeometric puts ~27.8.
    assert expected[0] == pytest.approx(27.8, abs=0.2)
    assert expected[0] == expected[5]
    assert expected[2] == expected[3]


def test_sum_statistics():
    got = stats.distributions(entries([1, 2, 3, 4, 5], [86, 87, 88, 89, 90]))["all"]["sum"]
    assert got["min"] == 15
    assert got["max"] == 440
    assert got["mean"] == pytest.approx(227.5)
    assert got["bins"][0]["from"] == 10


# ------------------------------------------------------------------- followers


def test_followers_look_at_the_next_draw_only():
    series = entries([1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15])
    got = {row["number"]: row for row in stats.followers(series)}
    # 1 appears once and has a successor; 11 appears only in the last draw, which has none.
    assert got[1]["occurrences"] == 1
    assert got[11]["occurrences"] == 0
    followers = {row["number"] for row in got[1]["followed_by"]}
    assert followers == {6, 7, 8, 9, 10}


def test_followers_report_the_reference_values():
    series = entries(*([1, 2, 3, 4, 5] for _ in range(10)))
    row = next(r for r in stats.followers(series) if r["number"] == 1)["followed_by"][0]
    # A perfectly deterministic series: observed equals expected, so no departure.
    assert row["lift"] == pytest.approx(1.0)
    assert row["z"] is None or row["z"] == pytest.approx(0.0)


def test_followers_are_empty_for_a_single_draw():
    assert stats.followers(entries([1, 2, 3, 4, 5])) == []


# ------------------------------------------------------------------ uniformity


def test_uniformity_is_perfect_when_every_number_comes_out_equally():
    # Eighteen draws covering all 90 numbers exactly once each.
    numbers = list(range(1, 91))
    series = entries(*[numbers[i : i + 5] for i in range(0, 90, 5)])
    got = stats.uniformity(series)["all"]
    assert got["chi_square"] == 0.0
    assert got["p"] == 1.0
    assert got["df"] == 89
    assert got["drawn"] == 90


def test_uniformity_flags_a_rigged_series():
    got = stats.uniformity(entries(*([1, 2, 3, 4, 5] for _ in range(200))))["all"]
    assert got["chi_square"] > 1000
    assert got["p"] < 0.001


# -------------------------------------------------------------------- coverage


def test_coverage_counts_by_year_weekday_and_wheel(archive):
    got = stats.coverage(archive)
    assert got["by_year"] == [{"year": 2026, "draws": 4}]
    assert sum(row["draws"] for row in got["by_weekday"]) == 4
    by_wheel = {row["wheel"]: row for row in got["by_wheel"]}
    assert by_wheel["bari"]["draws"] == 4
    assert by_wheel["roma"]["draws"] == 3
    assert by_wheel["roma"]["last"] == "2026-01-04"


# ----------------------------------------------------------------------- build


def test_build_produces_one_payload_per_wheel(archive):
    meta, per_wheel = stats.build(archive, generated_at="2026-01-05T00:00:00Z")
    assert set(per_wheel) == {ALL_WHEELS, "bari", "roma"}
    assert meta["total_draws"] == 4
    assert meta["last_draw"] == "2026-01-04"
    assert meta["latest"]["wheels"]["bari"] == [1, 2, 16, 17, 18]
    assert [w["id"] for w in meta["wheels"]] == [ALL_WHEELS, "bari", "roma"]
    assert meta["wheels"][1]["file"] == "wheels/bari.json"


def test_all_wheels_skips_the_five_number_statistics(archive):
    _meta, per_wheel = stats.build(archive, generated_at="x")
    combined = per_wheel[ALL_WHEELS]
    assert combined["five_numbers"] is False
    assert combined["unavailable"] == ["distributions", "followers", "pairs", "positions"]
    assert "pairs" not in combined
    assert "tabellone" in combined


def test_payload_is_json_serialisable_and_carries_no_italian_keys(archive):
    meta, per_wheel = stats.build(archive, generated_at="x")
    text = json.dumps([meta, per_wheel])
    # The web layer owns every label; only the grouping ids are Italian, by design.
    for italian in ("ritardo", "frequenza", "ultima_uscita", "estrazioni", "attesa"):
        assert italian not in text
    assert "cadenze" in text


def test_build_rejects_an_empty_archive():
    with pytest.raises(ValueError):
        stats.build({}, generated_at="x")
