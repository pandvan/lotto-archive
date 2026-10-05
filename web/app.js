/* Statistiche del Lotto — static front end.
 *
 * All display strings live in LABELS below: the generated JSON carries English keys
 * and no prose, so this file is the only place to change wording, and the only place
 * where the Italian lotto vocabulary (ritardo, ambo, cadenza, figura, decina) appears.
 *
 * The page has two sections. "Statistiche" is read-only: tabs of generated statistics.
 * "Formule" is the one view not built from them: it runs a listing the reader uploads
 * against the raw draws, with the rule in formula.js.
 *
 * No dependencies. Charts are inline SVG built by the helpers under "charts".
 */
'use strict';

// --------------------------------------------------------------------- labels

const LABELS = {
  wheels: {
    tutte: 'Tutte le ruote',
    bari: 'Bari',
    cagliari: 'Cagliari',
    firenze: 'Firenze',
    genova: 'Genova',
    milano: 'Milano',
    napoli: 'Napoli',
    palermo: 'Palermo',
    roma: 'Roma',
    torino: 'Torino',
    venezia: 'Venezia',
    nazionale: 'Nazionale',
  },
  periods: {
    all: "Tutto l'archivio",
    500: 'Ultime 500 estrazioni',
    100: 'Ultime 100 estrazioni',
  },
  // The same periods as a prepositional phrase: lower-casing the label above and
  // prefixing "in" gives "in ultime 100 estrazioni", which is not Italian.
  periodsIn: {
    all: "in tutto l'archivio",
    500: 'nelle ultime 500 estrazioni',
    100: 'nelle ultime 100 estrazioni',
  },
  weekdays: ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'],
  groupings: {
    cadenze: {
      title: 'Cadenze',
      unit: 'Cadenza',
      help: "La cadenza è l'ultima cifra del numero: la cadenza 3 raccoglie 3, 13, 23 … 83, " +
        'la cadenza 0 raccoglie 10, 20 … 90. Nove numeri per cadenza, quindi ogni cadenza ' +
        'si aspetta un decimo degli estratti.',
    },
    figure: {
      title: 'Figure',
      unit: 'Figura',
      help: 'La figura è la somma delle cifre ridotta a una sola: 18 e 90 sono entrambi ' +
        'figura 9. Dieci numeri per figura.',
    },
    decine: {
      title: 'Decine',
      unit: 'Decina',
      help: 'I nove gruppi di dieci, da 1-10 a 81-90.',
    },
  },
  // The two halves of the page: statistics to read, and listings to run. `formulas` is
  // also the id the address and state.tab use for the second one.
  sections: [
    ['stats', 'Statistiche', 'Tabelle e grafici da consultare, ruota per ruota'],
    ['formulas', 'Formule', "Carica un listato e cercane i riscontri nell'archivio"],
  ],
  // Tab ids are what the address shows, so they are English like every other id; the
  // label beside each is what the reader sees.
  tabs: [
    ['board', 'Tabellone'],
    ['delays', 'Ritardi'],
    ['frequencies', 'Frequenze'],
    ['pairs', 'Ambi'],
    ['groups', 'Cadenze e figure'],
    ['distributions', 'Distribuzioni'],
    ['followers', 'Numeri spia'],
    ['check', 'Verifica'],
  ],
  // How far back a listing is run, in years before the last draw.
  formulaPeriods: [
    ['1', 'Ultimo anno'],
    ['5', 'Ultimi 5 anni'],
    ['10', 'Ultimi 10 anni'],
    ['all', "Tutto l'archivio"],
  ],
  // Where a bet's outcome is looked for; the ids are the PLAYS of formula.js.
  plays: [
    ['match', 'Ruote del riscontro'],
    ['tutte', 'Tutte le ruote'],
    ['nazionale', 'Tutte e Nazionale'],
  ],
  // The three readings of a listing's results; the ids are what the address shows.
  formulaViews: [
    ['matches', 'Riscontri'],
    ['ranking', 'Classifica'],
    ['time', 'Nel tempo'],
  ],
};

const DEFAULT_TAB = 'board';
const NUMBERS = Array.from({ length: 90 }, (_, i) => i + 1);

// ---------------------------------------------------------------- formatting

const nf = new Intl.NumberFormat('it-IT');
const nf1 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (v) => (v == null ? '—' : nf.format(v));
const dec = (v) => (v == null ? '—' : nf1.format(v));
const dec2 = (v) => (v == null ? '—' : nf2.format(v));

/** ISO date to Italian day/month/year, without going through Date and its timezone. */
function date(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function signed(v, digits = 0) {
  if (v == null) return '—';
  const formatted = digits ? nf1.format(Math.abs(v)) : nf.format(Math.round(Math.abs(v)));
  if (v > 0) return `+${formatted}`;
  if (v < 0) return `−${formatted}`;
  return '0';
}

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
};

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, value);
  }
  return node;
};

// ------------------------------------------------------------------- tooltip

const tip = document.getElementById('tip');

function showTip(html, event) {
  tip.innerHTML = html;
  tip.hidden = false;
  const box = tip.getBoundingClientRect();
  const pad = 12;
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + box.width > window.innerWidth - pad) x = event.clientX - box.width - pad;
  if (y + box.height > window.innerHeight - pad) y = event.clientY - box.height - pad;
  tip.style.left = `${Math.max(pad, x)}px`;
  tip.style.top = `${Math.max(pad, y)}px`;
}

const hideTip = () => { tip.hidden = true; };

/** Hover and keyboard focus show the same thing; the tooltip never gates a value. */
function hoverable(node, html) {
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  node.addEventListener('pointerenter', (e) => showTip(html, e));
  node.addEventListener('pointermove', (e) => showTip(html, e));
  node.addEventListener('pointerleave', hideTip);
  node.addEventListener('focus', () => {
    const box = node.getBoundingClientRect();
    showTip(html, { clientX: box.left + box.width / 2, clientY: box.top });
  });
  node.addEventListener('blur', hideTip);
  return node;
}

// --------------------------------------------------------------------- charts

/** Nice-ish axis maximum and a step that divides it. */
function niceScale(max, ticks = 4) {
  if (max <= 0) return { max: 1, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { max: Math.ceil(max / step) * step, step };
}

/**
 * Vertical bars, one series, with an optional constant reference line (the expected
 * value) and an optional per-bar reference mark.
 */
function barChart({ data, height = 220, labelEvery = 1, reference = null, unit = '' }) {
  const width = 1000;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const peak = Math.max(
    ...data.map((d) => d.value),
    reference ?? 0,
    ...data.map((d) => d.mark ?? 0),
  );
  const { max, step } = niceScale(peak);
  const y = (v) => pad.top + plotH - (v / max) * plotH;
  const slot = plotW / data.length;
  // 2px surface gap between neighbours, and a cap so a handful of categories do not
  // become saturated blocks the width of a card.
  const barW = Math.min(Math.max(2, slot - 2), 56);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
  });

  for (let v = 0; v <= max + 1e-9; v += step) {
    svg.append(svgEl('line', { class: 'gridline', x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v) }));
    const tick = svgEl('text', { class: 'tick', x: pad.left - 8, y: y(v) + 3.5, 'text-anchor': 'end' });
    tick.textContent = nf.format(v);
    svg.append(tick);
  }

  data.forEach((d, i) => {
    const x = pad.left + i * slot + (slot - barW) / 2;
    const top = y(d.value);
    const group = svgEl('g');
    group.append(svgEl('rect', {
      class: 'bar-hit', x: pad.left + i * slot, y: pad.top, width: slot, height: plotH,
    }));
    group.append(svgEl('rect', {
      class: 'bar', x, y: top, width: barW, height: Math.max(0, pad.top + plotH - top), rx: Math.min(4, barW / 2),
    }));
    if (d.mark != null) {
      group.append(svgEl('line', {
        class: 'expected-mark', x1: x - 1, x2: x + barW + 1, y1: y(d.mark), y2: y(d.mark),
      }));
    }
    svg.append(hoverable(group, d.tip ?? `<b>${d.label}</b><br>${num(d.value)}${unit}`));

    if (i % labelEvery === 0) {
      const label = svgEl('text', {
        class: 'tick', x: pad.left + i * slot + slot / 2, y: height - 8, 'text-anchor': 'middle',
      });
      label.textContent = d.label;
      svg.append(label);
    }
  });

  if (reference != null) {
    svg.append(svgEl('line', {
      class: 'expected-mark', x1: pad.left, x2: width - pad.right, y1: y(reference), y2: y(reference),
    }));
  }

  svg.append(svgEl('line', {
    class: 'axis', x1: pad.left, x2: width - pad.right, y1: pad.top + plotH, y2: pad.top + plotH,
  }));
  return svg;
}

/**
 * Horizontal bars with a second marker per row — current delay against the record,
 * on one shared scale, which is why this is a bullet and not a dual axis.
 */
