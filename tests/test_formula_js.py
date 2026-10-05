"""The browser port of the formula rule must agree with the Python one."""

import datetime
import json
import random
import shutil
import subprocess

import pytest

from conftest import REPO_ROOT
from lotto import listing
from lotto.model import WHEELS, iso

NODE = shutil.which("node")

RUNNER = """
const { readListing, scanListing } = require(process.argv[1]);
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(JSON.stringify(scanListing(
  input.draws, readListing(input.listing), input.since, input.colpi, input.play)));
"""


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("play", listing.PLAYS)
def test_the_js_port_finds_what_the_python_finds(play):
    rng = random.Random(0)
    start = datetime.date(2026, 1, 1)
    draws = {
        start + datetime.timedelta(days=n): {
            wheel: rng.sample(range(1, 91), 5) for wheel in WHEELS
        }
        for n in range(60)
    }
    payload = {
        "name": "parity",
        "size": 2,
        "wheels": 2,
        "lookback": 3,
        "formulas": [
            {
                "numbers": rng.sample(range(1, 91), 2),
                "bets": {
                    # Out of order on purpose: both sides must sort the kinds.
                    "ambo": [rng.sample(range(1, 91), 2)],
                    "ambata": [[rng.randint(1, 90)], [rng.randint(1, 90)]],
                },
            }
            for _ in range(300)
        ],
    }
    since = start + datetime.timedelta(days=10)

    expected = [
        {"date": iso(report.date), **match.as_dict()}
        for report in listing.scan(
            draws, listing.from_json(payload), since=since, colpi=5, play=play
        )
        for match in report.matches
    ]
    # The sample has to exercise every branch, or agreeing on it proves nothing.
    assert any(match["isotopic"] for match in expected)
    assert any(not match["isotopic"] for match in expected)
    bets = [bet for match in expected for kind in match["bets"].values() for bet in kind]
    assert any(bet["clean"] for bet in bets) and any(not bet["clean"] for bet in bets)
    assert {bet["outcome"]["state"] for bet in bets} == {"won", "lost", "open"}

    done = subprocess.run(
        [NODE, "-e", RUNNER, str(REPO_ROOT / "web" / "formula.js")],
        input=json.dumps(
            {
                "draws": [
                    {"date": iso(date), "wheels": wheels} for date, wheels in draws.items()
                ],
                "listing": payload,
                "since": iso(since),
                "colpi": 5,
                "play": play,
            }
        ),
        capture_output=True,
        text=True,
        check=True,
    )
    assert json.loads(done.stdout) == expected
