import { Logger } from './logger.js';

// Bridge: install once a document-level click handler to switch tooltip mode
let __coocTipBridgeInstalled = false;
export function ensureTooltipModeBridgeInstalled() {
  if (__coocTipBridgeInstalled) return;
  try {
    document.addEventListener('click', (e) => {
      const a = e.target && (e.target.closest ? e.target.closest('[data-cooc-tipmode]') : null);
      if (!a) return;
      const mode = a.getAttribute('data-cooc-tipmode');
      if (!mode) return;
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('cooc-tooltip-mode', { detail: { mode } }));
    }, true);
    __coocTipBridgeInstalled = true;
    Logger.debug('Tooltip mode bridge installé');
  } catch (err) {
    Logger.warn('Impossible d’installer le bridge tooltip mode', { err: String(err) });
  }
}

export function renderByYear(el, data) {
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  const years = data.map(d => d.year);
  const counts = data.map(d => d.count);
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: years, axisLabel: { color: '#cbd5e1' } },
    yAxis: { type: 'value', axisLabel: { color: '#cbd5e1' } },
    grid: { left: 40, right: 10, top: 20, bottom: 40 },
    series: [{
      name: 'Comptes',
      type: 'bar',
      data: counts,
      itemStyle: { color: '#6366f1' },
    }],
  });
  Logger.info('Chart byYear rendu', { n: data.length });
  return chart;
}

export function renderDiscs(el, data) {
  const chart = echarts.init(el);
  const discs = data.map(d => d.disc);
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { 
      data: ['FR Films', 'FR Séries', 'EN Films', 'EN Séries'],
      textStyle: { color: '#cbd5e1' }
    },
    xAxis: { type: 'category', data: discs, axisLabel: { color: '#cbd5e1' } },
    yAxis: { type: 'value', axisLabel: { color: '#cbd5e1' } },
    grid: { left: 40, right: 10, top: 30, bottom: 80 },
    series: [
      { name: 'FR Films', type: 'bar', stack: 'FR', data: data.map(d => d.frFilms), itemStyle: { color: '#059669' } },
      { name: 'FR Séries', type: 'bar', stack: 'FR', data: data.map(d => d.frSeries), itemStyle: { color: '#34d399' } },
      { name: 'EN Films', type: 'bar', stack: 'EN', data: data.map(d => d.enFilms), itemStyle: { color: '#0369a1' } },
      { name: 'EN Séries', type: 'bar', stack: 'EN', data: data.map(d => d.enSeries), itemStyle: { color: '#60a5fa' } },
    ],
  });
  Logger.info('Chart discs rendu', { n: data.length });
  return chart;
}

export function renderLang(el, buckets) {
  const chart = echarts.init(el);
  const toSeries = [
    { name: 'FR+EN', value: buckets.both },
    { name: 'FR seul', value: buckets.frOnly },
    { name: 'EN seul', value: buckets.enOnly },
    { name: 'Aucun', value: buckets.none },
  ];
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#cbd5e1' } },
    series: [
      {
        name: 'Langues',
        type: 'pie',
        radius: ['35%', '65%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#0f172a', borderWidth: 1 },
        label: { color: '#e2e8f0' },
        data: toSeries,
      },
    ],
  });
  Logger.info('Chart lang rendu', buckets);
  return chart;
}

export function renderTopSeries(el, data) {
  const chart = echarts.init(el);
  const titles = data.map(d => d.title);
  const counts = data.map(d => d.count);
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', axisLabel: { color: '#cbd5e1' } },
    yAxis: { type: 'category', data: titles, axisLabel: { color: '#cbd5e1' } },
    grid: { left: 140, right: 10, top: 20, bottom: 20 },
    series: [{
      name: 'Épisodes',
      type: 'bar',
      data: counts,
      itemStyle: { color: '#f59e0b' },
    }],
  });
  Logger.info('Chart topSeries rendu', { n: data.length });
  return chart;
}

