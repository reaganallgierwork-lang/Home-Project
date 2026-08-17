/* Covers the workout data model — above all, that work performed in ANY block
   type rolls up to the same exercise history, which is the whole point. */

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const near = (a, b, eps = 0.01) => a !== null && Math.abs(a - b) < eps;

const W = await import('../js/workouts.js');
const { DEFAULTS } = await import('../js/config.js');

const BENCH = 'ex-bench';
const ROW = 'ex-row';
const THRUSTER = 'ex-thruster';
const PULLUP = 'ex-pullup';
const HOLLOW = 'ex-hollow';
const CUSTOM_REPS = 'ex-custom-reps';

const exercises = [
  { id: BENCH, name: 'Bench Press', category: 'Barbell', track: 'weight_reps', archived: false },
  { id: ROW, name: 'Barbell Row', category: 'Barbell', track: 'weight_reps', archived: false },
  { id: THRUSTER, name: 'Thruster', category: 'Olympic', track: 'weight_reps', archived: false },
  { id: PULLUP, name: 'Pull-up', category: 'Bodyweight', track: 'reps', archived: false },
  { id: HOLLOW, name: 'Hollow Hold', category: 'Bodyweight', track: 'time', archived: false },
  { id: CUSTOM_REPS, name: 'Some Machine Thing', category: 'Machine', track: 'reps', archived: false },
];

function stateWith(sessions, bodyLog = {}) {
  return {
    settings: { ...DEFAULTS }, habits: [], log: {}, seen: [], ui: {}, exercises, templates: [], sessions, bodyLog,
  };
}
const session = (day, blocks) => ({ id: `s-${day}`, day, name: 'W', blocks, finishedAt: 1 });

/* Block-level tests below don't care about bodyweight, so they share one
   plain state with no weigh-ins logged — bodyWeightAsOf() then returns null
   and weight is left exactly as entered, same as before this feature. */
const S = stateWith([]);
const DAY = '2026-03-15';

console.log('\n1. Straight sets');
{
  const b = W.makeBlock('straight', {
    exerciseId: BENCH,
    sets: [
      W.makeSet({ weight: 135, reps: 10, done: true }),
      W.makeSet({ weight: 155, reps: 8, done: true }),
      W.makeSet({ weight: 175, reps: 5, done: true }),
      W.makeSet({ weight: 185, reps: 3, done: false }),   // not performed
    ],
  });
  const recs = W.blockRecords(S, b, DAY);
  ok('only ticked sets are recorded', recs.length === 3);
  ok('weights and reps come through', recs[1].weight === 155 && recs[1].reps === 8);
  ok('they are tagged as deliberate sets', recs.every((r) => r.kind === 'set'));
  ok('volume is weight x reps', near(recs.reduce((a, r) => a + W.recordVolume(r), 0), 135 * 10 + 155 * 8 + 175 * 5));
}

console.log('\n2. Equal-sets helper (the "same every set" path)');
{
  const sets = W.fillEqualSets(5, { weight: 225, reps: 5 });
  ok('produces the right count', sets.length === 5);
  ok('every set carries the same load', sets.every((s) => s.weight === 225 && s.reps === 5));
  ok('and none are pre-ticked', sets.every((s) => !s.done));
}

console.log('\n3. Supersets credit every exercise in them');
{
  const b = W.makeBlock('superset', {
    rounds: 3,
    items: [
      { exerciseId: BENCH, sets: W.fillEqualSets(3, { weight: 135, reps: 10, done: true }) },
      { exerciseId: ROW, sets: W.fillEqualSets(3, { weight: 115, reps: 10, done: true }) },
    ],
  });
  const recs = W.blockRecords(S, b, DAY);
  ok('all rounds of both exercises are recorded', recs.length === 6);
  ok('bench gets its three sets', recs.filter((r) => r.exerciseId === BENCH).length === 3);
  ok('row gets its three', recs.filter((r) => r.exerciseId === ROW).length === 3);
  ok('superset work counts as deliberate sets', recs.every((r) => r.kind === 'set'));
}

