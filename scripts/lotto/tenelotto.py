"""The 10eLotto draw tied to Lotto, derived from the Lotto draw of the same evening.

Nothing here is downloaded. The 20 numbers, the gold numbers and the extra numbers are
a pure function of what the ten city wheels (and, rarely, Nazionale) drew.
"""

from __future__ import annotations

import datetime
import re

from .archive import ALL_FILE, ALL_MIN_FILE, LATEST_FILE, render_json, render_json_min
from .model import WHEELS, DrawSet, LottoError, contest_numbers, iso

DATA_DIR = "data/10elotto"

#: The game starts here; the first draw is the day after.
START = datetime.date(2009, 6, 10)
#: First draw that carries each optional field. Before it the key is absent.
FIELD_START = {
    "gold": datetime.date(2014, 6, 26),
    "double_gold": datetime.date(2017, 10, 3),
    "extra": datetime.date(2021, 10, 21),
}

TIED_WHEELS = tuple(wheel for wheel in WHEELS if wheel != "nazionale")
NUMBERS = 20
EXTRA = 15


def derive(day: datetime.date, wheels: dict[str, list[int]]) -> dict | None:
    """The 10eLotto fields for one Lotto draw, or ``None`` while a tied wheel is missing.

    Walk the first two numbers of every wheel, then the third of every wheel, the
    fourth, the fifth, and last Nazionale, dropping numbers already seen. The first 20
    are the draw, the next 15 the extra numbers.
    """
    if any(wheel not in wheels for wheel in TIED_WHEELS):
        return None
    rows = [wheels[wheel] for wheel in TIED_WHEELS]
    walk = [number for row in rows for number in row[:2]]
    walk += [row[column] for column in (2, 3, 4) for row in rows]
    walk += wheels.get("nazionale", [])
    distinct = list(dict.fromkeys(walk))

    fields = {
        "numbers": sorted(distinct[:NUMBERS]),
        "gold": rows[0][0],
        "double_gold": rows[0][1],
        "extra": sorted(distinct[NUMBERS : NUMBERS + EXTRA]),
    }
    record = {
        key: value
        for key, value in fields.items()
        if key not in FIELD_START or day >= FIELD_START[key]
    }
    needed = NUMBERS + EXTRA if "extra" in record else NUMBERS
    if len(distinct) < needed:
        raise LottoError(f"{iso(day)}: only {len(distinct)} distinct numbers, {needed} needed")
    return record


def build(draws: DrawSet) -> tuple[list[dict], list[str]]:
    """Every record from ``START`` on, oldest first, plus the draws that failed to derive."""
    # The contest is the Lotto one, so it is numbered over every Lotto draw of the year.
    contests = contest_numbers(list(draws))
    records: list[dict] = []
    errors: list[str] = []
    for day in sorted(day for day in draws if day >= START):
        try:
            fields = derive(day, draws[day])
        except LottoError as exc:
            errors.append(str(exc))
            continue
        if fields is not None:
            records.append({"date": iso(day), "contest": contests[day], **fields})
    return records, errors


def render(records: list[dict]) -> dict[str, str]:
    """File name -> content of everything under ``data/10elotto/``."""
    if not records:
        return {}
    files: dict[str, str] = {}
    for year in sorted({record["date"][:4] for record in records}):
        files[f"{year}.json"] = render_json(_payload(records, year))
    combined = _payload(records)
    files[ALL_FILE] = render_json(combined)
    files[ALL_MIN_FILE] = render_json_min(combined)
    files[LATEST_FILE] = render_json(records[-1])
    return files


def _payload(records: list[dict], year: str | None = None) -> dict:
    draws = [r for r in records if year is None or r["date"].startswith(year)]
    head = {} if year is None else {"year": int(year)}
    return {
        **head,
        "draw_count": len(draws),
        "first_date": draws[0]["date"],
        "last_date": draws[-1]["date"],
        "draws": draws,
    }


# ---------------------------------------------------------------------------- ADM

#: Results page of ADM, the regulator, keyed by year and contest. It serves 2024 onward.
ADM_URL = (
    "https://www.adm.gov.it/portale/monopoli/giochi/gioco-del-lotto/10lotto/estrazioni_10elotto"
    "?p_p_id=it_sogei_wda_web_portlet_WebDisplayAamsPortlet&p_p_lifecycle=2&p_p_state=normal"
    "&p_p_mode=view&p_p_cacheability=cacheLevelPage"
    "&_it_sogei_wda_web_portlet_WebDisplayAamsPortlet_anno={year}"
    "&_it_sogei_wda_web_portlet_WebDisplayAamsPortlet_prog={contest}"
)
_ADM_TITLE_RE = re.compile(r"<h3>Estrazione 10eLotto n\D+(\d+) del (\d\d)/(\d\d)/(\d{4})</h3>")
_ADM_VALUE_RE = re.compile(r"<p>\s*(\d+)\s*</p>")
#: Start of each ``<h4>`` heading -> (record key, how many values, which one to keep).
_ADM_BLOCKS = {
    "Numero Oro": ("gold", 1, 0),
    "Doppio Oro": ("double_gold", 2, 1),
    "Extra": ("extra", EXTRA, None),
}


def parse_adm(html: str) -> dict | None:
    """The record ADM publishes, or ``None`` when it has no such draw yet."""
    if "Non ci sono estrazioni" in html:
        return None
    # The search form after the results has <p> elements of its own.
    head, *blocks = html.split("boxEvidenza")[0].split("<h4>")
    title = _ADM_TITLE_RE.search(head)
    numbers = [int(n) for n in _ADM_VALUE_RE.findall(head)]
    if not title or len(numbers) != NUMBERS:
        raise LottoError("ADM page not understood: no title or not 20 numbers")
    contest, day, month, year = title.groups()
    record: dict = {"date": f"{year}-{month}-{day}", "contest": int(contest), "numbers": sorted(numbers)}
    for block in blocks:
        match = next((v for k, v in _ADM_BLOCKS.items() if block.startswith(k)), None)
        values = [int(n) for n in _ADM_VALUE_RE.findall(block)]
        if match is None or len(values) != match[1]:
            raise LottoError(f"ADM page not understood: {block[:40]!r}")
        key, _count, keep = match
        record[key] = sorted(values) if keep is None else values[keep]
    return record