function bulletChart({ data, unit = '' }) {
  const width = 1000;
  const row = 22;
  const pad = { top: 8, right: 56, bottom: 24, left: 44 };
  const height = pad.top + data.length * row + pad.bottom;
  const plotW = width - pad.left - pad.right;
  const { max, step } = niceScale(Math.max(...data.map((d) => Math.max(d.value, d.mark ?? 0))));
  const x = (v) => pad.left + (v / max) * plotW;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group' });

  for (let v = 0; v <= max + 1e-9; v += step) {
    svg.append(svgEl('line', { class: 'gridline', x1: x(v), x2: x(v), y1: pad.top, y2: pad.top + data.length * row }));
    const tick = svgEl('text', { class: 'tick', x: x(v), y: height - 8, 'text-anchor': 'middle' });
    tick.textContent = nf.format(v);
    svg.append(tick);
  }

  data.forEach((d, i) => {
    const top = pad.top + i * row;
    const barH = row - 8;
    const group = svgEl('g');
    group.append(svgEl('rect', { class: 'bar-hit', x: 0, y: top, width, height: row }));
    group.append(svgEl('rect', {
      class: 'bar', x: pad.left, y: top + 4, width: Math.max(1, x(d.value) - pad.left), height: barH, rx: 4,
    }));
    if (d.mark != null) {
      group.append(svgEl('line', {
        class: 'expected-mark', x1: x(d.mark), x2: x(d.mark), y1: top + 2, y2: top + row - 2,
      }));
    }
    svg.append(hoverable(group, d.tip));

    const label = svgEl('text', { class: 'tick', x: pad.left - 8, y: top + row / 2 + 3.5, 'text-anchor': 'end' });
    label.textContent = d.label;
    svg.append(label);

    // Direct label at the bar end: the value a reader wants without hovering.
    const value = svgEl('text', { class: 'label', x: x(d.value) + 6, y: top + row / 2 + 3.5 });
    value.textContent = `${nf.format(d.value)}${unit}`;
    svg.append(value);
  });

  svg.append(svgEl('line', {
    class: 'axis', x1: pad.left, x2: pad.left, y1: pad.top, y2: pad.top + data.length * row,
  }));
  return svg;
}

/**
 * Departures from an expected value, as bars from a zero line: above in slot 1, below in
 * slot 2. Raw counts of near-equal categories all look identical; the difference is the
 * story, and a difference needs a zero baseline rather than a truncated one.
 */
function deviationChart({ data, height = 200, labelEvery = 1, unit = '' }) {
  const width = 1000;
  const pad = { top: 12, right: 8, bottom: 26, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const { max, step } = niceScale(Math.max(...data.map((d) => Math.abs(d.value))));
  const y = (v) => pad.top + plotH / 2 - (v / max) * (plotH / 2);
  const slot = plotW / data.length;
  const barW = Math.min(Math.max(2, slot - 2), 56);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group' });

  for (let v = -max; v <= max + 1e-9; v += step) {
    if (Math.abs(v) < 1e-9) continue;
    svg.append(svgEl('line', { class: 'gridline', x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v) }));
    const tick = svgEl('text', { class: 'tick', x: pad.left - 8, y: y(v) + 3.5, 'text-anchor': 'end' });
    tick.textContent = signed(v, Number.isInteger(step) ? 0 : 1);
    svg.append(tick);
  }

  data.forEach((d, i) => {
    const x = pad.left + i * slot + (slot - barW) / 2;
    const zero = y(0);
    const top = Math.min(zero, y(d.value));
    const group = svgEl('g');
    group.append(svgEl('rect', { class: 'bar-hit', x: pad.left + i * slot, y: pad.top, width: slot, height: plotH }));
    group.append(svgEl('rect', {
      class: d.value >= 0 ? 'bar' : 'bar bar-down',
      x,
      y: top,
      width: barW,
      height: Math.max(1, Math.abs(y(d.value) - zero)),
      rx: Math.min(4, barW / 2),
    }));
    svg.append(hoverable(group, d.tip));

    if (i % labelEvery === 0) {
      const label = svgEl('text', {
        class: 'tick', x: pad.left + i * slot + slot / 2, y: height - 8, 'text-anchor': 'middle',
      });
      label.textContent = d.label;
      svg.append(label);
    }
  });

  svg.append(svgEl('line', { class: 'axis', x1: pad.left, x2: width - pad.right, y1: y(0), y2: y(0) }));
  return svg;
}

const SEQ_STEPS = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--seq-6'];

/**
 * Rows of cells on one sequential blue ramp, light to dark. A null value is an empty
 * cell; `domain` fixes the two ends of the ramp instead of taking them from the data.
 */
function heatmap({ columns, rows, value, cellW = 11, cellH = 26, labelEvery = 5, domain = null, tipFor }) {
  const pad = { top: 8, right: 8, bottom: 20, left: 74 };
  const width = pad.left + columns.length * cellW + pad.right;
  const height = pad.top + rows.length * cellH + pad.bottom;
  let lo = Infinity;
  let hi = -Infinity;
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < columns.length; c += 1) {
      const v = value(r, c);
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (domain) [lo, hi] = domain;
  const stepFor = (v) => {
    if (v == null) return '--seq-0';
    if (hi === lo) return SEQ_STEPS[Math.floor(SEQ_STEPS.length / 2)];
    const t = Math.max(0, (v - lo) / (hi - lo));
    return SEQ_STEPS[Math.min(SEQ_STEPS.length - 1, Math.floor(t * SEQ_STEPS.length))];
  };

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', width, height });
  rows.forEach((rowLabel, r) => {
    const label = svgEl('text', {
      class: 'tick', x: pad.left - 8, y: pad.top + r * cellH + cellH / 2 + 3.5, 'text-anchor': 'end',
    });
    label.textContent = rowLabel;
    svg.append(label);
    columns.forEach((colLabel, c) => {
      const cell = svgEl('rect', {
        class: 'heat-cell',
        x: pad.left + c * cellW,
        y: pad.top + r * cellH,
        width: cellW,
        height: cellH,
        fill: `var(${stepFor(value(r, c))})`,
      });
      svg.append(hoverable(cell, tipFor(r, c)));
    });
  });
  columns.forEach((colLabel, c) => {
    if (c % labelEvery !== 0 && c !== columns.length - 1) return;
    const label = svgEl('text', {
      class: 'tick', x: pad.left + c * cellW + cellW / 2, y: height - 6, 'text-anchor': 'middle',
    });
    label.textContent = colLabel;
    svg.append(label);
  });
  return { svg, lo, hi };
}

const SWATCH = { ref: 'swatch ref', down: 'swatch down', bar: 'swatch' };

function legend(...entries) {
  return el('p', { class: 'legend' }, entries.map(([kind, text]) =>
    el('span', {}, el('i', { class: SWATCH[kind] ?? SWATCH.bar }), text)));
}

function scaleLegend(lo, hi, unit = '') {
  return el('p', { class: 'scale' },
    `${num(lo)}${unit}`,
    el('span', { class: 'steps' }, SEQ_STEPS.map((step) =>
      el('i', { style: `background: var(${step})` }))),
    `${num(hi)}${unit}`);
}

// --------------------------------------------------------------------- tables

/**
 * A sortable table. Columns declare how to read and render a row, so sorting works on
 * the raw value while the cell shows the formatted one.
 */