console.log('\n4. AMRAP — rounds plus the partial round');
{
  const b = W.makeBlock('amrap', {
    minutes: 12,
    movements: [
      W.makeMovement({ exerciseId: THRUSTER, reps: 9, weight: 95 }),
      W.makeMovement({ exerciseId: PULLUP, reps: 12 }),
    ],
  });
  b.result = { rounds: 5, extraReps: 0 };
  let recs = W.blockRecords(S, b, DAY);
  ok('five full rounds means 5 x 9 thrusters', recs.find((r) => r.exerciseId === THRUSTER).reps === 45);
  ok('and 5 x 12 pull-ups', recs.find((r) => r.exerciseId === PULLUP).reps === 60);
  ok('metcon reps are tagged as such', recs.every((r) => r.kind === 'metcon'));
  ok('the prescribed weight is carried through', recs.find((r) => r.exerciseId === THRUSTER).weight === 95);

  /* A partial round spends its reps in order: 9 thrusters first, then pull-ups. */
  b.result = { rounds: 5, extraReps: 14 };
  recs = W.blockRecords(S, b, DAY);
  const th = recs.filter((r) => r.exerciseId === THRUSTER).reduce((a, r) => a + r.reps, 0);
  const pu = recs.filter((r) => r.exerciseId === PULLUP).reduce((a, r) => a + r.reps, 0);
  ok('the partial round fills the first movement first', th === 45 + 9, `thrusters ${th}`);
  ok('then spills into the next', pu === 60 + 5, `pull-ups ${pu}`);

  b.result = { rounds: null, extraReps: null };
  ok('an unlogged AMRAP records nothing', W.blockRecords(S, b, DAY).length === 0);
}

console.log('\n5. Rounds for time — credit what was actually finished');
{
  const b = W.makeBlock('rft', {
    rounds: 5,
    capMinutes: 20,
    movements: [W.makeMovement({ exerciseId: THRUSTER, reps: 10, weight: 95 })],
  });
  b.result = { seconds: 743, roundsDone: 5, capped: false };
  ok('finishing all rounds credits them all', W.blockRecords(S, b, DAY)[0].reps === 50);

  b.result = { seconds: 1200, roundsDone: 3, capped: true };
  ok('capping out credits only the rounds completed', W.blockRecords(S, b, DAY)[0].reps === 30);

  b.result = { seconds: 700, roundsDone: null, capped: false };
  ok('a time with no round count assumes the workout was completed', W.blockRecords(S, b, DAY)[0].reps === 50);
}

console.log('\n6. EMOM — minutes split across the movements');
{
  const b = W.makeBlock('emom', {
    minutes: 10,
    movements: [
      W.makeMovement({ exerciseId: THRUSTER, reps: 5, weight: 95 }),
      W.makeMovement({ exerciseId: PULLUP, reps: 8 }),
    ],
  });
  b.result = { minutesDone: 10 };
  const recs = W.blockRecords(S, b, DAY);
  ok('ten minutes alternating gives each five turns',
    recs.find((r) => r.exerciseId === THRUSTER).reps === 25 && recs.find((r) => r.exerciseId === PULLUP).reps === 40);

  b.result = { minutesDone: 9 };
  const odd = W.blockRecords(S, b, DAY);
  ok('an odd count gives the extra minute to the first movement',
    odd.find((r) => r.exerciseId === THRUSTER).reps === 25 && odd.find((r) => r.exerciseId === PULLUP).reps === 32);
}

console.log('\n7. THE POINT: one exercise, many formats, one history');
{
  const s = stateWith([
    session('2026-03-01', [W.makeBlock('straight', {
      exerciseId: BENCH,
      sets: [W.makeSet({ weight: 185, reps: 5, done: true })],
    })]),
    session('2026-03-05', [W.makeBlock('superset', {
      rounds: 2,
      items: [{ exerciseId: BENCH, sets: W.fillEqualSets(2, { weight: 155, reps: 10, done: true }) }],
    })]),
    session('2026-03-09', [(() => {
      const b = W.makeBlock('amrap', {
        minutes: 10,
        movements: [W.makeMovement({ exerciseId: BENCH, reps: 10, weight: 95 })],
      });
      b.result = { rounds: 6, extraReps: 0 };
      return b;
    })()]),
  ]);

  const recs = W.allRecords(s).filter((r) => r.exerciseId === BENCH);
  ok('bench work from all three formats lands in one pile', recs.length === 4, `got ${recs.length}`);
  ok('spanning all three days', new Set(recs.map((r) => r.day)).size === 3);

  const pb = W.personalBests(s, BENCH);
  ok('the heaviest set is found across formats', pb.heaviest.weight === 185);
  ok('total volume adds every format together',
    near(pb.totalVolume, 185 * 5 + 155 * 10 * 2 + 95 * 60));
  ok('session count is by distinct day', pb.sessions === 3);
}

