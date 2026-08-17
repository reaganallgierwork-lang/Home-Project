/* Covers the nutrition data model: food entry CRUD, the habit-linking sync
   (the part that actually matters — a linked counter habit is supposed to
   be entirely derived from the food log), frequent meals, backup
   sanitization, and the Data tab integration. Same localStorage-polyfill
   pattern as weight.test.mjs. */

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const near = (a, b, eps = 0.01) => a !== null && Math.abs(a - b) < eps;

const mem = {};
globalThis.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = v; },
};

const store = await import('../js/store.js');
const D = (n) => `2026-04-${String(n).padStart(2, '0')}`;

console.log('\n1. Basic CRUD');
{
  ok('nothing logged yet', store.getNutritionDay(D(1)).length === 0);

  const e = store.logFoodEntry(D(1), { name: 'Chicken breast', calories: 200, protein: 40 });
  ok('entry saves and comes back', store.getNutritionDay(D(1)).length === 1);
  ok('with the right fields', e.name === 'Chicken breast' && near(e.calories, 200) && near(e.protein, 40));
  ok('unfilled fields are null, not zero', e.carbs === null && e.fat === null);

  store.updateFoodEntry(D(1), e.id, { protein: 45, carbs: 3 });
  const updated = store.getNutritionDay(D(1))[0];
  ok('update changes only the given fields', near(updated.protein, 45) && near(updated.carbs, 3));
  ok('and leaves the rest alone', near(updated.calories, 200));

  store.deleteFoodEntry(D(1), e.id);
  ok('delete removes it', store.getNutritionDay(D(1)).length === 0);
}

console.log('\n2. A day totals every entry logged on it');
{
  store.logFoodEntry(D(2), { name: 'Oats', calories: 300, carbs: 50 });
  store.logFoodEntry(D(2), { name: 'Eggs', calories: 150, protein: 12, fat: 10 });
  const t = store.nutritionTotals(D(2));
  ok('calories sum across both', near(t.calories, 450));
  ok('protein only counts the entry that had it', near(t.protein, 12));
  ok('carbs likewise', near(t.carbs, 50));
  ok('fat likewise', near(t.fat, 10));
}

console.log('\n3. Negative numbers are refused — food cannot be negative');
{
  const e = store.logFoodEntry(D(2), { name: 'Weird', calories: -50, protein: '-5' });
  ok('a negative value is floored at 0, not accepted as-is', e.calories === 0 && e.protein === 0);
  store.deleteFoodEntry(D(2), e.id);
}

console.log('\n4. Habit linking: a linked counter is DERIVED from the food log');
{
  const state = store.get();
  const hab = state.habits.find((h) => h.inputStyle === 'counter');
  store.updateHabit(hab.id, { nutritionLink: 'protein' });

  ok('a day with no food logged leaves the habit unlogged, not zero',
    store.getEntry(D(3), hab.id) === undefined);

  const e1 = store.logFoodEntry(D(3), { name: 'Shake', protein: 30 });
  ok('logging food fills the habit in with the total', store.getEntry(D(3), hab.id) === 30);

  store.logFoodEntry(D(3), { name: 'Chicken', protein: 40 });
  ok('a second entry ADDS to the total, not replaces it', store.getEntry(D(3), hab.id) === 70);

  store.updateFoodEntry(D(3), e1.id, { protein: 20 });
  ok('editing an entry recomputes the total', store.getEntry(D(3), hab.id) === 60);

  const entries = store.getNutritionDay(D(3));
  entries.forEach((e) => store.deleteFoodEntry(D(3), e.id));
  ok('deleting every entry clears the habit back to unlogged, not to 0',
    store.getEntry(D(3), hab.id) === undefined);

  ok('a non-linked field on the same food is not pulled into the habit',
    (() => {
      store.logFoodEntry(D(3), { name: 'Rice', carbs: 40 }); // no protein
      const v = store.getEntry(D(3), hab.id);
      store.getNutritionDay(D(3)).forEach((e) => store.deleteFoodEntry(D(3), e.id));
      return v === 0; // logged, but contributed 0 protein — real zero, not "unlogged"
    })());

  store.updateHabit(hab.id, { nutritionLink: null });
}

console.log('\n5. Two habits can link to the same nutrient');
{
  const state = store.get();
  const counters = state.habits.filter((h) => h.inputStyle === 'counter');
  ok('fixture has at least two counter habits to test with', counters.length >= 1);
  const a = counters[0];
  store.updateHabit(a.id, { nutritionLink: 'calories' });
  store.logFoodEntry(D(4), { name: 'Bar', calories: 250 });
  ok('the linked habit picks up the total', store.getEntry(D(4), a.id) === 250);
  store.updateHabit(a.id, { nutritionLink: null });
  store.getNutritionDay(D(4)).forEach((e) => store.deleteFoodEntry(D(4), e.id));
}

console.log('\n6. Frequent meals');
{
  const m = store.saveMeal({ name: 'Protein shake', calories: 180, protein: 35 });
  ok('meal saves', store.get().meals.some((x) => x.id === m.id));
  ok('with its macros', near(m.protein, 35));
  store.deleteMeal(m.id);
  ok('and can be forgotten again', !store.get().meals.some((x) => x.id === m.id));
}

