/* The Formule tab, shared by the Lotto and the 10eLotto page: upload a listing, run it
 * with formula.js over the page's draws, and show matches, ranking and outcomes.
 *
 * The page sets formulaState.game, formulaState.load (its draws, oldest first, in the
 * shape formula.js reads) and formulaState.sync (keeps the address in step), then calls
 * renderFormule(). On 10eLotto a draw is one pseudo-wheel, '10elotto', of its 20 numbers.
 */
'use strict';

const FORMULA_LABELS = {
  // How far back a listing is run, in years before the last draw.
  periods: [
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
  views: [
    ['matches', 'Riscontri'],
    ['ranking', 'Classifica'],
    ['time', 'Nel tempo'],
  ],
};

const formulaState = {
  game: 'lotto', load: null, sync: () => {},
  listing: null, lookback: null, wheels: null, period: '1', cleanOnly: false, isotopicOnly: false, wonOnly: false,
  dirty: false,
  colpi: 20, play: 'match', kind: 'all', view: 'matches',
};

/** The tab's part of the address: period, colpi and view, as `#/formulas/5/20/ranking`. */
const formulaHash = () => [formulaState.period, String(formulaState.colpi), formulaState.view];

function readFormulaHash([period, colpi, view]) {
  if (FORMULA_LABELS.periods.some(([id]) => id === period)) formulaState.period = period;
  const parsed = Number(colpi);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 500) formulaState.colpi = parsed;
  if (FORMULA_LABELS.views.some(([id]) => id === view)) formulaState.view = view;
}

/**
 * What sets the games apart, so the tab asks what a game has rather than which one it
 * is. `drawn` is how many of the 90 numbers one row of a draw holds; `wheels` says
 * whether there are wheels at all, and with them positions, isotopia, dirty matches and
 * a choice of where to play. `rule` is how the tab explains a match, a burnt bet and a win.
 */
const GAMES = {
  lotto: {
    drawn: 5,
    wheels: true,
    rule: 'Una formula ha un riscontro quando ognuno dei suoi numeri di ricerca è uscito su ' +
      'una sola ruota; una giocata è <strong>sporca</strong> quando uno dei suoi numeri è ' +
      'già uscito sulle ruote del riscontro nelle estrazioni della retrovisione. Una ' +
      'giocata pulita è <strong>vinta</strong> quando tutti i suoi numeri escono insieme ' +
      'su una ruota entro i colpi scelti.',
  },
  '10elotto': {
    drawn: 20,
    wheels: false,
    rule: 'Sul 10eLotto non ci sono ruote: una formula ha un riscontro quando tutti i suoi ' +
      'numeri di ricerca sono tra i 20 estratti; una giocata è <strong>sporca</strong> ' +
      'quando uno dei suoi numeri è già tra gli estratti della retrovisione, ed è ' +
      '<strong>vinta</strong> quando tutti i suoi numeri sono tra i 20 estratti entro i ' +
      'colpi scelti. L\'Extra non conta.',
  },
};
const game = () => GAMES[formulaState.game];