console.log('\n8. Estimated 1RM stays honest');
{
  ok('a single is itself', near(W.estimated1RM(225, 1), 225));
  ok('Epley on 5 reps', near(W.estimated1RM(185, 5), 185 * (1 + 5 / 30)));
  ok('beyond 12 reps it declines to guess', W.estimated1RM(95, 30) === null);
  ok('no weight means no estimate', W.estimated1RM(0, 5) === null);

  /* A high-rep metcon must never masquerade as a max attempt. */
  const s = stateWith([
    session('2026-03-01', [(() => {
      const b = W.makeBlock('amrap', {
        minutes: 20,
        movements: [W.makeMovement({ exerciseId: BENCH, reps: 10, weight: 95 })],
      });
      b.result = { rounds: 10, extraReps: 0 };
      return b;
    })()]),
  ]);
  ok('an AMRAP alone produces no estimated max', W.personalBests(s, BENCH).best1RM === null);

  const s2 = stateWith([
    session('2026-03-01', [W.makeBlock('straight', {
      exerciseId: BENCH, sets: [W.makeSet({ weight: 200, reps: 3, done: true })],
    })]),
  ]);
  ok('but a deliberate set does', near(s2 && W.personalBests(s2, BENCH).best1RM.value, 200 * (1 + 3 / 30)));
}

console.log('\n9. Starting a workout from a saved one');
{
  const tpl = {
    id: 't1',
    name: 'Push Day',
    blocks: [W.makeBlock('straight', {
      exerciseId: BENCH,
      sets: W.fillEqualSets(3, { weight: 135, reps: 10, done: true }),
    })],
  };
  const s = W.sessionFromTemplate(tpl, '2026-04-01');
  ok('the plan is copied, not shared', s.blocks[0] !== tpl.blocks[0]);
  ok('with a fresh id', s.blocks[0].id !== tpl.blocks[0].id);
  ok('nothing starts ticked', s.blocks[0].sets.every((x) => !x.done));
  ok('but the prescribed numbers carry over', s.blocks[0].sets[0].weight === 135);

  s.blocks[0].sets[0].weight = 999;
  ok('editing the session never reaches back into the template', tpl.blocks[0].sets[0].weight === 135);

  const back = W.templateFromSession(s);
  ok('and a session can be saved back out as a workout', back.blocks.length === 1 && back.id !== tpl.id);
}

console.log('\n10. Formatting and parsing');
{
  ok('durations render as m:ss', W.fmtDuration(743) === '12:23');
  ok('and parse back', W.parseDuration('12:23') === 743);
  ok('a bare number is read as minutes', W.parseDuration('12') === 720);
  ok('blank parses to nothing', W.parseDuration('') === null);
  ok('weights render with the unit', W.fmtWeight(135, 'kg') === '135 kg');

  const s = stateWith([]);
  const b = W.makeBlock('straight', { exerciseId: BENCH, sets: W.fillEqualSets(5, { weight: 135, reps: 8 }) });
  ok('equal sets summarise compactly', W.describeBlock(s, b, 'lb') === '5 × 8 @ 135 lb', W.describeBlock(s, b, 'lb'));
  b.sets[0].reps = 12;
  ok('mixed sets list their reps', W.describeBlock(s, b, 'lb').includes('12/8/8/8/8'));
}

console.log('\n11. Malformed data cannot crash the roll-up');
{
  const s = stateWith([
    session('2026-03-01', [{ id: 'x', type: 'straight', exerciseId: null, sets: [W.makeSet({ reps: 5, done: true })] }]),
    session('2026-03-02', [{ id: 'y', type: 'unknown-future-type', sets: [] }]),
    session('2026-03-03', [W.makeBlock('amrap', { movements: [], minutes: 10 })]),
  ]);
  let recs = null;
  try { recs = W.allRecords(s); } catch { /* caught below */ }
  ok('a block with no exercise is skipped rather than throwing', Array.isArray(recs));
  ok('and contributes nothing', recs.length === 0);
}

