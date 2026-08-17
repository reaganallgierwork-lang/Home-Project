/* Covers the Calorie budget habit type: a counter whose goal is computed
   live as settings.tdee - deficitTarget instead of a typed-in max, and whose
   scoring direction is inverted from every other counter — full credit for
   landing AT OR UNDER the budget, falling off (not cliffing) as you go over.
   Engine-level tests use the same makeState() shape as engine.test.mjs;
   store-level tests use the same localStorage polyfill as weight/nutrition. */

import { compute } from '../js/engine.js';
import { DEFAULTS } from '../js/config.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

function makeState(habits, log, settings = {}) {
  return {
    settings: { ...DEFAULTS, ...settings },
    habits: habits.map((h, i) => ({
      id: h.id || `h${i}`,
      name: h.name || `H${i}`,
      emoji: '•',
      type: 'scale',
      inputStyle: 'counter',
      weight: h.weight ?? 10,
      max: h.max ?? 100,
      threshold: h.threshold ?? h.max ?? 100,
      goalSource: h.goalSource ?? 'fixed',
      deficitTarget: h.deficitTarget ?? 500,
      nutritionLink: h.nutritionLink ?? null,
      archived: false,
      archivedAt: null,
      createdAt: h.createdAt || '2026-03-01',
    })),
    log,
    seen: [],
  };
}
const D = (n) => `2026-03-${String(n).padStart(2, '0')}`;

console.log('\n1. The goal is TDEE minus deficit, not a typed-in number');
{
  const habits = [{ id: 'a', goalSource: 'tdee', deficitTarget: 500 }];
  // TDEE 2600 (default) - 500 deficit = 2100 budget
  const r = compute(makeState(habits, { [D(1)]: { a: 2100 } }, { tdee: 2600 }), D(1));
  ok('landing exactly on budget earns full credit', near(r.byDay[D(1)].byHabit.a.fraction, 1));
  ok('and counts as success', r.byDay[D(1)].byHabit.a.success === true);
}

console.log('\n2. Changing TDEE moves the goal without touching the habit');
{
  const habits = [{ id: 'a', goalSource: 'tdee', deficitTarget: 500 }];
  // Same 2100 calories, but a lower TDEE (2400) means the budget is now 1900 — over it.
  const r = compute(makeState(habits, { [D(1)]: { a: 2100 } }, { tdee: 2400 }), D(1));
  ok('a lower TDEE tightens the budget and the same intake now falls short of full credit',
    r.byDay[D(1)].byHabit.a.fraction < 1);
  ok('and no longer counts as success', r.byDay[D(1)].byHabit.a.success === false);
}

console.log('\n3. Under budget is always full credit — no reward for eating less');
{
  const habits = [{ id: 'a', goalSource: 'tdee', deficitTarget: 500 }]; // budget 2100
  const rFar = compute(makeState(habits, { [D(1)]: { a: 500 } }, { tdee: 2600 }), D(1));
  const rClose = compute(makeState(habits, { [D(1)]: { a: 2000 } }, { tdee: 2600 }), D(1));
  ok('500 cal (well under) earns full credit', near(rFar.byDay[D(1)].byHabit.a.fraction, 1));
  ok('2000 cal (just under) earns the same full credit', near(rClose.byDay[D(1)].byHabit.a.fraction, 1));
  ok('both count as success', rFar.byDay[D(1)].byHabit.a.success && rClose.byDay[D(1)].byHabit.a.success);
}

console.log('\n4. Going over falls off smoothly — no cliff, matching the rest of the app');
{
  const habits = [{ id: 'a', goalSource: 'tdee', deficitTarget: 500 }]; // budget 2100
  const r10 = compute(makeState(habits, { [D(1)]: { a: 2310 } }, { tdee: 2600 }), D(1)); // 10% over
  const r50 = compute(makeState(habits, { [D(1)]: { a: 3150 } }, { tdee: 2600 }), D(1)); // 50% over
  const r100 = compute(makeState(habits, { [D(1)]: { a: 4200 } }, { tdee: 2600 }), D(1)); // 100% over (2x budget)
  const r200 = compute(makeState(habits, { [D(1)]: { a: 6300 } }, { tdee: 2600 }), D(1)); // way past double
  ok('10% over still keeps most of the credit', near(r10.byDay[D(1)].byHabit.a.fraction, 0.9));
  ok('50% over keeps half', near(r50.byDay[D(1)].byHabit.a.fraction, 0.5));
  ok('exactly double the budget zeroes it out', near(r100.byDay[D(1)].byHabit.a.fraction, 0));
  ok('further over never goes negative', r200.byDay[D(1)].byHabit.a.fraction === 0);
  ok('any amount over budget is not a success day', !r10.byDay[D(1)].byHabit.a.success);
}

console.log('\n5. An unlogged day behaves exactly like every other counter');
{
  const habits = [{ id: 'a', goalSource: 'tdee', deficitTarget: 500 }];
  const r = compute(makeState(habits, {}, { tdee: 2600 }), D(1));
  ok('no entry means no credit', r.byDay[D(1)].byHabit.a.fraction === 0);
  ok('and not a success', r.byDay[D(1)].byHabit.a.success === false);
}

