/* Utility — static front end.
 *
 * One section for now, "Crea listato": a form that builds a formula listing (see
 * schema/formula.schema.json) and downloads it as JSON, ready for the Formule tab.
 * The bets of a formula are typed either freely, one per line with the kind read from
 * how many numbers it has, or row by row with the kind chosen first.
 *
 * checkListing and buildListing are pure, so tests/test_utility_js.py runs them under
 * node; everything below them touches the page.
 */
'use strict';

const KIND_LABELS = { ambata: 'Ambata', ambo: 'Ambo', terno: 'Terno', quaterna: 'Quaterna', cinquina: 'Cinquina' };

/**
 * The tokens of a typed group, kept as typed: nothing is dropped or deduplicated. Numbers
 * are separated by spaces or by one comma with spaces around it; anything else stays in a
 * token and fails as a number (23-45, -1), and a doubled or dangling comma leaves an empty
 * token (23,,45; 23,).
 */
const tokens = (text) => {
  const trimmed = String(text ?? '').trim();
  return trimmed ? trimmed.split(/\s*,\s*|\s+/) : [];
};

/** A bet kind from how many numbers a bet holds, or undefined past a cinquina. */
const kindOf = (count) => BET_ORDER[count - 1];

/**
 * Check one typed group of numbers. Returns the numbers and the problems with them;
 * `size`, when given, is how many the group must hold.
 */
function checkGroup(text, size) {
  const problems = [];
  const numbers = [];
  for (const token of tokens(text)) {
    if (!token) problems.push('Separa i numeri con spazi o con una sola virgola.');
    else if (!/^\d+$/.test(token)) problems.push(`"${token}" non è un numero.`);
    else if (Number(token) < 1 || Number(token) > 90) problems.push(`${Number(token)} non è tra 1 e 90.`);
    else if (numbers.includes(Number(token))) problems.push(`Il ${Number(token)} è ripetuto.`);
    else numbers.push(Number(token));
  }
  if (size != null && tokens(text).length !== size) {
    problems.push(`Servono ${size} numeri, ne hai scritti ${tokens(text).length}.`);
  }
  return { numbers, problems };
}

/** A header value typed as a whole number in [min, max]; null when it is not one. */
function wholeIn(text, min, max) {
  const value = String(text ?? '').trim();
  if (!/^\d+$/.test(value)) return null;
  return Number(value) >= min && Number(value) <= max ? Number(value) : null;
}

/**
 * Every problem with a listing as typed, as {where, message}. `where` names the field:
 * "name", "size", "wheels", "lookback", "formulas", "f<i>.numbers", "f<i>.bets" (the
 * formula's bets as a whole) and "f<i>.b<j>" (one bet). A bet's `kind` is null when it
 * was typed freely and its kind follows from its count.
 */
function checkListing(listing) {
  const errors = [];
  const fail = (where, message) => errors.push({ where, message });

  const name = String(listing.name ?? '').trim();
  if (!name) fail('name', 'Dai un nome al listato.');
  // The name is also the file's name: only what every system keeps as typed.
  else if (!/^[A-Za-z0-9 ._-]+$/.test(name)) {
    fail('name', 'Solo lettere senza accenti, cifre, spazi, punto, trattino e trattino basso.');
  }
  const size = wholeIn(listing.size, 1, 5);
  if (size == null) fail('size', 'Da 1 a 5 numeri.');
  const wheels = wholeIn(listing.wheels, 1, 11);
  if (wheels == null) fail('wheels', 'Da 1 a 11 ruote.');
  // Each wheel of a match holds at least one search number.
  else if (size != null && wheels > size) fail('wheels', `Al massimo ${size}, quanti i numeri di ricerca.`);
  if (String(listing.lookback ?? '').trim() && wholeIn(listing.lookback, 0, Infinity) == null) {
    fail('lookback', 'Un numero intero, 0 o vuoto per non usarla.');
  }
  if (!listing.formulas.length) fail('formulas', 'Aggiungi almeno una formula.');

  listing.formulas.forEach((formula, i) => {
    for (const message of checkGroup(formula.numbers, size ?? undefined).problems) {
      fail(`f${i}.numbers`, message);
    }
    if (!formula.bets.length) fail(`f${i}.bets`, 'Aggiungi almeno una giocata.');
    const seen = new Set();
    formula.bets.forEach((bet, j) => {
      const where = `f${i}.b${j}`;
      const { numbers, problems } = checkGroup(bet.text);
      problems.forEach((message) => fail(where, message));
      const count = tokens(bet.text).length;
      if (!count) fail(where, 'Giocata vuota.');
      else if (bet.kind && count !== BET_ORDER.indexOf(bet.kind) + 1) {
        fail(where, `${KIND_LABELS[bet.kind]}: servono ${BET_ORDER.indexOf(bet.kind) + 1} numeri.`);
      } else if (!kindOf(count)) fail(where, 'Al massimo 5 numeri (cinquina).');
      const key = [...numbers].sort((a, b) => a - b).join(' ');
      if (problems.length || !count) return;
      if (seen.has(key)) fail(where, 'Giocata già presente nella formula.');
      seen.add(key);
    });
  });
  return errors;
}

