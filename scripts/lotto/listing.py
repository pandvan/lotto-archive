"""Reading ``.frm`` formula listings and running them against the archive.

``.frm`` is the plain-text format of *lotto-convergence*, which this module reads and
applies as that program does. Four header lines, then one formula per line::

    Name=Formula numeri ripetuti (2010)
    SearchNum=3
    SearchDrm=2
    Rear=13
    14  1 14 # 43 19 # 43 27 # 43 64

The numbers before the first ``#`` are the *numeri di ricerca* to look for; each
``#``-separated group after them is a bet to play if they are found -- one number is an
*ambata*, two an *ambo*, and so on up to a *cinquina*. Repeats inside a group are
collapsed, so the line above searches for 1 and 14, not for 14 twice.

The header is the listing's, not the line's: ``SearchNum`` and ``SearchDrm`` are how
many numbers to look for and over how many wheels, and ``Rear`` is how many draws back
the *retrovisione* reaches.

A formula matches a draw when every one of its search numbers came out on **exactly
one** wheel -- a number on two wheels makes the play *sporca* and drops the formula --
and those wheels number exactly ``SearchDrm``. The bets of a matching formula are then
each checked against the ``Rear`` draws before it: a bet any of whose numbers already
came out there is reported as rejected. How many wheels that check searches is the
*scope* -- :data:`SCOPES`; the original searches the matching wheels.

Both the numbers and the bets are written down in advance; the archive only says
whether they came up. Nothing here makes a number more likely to be drawn -- a formula
that matches has told you about one draw that already happened, and the *retrovisione*
removes bets without improving the ones it leaves.
"""

from __future__ import annotations

import datetime
import json
import re
from dataclasses import dataclass, replace
from pathlib import Path

from .model import WHEELS, DrawSet, LottoError, iso

#: Bet size -> the name of that bet. One number is an *ambata*, five a *cinquina*, and
#: there is nothing in the game beyond that.
BET_NAMES: dict[int, str] = {
    1: "ambata",
    2: "ambo",
    3: "terno",
    4: "quaterna",
    5: "cinquina",
}

#: The five bet lists a formula carries, smallest first. Every formula has all five;
#: any of them may be empty.
BET_ORDER: tuple[str, ...] = tuple(BET_NAMES[size] for size in sorted(BET_NAMES))

#: How wide the retrovisione looks, narrowest check last.
#:
#: The subject is always the bet's numbers over the ``lookback`` preceding draws -- what
#: changes is which wheels are searched:
#:
#: ``strict``  every wheel that drew. A number out anywhere burns the bet.
#: ``medium``  the wheels of the match. This is what lotto-convergence does:
#:            ``checkRearView`` searches ``getWholeDraw(one)`` and ``getWholeDraw(two)``.
#: ``loose``   one wheel at a time, so a bet burnt on one wheel of the match stays
#:            playable on the other and is reported once per wheel.
SCOPES: tuple[str, ...] = ("strict", "medium", "loose")
DEFAULT_SCOPE = "medium"

#: Where a bet is looked for after the match, when its outcome is asked for.
#:
#: ``match``      the wheels the bet is played on: those of the match. The default.
#: ``tutte``      those, and the ten city wheels. In the game *tutte* leaves the
#:                Nazionale out.
#: ``nazionale``  every wheel, the Nazionale included.
PLAYS: tuple[str, ...] = ("match", "tutte", "nazionale")
DEFAULT_PLAY = "match"

#: Header defaults of the original program, used when a formula is typed out instead
#: of read from a file that carries its own header.
DEFAULT_WHEELS = 2
DEFAULT_LOOKBACK = 9

#: The four header lines, in the order the format fixes them.
HEADER_KEYS: tuple[str, ...] = ("Name", "SearchNum", "SearchDrm", "Rear")

_HEADER_RE = re.compile(r"^\s*([A-Za-z]+)\s*=(.*)$")


@dataclass(frozen=True)
class Bet:
    """Numbers written down to be played together."""

    numbers: tuple[int, ...]

    @property
    def name(self) -> str:
        return BET_NAMES[len(self.numbers)]

    def as_dict(self) -> list[int]:
        """Just the numbers: the list a bet sits in already names its type."""
        return list(self.numbers)


