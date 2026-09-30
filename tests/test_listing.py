import datetime
import json
import pathlib

import pytest

import convert_formulas
from lotto import listing
from lotto.model import LottoError

SAMPLE = """Name=Formula di prova
SearchNum=2
SearchDrm=2
Rear=3
14  1 14 # 43 19 # 27
 7 21 # 3 4 5 6 9
"""


def day(n):
    return datetime.date(2026, 1, n)


def archive(*rows):
    return {day(n): row for n, row in enumerate(rows, start=1)}


QUIET = {"bari": [1, 2, 3, 4, 5], "roma": [6, 7, 8, 9, 10]}


def write(tmp_path, text, name="prova.frm"):
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return path


# ------------------------------------------------------------------- the parser


def test_parse_reads_the_header_and_the_formulas(tmp_path):
    parsed = listing.parse(write(tmp_path, SAMPLE))
    assert parsed.name == "Formula di prova"
    assert (parsed.size, parsed.wheel_count, parsed.lookback) == (2, 2, 3)
    assert [f.index for f in parsed.formulas] == [1, 2]
    assert parsed.formulas[1].numbers == (7, 21)


def test_a_repeated_search_number_is_counted_once(tmp_path):
    parsed = listing.parse(write(tmp_path, SAMPLE))
    # The line reads "14  1 14": the format allows the repeat, the search does not.
    assert parsed.formulas[0].numbers == (14, 1)


def test_a_bet_is_named_after_how_many_numbers_it_holds(tmp_path):
    parsed = listing.parse(write(tmp_path, SAMPLE))
    assert [bet.name for bet in parsed.formulas[0].bets] == ["ambata", "ambo"]
    assert [bet.name for bet in parsed.formulas[1].bets] == ["cinquina"]


def test_blank_lines_are_ignored(tmp_path):
    parsed = listing.parse(write(tmp_path, SAMPLE.replace("Rear=3\n", "Rear=3\n\n")))
    assert len(parsed.formulas) == 2


@pytest.mark.parametrize(
    "text",
    [
        "Nome=x\nSearchNum=2\nSearchDrm=2\nRear=3\n1 2 # 3 4\n",  # wrong header key
        "Name=x\nSearchNum=two\nSearchDrm=2\nRear=3\n1 2 # 3 4\n",  # not a number
        "Name=x\nSearchNum=2\nSearchDrm=2\nRear=3\n1 91 # 3 4\n",  # outside 1-90
        "Name=x\nSearchNum=2\nSearchDrm=2\nRear=3\n1 2 # 3 4 5 6 7 8\n",  # unplayable
        "Name=x\nSearchNum=2\nSearchDrm=2\nRear=3\n1 2 # \n",  # empty bet
        "Name=x\nSearchNum=2\nSearchDrm=2\nRear=3\n",  # no formulas
    ],
)
def test_a_malformed_listing_is_refused(tmp_path, text):
    with pytest.raises(LottoError):
        listing.parse(write(tmp_path, text))


# -------------------------------------------------------------------- the match


def one_formula(tmp_path, numbers="71 81", bets="# 30 31", rear=2, drums=2):
    text = (
        f"Name=x\nSearchNum=2\nSearchDrm={drums}\nRear={rear}\n{numbers} {bets}\n"
    )
    return listing.parse(write(tmp_path, text))


def test_the_search_numbers_must_be_on_exactly_the_declared_wheels(tmp_path):
    draws = archive(QUIET, QUIET, {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]})
    report = listing.apply(draws, day(3), one_formula(tmp_path))
    match, = report.matches
    assert match.wheels == ("bari", "roma")
    assert match.found == {"bari": (71,), "roma": (81,)}


def test_a_search_number_on_two_wheels_makes_the_play_dirty(tmp_path):
    draws = archive(
        QUIET, QUIET, {"bari": [71, 1, 2, 3, 4], "roma": [81, 71, 5, 6, 7]}
    )
    assert not listing.apply(draws, day(3), one_formula(tmp_path)).satisfied


