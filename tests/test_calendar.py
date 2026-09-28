import datetime

import pytest

from lotto import calendar_it as cal

ROME = cal.ROME


def at(year, month, day, hour=12, minute=0):
    return datetime.datetime(year, month, day, hour, minute, tzinfo=ROME)


@pytest.mark.parametrize(
    "when, expected",
    [
        # A draw is not expected until the morning after it is held.
        (at(2026, 9, 26, 23, 45), datetime.date(2026, 9, 25)),
        (at(2026, 9, 27, 5, 0), datetime.date(2026, 9, 25)),
        (at(2026, 9, 27, 6, 30), datetime.date(2026, 9, 26)),
        # Tuesday's draw is not expected on Tuesday night.
        (at(2026, 9, 29, 22, 0), datetime.date(2026, 9, 26)),
        (at(2026, 9, 30, 6, 30), datetime.date(2026, 9, 29)),
        # Sunday and Monday are not draw days, so Saturday stands.
        (at(2026, 9, 28, 12, 0), datetime.date(2026, 9, 26)),
    ],
)
def test_expected_last_draw(when, expected):
    assert cal.expected_last_draw(when) == expected


def test_survives_the_dst_boundary():
    # Italy leaves CEST on 2026-10-25; the deadline must still resolve correctly.
    assert cal.expected_last_draw(at(2026, 10, 25, 6, 30)) == datetime.date(2026, 10, 24)


def test_only_tuesday_thursday_friday_saturday_are_draw_days():
    days = {
        datetime.date(2026, 9, d).strftime("%a")
        for d in range(1, 31)
        if cal.is_draw_weekday(datetime.date(2026, 9, d))
    }
    assert days == {"Tue", "Thu", "Fri", "Sat"}


def test_a_current_archive_is_not_stale():
    assert cal.staleness(datetime.date(2026, 9, 26), at(2026, 9, 27, 6, 30)) == datetime.timedelta(0)


def test_staleness_is_measured_from_the_publication_deadline():
    behind = cal.staleness(datetime.date(2026, 9, 22), at(2026, 9, 27, 6, 30))
    assert behind == datetime.timedelta(minutes=30)