export function renderGenres(el, data, { topN = 20 } = {}) {
  const chart = echarts.init(el);
  const rows = (data || []).slice(0, topN);
  const labels = rows.map(d => d.label || d.code);
  const films = rows.map(d => d.films);
  const series = rows.map(d => d.series);
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        // params is array (stacked bars)
        if (!params || !params.length) return '';
        const idx = params[0].dataIndex;
        const row = rows[idx];
        const total = row.total;
        const desc = row.description ? `<div style="color:#94a3b8;margin-top:4px">${row.description}</div>` : '';
        const lines = params.map(p => `${p.marker} ${p.seriesName}: <b>${p.value}</b>`).join('<br/>');
        return `<div><b>${row.label}</b> — Total: <b>${total}</b><br/>${lines}${desc}</div>`;
      }
    },
    legend: { data: ['Films', 'Séries'], textStyle: { color: '#cbd5e1' } },
    xAxis: { type: 'value', axisLabel: { color: '#cbd5e1' } },
    yAxis: { type: 'category', data: labels, axisLabel: { color: '#cbd5e1' } },
    grid: { left: 180, right: 10, top: 30, bottom: 20 },
    series: [
      { name: 'Films', type: 'bar', stack: 'TOTAL', data: films, itemStyle: { color: '#22c55e' } },
      { name: 'Séries', type: 'bar', stack: 'TOTAL', data: series, itemStyle: { color: '#10b981' } },
    ],
  });
  Logger.info('Chart genres rendu', { n: rows.length });
  return chart;
}

export function renderGenreCountHistogram(el, data) {
  const chart = echarts.init(el);
  const buckets = data.map(d => d.bucket);
  const films = data.map(d => d.films);
  const series = data.map(d => d.series);
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { data: ['Films', 'Séries'], textStyle: { color: '#cbd5e1' } },
    xAxis: { type: 'category', data: buckets, axisLabel: { color: '#cbd5e1' } },
    yAxis: { type: 'value', axisLabel: { color: '#cbd5e1' } },
    grid: { left: 40, right: 10, top: 30, bottom: 40 },
    series: [
      { name: 'Films', type: 'bar', stack: 'TOTAL', data: films, itemStyle: { color: '#22c55e' } },
      { name: 'Séries', type: 'bar', stack: 'TOTAL', data: series, itemStyle: { color: '#10b981' } },
    ],
  });
  Logger.info('Chart genre-counts rendu', { n: data.length });
  return chart;
}