function table(columns, rows, { sortKey, desc = true, caption = null, limit = null } = {}) {
  const state = { key: sortKey ?? columns[0].key, desc };

  const head = el('tr', {}, columns.map((col) => {
    const th = el('th', {
      scope: 'col',
      title: col.title ?? null,
      'aria-sort': col.sortable === false ? null : 'none',
    }, col.label);
    if (col.sortable !== false) {
      th.addEventListener('click', () => {
        if (state.key === col.key) state.desc = !state.desc;
        else { state.key = col.key; state.desc = col.startAscending !== true; }
        render();
      });
    }
    return th;
  }));

  const tbody = el('tbody');
  const node = el('div', { class: 'scroll' },
    el('table', {}, caption ? el('caption', { class: 'help', text: caption }) : null,
      el('thead', {}, head), tbody));

  function render() {
    const col = columns.find((c) => c.key === state.key) ?? columns[0];
    const read = (row) => (col.sortValue ? col.sortValue(row) : row[col.key]);
    const sorted = [...rows].sort((a, b) => {
      const x = read(a);
      const y = read(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (x === y) return (a.number ?? 0) - (b.number ?? 0);
      return state.desc ? (y > x ? 1 : -1) : (x > y ? 1 : -1);
    });
    tbody.replaceChildren(...(limit ? sorted.slice(0, limit) : sorted).map((row) =>
      el('tr', {}, columns.map((c) => {
        const cell = c.cell ? c.cell(row) : num(row[c.key]);
        return el('td', { class: c.class ?? null },
          cell instanceof Node ? cell : String(cell));
      }))));
    head.querySelectorAll('th').forEach((th, i) => {
      if (columns[i].sortable === false) return;
      th.setAttribute('aria-sort', columns[i].key === state.key ? (state.desc ? 'descending' : 'ascending') : 'none');
    });
  }

  render();
  return node;
}

const card = (title, help, ...body) => el('section', { class: 'card' },
  el('h2', { text: title }), help ? el('p', { class: 'help', html: help }) : null, body);

const tile = (key, value, note) => el('div', { class: 'tile' },
  el('span', { class: 'k', text: key }),
  el('div', { class: 'v', text: value }),
  note ? el('span', { class: 'n', text: note }) : null);

// ---------------------------------------------------------------------- state

const state = {
  meta: null,
  wheel: 'napoli',
  period: 'all',
  tab: DEFAULT_TAB,
  spy: 1,
  cache: new Map(),
  draws: null,
  grid: null,
  formula: {
    listing: null, period: '1', cleanOnly: false, isotopicOnly: false, wonOnly: false,
    colpi: 20, play: 'match', kind: 'all', view: 'matches',
  },
};

const wheelName = (id) => LABELS.wheels[id] ?? id;
const periodName = (id) => LABELS.periods[id] ?? id;
const periodIn = (id) => LABELS.periodsIn[id] ?? id;

async function wheelData(id) {
  if (!state.cache.has(id)) {
    const entry = state.meta.wheels.find((w) => w.id === id);
    const response = await fetch(`data/${entry.file}`);
    if (!response.ok) throw new Error(`${entry.file}: ${response.status}`);
    state.cache.set(id, await response.json());
  }
  return state.cache.get(id);
}

// ------------------------------------------------------------------- renderers

// A row's colour steps up at these delays, so the long absences stand out at the top.
const DELAY_TIERS = [10, 30, 50, 80, 120];
const delayTier = (delay) => DELAY_TIERS.filter((from) => delay >= from).length;

/** Every wheel's numbers by delay and position. Fetched once, and only for this tab. */
async function boardGrid() {
  if (!state.grid) {
    const response = await fetch('data/board.json');
    if (!response.ok) throw new Error(`board.json: ${response.status}`);
    state.grid = await response.json();
  }
  return state.grid;
}

/**
 * The tabellone as it is printed: a row per delay, the longest at the top and the last
 * draw at the bottom; five columns per wheel, one per position. A number sits once per
 * wheel, on the row of its delay, in the position it last came out in.
 */
function gridTable(grid) {
  const POSITIONS = [0, 1, 2, 3, 4];
  // Per wheel, the numbers indexed by delay and then by position.
  const wheels = Object.entries(grid.wheels).map(([id, wheel]) => {
    const rows = [];
    for (const entry of wheel.numbers) {
      if (entry.position) (rows[entry.delay] ??= [])[entry.position - 1] = entry;
    }
    return { id, rows, max: rows.length - 1 };
  });
  const top = Math.max(...wheels.map((wheel) => wheel.max));
  const delays = Array.from({ length: top + 1 }, (_, i) => top - i);

  return el('table', { class: 'grid' },
    el('thead', {},
      el('tr', {},
        el('th', { scope: 'col', rowspan: 2, class: 'rail', text: 'Rit.' }),
        wheels.map((wheel) => el('th', {
          scope: 'colgroup', colspan: 5, class: wheel.id === state.wheel ? 'edge on' : 'edge',
        }, wheelName(wheel.id), el('small', { text: `rit. max ${num(wheel.max)}` })))),
      el('tr', {}, wheels.flatMap(() => POSITIONS.map((p) => el('th', {
        scope: 'col', class: p ? null : 'edge', text: `${p + 1}ª`,
      }))))),
    el('tbody', {}, delays.map((delay) => el('tr', { class: `t${delayTier(delay)}` },
      el('th', { scope: 'row', text: String(delay) }),
      wheels.flatMap((wheel) => POSITIONS.map((p) => {
        const entry = wheel.rows[delay]?.[p];
        return el('td', {
          class: [p ? '' : 'edge', delay > wheel.max ? 'out' : '', entry ? 'full' : '']
            .filter(Boolean).join(' ') || null,
          title: entry && `${entry.number} su ${wheelName(wheel.id)}: ritardo ${num(delay)}, ` +
            `${p + 1}ª posizione, ultima uscita ${date(entry.last_seen)}`,
          text: entry ? String(entry.number) : '',
        });
      }))))));
}

function renderGrid() {
  const box = el('div', { class: 'grid-box' }, el('p', { class: 'help', text: 'Caricamento…' }));
  boardGrid()
    .then((grid) => box.replaceChildren(gridTable(grid)))
    .catch((error) => box.replaceChildren(el('p', {
      class: 'help', text: `Impossibile caricare il tabellone (${error.message}).`,
    })));
  return card('Tabellone analitico',
    `Le righe sono i <strong>ritardi</strong>: in basso la riga 0, l'ultima estrazione per
     intero; salendo si va indietro nel tempo. Le colonne sono i cinque estratti di ogni
     ruota. Ogni numero compare <strong>una sola volta per ruota</strong>, alla riga del suo
     ritardo e nella posizione in cui è uscito: se è già comparso più in basso la cella resta
     vuota. Le celle isolate in cima sono i ritardatari. Il ritardo conta le estrazioni di
     quella ruota.`,
    box,
    el('div', { class: 'legend' },
      el('span', { text: 'Ritardo' }),
      DELAY_TIERS.map((from, i) => el('span', {},
        el('span', { class: `swatch t${i + 1}` }), `da ${from}`))));
}

function renderTabellone(data) {
  const board = data.tabellone;
  const expected = board.expected[state.period];
  const rows = board.numbers.map((row) => ({
    ...row,
    freq: row.frequency[state.period],
    gap: row.frequency[state.period] - expected,
  }));

  const columns = [
    { key: 'number', label: 'N°', class: 'num', cell: (r) => String(r.number), startAscending: true },
    { key: 'delay', label: 'Ritardo', title: 'Estrazioni della ruota dall\'ultima uscita' },
    { key: 'freq', label: 'Frequenza', title: `Uscite ${periodIn(state.period)}` },
    {
      key: 'gap',
      label: 'Scarto',
      title: 'Differenza fra frequenza osservata e attesa',
      cell: (r) => el('span', { class: r.gap >= 0 ? 'over' : 'under', text: signed(r.gap) }),
    },
    { key: 'max_delay', label: 'Ritardo max' },
    { key: 'last_seen', label: 'Ultima uscita', class: 'dim', cell: (r) => date(r.last_seen) },
  ];

  return el('div', {}, renderGrid(), card(`I 90 numeri · ${wheelName(state.wheel)}`,
    `Una riga per ognuno dei 90 numeri. <strong>Ritardo</strong>, <strong>ritardo max</strong> e
     <strong>ultima uscita</strong> sono sempre calcolati su tutta la storia della ruota
     (${num(board.draws)} estrazioni); la <strong>frequenza</strong> segue il periodo scelto.
     Lo scarto è la differenza dalla frequenza attesa, ${dec2(expected)} uscite per numero.
     Clicca un'intestazione per ordinare.`,
    table(columns, rows, { sortKey: 'delay', desc: true })));
}

function renderRitardi(data) {
  const board = data.tabellone;
  const top = [...board.numbers].sort((a, b) => b.delay - a.delay).slice(0, 25);
  const data25 = top.map((row) => ({
    label: String(row.number),
    value: row.delay,
    mark: row.max_delay,
    tip: `<b>Numero ${row.number}</b><br>Ritardo attuale: <b>${num(row.delay)}</b><br>` +
      `Ritardo massimo storico: <b>${num(row.max_delay)}</b><br>Ultima uscita: ${date(row.last_seen)}`,
  }));
  const atRecord = top.filter((row) => row.delay >= row.max_delay);

  const columns = [
    { key: 'number', label: 'N°', class: 'num', cell: (r) => String(r.number), startAscending: true },
    { key: 'delay', label: 'Ritardo' },
    { key: 'max_delay', label: 'Ritardo max' },
    {
      key: 'share',
      label: '% del massimo',
      sortValue: (r) => r.delay / r.max_delay,
      cell: (r) => `${dec((r.delay / r.max_delay) * 100)}%`,
    },
    { key: 'last_seen', label: 'Ultima uscita', class: 'dim', cell: (r) => date(r.last_seen) },
  ];

  return el('div', {},
    card('I 25 numeri più ritardatari',
      'La barra è il ritardo attuale, il segno verticale il ritardo massimo mai registrato ' +
      'su questa ruota. Le due grandezze sono sulla stessa scala. ' +
      (atRecord.length
        ? `In questo momento ${atRecord.length === 1 ? 'un numero è' : `${atRecord.length} numeri sono`} ` +
          `al proprio record: ${atRecord.map((r) => r.number).join(', ')}.`
        : 'Nessuno di questi numeri è al proprio record storico.'),
      el('figure', {}, bulletChart({ data: data25 }),
        legend(['bar', 'Ritardo attuale'], ['ref', 'Ritardo massimo storico']))),
    card('Ritardi in tabella', null, table(columns, top, { sortKey: 'delay', desc: true })));
}

function renderFrequenze(data) {
  const board = data.tabellone;
  const expected = board.expected[state.period];
  const drawsIn = board.window_draws[state.period];
  const bars = board.numbers.map((row) => {
    const freq = row.frequency[state.period];
    return {
      label: String(row.number),
      value: freq,
      tip: `<b>Numero ${row.number}</b><br>Uscite: <b>${num(freq)}</b><br>` +
        `Attese: ${dec2(expected)}<br>Scarto: ${signed(freq - expected)}`,
    };
  });

  const cards = [
    card('Frequenza dei 90 numeri',
      `Uscite di ogni numero ${periodIn(state.period)}
       (${num(drawsIn)} estrazioni). La linea è la frequenza attesa se i numeri fossero
       equiprobabili: ${dec2(expected)} uscite ciascuno. I valori esatti sono nel tabellone.`,
      el('figure', {}, barChart({ data: bars, height: 260, labelEvery: 5, reference: expected }),
        legend(['bar', 'Uscite osservate'], ['ref', 'Frequenza attesa']))),
  ];

  if (data.five_numbers) {
    const counts = data.positions[state.period];
    const map = heatmap({
      columns: NUMBERS.map(String),
      rows: ['1ª', '2ª', '3ª', '4ª', '5ª'],
      value: (r, c) => counts[c][r],
      tipFor: (r, c) => `<b>Numero ${c + 1}</b><br>${r + 1}ª posizione: <b>${num(counts[c][r])}</b> uscite`,
    });
    cards.push(card('Frequenza per posizione di estrazione',
      'Quante volte ogni numero è uscito come primo, secondo, … quinto estratto. ' +
      'Le cinque posizioni sono equiprobabili: questa tabella serve a mostrarlo, ed è ' +
      "l'unico posto in cui l'ordine di estrazione viene usato.",
      el('figure', {}, el('div', { class: 'scroll' }, map.svg),
        scaleLegend(map.lo, map.hi, ' uscite'))));
  }

  return el('div', {}, cards);
}

function renderAmbi(data) {
  if (!data.five_numbers) return unavailable('gli ambi non si possono calcolare');
  const pairs = data.pairs;
  const expected = pairs.expected[state.period];

  const pairCell = (r) => el('span', {}, el('b', { text: `${r.a} · ${r.b}` }));
  const frequent = [
    { key: 'pair', label: 'Ambo', sortable: false, cell: pairCell },
    { key: 'frequency', label: 'Uscite' },
    {
      key: 'ratio',
      label: 'Volte l\'attesa',
      sortValue: (r) => r.frequency / (expected || 1),
      cell: (r) => (expected ? `${dec(r.frequency / expected)}×` : '—'),
    },
    { key: 'delay', label: 'Ritardo' },
    { key: 'last_seen', label: 'Ultima uscita', class: 'dim', cell: (r) => date(r.last_seen) },
  ];
  const delayed = [
    { key: 'pair', label: 'Ambo', sortable: false, cell: pairCell },
    { key: 'delay', label: 'Ritardo' },
    { key: 'max_delay', label: 'Ritardo max' },
    { key: 'frequency', label: 'Uscite in totale' },
    { key: 'last_seen', label: 'Ultima uscita', class: 'dim', cell: (r) => date(r.last_seen) },
  ];

  return el('div', {},
    card('Ambi più frequenti',
      `Le ${num(pairs.possible_pairs)} coppie possibili su una ruota, e le 60 uscite più
       spesso ${periodIn(state.period)}. Ogni estrazione produce dieci
       ambi, quindi in questo periodo ogni coppia si aspetta <strong>${dec2(expected)}</strong>
       uscite. Su un archivio lungo la distanza fra le prime e le ultime della classifica è
       quasi tutta rumore: la colonna «volte l'attesa» dice di quanto.`,
      table(frequent, pairs.most_frequent[state.period], { sortKey: 'frequency', desc: true })),
    card('Ambi più ritardatari',
      'Le coppie che mancano da più tempo, su tutta la storia della ruota — questa ' +
      'classifica non dipende dal periodo scelto.',
      table(delayed, pairs.most_delayed, { sortKey: 'delay', desc: true })));
}

function renderGruppi(data) {
  const cards = Object.entries(LABELS.groupings).map(([id, meta]) => {
    const groups = data.groups[id].groups;
    const bars = groups.map((g) => {
      const seen = g.frequency[state.period];
      const want = g.expected[state.period];
      return {
        label: g.span,
        value: seen - want,
        tip: `<b>${meta.unit} ${g.span}</b><br>Uscite: <b>${num(seen)}</b><br>` +
          `Attese: ${dec2(want)}<br>Scarto: <b>${signed(seen - want, 1)}</b><br>` +
          `Ritardo del gruppo: ${num(g.delay)}`,
      };
    });
    const columns = [
      { key: 'span', label: meta.unit, class: 'num', sortable: false, cell: (r) => r.span },
      { key: 'freq', label: 'Uscite', sortValue: (r) => r.frequency[state.period], cell: (r) => num(r.frequency[state.period]) },
      {
        key: 'gap',
        label: 'Scarto',
        sortValue: (r) => r.frequency[state.period] - r.expected[state.period],
        cell: (r) => {
          const gap = r.frequency[state.period] - r.expected[state.period];
          return el('span', { class: gap >= 0 ? 'over' : 'under', text: signed(gap, 1) });
        },
      },
      { key: 'delay', label: 'Ritardo' },
      { key: 'max_delay', label: 'Ritardo max' },
    ];
    return card(meta.title, meta.help,
      el('figure', {},
        el('figcaption', { text: "Scarto dalle uscite attese. Lo zero è l'equiprobabilità." }),
        deviationChart({ data: bars, height: 190 }),
        legend(['bar', "Sopra l'attesa"], ['down', "Sotto l'attesa"])),
      el('div', { style: 'margin-top:16px' }, table(columns, groups, { sortKey: 'freq', desc: true })));
  });

  return el('div', {},
    el('section', { class: 'card' },
      el('h2', { text: 'Cadenze, figure e decine' }),
      el('p', {
        class: 'help',
        html: 'Tre modi classici di raggruppare i 90 numeri. Il <strong>ritardo</strong> qui è ' +
          "il numero di estrazioni in cui il gruppo non è uscito <em>affatto</em>: con cinque " +
          'numeri per estrazione un gruppo esce quasi sempre, quindi un ritardo di otto su una ' +
          'cadenza è un evento raro, non una attesa modesta come sarebbe per un singolo numero.',
      })),
    cards);
}

function renderDistribuzioni(data) {
  if (!data.five_numbers) return unavailable('le distribuzioni non si possono calcolare');
  const dist = data.distributions[state.period];

  const histogram = (title, help, series, labelFor) => {
    const bars = series.observed.map((value, k) => ({
      label: labelFor(k),
      value,
      mark: series.expected[k],
      tip: `<b>${labelFor(k)}</b><br>Estrazioni: <b>${num(value)}</b><br>Attese: ${dec(series.expected[k])}`,
    }));
    return card(title, help,
      el('figure', {}, barChart({ data: bars, height: 200 }),
        legend(['bar', 'Estrazioni osservate'], ['ref', 'Estrazioni attese'])));
  };

  const sum = dist.sum;
  const sumBars = sum.bins.map((bin) => ({
    label: String(bin.from),
    value: bin.count,
    tip: `<b>Somma ${bin.from}–${bin.to}</b><br>Estrazioni: <b>${num(bin.count)}</b>`,
  }));

  return el('div', {},
    histogram('Pari e dispari',
      `Quanti dei cinque estratti sono dispari, su ${num(dist.draws)} estrazioni. 45 dei 90
       numeri sono dispari, quindi l'atteso è la distribuzione ipergeometrica di cinque
       estratti su 90 senza reimmissione — non la binomiale, che gonfierebbe le code.`,
      dist.odd, (k) => `${k} disp.`),
    histogram('Alti e bassi',
      'Quanti dei cinque estratti stanno da 46 a 90. Stesso atteso dei pari e dispari, ' +
      'perché anche qui il taglio divide i 90 numeri in due metà da 45.',
      dist.high, (k) => `${k} alti`),
    card('Somma dei cinque estratti',
      `Distribuzione della somma, in classi da 10. Il minimo possibile è 15 (1+2+3+4+5) e il
       massimo 440 (86+…+90); in archivio si va da ${num(sum.min)} a ${num(sum.max)}.`,
      el('div', { class: 'tiles' },
        tile('Media', dec(sum.mean), 'attesa 227,5'),
        tile('Mediana', dec(sum.median)),
        tile('Minimo', num(sum.min)),
        tile('Massimo', num(sum.max))),
      el('figure', {}, barChart({ data: sumBars, height: 200, labelEvery: 5 }),
        legend(['bar', 'Estrazioni']))));
}

function renderSpie(data) {
  if (!data.five_numbers) return unavailable('i numeri spia non si possono calcolare');
  const entry = data.followers.find((f) => f.number === state.spy) ?? data.followers[0];

  const grid = el('div', { class: 'numgrid' }, NUMBERS.map((n) => el('button', {
    type: 'button',
    'aria-pressed': n === state.spy ? 'true' : 'false',
    text: String(n),
    onclick: () => { state.spy = n; syncHash(); render(); },
  })));

  const columns = [
    { key: 'number', label: 'Numero seguente', class: 'num', cell: (r) => String(r.number), startAscending: true },
    { key: 'count', label: 'Volte', title: 'Quante volte è uscito nell\'estrazione successiva' },
    { key: 'expected', label: 'Attese', cell: (r) => dec(r.expected) },
    { key: 'lift', label: 'Rapporto', cell: (r) => (r.lift == null ? '—' : `${dec2(r.lift)}×`) },
    {
      key: 'z',
      label: 'Scarto (σ)',
      title: 'Scostamento in deviazioni standard: sotto 3 è rumore',
      cell: (r) => el('span', {
        class: r.z != null && Math.abs(r.z) >= 3 ? 'under' : 'dim',
        text: r.z == null ? '—' : signed(r.z, 1),
      }),
    },
  ];

  return el('div', {},
    card('Numeri spia',
      "Che cosa esce nell'estrazione <em>successiva</em> a quella in cui è uscito un numero. " +
      'Scegli il numero spia:',
      grid),
    card(`Dopo il ${entry.number}, su ${wheelName(state.wheel)}`,
      `Il ${entry.number} è uscito <strong>${num(entry.occurrences)}</strong> volte con
       un'estrazione successiva in archivio. La colonna da leggere è lo <strong>scarto in
       σ</strong>: le attese sono intorno a ${dec(entry.followed_by[0]?.expected ?? 0)} e la loro
       deviazione standard intorno a ${dec(Math.sqrt(entry.followed_by[0]?.expected ?? 0))}, quindi
       sotto 3σ non c'è niente da vedere. Su una ruota ci sono 8100 coppie ordinate: qualche
       scarto oltre 3σ si presenta comunque per caso.`,
      table(columns, entry.followed_by, { sortKey: 'count', desc: true })));
}

function verdict(p) {
  return p >= 0.01
    ? el('span', { class: 'verdict ok', text: 'compatibile con l\'equiprobabilità' })
    : el('span', { class: 'verdict watch', text: 'scostamento da verificare' });
}

function renderVerifica(data) {
  const test = data.uniformity[state.period];

  const wheels = state.meta.wheels.map((w) => ({
    ...w,
    ...state.meta.uniformity[w.id],
    name: wheelName(w.id),
  }));
  const wheelColumns = [
    { key: 'name', label: 'Ruota', sortable: false, cell: (r) => r.name },
    { key: 'draws', label: 'Estrazioni' },
    { key: 'chi_square', label: 'Chi quadro', cell: (r) => dec(r.chi_square) },
    { key: 'p', label: 'p', cell: (r) => dec2(r.p) },
    { key: 'ok', label: 'Esito', sortable: false, cell: (r) => verdict(r.p) },
  ];

  const years = state.meta.coverage.by_year.map((row) => ({
    label: String(row.year),
    value: row.draws,
    tip: `<b>${row.year}</b><br>Estrazioni: <b>${num(row.draws)}</b>`,
  }));
  const weekdays = state.meta.coverage.by_weekday.map((row) => ({
    label: LABELS.weekdays[row.weekday].slice(0, 3),
    value: row.draws,
    tip: `<b>${LABELS.weekdays[row.weekday]}</b><br>Estrazioni: <b>${num(row.draws)}</b>`,
  }));
  const coverage = state.meta.coverage.by_wheel.map((row) => ({
    ...row, name: wheelName(row.wheel),
  }));
  const coverageColumns = [
    { key: 'name', label: 'Ruota', sortable: false, cell: (r) => r.name },
    { key: 'draws', label: 'Estrazioni' },
    { key: 'first', label: 'Prima', class: 'dim', cell: (r) => date(r.first) },
    { key: 'last', label: 'Ultima', class: 'dim', cell: (r) => date(r.last) },
  ];

  return el('div', {},
    card(`Le estrazioni di ${wheelName(state.wheel)} sono uniformi?`,
      'Test del chi quadro sulle frequenze dei 90 numeri. Misura se gli scostamenti ' +
      'osservati dalla frequenza attesa superano quelli che il caso produce comunque. ' +
      'Un valore di p alto significa «nessuno scostamento oltre il rumore»; sotto 0,01 ' +
      'ci sarebbe qualcosa da spiegare.',
      el('div', { class: 'tiles' },
        tile('Chi quadro', dec(test.chi_square), `${num(test.df)} gradi di libertà`),
        tile('p', dec2(test.p)),
        tile('Numeri estratti', num(test.drawn), `attesi ${dec2(test.expected)} per numero`)),
      el('p', {}, verdict(test.p)),
      el('p', {
        class: 'help',
        html: 'È la statistica più importante di questa pagina, ed è anche il motivo per cui ' +
          'nessuna delle altre schede può essere usata per prevedere: se le frequenze non si ' +
          "scostano dall'equiprobabilità più di quanto faccia il caso, un ritardo lungo non è " +
          "l'annuncio di un'uscita.",
      })),
    card('Tutte le ruote, su tutto l\'archivio', null,
      table(wheelColumns, wheels, { sortKey: 'chi_square', desc: true })),
    card('Estrazioni per anno',
      'Quanto è densa la copertura dell\'archivio. Una estrazione a settimana fino al 1997, ' +
      'due dal 1997, tre dal 2005, quattro dal 2023.',
      el('figure', {}, barChart({ data: years, height: 200, labelEvery: 5 }), legend(['bar', 'Estrazioni']))),
    card('Estrazioni per giorno della settimana',
      'Il calendario è cambiato molte volte: il sabato domina un secolo di storia, il ' +
      'venerdì è giorno fisso solo dal 2023, e prima compare per qualche estrazione ' +
      'straordinaria. Per questo il calendario va letto dai dati e non assunto.',
      el('figure', {}, barChart({ data: weekdays, height: 170 }), legend(['bar', 'Estrazioni']))),
    card('Da quando gioca ogni ruota', null,
      table(coverageColumns, coverage, { sortKey: 'draws', desc: true })));
}

function unavailable(clause) {
  return el('div', { class: 'card' }, el('p', { class: 'unavailable' },
    `«${wheelName(state.wheel)}» unisce i numeri di tutte le ruote di una data, quindi una ` +
    `voce dell'archivio non è una cinquina e ${clause}. Scegli una ruota singola.`));
}

// -------------------------------------------------------------------- formulas

/** Every draw of the archive, oldest first. Fetched once, and only for this tab. */
async function allDraws() {
  if (!state.draws) {
    const response = await fetch('data/draws.json');
    if (!response.ok) throw new Error(`draws.json: ${response.status}`);
    state.draws = (await response.json()).draws;
  }
  return state.draws;
}

/**
 * One draw as a matrix — a wheel per row, a position per column — with some cells lit:
 * `lit` gives a cell its class, or nothing.
 */
function showDraw(draw, lit, note) {
  const dialog = document.getElementById('draw');
  dialog.replaceChildren(
    el('h2', { text: `Estrazione del ${date(draw.date)} · concorso ${draw.contest}` }),
    el('p', { class: 'help', text: note }),
    el('table', { class: 'matrix' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', text: 'Ruota' }),
        [1, 2, 3, 4, 5].map((p) => el('th', { scope: 'col', text: `${p}ª` })))),
      el('tbody', {}, Object.entries(draw.wheels).map(([wheel, numbers]) => el('tr', {},
        el('th', { scope: 'row', text: wheelName(wheel) }),
        numbers.map((n) => el('td', { class: lit(wheel, n), text: String(n) })))))),
    el('form', { method: 'dialog' }, el('button', { text: 'Chiudi' })));
  dialog.showModal();
}

