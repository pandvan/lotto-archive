/* Formula listings, run in the browser.
 *
 * A port of scripts/lotto/listing.py: the JSON form of a listing (see
 * schema/formula.schema.json) read with the same checks, and the same rule applied to
 * every draw of a range. The retrovisione searches the wheels of the match, which is
 * the "medium" scope there and what lotto-convergence does.
 *
 * tests/test_formula_js.py runs this file under node and the Python on the same draws
 * and compares the two outputs, so change them together.
 *
 * No display strings here: errors are English, like the Python ones, and app.js owns
 * every label.
 */
'use strict';

const BET_ORDER = ['ambata', 'ambo', 'terno', 'quaterna', 'cinquina'];

const WHEEL_ORDER = [
  'bari', 'cagliari', 'firenze', 'genova', 'milano', 'napoli',
  'palermo', 'roma', 'torino', 'venezia', 'nazionale',
];

/**
 * Where a bet is looked for after its match: on its own wheels, on those and the ten
 * city wheels, or on every wheel. `tutte` leaves the Nazionale out, as in the game.
 */
const PLAYS = ['match', 'tutte', 'nazionale'];

/** A JSON array of numbers, checked and deduplicated in order. */
function checkedNumbers(values, where) {
  if (!Array.isArray(values)) throw new Error(`${where}: not a list of numbers`);
  const out = [];
  for (const value of values) {
    if (!Number.isInteger(value)) throw new Error(`${where}: ${JSON.stringify(value)} is not a number`);
    if (value < 1 || value > 90) throw new Error(`${where}: ${value} is not in 1-90`);
    if (!out.includes(value)) out.push(value);
  }
  if (!out.length) throw new Error(`${where}: empty group`);
  return out;
}

/** Read a listing from its parsed JSON form, checking what the format promises. */
function readListing(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('not a JSON object');
  }
  for (const key of ['name', 'size', 'wheels', 'lookback', 'formulas']) {
    if (!(key in payload)) throw new Error(`missing "${key}"`);
  }
  for (const key of ['size', 'wheels', 'lookback']) {
    if (!Number.isInteger(payload[key]) || payload[key] < 0) {
      throw new Error(`bad header value: "${key}" is not a whole number`);
    }
  }
  if (!Array.isArray(payload.formulas) || !payload.formulas.length) throw new Error('no formulas');

  const formulas = payload.formulas.map((entry, offset) => {
    const where = `formula ${offset + 1}`;
    if (entry === null || typeof entry !== 'object') throw new Error(`${where}: not an object`);
    // Every kind is always present, in the fixed order, whatever order the file used.
    const bets = Object.fromEntries(BET_ORDER.map((name) => [name, []]));
    for (const [name, played] of Object.entries(entry.bets ?? {})) {
      if (!BET_ORDER.includes(name)) throw new Error(`${where}: "${name}" is not a bet`);
      if (!Array.isArray(played)) throw new Error(`${where}: "${name}" is not a list of bets`);
      for (const group of played) {
        const numbers = checkedNumbers(group, where);
        if (BET_ORDER[numbers.length - 1] !== name) {
          throw new Error(`${where}: ${numbers.length} numbers is not ${name}`);
        }
        bets[name].push(numbers);
      }
    }
    return {
      index: Number.isInteger(entry.index) ? entry.index : offset + 1,
      numbers: checkedNumbers(entry.numbers, where),
      bets,
    };
  });

  return {
    name: String(payload.name),
    size: payload.size,
    wheels: payload.wheels,
    lookback: payload.lookback,
    formulas,
  };
}

/**
 * Look for a bet's numbers on the `play` wheels over the `lookback` draws before
 * `draws[index]`, most recent first, so a burnt bet reports where it was last seen.
 */
function checkBet(draws, index, numbers, play, lookback) {
  for (let i = index - 1; i >= Math.max(0, index - lookback); i -= 1) {
    for (const wheel of play) {
      const row = draws[i].wheels[wheel] ?? [];
      for (const number of numbers) {
        const at = row.indexOf(number);
        if (at >= 0) {
          return {
            numbers,
            play,
            clean: false,
            seen: { number, wheel, date: draws[i].date, position: at + 1 },
          };
        }
      }
    }
  }
  return { numbers, play, clean: true };
}

