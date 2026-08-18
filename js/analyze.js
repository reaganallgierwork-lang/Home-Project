/* ============================================================================
   THE DATA TAB — trends and the raw table.
   ----------------------------------------------------------------------------
   This screen is deliberately generic. It asks metrics.js what's available and
   renders whatever comes back, so it never needs editing when you add habits,
   or later when a workout tracker registers its own metrics.

   Two views:
     Trends — pick anything, pick a window, see the chart and the numbers.
     Table  — every day, every value, sortable, exportable as CSV.
   ========================================================================== */

import * as store from './store.js';
import {
  listMetrics, getMetric, buildSeries, summarize, trendVsPrevious,
  formatValue, earliestDay, resolveRange, autoGranularity,
  RANGES, GRANULARITIES, AGG_LABELS,
} from './metrics.js';
import { habitTableColumns } from './metrics-habits.js';
import { workoutTableColumns } from './metrics-workouts.js';
import { bodyTableColumns } from './metrics-weight.js';
import { renderChart, chooseAxis } from './chart.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { el, esc } from './dom.js';


/* View state lives in the save file so the tab reopens where you left it. */
function ui(state) {
  if (!state.ui) state.ui = {};
  if (!state.ui.analyze) {
    state.ui.analyze = {
      view: 'trends', metricId: 'day:score', metricId2: null, range: '30d',
      granularity: 'auto', agg: null, tableSort: 'day', tableDir: -1, tableRange: '30d',
    };
  }
  /* Saves from before comparison existed just won't have this field. */
  if (state.ui.analyze.metricId2 === undefined) state.ui.analyze.metricId2 = null;
  return state.ui.analyze;
}

/* Exercise/workout metrics get their own picker (see the Data tab README
   section on why) — every group is a distinct exercise or metcon, and there
   can be dozens, so mixing them into the main picker would bury everything
   else under a wall of lift names. Splitting on sourceId keeps this file
   from needing to know anything about what "workouts" means. */
const isExercise = (m) => m.sourceId === 'workouts';

let redraw = () => {};

export function renderAnalyze(state, onRefresh) {
  redraw = () => renderAnalyze(store.get(), onRefresh);
  const u = ui(state);

  const host = el('screen-analyze');
  host.innerHTML = `
    <div class="topbar">
      <h1>Data<div class="sub">Everything you've logged, and how it's moving</div></h1>
    </div>
    <div class="seg" id="viewSeg">
      <button data-view="trends" class="${u.view === 'trends' ? 'on' : ''}">Trends</button>
      <button data-view="table" class="${u.view === 'table' ? 'on' : ''}">Table</button>
    </div>
    <div id="analyzeBody"></div>`;

  host.querySelectorAll('#viewSeg button').forEach((b) => {
    b.onclick = () => { store.update((s) => { ui(s).view = b.dataset.view; }); redraw(); };
  });

  if (u.view === 'trends') renderTrends(state, u);
  else renderTable(state, u);
}

/* ============================================================================
   TRENDS
   ========================================================================== */

