"""Draw-calendar arithmetic, used to decide whether the primary source is stale.

Draws are held on Tuesday, Thursday, Friday and Saturday. Upstream publication time
is *not* predictable -- the observed ``Last-Modified`` suggests the same evening, but
that is a single data point and the fallback is rebuilt nightly regardless. So a
draw is only considered overdue from the **morning after** it was held, and the
update job simply runs every day: it is idempotent and a run with nothing to do
costs one conditional request.

This module only ever looks *forward* from today. The historical calendar is
irregular (Saturday-only in the 1950s, Tue/Thu/Sat in 2022, occasional Monday and
Wednesday specials) and must never be assumed.
"""

from __future__ import annotations

import datetime
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")

#: Monday=0 ... Sunday=6 -- Tuesday, Thursday, Friday, Saturday.
DRAW_WEEKDAYS = frozenset({1, 3, 4, 5})

#: A draw held on day D is expected to be published upstream by D + 1 at this local
#: time. Deliberately generous: being late to notice costs nothing, crying wolf does.
PUBLISH_OFFSET = datetime.timedelta(days=1)
PUBLISH_TIME = datetime.time(6, 0)

#: How long a draw may stay missing before the update job treats it as a failure.
STALE_GRACE = datetime.timedelta(hours=48)


def now_rome() -> datetime.datetime:
    return datetime.datetime.now(tz=ROME)


def is_draw_weekday(day: datetime.date) -> bool:
    return day.weekday() in DRAW_WEEKDAYS


def publication_deadline(day: datetime.date) -> datetime.datetime:
    """Instant by which ``day``'s results should be available upstream."""
    return datetime.datetime.combine(day + PUBLISH_OFFSET, PUBLISH_TIME, tzinfo=ROME)


def expected_last_draw(now: datetime.datetime, *, lookback_days: int = 30) -> datetime.date | None:
    """Most recent scheduled draw date whose results should already be published.

    Walks back from ``now`` (converted to Rome time) and returns the first
    Tue/Thu/Fri/Sat date whose publication deadline has passed.
    """
    local = now.astimezone(ROME)
    for offset in range(lookback_days + 1):
        day = local.date() - datetime.timedelta(days=offset)
        if is_draw_weekday(day) and publication_deadline(day) <= local:
            return day
    return None


def staleness(last_date: datetime.date, now: datetime.datetime) -> datetime.timedelta:
    """How long the archive has been missing an expected draw. Zero when current."""
    expected = expected_last_draw(now)
    if expected is None or last_date >= expected:
        return datetime.timedelta(0)
    return now.astimezone(ROME) - publication_deadline(expected)