@dataclass(frozen=True)
class Formula:
    """One line of a listing: what to look for, and what to play when it is there.

    A formula's bets are five lists -- ambate, ambi, terni, quaterne, cinquine -- any
    of which may be empty. :attr:`bets` holds them end to end in that order whatever
    order they were written in, so two formulas playing the same bets compare equal
    and a listing survives a trip through JSON unchanged; :attr:`by_type` is the same
    thing split back up.
    """

    numbers: tuple[int, ...]
    bets: tuple[Bet, ...]
    #: 1-based line position among the formulas, as the program numbers them.
    index: int

    def __post_init__(self) -> None:
        by_name = group_by_type(self.bets, lambda bet: bet)
        object.__setattr__(
            self, "bets", tuple(bet for bets in by_name.values() for bet in bets)
        )

    @property
    def by_type(self) -> dict[str, tuple[Bet, ...]]:
        """The five bet lists, in file order within each. Any of them may be empty."""
        return group_by_type(self.bets, lambda bet: bet)

    def as_dict(self) -> dict:
        return {
            "index": self.index,
            "numbers": list(self.numbers),
            "bets": {
                name: [bet.as_dict() for bet in bets]
                for name, bets in self.by_type.items()
            },
        }


@dataclass(frozen=True)
class Listing:
    """A parsed ``.frm`` file: its header and its formulas."""

    name: str
    size: int
    wheel_count: int
    lookback: int
    formulas: tuple[Formula, ...]

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "size": self.size,
            "wheels": self.wheel_count,
            "lookback": self.lookback,
            "formulas": [formula.as_dict() for formula in self.formulas],
        }


@dataclass(frozen=True)
class Outcome:
    """What became of a bet over the *colpi* -- the draws -- after its match.

    A bet wins when all of its numbers come out together on one wheel; the first draw
    that does it closes the bet. It is ``open`` while it has not won and the archive
    holds fewer draws after the match than were asked for.
    """

    #: ``won``, ``lost`` or ``open``.
    state: str
    #: Draws after the match the archive holds, capped at the colpi asked for: less
    #: than that means the window is not over yet, whatever the state.
    colpi: int
    #: Wheel rows searched over the whole window, win or not -- what the chance of
    #: winning by luck depends on.
    rows: int
    #: 1-based draw after the match that won, with its date and every wheel that did.
    colpo: int | None = None
    date: datetime.date | None = None
    wheels: tuple[str, ...] = ()

    def as_dict(self) -> dict:
        out = {"state": self.state, "colpi": self.colpi, "rows": self.rows}
        if self.state == "won":
            out |= {"colpo": self.colpo, "date": iso(self.date), "wheels": list(self.wheels)}
        return out


@dataclass(frozen=True)
class CheckedBet:
    """A bet after the *retrovisione*: clean, or already out and where."""

    bet: Bet
    clean: bool
    #: The wheels this verdict covers: the match's wheels, or one of them under
    #: ``loose``, where each wheel is judged on its own.
    play: tuple[str, ...] = ()
    seen_number: int | None = None
    seen_wheel: str | None = None
    seen_date: datetime.date | None = None
    #: Extraction position, 1-5, of the number that rejected the bet.
    seen_position: int | None = None
    #: How the bet fared afterwards; only when colpi were asked for.
    outcome: Outcome | None = None

    def as_dict(self) -> dict:
        out = {
            "numbers": list(self.bet.numbers),
            "play": list(self.play),
            "clean": self.clean,
        }
        if not self.clean:
            out["seen"] = {
                "number": self.seen_number,
                "wheel": self.seen_wheel,
                "date": iso(self.seen_date),
                "position": self.seen_position,
            }
        if self.outcome is not None:
            out["outcome"] = self.outcome.as_dict()
        return out


