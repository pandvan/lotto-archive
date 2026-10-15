/* Statistiche del Lotto — static front end.
 *
 * All display strings live in LABELS below: the generated JSON carries English keys
 * and no prose, so this file is the only place to change wording, and the only place
 * where the Italian lotto vocabulary (ritardo, ambo, cadenza, figura, decina) appears.
 *
 * The page has three sections. "Statistiche" is read-only: tabs of generated statistics.
 * "Estrazioni" lists the raw draws, a year at a time. "Formule" runs a listing the
 * reader uploads against the raw draws, with formula-view.js.
 *
 * No dependencies. Charts, tables and the draw dialog come from ui.js.
 */
'use strict';

// --------------------------------------------------------------------- labels

const LABELS = {
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
  // The three parts of the page: draws to look up, statistics to read, and listings to
  // run. `draws` and `formulas` are also the ids the address and state.tab use for them.
  sections: [
    ['draws', 'Estrazioni', "Sfoglia l'archivio anno per anno e cerca i numeri usciti"],
    ['stats', 'Statistiche', 'Tabelle e grafici da consultare, ruota per ruota'],
    ['formulas', 'Formule', "Carica un listato e cercane i riscontri nell'archivio"],
  ],
  // Tab ids are what the address shows, so they are English like every other id; the
  // label beside each is what the reader sees.
  tabs: [
    ['stats', 'Tabellone'],
    ['delays', 'Ritardi'],
    ['frequencies', 'Frequenze'],
    ['pairs', 'Ambi'],
    ['groups', 'Cadenze e figure'],
    ['distributions', 'Distribuzioni'],
    ['followers', 'Numeri spia'],
    ['check', 'Verifica'],
  ],
  // The two readings of the draws: a row per draw, or each draw as it is printed.
  drawViews: [
    ['list', 'Elenco'],
    ['matrix', 'Per estrazione'],
  ],
};

// The opening tab of the statistics carries the section's own id in the address.
const DEFAULT_TAB = 'stats';
const NUMBERS = Array.from({ length: 90 }, (_, i) => i + 1);

// ---------------------------------------------------------------------- state

const state = {
  meta: null,
  wheel: 'tutte',
  period: 'all',
  tab: DEFAULT_TAB,
  spy: 1,
  drawsYear: null,
  drawsView: 'list',
  contains: '',
  cache: new Map(),
  draws: null,
  grid: null,
};

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

// ----------------------------------------------------------------------- draws

/**
 * The draws of a year, newest first, on the chosen wheel or on all of them, kept when
 * every number typed came out on the wheels shown.
 */
function renderEstrazioni() {
  const shown = state.wheel === 'tutte'
    ? state.meta.wheels.map((w) => w.id).filter((id) => id !== 'tutte')
    : [state.wheel];
  const out = el('div', {}, el('p', { class: 'help', text: 'Caricamento…' }));
  let draws = null;

  function fill() {
    if (!draws) return;
    const numbers = wanted(contains.value);
    const found = draws.filter((draw) =>
      (year.value === ALL_YEARS || draw.date.startsWith(year.value)) &&
      shown.some((wheel) => draw.wheels[wheel]) &&
      numbers.every((n) => shown.some((wheel) => draw.wheels[wheel]?.includes(n)))).reverse();
    const title = `${num(found.length)} ${found.length === 1 ? 'estrazione' : 'estrazioni'}` +
      (year.value === ALL_YEARS ? '' : ` del ${year.value}`) +
      (numbers.length ? ` con ${numbers.join(', ')}` : '');
    if (!found.length) {
      out.replaceChildren(el('h3', { text: title }),
        el('p', { class: 'unavailable', text: 'Nessuna estrazione corrisponde.' }));
      return;
    }
    const lit = (wheel, n) => (shown.includes(wheel) && numbers.includes(n) ? 'hit' : null);
    const more = found.length > MAX_ROWS
      ? ` Mostrate le prime ${MAX_ROWS}: scegli un anno o aggiungi un numero.`
      : '';
    if (view.value === 'matrix') {
      out.replaceChildren(
        el('h3', { text: title }),
        el('p', { class: 'help', text: `Dalla più recente, ogni estrazione con tutte le sue ruote.${more}` }),
        el('div', { class: 'draw-cards' }, found.slice(0, MAX_ROWS).map((draw) => el('section', { class: 'draw-card' },
          el('h4', {}, `Concorso ${draw.contest}`, el('span', { text: date(draw.date) })),
          drawMatrix(draw, lit, true)))));
      return;
    }
    out.replaceChildren(
      el('h3', { text: title }),
      el('p', {
        class: 'help',
        text: `Dalla più recente. Clicca una data per vedere l'estrazione intera.${more}`,
      }),
      el('div', { class: 'scroll' }, el('table', { class: 'archive' },
        el('thead', {}, el('tr', {}, ['Data', 'Concorso', ...shown.map(wheelName)]
          .map((label) => el('th', { scope: 'col', text: label })))),
        el('tbody', {}, found.slice(0, MAX_ROWS).map((draw) => el('tr', {},
          el('td', {}, el('button', {
            type: 'button',
            class: 'link',
            title: 'Mostra l\'estrazione',
            text: date(draw.date),
            onclick: () => showDraw(draw, lit,
              numbers.length ? `Evidenziati: ${numbers.join(', ')}.` : 'Tutte le ruote dell\'estrazione.'),
          })),
          el('td', { class: 'dim', text: String(draw.contest) }),
          shown.map((wheel) => el('td', {}, draw.wheels[wheel]
            ? draw.wheels[wheel].map((n) => el('span', { class: lit(wheel, n) ? 'ball hit' : 'ball', text: String(n) }))
            : '—'))))))));
  }

  const view = el('select', {
    id: 'draws-view',
    onchange: () => { state.drawsView = view.value; syncHash(); fill(); },
  }, LABELS.drawViews.map(([value, text]) => el('option', { value, text, selected: value === state.drawsView })));
  const year = el('select', {
    id: 'draws-year', onchange: () => { state.drawsYear = year.value; fill(); },
  });
  const contains = el('input', {
    type: 'search',
    id: 'draws-contains',
    inputmode: 'numeric',
    placeholder: 'es. 7 21 90',
    autocomplete: 'off',
    value: state.contains,
    oninput: () => { state.contains = contains.value; fill(); },
  });

  allDraws().then((all) => {
    draws = all;
    const years = [...new Set(draws.map((draw) => draw.date.slice(0, 4)))].reverse();
    state.drawsYear ??= years[0];
    year.replaceChildren(
      ...[...years.map((y) => [y, y]), [ALL_YEARS, 'Tutti gli anni']].map(([value, text]) =>
        el('option', { value, text, selected: value === state.drawsYear })));
    fill();
  }).catch((error) => out.replaceChildren(el('p', {
    class: 'help', text: `Impossibile caricare le estrazioni (${error.message}).`,
  })));

  return card(`Estrazioni · ${wheelName(state.wheel)}`,
    'Tutte le estrazioni dell\'archivio, un anno alla volta, con i numeri nell\'ordine di ' +
    'estrazione. Il filtro tiene le estrazioni in cui <strong>tutti</strong> i numeri scritti ' +
    'sono usciti sulle ruote mostrate, anche su ruote diverse.',
    el('div', { class: 'groups' },
      el('div', { class: 'field' }, el('label', { for: 'draws-view', text: 'Vista' }), view),
      el('div', { class: 'field' }, el('label', { for: 'draws-year', text: 'Anno' }), year),
      el('div', { class: 'field' }, el('label', { for: 'draws-contains', text: 'Contiene i numeri' }), contains)),
    out);
}

