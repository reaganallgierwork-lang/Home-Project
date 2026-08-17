/* Covers the body-weight data model: the store CRUD, the photo-quota safety
   net, and the metrics/table integration. Polyfills localStorage since
   store.js expects a browser — same pattern as migration.test.mjs. */

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const near = (a, b, eps = 0.01) => a !== null && Math.abs(a - b) < eps;

const mem = {};
let failNextSetItem = false;
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => {
    if (failNextSetItem) { failNextSetItem = false; throw new Error('QuotaExceededError (simulated)'); }
    mem[k] = v;
  },
};

const store = await import('../js/store.js');
const D = (n) => `2026-03-${String(n).padStart(2, '0')}`;
const FAKE_PHOTO = 'data:image/jpeg;base64,AAAA';

console.log('\n1. Basic CRUD');
{
  ok('nothing logged yet', store.getBodyEntry(D(1)) === null);

  const r1 = store.setBodyEntry(D(1), { weight: 184.2 });
  ok('a weight-only entry saves', r1.ok && !r1.photoDropped);
  ok('and reads back correctly', near(store.getBodyEntry(D(1)).weight, 184.2));
  ok('with no photo', store.getBodyEntry(D(1)).photo === null);

  store.setBodyEntry(D(1), { photo: FAKE_PHOTO });
  ok('adding a photo to an existing entry keeps the weight', near(store.getBodyEntry(D(1)).weight, 184.2));
  ok('and adds the photo', store.getBodyEntry(D(1)).photo === FAKE_PHOTO);

  store.setBodyEntry(D(1), { weight: 183.5 });
  ok('updating weight alone leaves an existing photo untouched', store.getBodyEntry(D(1)).photo === FAKE_PHOTO);

  store.setBodyEntry(D(1), { photo: null });
  ok('photo can be explicitly cleared', store.getBodyEntry(D(1)).photo === null);
  ok('while the weight survives', near(store.getBodyEntry(D(1)).weight, 183.5));

  store.deleteBodyEntry(D(1));
  ok('delete removes the entry entirely', store.getBodyEntry(D(1)) === null);
}

console.log('\n2. Photo-only entries are a legitimate state');
{
  const r = store.setBodyEntry(D(2), { photo: FAKE_PHOTO });
  ok('a photo with no weight still saves', r.ok);
  ok('weight reads as null, not 0', store.getBodyEntry(D(2)).weight === null);
  ok('photo is there', store.getBodyEntry(D(2)).photo === FAKE_PHOTO);
  store.deleteBodyEntry(D(2));
}

console.log('\n3. Clearing both weight and photo removes the entry');
{
  store.setBodyEntry(D(3), { weight: 190 });
  store.setBodyEntry(D(3), { weight: null, photo: null });
  ok('an entry with nothing left in it is not kept as an empty husk', store.getBodyEntry(D(3)) === null);
}

console.log('\n4. The photo-quota fallback');
{
  store.setBodyEntry(D(4), { weight: 175 });
  failNextSetItem = true;
  const r = store.setBodyEntry(D(4), { photo: FAKE_PHOTO });
  ok('a failed save is reported, not silently swallowed', r.photoDropped === true);
  ok('the weight still made it in (the retry save succeeded)', near(store.getBodyEntry(D(4)).weight, 175));
  ok('the photo did not, since it was what did not fit', store.getBodyEntry(D(4)).photo === null);

  /* A failed REPLACE of an already-good photo must not destroy the old one. */
  store.setBodyEntry(D(4), { photo: 'data:image/jpeg;base64,OLDGOOD' });
  ok('a real photo is saved first', store.getBodyEntry(D(4)).photo === 'data:image/jpeg;base64,OLDGOOD');
  failNextSetItem = true;
  const r2 = store.setBodyEntry(D(4), { photo: 'data:image/jpeg;base64,TOOBIG' });
  ok('the failed replacement is reported', r2.photoDropped === true);
  ok('but the previous good photo is kept, not wiped to null',
    store.getBodyEntry(D(4)).photo === 'data:image/jpeg;base64,OLDGOOD');

  store.deleteBodyEntry(D(4));
}