@dataclass(frozen=True)
class Match:
    """A formula whose search numbers came out as the listing requires."""

    formula: Formula
    wheels: tuple[str, ...]
    #: Wheel -> the search numbers it produced.
    found: dict[str, tuple[int, ...]]
    #: Two matching wheels carry a search number in the same extraction position.
    isotopic: bool
    bets: tuple[CheckedBet, ...]

    @property
    def clean(self) -> tuple[CheckedBet, ...]:
        return tuple(bet for bet in self.bets if bet.clean)

    @property
    def rejected(self) -> tuple[CheckedBet, ...]:
        return tuple(bet for bet in self.bets if not bet.clean)

    @property
    def all_clean(self) -> bool:
        """Did the retrovisione find nothing at all?

        A formula that plays no bets is clean the way an empty sum is zero: there was
        nothing to look for, so nothing was found.
        """
        return not self.rejected

    @property
    def by_type(self) -> dict[str, tuple[CheckedBet, ...]]:
        """The five bet lists as checked, in file order within each."""
        return group_by_type(self.bets, lambda checked: checked.bet)

    def as_dict(self) -> dict:
        return {
            "formula": self.formula.as_dict(),
            "wheels": list(self.wheels),
            "found": {wheel: list(numbers) for wheel, numbers in self.found.items()},
            "isotopic": self.isotopic,
            "bets": {
                name: [checked.as_dict() for checked in checked_bets]
                for name, checked_bets in self.by_type.items()
            },
        }


@dataclass(frozen=True)
class ListingReport:
    """The outcome of running a whole listing against one draw."""

    date: datetime.date
    listing: Listing
    history: int
    matches: tuple[Match, ...] = ()
    #: Only matches whose bets all survived the retrovisione were kept.
    clean_only: bool = False
    #: Which wheels the retrovisione searched -- see :data:`SCOPES`.
    scope: str = DEFAULT_SCOPE

    @property
    def satisfied(self) -> bool:
        return bool(self.matches)

    @property
    def short_history(self) -> bool:
        return self.history < self.listing.lookback

    def as_dict(self) -> dict:
        return {
            "date": iso(self.date),
            "listing": self.listing.name,
            "size": self.listing.size,
            "wheels": self.listing.wheel_count,
            "lookback": self.listing.lookback,
            "history": self.history,
            "short_history": self.short_history,
            "clean_only": self.clean_only,
            "scope": self.scope,
            "satisfied": self.satisfied,
            "matches": [match.as_dict() for match in self.matches],
        }


# ------------------------------------------------------------------------ parse


def wheels_by_number(day: dict[str, list[int]]) -> dict[int, tuple[str, ...]]:
    """Number -> the wheels of this draw that produced it, canonical order."""
    out: dict[int, list[str]] = {}
    for wheel in WHEELS:
        for number in day.get(wheel, ()):
            holders = out.setdefault(number, [])
            if wheel not in holders:
                holders.append(wheel)
    return {number: tuple(holders) for number, holders in out.items()}


def group_by_type(items, bet_of):
    """Split ``items`` into the five bet lists, keyed by bet name.

    Every key is always present: a formula that plays no terno has an empty terno
    list, not a missing one.
    """
    out: dict[str, list] = {name: [] for name in BET_ORDER}
    for item in items:
        out[bet_of(item).name].append(item)
    return {name: tuple(group) for name, group in out.items()}


def _checked(numbers, where: str) -> tuple[int, ...]:
    """Validate a JSON array of numbers the way a ``.frm`` group is validated."""
    if not isinstance(numbers, (list, tuple)):
        raise LottoError(f"{where}: {numbers!r} is not a list of numbers")
    out: list[int] = []
    for value in numbers:
        if not isinstance(value, int) or isinstance(value, bool):
            raise LottoError(f"{where}: {value!r} is not a number")
        if not 1 <= value <= 90:
            raise LottoError(f"{where}: {value} is not in 1-90")
        if value not in out:
            out.append(value)
    if not out:
        raise LottoError(f"{where}: empty group")
    return tuple(out)


def _numbers(text: str, where: str) -> tuple[int, ...]:
    """The numbers of one whitespace-separated group, deduplicated in order."""
    out: list[int] = []
    for token in text.split():
        try:
            number = int(token)
        except ValueError:
            raise LottoError(f"{where}: {token!r} is not a number") from None
        if not 1 <= number <= 90:
            raise LottoError(f"{where}: {number} is not in 1-90")
        if number not in out:
            out.append(number)
    if not out:
        raise LottoError(f"{where}: empty group")
    return tuple(out)


