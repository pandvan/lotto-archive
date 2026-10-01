/* Statistiche del Lotto — static front end.
 *
 * All display strings live in LABELS below: the generated JSON carries English keys
 * and no prose, so this file is the only place to change wording, and the only place
 * where the Italian lotto vocabulary (ritardo, ambo, cadenza, figura, decina) appears.
 *
 * The "Formule" tab is the one view not built from generated statistics: it runs a
 * listing the reader uploads against the raw draws, with the rule in formula.js.
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
    ['formulas', 'Formule'],
  ],
  // How far back a listing is run, in years before the last draw.
  formulaPeriods: [
    ['1', 'Ultimo anno'],
    ['5', 'Ultimi 5 anni'],
    ['10', 'Ultimi 10 anni'],
    ['all', "Tutto l'archivio"],
  ],
};

const TABS = new Map(LABELS.tabs);
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

/** Rows of cells on one sequential blue ramp, light to dark. */
function heatmap({ columns, rows, value, cellW = 11, cellH = 26, tipFor }) {
  const pad = { top: 8, right: 8, bottom: 20, left: 74 };
  const width = pad.left + columns.length * cellW + pad.right;
  const height = pad.top + rows.length * cellH + pad.bottom;
  let lo = Infinity;
  let hi = -Infinity;
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < columns.length; c += 1) {
      const v = value(r, c);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const stepFor = (v) => {
    if (hi === lo) return SEQ_STEPS[Math.floor(SEQ_STEPS.length / 2)];
    const t = (v - lo) / (hi - lo);
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
    if (c % 5 !== 0 && c !== columns.length - 1) return;
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
  formula: { listing: null, period: '1', cleanOnly: false, isotopicOnly: false },
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

  return card('Tabellone analitico',
    `Una riga per ognuno dei 90 numeri. <strong>Ritardo</strong>, <strong>ritardo max</strong> e
     <strong>ultima uscita</strong> sono sempre calcolati su tutta la storia della ruota
     (${num(board.draws)} estrazioni); la <strong>frequenza</strong> segue il periodo scelto.
     Lo scarto è la differenza dalla frequenza attesa, ${dec2(expected)} uscite per numero.
     Clicca un'intestazione per ordinare.`,
    table(columns, rows, { sortKey: 'delay', desc: true }));
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
      'Quanto è densa la copertura dell\'archivio. Una estrazione a settimana fino agli anni ' +
      'Cinquanta, tre dal 1997, quattro dal 2025.',
      el('figure', {}, barChart({ data: years, height: 200, labelEvery: 5 }), legend(['bar', 'Estrazioni']))),
    card('Estrazioni per giorno della settimana',
      'Il calendario è cambiato molte volte: il sabato domina un secolo di storia, il ' +
      'venerdì compare solo dal 2025. Per questo il calendario va letto dai dati e non assunto.',
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

/** A checked bet: its numbers, and when the retrovisione burnt it, where and when. */
function betNode(bet, byDate) {
  const numbers = el('span', { class: bet.clean ? 'bet' : 'bet dirty' },
    bet.numbers.map((n) => el('span', { class: 'ball', text: String(n) })));
  if (bet.clean) return numbers;
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
        class: 'over',
        title: 'Due numeri di ricerca nella stessa posizione su ruote diverse, anche se non sono lo stesso numero',
        text: 'isotopi',
      })
      : '—'),
    el('td', { class: 'bets' }, kinds.length
      ? kinds.map((name) => el('div', {},
        el('span', { class: 'kind', text: name }),
        match.bets[name].map((bet) => betNode(bet, byDate))))
      : 'nessuna giocata'));
}