/** One formula in full: its search numbers, every bet it plays, and how it fared. */
function showFormula(formula, listing, found) {
  const kinds = BET_ORDER.filter((name) => formula.bets[name].length);
  const balls = (numbers) => numbers.map((n) => el('span', { class: 'ball', text: String(n) }));
  const dialog = document.getElementById('draw');
  dialog.replaceChildren(
    el('h2', { text: `Formula ${formula.index} · ${listing.name}` }),
    el('p', {
      class: 'help',
      text: `${num(found.length)} ${found.length === 1 ? 'riscontro' : 'riscontri'} nel periodo, ` +
        `${num(found.filter((match) => match.isotopic).length)} con isotopia; ` +
        `l'ultimo il ${date(found[found.length - 1].date)}.`,
    }),
    el('div', { class: 'bets' },
      el('div', {},
        el('span', { class: 'kind', text: 'ricerca' }),
        el('span', { class: 'bet' }, balls(formula.numbers))),
      kinds.map((name) => el('div', {},
        el('span', { class: 'kind', text: name }),
        formula.bets[name].map((numbers) => el('span', { class: 'bet' }, balls(numbers)))))),
    // replaceChildren would print a null, so the note is spread in only when it exists.
    ...(kinds.length ? [] : [el('p', { class: 'help', text: 'La formula non ha giocate.' })]),
    el('form', { method: 'dialog' }, el('button', { text: 'Chiudi' })));
  dialog.showModal();
}

