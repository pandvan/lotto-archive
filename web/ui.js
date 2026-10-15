/* What the Lotto and 10eLotto pages build their views from: number formatting, the
 * tooltip, the inline SVG charts, sortable tables, cards and the draw dialog. Loaded
 * after common.js and before the page's own script; it needs a #tip and a #draw dialog.
 */
'use strict';

// ---------------------------------------------------------------- formatting

const nf1 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dec = (v) => (v == null ? '—' : nf1.format(v));
const dec2 = (v) => (v == null ? '—' : nf2.format(v));

function signed(v, digits = 0) {
  if (v == null) return '—';
  const formatted = digits ? nf1.format(Math.abs(v)) : nf.format(Math.round(Math.abs(v)));
  if (v > 0) return `+${formatted}`;
  if (v < 0) return `−${formatted}`;
  return '0';
}

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

// ---------------------------------------------------------------------- draws

/**
 * One draw as a matrix — a wheel per row, a position per column — with some cells lit:
 * `lit` gives a cell its class, or nothing.
 */
function showDraw(draw, lit, note) {
  const dialog = document.getElementById('draw');
  dialog.replaceChildren(
    el('h2', { text: `Estrazione del ${date(draw.date)} · concorso ${draw.contest}` }),
    el('p', { class: 'help', text: note }),
    drawMatrix(draw, lit),
    el('form', { method: 'dialog' }, el('button', { text: 'Chiudi' })));
  dialog.showModal();
}

/** A draw as it is printed: a wheel per row, a position per column; `balls` draws them round. */
function drawMatrix(draw, lit, balls = false) {
  return el('table', { class: 'matrix' },
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col', text: 'Ruota' }),
      Object.values(draw.wheels)[0].map((_, p) => el('th', { scope: 'col', text: `${p + 1}ª` })))),
    el('tbody', {}, Object.entries(draw.wheels).map(([wheel, numbers]) => el('tr', {},
      el('th', { scope: 'row', text: wheelName(wheel) }),
      numbers.map((n) => (balls
        ? el('td', {}, el('span', { class: ['ball', lit(wheel, n)].filter(Boolean).join(' '), text: String(n) }))
        : el('td', { class: lit(wheel, n), text: String(n) })))))));
}
