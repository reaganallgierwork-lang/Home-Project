/* Regression tests for the input-sanitising in store.js.

   The threat here is narrow but real: everything in this app is local and
   there is no server, no URL parameters and no other user — but "restore
   from backup" reads an arbitrary .json a file picker handed over, and that
   file's contents are rendered into the app's HTML. A backup someone else
   sent you is the one route hostile data has into this app, so these tests
   pin the rules that make that safe. */

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

/** Round-trip a crafted backup through the real import path. */
async function importRaw(obj) {
  const blob = new Blob([JSON.stringify(obj)]);
  blob.text = async () => JSON.stringify(obj);
  return store.importBackup(blob);
}
const baseBackup = (over = {}) => ({
  habits: [{ id: 'h1', name: 'Test', type: 'binary', weight: 10 }],
  log: {}, seen: [], ui: {}, exercises: [], templates: [], sessions: [],
  settings: {}, bodyLog: {}, ...over,
});

console.log('\n1. Progress photos: only real base64 image data URLs survive');
{
  /* The exact payload that used to break out of src="..." and run script:
     it passes a naive startsWith('data:image/') check. */
  const BREAKOUT = 'data:image/png," onerror="alert(1)" x="';
  const s = await importRaw(baseBackup({
    bodyLog: { '2026-03-01': { weight: 180, photo: BREAKOUT } },
  }));
  ok('a quote-breakout payload is rejected', s.bodyLog['2026-03-01'].photo === null);
  ok('but the legitimate weight beside it is kept', s.bodyLog['2026-03-01'].weight === 180);

  ok('a real jpeg data URL is accepted', store.isSafePhoto('data:image/jpeg;base64,/9j/4AAQSkZJRg=='));
  ok('png too', store.isSafePhoto('data:image/png;base64,iVBORw0KGgo='));

  ok('SVG is refused — it is the one image type that can carry script',
    !store.isSafePhoto('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='));
  ok('a non-base64 data URL is refused',
    !store.isSafePhoto('data:image/png,<script>alert(1)</script>'));
  ok('a javascript: URL is refused', !store.isSafePhoto('javascript:alert(1)'));
  ok('an http URL is refused — photos never come from the network',
    !store.isSafePhoto('https://evil.example/x.png'));
  ok('a non-string is refused', !store.isSafePhoto({ toString: () => 'data:image/png;base64,AA==' }));
  ok('no whitespace smuggling', !store.isSafePhoto('data:image/png;base64,AA== onerror=alert(1)'));
}

console.log('\n2. Body-log keys are dates, not markup');
{
  const s = await importRaw(baseBackup({
    bodyLog: {
      '2026-03-02': { weight: 175, photo: null },
      '"><img src=x onerror=alert(1)>': { weight: 170, photo: null },
    },
  }));
  ok('a legitimate date key survives', s.bodyLog['2026-03-02'].weight === 175);
  ok('a key that is not a date is dropped', !s.bodyLog['"><img src=x onerror=alert(1)>']);
}

console.log('\n3. Habit fields are coerced to their expected shapes');
{
  const s = await importRaw(baseBackup({
    habits: [{
      id: 'h1',
      name: 'Water',
      unit: '<img src=x onerror=alert(1)>',
      weight: '10" onmouseover="alert(1)',
      max: '150" autofocus onfocus="alert(1)',
      step: {},
      type: 'scale',
      inputStyle: 'counter',
    }],
  }));
  const h = s.habits[0];
  ok('a non-numeric weight falls back to a number', typeof h.weight === 'number');
  ok('a non-numeric max falls back to a number', typeof h.max === 'number');
  ok('a non-numeric step falls back to a number', typeof h.step === 'number');
  ok('the unit stays a string (escaped at render, not silently executed)', typeof h.unit === 'string');
  ok('an unknown type is forced to a known one', h.type === 'scale' || h.type === 'binary');
}

console.log('\n4. Prototype pollution via a crafted backup');
{
  /* Built via JSON.parse on purpose: an object literal's __proto__ key is a
     setter, but JSON.parse produces it as a real own property — which is the
     shape a hostile backup file would actually arrive in. */
  const polluting = JSON.parse(
    '{"habits":[{"id":"h1","name":"x","weight":10}],'
    + '"settings":{"__proto__":{"polluted":"yes"}},"bodyLog":{}}',
  );
  await importRaw(polluting);
  ok('Object.prototype is not polluted by settings merge', ({}).polluted === undefined);
  ok('and a plain object gains no stray keys', Object.keys({}).length === 0);
}

console.log('\n5. Garbage input degrades instead of crashing');
{
  let threw = false;
  try {
    await importRaw(baseBackup({ bodyLog: { '2026-03-03': null }, habits: [null, undefined] }));
  } catch { threw = true; }
  ok('null entries in the file do not throw', !threw);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
