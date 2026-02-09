import { Logger } from './logger.js';
import { loadAllJson, normalizeAndMerge, filterDataset } from './dataLoader.js';
import { renderByYear, renderDiscs, renderLang, renderTopSeries, renderGenres, renderGenreCountHistogram, renderGenreCoocHeatmap, renderGenreCoocScatter } from './charts.js';

const state = {
  raw: null,
  model: null,
  charts: {},
  filters: { yearMin: null, yearMax: null, text: '', requireFr: false, requireEn: false },
  cooc: { view: 'heatmap', metric: 'jaccard', hideDiagonal: false, exclude: [], tooltipMode: 'counts' }
};

// Anti-double ouverture pour co‑occurrence: timestamp du dernier clic série
let lastCoocSeriesClickTs = 0;

// État du drill-down (pour filtrer Films/Séries + export)
const drillState = { allItems: [], filtered: [], type: 'ALL' };

function qs(id) { return document.getElementById(id); }

async function boot() {
  Logger.setUiSink(qs('ui-log'));
  Logger.info('Démarrage application');
  Logger.info("Mode accompagnement actif — je suis là, posez vos questions et je vous réponds en live.");

  try {
    const raw = await loadAllJson();
    state.raw = raw;
    const model = normalizeAndMerge({
      RESUMES: raw['RESUMES.json'],
      SERIE1: raw['SERIE1.json'],
      SERIE2: raw['SERIE2.json'],
      TOUSLESFILMS: raw['TOUSLESFILMS.json'],
      CATEGORIES: raw['CATEGORIES.json'],
    });
    state.model = model;
    Logger.info('KPIs', model.kpis);
    // Résumé des données chargées pour accompagnement
    try {
      const filmsCount = (model.films || []).length;
      const episodesCount = (model.s1||[]).length + (model.s2||[]).length;
      const categoriesCount = (model.categories && model.categories.size) ? model.categories.size : 0;
      const filmsWithGenres = (model.films || []).filter(f => Array.isArray(f.GENRES) && f.GENRES.length>0).length;
      Logger.info('Résumé données disponibles', {
        films: filmsCount,
        episodes: episodesCount,
        categories: categoriesCount,
        filmsAvecGenres: filmsWithGenres
      });
    } catch {}
    fillKpis(model.kpis);
    renderAll(model);
    setupFilters(model);
    setupCoocControls(model);
  } catch (e) {
    Logger.error('Echec initialisation', e);
  }
}

function fillKpis(k) {
  qs('kpi-total').textContent = k.total.toLocaleString('fr-CA');
  qs('kpi-uniques').textContent = k.uniqueTitles.toLocaleString('fr-CA');
  qs('kpi-resume').textContent = `${k.pctResume}%`;
  qs('kpi-audio').textContent = `${k.pctAudio}%`;
}