def formula_from_line(line: str, *, index: int = 1, where: str = "formula") -> Formula:
    """One formula line: the numbers to search for, then a bet per ``#`` column."""
    groups = line.split("#")
    numbers = _numbers(groups[0], where)
    bets: list[Bet] = []
    for group in groups[1:]:
        played = _numbers(group, where)
        if len(played) not in BET_NAMES:
            raise LottoError(f"{where}: {len(played)} numbers is not a playable bet")
        bets.append(Bet(played))
    return Formula(numbers=numbers, bets=tuple(bets), index=index)


def one_formula(line: str, *, wheel_count: int, lookback: int) -> Listing:
    """A listing of a single formula, its header supplied by the caller.

    This is what a formula typed on the command line is: the same line a ``.frm`` file
    would hold, with the wheel count and the retrovisione depth coming from flags
    instead of from a header.
    """
    formula = formula_from_line(line, where="formula")
    return Listing(
        name=line.strip(),
        size=len(formula.numbers),
        wheel_count=wheel_count,
        lookback=lookback,
        formulas=(formula,),
    )


def parse(path: Path) -> Listing:
    """Read a ``.frm`` listing.

    Blank lines are ignored everywhere. A bet of more than five numbers has no name in
    the game and is refused rather than silently truncated, which is what the original
    parser does with it.
    """
    lines = [
        line for line in path.read_text(encoding="utf-8", errors="replace").splitlines()
        if line.strip()
    ]
    if len(lines) <= len(HEADER_KEYS):
        raise LottoError(f"{path}: needs {len(HEADER_KEYS)} header lines and a formula")

    header: dict[str, str] = {}
    for key, line in zip(HEADER_KEYS, lines):
        match = _HEADER_RE.match(line)
        if not match or match.group(1).lower() != key.lower():
            raise LottoError(f"{path}: expected a '{key}=' line, got {line.strip()!r}")
        header[key] = match.group(2).strip()

    try:
        size = int(header["SearchNum"])
        wheel_count = int(header["SearchDrm"])
        lookback = int(header["Rear"])
    except ValueError as error:
        raise LottoError(f"{path}: bad header value ({error})") from None

    formulas = [
        formula_from_line(line, index=offset, where=f"{path}: formula {offset}")
        for offset, line in enumerate(lines[len(HEADER_KEYS):], start=1)
    ]

    if not formulas:
        raise LottoError(f"{path}: no formulas")
    return Listing(
        name=header["Name"],
        size=size,
        wheel_count=wheel_count,
        lookback=lookback,
        formulas=tuple(formulas),
    )


# ------------------------------------------------------------------------ apply


def _isotopic(day: dict[str, list[int]], found: dict[str, tuple[int, ...]]) -> bool:
    """Do two matching wheels hold a search number in the same position?"""
    positions = [
        {day[wheel].index(number) for number in numbers}
        for wheel, numbers in found.items()
    ]
    return any(
        first & second
        for index, first in enumerate(positions)
        for second in positions[index + 1:]
    )


def check_rear(
    draws: DrawSet,
    dates: list[datetime.date],
    index: int,
    bet: Bet,
    wheels: tuple[str, ...],
    lookback: int,
    scope: str = DEFAULT_SCOPE,
) -> tuple[CheckedBet, ...]:
    """Look for ``bet``'s numbers over the ``lookback`` draws before ``dates[index]``.

    ``scope`` chooses which wheels are searched -- see :data:`SCOPES`. ``strict`` and
    ``medium`` return one verdict for the whole bet; ``loose`` returns one per wheel of
    the match, since a bet it burns on one wheel is still clean on the others.

    The most recent draw is searched first, so a burnt bet is reported where it was most
    recently seen. A bet is clean only when none of its numbers turns up at all.
    """
    if scope not in SCOPES:
        raise LottoError(f"unknown scope {scope!r}, expected one of {', '.join(SCOPES)}")
    groups = [(wheel,) for wheel in wheels] if scope == "loose" else [wheels]
    return tuple(
        _check_one(draws, dates, index, bet, group, lookback, scope) for group in groups
    )


