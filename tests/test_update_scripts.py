"""The two jobs that write the archive, run end to end with the network stubbed out."""

import datetime
import sys

import pytest
import requests
from fixtures.dbf import build

import reconcile
import update
from lotto import archive, sources
from lotto.model import WHEELS, LottoError
from lotto.parse_dbf import DBF_WHEEL_CODES

TUE, THU, FRI = (datetime.date(2026, 9, day) for day in (22, 24, 25))
#: Saturday morning: Friday's draw is due since 06:00, well inside the grace period.
NOW = "2026-09-26T08:00:00"
NUMBERS = [1, 2, 3, 4, 5]
ROW = {wheel: NUMBERS for wheel in WHEELS}


def store(root, *days):
    archive.write(root, {day: ROW for day in days}, generated_at="2026-09-26T00:00:00Z", sources={})


def run(module, monkeypatch, *argv):
    monkeypatch.setattr(sys, "argv", [module.__name__, *argv])
    return module.main()


# -------------------------------------------------------------------- reconcile


def test_a_repair_that_settles_everything_ends_clean(tmp_path, monkeypatch):
    store(tmp_path, TUE, FRI)
    # The fallback also holds Thursday, so the archive numbers Friday one contest short.
    dbf = tmp_path / "estratti.dbf"
    dbf.write_bytes(
        build([(day, n, {code: NUMBERS for code in DBF_WHEEL_CODES})
               for n, day in enumerate((TUE, THU, FRI), start=1)])
    )
    args = ("--root", str(tmp_path), "--fallback-file", str(dbf))

    assert run(reconcile, monkeypatch, *args) == 1
    assert run(reconcile, monkeypatch, *args, "--repair") == 0
    assert THU in archive.load(tmp_path)


# ----------------------------------------------------------------------- update


def stub_primary(monkeypatch):
    unchanged = sources.Fetched(sources.PRIMARY_URL, 304, None, None, None)
    monkeypatch.setattr(sources, "fetch_primary", lambda session, **_: (unchanged, None))


def test_an_unreachable_fallback_does_not_abort_the_update(tmp_path, monkeypatch):
    store(tmp_path, TUE, THU)
    stub_primary(monkeypatch)

    def down(session):
        raise LottoError("fallback: HTTP 503")

    monkeypatch.setattr(sources, "fetch_fallback", down)
    assert run(update, monkeypatch, "--root", str(tmp_path), "--now", NOW) == 0


def test_the_fallback_supplies_new_draws_and_leaves_history_to_the_reconcile(tmp_path, monkeypatch):
    store(tmp_path, TUE, THU)
    stub_primary(monkeypatch)
    fetched = sources.Fetched(sources.FALLBACK_URL, 200, b"", None, None)
    monkeypatch.setattr(sources, "fetch_fallback", lambda session: (fetched, b""))
    # Tuesday disagrees with what is published; Friday is the draw the primary lacks.
    fallback = {TUE: {wheel: [9, 8, 7, 6, 5] for wheel in WHEELS}, FRI: ROW}
    monkeypatch.setattr(update.parse_dbf, "parse", lambda raw: (fallback, {}))

    assert run(update, monkeypatch, "--root", str(tmp_path), "--now", NOW) == 0
    stored = archive.load(tmp_path)
    assert FRI in stored
    assert stored[TUE]["bari"] == NUMBERS


def test_a_network_failure_is_reported_as_a_lotto_error():
    class Offline:
        def get(self, *args, **kwargs):
            raise requests.ConnectionError("no route to host")

    with pytest.raises(LottoError, match="no route to host"):
        sources.fetch(Offline(), sources.FALLBACK_URL)