/** How a played bet fared: lost, still open, or won — and then the draw that did it. */
function outcomeNode(bet, byDate) {
  const { outcome } = bet;
  if (outcome.state === 'lost') return el('span', { class: 'outcome', text: 'persa' });
  if (outcome.state === 'open') {
    return el('span', {
      class: 'outcome open', text: `in corso, ${outcome.colpi} di ${state.formula.colpi} colpi`,
    });
  }
  return el('button', {
    type: 'button',
    class: 'link outcome won',
    title: 'Mostra l\'estrazione vincente',
    text: `vinta al ${outcome.colpo}° colpo su ${outcome.wheels.map(wheelName).join(' e ')}`,
    onclick: (event) => {
      event.stopPropagation();
      showDraw(byDate.get(outcome.date),
        (wheel, n) => (outcome.wheels.includes(wheel) && bet.numbers.includes(n) ? 'hit' : null),
        `Giocata ${bet.numbers.join('-')} uscita al ${outcome.colpo}° colpo.`);
    },
  });
}

/** A checked bet: its numbers, and when the retrovisione burnt it, where and when. */
function betNode(bet, byDate) {
  const numbers = el('span', { class: bet.clean ? 'bet' : 'bet dirty' },
    bet.numbers.map((n) => el('span', { class: 'ball', text: String(n) })));
  if (bet.clean) return el('span', {}, numbers, outcomeNode(bet, byDate));
  const { seen } = bet;
  return el('span', {}, numbers, el('button', {
    type: 'button',
    class: 'link dirty',
    title: 'Mostra l\'estrazione che sporca la giocata',
    text: `sporca: ${seen.number} su ${wheelName(seen.wheel)} il ${date(seen.date)}, ` +
      `${seen.position}ª posizione`,
    onclick: (event) => {
      event.stopPropagation();
      showDraw(byDate.get(seen.date),
        (wheel, n) => (bet.play.includes(wheel) && bet.numbers.includes(n) ? 'hit' : null),
        `Numeri della giocata ${bet.numbers.join('-')} già usciti sulle ruote del riscontro.`);
    },
  }));
}

