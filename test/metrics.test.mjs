/* Covers the generic metrics layer: bucketing, aggregation, blank policy,
   trend comparison, and the extension contract a future source relies on. */

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const near = (a, b, eps = 0.01) => a !== null && Math.abs(a - b) < eps;

const M = await import('../js/metrics.js');
const { DEFAULTS } = await import('../js/config.js');

const D = (n) => `2026-03-${String(n).padStart(2, '0')}`;

function stateWith(log, habits = []) {
  return { settings: { ...DEFAULTS }, habits, log, seen: [], ui: {} };
}

/* A hand-built metric, exercising the same contract a workout module would. */
function makeMetric(over = {}) {
  return {
    id: 'test:metric',
    group: 'Test',
    label: 'Value',
    unit: 'oz',
    defaultAgg: 'avg',
    aggOptions: ['avg', 'sum', 'max', 'min'],
    blankPolicy: 'zero',
    series: M.perDay((s, day) => {
      const v = s.log[day]?.v;
      return Number.isFinite(v) ? v : null;
    }),
    ...over,
  };
}
/* normaliseMetric is internal, so route through a source to get the real shape. */
function metricFrom(over) {
  M.registerSource({ id: `t${Math.random()}`, label: 'T', list: () => [makeMetric(over)] });
  const all = M.listMetrics(stateWith({}));
  return all[all.length - 1];
}

console.log('\n1. Bucketing by day / week / month');
{
  const log = {};
  for (let i = 1; i <= 28; i++) log[D(i)] = { v: i };
  const s = stateWith(log);
  const m = metricFrom({});

  const daily = M.buildSeries(s, m, { from: D(1), to: D(28), granularity: 'day', agg: 'avg' });
  ok('a daily view has one bucket per day', daily.buckets.length === 28);
  ok('and each bucket holds that day', near(daily.buckets[4].value, 5));

  const weekly = M.buildSeries(s, m, { from: D(1), to: D(28), granularity: 'week', agg: 'avg' });
  ok('weeks are Monday-anchored, so Mar 1 2026 (a Sunday) is its own bucket', weekly.buckets.length === 5,
    `got ${weekly.buckets.length}`);
  ok('a full week averages its seven days', near(weekly.buckets[1].value, (2 + 3 + 4 + 5 + 6 + 7 + 8) / 7));
  ok('bucket tracks how many days it covers', weekly.buckets[1].total === 7);

  const monthly = M.buildSeries(s, m, { from: D(1), to: D(28), granularity: 'month', agg: 'sum' });
  ok('a month rolls into one bucket', monthly.buckets.length === 1);
  ok('summed correctly', near(monthly.buckets[0].value, (28 * 29) / 2));
}

console.log('\n2. Aggregations');
{
  const log = { [D(1)]: { v: 10 }, [D(2)]: { v: 30 }, [D(3)]: { v: 20 } };
  const s = stateWith(log);
  const m = metricFrom({});
  const opts = { from: D(1), to: D(3), granularity: 'month' };
  ok('avg', near(M.buildSeries(s, m, { ...opts, agg: 'avg' }).buckets[0].value, 20));
  ok('sum', near(M.buildSeries(s, m, { ...opts, agg: 'sum' }).buckets[0].value, 60));
  ok('max', near(M.buildSeries(s, m, { ...opts, agg: 'max' }).buckets[0].value, 30));
  ok('min', near(M.buildSeries(s, m, { ...opts, agg: 'min' }).buckets[0].value, 10));
}

console.log('\n3. Blank policy — the honesty question');
{
  /* Day 2 is simply not logged. */
  const log = { [D(1)]: { v: 100 }, [D(3)]: { v: 50 } };
  const s = stateWith(log);
  const opts = { from: D(1), to: D(3), granularity: 'month', agg: 'avg' };

  const zeroM = metricFrom({ blankPolicy: 'zero' });
  const zSeries = M.buildSeries(s, zeroM, opts);
  ok("'zero' counts the blank day as 0", near(zSeries.buckets[0].value, 50));

  const skipM = metricFrom({ blankPolicy: 'skip' });
  const kSeries = M.buildSeries(s, skipM, opts);
  ok("'skip' leaves it out entirely", near(kSeries.buckets[0].value, 75));

  const stats = M.summarize(s, skipM, kSeries);
  ok('coverage is reported either way, so gaps are never hidden', stats.daysLogged === 2 && stats.daysPossible === 3);
}