console.log('\n5. Backup round-trips and sanitises');
{
  store.setBodyEntry(D(5), { weight: 200, photo: FAKE_PHOTO });
  const raw = JSON.parse(mem['habitforge.v1']);
  ok('the export payload carries the entry', raw.bodyLog[D(5)].weight === 200);

  /* A hand-edited or corrupted file should degrade, not crash the app. */
  raw.bodyLog['2026-03-09'] = { weight: 'not a number', photo: 'javascript:alert(1)' };
  raw.bodyLog['2026-03-10'] = { weight: null, photo: null };
  const blob = new Blob([JSON.stringify(raw)]);
  blob.text = async () => JSON.stringify(raw);
  const restored = await store.importBackup(blob);
  ok('a non-numeric weight is dropped rather than kept as garbage',
    !restored.bodyLog['2026-03-09'] || restored.bodyLog['2026-03-09'].weight === null);
  ok('a non-image "photo" value is rejected', !restored.bodyLog['2026-03-09']?.photo);
  ok('an entirely empty entry does not survive import', !restored.bodyLog['2026-03-10']);
  ok('a legitimate entry survives the round trip', near(restored.bodyLog[D(5)].weight, 200));
  store.deleteBodyEntry(D(5));
}

console.log('\n6. Metrics source registration');
{
  await import('../js/metrics-weight.js');
  const M = await import('../js/metrics.js');
  const { DEFAULTS } = await import('../js/config.js');

  store.setBodyEntry(D(10), { weight: 180 });
  store.setBodyEntry(D(11), { weight: 178.5 });
  // D(12) deliberately left unlogged

  const state = store.get();
  const metric = M.getMetric(state, 'body:weight');
  ok('the weight metric is registered', !!metric);
  ok('blank days are skipped, not zeroed — the rule the docblock demands', metric.blankPolicy === 'skip');
  ok('unit follows the settings, not hard-coded', metric.unit === state.settings.weightUnit);

  const series = M.buildSeries(state, metric, { from: D(10), to: D(12), granularity: 'day', agg: 'avg' });
  ok('the logged days come through with real numbers',
    near(series.daily.get(D(10)), 180) && near(series.daily.get(D(11)), 178.5));
  ok('the unlogged day is null, not 0', series.daily.get(D(12)) === null);

  const stats = M.summarize(state, metric, series);
  ok('the average only counts days actually weighed in', near(stats.average, (180 + 178.5) / 2));
  ok('coverage reports 2 of 3 days', stats.daysLogged === 2 && stats.daysPossible === 3);

  store.deleteBodyEntry(D(10));
  store.deleteBodyEntry(D(11));
}

console.log('\n7. Table columns');
{
  const { bodyTableColumns } = await import('../js/metrics-weight.js');
  store.setBodyEntry(D(20), { weight: 165.4, photo: FAKE_PHOTO });
  store.setBodyEntry(D(21), { weight: 164.9 });
  const state = store.get();
  const cols = bodyTableColumns(state);
  ok('two columns: weight and photo', cols.length === 2);
  const wcol = cols.find((c) => c.label.startsWith('Weight'));
  const pcol = cols.find((c) => c.label === 'Photo');
  ok('weight column reads the number', wcol.get(state, D(20)) === '165.4');
  ok('photo column says Yes when a photo is attached', pcol.get(state, D(20)) === 'Yes');
  ok('and is blank (not "No") when there is none — matches the rest of the table', pcol.get(state, D(21)) === null);
  ok('an entirely unlogged day is null on both', wcol.get(state, D(22)) === null && pcol.get(state, D(22)) === null);
  store.deleteBodyEntry(D(20));
  store.deleteBodyEntry(D(21));
}

console.log('\n8. earliestDay includes weight history');
{
  const M = await import('../js/metrics.js');
  store.setBodyEntry('2025-01-05', { weight: 200 });
  const state = store.get();
  const earliest = M.earliestDay(state);
  ok("'All time' reaches back to a weight entry that predates everything else",
    earliest <= '2025-01-05', `got ${earliest}`);
  store.deleteBodyEntry('2025-01-05');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