def _check_one(
    draws: DrawSet,
    dates: list[datetime.date],
    index: int,
    bet: Bet,
    play: tuple[str, ...],
    lookback: int,
    scope: str,
) -> CheckedBet:
    for day in reversed(dates[max(0, index - lookback):index]):
        # Under strict the whole draw is searched, so a wheel that had nothing to do
        # with the match can still burn the bet.
        searched = tuple(draws[day]) if scope == "strict" else play
        for wheel in searched:
            row = draws[day].get(wheel, ())
            for number in bet.numbers:
                if number in row:
                    return CheckedBet(
                        bet=bet,
                        clean=False,
                        play=play,
                        seen_number=number,
                        seen_wheel=wheel,
                        seen_date=day,
                        seen_position=list(row).index(number) + 1,
                    )
    return CheckedBet(bet=bet, clean=True, play=play)


def outcome_of(
    draws: DrawSet,
    dates: list[datetime.date],
    index: int,
    bet: Bet,
    play: tuple[str, ...],
    colpi: int,
    on: str = DEFAULT_PLAY,
) -> Outcome:
    """Look for ``bet`` whole on one wheel over the ``colpi`` draws after ``dates[index]``.

    ``play`` is the wheels the bet is played on and ``on`` how far past them to look --
    see :data:`PLAYS`. The whole window is walked even after a win, to count its rows.
    """
    if on not in PLAYS:
        raise LottoError(f"unknown play {on!r}, expected one of {', '.join(PLAYS)}")
    wheels = [
        wheel
        for wheel in WHEELS
        if wheel in play or on == "nazionale" or (on == "tutte" and wheel != "nazionale")
    ]
    window = dates[index + 1:index + 1 + colpi]
    rows = 0
    won = None
    for colpo, day in enumerate(window, start=1):
        hit = []
        for wheel in wheels:
            row = draws[day].get(wheel)
            if not row:
                continue
            rows += 1
            if all(number in row for number in bet.numbers):
                hit.append(wheel)
        if hit and won is None:
            won = (colpo, day, tuple(hit))
    if won:
        return Outcome("won", len(window), rows, *won)
    return Outcome("lost" if len(window) == colpi else "open", len(window), rows)


def apply(
    draws: DrawSet,
    date: datetime.date,
    listing: Listing,
    *,
    clean_only: bool = False,
    scope: str = DEFAULT_SCOPE,
    colpi: int = 0,
    play: str = DEFAULT_PLAY,
) -> ListingReport:
    """Run every formula of ``listing`` against the draw of ``date``.

    ``clean_only`` keeps just the matches the retrovisione left untouched -- every bet
    still playable, none of their numbers already out on the matching wheels. It is a
    filter on the report, not a different rule: a match it drops is still a match.

    With ``colpi``, every bet also carries its :class:`Outcome` over that many draws
    after ``date``, looked for on the ``play`` wheels -- see :data:`PLAYS`. A burnt bet
    gets one too: what to do with it is the reader's call.
    """
    dates = sorted(draws)
    try:
        index = dates.index(date)
    except ValueError:
        raise LottoError(f"no draw on {iso(date)}") from None

    day = draws[date]
    holders = wheels_by_number(day)
    if scope not in SCOPES:
        raise LottoError(f"unknown scope {scope!r}, expected one of {', '.join(SCOPES)}")
    report = ListingReport(
        date=date, listing=listing, history=index, clean_only=clean_only, scope=scope
    )
    if index < listing.lookback:
        return report

    matches: list[Match] = []
    for formula in listing.formulas:
        # A search number on two wheels makes the play dirty, and one that did not come
        # out at all ends it: either way the formula does not match this draw.
        wheels_of = [holders.get(number, ()) for number in formula.numbers]
        if any(len(wheels) != 1 for wheels in wheels_of):
            continue
        wheels = tuple(
            sorted({wheels[0] for wheels in wheels_of}, key=WHEELS.index)
        )
        if len(wheels) != listing.wheel_count:
            continue

        found = {
            wheel: tuple(
                number
                for number, holder in zip(formula.numbers, wheels_of)
                if holder[0] == wheel
            )
            for wheel in wheels
        }
        matches.append(
            Match(
                formula=formula,
                wheels=wheels,
                found=found,
                isotopic=_isotopic(day, found),
                bets=tuple(
                    replace(
                        checked,
                        outcome=outcome_of(
                            draws, dates, index, bet, checked.play, colpi, play
                        ),
                    )
                    if colpi
                    else checked
                    for bet in formula.bets
                    for checked in check_rear(
                        draws, dates, index, bet, wheels, listing.lookback, scope
                    )
                ),
            )
        )
    if clean_only:
        matches = [match for match in matches if match.all_clean]
    return ListingReport(
        date=date,
        listing=listing,
        history=index,
        matches=tuple(matches),
        clean_only=clean_only,
        scope=scope,
    )