function renderTrends(state, u) {
  const metrics = listMetrics(state);
  if (!metrics.length) {
    el('analyzeBody').innerHTML = `<div class="empty"><div class="big">${icon('chartLine', 34)}</div>Nothing to chart yet. Log a few days first.</div>`;
    return;
  }
  const pickable = metrics.filter((m) => !isExercise(m));
  const exercises = metrics.filter(isExercise);

  let metric = getMetric(state, u.metricId) || metrics[0];
  const metric2 = u.metricId2 ? getMetric(state, u.metricId2) : null;
  const earliest = earliestDay(state);
  const range = resolveRange(u.range, earliest);
  const span = store.rangeDays(range.from, range.to).length;
  const granularity = u.granularity === 'auto' ? autoGranularity(span) : u.granularity;
  const agg = metric.aggOptions.includes(u.agg) ? u.agg : metric.defaultAgg;

  const series = buildSeries(state, metric, { from: range.from, to: range.to, granularity, agg });
  const stats = summarize(state, metric, series);
  const trend = trendVsPrevious(state, metric, { from: range.from, to: range.to, granularity, agg });

  const fmt = (v) => formatValue(metric, v);

  /* --- an optional second series, overlaid on the same chart for
     comparison — see chart.js for how the axis gets decided. --- */
  let series2 = null;
  let fmt2 = null;
  if (metric2) {
    series2 = buildSeries(state, metric2, { from: range.from, to: range.to, granularity, agg: metric2.defaultAgg });
    fmt2 = (v) => formatValue(metric2, v);
  }

  /* --- the filter row: one row, above everything it scopes --- */
  const filters = `
    <div class="filter-row">
      <div class="picker-row">
        <button class="picker" id="metricPicker">
          <span class="pk-ic">${icon(metric.groupIcon || metric.sourceIcon || 'chartLine', 20)}</span>
          <span class="pk-tx"><b>${esc(metric.group)}</b><span>${esc(metric.label)}</span></span>
          <span class="pk-ch">▾</span>
        </button>
        <button class="icon-btn" id="exercisePicker" aria-label="Browse exercises" title="Browse exercises">${icon('dumbbell', 19)}</button>
      </div>
      <div class="seg small" id="rangeSeg">
        ${RANGES.map((r) => `<button data-range="${r.key}" class="${u.range === r.key ? 'on' : ''}">${r.key === 'all' ? 'All' : r.key.toUpperCase()}</button>`).join('')}
      </div>
      <button class="compare-chip ${metric2 ? 'on' : ''}" id="comparePicker">
        ${metric2 ? `
          <i class="cc-dot"></i><span class="cc-tx">${esc(metric2.group)} — ${esc(metric2.label)}</span>
          <span class="cc-x" id="compareRemove">${icon('close', 13)}</span>`
    : `${icon('layers', 15)} Compare with another metric`}
      </button>
    </div>`;

  /* --- optional toggles: how days roll up, and bucket size --- */
  const aggSeg = metric.aggOptions.length > 1 ? `
    <div class="seg small tight" id="aggSeg">
      ${metric.aggOptions.map((a) => `<button data-agg="${a}" class="${agg === a ? 'on' : ''}">${AGG_LABELS[a]}</button>`).join('')}
    </div>` : '';

  const granSeg = `
    <div class="seg small tight" id="granSeg">
      ${GRANULARITIES.map((g) => `<button data-gran="${g.key}" class="${granularity === g.key ? 'on' : ''}">${g.label}</button>`).join('')}
    </div>`;

  /* --- headline + stat tiles --- */
  const trendChip = trend ? `
    <div class="delta ${trend.direction}">
      ${trend.pct > 0 ? '▲' : trend.pct < 0 ? '▼' : '■'} ${Math.abs(trend.pct).toFixed(0)}%
      <span>vs previous ${span} days</span>
    </div>` : '<div class="delta flat"><span>Not enough history to compare yet</span></div>';

  const tiles = [
    { label: 'Average', value: fmt(stats.average) },
    { label: 'Best', value: fmt(stats.max) },
    { label: 'Days logged', value: `${stats.daysLogged}/${stats.daysPossible}` },
  ];
  if (metric.target !== null && stats.hitTarget !== null) {
    tiles.push({ label: 'Hit the goal', value: `${stats.hitTarget} ${stats.hitTarget === 1 ? 'day' : 'days'}` });
  }

  el('analyzeBody').innerHTML = `
    ${filters}
    <div class="card">
      <div class="hero-wrap">
        <div class="hero">${esc(fmt(stats.headline))}</div>
        <div class="hero-sub">${esc(AGG_LABELS[agg])} · ${esc(metric.group)} — ${esc(metric.label)}</div>
        ${trendChip}
      </div>
      <div id="chartHost" class="chart-host"></div>
      ${granSeg}
      ${aggSeg}
    </div>
    <div class="card tight">
      <div class="tiles">
        ${tiles.map((t) => `<div class="tile"><b>${esc(t.value)}</b><span>${esc(t.label)}</span></div>`).join('')}
      </div>
      ${stats.coverage < 0.999 && metric.blankPolicy === 'zero' ? `
        <div class="hint" style="margin-top:11px">
          Days you didn't log count as zero for this one, because not logging it means it didn't happen.
        </div>` : ''}
      ${metric.blankPolicy === 'skip' ? `
        <div class="hint" style="margin-top:11px">
          Days you didn't log are left out of these numbers rather than counted as zero — an unrated day isn't a bad day.
        </div>` : ''}
    </div>
    ${bucketBreakdown(series, metric, fmt)}`;

  /* --- draw the chart, and redraw it if the phone rotates --- */
  const host = el('chartHost');
  const primarySpec = {
    id: metric.id,
    label: `${metric.group} — ${metric.label}`,
    unit: metric.unit,
    color: 'var(--series-1)',
    buckets: series.buckets,
    form: granularity === 'day' && metric.form === 'line' ? 'line' : (metric.form === 'line' && series.buckets.length > 12 ? 'line' : 'bar'),
    target: metric.target,
    targetLabel: `goal ${fmt(metric.target)}`,
    format: (v) => fmt(v),
  };
  const chartSeries = [primarySpec];
  if (series2) {
    const secondarySpec = {
      id: metric2.id,
      label: `${metric2.group} — ${metric2.label}`,
      unit: metric2.unit,
      color: 'var(--series-2)',
      buckets: series2.buckets,
      form: metric2.form,
      target: null,
      format: (v) => fmt2(v),
      axis: chooseAxis(primarySpec, { unit: metric2.unit, buckets: series2.buckets }),
    };
    chartSeries.push(secondarySpec);
  }
  const draw = () => renderChart(host, {
    series: chartSeries,
    ariaLabel: `${metric.group} ${metric.label}${metric2 ? ` compared with ${metric2.group} ${metric2.label}` : ''} over the last ${span} days`,
    onEmpty: 'Nothing logged in this window yet.',
  });
  draw();

  /* Redraw only when the width genuinely changes — a rotation or a window
     resize. iOS fires `resize` every time the address bar collapses while you
     scroll, and redrawing on that would keep yanking the chart back to its
     default readout mid-read. */
  let lastW = host.clientWidth;
  let t;
  const onResize = () => {
    if (host.clientWidth === lastW) return;
    lastW = host.clientWidth;
    clearTimeout(t);
    t = setTimeout(draw, 150);
  };
  if (window.__chartResize) window.removeEventListener('resize', window.__chartResize);
  window.__chartResize = onResize;
  window.addEventListener('resize', onResize);

  /* --- wiring --- */
  el('metricPicker').onclick = () => openPicker(state, pickable, metric.id, {
    title: 'What do you want to look at?',
    lede: 'Everything you track shows up here automatically.',
    onPick: (id) => { store.update((s) => { ui(s).metricId = id; ui(s).agg = null; }); redraw(); },
  });
  el('exercisePicker').onclick = () => {
    if (!exercises.length) {
      openPicker(state, [], null, {
        title: 'Which exercise?',
        lede: 'Nothing logged yet — train something on the Train tab and it shows up here.',
      });
      return;
    }
    openPicker(state, exercises, isExercise(metric) ? metric.id : null, {
      title: 'Which exercise?',
      lede: 'Only exercises and metcons you’ve actually logged show up here.',
      onPick: (id) => { store.update((s) => { ui(s).metricId = id; ui(s).agg = null; }); redraw(); },
    });
  };
  el('comparePicker').onclick = (ev) => {
    if (ev.target.closest('#compareRemove')) {
      store.update((s) => { ui(s).metricId2 = null; });
      redraw();
      return;
    }
    openPicker(state, metrics.filter((m) => m.id !== metric.id), metric2?.id, {
      title: 'Compare with what?',
      lede: 'Overlaid on the same chart, in its own colour.',
      allowNone: !!metric2,
      noneLabel: 'Remove the comparison',
      onPick: (id) => { store.update((s) => { ui(s).metricId2 = id; }); redraw(); },
    });
  };
  el('rangeSeg').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      store.update((s) => { ui(s).range = b.dataset.range; ui(s).granularity = 'auto'; });
      redraw();
    };
  });
  el('granSeg').querySelectorAll('button').forEach((b) => {
    b.onclick = () => { store.update((s) => { ui(s).granularity = b.dataset.gran; }); redraw(); };
  });
  if (el('aggSeg')) {
    el('aggSeg').querySelectorAll('button').forEach((b) => {
      b.onclick = () => { store.update((s) => { ui(s).agg = b.dataset.agg; }); redraw(); };
    });
  }
}