function renderAll(model, filteredDataset = null) {
  const needRecomputeCooc = !!filteredDataset || (state.cooc.exclude && state.cooc.exclude.length > 0);
  const coocPayload = needRecomputeCooc
    ? recomputeGenreCooc(filteredDataset || model.dataset, model.categories, { excludeCodes: state.cooc.exclude })
    : model.aggs.genreCooc;
  const aggs = filteredDataset ? {
    byYear: recomputeByYear(filteredDataset),
    discs: recomputeDiscs(filteredDataset),
    lang: recomputeLang(filteredDataset),
    topSeries: model.aggs.topSeries, // top series stays global pour l'instant
    genres: recomputeGenres(filteredDataset, model.categories),
    genreCounts: recomputeGenreCounts(filteredDataset),
    genreCooc: coocPayload,
  } : { ...model.aggs, genreCooc: coocPayload };

  // Dispose old charts if any (avoid leaks)
  for (const key of Object.keys(state.charts)) {
    try { state.charts[key].dispose?.(); } catch {}
  }
  state.charts = {};

  state.charts.byYear = renderByYear(qs('chart-by-year'), aggs.byYear);
  state.charts.discs = renderDiscs(qs('chart-discs'), aggs.discs);
  state.charts.lang = renderLang(qs('chart-lang'), aggs.lang);
  state.charts.topSeries = renderTopSeries(qs('chart-top-series'), aggs.topSeries);
  state.charts.genres = renderGenres(qs('chart-genres'), aggs.genres);
  state.charts.genreCounts = renderGenreCountHistogram(qs('chart-genre-counts'), aggs.genreCounts);
  // co‑occurrence: guard against empty view when diagonal is hidden and Top N <= 1
  if (state.cooc.hideDiagonal && ((aggs.genreCooc?.labels?.length || 0) <= 1)) {
    Logger.warn('Masquage de la diagonale désactivé — Top N trop petit pour afficher des cellules', { topSize: aggs.genreCooc?.labels?.length || 0 });
    state.cooc.hideDiagonal = false;
    try { const elHide = document.getElementById('cooc-hide-diag'); if (elHide) elHide.checked = false; } catch {}
  }
  // co‑occurrence: choose renderer and pass options
  let coocOpts = { metric: state.cooc.metric || 'jaccard', hideDiagonal: !!state.cooc.hideDiagonal, exclude: state.cooc.exclude || [], tooltipMode: state.cooc.tooltipMode || 'counts' };
  // Avant rendu, log explicite sur la présence de données de co‑occurrence
  let payload = aggs.genreCooc || {};
  try {
    const totalCells = Array.isArray(payload.matrix) ? payload.matrix.length : 0;
    const visibleCells = totalCells ? (payload.matrix.filter(c => !(coocOpts.hideDiagonal && c.i === c.j)).length) : 0;
    const nonZeroCells = totalCells ? (payload.matrix.filter(c => c.count > 0 && !(coocOpts.hideDiagonal && c.i === c.j)).length) : 0;
    const sampleLabels = (payload.labels || []).slice(0, 8).map(l => l.label || l.code);
    Logger.info('Pré‑rendu co‑occurrence', {
      labels: (payload.labels ? payload.labels.length : 0),
      totalCells,
      visibleCells,
      nonZeroCells,
      metric: coocOpts.metric,
      hideDiagonal: coocOpts.hideDiagonal,
      exclude: coocOpts.exclude,
      sampleLabels
    });
    // Fallback auto niveau 1: si la heatmap serait vide mais qu'il y a des données, basculer en vue Points
    if (state.cooc.view === 'heatmap' && totalCells > 0 && visibleCells === 0) {
      Logger.warn('Heatmap co‑occurrence sans cellules visibles — bascule automatique en vue Points', { metric: coocOpts.metric, hideDiagonal: coocOpts.hideDiagonal, exclude: coocOpts.exclude });
      state.cooc.view = 'points';
      // Fallback auto niveau 2: forcer une visibilité minimale (inclure diagonale + metric count)
      coocOpts.metric = 'count';
      coocOpts.hideDiagonal = false;
      Logger.info('Forçage d\'affichage co‑occurrence (points, compte, diagonale visible)', { metric: coocOpts.metric, hideDiagonal: coocOpts.hideDiagonal });
    }
  } catch {}
  if (state.cooc.view === 'points') {
    state.charts.genreCooc = renderGenreCoocScatter(qs('chart-genres-cooc'), payload, coocOpts);
  } else {
    state.charts.genreCooc = renderGenreCoocHeatmap(qs('chart-genres-cooc'), payload, coocOpts);
  }

  bindDrilldowns(model, filteredDataset || model.dataset, aggs);
}

function setupFilters(model) {
  // helper to know if any filter differs from defaults
  function getFilteredMaybe() {
    const f = state.filters;
    const has = !!(f.yearMin || f.yearMax || (f.text && f.text.trim()) || f.requireFr || f.requireEn);
    return has ? filterDataset(model.dataset, f) : null;
  }
  const yearMinEl = qs('filter-year-min');
  const yearMaxEl = qs('filter-year-max');
  const textEl = qs('filter-text');
  const frEl = qs('filter-lang-fr');
  const enEl = qs('filter-lang-en');

  qs('btn-apply').addEventListener('click', () => {
    state.filters.yearMin = parseInt(yearMinEl.value || '') || null;
    state.filters.yearMax = parseInt(yearMaxEl.value || '') || null;
    state.filters.text = textEl.value || '';
    state.filters.requireFr = !!frEl.checked && !enEl.checked ? true : false; // if both checked, no requirement
    state.filters.requireEn = !!enEl.checked && !frEl.checked ? true : false;

    const filtered = filterDataset(model.dataset, state.filters);
    Logger.info('Filtres appliqués', { filters: state.filters, size: filtered.length });
    // Update KPIs to reflect filtered dataset
    fillKpis({
      total: filtered.length,
      uniqueTitles: new Set(filtered.map(r => (r.TITREFRANCAIS || r.TITREANGLAIS || '').toUpperCase())).size,
      pctResume: filtered.length ? Math.round((filtered.filter(r => !!r.RESUME).length / filtered.length) * 1000) / 10 : 0,
      pctAudio: filtered.length ? Math.round(((filtered.filter(r => !!r.AUDIOFRANCAIS).length + filtered.filter(r => !!r.AUDIOANGLAIS).length) / (2 * filtered.length)) * 1000) / 10 : 0,
    });

    renderAll(model, filtered);
  });

  qs('btn-reset').addEventListener('click', () => {
    yearMinEl.value = '';
    yearMaxEl.value = '';
    textEl.value = '';
    frEl.checked = true;
    enEl.checked = true;
    state.filters = { yearMin: null, yearMax: null, text: '', requireFr: false, requireEn: false };
    Logger.info('Filtres réinitialisés');
    fillKpis(state.model.kpis);
    renderAll(state.model);
  });
}