# ------------------------------------------------------------------------- json


def to_json(listing: Listing, *, source: str | None = None) -> dict:
    """The listing as the JSON document :func:`read` accepts back.

    It is the same information a ``.frm`` holds, with the header spelled out and the
    bets already split into their five lists. ``source`` records the file it was
    converted from, for tracing a formula back to where it was written.
    """
    payload = listing.as_dict()
    head = {"name": payload.pop("name")}
    if source is not None:
        head["source"] = source
    formulas = payload.pop("formulas")
    return {**head, **payload, "formula_count": len(listing.formulas), "formulas": formulas}


def from_json(payload: dict, *, where: str = "listing") -> Listing:
    """Read a listing back from its JSON form, checking what the format promises."""
    if not isinstance(payload, dict):
        raise LottoError(f"{where}: not a JSON object")
    for key in ("name", "size", "wheels", "lookback", "formulas"):
        if key not in payload:
            raise LottoError(f"{where}: missing {key!r}")

    if not isinstance(payload["formulas"], list):
        raise LottoError(f"{where}: 'formulas' is not a list")

    formulas: list[Formula] = []
    for offset, entry in enumerate(payload["formulas"], start=1):
        spot = f"{where}: formula {offset}"
        if not isinstance(entry, dict):
            raise LottoError(f"{spot}: not a JSON object")
        numbers = _checked(entry.get("numbers", ()), spot)
        index = entry.get("index", offset)
        if not isinstance(index, int) or isinstance(index, bool):
            raise LottoError(f"{spot}: 'index' is not a whole number")
        played_by_name = entry.get("bets") or {}
        if not isinstance(played_by_name, dict):
            raise LottoError(f"{spot}: 'bets' is not a JSON object")
        bets: list[Bet] = []
        for name, played in played_by_name.items():
            if name not in BET_ORDER:
                raise LottoError(f"{spot}: {name!r} is not a bet")
            if not isinstance(played, list):
                raise LottoError(f"{spot}: {name!r} is not a list of bets")
            for group in played:
                numbers_of = _checked(group, spot)
                if BET_NAMES.get(len(numbers_of)) != name:
                    raise LottoError(
                        f"{spot}: {len(numbers_of)} numbers is not {'an' if name[0] in 'ae' else 'a'} {name}"
                    )
                bets.append(Bet(numbers_of))
        formulas.append(
            Formula(
                numbers=numbers,
                bets=tuple(bets),
                index=index,
            )
        )
    if not formulas:
        raise LottoError(f"{where}: no formulas")

    try:
        return Listing(
            name=str(payload["name"]),
            size=int(payload["size"]),
            wheel_count=int(payload["wheels"]),
            lookback=int(payload["lookback"]),
            formulas=tuple(formulas),
        )
    except (TypeError, ValueError) as error:
        raise LottoError(f"{where}: bad header value ({error})") from None


def read(path: Path) -> Listing:
    """Read a listing from either form: ``.json`` by its keys, anything else as .frm."""
    if path.suffix.lower() == ".json":
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as error:
            raise LottoError(f"{path}: not valid JSON ({error})") from None
        return from_json(payload, where=str(path))
    return parse(path)


def scan(
    draws: DrawSet,
    listing: Listing,
    *,
    since: datetime.date | None = None,
    until: datetime.date | None = None,
    clean_only: bool = False,
    scope: str = DEFAULT_SCOPE,
    colpi: int = 0,
    play: str = DEFAULT_PLAY,
) -> list[ListingReport]:
    """Every draw of the range that at least one formula matched, oldest first.

    With ``clean_only``, a draw whose every match was burnt by the retrovisione counts
    as no match at all and is left out.
    """
    return [
        report
        for day in sorted(draws)
        if (since is None or day >= since) and (until is None or day <= until)
        for report in (
            apply(
                draws, day, listing,
                clean_only=clean_only, scope=scope, colpi=colpi, play=play,
            ),
        )
        if report.satisfied
    ]
