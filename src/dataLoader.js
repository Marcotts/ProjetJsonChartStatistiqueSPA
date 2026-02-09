import { Logger } from './logger.js';

// Utilities
function normStr(s) {
  if (s === null || s === undefined) return '';
  return String(s).trim();
}
function normDisc(s) {
  const v = normStr(s).toUpperCase();
  return v || null; // keep nulls
}
function normYear(y) {
  const v = normStr(y);
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

// Build strong composite key per spec
export function makeStrongKey(row) {
  return [
    normStr(row.TITREFRANCAIS).toUpperCase(),
    normStr(row.TITREANGLAIS).toUpperCase(),
    String(normYear(row.ANNEE) ?? '').toUpperCase(),
    String(normDisc(row.DISQUEFRANCAIS) ?? '').toUpperCase(),
    String(normDisc(row.DISQUEANGLAIS) ?? '').toUpperCase(),
  ].join(' | ');
}

// Detect if a series row is a header: POCHETTE is filled (non-null)
export function isSeriesHeader(row) {
  return hasValue(row.POCHETTE);
}

// Extract base series title by removing episode suffix like " - 01 ..." (heuristic)
export function baseSeriesTitle(title) {
  const t = normStr(title);
  // Look for pattern ' - NN' where NN is 1-3 digits, possibly followed by text
  const m = t.match(/^(.*?)(\s*-\s*\d{1,3}[^]*)$/);
  if (!m) return t; // no episode suffix detected
  return normStr(m[1]);
}

export async function loadAllJson() {
  const files = ['RESUMES.json', 'SERIE1.json', 'SERIE2.json', 'TOUSLESFILMS.json', 'CATEGORIES.json'];
  Logger.info('Chargement des JSON (via fetch)', { files });
  const results = {};
  for (const f of files) {
    try {
      const t0 = performance.now();
      const resp = await fetch(`./${f}`, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const dt = Math.round(performance.now() - t0);
      Logger.info(`OK ${f} (${data.length} lignes) en ${dt} ms`);
      results[f] = data;
    } catch (e) {
      Logger.error(`Erreur de chargement ${f}`, e);
      results[f] = [];
    }
  }
  return results;
}

export function normalizeAndMerge({ RESUMES, SERIE1, SERIE2, TOUSLESFILMS, CATEGORIES }) {
  const t0 = performance.now();
  Logger.info('Normalisation & fusion: début');

  const categoryCodes = (CATEGORIES || []).map(c => String(c.code).trim()).filter(Boolean);

  // Normalize arrays
  const films = (TOUSLESFILMS || []).map((r) => normFilm(r, categoryCodes));
  const resumes = (RESUMES || []).map((r) => normCommon(r, 'RESUME'));
  const s1 = (SERIE1 || []).map((r) => normSeries(r, 'S1'));
  const s2 = (SERIE2 || []).map((r) => normSeries(r, 'S2'));

  // Index resumes by strong key for quick lookup
  const resumeByKey = new Map();
  for (const r of resumes) {
    const k = makeStrongKey(r);
    if (!resumeByKey.has(k)) resumeByKey.set(k, r);
  }

  // Link films to resume if available
  for (const f of films) {
    const k = makeStrongKey(f);
    const r = resumeByKey.get(k);
    if (r && hasValue(r.RESUME)) f.RESUME = r.RESUME;
  }

  // Build series structure: headers and episodes
  function buildSeries(all) {
    const headers = new Map(); // baseTitle -> headerRow
    const episodes = new Map(); // baseTitle -> []

    for (const r of all) {
      if (isSeriesHeader(r)) {
        const base = baseSeriesTitle(r.TITREFRANCAIS || r.TITREANGLAIS);
        headers.set(base, r);
        if (!episodes.has(base)) episodes.set(base, []);
      }
    }
    for (const r of all) {
      if (!isSeriesHeader(r)) {
        const base = baseSeriesTitle(r.TITREFRANCAIS || r.TITREANGLAIS);
        if (!episodes.has(base)) episodes.set(base, []);
        episodes.get(base).push(r);
      }
    }
    // decorate headers with episode count
    for (const [base, h] of headers.entries()) {
      const list = episodes.get(base) || [];
      h.EPISODES = list;
      h.NBEPISODES = list.length;
    }
    return { headers, episodes };
  }

  const sAll = [...s1, ...s2];
  const series = buildSeries(sAll);

  // Global dataset = films + series episodes as separate rows for charts, but keep type
  const dataset = [
    ...films.map((r) => ({ ...r, __TYPE: 'FILM' })),
    ...sAll.map((r) => ({ ...r, __TYPE: 'EPISODE' })),
  ];

  // KPIs and aggregates
  const kpis = computeKpis(dataset, series);
  const categories = buildCategoriesMap(CATEGORIES || []);
  const aggs = {
    byYear: aggregateByYear(dataset),
    discs: aggregateDiscs(dataset),
    lang: aggregateLang(dataset),
    topSeries: topSeriesByEpisodes(series, 10),
    genres: aggregateGenres(dataset, categories),
    genreCounts: aggregateGenreCounts(dataset),
    genreCooc: aggregateGenreCooccurrence(dataset, categories, 20),
  };

  const dt = Math.round(performance.now() - t0);
  Logger.info('Normalisation & fusion: fin', { millis: dt, counts: { films: films.length, resumes: resumes.length, serie1: s1.length, serie2: s2.length, dataset: dataset.length } });

  return { dataset, films, resumes, s1, s2, series, kpis, aggs, categories };
}

function normCommon(r, source) {
  return {
    __SRC: source,
    TITREFRANCAIS: normStr(r.TITREFRANCAIS),
    TITREANGLAIS: normStr(r.TITREANGLAIS),
    ANNEE: normYear(r.ANNEE),
    POCHETTE: hasValue(r.POCHETTE) ? normStr(r.POCHETTE) : null,
    DISQUEFRANCAIS: normDisc(r.DISQUEFRANCAIS),
    DISQUEANGLAIS: normDisc(r.DISQUEANGLAIS),
    AUDIOFRANCAIS: hasValue(r.AUDIOFRANCAIS) ? normStr(r.AUDIOFRANCAIS) : null,
    AUDIOANGLAIS: hasValue(r.AUDIOANGLAIS) ? normStr(r.AUDIOANGLAIS) : null,
    RESUME: hasValue(r.RESUME) ? normStr(r.RESUME) : null,
    SERIE: hasValue(r.SERIE) ? normStr(r.SERIE).toUpperCase() : null,
    ID: r.ID ?? null,
  };
}

// Specialized normalizer for films: also compute active genre codes list
function normFilm(r, categoryCodes) {
  const base = normCommon(r, 'FILM');
  const genres = [];
  for (const code of categoryCodes) {
    try {
      if (hasValue(r[code])) genres.push(code);
    } catch {}
  }
  return { ...base, GENRES: genres };
}

function normSeries(r, source) {
  const base = normCommon(r, source);
  return {
    ...base,
    ENDOUBLE: r.ENDOUBLE ?? null,
    DERNIEREPISODEVISIONNE: r.DERNIEREPISODEVISIONNE ?? null,
    ANNEESAISON: r.ANNEESAISON ?? null,
    DERNIERESAISON: r.DERNIERESAISON ?? null,
  };
}

function computeKpis(dataset, series) {
  const total = dataset.length;
  const uniqueTitles = new Set();
  let withResume = 0;
  let withAudioFr = 0; let withAudioEn = 0;

  for (const r of dataset) {
    const t = (r.TITREFRANCAIS || r.TITREANGLAIS || '').toUpperCase();
    if (t) uniqueTitles.add(t);
    if (hasValue(r.RESUME)) withResume++;
    if (hasValue(r.AUDIOFRANCAIS)) withAudioFr++;
    if (hasValue(r.AUDIOANGLAIS)) withAudioEn++;
  }

  return {
    total,
    uniqueTitles: uniqueTitles.size,
    pctResume: total ? Math.round((withResume / total) * 1000) / 10 : 0,
    pctAudio: total ? Math.round(((withAudioFr + withAudioEn) / (2 * total)) * 1000) / 10 : 0,
    seriesCount: series.headers.size,
  };
}

function aggregateByYear(dataset) {
  const map = new Map();
  for (const r of dataset) {
    const y = r.ANNEE ?? 'NA';
    map.set(y, (map.get(y) || 0) + 1);
  }
  const arr = Array.from(map.entries())
    .filter(([y]) => y !== 'NA')
    .sort((a, b) => a[0] - b[0]);
  return arr.map(([year, count]) => ({ year, count }));
}

function aggregateDiscs(dataset) {
  // We want per disc: films vs series, for FR and EN.
  // Series are counted as unique series (base title) per disc; films are counted as items not marked as series.
  const frFilms = new Map();
  const enFilms = new Map();
  const frSeriesSet = new Map(); // disc -> Set of base series titles
  const enSeriesSet = new Map();

  function addSet(map, key, val) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(val);
  }

  for (const r of dataset) {
    const dfr = r.DISQUEFRANCAIS || '—';
    const den = r.DISQUEANGLAIS || '—';

    const isEpisode = r.__TYPE === 'EPISODE';
    const isSeriesFilmFlag = r.__TYPE === 'FILM' && r.SERIE === 'X';
    const isFilm = r.__TYPE === 'FILM' && r.SERIE !== 'X';

    if (isEpisode || isSeriesFilmFlag) {
      const base = baseSeriesTitle(r.TITREFRANCAIS || r.TITREANGLAIS);
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

  return keys.map((k) => {
    const frS = frSeriesSet.has(k) ? frSeriesSet.get(k).size : 0;
    const enS = enSeriesSet.has(k) ? enSeriesSet.get(k).size : 0;
    const frF = frFilms.get(k) || 0;
    const enF = enFilms.get(k) || 0;
    return { disc: k, frFilms: frF, frSeries: frS, enFilms: enF, enSeries: enS };
  });
}

function buildCategoriesMap(arr) {
  const map = new Map();
  for (const c of arr) {
    const code = String(c.code || '').trim().toUpperCase();
    if (!code) continue;
    map.set(code, { labelFR: c.labelFR || code, descriptionFR: c.descriptionFR || '' });
  }
  return map;
}

function aggregateGenres(dataset, categories) {
  // Count by category code using films only (from TOUSLESFILMS), split Film vs Série per SERIE flag
  const counts = new Map(); // code -> { total, films, series }
  for (const r of dataset) {
    if (r.__TYPE !== 'FILM') continue;
    const list = Array.isArray(r.GENRES) ? r.GENRES : [];
    const isSeries = r.SERIE === 'X';
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
  arr.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  return arr;
}

function aggregateGenreCounts(dataset) {
  // Histogramme du nombre de catégories par titre (films seulement)
  // Bins: 0..9 puis '9+' pour regrouper les valeurs supérieures
  const bins = {
    '0': { total: 0, films: 0, series: 0 },
    '1': { total: 0, films: 0, series: 0 },
    '2': { total: 0, films: 0, series: 0 },
    '3': { total: 0, films: 0, series: 0 },
    '4': { total: 0, films: 0, series: 0 },
    '5': { total: 0, films: 0, series: 0 },
    '6': { total: 0, films: 0, series: 0 },
    '7': { total: 0, films: 0, series: 0 },
    '8': { total: 0, films: 0, series: 0 },
    '9': { total: 0, films: 0, series: 0 },
    '9+': { total: 0, films: 0, series: 0 },
  };
  for (const r of dataset) {
    if (r.__TYPE !== 'FILM') continue;
    const n = Array.isArray(r.GENRES) ? r.GENRES.length : 0;
    const isSeries = r.SERIE === 'X';
    const key = n >= 9 ? '9+' : String(Math.min(n, 9));
    const obj = bins[key];
    obj.total += 1;
    if (isSeries) obj.series += 1; else obj.films += 1;
  }
  const order = ['0','1','2','3','4','5','6','7','8','9','9+'];
  return order.map(k => ({ bucket: k, total: bins[k].total, films: bins[k].films, series: bins[k].series }));
}

function aggregateGenreCooccurrence(dataset, categories, topN = 20, options = {}) {
  // Construire top catégories par fréquence, puis matrice de co‑occurrence sur ces catégories
  // options: { excludeCodes?: Set<string>|string[] }
  const exclude = new Set((options.excludeCodes || []).map(c => String(c).toUpperCase()));
  const freq = new Map();
  let totalFilms = 0;
  for (const r of dataset) {
    if (r.__TYPE !== 'FILM') continue;
    totalFilms++;
    const list = Array.isArray(r.GENRES) ? r.GENRES : [];
    for (const codeRaw of list) {
      const code = String(codeRaw).toUpperCase();
      if (exclude.has(code)) continue;
      freq.set(code, (freq.get(code) || 0) + 1);
    }
  }
  const top = Array.from(freq.entries())
    .sort((a,b) => b[1] - a[1])
    .filter(([code]) => !exclude.has(code))
    .slice(0, topN)
    .map(([code]) => code);
  const idx = new Map();
  top.forEach((c,i) => idx.set(c,i));
  const size = top.length;
  const mat = Array.from({length: size}, () => Array(size).fill(0));
  const counts = Array.from({length: size}, () => 0);

  for (const r of dataset) {
    if (r.__TYPE !== 'FILM') continue;
    const list = Array.isArray(r.GENRES) ? r.GENRES.map(c => String(c).toUpperCase()) : [];
    // restreindre aux codes du top
    const codes = Array.from(new Set(list.filter(c => idx.has(c))));
    // incrémente diagonale via paires i==j dans les boucles, mais aussi gardons les comptes simples
    for (const c of codes) {
      const k = idx.get(c);
      counts[k] += 1;
    }
    for (let i = 0; i < codes.length; i++) {
      for (let j = i; j < codes.length; j++) {
        const a = idx.get(codes[i]);
        const b = idx.get(codes[j]);
        mat[a][b] += 1;
        if (a !== b) mat[b][a] += 1;
      }
    }
  }

  const labels = top.map(code => {
    const meta = categories.get(code) || { labelFR: code };
    return { code, label: meta.labelFR };
  });
  // transformer en liste {i,j,count,jaccard,lift,pmi}
  const matrix = [];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const cAB = mat[i][j];
      const cA = counts[i] || 0;
      const cB = counts[j] || 0;
      const denom = (cA + cB - cAB);
      const jaccard = denom > 0 ? cAB / denom : 0;
      const lift = (cA > 0 && cB > 0 && totalFilms > 0) ? (cAB * totalFilms) / (cA * cB) : 0;
      const pmi = (lift > 0) ? Math.log2(lift) : 0;
      matrix.push({ i, j, count: cAB, aCount: cA, bCount: cB, jaccard, lift, pmi });
    }
  }
  Logger.info('Agrégation co‑occurrence genres', { size, topN: size, excluded: Array.from(exclude) });
  return { labels, matrix, counts, totalFilms };
}

function aggregateLang(dataset) {
  const buckets = { both: 0, frOnly: 0, enOnly: 0, none: 0 };
  for (const r of dataset) {
    const fr = hasValue(r.AUDIOFRANCAIS);
    const en = hasValue(r.AUDIOANGLAIS);
    if (fr && en) buckets.both++;
    else if (fr) buckets.frOnly++;
    else if (en) buckets.enOnly++;
    else buckets.none++;
  }
  return buckets;
}

function topSeriesByEpisodes(series, n = 10) {
  const arr = [];
  for (const [base, h] of series.headers.entries()) {
    arr.push({ title: base, count: h.NBEPISODES || 0 });
  }
  arr.sort((a, b) => b.count - a.count);
  return arr.slice(0, n);
}

// Filtering helper
export function filterDataset(dataset, filters) {
  const { yearMin, yearMax, text, requireFr, requireEn } = filters;
  const t = normStr(text).toUpperCase();
  return dataset.filter((r) => {
    if (yearMin && r.ANNEE && r.ANNEE < yearMin) return false;
    if (yearMax && r.ANNEE && r.ANNEE > yearMax) return false;
    if (t) {
      const cand = `${r.TITREFRANCAIS} ${r.TITREANGLAIS}`.toUpperCase();
      if (!cand.includes(t)) return false;
    }
    if (requireFr && !hasValue(r.AUDIOFRANCAIS)) return false;
    if (requireEn && !hasValue(r.AUDIOANGLAIS)) return false;
    return true;
  });
}