def test_a_search_number_that_did_not_come_out_is_not_a_match(tmp_path):
    draws = archive(QUIET, QUIET, {"bari": [71, 1, 2, 3, 4], "roma": [5, 6, 7, 8, 9]})
    assert not listing.apply(draws, day(3), one_formula(tmp_path)).satisfied


def test_both_numbers_on_one_wheel_is_not_a_two_wheel_match(tmp_path):
    draws = archive(QUIET, QUIET, {"bari": [71, 81, 1, 2, 3], "roma": [5, 6, 7, 8, 9]})
    assert not listing.apply(draws, day(3), one_formula(tmp_path)).satisfied
    # The same draw does match a listing that asks for one wheel.
    single = listing.apply(draws, day(3), one_formula(tmp_path, drums=1))
    assert single.matches[0].wheels == ("bari",)


def test_isotopy_is_two_wheels_holding_a_search_number_in_the_same_position(tmp_path):
    same = archive(QUIET, QUIET, {"bari": [1, 71, 2, 3, 4], "roma": [5, 81, 6, 7, 8]})
    assert listing.apply(same, day(3), one_formula(tmp_path)).matches[0].isotopic
    other = archive(QUIET, QUIET, {"bari": [1, 71, 2, 3, 4], "roma": [5, 6, 81, 7, 8]})
    assert not listing.apply(other, day(3), one_formula(tmp_path)).matches[0].isotopic


# ---------------------------------------------------------------- the rear view


def test_a_bet_already_out_on_a_matching_wheel_is_rejected(tmp_path):
    draws = archive(
        QUIET,
        {"bari": [30, 1, 2, 3, 4], "roma": [5, 6, 7, 8, 9]},
        {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]},
    )
    match, = listing.apply(draws, day(3), one_formula(tmp_path)).matches
    checked, = match.bets
    assert not checked.clean
    assert (checked.seen_number, checked.seen_wheel) == (30, "bari")
    assert checked.seen_date == day(2)
    assert checked.seen_position == 1
    assert match.clean == ()


def test_the_rear_view_only_looks_at_the_matching_wheels(tmp_path):
    draws = archive(
        QUIET,
        {"bari": [1, 2, 3, 4, 5], "roma": [6, 7, 8, 9, 10], "milano": [30, 31, 1, 2, 3]},
        {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]},
    )
    # 30 came out on milano, which is not one of the two wheels: the bet stands.
    match, = listing.apply(draws, day(3), one_formula(tmp_path)).matches
    assert match.bets[0].clean


def test_the_rear_view_stops_at_the_declared_depth(tmp_path):
    draws = archive(
        {"bari": [30, 1, 2, 3, 4], "roma": [5, 6, 7, 8, 9]},
        QUIET,
        QUIET,
        {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]},
    )
    # 30 is four draws back and the listing looks two back, so it does not count.
    match, = listing.apply(draws, day(4), one_formula(tmp_path)).matches
    assert match.bets[0].clean


def test_a_draw_without_enough_history_is_not_judged(tmp_path):
    draws = archive(QUIET, {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]})
    report = listing.apply(draws, day(2), one_formula(tmp_path))
    assert report.short_history
    assert not report.satisfied


def test_scan_reports_only_the_draws_a_formula_matched(tmp_path):
    draws = archive(
        QUIET, QUIET, {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]}, QUIET
    )
    matched = listing.scan(draws, one_formula(tmp_path))
    assert [report.date for report in matched] == [day(3)]


# ------------------------------------------------------------- a typed formula


def test_a_line_splits_into_search_numbers_and_one_bet_per_column():
    parsed = listing.formula_from_line("14  1 14 # 43 19 # 27")
    assert parsed.numbers == (14, 1)
    # Written ambo-then-ambata, held smallest bet first: the five lists are the model,
    # the order they were typed in is not.
    assert [(bet.name, bet.numbers) for bet in parsed.bets] == [
        ("ambata", (27,)),
        ("ambo", (43, 19)),
    ]


def test_a_line_with_no_bets_is_a_search_only_formula():
    assert listing.formula_from_line("1 37 64").bets == ()


