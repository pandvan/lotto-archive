import datetime
import json

from lotto import archive
from lotto.validate import Report, check_draws, validate_tree

TODAY = datetime.date(2026, 9, 30)
DAY = datetime.date(2026, 9, 26)


def report_for(draws):
    report = Report()
    check_draws(draws, report, today=TODAY)
    return report


def full_wheels(numbers=(1, 2, 3, 4, 5)):
    from lotto.model import WHEELS

    return {wheel: list(numbers) for wheel in WHEELS}


def test_a_complete_draw_passes_cleanly():
    assert report_for({DAY: full_wheels()}).ok
    assert report_for({DAY: full_wheels()}).warnings == []


def test_rejects_a_future_draw():
    future = datetime.date(2027, 1, 1)
    assert "in the future" in " ".join(report_for({future: full_wheels()}).errors)


def test_rejects_a_draw_before_the_archive_begins():
    old = datetime.date(1938, 1, 1)
    assert "predates" in " ".join(report_for({old: full_wheels()}).errors)


def test_rejects_the_wrong_number_of_numbers():
    draws = {DAY: full_wheels() | {"bari": [1, 2, 3]}}
    assert "3 numbers, expected 5" in " ".join(report_for(draws).errors)


def test_rejects_an_out_of_range_number():
    draws = {DAY: full_wheels() | {"bari": [1, 2, 3, 4, 91]}}
    assert "out-of-range" in " ".join(report_for(draws).errors)


def test_rejects_a_repeated_number_within_a_wheel():
    draws = {DAY: full_wheels() | {"bari": [1, 1, 2, 3, 4]}}
    assert "repeated number" in " ".join(report_for(draws).errors)


def test_rejects_an_unknown_wheel():
    draws = {DAY: full_wheels() | {"atlantide": [1, 2, 3, 4, 5]}}
    assert "unknown wheel" in " ".join(report_for(draws).errors)


def test_a_missing_modern_wheel_is_a_warning_not_an_error():
    draws = {DAY: {k: v for k, v in full_wheels().items() if k != "nazionale"}}
    result = report_for(draws)
    assert result.ok
    assert "missing expected wheel(s) ['nazionale']" in " ".join(result.warnings)


def test_a_pre_1939_07_draw_without_cagliari_is_not_even_a_warning():
    early = datetime.date(1939, 1, 7)
    draws = {early: {k: v for k, v in full_wheels().items() if k not in {"cagliari", "genova", "nazionale"}}}
    assert report_for(draws).warnings == []


def test_validate_tree_accepts_what_the_writer_produces(tmp_path):
    archive.write(tmp_path, {DAY: full_wheels()}, generated_at="2026-09-30T00:00:00Z", sources={})
    assert validate_tree(tmp_path, today=TODAY).ok


def test_validate_tree_catches_a_hand_edited_contest_number(tmp_path):
    archive.write(tmp_path, {DAY: full_wheels()}, generated_at="2026-09-30T00:00:00Z", sources={})
    path = tmp_path / "data" / "2026.json"
    payload = json.loads(path.read_text())
    payload["draws"][0]["contest"] = 99
    path.write_text(json.dumps(payload, indent=2))

    errors = " ".join(validate_tree(tmp_path, today=TODAY).errors)
    assert "contest 99, expected 1" in errors


def test_validate_tree_catches_an_index_that_no_longer_matches(tmp_path):
    archive.write(tmp_path, {DAY: full_wheels()}, generated_at="2026-09-30T00:00:00Z", sources={})
    path = tmp_path / "index.json"
    index = json.loads(path.read_text())
    index["draw_count"] = 999
    path.write_text(json.dumps(index, indent=2))

    assert "draw_count is 999" in " ".join(validate_tree(tmp_path, today=TODAY).errors)