// On-the-fly recompute for filtered views
function recomputeByYear(dataset) {
  const map = new Map();
  for (const r of dataset) {
    const y = r.ANNEE ?? 'NA';
    map.set(y, (map.get(y) || 0) + 1);
  }
  const arr = Array.from(map.entries()).filter(([y]) => y !== 'NA').sort((a,b) => a[0]-b[0]);
  return arr.map(([year, count]) => ({ year, count }));
}
function recomputeDiscs(dataset) {
  // Mirror aggregateDiscs: split films vs séries, counting unique series per disc
  const frFilms = new Map();
  const enFilms = new Map();
  const frSeriesSet = new Map();
  const enSeriesSet = new Map();

  function addSet(map, key, val) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(val);
  }

  for (const r of dataset) {
    const dfr = r.DISQUEFRANCAIS || '—';
    const den = r.DISQUEANGLAIS || '—';

    const isEpisode = r.__TYPE === 'EPISODE';
    const isSeriesFilmFlag = r.__TYPE === 'FILM' && (r.SERIE === 'X');
    const isFilm = r.__TYPE === 'FILM' && (r.SERIE !== 'X');

    if (isEpisode || isSeriesFilmFlag) {
      const base = (r.TITREFRANCAIS || r.TITREANGLAIS || '').replace(/(\s*-\s*\d{1,3}[^]*)$/, '').trim();
      if (dfr) addSet(frSeriesSet, dfr, base);
      if (den) addSet(enSeriesSet, den, base);
    } else if (isFilm) {
      frFilms.set(dfr, (frFilms.get(dfr) || 0) + 1);
      enFilms.set(den, (enFilms.get(den) || 0) + 1);
    }
  }

  const keys = Array.from(new Set([
    ...Array.from(frFilms.keys()),
    ...Array.from(enFilms.keys()),
    ...Array.from(frSeriesSet.keys()),
    ...Array.from(enSeriesSet.keys()),
  ])).sort();

  return keys.map((k) => ({
    disc: k,
    frFilms: frFilms.get(k) || 0,
    frSeries: frSeriesSet.has(k) ? frSeriesSet.get(k).size : 0,
    enFilms: enFilms.get(k) || 0,
    enSeries: enSeriesSet.has(k) ? enSeriesSet.get(k).size : 0,
  }));
}
function recomputeGenres(dataset, categories) {
  // Reuse aggregate logic: films only, split Film vs Série
  const counts = new Map();
  for (const r of dataset) {
    if (r.__TYPE !== 'FILM') continue;
    const isSeries = r.SERIE === 'X';
    const list = Array.isArray(r.GENRES) ? r.GENRES : [];
    for (const codeRaw of list) {
      const code = String(codeRaw).toUpperCase();
      if (!counts.has(code)) counts.set(code, { total: 0, films: 0, series: 0 });
      const obj = counts.get(code);
      obj.total += 1;
      if (isSeries) obj.series += 1; else obj.films += 1;
    }
  }
  const arr = Array.from(counts.entries()).map(([code, v]) => {
    const meta = categories.get(code) || { labelFR: code, descriptionFR: '' };
    return { code, label: meta.labelFR, description: meta.descriptionFR, total: v.total, films: v.films, series: v.series };
  });
  arr.sort((a,b) => b.total - a.total || a.label.localeCompare(b.label));
  return arr;
}