/**
 * What became of a bet over the `colpi` draws after `draws[index]`: won when all its
 * numbers came out together on one wheel, lost, or still open at the end of the archive.
 * The whole window is walked even after a win, to count the wheel rows it offered.
 */
function outcomeOf(draws, index, numbers, play, colpi, on) {
  if (!PLAYS.includes(on)) throw new Error(`unknown play "${on}"`);
  const wheels = WHEEL_ORDER.filter((wheel) => play.includes(wheel) ||
    on === 'nazionale' || (on === 'tutte' && wheel !== 'nazionale'));
  const last = Math.min(draws.length - 1, index + colpi);
  let rows = 0;
  let won = null;
  for (let i = index + 1; i <= last; i += 1) {
    const hit = [];
    for (const wheel of wheels) {
      const row = draws[i].wheels[wheel];
      if (!row || !row.length) continue;
      rows += 1;
      if (numbers.every((number) => row.includes(number))) hit.push(wheel);
    }
    if (hit.length && !won) won = { colpo: i - index, date: draws[i].date, wheels: hit };
  }
  const window = { colpi: last - index, rows };
  if (won) return { state: 'won', ...window, ...won };
  return { state: last - index === colpi ? 'lost' : 'open', ...window };
}

/**
 * Every match of `listing` over `draws` (oldest first, as data/all.min.json holds them),
 * from the ISO date `since` on. The retrovisione still reaches before `since`.
 * With `colpi`, every bet also carries its outcome over that many draws after the match.
 *
 * A formula matches a draw when each of its search numbers came out on exactly one
 * wheel and those wheels number `listing.wheels`. With `dirty`, a search number may be
 * on several wheels, and every wheel holding one is a wheel of the match.
 */
function scanListing(draws, listing, since = null, colpi = 0, on = 'match', dirty = false) {
  const out = [];
  draws.forEach((draw, index) => {
    if (index < listing.lookback || (since && draw.date < since)) return;

    const holders = new Map();
    for (const wheel of WHEEL_ORDER) {
      for (const number of draw.wheels[wheel] ?? []) {
        const wheels = holders.get(number) ?? [];
        if (!wheels.includes(wheel)) wheels.push(wheel);
        holders.set(number, wheels);
      }
    }

    for (const formula of listing.formulas) {
      const wheelsOf = formula.numbers.map((number) => holders.get(number) ?? []);
      if (wheelsOf.some((wheels) => (dirty ? !wheels.length : wheels.length !== 1))) continue;
      const wheels = WHEEL_ORDER.filter((wheel) => wheelsOf.some((held) => held.includes(wheel)));
      if (wheels.length !== listing.wheels) continue;

      const found = Object.fromEntries(wheels.map((wheel) => [
        wheel,
        formula.numbers.filter((_, i) => wheelsOf[i].includes(wheel)),
      ]));
      // The loose isotopia of lotto-convergence: any two search numbers in the same
      // position on two wheels, not only the same number.
      const positions = wheels.map((wheel) =>
        found[wheel].map((number) => draw.wheels[wheel].indexOf(number)));
      const isotopic = positions.some((first, i) =>
        positions.slice(i + 1).some((second) => first.some((p) => second.includes(p))));

      out.push({
        date: draw.date,
        formula,
        wheels,
        found,
        isotopic,
        bets: Object.fromEntries(BET_ORDER.map((name) => [
          name,
          formula.bets[name].map((numbers) => {
            const bet = checkBet(draws, index, numbers, wheels, listing.lookback);
            if (colpi) bet.outcome = outcomeOf(draws, index, numbers, wheels, colpi, on);
            return bet;
          }),
        ])),
      });
    }
  });
  return out;
}

if (typeof module !== 'undefined') module.exports = { readListing, scanListing };