console.log('\n6. An ordinary fixed-goal counter is completely unaffected');
{
  // Regression guard: goalSource defaulting to 'fixed' must reproduce the
  // exact pre-existing counter behaviour (proportional up to max, capped).
  const habits = [{ id: 'a', goalSource: 'fixed', max: 150, threshold: 150 }];
  const rUnder = compute(makeState(habits, { [D(1)]: { a: 75 } }), D(1));
  const rOver = compute(makeState(habits, { [D(1)]: { a: 300 } }), D(1));
  ok('half of goal earns half credit', near(rUnder.byDay[D(1)].byHabit.a.fraction, 0.5));
  ok('double the goal still just caps at full credit, not zero', near(rOver.byDay[D(1)].byHabit.a.fraction, 1));
  ok('reaching the goal is what makes it a success, same as always', rOver.byDay[D(1)].byHabit.a.success === true);
}

/* ------------------------------------------------------------------------
   Store-level: the habit editor's fields, backup sanitisation, and that it
   composes correctly with the existing nutrition-linking machinery.
   ------------------------------------------------------------------------ */
const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = v; },
};
const store = await import('../js/store.js');
const DK = (n) => `2026-04-${String(n).padStart(2, '0')}`;

console.log('\n7. store.effectiveGoal()');
{
  const fixed = { goalSource: 'fixed', max: 150 };
  const tdee = { goalSource: 'tdee', deficitTarget: 500 };
  ok('a fixed habit just returns its max', store.effectiveGoal(fixed, { tdee: 2600 }) === 150);
  ok('a tdee habit computes tdee - deficit', store.effectiveGoal(tdee, { tdee: 2600 }) === 2100);
  ok('the goal never goes below 1, even with a deficit bigger than TDEE',
    store.effectiveGoal({ goalSource: 'tdee', deficitTarget: 9999 }, { tdee: 2600 }) === 1);
}

console.log('\n8. Creating and linking a real Calorie budget habit through the store');
{
  const h = store.addHabit({
    name: 'Calorie budget', type: 'scale', inputStyle: 'counter',
    goalSource: 'tdee', deficitTarget: 500, nutritionLink: 'calories', weight: 10,
  });
  ok('weight defaults are respected (10, as requested)', h.weight === 10);
  ok('it is linked to calories', h.nutritionLink === 'calories');
  ok('it is a tdee-sourced goal', h.goalSource === 'tdee');

  ok('unlogged day: not in the log at all', store.getEntry(DK(1), h.id) === undefined);
  store.logFoodEntry(DK(1), { name: 'Lunch', calories: 900 });
  store.logFoodEntry(DK(1), { name: 'Dinner', calories: 800 });
  ok('logging food fills the counter in via the existing nutrition link', store.getEntry(DK(1), h.id) === 1700);

  store.update((s) => { s.settings.tdee = 2200; });
  ok('the goal updates live from the new TDEE without touching the habit',
    store.effectiveGoal(store.get().habits.find((x) => x.id === h.id), store.get().settings) === 1700);
}

console.log('\n9. Settings.tdee sanitises like every other numeric setting');
{
  const raw = JSON.parse(mem['habitforge.v1']);
  raw.settings.tdee = 'onmouseover=alert(1)';
  raw.habits[0].goalSource = '<script>alert(1)</script>';
  raw.habits[0].deficitTarget = -400;
  const blob = new Blob([JSON.stringify(raw)]);
  blob.text = async () => JSON.stringify(raw);
  const restored = await store.importBackup(blob);
  ok('a garbage tdee falls back to the config default, not 0 or NaN', restored.settings.tdee === DEFAULTS.tdee);
  ok('an unrecognised goalSource collapses to fixed', restored.habits[0].goalSource === 'fixed');
  ok('a negative deficit is floored at 0', restored.habits[0].deficitTarget === 0);
}

console.log('\n10. metrics-habits.js shows the live budget as the chart target, not a stale max');
{
  await import('../js/metrics-habits.js');
  const M = await import('../js/metrics.js');
  const h = store.get().habits.find((x) => x.goalSource === 'tdee');
  store.update((s) => { s.settings.tdee = 2600; });
  const metric = M.getMetric(store.get(), `habit:${h.id}:amount`);
  ok('the metric registers', !!metric);
  ok('its target tracks the live budget (2600 - 500 = 2100), not a cached number',
    metric.target === 2100);
}

console.log('\n11. The starter-habit migration never duplicates an existing one');
{
  // A backup from a device that already has a calorie-budget habit, but
  // whose flag is missing (an even older backup, or hand-edited file).
  const raw = {
    version: 1,
    settings: { tdee: 2600, tierPercents: [0.25, 0.45, 0.65, 0.8, 0.92] },
    habits: [
      { id: 'x1', name: 'Existing budget', type: 'scale', inputStyle: 'counter', weight: 12, goalSource: 'tdee', deficitTarget: 300, nutritionLink: 'calories', createdAt: '2026-01-01' },
    ],
    log: {},
    meals: [],
    nutritionLog: {},
  };
  const blob = new Blob([JSON.stringify(raw)]);
  blob.text = async () => JSON.stringify(raw);
  const restored = await store.importBackup(blob);
  const budgetHabits = restored.habits.filter((h) => h.goalSource === 'tdee');
  ok('no second habit is added when one already exists', budgetHabits.length === 1);
  ok('the existing one is left completely alone', budgetHabits[0].id === 'x1' && budgetHabits[0].deficitTarget === 300);
  ok('the migration is still marked done so it never re-checks', restored.migratedCalorieBudgetV1 === true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
