# Italian Lotto archive

Every Italian Lotto draw since **7 January 1939**, as plain JSON, updated automatically
by a GitHub Action.

```
7,397 draws · 77,242 wheel results · 1939-01-07 → 2026-10-08
```

## Layout

| Path | What it is |
|---|---|
| `data/<year>.json` | One file per calendar year — the source of truth |
| `data/all.json` | Every draw in one file, indented |
| `data/all.min.json` | Every draw in one file, minified |
| `data/latest.json` | The most recent draw only |
| `index.json` | Coverage, per-year counts, and upstream source state |
| `schema/` | JSON Schema for a draw, a year file, and a formula listing |

## Format

```json
{
  "date": "2026-09-26",
  "contest": 155,
  "wheels": {
    "bari": [22, 29, 63, 55, 38],
    "cagliari": [2, 71, 47, 42, 75],
    "firenze": [9, 21, 74, 71, 19],
    "genova": [87, 52, 82, 72, 26],
    "milano": [57, 19, 11, 37, 76],
    "napoli": [72, 78, 31, 37, 7],
    "palermo": [82, 15, 68, 28, 60],
    "roma": [28, 67, 61, 82, 90],
    "torino": [67, 78, 56, 18, 59],
    "venezia": [84, 66, 75, 76, 43],
    "nazionale": [6, 14, 62, 9, 88]
  }
}
```

- **`date`** — draw date (Europe/Rome), ISO 8601.
- **`contest`** — the official *concorso* number: the 1-based index of the draw within its
  calendar year, resetting every January.
- **`wheels`** — the five numbers drawn on each wheel, **in extraction order** (first to
  fifth). Each is an integer from 1 to 90, and the five within a wheel are always distinct.

### Wheels

`bari`, `cagliari`, `firenze`, `genova`, `milano`, `napoli`, `palermo`, `roma`, `torino`,
`venezia`, `nazionale`.

**Only the wheels that actually drew are present**, so always check before indexing:

- Cagliari and Genova begin on **1939-07-08**.
- Nazionale begins on **2005-05-04**.
- Several wartime dates (1943–1946) are missing individual wheels, and a handful of dates
  between 1948 and 1969 carry a single wheel only.
- From 2005-05-04 onwards, every date has all eleven.

### Draw days

Draws are currently held on **Tuesday, Thursday, Friday and Saturday**. This has changed
over the years — three a week until 2025, and Saturday only for much of the 20th century —
so derive the calendar from the data rather than assuming it.

## Using it

```bash
# The latest draw
curl -s https://raw.githubusercontent.com/pandvan/lotto-archive/main/data/latest.json

# Every Bari result in 2026
jq '.draws[] | {date, bari: .wheels.bari}' data/2026.json

# How often has 90 come out on Napoli since 2000?
jq -s 'map(.draws[] | select(.wheels.napoli != null) | .wheels.napoli)
       | flatten | map(select(. == 90)) | length' data/20*.json
```

```python
import json, pathlib

draws = [d for p in sorted(pathlib.Path("data").glob("[0-9]" * 4 + ".json"))
           for d in json.loads(p.read_text())["draws"]]
print(len(draws), draws[-1]["date"])
```

## How it updates

`.github/workflows/update.yml` runs twice a day and is fully idempotent — a run with
nothing to do costs a single conditional HTTP request and commits nothing.

1. Conditionally `GET` the primary source; a `304` means nothing changed.
2. Parse it and merge any new draws into the archive.
3. If the primary still lacks a draw that should already have been published, fetch the
   fallback source and merge that instead.
4. Validate everything, then commit only the files whose content actually changed.

A draw is only considered overdue from **the morning after** it was held: upstream
publication time is not predictable, and a false alarm is worse than noticing late.

`.github/workflows/reconcile.yml` runs weekly. It re-reads the fallback source and compares
every row — and every derived contest number — against what is committed, opening an issue
on any disagreement. Since `contest` is derived from a draw's position within its year, a
missing draw would silently shift every later contest number; this check is what makes that
derivation safe.