function findingRow(match, byDate) {
  const kinds = BET_ORDER.filter((name) => match.bets[name].length);
  const draw = byDate.get(match.date);
  // The position of every search number found, wheel by wheel: a number is isotopo when
  // another wheel of the match holds a search number in the same position.
  const positions = Object.fromEntries(match.wheels.map((wheel) =>
    [wheel, match.found[wheel].map((n) => draw.wheels[wheel].indexOf(n))]));
  const lit = (wheel, n) => {
    if (!match.found[wheel]?.includes(n)) return null;
    const at = draw.wheels[wheel].indexOf(n);
    return match.wheels.some((other) => other !== wheel && positions[other].includes(at))
      ? 'hit iso'
      : 'hit';
  };
  return el('tr', {
    onclick: () => showDraw(draw, lit,
      `Numeri di ricerca della formula ${match.formula.index}: ${match.formula.numbers.join('-')}.` +
      (match.isotopic ? ' In blu scuro gli isotopi.' : '')),
  },
    // A real button, so the matrix is reachable from the keyboard; its click bubbles
    // to the row.
    el('td', {}, el('button', {
      type: 'button', class: 'link', title: 'Mostra l\'estrazione', text: date(match.date),
    })),
    el('td', {}, match.wheels.map((wheel) => el('span', { class: 'found' },
      wheelName(wheel), match.found[wheel].map((n) => el('span', { class: 'ball', text: String(n) }))))),
    el('td', {}, match.isotopic
      ? el('span', {
        // The check mark comes from .verdict.ok; the label keeps it readable aloud.
        class: 'verdict ok',
        role: 'img',
        'aria-label': 'isotopi',
        title: 'Isotopi: due numeri di ricerca nella stessa posizione su ruote diverse, anche se non sono lo stesso numero',
      })
      : el('span', {
        class: 'verdict no', role: 'img', 'aria-label': 'non isotopi', title: 'Nessuna isotopia',
      })),
    el('td', { class: 'bets' }, kinds.length
      ? kinds.map((name) => el('div', {},
        el('span', { class: 'kind', text: name }),
        // One bet per line: a dirty bet's note then sits beside its own numbers only.
        el('div', { class: 'stack' }, match.bets[name].map((bet) => betNode(bet, byDate)))))
      : 'nessuna giocata'));
}

/** The chance that a bet of `size` numbers comes out whole on one wheel in one draw. */
const hitChance = (size) =>
  [5, 4, 3, 2, 1].slice(0, size).reduce((p, left, k) => (p * left) / (90 - k), 1);

/** A match's bets of the chosen kind that were played: the dirty ones are not. */
const playedBets = (match) => BET_ORDER
  .filter((name) => ['all', name].includes(state.formula.kind))
  .flatMap((name) => match.bets[name])
  .filter((bet) => bet.clean);

/**
 * What a rate is made of: the played bets whose colpi have all been drawn. A bet that
 * won early in a window still running is left out with the ones that have not, or the
 * latest draws would count their wins and none of their losses.
 */
function tally(matches) {
  const out = { played: 0, won: 0, expected: 0, colpo: 0 };
  for (const bet of matches.flatMap(playedBets)) {
    if (bet.outcome.colpi < state.formula.colpi) continue;
    out.played += 1;
    out.expected += 1 - (1 - hitChance(bet.numbers.length)) ** bet.outcome.rows;
    if (bet.outcome.state === 'won') {
      out.won += 1;
      out.colpo += bet.outcome.colpo;
    }
  }
  if (!out.played) return { ...out, rate: null, chance: null, gap: null, sigma: null, mean: null };
  const rate = (100 * out.won) / out.played;
  const chance = (100 * out.expected) / out.played;
  const gap = rate - chance;
  // The gap in standard errors of the rate, so three bets do not outshine three thousand.
  // A certain win or a certain loss has no spread, and no gap either.
  const sigma = gap ? gap / Math.sqrt((chance * (100 - chance)) / out.played) : 0;
  return { ...out, rate, chance, gap, sigma, mean: out.won ? out.colpo / out.won : null };
}

const percent = (v) => (v == null ? '—' : `${dec(v)}%`);
const gapNode = (v) => el('span', { class: v > 0 ? 'over' : v < 0 ? 'under' : null, text: signed(v, 1) });

/** Formulas against time: how far above or below chance each one ran, period by period. */
function outcomeMap(rows, matches) {
  const years = matches.map((match) => Number(match.date.slice(0, 4)));
  const first = Math.min(...years);
  const last = Math.max(...years);
  const step = last - first > 15 ? 10 : 1;
  const bucket = (year) => Math.floor(year / step) * step;
  const columns = [];
  for (let year = bucket(first); year <= last; year += step) columns.push(year);

  const cells = rows.map((row) => {
    const byBucket = new Map();
    for (const match of row.found) {
      const key = bucket(Number(match.date.slice(0, 4)));
      if (!byBucket.has(key)) byBucket.set(key, []);
      byBucket.get(key).push(match);
    }
    return columns.map((key) => tally(byBucket.get(key) ?? []));
  });
  const period = (year) => (step === 10 ? `${year}-${String(year + 9).slice(2)}` : String(year));
  const map = heatmap({
    columns: columns.map(String),
    rows: rows.map((row) => row.label),
    value: (r, c) => cells[r][c].sigma,
    domain: [-3, 3],
    cellW: step === 10 ? 56 : 34,
    cellH: 18,
    labelEvery: 1,
    tipFor: (r, c) => {
      const cell = cells[r][c];
      const head = `<b>${rows[r].label}</b> · ${period(columns[c])}<br>`;
      return cell.played
        ? `${head}${num(cell.won)} vinte su ${num(cell.played)}: <b>${percent(cell.rate)}</b><br>` +
          `attesa ${percent(cell.chance)}, scarto <b>${signed(cell.gap, 1)}</b>`
        : `${head}nessuna giocata conclusa`;
    },
  });
  // Charts fill their card; this one keeps its cell size, however few its columns.
  map.svg.style.maxWidth = `${map.svg.getAttribute('width')}px`;
  return el('figure', {},
    el('div', { class: 'grid-box' }, map.svg),
    el('p', { class: 'scale' },
      'sotto il caso',
      el('span', { class: 'steps' }, SEQ_STEPS.map((step) => el('i', { style: `background: var(${step})` }))),
      'sopra il caso'));
}

/** When a formula's wins came, colpo by colpo, against when luck alone puts them. */
function colpoChart(found) {
  const { colpi } = state.formula;
  const won = Array(colpi).fill(0);
  const expected = Array(colpi).fill(0);
  for (const bet of found.flatMap(playedBets)) {
    const { outcome } = bet;
    if (outcome.colpi < colpi) continue;
    if (outcome.state === 'won') won[outcome.colpo - 1] += 1;
    // One draw's chance, from the rows the window really had; then a geometric wait.
    const miss = (1 - hitChance(bet.numbers.length)) ** (outcome.rows / colpi);
    for (let c = 0; c < colpi; c += 1) expected[c] += miss ** c * (1 - miss);
  }
  if (!won.some(Boolean)) return null;
  return el('figure', {},
    el('figcaption', { text: 'Giocate vinte per colpo' }),
    barChart({
      height: 160,
      labelEvery: Math.ceil(colpi / 20),
      data: won.map((value, c) => ({
        label: String(c + 1),
        value,
        mark: expected[c],
        tip: `<b>${c + 1}° colpo</b><br>${num(value)} vinte, attese ${dec(expected[c])}`,
      })),
    }),
    legend(['bar', 'vinte'], ['ref', 'attese per caso']));
}