console.log('\n4. Summary is computed from days, not from bucket averages');
{
  /* Week 1 is a single day at 100; week 2 is six days at 0. Averaging the two
     bucket values gives 50; the honest daily mean is much lower. */
  const log = { '2026-03-01': { v: 100 } };
  for (let i = 2; i <= 7; i++) log[D(i)] = { v: 0 };
  const s = stateWith(log);
  const m = metricFrom({});
  const series = M.buildSeries(s, m, { from: D(1), to: D(7), granularity: 'week', agg: 'avg' });
  const stats = M.summarize(s, m, series);
  const bucketMean = series.buckets.reduce((a, b) => a + b.value, 0) / series.buckets.length;
  ok('the naive average-of-averages would be misleading', Math.abs(bucketMean - 50) < 1);
  ok('summarize reports the true daily average instead', near(stats.average, 100 / 7),
    `got ${stats.average}`);
}

console.log('\n5. activeFrom keeps new things from back-filling zeroes');
{
  const log = { [D(10)]: { v: 5 }, [D(11)]: { v: 5 } };
  const s = stateWith(log);
  const m = metricFrom({ activeFrom: D(10) });
  const series = M.buildSeries(s, m, { from: D(1), to: D(11), granularity: 'day', agg: 'avg' });
  ok('days before it existed are excluded', series.buckets.length === 2);
  const stats = M.summarize(s, m, series);
  ok('so the average is not dragged down by phantom days', near(stats.average, 5));
  ok('and coverage reflects only the real window', stats.daysPossible === 2);
}

console.log('\n6. Trend vs the previous window');
{
  const log = {};
  for (let i = 1; i <= 10; i++) log[D(i)] = { v: 10 };    // previous window
  for (let i = 11; i <= 20; i++) log[D(i)] = { v: 20 };   // current window
  const s = stateWith(log);
  const m = metricFrom({});
  const t = M.trendVsPrevious(s, m, { from: D(11), to: D(20), granularity: 'day', agg: 'avg' });
  ok('doubling shows as +100%', t && near(t.pct, 100));
  ok('and reads as good when higher is better', t.direction === 'good');

  const lower = metricFrom({ higherIsBetter: false });
  const t2 = M.trendVsPrevious(s, lower, { from: D(11), to: D(20), granularity: 'day', agg: 'avg' });
  ok('the same rise reads as bad when lower is better', t2.direction === 'bad');

  const noHistory = metricFrom({ activeFrom: D(11) });
  ok('no comparison is invented against time before the metric existed',
    M.trendVsPrevious(s, noHistory, { from: D(11), to: D(20), granularity: 'day', agg: 'avg' }) === null);
}

console.log('\n7. Formatting');
{
  const oz = metricFrom({ unit: 'oz', precision: 0 });
  ok('units are appended', M.formatValue(oz, 120) === '120 oz');
  ok('missing values read as a dash, never 0', M.formatValue(oz, null) === '—');
  const pct = metricFrom({ unit: '%', scale: 100, precision: 0 });
  ok('a 0-1 rate scales to a percentage with no space', M.formatValue(pct, 0.75) === '75%');
  const rating = metricFrom({ unit: '/ 5', precision: 1 });
  ok('a pointless trailing zero is trimmed', M.formatValue(rating, 4) === '4 / 5');
  ok('but a real decimal is kept', M.formatValue(rating, 4.25) === '4.3 / 5');
}

