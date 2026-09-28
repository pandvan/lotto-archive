import datetime
import json

from lotto import archive
from lotto.model import WHEELS

D1 = datetime.date(2026, 1, 2)
D2 = datetime.date(2026, 1, 3)
D3 = datetime.date(2025, 12, 30)


def draw(*numbers):
    return {"bari": list(numbers)}


def write_sample(root, draws):
    return archive.write(root, draws, generated_at="2026-01-04T00:00:00Z", sources={})


def test_number_arrays_stay_on_one_line():
    text = archive.render_json({"wheels": {"bari": [1, 2, 3, 4, 5]}})
    assert '"bari": [1, 2, 3, 4, 5]' in text
    assert text.endswith("\n")


def test_object_arrays_are_still_expanded():
    text = archive.render_json({"years": [{"year": 2026}]})
    assert '"year": 2026' in text
    assert "[\n" in text


def test_write_then_load_round_trips(tmp_path):
    draws = {D1: draw(1, 2, 3, 4, 5), D2: draw(6, 7, 8, 9, 10), D3: draw(11, 12, 13, 14, 15)}
    write_sample(tmp_path, draws)
    assert archive.load(tmp_path) == draws


def test_contest_numbers_restart_each_year(tmp_path):
    write_sample(tmp_path, {D1: draw(1, 2, 3, 4, 5), D2: draw(6, 7, 8, 9, 10), D3: draw(11, 12, 13, 14, 15)})
    year_2026 = json.loads((tmp_path / "data" / "2026.json").read_text())
    year_2025 = json.loads((tmp_path / "data" / "2025.json").read_text())
    assert [d["contest"] for d in year_2026["draws"]] == [1, 2]
    assert [d["contest"] for d in year_2025["draws"]] == [1]


def test_wheels_are_written_in_canonical_order(tmp_path):
    scrambled = {"nazionale": [1, 2, 3, 4, 5], "bari": [6, 7, 8, 9, 10], "milano": [11, 12, 13, 14, 15]}
    write_sample(tmp_path, {D1: scrambled})
    payload = json.loads((tmp_path / "data" / "2026.json").read_text())
    written = list(payload["draws"][0]["wheels"])
    assert written == [w for w in WHEELS if w in scrambled]


def test_only_files_whose_content_changed_are_rewritten(tmp_path):
    draws = {D1: draw(1, 2, 3, 4, 5)}
    write_sample(tmp_path, draws)
    assert write_sample(tmp_path, draws) == []


def test_the_index_is_not_rewritten_when_nothing_changed(tmp_path):
    draws = {D1: draw(1, 2, 3, 4, 5)}
    write_sample(tmp_path, draws)
    before = (tmp_path / "index.json").read_text()
    # A later run with a new timestamp must not churn the file, or the update job
    # would commit every single day.
    archive.write(tmp_path, draws, generated_at="2030-01-01T00:00:00Z", sources={})
    assert (tmp_path / "index.json").read_text() == before


def test_the_index_is_refreshed_when_data_changes(tmp_path):
    write_sample(tmp_path, {D1: draw(1, 2, 3, 4, 5)})
    archive.write(
        tmp_path,
        {D1: draw(1, 2, 3, 4, 5), D2: draw(6, 7, 8, 9, 10)},
        generated_at="2030-01-01T00:00:00Z",
        sources={},
    )
    index = json.loads((tmp_path / "index.json").read_text())
    assert index["generated_at"] == "2030-01-01T00:00:00Z"
    assert index["draw_count"] == 2


def test_merge_adds_new_rows_without_touching_the_originals():
    base = {D1: draw(1, 2, 3, 4, 5)}
    result = archive.merge(base, {D2: draw(6, 7, 8, 9, 10)})
    assert result.added_dates == [D2]
    assert result.added_rows == 1
    assert not result.conflicts
    assert base == {D1: draw(1, 2, 3, 4, 5)}   # untouched


def test_merge_reports_a_changed_published_row_instead_of_overwriting_it():
    base = {D1: draw(1, 2, 3, 4, 5)}
    result = archive.merge(base, {D1: draw(9, 9, 9, 9, 9)})
    assert len(result.conflicts) == 1
    assert result.conflicts[0].stored == [1, 2, 3, 4, 5]
    assert result.conflicts[0].incoming == [9, 9, 9, 9, 9]
    assert result.draws[D1]["bari"] == [1, 2, 3, 4, 5]


def test_merge_fills_a_wheel_missing_from_an_existing_date():
    base = {D1: {"bari": [1, 2, 3, 4, 5]}}
    result = archive.merge(base, {D1: {"bari": [1, 2, 3, 4, 5], "roma": [6, 7, 8, 9, 10]}})
    assert result.added_dates == []
    assert result.added_rows == 1
    assert result.draws[D1]["roma"] == [6, 7, 8, 9, 10]
