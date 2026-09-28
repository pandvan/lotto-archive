# Italian Lotto archive

Every Italian Lotto draw since **7 January 1939**, as plain JSON, updated automatically
by a GitHub Action.

```
7,391 draws · 77,176 wheel results · 1939-01-07 → 2026-09-26
```

## Layout

| Path | What it is |
|---|---|
| `data/<year>.json` | One file per calendar year — the source of truth |
| `data/all.json` | Every draw in one file, indented |
| `data/all.min.json` | Every draw in one file, minified |
| `data/latest.json` | The most recent draw only |
| `index.json` | Coverage, per-year counts, and upstream source state |
| `schema/` | JSON Schema for a draw and for a year file |

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

Useful flags: `--dry-run`, `--force-refetch`, `--now <iso>` (pretend it is another time,
to exercise the staleness logic), `--allow-history-rewrite`.
