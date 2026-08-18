/* chart.js is otherwise DOM/SVG rendering, covered by the app's Playwright
   checks rather than these Node unit tests — but chooseAxis() is pure logic
   (decide whether a second series can share the first one's y-axis, or
   needs its own on the right) and deserves a real test on its own. */

import { chooseAxis } from '../js/chart.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

const series = (unit, values) => ({ unit, buckets: values.map((v) => ({ value: v })) });

console.log('\n1. No second series just uses the left axis');
{
  ok('null secondary -> left', chooseAxis(series('lb', [100, 110]), null) === 'left');
}

console.log('\n2. Same unit, close scale -> shared left axis');
{
  const a = series('g', [100, 120, 140]);
  const b = series('g', [90, 110, 130]);
  ok('protein vs carbs, both grams, similar range -> left', chooseAxis(a, b) === 'left');
}

console.log('\n3. Same unit, very different scale -> its own right axis');
{
  const a = series('cal', [2000, 2200]);
  const b = series('cal', [50, 80]); // e.g. a tiny snack-calories metric next to a full-day total
  ok('40x apart even in the same unit -> right', chooseAxis(a, b) === 'right');
}

console.log('\n4. Different units -> always its own right axis, regardless of scale');
{
  const a = series('lb', [180, 182]);
  const b = series('reps', [178, 181]); // numerically close, but not the same thing
  ok('close numbers, different units -> right, never treated as comparable', chooseAxis(a, b) === 'right');
}

console.log('\n5. Null/missing values in either series are ignored, not treated as 0');
{
  const a = series('g', [null, 100, null, 140]);
  const b = series('g', [null, null, 130, 90]);
  ok('nulls filtered out before comparing scale', chooseAxis(a, b) === 'left');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