function formulaResults(draws, listing, matches) {
  const byDate = new Map(draws.map((draw) => [draw.date, draw]));
  const byFormula = new Map();
  for (const match of matches) {
    if (!byFormula.has(match.formula)) byFormula.set(match.formula, []);
    byFormula.get(match.formula).push(match);
  }
  const bets = matches.flatMap((match) => Object.values(match.bets).flat());

  const sections = listing.formulas.filter((formula) => byFormula.has(formula)).map((formula) => {
    const found = byFormula.get(formula);
    const body = el('div', { class: 'scroll' });
    return el('details', {
      // A long scan finds thousands of matches: build a formula's rows when it is opened.
      ontoggle: (event) => {
        if (!event.target.open || body.firstChild) return;
        body.append(el('table', { class: 'findings' },
          el('thead', {}, el('tr', {}, ['Estrazione', 'Numeri trovati', 'Isotopia', 'Giocate']
            .map((label) => el('th', { scope: 'col', text: label })))),
          el('tbody', {}, [...found].reverse().map((match) => findingRow(match, byDate)))));
      },
    },
      el('summary', {},
        el('b', { text: `Formula ${formula.index}` }),
        el('span', { class: 'found' },
          formula.numbers.map((n) => el('span', { class: 'ball', text: String(n) }))),
        `${num(found.length)} ${found.length === 1 ? 'riscontro' : 'riscontri'}`),
      body);
  });

  return card(listing.name, null,
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
      tile('Giocate', num(bets.length), `${num(bets.filter((bet) => !bet.clean).length)} sporche`)),
    sections.length
      ? el('div', {}, sections)
      : el('p', { class: 'unavailable', text: 'Nessun riscontro nel periodo.' }));
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
      // Filters on the report, not a different rule: a match they hide is still a match.
      // "Clean" is what scripts/formula.py --clean keeps: no bet burnt by the retrovisione.
      const matches = scanListing(draws, formula.listing, since).filter((match) =>
        (!formula.isotopicOnly || match.isotopic) &&
        (!formula.cleanOnly || Object.values(match.bets).flat().every((bet) => bet.clean)));
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

  const toggle = (key, label) => el('label', { class: 'check' },
    el('input', {
      type: 'checkbox',
      checked: formula[key],
      onchange: (event) => { formula[key] = event.target.checked; run(); },
    }),
    label);

  run();
  return el('div', {},
    card('Formule',
      'Carica un listato in formato JSON (lo stesso che legge <code>scripts/formula.py</code>) ' +
      'e scegli quante estrazioni considerare. Una formula ha un riscontro quando ognuno dei ' +
      'suoi numeri di ricerca è uscito su una sola ruota; una giocata è <strong>sporca</strong> ' +
      'quando uno dei suoi numeri è già uscito sulle ruote del riscontro nelle estrazioni della ' +
      'retrovisione. Il file resta nel tuo browser. Una formula seleziona, non prevede: le ' +
      'estrazioni sono indipendenti.',
      el('div', { class: 'fields' },
        el('div', { class: 'field' }, el('label', { for: 'listing', text: 'Listato' }), file),
        el('div', { class: 'field' }, el('label', { for: 'formula-period', text: 'Estrazioni' }), period),
        toggle('cleanOnly', 'Nascondi i riscontri con giocate sporche'),
        toggle('isotopicOnly', 'Solo isotopi')),
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

async function render() {
  renderTabs();
  // A listing is run over every wheel and its own period, so the two filters say nothing.
  for (const id of ['wheel', 'period']) {
    document.getElementById(id).parentElement.hidden = state.tab === 'formulas';
  }
  const data = await wheelData(state.wheel);
  const renderer = RENDERERS[state.tab] ?? RENDERERS[DEFAULT_TAB];
  view.replaceChildren(renderer(data));
  hideTip();
}

/**
 * The address is the tab, then what that tab depends on: `#/pairs/napoli/all`,
 * `#/followers/napoli/all/12`. A listing is run over every wheel and its own period, so
 * its tab carries only that: `#/formulas/5`.
 *
 * The address is English throughout, so the pseudo-wheel `tutte` is written `all` there
 * and nowhere else: it stays `tutte` in the data and in the state.
 */
function syncHash() {
  const parts = state.tab === 'formulas'
    ? ['', state.tab, state.formula.period]
    : ['', state.tab, state.wheel === 'tutte' ? 'all' : state.wheel, state.period];
  if (state.tab === 'followers') parts.push(String(state.spy));
  history.replaceState(null, '', `#${parts.join('/')}`);
}

function readHash() {
  const [, tab, ...rest] = (location.hash.slice(1) || '').split('/');
  if (!TABS.has(tab)) return;
  state.tab = tab;
  if (tab === 'formulas') {
    if (LABELS.formulaPeriods.some(([id]) => id === rest[0])) state.formula.period = rest[0];
    return;
  }
  const [inAddress, period, spy] = rest;
  const wheel = inAddress === 'all' ? 'tutte' : inAddress;
  if (LABELS.wheels[wheel]) state.wheel = wheel;
  if (LABELS.periods[period]) state.period = period;
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
  const names = { auto: 'Auto', light: 'Chiaro', dark: 'Scuro' };
  const order = ['auto', 'light', 'dark'];
  let current = 'auto';
  try {
    current = localStorage.getItem('theme') ?? 'auto';
  } catch { /* private mode: stay on auto */ }
  if (!order.includes(current)) current = 'auto';

  const apply = () => {
    if (current === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', current);
    button.textContent = names[current];
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
    view.replaceChildren(el('div', { class: 'card' }, el('p', {
      text: `Impossibile caricare i dati (${error.message}). Se stai aprendo il file dal disco, ` +
        'servi la cartella con un server HTTP.',
    })));
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
