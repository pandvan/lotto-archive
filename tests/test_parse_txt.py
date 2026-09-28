import datetime

import pytest

from lotto import parse_txt
from lotto.model import LottoError

GOOD = "\n".join(
    [
        "1939/01/07\tBA\t58\t22\t47\t49\t69",
        "1939/01/07\tMI\t40\t38\t57\t67\t7",
        "2026/09/26\tRN\t6\t14\t62\t9\t88",
    ]
)


def test_parses_dates_wheels_and_numbers():
    draws = parse_txt.parse(GOOD)

    assert set(draws) == {datetime.date(1939, 1, 7), datetime.date(2026, 9, 26)}
    assert draws[datetime.date(1939, 1, 7)]["bari"] == [58, 22, 47, 49, 69]
    # Numbers are not zero-padded upstream.
    assert draws[datetime.date(1939, 1, 7)]["milano"][-1] == 7
    # The primary calls the Nazionale wheel RN.
    assert draws[datetime.date(2026, 9, 26)]["nazionale"] == [6, 14, 62, 9, 88]


def test_ignores_blank_lines():
    assert parse_txt.parse(GOOD + "\n\n") == parse_txt.parse(GOOD)


@pytest.mark.parametrize(
    "line, message",
    [
        ("1939/01/07\tBA\t58\t22\t47\t49", "tab-separated fields"),
        ("1939-01-07\tBA\t58\t22\t47\t49\t69", "bad date"),
        ("1939/01/07\tZZ\t58\t22\t47\t49\t69", "unknown wheel code"),
        ("1939/01/07\tBA\t58\t22\t47\t49\t91", "out of range"),
        ("1939/01/07\tBA\t58\t22\t47\t49\tx", "non-numeric"),
    ],
)
def test_rejects_malformed_lines(line, message):
    with pytest.raises(LottoError, match=message):
        parse_txt.parse(line)


def test_rejects_a_duplicate_wheel_for_one_date():
    text = "1939/01/07\tBA\t1\t2\t3\t4\t5\n1939/01/07\tBA\t6\t7\t8\t9\t10"
    with pytest.raises(LottoError, match="duplicate wheel"):
        parse_txt.parse(text)


def test_rejects_an_empty_archive():
    with pytest.raises(LottoError, match="no draws"):
        parse_txt.parse("")
