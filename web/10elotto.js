/* Estrazioni del 10eLotto — static front end.
 *
 * One page over one file, data/10elotto.json, in three sections like the Lotto page:
 * "Estrazioni", the draws of a year, newest first, filtered on the numbers they hold;
 * "Statistiche", not there yet; "Formule", the Lotto page's tab from formula-view.js,
 * with only the options that mean something without wheels.
 */
'use strict';

const view = document.getElementById('view');

// The ids are the Lotto page's, so the address reads the same on both.
const SECTIONS = [
  ['draws', 'Estrazioni', "Sfoglia l'archivio anno per anno e cerca i numeri usciti"],
  ['stats', 'Statistiche', 'Tabelle e grafici da consultare'],
  ['formulas', 'Formule', "Carica un listato e cercane i riscontri nell'archivio"],
];
let tab = 'draws';

/** The numbers of a draw as balls; `mark` gives a number its extra class, or nothing. */
const balls = (numbers, mark = () => null, extra = false) =>
  el('div', { class: extra ? 'balls extra' : 'balls' }, numbers.map((n) => el('span', {
    class: ['ball', mark(n)].filter(Boolean).join(' '), text: String(n),
  })));

/** Numero Oro, and Doppio Oro (its second number); absent before the options existed. */
const goldMark = (draw) => (n) => (n === draw.gold ? 'gold' : n === draw.double_gold ? 'gold2' : null);

const goldLegend = () => el('p', { class: 'legend' },
  el('span', {}, el('i', { class: 'ball gold' }), 'Numero Oro'),
  el('span', {}, el('i', { class: 'ball gold2' }), 'Doppio Oro'));

function drawsTable(draws, year, numbers) {
  const found = draws.filter((draw) =>
    (year === ALL_YEARS || draw.date.startsWith(year)) &&
    numbers.every((n) => draw.numbers.includes(n))).reverse();
  const title = `${num(found.length)} ${found.length === 1 ? 'estrazione' : 'estrazioni'}` +
    (year === ALL_YEARS ? '' : ` del ${year}`) +
    (numbers.length ? ` con ${numbers.join(', ')}` : '');
  if (!found.length) {
    return el('section', { class: 'card' }, el('h2', { text: title }),
      el('p', { class: 'unavailable', text: 'Nessuna estrazione corrisponde.' }));
  }
  const hit = (draw) => (n) => [goldMark(draw)(n), numbers.includes(n) ? 'hit' : null].filter(Boolean).join(' ');
  return el('section', { class: 'card' },
    el('h2', { text: title }),
    el('p', {
      class: 'help',
      text: 'Dalla più recente. Il filtro guarda i 20 numeri estratti, non l\'Extra.' +
        (found.length > MAX_ROWS ? ` Mostrate le prime ${MAX_ROWS}: scegli un anno o aggiungi un numero.` : ''),
    }),
    el('div', { class: 'scroll' }, el('table', { class: 'draws' },
      el('thead', {}, el('tr', {}, ['Data', 'Concorso', 'Numeri estratti', 'Extra']
        .map((label) => el('th', { scope: 'col', text: label })))),
      el('tbody', {}, found.slice(0, MAX_ROWS).map((draw) => el('tr', {},
        el('td', { text: date(draw.date) }),
        el('td', { class: 'dim', text: String(draw.contest) }),
        el('td', {}, balls(draw.numbers, hit(draw))),
        el('td', {}, draw.extra ? balls(draw.extra, undefined, true) : '—')))))),
    goldLegend());
}

async function main() {
  setUpTheme();
  let archive;
  try {
    const response = await fetch('data/10elotto.json');
    if (!response.ok) throw new Error(`10elotto.json: ${response.status}`);
    archive = await response.json();
  } catch (error) {
    view.replaceChildren(el('div', { class: 'card' }, el('p', {
      text: `Impossibile caricare i dati (${error.message}). Se stai aprendo il file dal disco, ` +
        'servi la cartella con un server HTTP.',
    })));
    return;
  }
  const { draws } = archive;
  const latest = draws[draws.length - 1];

  document.getElementById('sub').textContent =
    `${num(archive.draw_count)} estrazioni dal ${date(archive.first_date)} al ${date(archive.last_date)} · ` +
    'i 20 numeri, Numero Oro, Doppio Oro ed Extra';
  document.getElementById('latest-title').textContent =
    `Ultima estrazione · ${date(latest.date)} · concorso ${latest.contest}`;
  document.getElementById('latest-draw').replaceChildren(
    balls(latest.numbers, goldMark(latest)),
    ...(latest.extra ? [el('h2', { text: 'Extra' }), balls(latest.extra, undefined, true)] : []),
    goldLegend());
  document.getElementById('latest').hidden = false;

  const years = [...new Set(draws.map((draw) => draw.date.slice(0, 4)))].reverse();
  const year = document.getElementById('year');
  year.replaceChildren(
    ...years.map((y) => el('option', { value: y, text: y })),
    el('option', { value: ALL_YEARS, text: 'Tutti gli anni' }));
  const contains = document.getElementById('contains');
  const showDraws = () => view.replaceChildren(drawsTable(draws, year.value, wanted(contains.value)));
  year.addEventListener('change', showDraws);
  contains.addEventListener('input', showDraws);

  // The formula rule sees a 10eLotto draw as one pseudo-wheel of its 20 numbers.
  const asWheels = draws.map((draw) =>
    ({ date: draw.date, contest: draw.contest, wheels: { '10elotto': draw.numbers } }));
  Object.assign(formulaState, { game: '10elotto', load: async () => asWheels, sync: syncHash });

  function render() {
    document.getElementById('sections').replaceChildren(
      ...SECTIONS.map(([id, label, about]) => el('button', {
        type: 'button',
        'aria-current': id === tab ? 'page' : null,
        onclick: () => { tab = id; syncHash(); render(); },
      }, el('b', { text: label }), el('span', { text: about }))));
    document.getElementById('filters').hidden = tab !== 'draws';
    if (tab === 'draws') showDraws();
    else if (tab === 'formulas') view.replaceChildren(renderFormule());
    else {
      view.replaceChildren(el('section', { class: 'card' }, el('h2', { text: 'Statistiche' }),
        el('p', { class: 'unavailable', text: 'Le statistiche del 10eLotto arriveranno presto.' })));
    }
    hideTip();
  }

  /** `#/draws`, `#/stats`, or the formulas with their own part: `#/formulas/5/20/ranking`. */
  function syncHash() {
    const parts = ['', tab, ...(tab === 'formulas' ? formulaHash() : [])];
    history.replaceState(null, '', `#${parts.join('/')}`);
  }

  function readHash() {
    const [, inHash, ...rest] = (location.hash.slice(1) || '').split('/');
    if (!SECTIONS.some(([id]) => id === inHash)) return;
    tab = inHash;
    if (tab === 'formulas') readFormulaHash(rest);
  }

  readHash();
  syncHash();
  render();
  window.addEventListener('hashchange', () => { readHash(); render(); });
}

main();