console.log('\n12. Bodyweight-loaded exercises are credited against your logged weight');
{
  ok('isBodyweightLoaded is true for a reps-tracked Bodyweight exercise',
    W.isBodyweightLoaded(exercises.find((e) => e.id === PULLUP)));
  ok('but not for a time-tracked Bodyweight exercise', !W.isBodyweightLoaded(exercises.find((e) => e.id === HOLLOW)));
  ok('and not for a reps-tracked exercise outside the Bodyweight category',
    !W.isBodyweightLoaded(exercises.find((e) => e.id === CUSTOM_REPS)));
  ok('nor for nothing at all', !W.isBodyweightLoaded(null));

  const bodyLog = {
    '2026-03-01': { weight: 180, photo: null },
    '2026-03-10': { weight: 178, photo: null },
  };
  const bwState = stateWith([], bodyLog);

  ok('bodyWeightAsOf finds an exact match', W.bodyWeightAsOf(bwState, '2026-03-10') === 178);
  ok('or falls back to the most recent earlier weigh-in', W.bodyWeightAsOf(bwState, '2026-03-15') === 178);
  ok('and is null before any weigh-in exists', W.bodyWeightAsOf(bwState, '2026-02-28') === null);

  /* A blank weight on a straight set of pull-ups is worth your bodyweight
     that day — not zero. */
  const plainState = stateWith([
    session('2026-03-10', [W.makeBlock('straight', {
      exerciseId: PULLUP,
      sets: [W.makeSet({ weight: null, reps: 8, done: true })],
    })]),
  ], bodyLog);
  const plain = W.allRecords(plainState).find((r) => r.exerciseId === PULLUP);
  ok(`an unweighted pull-up is credited at that day's bodyweight`, plain.weight === 178, `got ${plain.weight}`);

  /* Entered weight is supplemental, not the total — a weighted pull-up. */
  const weightedState = stateWith([
    session('2026-03-10', [W.makeBlock('straight', {
      exerciseId: PULLUP,
      sets: [W.makeSet({ weight: 25, reps: 5, done: true })],
    })]),
  ], bodyLog);
  const weighted = W.allRecords(weightedState).find((r) => r.exerciseId === PULLUP);
  ok('added weight stacks on top of bodyweight', weighted.weight === 178 + 25, `got ${weighted.weight}`);

  /* A day with no weigh-in yet, and none before it: no bodyweight to add. */
  const earlyState = stateWith([
    session('2026-02-01', [W.makeBlock('straight', {
      exerciseId: PULLUP,
      sets: [W.makeSet({ weight: null, reps: 6, done: true })],
    })]),
  ], bodyLog);
  const early = W.allRecords(earlyState).find((r) => r.exerciseId === PULLUP);
  ok('with no weigh-in yet to borrow from, weight stays exactly what was entered',
    early.weight === 0, `got ${early.weight}`);

  /* Falls back to the most recent PRIOR weigh-in, not just the exact day. */
  const betweenState = stateWith([
    session('2026-03-05', [W.makeBlock('straight', {
      exerciseId: PULLUP,
      sets: [W.makeSet({ weight: null, reps: 10, done: true })],
    })]),
  ], bodyLog);
  const between = W.allRecords(betweenState).find((r) => r.exerciseId === PULLUP);
  ok('a day between weigh-ins uses the most recent one before it',
    between.weight === 180, `got ${between.weight}`);

  /* This flows all the way through to personal bests, volume, and 1RM. */
  const pb = W.personalBests(weightedState, PULLUP);
  ok('personal bests now find a heaviest set for a bodyweight movement', pb.heaviest.weight === 203);
  ok('and an estimated 1RM', near(pb.best1RM.value, 203 * (1 + 5 / 30)));

  /* Non-bodyweight exercises are entirely unaffected. */
  const benchState = stateWith([
    session('2026-03-10', [W.makeBlock('straight', {
      exerciseId: BENCH,
      sets: [W.makeSet({ weight: 185, reps: 5, done: true })],
    })]),
  ], bodyLog);
  const benchRec = W.allRecords(benchState).find((r) => r.exerciseId === BENCH);
  ok('a barbell lift never picks up bodyweight', benchRec.weight === 185);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