### Guarantees

- **History is never rewritten silently.** If an already-published number changes upstream,
  the job refuses to commit and fails loudly. Overriding it takes a deliberate
  `allow_history_rewrite` run.
- **Nothing invalid is ever committed.** Validation runs before the write, not after.

## Sources

| | |
|---|---|
| Primary | [`brightstarlottery.it`](https://www.brightstarlottery.it/STORICO_ESTRAZIONI_LOTTO/storico.zip) — zipped tab-separated text |
| Fallback | [`lottoscientifico.com`](https://www.lottoscientifico.com/archivio/lotto.zip) — zipped dBase III |

Both were compared row by row when this archive was built: they agree on all 77,176
results, and the derived contest numbers match the fallback's own `CONCORSO` field for all
7,391 dates.

This repository is a mirror of third-party data and is not affiliated with the operators of
the Italian Lotto. Its correctness ultimately depends on those upstream sources.

## Statistics site

A static site with the statistics people actually look for — ritardi, frequenze, ambi,
cadenze, figure, decine, numeri spia — is generated from the same JSON and published to
GitHub Pages. Nothing about it is committed: `scripts/build_site.py` rebuilds `site/`
from `data/`, and `.github/workflows/pages.yml` republishes it whenever the archive
moves.

```bash
.venv/bin/python scripts/build_site.py          # writes site/
.venv/bin/python scripts/build_site.py --pretty # readable JSON, for inspecting it
python -m http.server -d site 8000              # then open http://localhost:8000
```

| Path | What it is |
|---|---|
| `web/` | The page itself — hand-written HTML, CSS and JS, no dependencies |
| `web/formula.js` | The formula rule ported to the browser, for the *Formule* tab |
| `scripts/build_site.py` | Copies `web/`, then writes the computed JSON next to it |
| `site/` | Build output: the page plus `data/meta.json`, `data/wheels/<wheel>.json` and `data/draws.json` |

The *Formule* tab takes a listing in the [JSON formula format](#the-json-formula-format),
uploaded from disk and never sent anywhere, and runs it over the last year, the last 5
or 10 years, or the whole archive, optionally hiding the burnt bets (a match goes only when
every bet it had was burnt — `--clean` is stricter and drops a match for one) or keeping
only the *isotopi*. For every formula it lists the matches — which wheel
held which search number, whether they are *isotopi*, every bet and, for a bet the
*retrovisione* burnt, the number, wheel, date and position that burnt it. Clicking a
match opens that draw as a matrix with the numbers highlighted.

It also says how every clean bet **fared**: won when all its numbers came out together
on one wheel of the match within the chosen *colpi* (20 by default), lost, or still
open. *Esito su* widens the search to all ten city wheels, or to those and the
Nazionale. Beside every win rate stands the rate chance alone gives for the same bets
over the same wheels and colpi, and only bets whose colpi have all been drawn enter
either. A ranking compares the formulas, a heatmap shows each one's gap from chance
decade by decade (year by year on a short period) in standard errors, and an opened
formula charts its wins colpo by colpo against the expected ones. `web/formula.js` is a
port of `scripts/lotto/listing.py` at the default `medium` scope, and
`tests/test_formula_js.py` holds the two to the same output (it needs `node`, and skips
without it).

What it computes, per wheel and for the union of all wheels, over the whole archive and
over the last 500 and last 100 draws:

| Statistic | Module |
|---|---|
| Tabellone: delay, frequency, record delay, last seen | `lotto/tabellone.py` |
| Frequency by extraction position | `lotto/stats.py` |
| Pair (*ambo*) rankings, by frequency and by delay | `lotto/stats.py` |
| Cadenza, figura and decina groupings | `lotto/stats.py` |
| Odd/even, high/low and sum-of-five distributions | `lotto/stats.py` |
| Follower (*numero spia*) counts with their standard scores | `lotto/stats.py` |
| Chi-square test of equiprobability | `lotto/stats.py` |
| Coverage: draws per year, per weekday, per wheel | `lotto/stats.py` |

Two rules keep the thing honest, and they are worth stating because this kind of page
usually breaks both:

- **Every observed figure is published next to its reference value** — the frequency
  expected under equiprobability, the hypergeometric expectation for a five-number draw,
  the standard score of a follower count. A frequency without its expectation invites the
  reader to see a pattern in noise.
- **The page says plainly that none of it predicts anything.** Draws are independent; a
  number 150 draws late is exactly as likely as one drawn yesterday. The chi-square tab
  measures whether the archive departs from equiprobability at all. It does not.

The generated JSON uses English keys and carries no prose; every Italian label lives in
`web/app.js`, which is also the only place the lotto vocabulary appears.

## Formulas

A lookup rule over the archive, not a statistic: `scripts/formula.py` runs the **formula
listings** of [lotto-convergence](http://pawz.sartorello.org/lotto-conv.zip) against it.

A formula says which numbers to look for in one draw, and which bets to play when they
are there:

```
Name=Formula numeri ripetuti (2010)
SearchNum=3        numbers to look for
SearchDrm=2        wheels they must be spread over
Rear=13            draws the retrovisione reaches back
14  1 14 # 43 19 # 43 27 # 43 64
^ numeri di ricerca  ^ the bets to play, one per '#'
```

```bash
.venv/bin/python scripts/formula.py --listing formulas/nsla.json          # the latest draw
.venv/bin/python scripts/formula.py --listing frm/allor.integrale.2019.frm --scan --since 2026-01-01
.venv/bin/python scripts/formula.py -s "84 68 # 15 19 # 60" -z 3          # one formula, typed out
```

```
2026-09-26  concorso 155 — 1 matched

  1. formula 1  84-68  on palermo 68 · venezia 84
     ambata    60
     ambo      15-19 (out: 15 on palermo 2026-09-25, position 1)
```

How a formula is applied:

1. **Found** — every *numero di ricerca* must have come out on **exactly one** wheel: a
   number on two wheels makes the play *sporca* and drops the formula. Those wheels must
   number exactly `SearchDrm`. `--dirty` keeps the *sporca* formula: every wheel holding
   a search number then counts towards `SearchDrm`.
2. **Isotopia** — reported when two of the matching wheels hold a search number in the
   same extraction position. It is recorded, not required.
3. **Retrovisione** — each bet is checked against the `Rear` preceding draws. A bet
   whose numbers already came out there is rejected, with where and when; what is left
   is the clean play.

`--scope` chooses how many wheels that last check searches. The subject is always the
bet's numbers over the same `Rear` draws:

| `--scope` | Searches | |
|---|---|---|
| `strict` | every wheel that drew | a number out anywhere burns the bet |
| `medium` | the wheels of the match | **default** — what `checkRearView` does |
| `loose` | each of those wheels on its own | a bet burnt on one wheel stays playable on the other, and is reported once per wheel |

```
$ scripts/formula.py --listing frm/allor.integrale.2019.frm --date 2026-09-01 --scope loose

  1. formula 35  35-53-80  on milano 53 · roma 35 80
     ambo      78-8 on milano (out: 78 on milano 2026-08-25, position 4) · 78-8 on roma
```

The same bet under `--scope medium` is simply rejected, and under `strict` it is rejected
by 8 coming out on palermo — a wheel with no part in the match at all. They nest: strict
rejects at least as much as medium, medium at least as much as loose.

A formula's bets are five lists — **ambate, ambi, terni, quaterne, cinquine** — and any
of them may be empty. A formula with no bets at all is legal: it reports where its
numbers landed, and the retrovisione has nothing to check.

| Flag | |
|---|---|
| `--listing FILE` | a listing to run: `.frm`, or the JSON form below |
| `-s/--search` | one formula written inline, `"14 1 62 # 43 19 # 27"` (commas work) |
| `-w/--wheels Y` | wheels the search numbers must be spread over, from 1 (2 past five numbers, and so on) to one per number, 11 at most (default: the listing's `SearchDrm`, 2 with `--search`) |
| `-z/--lookback Z` | draws the retrovisione reaches back (default: the listing's `Rear`, 9 with `--search`) |
| `--scope` | `strict` / `medium` / `loose` — wheels the retrovisione searches |
| `--clean` | keep only matches the retrovisione left untouched |
| `--colpi N` | also say how each bet fared over the N draws after its match |
| `--play` | `match` / `tutte` / `nazionale` — wheels `--colpi` looks for a win on |
| `--date`, `--scan`, `--since`, `--until` | one draw, or every draw of a range |
| `--json` | the report as JSON |

`--clean` is the filter worth reaching for on a long scan: it keeps only the matches
whose bets all survived the retrovisione, which is most of what makes a match
interesting. Over 2026, `allor.integrale.2019` matched on 108 draws and exactly one of
them came through clean. A formula that plays no bets has nothing to burn and is kept.

A whole-archive `--scan` takes about two seconds. Before 2005 only a handful of wheels
drew, so a formula behaves differently there; `--since 2005-05-04` is where all eleven
are present.

The same disclaimer as the statistics site applies, and more sharply: draws are
independent, so rejecting a bet whose numbers came out recently does not make the
remaining bets any likelier. The rule selects; it does not predict.

### The JSON formula format

`.frm` is positional: the header is four lines in a fixed order, and a bet's kind is
implied by how many numbers it holds. `schema/formula.schema.json` defines a JSON form
that says both out loud, and `scripts/formula.py --listing` reads either.

```bash
python scripts/convert_formulas.py ../lotto-convergence/frm   # a directory, or single files
python scripts/formula.py --listing formulas/nsla.json
```

```json
{
  "name": "Formula Allorquando Integrale 1932",
  "source": "allor.integrale.2019.frm",
  "size": 3,
  "wheels": 2,
  "lookback": 9,
  "formula_count": 180,
  "formulas": [
    {
      "index": 1,
      "numbers": [1, 19, 46],
      "bets": {
        "ambata": [],
        "ambo": [[66, 64]],
        "terno": [],
        "quaterna": [],
        "cinquina": [[64, 65, 67, 56, 76]]
      }
    }
  ]
}
```

A formula's bets are **five lists — ambate, ambi, terni, quaterne, cinquine — and any of
them may be empty**; all five keys are always written. `size`, `wheels` and `lookback`
are `SearchNum`, `SearchDrm` and `Rear` under names that say what they do, and `source`
records the file a listing was converted from.

Converted listings go to **`formulas/`, which is git-ignored**: they are someone else's
formulas in another repository's format, not part of this archive. A directory sweep
picks up `*.frm` and leaves the author's disabled `*.frm.no` files alone; naming one
converts it anyway.

## Development

```bash
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest              # tests
.venv/bin/python scripts/validate.py    # check the committed archive
.venv/bin/python scripts/update.py --dry-run
```

| Script | Purpose |
|---|---|
| `scripts/bootstrap.py` | One-off full import; fetches both sources and proves they agree |
| `scripts/update.py` | Incremental update, primary first |
| `scripts/reconcile.py` | Cross-check against the fallback |
| `scripts/validate.py` | Validate the committed archive |
| `scripts/build_site.py` | Build the static statistics site into `site/` |
| `scripts/formula.py` | Run the lookup formula, or a listing, over one draw or a range |
| `scripts/convert_formulas.py` | Convert `.frm` listings into the JSON formula format |

Useful flags: `--dry-run`, `--force-refetch`, `--now <iso>` (pretend it is another time,
to exercise the staleness logic), `--allow-history-rewrite`.