console.log('\n8. Ranges and granularity');
{
  const r = M.resolveRange('7d', '2020-01-01', D(10));
  ok('7d spans exactly 7 days inclusive', r.from === D(4) && r.to === D(10));
  const clamped = M.resolveRange('1y', D(5), D(10));
  ok('a range never starts before any data exists', clamped.from === D(5));
  ok('short spans bucket by day', M.autoGranularity(20) === 'day');
  ok('medium spans by week', M.autoGranularity(90) === 'week');
  ok('long spans by month', M.autoGranularity(300) === 'month');
}

console.log('\n9. A broken source cannot take down the screen');
{
  M.registerSource({ id: 'broken', label: 'Broken', list: () => { throw new Error('boom'); } });
  const before = console.warn;
  console.warn = () => {};
  const all = M.listMetrics(stateWith({}));
  console.warn = before;
  ok('listMetrics still returns the working sources', Array.isArray(all) && all.length > 0);
}

console.log('\n10. The habits source registers real metrics');
{
  const { compute } = await import('../js/engine.js');
  await import('../js/metrics-habits.js');
  const habits = [
    { id: 'h1', name: 'Hydration', emoji: '💧', type: 'scale', inputStyle: 'counter', weight: 10, max: 150, threshold: 150, step: 8, unit: 'oz', archived: false, archivedAt: null, createdAt: D(1) },
    { id: 'h2', name: 'Training', emoji: '🏋️', type: 'binary', weight: 20, threshold: 3, max: 5, archived: false, archivedAt: null, createdAt: D(1) },
  ];
  const log = { [D(1)]: { h1: 150, h2: 1 }, [D(2)]: { h1: 75 }, [D(3)]: { h1: 150, h2: 1 } };
  const s = stateWith(log, habits);

  const all = M.listMetrics(s);
  const amount = all.find((m) => m.id === 'habit:h1:amount');
  const done = all.find((m) => m.id === 'habit:h2:done');
  ok('a counter habit exposes its raw amount', !!amount && amount.unit === 'oz');
  ok('with the goal carried through as the chart target', amount.target === 150);
  ok('every habit exposes a consistency rate', !!done && done.unit === '%');
  ok('whole-day metrics exist too', all.some((m) => m.id === 'day:score'));

  const oz = M.buildSeries(s, amount, { from: D(1), to: D(3), granularity: 'day', agg: 'avg' });
  ok('ounces come through per day', near(oz.buckets[0].value, 150) && near(oz.buckets[1].value, 75));
  const ozStats = M.summarize(s, amount, oz);
  ok('average ounces across the window', near(ozStats.average, 125));
  ok('days hitting the goal are counted', ozStats.hitTarget === 2);

  const trainSeries = M.buildSeries(s, done, { from: D(1), to: D(3), granularity: 'month', agg: 'avg' });
  ok('an unlogged binary day counts as a miss, matching the scoring rules',
    near(trainSeries.buckets[0].value, 2 / 3));

  /* The engine cache must not go stale when the log changes underneath it.
     In the app every change routes through store.save(), which invalidates;
     here we're mutating state directly, so invalidate by hand. */
  const { invalidateMetricsCache } = await import('../js/metrics-habits.js');
  const score = all.find((m) => m.id === 'day:score');
  const before = M.buildSeries(s, score, { from: D(2), to: D(2), granularity: 'day', agg: 'avg' }).buckets[0].value;
  s.log[D(2)].h2 = 1;
  invalidateMetricsCache();
  const after = M.buildSeries(s, M.getMetric(s, 'day:score'), { from: D(2), to: D(2), granularity: 'day', agg: 'avg' }).buckets[0].value;
  ok('logging another habit raises that day score (cache invalidates)', after > before,
    `${before} -> ${after}`);

  /* And the cache must not survive a wholesale state swap either. */
  const swapped = stateWith({ ...log, [D(2)]: { h1: 150, h2: 1 } }, habits);
  const swappedVal = M.buildSeries(swapped, M.getMetric(swapped, 'day:score'), { from: D(2), to: D(2), granularity: 'day', agg: 'avg' }).buckets[0].value;
  ok('a restored backup is not served from the previous cache', swappedVal > before,
    `${before} -> ${swappedVal}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
