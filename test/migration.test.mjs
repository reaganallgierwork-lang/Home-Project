/* Proves the Hydration migration (binary -> counted cups) preserves history
   for anyone who already had the app running before this change, and that it
   only ever runs once per device. Polyfills localStorage since store.js
   expects a browser. */

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = v; },
};

const store = await import('../js/store.js');

console.log('\nHydration migration');
{
  /* Simulate a real pre-migration save: Hydration is still a plain binary
     habit, logged as a normal 0/1, mixed with other habits. */
  const OLD = {
    version: 1,
    settings: { dailyTotal: 100, escalationStep: 0.34, maxBoost: 1, recoveryDays: 3, redemptionShare: 0.5, tierPercents: [0.25, 0.45, 0.65, 0.8, 0.92], metaQualifyTierIndex: 3, comebackGoalShare: 0.7, streakMilestones: [3, 7] },
    habits: [
      { id: 'hydro1', name: 'Hydration', emoji: '💧', type: 'binary', weight: 10, threshold: 3, max: 5, archived: false, createdAt: '2026-06-01' },
      { id: 'other1', name: 'Training', emoji: '🏋️', type: 'binary', weight: 20, threshold: 3, max: 5, archived: false, createdAt: '2026-06-01' },
    ],
    log: {
      '2026-06-01': { hydro1: 1, other1: 1 },
      '2026-06-02': { hydro1: 0, other1: 1 },
      '2026-06-03': { other1: 1 },          // hydration simply unlogged
      '2026-06-04': { hydro1: 1, other1: 0 },
    },
    seen: ['x'],
  };
  mem['habitforge.v1'] = JSON.stringify(OLD);

  const s1 = store.load();
  const hab = s1.habits.find((h) => h.id === 'hydro1');

  ok('habit converts to a counter', hab.type === 'scale' && hab.inputStyle === 'counter');
  ok('goal is 150oz in 8oz cups', hab.max === 150 && hab.step === 8 && hab.unit === 'oz');
  ok('full goal is required to keep the streak, matching the old "yes"', hab.threshold === 150);

  ok('a past "yes" day is carried over as maxed (same score as before)', s1.log['2026-06-01'].hydro1 === 150);
  ok('a past "no" day stays at 0/false, not maxed', s1.log['2026-06-02'].hydro1 === 0);
  ok('a past unlogged day is still unlogged', !('hydro1' in s1.log['2026-06-03']));
  ok('every occurrence is converted, not just the first', s1.log['2026-06-04'].hydro1 === 150);
  ok('other habits and settings are untouched', s1.habits.find((h) => h.id === 'other1').type === 'binary');
  ok('other data (seen list) survives the migration', s1.seen.includes('x'));

  /* Confirm the score math actually works out the same as it did before —
     the whole point of carrying old "yes" days over as 150, not just a
     type change that happens to look right. */
  const { compute } = await import('../js/engine.js');
  const r = compute(s1, '2026-06-04');
  ok('a maxed pre-migration day still earns full points for that habit',
    Math.abs(r.byDay['2026-06-01'].byHabit.hydro1.fraction - 1) < 1e-9);

  /* Re-save (as the app naturally does after any log change) and reload —
     the migration flag must stick, so a later manual switch back to binary
     is never silently reverted. */
  store.save();
  store.update((s) => {
    const h2 = s.habits.find((x) => x.id === 'hydro1');
    h2.type = 'binary'; // pretend the user manually reverted it in Settings
  });
  const raw2 = JSON.parse(mem['habitforge.v1']);
  ok('migration flag persisted so it will not re-run on next load', raw2.migratedHydrationV1 === true);
}

console.log('\nCalorie budget migration');
{
  /* A save from just before the calorie-budget goal type shipped: no such
     habit exists yet, and the flag is absent (same as any real device). */
  const OLD = {
    version: 1,
    settings: { dailyTotal: 100, escalationStep: 0.34, maxBoost: 1, recoveryDays: 3, redemptionShare: 0.5, tierPercents: [0.25, 0.45, 0.65, 0.8, 0.92], metaQualifyTierIndex: 3, comebackGoalShare: 0.7, streakMilestones: [3, 7], tdee: 2400 },
    habits: [
      { id: 'other1', name: 'Training', emoji: '🏋️', type: 'binary', weight: 20, threshold: 3, max: 5, archived: false, createdAt: '2026-06-01' },
    ],
    log: {},
    seen: [],
  };
  mem['habitforge.v1'] = JSON.stringify(OLD);

  // store.load() only re-parses localStorage the first time it's ever
  // called (it caches after that) — the Hydration test above already
  // called it once this process, so importBackup() is used here instead:
  // it always re-normalises whatever is handed to it, same code path.
  const blob = new Blob([JSON.stringify(OLD)]);
  blob.text = async () => JSON.stringify(OLD);
  const s1 = await store.importBackup(blob);
  const added = s1.habits.find((h) => h.goalSource === 'tdee');

  ok('a Calorie budget habit is added automatically', !!added);
  ok('weighted at 10, as requested', added?.weight === 10);
  ok('linked to calories', added?.nutritionLink === 'calories');
  ok('its cached goal reflects whatever TDEE was already set (2400 - 500)', added?.max === 1900);
  ok('the pre-existing habit is untouched', s1.habits.find((h) => h.id === 'other1').type === 'binary');

  store.save();
  const raw2 = JSON.parse(mem['habitforge.v1']);
  ok('migration flag persisted', raw2.migratedCalorieBudgetV1 === true);
  ok('exactly one calorie-budget habit was added, not duplicated in the saved file',
    raw2.habits.filter((h) => h.goalSource === 'tdee').length === 1);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