export function renderGenreCoocHeatmap(el, payload, options = {}) {
  // Ensure container accepts pointer events
  try { el.style.pointerEvents = 'auto'; el.style.position = el.style.position || 'relative'; } catch {}
  const chart = echarts.init(el, null, { renderer: 'canvas', useDirtyRect: true });
  const labels = (payload?.labels || []).map(l => l.label || l.code);
  const metric = options.metric || 'jaccard'; // 'count' | 'jaccard' | 'lift' | 'pmi'
  const hideDiagonal = !!options.hideDiagonal;
  const excluded = (options.exclude || []);
  const tooltipMode = (options.tooltipMode === 'metrics') ? 'metrics' : 'counts';
  ensureTooltipModeBridgeInstalled();
  // Build data array with chosen metric
  const raw = (payload?.matrix || []);
  const data = raw
    .filter(cell => !hideDiagonal || cell.i !== cell.j)
    .map(cell => [cell.j, cell.i, metric === 'count' ? cell.count : (cell[metric] ?? 0), cell]);
  // Build a quick lookup i,j -> dataIndex for manual tooltip fallback
  const ijToIndex = new Map();
  for (let k = 0; k < data.length; k++) {
    const d = data[k];
    ijToIndex.set(`${d[1]},${d[0]}`, k);
  }
  const values = data.map(d => d[2]);
  // Compute stats excluding diagonal for color scaling (even if diagonal is shown)
  const offDiagValues = raw
    .filter(cell => cell.i !== cell.j)
    .map(cell => (metric === 'count' ? cell.count : (cell[metric] ?? 0)))
    .filter(v => Number.isFinite(v));
  function quantile(arr, q){
    if (!arr.length) return 0;
    const a = [...arr].sort((x,y)=>x-y);
    const pos = (a.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (a[base+1] !== undefined) return a[base] + rest * (a[base+1] - a[base]);
    return a[base];
  }
  let min = values.length ? Math.min(...values) : 0;
  let max = values.length ? Math.max(...values) : 0;
  let stats = null;
  if (offDiagValues.length) {
    const odMin = Math.min(...offDiagValues);
    const odMax = Math.max(...offDiagValues);
    const p10 = quantile(offDiagValues, 0.10);
    const p25 = quantile(offDiagValues, 0.25);
    const p50 = quantile(offDiagValues, 0.50);
    const p75 = quantile(offDiagValues, 0.75);
    const p90 = quantile(offDiagValues, 0.90);
    stats = { odMin, odMax, p10, p25, p50, p75, p90 };
    // Prefer off-diagonal range for scaling to avoid self-count domination
    min = odMin; max = odMax;
  }

  if (!labels.length || !data.length) {
    // Log explicit data presence even if nothing is renderable
    Logger.info('Chart genre-cooc: données présentes mais aucune cellule rendue', {
      payloadLabels: (payload?.labels?.length || 0),
      payloadMatrix: (payload?.matrix?.length || 0),
      visibleCells: data.length,
      metric,
      hideDiagonal,
      exclude: excluded
    });
    chart.clear();
    chart.setOption({
      backgroundColor: 'transparent',
      xAxis: { show: false },
      yAxis: { show: false },
      graphic: {
        type: 'text', left: 'center', top: 'middle', silent: true, z: 0, zlevel: 0,
        style: {
          text: 'Aucune co‑occurrence à afficher.\nConseils :\n- Décochez « Masquer diagonale »\n- Réinitialisez ou élargissez les filtres\n- Ré‑incluez DRAME si exclu',
          fill: '#94a3b8', fontSize: 13, textAlign: 'center'
        }
      }
    });
    Logger.warn('Chart genre-cooc vide', { labels: labels.length, data: data.length, metric, hideDiagonal });
    return chart;
  }

  if (min === max) {
    // éviter une échelle plate
    max = min + (metric === 'count' ? 1 : 1e-6);
  }

  // Decide visual scaling mode: continuous vs quantile-based piecewise
  let visualMap;
  const dense = (offDiagValues.length > 0) ? (offDiagValues.filter(v=>v>0).length / offDiagValues.length) >= 0.9 : false;
  const narrow = (min > 0 && max/min < 1.5) || (max - min) < (metric === 'count' ? 5 : 0.02);
  if (dense || narrow) {
    // Build 7-quantile thresholds for better contrast
    const qs = [0, 0.15, 0.30, 0.5, 0.7, 0.85, 1].map(q => quantile(offDiagValues, q));
    // Deduplicate and ensure ascending
    const ths = Array.from(new Set(qs)).sort((a,b)=>a-b);
    const palette = ['#440154', '#3b528b', '#21908d', '#5dc963', '#a6e65a', '#d5f26c', '#fde725'];
    const pieces = [];
    for (let i = 0; i < ths.length; i++) {
      const minv = ths[i];
      const maxv = (i < ths.length - 1) ? ths[i+1] : undefined;
      pieces.push({ min: minv, max: maxv, label: (minv===maxv? `${fmt(minv)}` : `${fmt(minv)}–${maxv!==undefined?fmt(maxv):'+'}`) });
    }
    visualMap = {
      type: 'piecewise',
      dimension: 2,
      pieces,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      textStyle: { color: '#cbd5e1' },
      inRange: { color: palette },
      outOfRange: { color: ['#1f2937'], colorAlpha: 0.15 }
    };
    Logger.info('Co‑occurrence — visualMap piecewise (quantiles) sélectionné', { metric, dense, narrow, thresholds: ths });
  } else {
    visualMap = {
      dimension: 2,
      min: Math.max(0, min),
      max: Math.max(min + (metric === 'count' ? 1 : 1e-6), max),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      text: [metric.toUpperCase(), ''],
      textStyle: { color: '#cbd5e1' },
      inRange: {
        color: ['#440154', '#3b528b', '#21908d', '#5dc963', '#fde725'] // Viridis-like
      },
      outOfRange: { color: ['#1f2937'], colorAlpha: 0.15 }
    };
    Logger.info('Co‑occurrence — visualMap continu sélectionné', { metric, min, max });
  }

  // Important: clear any previous overlay graphics that could block pointer events
  chart.clear();

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove|click',
      position: 'top',
      appendToBody: true,
      confine: true,
      enterable: true,
      formatter: (p) => {
        try {
          const totalFilms = payload?.totalFilms || 0;
          const pct = (x) => totalFilms ? `${(Math.round((x/totalFilms)*1000)/10).toFixed(1)}%` : '—';
          const i = p.data[1], j = p.data[0];
          const a = labels[i];
          const b = labels[j];
          const cell = p.data[3] || {};
          const union = (cell.aCount||0) + (cell.bCount||0) - (cell.count||0);
          let body = '';
          if (tooltipMode === 'metrics') {
            body = [
              `<b>${a}</b> ∩ <b>${b}</b>`,
              `Jaccard: <b>${fmt(cell.jaccard)}</b>`,
              `Lift: <b>${fmt(cell.lift)}</b> · PMI: <b>${fmt(cell.pmi)}</b>`,
              `<span style="color:#94a3b8">A: ${cell.aCount} · B: ${cell.bCount} · A∩B: ${cell.count} · A∪B: ${union}</span>`
            ].join('<br/>');
          } else {
            body = [
              `<b>${a}</b> ∩ <b>${b}</b>`,
              `A (|A|): <b>${cell.aCount}</b> films · ${pct(cell.aCount)} du total`,
              `B (|B|): <b>${cell.bCount}</b> films · ${pct(cell.bCount)} du total`,
              `Intersection (|A∩B|): <b>${cell.count}</b> films`,
              `Union (|A∪B|): <b>${union}</b> films`,
              `<span style="color:#94a3b8">Jaccard ${fmt(cell.jaccard)} · Lift ${fmt(cell.lift)} · PMI ${fmt(cell.pmi)}</span>`
            ].join('<br/>');
          }
          const sw = `<div style="margin-top:6px;display:flex;gap:8px;align-items:center">
            <span style="color:#94a3b8">Afficher:</span>
            <a href="#" data-cooc-tipmode="counts" style="padding:2px 6px;border-radius:4px;${tooltipMode==='counts'?'background:#334155;color:#e2e8f0;':'color:#93c5fd;'}">Nombres</a>
            <a href="#" data-cooc-tipmode="metrics" style="padding:2px 6px;border-radius:4px;${tooltipMode==='metrics'?'background:#334155;color:#e2e8f0;':'color:#93c5fd;'}">Métriques</a>
          </div>`;
          return `<div>${body}${sw}</div>`;
        } catch (e) {
          Logger.warn('Tooltip heatmap — fallback minimal', { err: String(e) });
          return `i=${p?.data?.[1]} j=${p?.data?.[0]} val=${p?.data?.[2]}`;
        }
      }
    },
    xAxis: { 
      type: 'category', 
      data: labels, 
      axisLabel: { color: '#cbd5e1', rotate: 45 },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: 'rgba(148,163,184,0.08)' } }
    },
    yAxis: { 
      type: 'category', 
      data: labels, 
      axisLabel: { color: '#cbd5e1' },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: 'rgba(148,163,184,0.08)' } }
    },
    grid: { left: 120, right: 20, top: 10, bottom: 100 },
    visualMap,
    series: [{
      name: 'Co‑occurrence',
      type: 'heatmap',
      data,
      encode: { x: 0, y: 1, value: 2 },
      label: { show: false },
      itemStyle: { opacity: 0.92, borderColor: 'rgba(15,23,42,0.35)', borderWidth: 0.3 },
      emphasis: { itemStyle: { shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)', borderColor: 'rgba(15,23,42,0.6)', borderWidth: 0.6 } },
      progressive: 0
    }]
  });
  Logger.info('Chart genre-cooc rendu', { n: labels.length, metric, hideDiagonal, exclude: excluded, scaling: (visualMap.type==='piecewise'?'piecewise':'continuous'), stats });
  // One-time diagnostics to confirm pointer events reach the canvas and series
  try {
    let zrLogged = false, overLogged = false;
    const zr = chart.getZr();
    if (zr) {
      const zrHandler = (e) => { if (!zrLogged) { zrLogged = true; Logger.info('Cooc heatmap — pointer detected on canvas', { x: e.offsetX, y: e.offsetY }); } };
      zr.on('mousemove', zrHandler);
      setTimeout(() => { try { zr.off('mousemove', zrHandler); } catch {} }, 5000);
    }
    const overHandler = (p) => { if (!overLogged) { overLogged = true; Logger.info('Cooc heatmap — hover event on series', { componentType: p.componentType, seriesType: p.seriesType, name: p.name }); } };
    chart.on('mouseover', overHandler);
    setTimeout(() => { try { chart.off('mouseover', overHandler); } catch {} }, 5000);
  } catch {}

  // Manual hover driver: map mouse position to (i,j) and force showTip, to bypass any hit-test quirk
  try {
    const zr = chart.getZr();
    let told = 0; let loggedActive = false; let lastShown = -1;
    if (zr) {
      const mm = (e) => {
        const now = Date.now(); if (now - told < 16) return; told = now; // ~60fps throttle
        try {
          const xy = [e.offsetX, e.offsetY];
          const coord = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, xy);
          if (!coord || coord.length < 2) { if (lastShown !== -1) { chart.dispatchAction({ type:'hideTip' }); lastShown = -1; } return; }
          // coord returns category values; convert to indices
          const j = typeof coord[0] === 'number' ? coord[0] : labels.indexOf(coord[0]);
          const i = typeof coord[1] === 'number' ? coord[1] : labels.indexOf(coord[1]);
          if (i < 0 || j < 0) { if (lastShown !== -1) { chart.dispatchAction({ type:'hideTip' }); lastShown = -1; } return; }
          const key = `${i},${j}`;
          const di = ijToIndex.get(key);
          if (di === undefined) { if (lastShown !== -1) { chart.dispatchAction({ type:'hideTip' }); lastShown = -1; } return; }
          if (!loggedActive) { loggedActive = true; Logger.info('Cooc heatmap — manual hover driver actif'); }
          if (di !== lastShown) {
            lastShown = di;
            chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: di });
          }
        } catch { /* ignore */ }
      };
      const out = () => { if (lastShown !== -1) { chart.dispatchAction({ type:'hideTip' }); lastShown = -1; } };
      zr.on('mousemove', mm);
      zr.on('globalout', out);
      // Remove after some time if not needed? keep active for session; it is light.
    }
  } catch {}

  return chart;
}