function formulaResults(draws, listing, matches) {
  const byDate = new Map(draws.map((draw) => [draw.date, draw]));
  const byFormula = new Map();
  for (const match of matches) {
    if (!byFormula.has(match.formula)) byFormula.set(match.formula, []);
    byFormula.get(match.formula).push(match);
  }
  const bets = matches.flatMap((match) => Object.values(match.bets).flat());
  const total = tally(matches);
  const open = matches.flatMap(playedBets).filter((bet) => bet.outcome.state === 'open').length;

  const ranking = listing.formulas.filter((formula) => byFormula.has(formula)).map((formula) => {
    const found = byFormula.get(formula);
    return { formula, found, number: formula.index, matches: found.length, ...tally(found) };
  });
  const sectionOf = new Map();

  // "Won only" trims the list of matches and nothing else: the rates still count every
  // played bet, or each of them would read 100%.
  const won = (match) => ({
    ...match,
    bets: Object.fromEntries(Object.entries(match.bets).map(([name, played]) =>
      // A dirty bet was not played: it has no win to show, whatever its numbers did next.
      [name, played.filter((bet) => bet.clean && bet.outcome.state === 'won')])),
  });
  const sections = ranking.map(({ formula, found, played, rate, chance }) => {
    const listed = state.formula.wonOnly
      ? found.map(won).filter((match) => Object.values(match.bets).flat().length)
      : found;
    if (!listed.length) return null;
    const body = el('div', { class: 'scroll' });
    const section = el('details', {
      // A long scan finds thousands of matches: build a formula's rows when it is opened.
      ontoggle: (event) => {
        if (!event.target.open || body.firstChild) return;
        body.append(colpoChart(found) ?? '', el('table', { class: 'findings' },
          el('thead', {}, el('tr', {}, ['Estrazione', 'Numeri trovati', 'Isotopia', 'Giocate']
            .map((label) => el('th', { scope: 'col', text: label })))),
          el('tbody', {}, [...listed].reverse().map((match) => findingRow(match, byDate)))));
      },
    },
      el('summary', {},
        el('b', { text: `Formula ${formula.index}` }),
        el('span', { class: 'found' },
          formula.numbers.map((n) => el('span', { class: 'ball', text: String(n) }))),
        `${num(listed.length)} ${listed.length === 1 ? 'riscontro' : 'riscontri'}` +
          (state.formula.wonOnly ? ` con vincita su ${num(found.length)}` : ''),
        played ? ` · ${percent(rate)} vinte, attesa ${percent(chance)}` : '',
        el('button', {
          type: 'button',
          class: 'link',
          title: 'Mostra i numeri di ricerca e le giocate della formula',
          text: 'dettagli',
          // Inside a <summary>: keep the click from opening the formula's matches.
          onclick: (event) => { event.preventDefault(); showFormula(formula, listing, found); },
        })),
      body);
    sectionOf.set(formula, section);
    return section;
  }).filter(Boolean);

  const scored = ranking.filter((row) => row.played);
  const outcomes = scored.length ? [
    card('Classifica delle formule',
      `Per ogni formula, le giocate pulite i cui ${num(state.formula.colpi)} colpi sono già tutti ` +
      'estratti: quante hanno vinto, e quante avrebbero vinto <em>per caso</em> giocando numeri ' +
      'qualsiasi sulle stesse ruote per gli stessi colpi. Lo <strong>scarto</strong> è la ' +
      'differenza, in punti percentuali: con poche giocate oscilla molto da solo.',
      table([
        {
          key: 'number',
          label: 'Formula',
          startAscending: true,
          cell: (row) => el('button', {
            type: 'button',
            class: 'link',
            title: 'Vai ai riscontri della formula',
            text: `Formula ${row.number}`,
            onclick: () => {
              const section = sectionOf.get(row.formula);
              show('matches');
              // Not listed when only wins are shown and it has none.
              if (!section) return;
              section.open = true;
              section.scrollIntoView({ block: 'start' });
            },
          }),
        },
        { key: 'matches', label: 'Riscontri' },
        { key: 'played', label: 'Giocate', title: 'Giocate pulite con tutti i colpi estratti' },
        { key: 'won', label: 'Vinte' },
        { key: 'rate', label: 'Vinte %', cell: (row) => percent(row.rate) },
        { key: 'chance', label: 'Attesa %', cell: (row) => percent(row.chance) },
        { key: 'gap', label: 'Scarto', cell: (row) => gapNode(row.gap) },
        { key: 'mean', label: 'Colpo medio', title: 'Colpo medio delle giocate vinte', cell: (row) => dec(row.mean) },
      ], scored, { sortKey: 'gap' })),
    card('Nel tempo',
      'Lo scarto dall\'attesa di ogni formula, periodo per periodo, pesato per quante giocate ' +
      'lo sostengono: i due estremi della scala sono tre deviazioni standard sotto e sopra il ' +
      'caso, e il colore di mezzo è il caso. Una cella vuota non ha giocate concluse. La prima ' +
      'riga è il listato intero.',
      outcomeMap([
        { label: 'Listato', found: matches },
        ...scored.map((row) => ({ label: `Formula ${row.number}`, found: row.found })),
      ], matches)),
  ] : [];

  const unsettled = () => el('p', { class: 'unavailable', text: 'Nessuna giocata conclusa nel periodo.' });
  const panels = {
    matches: card('Riscontri', 'Formula per formula, dal riscontro più recente, con l\'esito di ogni giocata.',
      sections.length
        ? el('div', {}, sections)
        : el('p', { class: 'unavailable', text: 'Nessuna giocata vinta nel periodo.' })),
    ranking: outcomes[0] ?? unsettled(),
    time: outcomes[1] ?? unsettled(),
  };
  const tabs = el('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Risultati' },
    LABELS.formulaViews.map(([id, label]) => el('button', {
      type: 'button', role: 'tab', 'data-view': id, text: label, onclick: () => show(id),
    })));
  // All three are built once; a tab only chooses which one is in view.
  function show(view) {
    state.formula.view = view;
    syncHash();
    for (const [id, panel] of Object.entries(panels)) panel.hidden = id !== view;
    for (const tab of tabs.children) tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  }
  show(state.formula.view);

  return el('div', {}, card(listing.name, null,
    el('p', {
      class: 'help',
      text: `${num(listing.size)} numeri di ricerca su ${num(listing.wheels)} ruote, ` +
        `retrovisione di ${num(listing.lookback)} estrazioni. Apri una formula per vederne i ` +
        'riscontri, dal più recente; clicca un riscontro per vedere l\'estrazione.',
    }),
    el('div', { class: 'tiles' },
      tile('Formule', num(listing.formulas.length), `${num(byFormula.size)} con riscontri`),
      tile('Riscontri', num(matches.length),
        `${num(matches.filter((match) => match.isotopic).length)} con isotopia`),
      tile('Giocate', num(bets.length), `${num(bets.filter((bet) => !bet.clean).length)} sporche`),
      tile('Vinte', percent(total.rate),
        total.played ? `${num(total.won)} su ${num(total.played)}, attesa ${percent(total.chance)}` : 'nessuna giocata conclusa'),
      tile('Colpo medio', dec(total.mean), 'delle giocate vinte'),
      tile('In corso', num(open), 'giocate da seguire')),
    matches.length
      ? null
      : el('p', { class: 'unavailable', text: 'Nessun riscontro nel periodo.' })),
  matches.length ? [tabs, ...Object.values(panels)] : null);
}

function renderFormule() {
  const formula = state.formula;
  const out = el('div');
  const status = el('p', { class: 'help', role: 'status' });

  async function run() {
    if (!formula.listing) return;
    try {
      const draws = await allDraws();
      const last = draws[draws.length - 1].date;
      const since = formula.period === 'all'
        ? null
        : `${Number(last.slice(0, 4)) - Number(formula.period)}${last.slice(4)}`;
      status.textContent = '';
      // Filters on the report, not a different rule: what they hide was still found.
      // "Clean" drops the bets the retrovisione burnt and keeps the others; a match goes
      // only when every bet it had is gone. scripts/formula.py --clean is stricter: one
      // burnt bet there drops the whole match.
      const matches = scanListing(
        draws, formula.listing, since, formula.colpi, formula.play,
      ).filter((match) => !formula.isotopicOnly || match.isotopic).flatMap((match) => {
        if (!formula.cleanOnly) return [match];
        const all = Object.values(match.bets).flat();
        if (all.length && all.every((bet) => !bet.clean)) return [];
        return [{
          ...match,
          bets: Object.fromEntries(Object.entries(match.bets).map(([name, bets]) =>
            [name, bets.filter((bet) => bet.clean)])),
        }];
      });
      out.replaceChildren(formulaResults(draws, formula.listing, matches));
    } catch (error) {
      status.textContent = `Impossibile caricare le estrazioni (${error.message}).`;
    }
  }

  const file = el('input', {
    type: 'file',
    id: 'listing',
    accept: '.json,application/json',
    onchange: async () => {
      if (!file.files[0]) return;
      try {
        formula.listing = readListing(JSON.parse(await file.files[0].text()));
      } catch (error) {
        formula.listing = null;
        out.replaceChildren();
        status.textContent = `Listato non valido: ${error.message}`;
        return;
      }
      run();
    },
  });
  const period = el('select', {
    id: 'formula-period',
    onchange: () => { formula.period = period.value; syncHash(); run(); },
  }, LABELS.formulaPeriods.map(([id, label]) => el('option', {
    value: id, selected: id === formula.period, text: label,
  })));

  const colpi = el('input', {
    type: 'number',
    id: 'formula-colpi',
    min: 1,
    max: 500,
    value: formula.colpi,
    onchange: () => {
      formula.colpi = Math.min(500, Math.max(1, Math.round(Number(colpi.value)) || 20));
      colpi.value = formula.colpi;
      syncHash();
      run();
    },
  });
  const choice = (id, key, options) => {
    const select = el('select', {
      id, onchange: () => { formula[key] = select.value; run(); },
    }, options.map(([value, label]) => el('option', {
      value, selected: value === formula[key], text: label,
    })));
    return select;
  };

  const toggle = (key, label) => el('label', { class: 'check' },
    el('input', {
      type: 'checkbox',
      checked: formula[key],
      onchange: (event) => { formula[key] = event.target.checked; run(); },
    }),
    label);

  // What to run, which matches to keep, how to judge their bets: one box each.
  const group = (title, ...body) => el('fieldset', {}, el('legend', { text: title }), body);
  const field = (id, label, control) =>
    el('div', { class: 'field' }, el('label', { for: id, text: label }), control);

  run();
  return el('div', {},
    card('Formule',
      'Carica un listato in formato JSON (lo stesso che legge <code>scripts/formula.py</code>) ' +
      'e scegli quante estrazioni considerare. Una formula ha un riscontro quando ognuno dei ' +
      'suoi numeri di ricerca è uscito su una sola ruota; una giocata è <strong>sporca</strong> ' +
      'quando uno dei suoi numeri è già uscito sulle ruote del riscontro nelle estrazioni della ' +
      'retrovisione. Una giocata pulita è <strong>vinta</strong> quando tutti i suoi numeri ' +
      'escono insieme su una ruota entro i colpi scelti. Il file resta nel tuo browser. Una formula seleziona, non prevede: le ' +
      'estrazioni sono indipendenti.',
      el('div', { class: 'groups' },
        group('Listato',
          field('listing', 'File JSON', file)),
        group('Riscontri',
          field('formula-period', 'Estrazioni', period),
          el('div', { class: 'checks' },
            toggle('cleanOnly', 'Nascondi le giocate sporche'),
            toggle('isotopicOnly', 'Solo isotopi'))),
        group('Esito delle giocate',
          field('formula-colpi', 'Colpi', colpi),
          field('formula-play', 'Cercato su', choice('formula-play', 'play', LABELS.plays)),
          field('formula-kind', 'Sorte',
            choice('formula-kind', 'kind', [['all', 'Tutte'], ...BET_ORDER.map((name) => [name, name])])),
          el('div', { class: 'checks' }, toggle('wonOnly', 'Solo giocate vinte')))),
      status),
    out);
}