function recomputeLang(dataset) {
  const buckets = { both: 0, frOnly: 0, enOnly: 0, none: 0 };
  for (const r of dataset) {
    const fr = !!r.AUDIOFRANCAIS;
    const en = !!r.AUDIOANGLAIS;
    if (fr && en) buckets.both++;
    else if (fr) buckets.frOnly++;
    else if (en) buckets.enOnly++;
    else buckets.none++;
  }
  return buckets;
}

function recomputeGenreCounts(dataset) {
  // Bins 0..9 et '9+' pour refléter la nouvelle règle
  const bins = {
    '0': { films:0, series:0 }, '1': { films:0, series:0 }, '2': { films:0, series:0 }, '3': { films:0, series:0 }, '4': { films:0, series:0 },
    '5': { films:0, series:0 }, '6': { films:0, series:0 }, '7': { films:0, series:0 }, '8': { films:0, series:0 }, '9': { films:0, series:0 },
    '9+': { films:0, series:0 }
  };
  for (const r of dataset) {
    if (r.__TYPE !== 'FILM') continue;
    const n = Array.isArray(r.GENRES) ? r.GENRES.length : 0;
    const key = n >= 9 ? '9+' : String(Math.min(n, 9));
    if (r.SERIE === 'X') bins[key].series++; else bins[key].films++;
  }
  const order = ['0','1','2','3','4','5','6','7','8','9','9+'];
  return order.map(k => ({ bucket: k, films: bins[k].films, series: bins[k].series, total: bins[k].films + bins[k].series }));
}

function recomputeGenreCooc(dataset, categories, options = {}) {
  const exclude = new Set((options.excludeCodes || []).map(c => String(c).toUpperCase()));
  const freq = new Map();
  let totalFilms = 0;
  for (const r of dataset) {
    if (r.__TYPE !== 'FILM') continue;
    totalFilms++;
    const list = Array.isArray(r.GENRES) ? r.GENRES : [];
    for (const c of list) {
      const code = String(c).toUpperCase();
      if (exclude.has(code)) continue;
      freq.set(code, (freq.get(code)||0) + 1);
    }
  }
  const top = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).filter(([c])=>!exclude.has(c)).slice(0,20).map(([c])=>c);
  const idx = new Map(); top.forEach((c,i)=>idx.set(c,i));
  const size = top.length;
  const mat = Array.from({length:size},()=>Array(size).fill(0));
  const counts = Array.from({length:size},()=>0);
  for (const r of dataset) {
    if (r.__TYPE !== 'FILM') continue;
    const list = Array.isArray(r.GENRES) ? r.GENRES.map(c=>String(c).toUpperCase()) : [];
    const codes = Array.from(new Set(list.filter(c=>idx.has(c))));
    for (const c of codes) { const k = idx.get(c); counts[k] += 1; }
    for (let i=0;i<codes.length;i++){
      for (let j=i;j<codes.length;j++){
        const a = idx.get(codes[i]); const b = idx.get(codes[j]);
        mat[a][b] += 1; if (a!==b) mat[b][a] += 1;
      }
    }
  }
  const labels = top.map(code => { const meta = categories.get(code) || { labelFR: code }; return { code, label: meta.labelFR }; });
  const matrix = [];
  for (let i=0;i<size;i++) for (let j=0;j<size;j++) {
    const cAB = mat[i][j];
    const cA = counts[i]||0; const cB = counts[j]||0;
    const denom = (cA + cB - cAB);
    const jaccard = denom>0 ? cAB/denom : 0;
    const lift = (cA>0 && cB>0 && totalFilms>0) ? (cAB*totalFilms)/(cA*cB) : 0;
    const pmi = (lift>0) ? Math.log2(lift) : 0;
    matrix.push({ i, j, count: cAB, aCount: cA, bCount: cB, jaccard, lift, pmi });
  }
  return { labels, matrix, counts, totalFilms };
}

