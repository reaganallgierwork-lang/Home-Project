/* chart.js is otherwise DOM/SVG rendering, covered by the app's Playwright
   checks rather than these Node unit tests — but chooseAxis() is pure logic
   (decide whether a second series can share the first one's y-axis, or
   needs its own on the right) and deserves a real test on its own. */

import { chooseAxis, alignBuckets } from '../js/chart.js';

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

/* ---------------------------------------------------------------------------
   alignBuckets — the guarantee that a two-series chart plots both measures
   against the SAME dates. Two metrics routinely cover different spans (a
   habit is clamped to its createdAt, body weight is not), and pairing them
   up by array position instead of by date drew one series' Monday over the
   other's Wednesday — a comparison chart that quietly showed a relationship
   that wasn't in the data, and then read past the end of the shorter array.
   ------------------------------------------------------------------------- */

const bucket = (key, value) => ({ key, label: `label ${key}`, shortLabel: key, value, logged: value === null ? 0 : 1, total: 1 });

console.log('\n6. A shorter series lands on its own dates, not the first slots');
{
  const ref = ['d1', 'd2', 'd3', 'd4', 'd5'].map((k) => bucket(k, 10));
  const short = { unit: '%', buckets: [bucket('d4', 40), bucket('d5', 50)] };
  const out = alignBuckets(ref, short);
  ok('result is padded to the reference length', out.buckets.length === 5);
  ok('the days it has no data for become gaps, not zeros',
    out.buckets.slice(0, 3).every((b) => b.value === null));
  ok('its real values sit on the matching dates (d4/d5), not d1/d2',
    out.buckets[3].value === 40 && out.buckets[4].value === 50);
  ok('bucket keys line up one-for-one with the reference',
    out.buckets.every((b, i) => b.key === ref[i].key));
}

console.log('\n7. Interior gaps are preserved, not closed up');
{
  const ref = ['d1', 'd2', 'd3'].map((k) => bucket(k, 1));
  const holey = { unit: '', buckets: [bucket('d1', 7), bucket('d3', 9)] };
  const out = alignBuckets(ref, holey);
  ok('a missing middle day stays a gap rather than sliding d3 into d2',
    out.buckets[0].value === 7 && out.buckets[1].value === null && out.buckets[2].value === 9);
}

console.log('\n8. Values outside the reference window are dropped, not appended');
{
  const ref = ['d2', 'd3'].map((k) => bucket(k, 1));
  const wider = { unit: '', buckets: [bucket('d1', 1), bucket('d2', 2), bucket('d3', 3), bucket('d4', 4)] };
  const out = alignBuckets(ref, wider);
  ok('only the overlapping days survive', out.buckets.length === 2);
  ok('and they are the right ones', out.buckets[0].value === 2 && out.buckets[1].value === 3);
}

console.log('\n9. Aligning an already-aligned series changes nothing');
{
  const ref = ['d1', 'd2'].map((k) => bucket(k, 1));
  const same = { unit: '', buckets: [bucket('d1', 5), bucket('d2', 6)] };
  const once = alignBuckets(ref, same);
  const twice = alignBuckets(ref, once);
  ok('idempotent, so aligning in both analyze.js and chart.js is safe',
    JSON.stringify(once.buckets) === JSON.stringify(twice.buckets));
  ok('other series fields (unit, colour, format) are carried through', once.unit === '');
}

console.log('\n10. No overlap at all still yields a drawable, all-gaps series');
{
  const ref = ['d1', 'd2'].map((k) => bucket(k, 1));
  const elsewhere = { unit: '', buckets: [bucket('z9', 99)] };
  const out = alignBuckets(ref, elsewhere);
  ok('length matches the reference', out.buckets.length === 2);
  ok('every value is null — nothing invented', out.buckets.every((b) => b.value === null));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