const RENDERERS = {
  board: renderTabellone,
  delays: renderRitardi,
  frequencies: renderFrequenze,
  pairs: renderAmbi,
  groups: renderGruppi,
  distributions: renderDistribuzioni,
  followers: renderSpie,
  check: renderVerifica,
  formulas: renderFormule,
};

// -------------------------------------------------------------------- chrome

const view = document.getElementById('view');

// The statistics tab to come back to from the formulas section.
let statsTab = DEFAULT_TAB;

function renderSections() {
  const current = state.tab === 'formulas' ? 'formulas' : 'stats';
  document.getElementById('sections').replaceChildren(
    ...LABELS.sections.map(([id, label, about]) => el('button', {
      type: 'button',
      'aria-current': id === current ? 'page' : null,
      onclick: () => { state.tab = id === 'formulas' ? id : statsTab; syncHash(); render(); },
    }, el('b', { text: label }), el('span', { text: about }))));
}

function renderTabs() {
  const tabs = document.getElementById('tabs');
  tabs.replaceChildren(...LABELS.tabs.map(([id, label]) => el('button', {
    type: 'button',
    role: 'tab',
    'aria-selected': id === state.tab ? 'true' : 'false',
    text: label,
    onclick: () => { state.tab = id; syncHash(); render(); },
  })));
}

function renderHeader() {
  const meta = state.meta;
  document.getElementById('sub').textContent =
    `${num(meta.total_draws)} estrazioni dal ${date(meta.first_draw)} al ${date(meta.last_draw)} · ` +
    'ritardi, frequenze, ambi e gruppi di ogni ruota';

  const latest = document.getElementById('latest');
  document.getElementById('latest-title').textContent = `Ultima estrazione · ${date(meta.latest.date)}`;
  document.getElementById('latest-grid').replaceChildren(
    ...Object.entries(meta.latest.wheels).map(([wheel, numbers]) => el('div', { class: 'latest-row' },
      el('span', { class: 'wheel', text: wheelName(wheel) }),
      numbers.map((n) => el('span', { class: 'ball', text: String(n) })))));
  latest.hidden = false;

  document.getElementById('footer-meta').textContent =
    `Statistiche generate il ${date(meta.generated_at.slice(0, 10))} ` +
    `alle ${meta.generated_at.slice(11, 16)} UTC, sull'archivio aggiornato al ${date(meta.last_draw)}.`;
}

const loadError = (error) => el('div', { class: 'card' }, el('p', {
  text: `Impossibile caricare i dati (${error.message}). Se stai aprendo il file dal disco, ` +
    'servi la cartella con un server HTTP.',
}));

let renders = 0;

async function render() {
  renders += 1;
  const mine = renders;
  const formulas = state.tab === 'formulas';
  if (!formulas) statsTab = state.tab;
  renderSections();
  renderTabs();
  // The formulas section has none of the statistics' chrome: no tabs, no reading note.
  document.getElementById('tabs').hidden = formulas;
  document.getElementById('notice').hidden = formulas;
  // A listing is run over every wheel and its own period, so the two filters say nothing.
  // Everywhere else they show the state, which the address can change behind them.
  document.getElementById('filters').hidden = formulas;
  document.getElementById('wheel').value = state.wheel;
  document.getElementById('period').value = state.period;
  let data = null;
  try {
    if (state.tab !== 'formulas') data = await wheelData(state.wheel);
  } catch (error) {
    if (mine === renders) view.replaceChildren(loadError(error));
    return;
  }
  // A slower fetch for a wheel the reader has since left must not paint over the view.
  if (mine !== renders) return;
  const renderer = RENDERERS[state.tab] ?? RENDERERS[DEFAULT_TAB];
  view.replaceChildren(renderer(data));
  hideTip();
}

/**
 * The address is the tab, then what that tab depends on: `#/pairs/napoli/all`,
 * `#/followers/napoli/all/12`. A listing is run over every wheel and its own period, so
 * its tab carries only that, its colpi and the view of the results: `#/formulas/5/20/ranking`.
 *
 * The address is English throughout, so the pseudo-wheel `tutte` is written `all` there
 * and nowhere else: it stays `tutte` in the data and in the state.
 */
function syncHash() {
  const parts = state.tab === 'formulas'
    ? ['', state.tab, state.formula.period, String(state.formula.colpi), state.formula.view]
    : ['', state.tab, state.wheel === 'tutte' ? 'all' : state.wheel, state.period];
  if (state.tab === 'followers') parts.push(String(state.spy));
  history.replaceState(null, '', `#${parts.join('/')}`);
}

function readHash() {
  const [, tab, ...rest] = (location.hash.slice(1) || '').split('/');
  if (!Object.hasOwn(RENDERERS, tab)) return;
  state.tab = tab;
  if (tab === 'formulas') {
    if (LABELS.formulaPeriods.some(([id]) => id === rest[0])) state.formula.period = rest[0];
    const colpi = Number(rest[1]);
    if (Number.isInteger(colpi) && colpi >= 1 && colpi <= 500) state.formula.colpi = colpi;
    if (LABELS.formulaViews.some(([id]) => id === rest[2])) state.formula.view = rest[2];
    return;
  }
  const [inAddress, period, spy] = rest;
  const wheel = inAddress === 'all' ? 'tutte' : inAddress;
  // Checked against what the site holds, not against LABELS: a plain object also
  // answers to `constructor`, and a wheel with no file leaves the view blank.
  if (state.meta.wheels.some((w) => w.id === wheel)) state.wheel = wheel;
  if (state.meta.windows.some((w) => w.id === period)) state.period = period;
  const parsed = Number(spy);
  if (parsed >= 1 && parsed <= 90) state.spy = parsed;
}

function setUpFilters() {
  const wheelSelect = document.getElementById('wheel');
  wheelSelect.replaceChildren(...state.meta.wheels.map((w) => el('option', {
    value: w.id, selected: w.id === state.wheel, text: wheelName(w.id),
  })));
  wheelSelect.addEventListener('change', () => {
    state.wheel = wheelSelect.value;
    syncHash();
    render();
  });

  const periodSelect = document.getElementById('period');
  periodSelect.replaceChildren(...state.meta.windows.map((w) => el('option', {
    value: w.id, selected: w.id === state.period, text: periodName(w.id),
  })));
  periodSelect.addEventListener('change', () => {
    state.period = periodSelect.value;
    syncHash();
    render();
  });
}

function setUpTheme() {
  const button = document.getElementById('theme');
  const names = { auto: 'automatico', light: 'chiaro', dark: 'scuro' };
  // U+FE0E keeps the sun a plain glyph in the text colour, not a colour emoji.
  const icons = { auto: '\u25D0', light: '\u2600\uFE0E', dark: '\u263E' };
  const order = ['auto', 'light', 'dark'];
  let current = 'auto';
  try {
    current = localStorage.getItem('theme') ?? 'auto';
  } catch { /* private mode: stay on auto */ }
  if (!order.includes(current)) current = 'auto';

  const apply = () => {
    if (current === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', current);
    button.textContent = icons[current];
    // The icon shows the theme in use; the label says it and what a click does.
    button.title = `Tema ${names[current]}: clicca per cambiare`;
    button.setAttribute('aria-label', button.title);
  };
  button.addEventListener('click', () => {
    current = order[(order.indexOf(current) + 1) % order.length];
    try {
      localStorage.setItem('theme', current);
    } catch { /* nothing to do */ }
    apply();
  });
  apply();
}

async function main() {
  setUpTheme();
  try {
    const response = await fetch('data/meta.json');
    if (!response.ok) throw new Error(`meta.json: ${response.status}`);
    state.meta = await response.json();
  } catch (error) {
    view.replaceChildren(loadError(error));
    return;
  }
  if (!state.meta.wheels.some((w) => w.id === state.wheel)) state.wheel = state.meta.wheels[0].id;
  readHash();
  renderHeader();
  setUpFilters();
  syncHash();
  await render();
  window.addEventListener('hashchange', () => { readHash(); render(); });
}

main();