/** The listing's JSON form. Only for a listing checkListing passed. */
function buildListing(listing) {
  const formulas = listing.formulas.map((formula, i) => {
    const bets = Object.fromEntries(BET_ORDER.map((name) => [name, []]));
    for (const bet of formula.bets) {
      const numbers = checkGroup(bet.text).numbers;
      bets[kindOf(numbers.length)].push(numbers);
    }
    return { index: i + 1, numbers: checkGroup(formula.numbers).numbers, bets };
  });
  return {
    name: listing.name.trim(),
    size: Number(listing.size),
    wheels: Number(listing.wheels),
    // Empty means no retrovisione, which is a lookback of 0 draws.
    lookback: Number(String(listing.lookback ?? '').trim() || 0),
    formula_count: formulas.length,
    formulas,
  };
}

if (typeof module !== 'undefined') module.exports = { checkListing, buildListing };

if (typeof document !== 'undefined') {
  const view = document.getElementById('view');
  const MODES = [['guided', 'Guidato'], ['free', 'Libero']];
  let mode = 'guided';
  try {
    if (localStorage.getItem('utility-bet-mode') === 'free') mode = 'free';
  } catch { /* private mode: stay on guided */ }

  // The form's model, as typed. The page is redrawn from it on every structural change.
  // `touched` holds the fields left at least once: a field shows its problems from then on,
  // every field after a download. A formula carries its own, so removing one moves nothing.
  // In Libero, `freeText` is the textarea as typed and `bets` is read from it.
  const listing = { name: '', size: '3', wheels: '2', lookback: '', formulas: [], touched: new Set() };
  const newFormula = () => ({
    numbers: '', freeText: '', touched: new Set(),
    bets: mode === 'guided' ? [{ kind: 'ambo', text: '' }] : [],
  });
  listing.formulas.push(newFormula());
  let checkAll = false;

  /** The free text of a formula's bets: lines, the blank ones skipped, line numbers kept. */
  const readFree = (text) => text.split('\n')
    .map((line, k) => ({ kind: null, text: line, line: k + 1 }))
    .filter((bet) => bet.text.trim());

  /** Whether a field's problems show: "f<i>.b<j>" belongs to the formula's bets. */
  function shown(where) {
    const field = where.match(/^f(\d+)\.(numbers|b)/);
    if (!field) return where === 'formulas' || listing.touched.has(where);
    return listing.formulas[field[1]]?.touched.has(field[2] === 'b' ? 'bets' : 'numbers');
  }

  /** Mark a field as left and show its problems. */
  function leave(where) {
    const field = where.match(/^f(\d+)\.(numbers|b)/);
    if (!field) listing.touched.add(where);
    // A formula removed while focused may blur after it is gone.
    else listing.formulas[field[1]]?.touched.add(field[2] === 'b' ? 'bets' : 'numbers');
    showErrors();
  }

  /** Paint the problems on their fields; returns the first bad field. */
  function showErrors() {
    view.querySelectorAll('.invalid').forEach((node) => node.classList.remove('invalid'));
    view.querySelectorAll('.error').forEach((node) => { node.textContent = ''; });
    let first = null;
    for (const { where, message } of checkListing(listing)) {
      if (!checkAll && !shown(where)) continue;
      let target = view.querySelector(`[data-where="${where}"]`);
      let text = message;
      // A freely typed bet has no field of its own: its line of the textarea stands in.
      const bet = where.match(/^f(\d+)\.b(\d+)$/);
      if (!target && bet) {
        target = view.querySelector(`[data-where="f${bet[1]}.bets"]`);
        text = `Riga ${listing.formulas[bet[1]].bets[bet[2]].line}: ${message}`;
      }
      if (!target) continue;
      target.classList.add('invalid');
      const slot = target.closest('.slot, .bet-row, .field')?.querySelector('.error');
      if (slot) slot.textContent = [slot.textContent, text].filter(Boolean).join(' ');
      first ??= target;
    }
    return first;
  }

  const field = (where, label, control, help) => el('div', { class: 'field' },
    el('label', { for: where, text: label }), control,
    help && el('small', { class: 'hint', text: help }),
    el('small', { class: 'error', role: 'alert' }));

  /** A text input bound to `owner[key]`, checked when left and live after that. */
  const input = (owner, key, where, attrs = {}) => el('input', {
    type: 'text', id: where, 'data-where': where, value: owner[key], autocomplete: 'off', ...attrs,
    oninput: (event) => { owner[key] = event.target.value; showErrors(); },
    onblur: () => leave(where),
  });

  const redraw = () => { render(); showErrors(); };

  function betsEditor(formula, i) {
    if (mode === 'free') {
      return field(`f${i}.bets`, 'Giocate', el('textarea', {
        id: `f${i}.bets`, 'data-where': `f${i}.bets`, rows: Math.max(8, formula.freeText.split('\n').length + 1),
        placeholder: '7\n23 45\n23 68\n23 45 68',
        oninput: (event) => {
          formula.freeText = event.target.value;
          formula.bets = readFree(formula.freeText);
          showErrors();
        },
        onblur: () => leave(`f${i}.bets`),
      }, formula.freeText),
      'Una giocata per riga: 1 numero ambata, 2 ambo, 3 terno, 4 quaterna, 5 cinquina.');
    }
    return el('div', { class: 'field' },
      el('label', { text: 'Giocate' }),
      formula.bets.map((bet, j) => el('div', { class: 'bet-row' },
        el('select', {
          'aria-label': 'Sorte',
          onchange: (event) => { bet.kind = event.target.value; showErrors(); },
          onblur: () => leave(`f${i}.bets`),
        }, BET_ORDER.map((name) => el('option', { value: name, selected: name === bet.kind, text: KIND_LABELS[name] }))),
        input(bet, 'text', `f${i}.b${j}`, { inputmode: 'numeric', placeholder: 'es. 23 45', 'aria-label': 'Numeri' }),
        el('button', {
          type: 'button', title: 'Rimuovi giocata', 'aria-label': 'Rimuovi giocata', text: '×',
          onclick: () => { formula.bets.splice(j, 1); redraw(); },
        }),
        el('small', { class: 'error', role: 'alert' }))),
      el('div', { class: 'slot', 'data-where': `f${i}.bets` }, el('small', { class: 'error', role: 'alert' })),
      el('div', {}, el('button', {
        type: 'button', text: '+ Aggiungi giocata',
        onclick: () => { formula.bets.push({ kind: 'ambo', text: '' }); redraw(); },
      })));
  }

  function setMode(next) {
    mode = next;
    try {
      localStorage.setItem('utility-bet-mode', mode);
    } catch { /* nothing to do */ }
    // Free bets carry no kind and empty rows have no line; guided ones start from the
    // kind their count implies.
    for (const formula of listing.formulas) {
      if (mode === 'free') {
        formula.freeText = formula.bets.map((bet) => bet.text).filter((text) => text.trim()).join('\n');
        formula.bets = readFree(formula.freeText);
      } else {
        formula.bets = formula.bets.map((bet) => ({ kind: kindOf(tokens(bet.text).length) ?? 'ambo', text: bet.text }));
        if (!formula.bets.length) formula.bets.push({ kind: 'ambo', text: '' });
      }
    }
    redraw();
  }

  function download() {
    checkAll = true;
    const bad = showErrors();
    const status = document.getElementById('status');
    if (bad) {
      status.textContent = 'Il listato ha degli errori: correggi i campi segnati in rosso.';
      bad.scrollIntoView({ block: 'center' });
      bad.focus();
      return;
    }
    const payload = buildListing(listing);
    try {
      readListing(payload);  // the same check the Formule tab makes on upload
    } catch (error) {
      status.textContent = `Listato non valido: ${error.message}`;
      return;
    }
    // Indented, with each group of numbers on one line, as scripts/convert_formulas.py writes.
    const text = JSON.stringify(payload, null, 2)
      .replace(/\[\s*(\d+(?:,\s*\d+)*)\s*\]/g, (_, numbers) => `[${numbers.split(/,\s*/).join(', ')}]`);
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'application/json' }));
    el('a', { href: url, download: `${payload.name}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    status.textContent = `Scaricato: ${num(payload.formula_count)} ${payload.formula_count === 1 ? 'formula' : 'formule'}.`;
  }

  function render() {
    view.replaceChildren(
      el('section', { class: 'card' },
        el('h2', { text: 'Listato' }),
        el('p', { class: 'help', text: 'Compila i campi, aggiungi tutte le formule che vuoi e scarica il file JSON: ' +
          'si carica così com\'è nella sezione Formule del Lotto e del 10eLotto.' }),
        el('div', { class: 'form-row' },
          field('name', 'Nome', input(listing, 'name', 'name', { placeholder: 'es. Distanza 45' })),
          field('size', 'Numeri di ricerca', input(listing, 'size', 'size', { inputmode: 'numeric', size: 3 })),
          field('wheels', 'Ruote', input(listing, 'wheels', 'wheels', { inputmode: 'numeric', size: 3 })),
          field('lookback', 'Retrovisione', input(listing, 'lookback', 'lookback', { inputmode: 'numeric', size: 3, placeholder: '0' }),
            'Estrazioni; 0 o vuoto = nessuna.')),
        el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Inserimento delle giocate' },
          el('span', { class: 'hint', text: 'Inserimento giocate:' }),
          MODES.map(([id, label]) => el('button', {
            type: 'button', role: 'tab', 'aria-selected': String(id === mode), text: label,
            onclick: () => { if (id !== mode) setMode(id); },
          })))),
      ...listing.formulas.map((formula, i) => el('section', { class: 'card formula' },
        el('div', { class: 'top' },
          el('h2', { text: `Formula ${i + 1}` }),
          el('button', {
            type: 'button', text: 'Rimuovi',
            onclick: () => { listing.formulas.splice(i, 1); redraw(); },
          })),
        field(`f${i}.numbers`, 'Numeri di ricerca',
          input(formula, 'numbers', `f${i}.numbers`, { inputmode: 'numeric', placeholder: 'es. 23 45 68' })),
        betsEditor(formula, i))),
      // The buttons stay put: every message goes below them.
      el('div', { class: 'actions' },
        el('div', { class: 'form-row' },
        el('button', {
          type: 'button', text: '+ Aggiungi formula',
          onclick: () => {
            listing.formulas.push(newFormula());
            redraw();
            view.querySelector(`[data-where="f${listing.formulas.length - 1}.numbers"]`).focus();
          },
        }),
        el('button', { type: 'button', class: 'primary', text: 'Scarica JSON', onclick: download })),
        el('div', { 'data-where': 'formulas', class: 'slot' }, el('small', { class: 'error', role: 'alert' })),
        el('p', { id: 'status', class: 'hint', role: 'status' })));
  }

  setUpTheme();
  document.getElementById('sections').replaceChildren(el('button', { type: 'button', 'aria-current': 'page' },
    el('b', { text: 'Crea listato' }), el('span', { text: 'Compila le formule e scarica il listato in JSON' })));
  render();
}