/** " su Bari e Roma" where there are wheels to name; nothing otherwise. */
const onWheels = (wheels) => (game().wheels ? ` su ${wheels.map(wheelName).join(' e ')}` : '');

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
      class: 'outcome open', text: `in corso, ${outcome.colpi} di ${formulaState.colpi} colpi`,
    });
  }
  return el('button', {
    type: 'button',
    class: 'link outcome won',
    title: 'Mostra l\'estrazione vincente',
    text: `vinta al ${outcome.colpo}° colpo${onWheels(outcome.wheels)}`,
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
    // A 10eLotto draw is sorted, so a position there says nothing.
    text: `sporca: ${seen.number}${onWheels([seen.wheel])} il ${date(seen.date)}` +
      (game().wheels ? `, ${seen.position}ª posizione` : ''),
    onclick: (event) => {
      event.stopPropagation();
      showDraw(byDate.get(seen.date),
        (wheel, n) => (bet.play.includes(wheel) && bet.numbers.includes(n) ? 'hit' : null),
        `Numeri della giocata ${bet.numbers.join('-')} già usciti` +
        (game().wheels ? ' sulle ruote del riscontro.' : '.'));
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
    game().wheels ? el('td', {}, match.isotopic
      ? el('span', {
        // The check mark comes from .verdict.ok; the label keeps it readable aloud.
        class: 'verdict ok',
        role: 'img',
        'aria-label': 'isotopi',
        title: 'Isotopi: due numeri di ricerca nella stessa posizione su ruote diverse, anche se non sono lo stesso numero',
      })
      : el('span', {
        class: 'verdict no', role: 'img', 'aria-label': 'non isotopi', title: 'Nessuna isotopia',
      })) : null,
    el('td', { class: 'bets' }, kinds.length
      ? kinds.map((name) => el('div', {},
        el('span', { class: 'kind', text: name }),
        // One bet per line: a dirty bet's note then sits beside its own numbers only.
        el('div', { class: 'stack' }, match.bets[name].map((bet) => betNode(bet, byDate)))))
      : 'nessuna giocata'));
}

/** The chance that a bet of `size` numbers comes out whole on one row of one draw. */
const hitChance = (size) => Array.from({ length: size }, (_, k) => (game().drawn - k) / (90 - k))
  .reduce((p, q) => p * q, 1);

/** A match's bets of the chosen kind that were played: the dirty ones are not. */
const playedBets = (match) => BET_ORDER
  .filter((name) => ['all', name].includes(formulaState.kind))
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
    if (bet.outcome.colpi < formulaState.colpi) continue;
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
  const { colpi } = formulaState;
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
    const listed = formulaState.wonOnly
      ? found.map(won).filter((match) => Object.values(match.bets).flat().length)
      : found;
    if (!listed.length) return null;
    const body = el('div', { class: 'scroll' });
    const section = el('details', {
      // A long scan finds thousands of matches: build a formula's rows when it is opened.
      ontoggle: (event) => {
        if (!event.target.open || body.firstChild) return;
        body.append(colpoChart(found) ?? '', el('table', { class: 'findings' },
          el('thead', {}, el('tr', {}, ['Estrazione', 'Numeri trovati', game().wheels && 'Isotopia', 'Giocate']
            .filter(Boolean).map((label) => el('th', { scope: 'col', text: label })))),
          el('tbody', {}, [...listed].reverse().map((match) => findingRow(match, byDate)))));
      },
    },
      el('summary', {},
        el('b', { text: `Formula ${formula.index}` }),
        el('span', { class: 'found' },
          formula.numbers.map((n) => el('span', { class: 'ball', text: String(n) }))),
        `${num(listed.length)} ${listed.length === 1 ? 'riscontro' : 'riscontri'}` +
          (formulaState.wonOnly ? ` con vincita su ${num(found.length)}` : ''),
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
      `Per ogni formula, le giocate pulite i cui ${num(formulaState.colpi)} colpi sono già tutti ` +
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
    FORMULA_LABELS.views.map(([id, label]) => el('button', {
      type: 'button', role: 'tab', 'data-view': id, text: label, onclick: () => show(id),
    })));
  // All three are built once; a tab only chooses which one is in view.
  function show(view) {
    formulaState.view = view;
    formulaState.sync();
    for (const [id, panel] of Object.entries(panels)) panel.hidden = id !== view;
    for (const tab of tabs.children) tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  }
  show(formulaState.view);

  return el('div', {}, card(listing.name, null,
    el('p', {
      class: 'help',
      text: `${num(listing.size)} numeri di ricerca ` +
        (game().wheels ? `su ${num(listing.wheels)} ruote` : `tra i ${game().drawn} estratti`) +
        `, retrovisione di ${num(listing.lookback)} estrazioni. Apri una formula per vederne i ` +
        'riscontri, dal più recente; clicca un riscontro per vedere l\'estrazione.',
    }),
    el('div', { class: 'tiles' },
      tile('Formule', num(listing.formulas.length), `${num(byFormula.size)} con riscontri`),
      tile('Riscontri', num(matches.length), game().wheels
        ? `${num(matches.filter((match) => match.isotopic).length)} con isotopia`
        : `sui ${game().drawn} estratti`),
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
  const formula = formulaState;
  const out = el('div');
  const status = el('p', { class: 'help', role: 'status' });

  async function run() {
    if (!formula.listing) return;
    try {
      const draws = await formula.load();
      const last = draws[draws.length - 1].date;
      const since = formula.period === 'all'
        ? null
        : `${Number(last.slice(0, 4)) - Number(formula.period)}${last.slice(4)}`;
      status.textContent = '';
      // Filters on the report, not a different rule: what they hide was still found.
      // "Clean" drops the bets the retrovisione burnt and keeps the others; a match goes
      // only when every bet it had is gone. scripts/formula.py --clean is stricter: one
      // burnt bet there drops the whole match.
      // The listing's own lookback and wheels are only defaults: the reader may change them.
      // A 10eLotto draw is a single pseudo-wheel, whatever the listing was written for.
      const listing = {
        ...formula.listing, lookback: formula.lookback, wheels: game().wheels ? formula.wheels : 1,
      };
      const matches = scanListing(
        draws, listing, since, formula.colpi, formula.play, formula.dirty,
      ).filter((match) => !formula.isotopicOnly || !game().wheels || match.isotopic).flatMap((match) => {
        if (!formula.cleanOnly) return [match];
        const all = Object.values(match.bets).flat();
        if (all.length && all.every((bet) => !bet.clean)) return [];
        return [{
          ...match,
          bets: Object.fromEntries(Object.entries(match.bets).map(([name, bets]) =>
            [name, bets.filter((bet) => bet.clean)])),
        }];
      });
      out.replaceChildren(formulaResults(draws, listing, matches));
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
        formula.lookback = formula.listing.lookback;
        lookback.value = formula.lookback;
        lookback.disabled = false;
        formula.wheels = formula.listing.wheels;
        setUpWheels();
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
    onchange: () => { formula.period = period.value; formulaState.sync(); run(); },
  }, FORMULA_LABELS.periods.map(([id, label]) => el('option', {
    value: id, selected: id === formula.period, text: label,
  })));

  const lookback = el('input', {
    type: 'number',
    id: 'formula-lookback',
    min: 0,
    max: 500,
    value: formula.lookback ?? '',
    disabled: !formula.listing,
    onchange: () => {
      const typed = Math.round(Number(lookback.value));
      formula.lookback = lookback.value !== '' && typed >= 0
        ? Math.min(500, typed)
        : formula.listing.lookback;
      lookback.value = formula.lookback;
      run();
    },
  });
  // A wheel draws five numbers, and each search number needs at most a wheel of its own.
  const wheelBounds = () => [
    Math.ceil(formula.listing.size / 5),
    Math.min(formula.listing.size, 11),
  ];
  const wheels = el('input', {
    type: 'number',
    id: 'formula-wheels',
    disabled: true,
    onchange: () => {
      const [low, high] = wheelBounds();
      const typed = Math.round(Number(wheels.value));
      formula.wheels = wheels.value !== '' ? Math.min(high, Math.max(low, typed)) : formula.listing.wheels;
      wheels.value = formula.wheels;
      run();
    },
  });
  const setUpWheels = () => {
    [wheels.min, wheels.max] = wheelBounds();
    wheels.value = formula.wheels;
    wheels.disabled = false;
  };
  if (formula.listing) setUpWheels();
  const colpi = el('input', {
    type: 'number',
    id: 'formula-colpi',
    min: 1,
    max: 500,
    value: formula.colpi,
    onchange: () => {
      formula.colpi = Math.min(500, Math.max(1, Math.round(Number(colpi.value)) || 20));
      colpi.value = formula.colpi;
      formulaState.sync();
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

  // The controls that only mean something on wheels are left out where there are none.
  const { wheels: hasWheels, rule } = game();

  run();
  return el('div', {},
    card('Formule',
      'Carica un listato in formato JSON (lo stesso che legge <code>scripts/formula.py</code>) ' +
      `e scegli quante estrazioni considerare. ${rule} ` +
      'Il file resta nel tuo browser. Una formula seleziona, non prevede: le ' +
      'estrazioni sono indipendenti.',
      el('div', { class: 'groups' },
        group('Listato',
          field('listing', 'File JSON', file)),
        group('Riscontri',
          field('formula-period', 'Estrazioni', period),
          hasWheels ? field('formula-wheels', 'Ruote di ricerca', wheels) : null,
          field('formula-lookback', 'Retrovisione', lookback),
          el('div', { class: 'checks' },
            toggle('cleanOnly', 'Nascondi le giocate sporche'),
            hasWheels ? toggle('isotopicOnly', 'Solo isotopi') : null,
            hasWheels ? toggle('dirty', 'Consenti numeri di ricerca su più ruote') : null)),
        group('Esito delle giocate',
          field('formula-colpi', 'Colpi', colpi),
          hasWheels ? field('formula-play', 'Cercato su', choice('formula-play', 'play', FORMULA_LABELS.plays)) : null,
          field('formula-kind', 'Sorte',
            choice('formula-kind', 'kind', [['all', 'Tutte'], ...BET_ORDER.map((name) => [name, name])])),
          el('div', { class: 'checks' }, toggle('wonOnly', 'Solo giocate vinte')))),
      status),
    out);
}