function fmt(v){
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  if (v >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

export function renderGenreCoocScatter(el, payload, options = {}) {
  const chart = echarts.init(el);
  const labels = (payload?.labels || []).map(l => l.label || l.code);
  const metric = options.metric || 'jaccard';
  const hideDiagonal = !!options.hideDiagonal;
  const excluded = (options.exclude || []);
  const tooltipMode = (options.tooltipMode === 'metrics') ? 'metrics' : 'counts';
  ensureTooltipModeBridgeInstalled();
  const minSymbol = options.minSymbol || 4;
  const maxSymbol = options.maxSymbol || 28;
  const seriesData = [];
  let minVal = Infinity, maxVal = -Infinity, maxCount = 0;
  for (const cell of (payload?.matrix || [])) {
    if (hideDiagonal && cell.i === cell.j) continue;
    const value = metric === 'count' ? cell.count : (cell[metric] ?? 0);
    minVal = Math.min(minVal, value);
    maxVal = Math.max(maxVal, value);
    maxCount = Math.max(maxCount, cell.count || 0);
    seriesData.push({
      name: `${labels[cell.i]} ∩ ${labels[cell.j]}`,
      value: [cell.j, cell.i, value],
      i: cell.i,
      j: cell.j,
      count: cell.count,
      aCount: cell.aCount,
      bCount: cell.bCount,
      jaccard: cell.jaccard,
      lift: cell.lift,
      pmi: cell.pmi,
      symbolSize: 0 // will be set by encode/visual callback
    });
  }
  // If nothing to show, log explicit info and render an empty state message
  if (!labels.length || !seriesData.length) {
    Logger.info('Chart genre-cooc (points): données présentes mais aucune cellule rendue', {
      payloadLabels: (payload?.labels?.length || 0),
      payloadMatrix: (payload?.matrix?.length || 0),
      visiblePoints: seriesData.length,
      metric,
      hideDiagonal,
      exclude: excluded
    });
    chart.clear();
    chart.setOption({
      backgroundColor: 'transparent',
      xAxis: { show: false },
      yAxis: { show: false },
      graphic: {
        type: 'text', left: 'center', top: 'middle', silent: true, z: 0, zlevel: 0,
        style: {
          text: 'Aucun point à afficher.\nConseils :\n- Décochez « Masquer diagonale »\n- Réinitialisez ou élargissez les filtres\n- Ré‑incluez DRAME si exclu',
          fill: '#94a3b8', fontSize: 13, textAlign: 'center'
        }
      }
    });
    Logger.warn('Chart genre-cooc scatter vide', { labels: labels.length, points: seriesData.length, metric, hideDiagonal });
    return chart;
  }
  // symbol size scaling sqrt(count)
  const sizeScale = (c) => {
    if (!c) return minSymbol;
    const s = Math.sqrt(c / (maxCount || 1));
    return Math.max(minSymbol, Math.min(maxSymbol, minSymbol + s * (maxSymbol - minSymbol)));
  };

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      confine: true,
      enterable: true,
      formatter: (p) => {
        const totalFilms = payload?.totalFilms || 0;
        const pct = (x) => totalFilms ? `${(Math.round((x/totalFilms)*1000)/10).toFixed(1)}%` : '—';
        const d = p.data;
        const a = labels[d.i];
        const b = labels[d.j];
        const union = (d.aCount||0) + (d.bCount||0) - (d.count||0);
        let body = '';
        if (tooltipMode === 'metrics') {
          body = [
            `<b>${a}</b> ∩ <b>${b}</b>`,
            `Jaccard: <b>${fmt(d.jaccard)}</b>`,
            `Lift: <b>${fmt(d.lift)}</b> · PMI: <b>${fmt(d.pmi)}</b>`,
            `<span style="color:#94a3b8">A: ${d.aCount} · B: ${d.bCount} · A∩B: ${d.count} · A∪B: ${union}</span>`
          ].join('<br/>');
        } else {
          body = [
            `<b>${a}</b> ∩ <b>${b}</b>`,
            `A (|A|): <b>${d.aCount}</b> films · ${pct(d.aCount)} du total`,
            `B (|B|): <b>${d.bCount}</b> films · ${pct(d.bCount)} du total`,
            `Intersection (|A∩B|): <b>${d.count}</b> films`,
            `Union (|A∪B|): <b>${union}</b> films`,
            `<span style=\"color:#94a3b8\">Jaccard ${fmt(d.jaccard)} · Lift ${fmt(d.lift)} · PMI ${fmt(d.pmi)}</span>`
          ].join('<br/>');
        }
        const sw = `<div style=\"margin-top:6px;display:flex;gap:8px;align-items:center\">
            <span style=\"color:#94a3b8\">Afficher:</span>
            <a href=\"#\" data-cooc-tipmode=\"counts\" style=\"padding:2px 6px;border-radius:4px;${tooltipMode==='counts'?'background:#334155;color:#e2e8f0;':'color:#93c5fd;'}\">Nombres</a>
            <a href=\"#\" data-cooc-tipmode=\"metrics\" style=\"padding:2px 6px;border-radius:4px;${tooltipMode==='metrics'?'background:#334155;color:#e2e8f0;':'color:#93c5fd;'}\">Métriques</a>
          </div>`;
        return `<div>${body}${sw}</div>`;
      }
    },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#cbd5e1', rotate: 45 } },
    yAxis: { type: 'category', data: labels, axisLabel: { color: '#cbd5e1' } },
    grid: { left: 120, right: 20, top: 10, bottom: 100 },
    visualMap: {
      min: (isFinite(minVal) ? minVal : 0),
      max: (isFinite(maxVal) ? maxVal : 1),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      text: [metric.toUpperCase(), ''],
      textStyle: { color: '#cbd5e1' },
      inRange: { color: ['#440154', '#3b528b', '#21908d', '#5dc963', '#fde725'] }
    },
    series: [{
      type: 'scatter',
      name: 'Co‑occurrence (points)',
      data: seriesData,
      symbolSize: (val, params) => sizeScale(params.data.count),
      itemStyle: {
        borderColor: 'rgba(15,23,42,0.6)',
        borderWidth: 0.6,
        opacity: 0.92
      }
    }]
  });
  Logger.info('Chart genre-cooc scatter rendu', { n: labels.length, metric, hideDiagonal, exclude: excluded });
  return chart;
}
