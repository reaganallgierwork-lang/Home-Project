/* ============================================================================
   METRICS — the generic data layer behind the Data tab.
   ----------------------------------------------------------------------------
   This file knows NOTHING about habits, workouts, or anything else specific.
   It only knows how to take "a number per day" and turn it into ranges,
   buckets, trends and summary statistics.

   ---------------------------------------------------------------------------
   HOW TO ADD A NEW KIND OF TRACKED DATA (read this before building the
   workout tracker or anything else)
   ---------------------------------------------------------------------------
   You never edit this file or the Data screen. You write one new module that
   calls registerSource(), and every chart, stat, table, range picker and CSV
   export starts working with your data automatically.

       // js/metrics-workouts.js
       import { registerSource, perDay } from './metrics.js';

       registerSource({
         id: 'workouts',
         label: 'Workouts',
         icon: 'dumbbell',
         list(state) {
           // Return one metric per thing worth charting. Build the list from
           // state, so new exercises appear the moment they're logged —
           // nothing here should be hard-coded.
           return state.exercises.map((ex) => ({
             id: `lift:${ex.id}:topset`,
             group: ex.name,          // groups the picker
             label: 'Heaviest set',
             unit: 'lb',
             defaultAgg: 'max',       // a week's "value" is its heaviest set
             aggOptions: ['max', 'avg'],
             higherIsBetter: true,
             form: 'bar',
             blankPolicy: 'skip',     // a rest day isn't a 0lb bench press
             series: perDay((state, day) => topSetFor(state, ex.id, day)),
           }));
         },
       });

   Then add one import line in ui.js. That's the whole integration.

   THE METRIC CONTRACT — every field, and what it does:

     id            unique and stable across reloads (it's how a selection is
                   remembered). Namespace it, e.g. 'lift:<id>:topset'.
     group         section heading in the picker (usually the habit/exercise
                   name). groupIcon is an optional emoji beside it.
     label         the metric's own name within that group.
     unit          shown after numbers ('oz', 'lb', '%'). May be ''.
     scale         multiply raw values for display (use 100 for a 0-1 rate
                   you want shown as a percentage). Default 1.
     precision     decimal places when displayed. Default 0.
     defaultAgg    how days roll up into a week/month: 'avg' | 'sum' | 'max' | 'min'.
     aggOptions    which of those the user may switch between. Default [defaultAgg].
     target        optional number — draws the goal line on the chart.
     higherIsBetter whether an upward trend is good. Drives the trend colour.
     form          'line' or 'bar'. A hint; daily views prefer lines.
     blankPolicy   what an unlogged day means for this metric:
                     'zero' — it counts as 0 (you didn't do it)
                     'skip' — it's unknown and excluded from averages
                   Choose honestly. "Did I train?" is a zero. "How well did I
                   sleep?" on a night you forgot to log is NOT a zero.
     activeFrom    optional 'YYYY-MM-DD'. Days before this are excluded
                   entirely, so adding something new never back-fills misses.
     series        (state, days[]) => Map<dayKey, number|null>. Return null for
                   a day with no data. Use perDay(fn) if a simple per-day
                   lookup is easier — it builds the Map for you.
   ========================================================================== */

import { addDays, rangeDays, todayKey, parseKey, monthOf } from './store.js';

/* ---------------------------------------------------------------- registry - */

const sources = new Map();

/** Register a provider of metrics. Called once per module, at import time. */
export function registerSource(source) {
  if (!source || !source.id || typeof source.list !== 'function') {
    throw new Error('A metric source needs an id and a list(state) function.');
  }
  sources.set(source.id, source);
}

/** Wrap a simple (state, day) => number|null into the series() shape. */
export function perDay(fn) {
  return (state, days) => {
    const out = new Map();
    days.forEach((d) => out.set(d, fn(state, d)));
    return out;
  };
}

/** Every metric from every registered source, normalised and sorted. */
export function listMetrics(state) {
  const out = [];
  sources.forEach((src) => {
    let items = [];
    try {
      items = src.list(state) || [];
    } catch (err) {
      /* One broken source must never take down the whole screen. */
      console.warn(`Metric source "${src.id}" failed to list:`, err);
      return;
    }
    items.forEach((m) => out.push(normaliseMetric(m, src)));
  });
  return out;
}

export function listSources() {
  return [...sources.values()].map((s) => ({ id: s.id, label: s.label, icon: s.icon || '' }));
}

export function getMetric(state, id) {
  return listMetrics(state).find((m) => m.id === id) || null;
}