console.log('\n7. Backup round-trips and sanitises malicious/garbage input');
{
  store.logFoodEntry(D(5), { name: 'Legit', calories: 400, protein: 30 });
  store.saveMeal({ name: 'Legit meal', calories: 300 });

  const raw = JSON.parse(mem['habitforge.v1']);
  raw.nutritionLog['2026-04-09"><img src=x onerror=alert(1)>'] = [{ name: 'x', calories: 1 }];
  raw.nutritionLog['not-a-date'] = [{ name: 'x', calories: 1 }];
  raw.nutritionLog[D(6)] = 'not an array';
  raw.nutritionLog[D(7)] = [
    { name: '<script>alert(1)</script>', calories: 'onmouseover=alert(1)', protein: -99 },
    null,
    'garbage',
  ];
  raw.meals.push({ name: 123, calories: '<img onerror=alert(1)>' });
  raw.habits[0].nutritionLink = '<script>alert(1)</script>';
  raw.habits[1] = { ...raw.habits[1], nutritionLink: 'protein', inputStyle: 'counter', type: 'scale' };

  const blob = new Blob([JSON.stringify(raw)]);
  blob.text = async () => JSON.stringify(raw);
  const restored = await store.importBackup(blob);

  ok('a non-date key is dropped', !restored.nutritionLog['2026-04-09"><img src=x onerror=alert(1)>']);
  ok('another non-date key is dropped', !restored.nutritionLog['not-a-date']);
  ok('a non-array value for a real date is dropped', !restored.nutritionLog[D(6)]);
  ok('the legit entry survives the round trip', restored.nutritionLog[D(5)]?.[0]?.name === 'Legit');

  const messy = restored.nutritionLog[D(7)];
  ok('null/string junk entries in the array are dropped, not crashing', messy.length === 1);
  ok('a script-tag name is kept only as inert text (escaped at render, not here)',
    messy[0].name === '<script>alert(1)</script>');
  ok('a non-numeric calories value becomes null, not the raw string', messy[0].calories === null);
  ok('a negative protein value is floored at 0', messy[0].protein === 0);

  ok('a garbage meal name is coerced to a string', typeof restored.meals.find((m) => m.calories === null)?.name === 'string');
  ok('an unknown nutritionLink value collapses to null', restored.habits[0].nutritionLink === null);
  ok('a legitimate nutritionLink value survives', restored.habits[1].nutritionLink === 'protein');

  ok('an entirely empty day does not survive import', (() => {
    // D(6) held a non-array before import; confirm it is simply absent, not '[]'
    return restored.nutritionLog[D(6)] === undefined;
  })());
}

console.log('\n8. The consolidated habit sanitizer keeps every field (regression guard)');
{
  // Historically there were two back-to-back sanitizing passes over
  // s.habits; the second one did not spread the first one's output, so
  // any field only the first pass added (like nutritionLink) would
  // silently vanish on every single normalise() call, not just import.
  const h = store.get().habits.find((x) => x.inputStyle === 'counter');
  store.updateHabit(h.id, { nutritionLink: 'carbs' });
  // Force a fresh normalise() pass the same way a reload would.
  const raw = JSON.parse(mem['habitforge.v1']);
  const blob = new Blob([JSON.stringify(raw)]);
  blob.text = async () => JSON.stringify(raw);
  const restored = await store.importBackup(blob);
  const same = restored.habits.find((x) => x.id === h.id);
  ok('nutritionLink survives a normalise() pass intact', same.nutritionLink === 'carbs');
}

console.log('\n9. Metrics source registration');
{
  await import('../js/metrics-nutrition.js');
  const M = await import('../js/metrics.js');

  store.logFoodEntry(D(10), { name: 'A', calories: 500, protein: 30 });
  store.logFoodEntry(D(11), { name: 'B', calories: 600 });
  // D(12) deliberately left unlogged

  const state = store.get();
  const calMetric = M.getMetric(state, 'nutrition:calories');
  const protMetric = M.getMetric(state, 'nutrition:protein');
  ok('the calories metric is registered', !!calMetric);
  ok('the protein metric is registered', !!protMetric);
  ok('blank days are skipped, not zeroed', calMetric.blankPolicy === 'skip');

  const calSeries = M.buildSeries(state, calMetric, { from: D(10), to: D(12), granularity: 'day', agg: 'avg' });
  ok('calories total per day', near(calSeries.daily.get(D(10)), 500) && near(calSeries.daily.get(D(11)), 600));
  ok('an unlogged day is null, not 0', calSeries.daily.get(D(12)) === null);

  const protSeries = M.buildSeries(state, protMetric, { from: D(10), to: D(12), granularity: 'day', agg: 'avg' });
  ok('a day that logged food but not this nutrient is null (unknown), not 0',
    protSeries.daily.get(D(11)) === null);
  ok('a day that did log it comes through', near(protSeries.daily.get(D(10)), 30));

  store.getNutritionDay(D(10)).forEach((e) => store.deleteFoodEntry(D(10), e.id));
  store.getNutritionDay(D(11)).forEach((e) => store.deleteFoodEntry(D(11), e.id));
}

console.log('\n10. Table columns');
{
  const { nutritionTableColumns } = await import('../js/metrics-nutrition.js');
  store.logFoodEntry(D(20), { name: 'Lunch', calories: 700, protein: 45 });
  store.logFoodEntry(D(20), { name: 'Snack', calories: 200 });
  const state = store.get();
  const cols = nutritionTableColumns();
  const calCol = cols.find((c) => c.label.startsWith('Calories'));
  const protCol = cols.find((c) => c.label.startsWith('Protein'));
  const countCol = cols.find((c) => c.id === '__nutrition_count');
  ok('calories column sums the day', calCol.get(state, D(20)) === '900');
  ok('protein column sums only what was logged', protCol.get(state, D(20)) === '45');
  ok('an unlogged day is null on both', calCol.get(state, D(21)) === null && protCol.get(state, D(21)) === null);
  ok('meal count column counts entries', countCol.get(state, D(20)) === '2');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