// Drill‑down utilities
function bindDrilldowns(model, dataset, aggs) {
  // detach previous handlers by re-setting options with identical handlers
  attachClick(state.charts.byYear, (p)=> openFrom('byYear', { year: p.name }, dataset, model));
  attachClick(state.charts.discs, (p)=> openFrom('discs', { disc: p.name, seriesName: p.seriesName }, dataset, model));
  attachClick(state.charts.lang, (p)=> openFrom('lang', { bucket: p.name }, dataset, model));
  attachClick(state.charts.topSeries, (p)=> openFrom('topSeries', { baseTitle: p.name }, dataset, model));
  attachClick(state.charts.genres, (p)=> openFrom('genres', { label: p.name, code: inferGenreCodeFromLabel(p.name, model), type: p.seriesName }, dataset, model));
  attachClick(state.charts.genreCounts, (p)=> openFrom('genreCounts', { bucket: p.name, type: p.seriesName }, dataset, model));
  attachClick(state.charts.genreCooc, (p)=> {
    // Support both heatmap (array [x,y,val,cell]) and scatter (object with fields)
    try {
      const now = Date.now();
      if (now - lastCoocSeriesClickTs < 300) return; // debounce
      let i, j;
      if (Array.isArray(p.data)) { i = p.data[1]; j = p.data[0]; }
      else if (p?.data && Number.isFinite(p.data.i) && Number.isFinite(p.data.j)) { i = p.data.i; j = p.data.j; }
      if (!Number.isFinite(i) || !Number.isFinite(j)) return;
      const A = aggs.genreCooc.labels[i];
      const B = aggs.genreCooc.labels[j];
      lastCoocSeriesClickTs = now;
      openFrom('genreCooc', { codeA: A.code, codeB: B.code, labelA: A.label, labelB: B.label }, dataset, model);
    } catch (e) {
      Logger.warn('Click handler co‑occurrence (série) a échoué', { err: String(e) });
    }
  });

  // Fallback manuel: si, pour une raison quelconque, l’event de série ne se déclenche pas,
  // on écoute le clic au niveau ZRender, convertit le pixel en indices (i,j) et ouvre le drill‑down.
  try {
    const chart = state.charts.genreCooc;
    const zr = chart?.getZr?.();
    if (zr) {
      zr.off('click'); // nettoie anciens handlers éventuels sur ce rendu
      zr.on('click', (e) => {
        try {
          const now = Date.now();
          if (now - lastCoocSeriesClickTs < 300) return; // priorité à l’event série s’il a eu lieu
          const xy = [e.offsetX, e.offsetY];
          const coord = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, xy);
          if (!coord || coord.length < 2) return;
          // coord peut retourner les libellés (catégories) ou les indices
          const labels = (aggs.genreCooc?.labels || []).map(l=> l.label || l.code);
          const j = typeof coord[0] === 'number' ? coord[0] : labels.indexOf(coord[0]);
          const i = typeof coord[1] === 'number' ? coord[1] : labels.indexOf(coord[1]);
          if (!Number.isFinite(i) || !Number.isFinite(j) || i < 0 || j < 0) return;
          const A = aggs.genreCooc.labels[i];
          const B = aggs.genreCooc.labels[j];
          Logger.info('Manual click cooc', { i, j, labelA: A?.label, labelB: B?.label });
          lastCoocSeriesClickTs = now;
          openFrom('genreCooc', { codeA: A.code, codeB: B.code, labelA: A.label, labelB: B.label }, dataset, model);
        } catch (err) {
          Logger.warn('Manual click cooc — échec conversion pixel→indices', { err: String(err) });
        }
      });
    }
  } catch (e) {
    Logger.warn('Installation fallback clic co‑occurrence a échoué', { err: String(e) });
  }
}

function attachClick(chart, handler) {
  if (!chart) return;
  chart.off('click');
  chart.on('click', handler);
}

function inferGenreCodeFromLabel(label, model) {
  for (const [code, meta] of model.categories.entries()) {
    if (meta.labelFR === label) return code;
  }
  return label; // fallback: label is code
}

function openFrom(kind, payload, dataset, model) {
  const items = computeDrillSubset(kind, payload, dataset, model);
  const title = buildDrillTitle(kind, payload, items.length);
  // initialise état pour filtrage Films/Séries dans la modale
  drillState.allItems = items;
  drillState.type = 'ALL';
  drillState.filtered = items;
  openDrilldown(items, title);
  Logger.info('Drill‑down ouvert', { kind, payload, count: items.length });
}

