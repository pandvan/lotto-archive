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
    # Asked for, the dirty play matches, and both wheels report the repeated number.
    match, = listing.apply(draws, day(3), one_formula(tmp_path), dirty=True).matches
    assert match.found == {"bari": (71,), "roma": (71, 81)}
    # The wheels must still number what the listing declares.
    wide = archive(QUIET, QUIET, {**draws[day(3)], "milano": [71, 11, 12, 13, 14]})
    assert not listing.apply(wide, day(3), one_formula(tmp_path), dirty=True).satisfied


def test_wheel_bounds_follow_how_many_numbers_are_searched():
    assert listing.wheel_bounds(2) == (1, 2)
    assert listing.wheel_bounds(5) == (1, 5)
    assert listing.wheel_bounds(6) == (2, 6)
    assert listing.wheel_bounds(14) == (3, 11)


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


# ------------------------------------------------------------------ the outcome

MATCH = {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]}


def outcome(tmp_path, *after, **options):
    draws = archive(QUIET, QUIET, MATCH, *after)
    match, = listing.apply(draws, day(3), one_formula(tmp_path), **options).matches
    return match.bets[0].outcome


def test_a_bet_wins_when_all_its_numbers_come_out_on_one_wheel(tmp_path):
    won = outcome(tmp_path, QUIET, {"bari": [30, 31, 1, 2, 3], "roma": [6, 7, 8, 9, 10]}, colpi=3)
    assert (won.state, won.colpo, won.date, won.wheels) == ("won", 2, day(5), ("bari",))
    # A win does not shorten the window: two draws of two wheels were there to search.
    assert (won.colpi, won.rows) == (2, 4)


def test_numbers_split_over_two_wheels_do_not_win(tmp_path):
    split = {"bari": [30, 1, 2, 3, 4], "roma": [31, 6, 7, 8, 9]}
    assert outcome(tmp_path, split, colpi=1).state == "lost"


def test_a_bet_is_open_until_its_colpi_have_all_been_drawn(tmp_path):
    assert outcome(tmp_path, QUIET, colpi=2).state == "open"
    assert outcome(tmp_path, QUIET, QUIET, colpi=2).state == "lost"
    assert outcome(tmp_path, QUIET) is None


def test_other_wheels_count_only_when_asked_for(tmp_path):
    elsewhere = {**QUIET, "milano": [30, 31, 1, 2, 3], "nazionale": [30, 31, 4, 5, 6]}
    assert outcome(tmp_path, elsewhere, colpi=1).state == "lost"
    assert outcome(tmp_path, elsewhere, colpi=1, play="tutte").wheels == ("milano",)
    assert outcome(tmp_path, elsewhere, colpi=1, play="nazionale").wheels == (
        "milano",
        "nazionale",
    )


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


def test_the_lookback_flag_overrides_the_listing(tmp_path):
    import argparse

    import formula

    path = tmp_path / "x.json"
    path.write_text(
        json.dumps(listing.one_formula("71 81", wheel_count=2, lookback=4).as_dict())
    )
    args = argparse.Namespace(listing=path, lookback=None, wheels=None)
    assert formula.listing_from(args).lookback == 4
    args.lookback = 7
    assert formula.listing_from(args).lookback == 7
    # --wheels does the same for the wheel count, within what the numbers allow.
    assert formula.listing_from(args).wheel_count == 2
    args.wheels = 1
    assert formula.listing_from(args).wheel_count == 1
    args.wheels = 3
    with pytest.raises(LottoError):
        formula.listing_from(args)


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
        {  # more numbers than any bet holds
            "name": "x", "size": 2, "wheels": 2, "lookback": 3,
            "formulas": [{"numbers": [1, 2], "bets": {"cinquina": [[1, 2, 3, 4, 5, 6]]}}],
        },
        # the wrong shape, at every level
        {"name": "x", "size": 2, "wheels": 2, "lookback": 3, "formulas": "1 2 # 3"},
        {"name": "x", "size": 2, "wheels": 2, "lookback": 3, "formulas": ["1 2 # 3"]},
        {"name": "x", "size": 2, "wheels": 2, "lookback": 3, "formulas": [{"numbers": 7}]},
        {
            "name": "x", "size": 2, "wheels": 2, "lookback": 3,
            "formulas": [{"numbers": [1, 2], "bets": {"ambata": 3}}],
        },
        {
            "name": "x", "size": 2, "wheels": 2, "lookback": 3,
            "formulas": [{"numbers": [1, 2], "bets": {"ambata": [3]}}],
        },
        {
            "name": "x", "size": 2, "wheels": 2, "lookback": 3,
            "formulas": [{"numbers": [1, 2], "bets": [[3]]}],
        },
        {
            "name": "x", "size": 2, "wheels": 2, "lookback": 3,
            "formulas": [{"index": "first", "numbers": [1, 2], "bets": {}}],
        },
    ],
)
def test_a_malformed_json_listing_is_refused(payload):
    with pytest.raises(LottoError):
        listing.from_json(payload)


