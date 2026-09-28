import datetime

import pytest
from fixtures.dbf import FIELDS, build

from lotto import parse_dbf
from lotto.model import LottoError

DAY = datetime.date(2026, 9, 26)


def test_parses_wheels_and_contest():
    raw = build([(DAY, 155, {"BA": [7, 22, 47, 49, 69], "NZ": [6, 14, 62, 9, 88]})])
    draws, contests = parse_dbf.parse(raw)

    assert contests == {DAY: 155}
    # A single-digit number is stored left-aligned as "7 " and must survive.
    assert draws[DAY]["bari"] == [7, 22, 47, 49, 69]
    # NZ is the DBF's code for the Nazionale wheel; the primary calls it RN.
    assert draws[DAY]["nazionale"] == [6, 14, 62, 9, 88]


def test_blank_columns_mean_the_wheel_did_not_draw():
    raw = build([(DAY, 1, {"BA": [1, 2, 3, 4, 5]})])
    draws, _ = parse_dbf.parse(raw)
    assert set(draws[DAY]) == {"bari"}


def test_rejects_an_unexpected_schema():
    fields = FIELDS[:-1]  # upstream drops a column
    raw = build([(DAY, 1, {"BA": [1, 2, 3, 4, 5]})], fields=fields)
    with pytest.raises(LottoError, match="unexpected DBF schema"):
        parse_dbf.parse(raw)


def test_rejects_an_out_of_range_number():
    raw = build([(DAY, 1, {"BA": [1, 2, 3, 4, 99]})])
    with pytest.raises(LottoError, match="out of range"):
        parse_dbf.parse(raw)


def test_rejects_an_empty_archive():
    with pytest.raises(LottoError, match="no draws"):
        parse_dbf.parse(build([]))