function computeDrillSubset(kind, payload, dataset, model) {
  const items = [];
  const push = (r)=> items.push(r);
  const inGenres = (r, code)=> Array.isArray(r.GENRES) && r.GENRES.map(c=>String(c).toUpperCase()).includes(String(code).toUpperCase());

  switch(kind){
    case 'byYear':
      for (const r of dataset) if (r.ANNEE === Number(payload.year)) push(r);
      break;
    case 'discs': {
      const isFR = /FR/.test(payload.seriesName);
      const disc = String(payload.disc);
      for (const r of dataset) {
        const d = isFR ? (r.DISQUEFRANCAIS||'—') : (r.DISQUEANGLAIS||'—');
        if (d === disc) push(r);
      }
      break; }
    case 'lang':
      for (const r of dataset) {
        const fr = !!r.AUDIOFRANCAIS; const en = !!r.AUDIOANGLAIS;
        if (payload.bucket === 'FR+EN' && fr && en) push(r);
        else if (payload.bucket === 'FR seul' && fr && !en) push(r);
        else if (payload.bucket === 'EN seul' && !fr && en) push(r);
        else if (payload.bucket === 'Aucun' && !fr && !en) push(r);
      }
      break;
    case 'topSeries': {
      const base = String(payload.baseTitle).toUpperCase();
      for (const r of dataset) {
        const t = (r.TITREFRANCAIS || r.TITREANGLAIS || '').toUpperCase();
        if (t.startsWith(base)) push(r);
      }
      break; }
    case 'genres': {
      const code = payload.code;
      for (const r of dataset) {
        if (r.__TYPE !== 'FILM') continue;
        if (payload.type === 'Films' && r.SERIE === 'X') continue;
        if (payload.type === 'Séries' && r.SERIE !== 'X') continue;
        if (inGenres(r, code)) push(r);
      }
      break; }
    case 'genreCounts': {
      const wanted = payload.bucket;
      for (const r of dataset) {
        if (r.__TYPE !== 'FILM') continue;
        if (payload.type === 'Films' && r.SERIE === 'X') continue;
        if (payload.type === 'Séries' && r.SERIE !== 'X') continue;
        const n = Array.isArray(r.GENRES) ? r.GENRES.length : 0;
        const bucket = n>=9 ? '9+' : String(n);
        if (bucket === wanted) push(r);
      }
      break; }
    case 'genreCooc': {
      const { codeA, codeB } = payload;
      for (const r of dataset) {
        if (r.__TYPE !== 'FILM') continue;
        if (inGenres(r, codeA) && inGenres(r, codeB)) push(r);
      }
      break; }
  }
  return items;
}

function buildDrillTitle(kind, payload, n) {
  switch(kind){
    case 'byYear': return `Titres pour l'année ${payload.year} — ${n}`;
    case 'discs': return `Titres pour disque ${payload.disc} (${payload.seriesName}) — ${n}`;
    case 'lang': return `Titres par langue: ${payload.bucket} — ${n}`;
    case 'topSeries': return `Série: ${payload.baseTitle} — ${n}`;
    case 'genres': return `Catégorie: ${payload.label} (${payload.type}) — ${n}`;
    case 'genreCounts': return `Nombre de catégories: ${payload.bucket} (${payload.type}) — ${n}`;
    case 'genreCooc': return `Co‑occurrence: ${payload.labelA} ∩ ${payload.labelB} — ${n}`;
    default: return `Sélection — ${n}`;
  }
}

