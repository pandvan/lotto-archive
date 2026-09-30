---
name: lotto-glossary
description: The agreed Italian-to-English glossary for Italian Lotto code — which terms are translated, which stay Italian, and the traps (listato vs formula, spia vs simpatici, frequenza as rate vs count, isotopia). Load this before naming anything in lotto-archive or lotto-convergence: a variable, a JSON key, a schema field, a CLI flag, a docstring, or a UI label; before translating any Italian lotto term; and before reviewing naming in a diff that touches either repo.
---

# Italian Lotto glossary

Two rules decide every name:

1. **Code, comments, JSON keys and schema fields are English. Italian appears only in
   UI labels and where a term has no English equivalent.**
2. **A term with no English word keeps its Italian.** Most of the analytics vocabulary
   is in this class: international lottery-analytics English has only *hot / cold /
   warm numbers*, *frequency analysis* and *overdue*, and no word at all for
   *cadenza*, *figura*, *decina*, *isotopi*, *vertibili*, *gemelli*, *diametrale*.

The authority for the Italian is the official glossary:
<https://www.lotto-italia.it/lotto/regolamenti/glossario>. Check a term there before
inventing an English one.

## Structure

| Italian | Use | Meaning |
|---|---|---|
| listato | `listing` | the **file**: a header plus many formulas |
| formula | `formula` | **one row**: search numbers plus its bets |
| estrazione | `draw` | one date, every wheel that played |
| ruota | `wheel` | |
| estratto | `drawn number`, and `position` 1–5 for its slot | officially *ambata* is a synonym of *estratto* |
| concorso | `contest` | 1-based index of the draw within its calendar year |
| numeri di ricerca | `search numbers` | what a formula looks for |
| giocata | `bet` | |
| sorte | `bet kind` | which of the five lists a bet belongs to |
| retrovisione | `lookback` | how many draws back a check reaches |

**Never call the container a formula.** A listing holds formulas; a formula holds bets.
The `.frm` header (`SearchNum`, `SearchDrm`, `Rear`) belongs to the listing, not to any
one formula.

## Bets — Italian, always

`ambata` (1) · `ambo` (2) · `terno` (3) · `quaterna` (4) · `cinquina` (5)

These are the official bet names and have no English equivalents. A formula's bets are
**five lists, any of them empty**, in that order.

- `terna` is the official synonym of `terno`; prefer `terno`.
- **`terzina` is not a bet.** It means a *triplet of numbers* (*terzine simmetriche*,
  *terzina pari/dispari*). Never use it for the three-number bet.
- Same for `quartina`: a quartet of numbers, not the `quaterna` bet.

## Analytics — mostly Italian

| Italian | Use | Watch out |
|---|---|---|
| ritardo / ritardatario | `delay` | English has only the vaguer "overdue" |
| ritardo massimo | `max delay` | |
| frequenza | `frequency` | **officially a rate** (times drawn ÷ draws examined). The archive publishes a raw count beside an expected count — say which one a field holds |
| numeri spia | `spia` | the numbers that **announce** others (synonym *segnalimiti*) |
| numeri simpatici | `followers` | the numbers frequently drawn **after** a spia. The archive's `followers` statistic is this, not the spia |
| isotopi / isotopia | `isotopia`, `isotopi` | same **position**, different wheels |
| isocroni | `isocroni` | same **draw**, different wheels |
| sincroni | `sincroni` | same draw, same wheel |
| cadenza, figura, decina | `cadenza`, `figura`, `decina` | already the ids in `lotto/series.py` |
| tabellone | `tabellone` | |
| tutte (le ruote) | `tutte` | the pseudo-wheel unioning a date |
| giocata sporca | `dirty` | a search number that came out on more than one wheel |
| somma, distanza | `sum`, `distance` | |
| gemelli, vertibili, diametrale | keep Italian | 11/22/33…, 14-41, ±45 |
| fuori novanta | `fuori novanta` | subtract 90 when a sum passes it |

### One caveat on isotopia

Every Italian source defines *isotopi* as the **same number** in the same position on
two wheels. `lotto-convergence`'s `checkIsotopy` is looser: **any** search number in a
slot already used by another counts, so 62 on cagliari slot 2 with 35 on roma slot 2 is
reported as isotopia. The code generalises the term — if a docstring or a label says
*isotopia*, say which of the two it means.

## Cross-repo

`lotto-convergence` (Java, the user's own program) is the authority on what a formula
*means*; `lotto-archive` (Python) holds the data and reimplements the rule. Header
mapping:

| `.frm` | JSON / Python |
|---|---|
| `Name` | `name` |
| `SearchNum` | `size` |
| `SearchDrm` | `wheels` |
| `Rear` | `lookback` |

## Extending this

A new Italian term: look it up in the official glossary first, then apply rule 2 — a
real English equivalent wins, otherwise keep the Italian and add a row here. Do not
coin an English word for a term the English-speaking lottery world does not have.