function normaliseMetric(m, src) {
  const defaultAgg = m.defaultAgg || 'avg';
  return {
    sourceId: src.id,
    sourceLabel: src.label || src.id,
    sourceIcon: src.icon || '',
    group: m.group || src.label || src.id,
    groupIcon: m.groupIcon || '',
    label: m.label || m.id,
    unit: m.unit ?? '',
    scale: Number.isFinite(m.scale) ? m.scale : 1,
    precision: Number.isFinite(m.precision) ? m.precision : 0,
    defaultAgg,
    aggOptions: m.aggOptions && m.aggOptions.length ? m.aggOptions : [defaultAgg],
    target: Number.isFinite(m.target) ? m.target : null,
    higherIsBetter: m.higherIsBetter !== false,
    form: m.form === 'bar' ? 'bar' : 'line',
    blankPolicy: m.blankPolicy === 'skip' ? 'skip' : 'zero',
    activeFrom: m.activeFrom || null,
    activeTo: m.activeTo || null,
    ...m,
  };
}

/* ------------------------------------------------------------------ ranges - */

export const RANGES = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: '6m', label: '6 months', days: 182 },
  { key: '1y', label: '1 year', days: 365 },
  { key: 'all', label: 'All time', days: null },
];

export const GRANULARITIES = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
];

/** The natural bucket size for a span — small ranges by day, long ones by month. */
export function autoGranularity(dayCount) {
  if (dayCount <= 31) return 'day';
  if (dayCount <= 120) return 'week';
  return 'month';
}

/**
 * Turn a range key into concrete start/end day keys.
 * `earliest` is the first day any data exists, used by the 'all' range.
 */
export function resolveRange(rangeKey, earliest, end = todayKey()) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[1];
  if (!r.days) return { from: earliest || end, to: end, days: null, label: r.label };
  const from = addDays(end, -(r.days - 1));
  return { from: earliest && earliest > from ? earliest : from, to: end, days: r.days, label: r.label };
}

/* ----------------------------------------------------------------- buckets - */

/** Monday-start week key, matching the History screen's weeks. */
function weekStartOf(day) {
  const dow = (parseKey(day).getDay() + 6) % 7;
  return addDays(day, -dow);
}

function bucketKeyFor(day, granularity) {
  if (granularity === 'month') return monthOf(day);
  if (granularity === 'week') return weekStartOf(day);
  return day;
}

const AGGREGATORS = {
  avg: (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null),
  sum: (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) : null),
  max: (vals) => (vals.length ? Math.max(...vals) : null),
  min: (vals) => (vals.length ? Math.min(...vals) : null),
};

export const AGG_LABELS = {
  avg: 'Average', sum: 'Total', max: 'Best', min: 'Lowest',
};

/**
 * The core call. Produces the chart-ready buckets plus the raw daily values.
 *
 *   { days, daily, buckets, granularity, agg }
 *
 * A bucket's `value` is null when it contains no usable data, so charts can
 * show an honest gap instead of drawing a zero that never happened.
 */
export function buildSeries(state, metric, { from, to, granularity, agg } = {}) {
  const g = granularity || 'day';
  const a = AGGREGATORS[agg] ? agg : metric.defaultAgg;

  /* Clamp to the window where this metric actually exists, so a habit added
     last week doesn't show two months of phantom zeroes. */
  let start = from;
  if (metric.activeFrom && metric.activeFrom > start) start = metric.activeFrom;
  let stop = to;
  if (metric.activeTo && metric.activeTo < stop) stop = metric.activeTo;
  if (start > stop) return { days: [], daily: new Map(), buckets: [], granularity: g, agg: a };

  const days = rangeDays(start, stop);
  let daily;
  try {
    daily = metric.series(state, days) || new Map();
  } catch (err) {
    console.warn(`Metric "${metric.id}" failed to build its series:`, err);
    daily = new Map();
  }

  /* Group days into buckets, preserving order. */
  const order = [];
  const groups = new Map();
  days.forEach((d) => {
    const k = bucketKeyFor(d, g);
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k).push(d);
  });

  const buckets = order.map((k) => {
    const bDays = groups.get(k);
    const raw = bDays.map((d) => {
      const v = daily.get(d);
      return Number.isFinite(v) ? v : null;
    });
    /* blankPolicy decides whether an unlogged day is a zero or unknown. */
    const usable = metric.blankPolicy === 'zero'
      ? raw.map((v) => (v === null ? 0 : v))
      : raw.filter((v) => v !== null);
    const logged = raw.filter((v) => v !== null).length;
    return {
      key: k,
      start: bDays[0],
      end: bDays[bDays.length - 1],
      days: bDays,
      logged,
      total: bDays.length,
      value: usable.length ? AGGREGATORS[a](usable) : null,
      label: bucketLabel(k, g, bDays),
      shortLabel: bucketShortLabel(k, g),
    };
  });

  return { days, daily, buckets, granularity: g, agg: a };
}

