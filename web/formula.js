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
 * Every match of `listing` over `draws` (oldest first, as data/all.min.json holds them),
 * from the ISO date `since` on. The retrovisione still reaches before `since`.
 *
 * A formula matches a draw when each of its search numbers came out on exactly one
 * wheel and those wheels number `listing.wheels`.
 */
function scanListing(draws, listing, since = null) {
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
      if (wheelsOf.some((wheels) => wheels.length !== 1)) continue;
      const wheels = WHEEL_ORDER.filter((wheel) => wheelsOf.some((held) => held[0] === wheel));
      if (wheels.length !== listing.wheels) continue;

      const found = Object.fromEntries(wheels.map((wheel) => [
        wheel,
        formula.numbers.filter((_, i) => wheelsOf[i][0] === wheel),
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
          formula.bets[name].map((numbers) =>
            checkBet(draws, index, numbers, wheels, listing.lookback)),
        ])),
      });
    }
  });
  return out;
}

if (typeof module !== 'undefined') module.exports = { readListing, scanListing };