def test_a_file_that_is_not_json_is_refused(tmp_path):
    with pytest.raises(LottoError, match="not valid JSON"):
        listing.read(write(tmp_path, "{ nope", name="rotto.json"))


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


# ------------------------------------------------------------------ clean only


def burnt(tmp_path):
    """A draw whose one match has its only bet already out on a matching wheel."""
    return archive(
        QUIET,
        {"bari": [30, 1, 2, 3, 4], "roma": [5, 6, 7, 8, 9]},
        {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]},
    ), one_formula(tmp_path)


def test_clean_only_drops_a_match_the_retrovisione_burnt(tmp_path):
    draws, built = burnt(tmp_path)
    assert listing.apply(draws, day(3), built).satisfied
    assert not listing.apply(draws, day(3), built, clean_only=True).satisfied


def test_clean_only_keeps_a_match_nothing_was_found_for(tmp_path):
    draws = archive(QUIET, QUIET, {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]})
    report = listing.apply(draws, day(3), one_formula(tmp_path), clean_only=True)
    match, = report.matches
    assert match.all_clean
    assert match.rejected == ()


def test_a_formula_with_no_bets_has_nothing_to_burn(tmp_path):
    draws = archive(QUIET, QUIET, {"bari": [71, 1, 2, 3, 4], "roma": [81, 5, 6, 7, 8]})
    built = listing.one_formula("71 81", wheel_count=2, lookback=2)
    assert listing.apply(draws, day(3), built, clean_only=True).satisfied


def test_the_report_records_that_it_was_filtered(tmp_path):
    draws, built = burnt(tmp_path)
    assert listing.apply(draws, day(3), built, clean_only=True).as_dict()["clean_only"]
    assert not listing.apply(draws, day(3), built).as_dict()["clean_only"]


def test_scan_skips_a_draw_whose_only_match_was_burnt(tmp_path):
    draws, built = burnt(tmp_path)
    assert [r.date for r in listing.scan(draws, built)] == [day(3)]
    assert listing.scan(draws, built, clean_only=True) == []


# ---------------------------------------------------------------- the three scopes


def scoped():
    """A draw matching on bari+roma, with 30 out on bari and 31 out on milano."""
    draws = archive(
        QUIET,
        {
            "bari": [30, 1, 2, 3, 4],
            "roma": [11, 12, 13, 14, 15],
            "milano": [31, 16, 17, 18, 19],
        },
        {
            "bari": [71, 1, 2, 3, 4],
            "roma": [81, 5, 6, 7, 8],
            "milano": [9, 10, 20, 21, 22],
        },
    )
    return draws, listing.one_formula("71 81 # 30 # 31", wheel_count=2, lookback=2)


def verdicts(report):
    """{(bet numbers, wheels judged): clean}."""
    match, = report.matches
    return {(c.bet.numbers, c.play): c.clean for c in match.bets}


def test_medium_searches_only_the_wheels_of_the_match():
    draws, built = scoped()
    # 30 was on bari, one of the two; 31 was on milano, which took no part.
    assert verdicts(listing.apply(draws, day(3), built, scope="medium")) == {
        ((30,), ("bari", "roma")): False,
        ((31,), ("bari", "roma")): True,
    }


def test_strict_searches_every_wheel_that_drew():
    draws, built = scoped()
    # milano is not part of the match, but under strict it still burns 31.
    assert verdicts(listing.apply(draws, day(3), built, scope="strict")) == {
        ((30,), ("bari", "roma")): False,
        ((31,), ("bari", "roma")): False,
    }


def test_loose_judges_each_wheel_on_its_own():
    draws, built = scoped()
    # 30 is burnt on bari and still playable on roma.
    assert verdicts(listing.apply(draws, day(3), built, scope="loose")) == {
        ((30,), ("bari",)): False,
        ((30,), ("roma",)): True,
        ((31,), ("bari",)): True,
        ((31,), ("roma",)): True,
    }


def test_the_scopes_are_nested_in_how_much_they_reject():
    draws, built = scoped()
    rejected = {
        scope: len(listing.apply(draws, day(3), built, scope=scope).matches[0].rejected)
        for scope in listing.SCOPES
    }
    assert rejected["strict"] >= rejected["medium"] >= rejected["loose"]


def test_clean_only_under_loose_needs_every_wheel_clean():
    draws, built = scoped()
    # 30 is burnt on bari, so the match is not wholly clean on any scope.
    for scope in listing.SCOPES:
        report = listing.apply(draws, day(3), built, clean_only=True, scope=scope)
        assert not report.satisfied, scope


def test_the_report_records_the_scope():
    draws, built = scoped()
    assert listing.apply(draws, day(3), built, scope="loose").as_dict()["scope"] == "loose"
    assert listing.apply(draws, day(3), built).as_dict()["scope"] == "medium"


def test_an_unknown_scope_is_refused():
    draws, built = scoped()
    with pytest.raises(LottoError):
        listing.apply(draws, day(3), built, scope="whatever")
