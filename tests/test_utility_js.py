"""The listing builder's checks catch what a hand-typed listing gets wrong."""

import json
import shutil
import subprocess

import pytest

from conftest import REPO_ROOT
from lotto import listing

NODE = shutil.which("node")

RUNNER = """
const formula = require(process.argv[1]);
global.BET_ORDER = formula.BET_ORDER;
const { checkListing, buildListing } = require(process.argv[2]);
const typed = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const errors = checkListing(typed);
console.log(JSON.stringify({ errors, built: errors.length ? null : buildListing(typed) }));
"""


def run(typed):
    out = subprocess.run(
        [NODE, "-e", RUNNER, str(REPO_ROOT / "web/formula.js"), str(REPO_ROOT / "web/utility.js")],
        input=json.dumps(typed), capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def typed(**changes):
    base = {
        "name": "prova", "size": "3", "wheels": "2", "lookback": "",
        "formulas": [{"numbers": "23 45 68", "bets": [
            {"kind": None, "text": "7"},
            {"kind": None, "text": "23 45"},
            {"kind": "ambo", "text": "23 , 68"},
            {"kind": None, "text": "23,45  68"},
        ]}],
    }
    base.update(changes)
    return base


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_a_good_listing_builds_and_the_python_reads_it():
    result = run(typed())
    assert result["errors"] == []
    built = result["built"]
    assert built["lookback"] == 0
    assert built["formulas"][0]["bets"] == {
        "ambata": [[7]], "ambo": [[23, 45], [23, 68]], "terno": [[23, 45, 68]],
        "quaterna": [], "cinquina": [],
    }
    assert listing.from_json(built).lookback == 0


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("numbers, bets, where", [
    ("23 45 45", [{"kind": None, "text": "7"}], "f0.numbers"),
    ("23 45", [{"kind": None, "text": "7"}], "f0.numbers"),
    ("23 45 91", [{"kind": None, "text": "7"}], "f0.numbers"),
    ("23 45 68", [{"kind": None, "text": "23 23"}], "f0.b0"),
    ("23 45 68", [{"kind": None, "text": "1 2 3 4 5 6"}], "f0.b0"),
    ("23 45 68", [{"kind": "terno", "text": "23 45"}], "f0.b0"),
    ("23 45 68", [{"kind": None, "text": "x"}], "f0.b0"),
    ("23 45 68", [{"kind": None, "text": "-1"}], "f0.b0"),
    ("23 45 68", [{"kind": None, "text": "23-45"}], "f0.b0"),
    ("23 45 68", [{"kind": None, "text": "23,,45"}], "f0.b0"),
    ("23 45 68", [{"kind": None, "text": "23 45,"}], "f0.b0"),
    ("23 45 68", [{"kind": None, "text": "23;45"}], "f0.b0"),
    ("23 45 68", [{"kind": None, "text": "23 x"}, {"kind": None, "text": "23"}], "f0.b0"),
    ("23 45 -68", [{"kind": None, "text": "7"}], "f0.numbers"),
    ("23 45 68", [{"kind": None, "text": "23 45"}, {"kind": None, "text": "45 23"}], "f0.b1"),
    ("23 45 68", [], "f0.bets"),
])
def test_each_mistake_is_flagged_on_its_field(numbers, bets, where):
    result = run(typed(formulas=[{"numbers": numbers, "bets": bets}]))
    assert [error["where"] for error in result["errors"]] == [where]


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_the_name_must_survive_as_a_file_name():
    assert [error["where"] for error in run(typed(name="Più 45"))["errors"]] == ["name"]
    assert run(typed(name="Distanza_45 v1.2-b"))["errors"] == []


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_there_are_no_more_wheels_than_search_numbers():
    assert [error["where"] for error in run(typed(wheels="4"))["errors"]] == ["wheels"]
    assert run(typed(wheels="3"))["errors"] == []


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_the_header_is_checked():
    result = run(typed(name=" ", size="6", wheels="0", lookback="-1", formulas=[]))
    assert {error["where"] for error in result["errors"]} == {
        "name", "size", "wheels", "lookback", "formulas",
    }