function openDrilldown(items, title) {
  const modal = qs('drilldown');
  const rowsEl = qs('drill-rows');
  const titleEl = qs('drill-title');
  const panel = qs('drill-panel');
  const backdrop = qs('drill-backdrop');
  const typeFilterWrap = qs('drill-type-filter');
  const btnAll = qs('drill-type-all');
  const btnFilm = qs('drill-type-film');
  const btnSerie = qs('drill-type-serie');

  // Compute counts per type
  const filmsCount = items.filter(r => r.__TYPE === 'FILM').length;
  const seriesCount = items.filter(r => r.__TYPE === 'EPISODE').length;
  const bothTypes = filmsCount > 0 && seriesCount > 0;

  // Setup initial filtered set
  drillState.allItems = items;
  drillState.filtered = items;
  drillState.type = 'ALL';

  function renderRows(list){ rowsEl.innerHTML = list.map(rowToTr).join(''); }
  function applyActive(btn){
    [btnAll, btnFilm, btnSerie].forEach(b=>{ if(!b) return; b.classList.remove('bg-indigo-600','text-white'); b.classList.add('bg-slate-800'); });
    if (btn) { btn.classList.remove('bg-slate-800'); btn.classList.add('bg-indigo-600','text-white'); }
  }
  function updateTitle(){
    titleEl.textContent = `${title} — ${drillState.filtered.length}/${drillState.allItems.length}`;
  }
  function applyType(t){
    drillState.type = t;
    if (t === 'FILM') drillState.filtered = drillState.allItems.filter(r=>r.__TYPE==='FILM');
    else if (t === 'SERIE') drillState.filtered = drillState.allItems.filter(r=>r.__TYPE==='EPISODE');
    else drillState.filtered = drillState.allItems.slice();
    renderRows(drillState.filtered);
    updateTitle();
    Logger.info('Drill‑down: filtre type appliqué', { type: t, films: filmsCount, episodes: seriesCount, shown: drillState.filtered.length });
  }

  // Show/hide type filter UI
  if (bothTypes) {
    typeFilterWrap.classList.remove('hidden');
    // Attach handlers once per open
    btnAll.onclick = () => { applyActive(btnAll); applyType('ALL'); };
    btnFilm.onclick = () => { applyActive(btnFilm); applyType('FILM'); };
    btnSerie.onclick = () => { applyActive(btnSerie); applyType('SERIE'); };
    applyActive(btnAll);
  } else {
    typeFilterWrap.classList.add('hidden');
  }

  renderRows(drillState.filtered);
  updateTitle();

  // Open modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Scroll lock background
  try { document.body.dataset.prevOverflow = document.body.style.overflow || ''; document.body.style.overflow = 'hidden'; } catch {}

  // Focus trap minimal: focus panel and trap Tab inside
  try { panel.setAttribute('tabindex','-1'); panel.focus(); } catch {}
  function onKey(e){
    if (e.key === 'Escape') { e.preventDefault(); closeDrilldown(); }
  }
  window.addEventListener('keydown', onKey, { once: true });

  // Backdrop click closes
  if (backdrop) {
    backdrop.onclick = () => closeDrilldown();
  }

  // Close button
  qs('drill-close').onclick = closeDrilldown;

  // Export uses current filtered list
  qs('drill-export').onclick = () => exportCsv(drillState.filtered, 'selection.csv');
}

function closeDrilldown(){
  const modal = qs('drilldown');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  // restore scroll
  try { const prev = document.body.dataset.prevOverflow || ''; document.body.style.overflow = prev; delete document.body.dataset.prevOverflow; } catch {}
}

function rowToTr(r){
  const genres = Array.isArray(r.GENRES) ? r.GENRES.join(', ') : '';
  return `<tr>
    <td class="p-1 text-slate-400">${r.__TYPE || ''}</td>
    <td class="p-1">${escapeHtml(r.TITREFRANCAIS||'')}</td>
    <td class="p-1 text-slate-300">${escapeHtml(r.TITREANGLAIS||'')}</td>
    <td class="p-1">${r.ANNEE ?? ''}</td>
    <td class="p-1">${r.DISQUEFRANCAIS || ''}</td>
    <td class="p-1">${r.DISQUEANGLAIS || ''}</td>
    <td class="p-1 text-slate-300">${escapeHtml(genres)}</td>
  </tr>`;
}