// -------------------------------------------------------------------- formulas

/** Every draw of the archive, oldest first. Fetched once, and only for the tabs that need it. */
async function allDraws() {
  if (!state.draws) {
    const response = await fetch('data/draws.json');
    if (!response.ok) throw new Error(`draws.json: ${response.status}`);
    state.draws = (await response.json()).draws;
  }
  return state.draws;
}

const RENDERERS = {
  stats: renderTabellone,
  draws: renderEstrazioni,
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

// The statistics tab to come back to from the other sections.
let statsTab = DEFAULT_TAB;

/** The section a tab belongs to: its own when it is one, the statistics otherwise. */
const sectionFor = (tab) => (['draws', 'formulas'].includes(tab) ? tab : 'stats');

function renderSections() {
  const current = sectionFor(state.tab);
  document.getElementById('sections').replaceChildren(
    ...LABELS.sections.map(([id, label, about]) => el('button', {
      type: 'button',
      'aria-current': id === current ? 'page' : null,
      onclick: () => { state.tab = id === 'stats' ? statsTab : id; syncHash(); render(); },
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
  const layout = document.getElementById('latest-layout');
  layout.onclick = () => {
    const column = document.getElementById('latest-grid').classList.toggle('column');
    layout.setAttribute('aria-pressed', String(column));
    layout.title = column ? 'Ruote affiancate' : 'Una ruota per riga';
    layout.setAttribute('aria-label', layout.title);
  };
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
  const stats = sectionFor(state.tab) === 'stats';
  if (stats) statsTab = state.tab;
  renderSections();
  renderTabs();
  // The other sections have none of the statistics' chrome: no tabs, no reading note.
  document.getElementById('tabs').hidden = !stats;
  document.getElementById('notice').hidden = !stats;
  // A listing is run over every wheel and its own period, so the two filters say nothing.
  // Everywhere else they show the state, which the address can change behind them.
  document.getElementById('filters').hidden = formulas;
  document.getElementById('wheel').value = state.wheel;
  document.getElementById('period').value = state.period;
  // The draws section has its own year; the statistics' period says nothing there.
  document.getElementById('period').parentElement.hidden = state.tab === 'draws';
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
 * `#/followers/napoli/all/12`, `#/draws/all/all/matrix`. A listing is run over every wheel and its own period, so
 * its tab carries only that, its colpi and the view of the results: `#/formulas/5/20/ranking`.
 *
 * The address is English throughout, so the pseudo-wheel `tutte` is written `all` there
 * and nowhere else: it stays `tutte` in the data and in the state.
 */
function syncHash() {
  const parts = state.tab === 'formulas'
    ? ['', state.tab, ...formulaHash()]
    : ['', state.tab, state.wheel === 'tutte' ? 'all' : state.wheel, state.period];
  if (state.tab === 'followers') parts.push(String(state.spy));
  if (state.tab === 'draws') parts.push(state.drawsView);
  history.replaceState(null, '', `#${parts.join('/')}`);
}

function readHash() {
  const [, inHash, ...rest] = (location.hash.slice(1) || '').split('/');
  // `board` is what the opening tab was called: addresses saved then still open it.
  const tab = inHash === 'board' ? DEFAULT_TAB : inHash;
  if (!Object.hasOwn(RENDERERS, tab)) return;
  state.tab = tab;
  if (tab === 'formulas') {
    readFormulaHash(rest);
    return;
  }
  const [inAddress, period, spy] = rest;
  if (LABELS.drawViews.some(([id]) => id === spy)) state.drawsView = spy;
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

async function main() {
  setUpTheme();
  formulaState.load = allDraws;
  formulaState.sync = syncHash;
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