def test_one_formula_takes_its_header_from_the_caller():
    built = listing.one_formula("71 81 # 30 31", wheel_count=2, lookback=4)
    assert (built.size, built.wheel_count, built.lookback) == (2, 2, 4)
    assert len(built.formulas) == 1


def test_a_typed_formula_runs_like_a_file_one():
    draws = archive(QUIET, QUIET, {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]})
    built = listing.one_formula("71 81 # 30 31", wheel_count=2, lookback=2)
    match, = listing.apply(draws, day(3), built).matches
    assert match.wheels == ("bari", "roma")
    assert match.bets[0].clean


# --------------------------------------------------------------------- the json


def test_the_json_form_round_trips(tmp_path):
    original = listing.parse(write(tmp_path, SAMPLE))
    back = listing.from_json(listing.to_json(original))
    assert back == original


def test_the_json_form_spells_the_header_out(tmp_path):
    payload = listing.to_json(listing.parse(write(tmp_path, SAMPLE)), source="prova.frm")
    assert list(payload) == [
        "name",
        "source",
        "size",
        "wheels",
        "lookback",
        "formula_count",
        "formulas",
    ]
    assert (payload["size"], payload["wheels"], payload["lookback"]) == (2, 2, 3)
    assert payload["formula_count"] == 2


def test_every_bet_list_is_present_even_when_empty(tmp_path):
    payload = listing.to_json(listing.parse(write(tmp_path, SAMPLE)))
    bets = payload["formulas"][0]["bets"]
    assert list(bets) == ["ambata", "ambo", "terno", "quaterna", "cinquina"]
    assert bets["ambo"] == [[43, 19]]
    assert bets["ambata"] == [[27]]
    assert bets["terno"] == bets["quaterna"] == bets["cinquina"] == []


def test_read_takes_either_form(tmp_path):
    original = listing.parse(write(tmp_path, SAMPLE))
    target = tmp_path / "prova.json"
    target.write_text(json.dumps(listing.to_json(original)), encoding="utf-8")
    assert listing.read(target) == original
    assert listing.read(tmp_path / "prova.frm") == original


@pytest.mark.parametrize(
    "payload",
    [
        {"size": 2, "wheels": 2, "lookback": 3, "formulas": []},  # no name
        {"name": "x", "size": 2, "wheels": 2, "lookback": 3, "formulas": []},  # empty
        {  # a bet in the wrong list
            "name": "x", "size": 2, "wheels": 2, "lookback": 3,
            "formulas": [{"numbers": [1, 2], "bets": {"ambo": [[3]]}}],
        },
        {  # a kind that does not exist
            "name": "x", "size": 2, "wheels": 2, "lookback": 3,
            "formulas": [{"numbers": [1, 2], "bets": {"sestina": [[1, 2, 3, 4, 5, 6]]}}],
        },
        {  # outside the board
            "name": "x", "size": 2, "wheels": 2, "lookback": 3,
            "formulas": [{"numbers": [1, 91], "bets": {}}],
        },
    ],
)
def test_a_malformed_json_listing_is_refused(payload):
    with pytest.raises(LottoError):
        listing.from_json(payload)


# ---------------------------------------------------------------- the converter


@pytest.mark.parametrize(
    "name,expected",
    [
        ("nsla.frm", "nsla.json"),
        ("ripetuti.2010.frm.no", "ripetuti.2010.json"),
        ("allor.integrale.2019.frm", "allor.integrale.2019.json"),
    ],
)
def test_the_converted_name_drops_the_original_suffixes(name, expected):
    assert convert_formulas.out_name(pathlib.Path(name)) == expected


def test_a_directory_is_swept_for_listings_but_not_disabled_ones(tmp_path):
    (tmp_path / "a.frm").write_text(SAMPLE, encoding="utf-8")
    (tmp_path / "b.frm.no").write_text(SAMPLE, encoding="utf-8")
    assert [p.name for p in convert_formulas.sources([tmp_path])] == ["a.frm"]
    # Naming the disabled one converts it anyway.
    named = tmp_path / "b.frm.no"
    assert convert_formulas.sources([named]) == [named]