function exportCsv(items, filename){
  const cols = ['TYPE','TITREFRANCAIS','TITREANGLAIS','ANNEE','DISQUEFRANCAIS','DISQUEANGLAIS','GENRES'];
  const lines = [cols.join(',')];
  for (const r of items) {
    const row = [r.__TYPE||'', r.TITREFRANCAIS||'', r.TITREANGLAIS||'', r.ANNEE??'', r.DISQUEFRANCAIS||'', r.DISQUEANGLAIS||'', (Array.isArray(r.GENRES)?r.GENRES.join('|'):'')]
      .map(csvEscape).join(',');
    lines.push(row);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v){
  const s = String(v).replace(/"/g,'""');
  if (/[",\n]/.test(s)) return `"${s}"`;
  return s;
}

function escapeHtml(s){
  return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

window.addEventListener('DOMContentLoaded', boot);

function setupCoocControls(model) {
  const elDrama = qs('cooc-toggle-drama');
  const elPing = qs('cooc-ping-log');

  if (!elDrama) {
    Logger.warn('Bouton "Exclure DRAME" introuvable — saut de configuration');
    return;
  }

  function applyDramaButton() {
    const excluded = new Set((state.cooc.exclude || []).map(c => String(c).toUpperCase()));
    const isExcluded = excluded.has('DRAME');
    elDrama.textContent = isExcluded ? 'Inclure DRAME' : 'Exclure DRAME';
    if (isExcluded) elDrama.classList.add('bg-amber-600'); else elDrama.classList.remove('bg-amber-600');
  }

  function rerender() {
    const filtered = filterDataset(model.dataset, state.filters);
    renderAll(model, filtered);
  }

  // Listen tooltip mode switch coming from charts tooltips
  try {
    window.removeEventListener('cooc-tooltip-mode', window.__onCoocTooltipMode);
  } catch {}
  window.__onCoocTooltipMode = (ev) => {
    const mode = (ev?.detail?.mode === 'metrics') ? 'metrics' : 'counts';
    if (state.cooc.tooltipMode === mode) return;
    state.cooc.tooltipMode = mode;
    Logger.info('Tooltip co‑occurrence: mode changé', { mode });
    rerender();
  };
  window.addEventListener('cooc-tooltip-mode', window.__onCoocTooltipMode);

  elDrama.addEventListener('click', () => {
    const set = new Set((state.cooc.exclude || []).map(c => String(c).toUpperCase()));
    if (set.has('DRAME')) set.delete('DRAME'); else set.add('DRAME');
    state.cooc.exclude = Array.from(set);
    applyDramaButton();
    rerender();
  });

  if (elPing) {
    elPing.addEventListener('click', () => {
      try {
        // Co-occurrence payload quick facts
        const payload = state.model?.aggs?.genreCooc || {};
        const labels = (payload.labels||[]).map(l=>l.label||l.code);
        const totalCells = Array.isArray(payload.matrix) ? payload.matrix.length : 0;
        const nonZero = totalCells ? payload.matrix.filter(c=>c.count>0).length : 0;
        Logger.info('Ping Journal — Co‑occurrence', { labelsCount: labels.length, labelsSample: labels.slice(0,10), totalCells, nonZero });

        // Intersection spécifique: HOR (Horreur) ∩ SCFI (Science-fiction)
        const filtered = filterDataset(state.model.dataset, state.filters);
        const films = filtered.filter(r => r.__TYPE === 'FILM');
        const toCodeSet = (r) => new Set((Array.isArray(r.GENRES)? r.GENRES : []).map(c=>String(c).toUpperCase()));
        let totalFilms = 0, aCount = 0, bCount = 0, interCount = 0;
        const sample = [];
        for (const r of films) {
          totalFilms++;
          const s = toCodeSet(r);
          const inA = s.has('HOR');
          const inB = s.has('SCFI');
          if (inA) aCount++;
          if (inB) bCount++;
          if (inA && inB) {
            interCount++;
            if (sample.length < 12) sample.push({
              titreFR: r.TITREFRANCAIS || '',
              titreEN: r.TITREANGLAIS || '',
              annee: r.ANNEE || null
            });
          }
        }
        const union = aCount + bCount - interCount;
        const jaccard = union > 0 ? interCount / union : 0;
        const lift = (aCount>0 && bCount>0 && totalFilms>0) ? (interCount * totalFilms) / (aCount * bCount) : 0;
        const pmi = lift > 0 ? Math.log2(lift) : 0;
        // Libellés depuis le dictionnaire de catégories si dispo
        const cats = state.model?.categories;
        const labelA = cats?.get('HOR')?.labelFR || 'Horreur';
        const labelB = cats?.get('SCFI')?.labelFR || 'Science-fiction';
        Logger.info('Ping Journal — HOR ∩ SCFI', {
          codeA: 'HOR', labelA,
          codeB: 'SCFI', labelB,
          totalFilms, aCount, bCount, interCount, union,
          jaccard, lift, pmi,
          sampleCount: sample.length,
          sample
        });
      } catch (e) {
        Logger.error('Ping Journal — échec', e);
      }
    });
  }

  applyDramaButton();
  Logger.info('Contrôle co‑occurrence initialisé (seulement Exclure DRAME)', state.cooc);
}