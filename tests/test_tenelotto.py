"""The 10eLotto derivation, checked against official results."""

import datetime
import json
import sys

import pytest

import tenelotto as cli
from lotto import archive
from lotto.model import LottoError
from lotto.tenelotto import FIELD_START, TIED_WHEELS, build, derive, render

#: Lotto draw of 2026-10-10; the 10eLotto values below come from the official API.
OCT_10 = datetime.date(2026, 10, 10)
OCT_10_WHEELS = {
    "bari": [16, 38, 53, 21, 55],
    "cagliari": [21, 66, 30, 55, 62],
    "firenze": [30, 75, 23, 10, 68],
    "genova": [68, 31, 16, 64, 63],
    "milano": [20, 5, 11, 17, 64],
    "napoli": [30, 74, 82, 78, 77],
    "palermo": [17, 15, 50, 80, 44],
    "roma": [5, 32, 59, 39, 66],
    "torino": [31, 59, 56, 29, 20],
    "venezia": [11, 66, 7, 61, 88],
    "nazionale": [18, 52, 1, 28, 13],
}
#: Lotto draw of 2026-02-20: the ten wheels give 32 distinct numbers.
FEB_20 = datetime.date(2026, 2, 20)
FEB_20_WHEELS = {
    "bari": [71, 19, 24, 7, 58],
    "cagliari": [88, 71, 64, 85, 87],
    "firenze": [72, 52, 40, 85, 57],
    "genova": [50, 27, 14, 18, 26],
    "milano": [31, 56, 50, 53, 58],
    "napoli": [6, 7, 54, 3, 72],
    "palermo": [67, 50, 70, 78, 57],
    "roma": [19, 70, 29, 6, 61],
    "torino": [38, 3, 6, 20, 19],
    "venezia": [57, 52, 78, 66, 7],
    "nazionale": [63, 53, 25, 24, 15],
}


def test_derive_equals_the_official_draw():
    assert derive(OCT_10, OCT_10_WHEELS) == {
        "numbers": [5, 11, 15, 16, 17, 20, 21, 23, 30, 31, 32, 38, 50, 53, 59, 66, 68, 74, 75, 82],
        "gold": 16,
        "double_gold": 38,
        "extra": [7, 10, 29, 39, 44, 55, 56, 61, 62, 63, 64, 77, 78, 80, 88],
    }


def test_extra_continues_on_nazionale_in_draw_order():
    record = derive(FEB_20, FEB_20_WHEELS)
    assert len(record["extra"]) == 15
    # Nazionale drew 63, 53, 25, 24, 15; 53 and 24 are already out on a city wheel.
    assert record["extra"] == [15, 18, 20, 25, 26, 29, 53, 54, 58, 61, 63, 66, 78, 85, 87]


def test_too_few_distinct_numbers_raise():
    wheels = {**FEB_20_WHEELS, "nazionale": [71, 19, 24, 7, 58]}
    with pytest.raises(LottoError, match="32 distinct"):
        derive(FEB_20, wheels)
    # Before the extra numbers existed, 20 are enough.
    assert "extra" not in derive(datetime.date(2021, 10, 19), wheels)


def test_a_missing_tied_wheel_gives_no_record():
    wheels = {k: v for k, v in OCT_10_WHEELS.items() if k != "torino"}
    assert derive(OCT_10, wheels) is None


@pytest.mark.parametrize("key", FIELD_START)
def test_a_field_is_absent_before_its_first_draw(key):
    first = FIELD_START[key]
    assert key in derive(first, OCT_10_WHEELS)
    assert key not in derive(first - datetime.timedelta(days=1), OCT_10_WHEELS)


def test_build_starts_in_2009_and_keeps_the_lotto_contest():
    days = [datetime.date(2009, 6, 9), datetime.date(2009, 6, 11), datetime.date(2009, 6, 13)]
    records, errors = build({day: OCT_10_WHEELS for day in days})
    assert errors == []
    assert [(r["date"], r["contest"]) for r in records] == [("2009-06-11", 2), ("2009-06-13", 3)]
    assert list(records[0]) == ["date", "contest", "numbers"]


def test_build_skips_and_reports_a_draw_that_cannot_be_derived():
    bad = {**FEB_20_WHEELS, "nazionale": [71, 19, 24, 7, 58]}
    records, errors = build({FEB_20: bad, OCT_10: OCT_10_WHEELS})
    assert [r["date"] for r in records] == ["2026-10-10"]
    assert len(errors) == 1 and "2026-02-20" in errors[0]


def test_render_of_nothing_is_nothing():
    assert render([]) == {}


def run(monkeypatch, root, *argv):
    monkeypatch.setattr(sys, "argv", ["tenelotto", "--root", str(root), *argv])
    return cli.main()


def test_the_command_writes_then_checks_clean(tmp_path, monkeypatch):
    draws = {datetime.date(2025, 12, 30): FEB_20_WHEELS, OCT_10: OCT_10_WHEELS}
    archive.write(tmp_path, draws, generated_at="2026-10-13T00:00:00Z", sources={})
    assert run(monkeypatch, tmp_path, "--check") == 1

    assert run(monkeypatch, tmp_path) == 0
    out = tmp_path / "data" / "10elotto"
    assert sorted(p.name for p in out.iterdir()) == [
        "2025.json", "2026.json", "all.json", "all.min.json", "latest.json",
    ]
    assert json.loads((out / "latest.json").read_text())["gold"] == 16
    assert json.loads((out / "all.min.json").read_text())["draw_count"] == 2
    assert json.loads((out / "2026.json").read_text())["year"] == 2026
    assert run(monkeypatch, tmp_path, "--check") == 0

    # A hand edit and a stray file are both caught, and the next write repairs them.
    (out / "latest.json").write_text("{}\n")
    (out / "1999.json").write_text("{}\n")
    assert run(monkeypatch, tmp_path, "--check") == 1
    assert run(monkeypatch, tmp_path) == 0
    assert not (out / "1999.json").exists()
    assert run(monkeypatch, tmp_path, "--check") == 0


def test_the_command_writes_nothing_without_tied_wheels(tmp_path, monkeypatch):
    archive.write(tmp_path, {OCT_10: {"bari": [1, 2, 3, 4, 5]}}, generated_at="x", sources={})
    assert run(monkeypatch, tmp_path) == 0
    assert run(monkeypatch, tmp_path, "--check") == 0


def test_tied_wheels_leave_out_nazionale():
    assert len(TIED_WHEELS) == 10 and "nazionale" not in TIED_WHEELS