function bucketLabel(key, g, days) {
  if (g === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (g === 'week') {
    const a = parseKey(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const b = parseKey(days[days.length - 1]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${a} – ${b}`;
  }
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function bucketShortLabel(key, g) {
  if (g === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
  }
  return parseKey(key).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

/* --------------------------------------------------------------- summaries - */

/**
 * Headline statistics for a whole window.
 *
 * Deliberately computed from the DAILY values, not from the bucket values —
 * averaging a set of averages weights a 2-day week the same as a 7-day one
 * and quietly reports the wrong number.
 */
export function summarize(state, metric, series) {
  const vals = [];
  let logged = 0;
  series.days.forEach((d) => {
    const v = series.daily.get(d);
    if (Number.isFinite(v)) { logged += 1; vals.push(v); }
    else if (metric.blankPolicy === 'zero') vals.push(0);
  });

  const withValues = series.buckets.filter((b) => b.value !== null);
  const best = withValues.length
    ? withValues.reduce((a, b) => (b.value > a.value ? b : a))
    : null;
  const worst = withValues.length
    ? withValues.reduce((a, b) => (b.value < a.value ? b : a))
    : null;

  return {
    headline: vals.length ? AGGREGATORS[series.agg](vals) : null,
    average: vals.length ? AGGREGATORS.avg(vals) : null,
    total: vals.length ? AGGREGATORS.sum(vals) : null,
    max: vals.length ? AGGREGATORS.max(vals) : null,
    min: vals.length ? AGGREGATORS.min(vals) : null,
    daysLogged: logged,
    daysPossible: series.days.length,
    coverage: series.days.length ? logged / series.days.length : 0,
    hitTarget: metric.target !== null ? vals.filter((v) => v >= metric.target).length : null,
    bestBucket: best,
    worstBucket: worst,
  };
}

/**
 * Compare this window against the equally-long window immediately before it.
 * Returns null when there isn't enough history to make an honest comparison.
 */
export function trendVsPrevious(state, metric, { from, to, granularity, agg }) {
  const span = rangeDays(from, to).length;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));

  /* Don't invent a comparison against time before this metric existed. */
  if (metric.activeFrom && prevFrom < metric.activeFrom) return null;

  const cur = summarize(state, metric, buildSeries(state, metric, { from, to, granularity, agg }));
  const prevSeries = buildSeries(state, metric, { from: prevFrom, to: prevTo, granularity, agg });
  if (!prevSeries.days.length) return null;
  const prev = summarize(state, metric, prevSeries);

  if (cur.headline === null || prev.headline === null || prev.headline === 0) return null;
  const delta = cur.headline - prev.headline;
  const pct = (delta / Math.abs(prev.headline)) * 100;
  return {
    current: cur.headline,
    previous: prev.headline,
    delta,
    pct,
    /* 'good' / 'bad' / 'flat' — respects whether up is actually an improvement. */
    direction: Math.abs(pct) < 1 ? 'flat' : ((delta > 0) === metric.higherIsBetter ? 'good' : 'bad'),
    from: prevFrom,
    to: prevTo,
  };
}

/* ------------------------------------------------------------- formatting - */

export function formatValue(metric, value, { compact = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const v = value * metric.scale;
  let n;
  if (compact && Math.abs(v) >= 10000) n = `${(v / 1000).toFixed(1)}k`;
  else n = v.toFixed(metric.precision);
  /* Trim a pointless trailing .0 so "5.0 oz" reads as "5 oz". */
  if (metric.precision > 0) n = n.replace(/\.0+$/, '');
  return metric.unit ? `${n}${metric.unit === '%' ? '' : ' '}${metric.unit}` : n;
}

/** The earliest day any registered metric has data for — drives 'All time'. */
export function earliestDay(state) {
  const logDays = Object.keys(state.log || {}).sort();
  const created = (state.habits || []).map((h) => h.createdAt).filter(Boolean).sort();
  const candidates = [logDays[0], created[0]].filter(Boolean).sort();
  return candidates[0] || todayKey();
}