/** The numbers behind the chart, so nothing is only reachable by hovering. */
function bucketBreakdown(series, metric, fmt) {
  const rows = series.buckets.slice().reverse().filter((b) => b.value !== null).slice(0, 14);
  if (!rows.length) return '';
  return `
    <div class="section-title">Breakdown</div>
    <div class="card tight">
      <table class="mini-table">
        <tbody>
          ${rows.map((b) => `
            <tr>
              <td>${esc(b.label)}</td>
              <td class="num">${esc(fmt(b.value))}</td>
              <td class="dim">${b.total > 1 ? `${b.logged}/${b.total}` : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ---------- the generic picker sheet ----------
   Grouped, searchable, and reused for three different jobs: choosing the
   main chart metric, browsing exercises (a separate door so the main list
   isn't buried under every lift you've ever logged), and choosing a second
   metric to overlay for comparison. Each caller supplies its own list of
   metrics, its own copy, and its own onPick — this file never special-cases
   which job it's doing. */

function openPicker(state, metrics, currentId, opts = {}) {
  const {
    title = 'What do you want to look at?',
    lede = 'Everything you track shows up here automatically.',
    onPick = null,
    allowNone = false,
    noneLabel = 'Clear',
  } = opts;

  const groups = [];
  metrics.forEach((m) => {
    let g = groups.find((x) => x.name === m.group);
    if (!g) { g = { name: m.group, icon: m.groupIcon, items: [] }; groups.push(g); }
    g.items.push(m);
  });

  const close = openSheet(`
    <h3>${esc(title)}</h3>
    <div class="lede">${esc(lede)}</div>
    ${metrics.length ? '<input type="text" id="metricSearch" placeholder="Search…" class="search">' : ''}
    ${allowNone ? `<button class="btn" id="pickNone">${noneLabel}</button>` : ''}
    <div id="metricList">
      ${groups.length ? groups.map((g) => `
        <div class="pick-group" data-name="${esc(g.name.toLowerCase())}">
          <div class="pick-head">${icon(g.icon || 'chartLine', 14)}${esc(g.name)}</div>
          ${g.items.map((m) => `
            <button class="pick-item ${m.id === currentId ? 'on' : ''}" data-id="${esc(m.id)}" data-label="${esc(m.label.toLowerCase())}">
              <span>${esc(m.label)}</span>
              ${m.id === currentId ? icon('check', 16) : ''}
            </button>`).join('')}
        </div>`).join('') : `<div class="hint">Nothing here yet.</div>`}
    </div>
    <button class="btn ghost" id="pickCancel">Close</button>`);

  el('pickCancel').onclick = close;
  if (el('pickNone')) {
    el('pickNone').onclick = () => { close(); if (onPick) onPick(null); };
  }

  document.querySelectorAll('.modal .pick-item').forEach((b) => {
    b.onclick = () => {
      close();
      if (onPick) onPick(b.dataset.id);
    };
  });

  const search = el('metricSearch');
  if (search) {
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll('.modal .pick-group').forEach((g) => {
        const groupHit = g.dataset.name.includes(q);
        let any = false;
        g.querySelectorAll('.pick-item').forEach((it) => {
          const hit = !q || groupHit || it.dataset.label.includes(q);
          it.style.display = hit ? '' : 'none';
          if (hit) any = true;
        });
        g.style.display = any ? '' : 'none';
      });
    };
  }
}

/* ============================================================================
   TABLE — every day, every value, sortable and exportable.
   ========================================================================== */

function renderTable(state, u) {
  /* Columns come from each area rather than being listed here, so a new
     tracker adds its own without this screen changing. */
  const cols = [...habitTableColumns(state), ...workoutTableColumns(state), ...bodyTableColumns(state)];
  const earliest = earliestDay(state);
  const range = resolveRange(u.tableRange, earliest);
  const days = store.rangeDays(range.from, range.to);

  const sortKey = u.tableSort || 'day';
  const dir = u.tableDir || -1;
  const rows = days.slice();
  if (sortKey === 'day') {
    rows.sort((a, b) => (a < b ? -1 : 1) * dir);
  } else {
    const col = cols.find((c) => c.id === sortKey);
    rows.sort((a, b) => {
      const va = col ? col.raw(state, a) : null;
      const vb = col ? col.raw(state, b) : null;
      /* Unlogged days always sink to the bottom, whichever way you sort. */
      if (va === null && vb === null) return a < b ? 1 : -1;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va - vb) * dir;
    });
  }

  const head = `<th class="sortable ${sortKey === 'day' ? 'sorted' : ''}" data-sort="day">Date ${sortKey === 'day' ? (dir < 0 ? '▾' : '▴') : ''}</th>`
    + cols.map((c) => `<th class="sortable ${sortKey === c.id ? 'sorted' : ''}" data-sort="${esc(c.id)}">${esc(c.label)} ${sortKey === c.id ? (dir < 0 ? '▾' : '▴') : ''}</th>`).join('');

  const body = rows.map((d) => {
    const cells = cols.map((c) => {
      const v = c.get(state, d);
      return `<td class="${v === null ? 'dim' : ''}">${v === null ? '·' : esc(v)}</td>`;
    }).join('');
    return `<tr><td class="daycell">${esc(store.dayLabel(d, { month: 'short', day: 'numeric', year: '2-digit' }))}</td>${cells}</tr>`;
  }).join('');

  el('analyzeBody').innerHTML = `
    <div class="filter-row">
      <div class="seg small" id="tRangeSeg" style="width:100%">
        ${RANGES.map((r) => `<button data-range="${r.key}" class="${u.tableRange === r.key ? 'on' : ''}">${r.key === 'all' ? 'All' : r.key.toUpperCase()}</button>`).join('')}
      </div>
    </div>
    <div class="card tight">
      <div class="hint" style="margin-bottom:10px">
        ${rows.length} ${rows.length === 1 ? 'day' : 'days'}. Tap a column heading to sort by it. Scroll sideways for more columns.
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>
    <button class="btn" id="csvBtn">${icon('download', 17)} Export these ${rows.length} days as a spreadsheet</button>
    <div class="hint" style="margin-top:8px;text-align:center">
      Opens in Numbers, Excel or Google Sheets.
    </div>`;

  el('tRangeSeg').querySelectorAll('button').forEach((b) => {
    b.onclick = () => { store.update((s) => { ui(s).tableRange = b.dataset.range; }); redraw(); };
  });
  el('analyzeBody').querySelectorAll('th.sortable').forEach((th) => {
    th.onclick = () => {
      store.update((s) => {
        const uu = ui(s);
        if (uu.tableSort === th.dataset.sort) uu.tableDir = -(uu.tableDir || -1);
        else { uu.tableSort = th.dataset.sort; uu.tableDir = -1; }
      });
      redraw();
    };
  });
  el('csvBtn').onclick = () => exportCsv(state, cols, rows);
}

/** CSV, quoted properly so a habit named  He said "go"  can't break the file. */
function exportCsv(state, cols, days) {
  const q = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['Date', ...cols.map((c) => c.label)].map(q).join(',')];
  days.forEach((d) => {
    lines.push([d, ...cols.map((c) => {
      const raw = c.raw(state, d);
      return raw === null ? '' : raw;
    })].map(q).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `habit-data-${store.todayKey()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
