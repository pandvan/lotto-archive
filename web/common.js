/* What every page of the site shares: number and date formatting, the element builder,
 * the draw filter and the theme switch. Loaded before the page's own script.
 */
'use strict';

const nf = new Intl.NumberFormat('it-IT');
const num = (v) => (v == null ? '—' : nf.format(v));

/** ISO date to Italian day/month/year, without going through Date and its timezone. */
function date(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
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

const WHEEL_NAMES = {
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
  '10elotto': '10eLotto',
};
const wheelName = (id) => WHEEL_NAMES[id] ?? id;

// The draw explorers: a page of every year at once would be some hundred thousand nodes.
const MAX_ROWS = 300;
const ALL_YEARS = 'all';

/** The numbers typed in a draw filter: whatever digits are there, kept when a ball has them. */
const wanted = (text) => [...new Set((text.match(/\d+/g) ?? []).map(Number))].filter((n) => n >= 1 && n <= 90);

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
