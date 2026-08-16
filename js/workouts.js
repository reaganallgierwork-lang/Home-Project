/* ============================================================================
   WORKOUTS — the data model and all the maths. No screen code lives here.
   ----------------------------------------------------------------------------
   THE CENTRAL IDEA
   ----------------------------------------------------------------------------
   A workout is an ordered list of BLOCKS. A block is one of five shapes:

     straight   one exercise, a list of sets            5 × 8 @ 135 lb
     superset   several exercises, N rounds through     3 rounds: bench + row
     amrap      as many rounds as possible in a time    12 min AMRAP
     rft        N rounds for time, with a cap           5 rounds for time
     emom       every minute on the minute              10 min EMOM

   Those look very different on screen, but every one of them ultimately means
   "this exercise was performed for these reps at this weight". So whatever the
   block, it renders down to the same flat SET RECORD:

       { day, exerciseId, weight, reps, kind }

   That single normalisation is what makes long-term tracking work: bench press
   done as straight sets, inside a superset, or as part of a 12-minute AMRAP
   all land in the same pile, so "how has my bench moved over three years"
   has one honest answer rather than one answer per workout format.

   Adding a sixth block type means adding a factory below and a case in
   blockRecords(). Everything downstream — history, charts, personal bests —
   keeps working untouched.
   ========================================================================== */

import { newId } from './ids.js';

/* ---------------------------------------------------------------- library - */

/* How an exercise is measured. Most are weight+reps; the others exist so the
   app doesn't force a barbell mental model onto a plank or a run. */
export const TRACK_MODES = {
  weight_reps: { label: 'Weight & reps', fields: ['weight', 'reps'] },
  reps: { label: 'Reps only', fields: ['reps'] },
  time: { label: 'Time', fields: ['seconds'] },
  distance: { label: 'Distance', fields: ['distance'] },
};

export const CATEGORIES = ['Barbell', 'Dumbbell', 'Machine', 'Bodyweight', 'Cardio', 'Olympic', 'Other'];

/* A starter library so the first workout doesn't begin with typing. Everything
   here is editable and you can add your own; nothing is special-cased. */
export const DEFAULT_EXERCISES = [
  ['Back Squat', 'Barbell', 'weight_reps'],
  ['Front Squat', 'Barbell', 'weight_reps'],
  ['Bench Press', 'Barbell', 'weight_reps'],
  ['Incline Bench Press', 'Barbell', 'weight_reps'],
  ['Overhead Press', 'Barbell', 'weight_reps'],
  ['Deadlift', 'Barbell', 'weight_reps'],
  ['Romanian Deadlift', 'Barbell', 'weight_reps'],
  ['Barbell Row', 'Barbell', 'weight_reps'],
  ['Hip Thrust', 'Barbell', 'weight_reps'],
  ['Clean', 'Olympic', 'weight_reps'],
  ['Clean & Jerk', 'Olympic', 'weight_reps'],
  ['Snatch', 'Olympic', 'weight_reps'],
  ['Thruster', 'Olympic', 'weight_reps'],
  ['Dumbbell Bench Press', 'Dumbbell', 'weight_reps'],
  ['Dumbbell Row', 'Dumbbell', 'weight_reps'],
  ['Dumbbell Shoulder Press', 'Dumbbell', 'weight_reps'],
  ['Dumbbell Curl', 'Dumbbell', 'weight_reps'],
  ['Goblet Squat', 'Dumbbell', 'weight_reps'],
  ['Lat Pulldown', 'Machine', 'weight_reps'],
  ['Leg Press', 'Machine', 'weight_reps'],
  ['Leg Curl', 'Machine', 'weight_reps'],
  ['Cable Row', 'Machine', 'weight_reps'],
  ['Tricep Pushdown', 'Machine', 'weight_reps'],
  ['Pull-up', 'Bodyweight', 'reps'],
  ['Chin-up', 'Bodyweight', 'reps'],
  ['Push-up', 'Bodyweight', 'reps'],
  ['Dip', 'Bodyweight', 'reps'],
  ['Burpee', 'Bodyweight', 'reps'],
  ['Air Squat', 'Bodyweight', 'reps'],
  ['Sit-up', 'Bodyweight', 'reps'],
  ['Box Jump', 'Bodyweight', 'reps'],
  ['Wall Ball', 'Bodyweight', 'weight_reps'],
  ['Kettlebell Swing', 'Bodyweight', 'weight_reps'],
  ['Double-Under', 'Bodyweight', 'reps'],
  ['Plank', 'Bodyweight', 'time'],
  ['Hollow Hold', 'Bodyweight', 'time'],
  ['Run', 'Cardio', 'distance'],
  ['Row', 'Cardio', 'distance'],
  ['Bike', 'Cardio', 'distance'],
  ['Assault Bike', 'Cardio', 'time'],
  /* The McGill Big Three, since they're already tracked as a habit. */
  ['McGill Curl-up', 'Bodyweight', 'reps'],
  ['Side Plank', 'Bodyweight', 'time'],
  ['Bird Dog', 'Bodyweight', 'reps'],
];

export function buildDefaultExercises() {
  return DEFAULT_EXERCISES.map(([name, category, track]) => ({
    id: newId(), name, category, track, archived: false,
  }));
}

export function exerciseById(state, id) {
  return (state.exercises || []).find((e) => e.id === id) || null;
}

export function exerciseName(state, id) {
  return exerciseById(state, id)?.name || 'Unknown exercise';
}

/* ----------------------------------------------------------- block shapes - */

export const BLOCK_TYPES = [
  {
    type: 'straight',
    label: 'Straight sets',
    icon: 'layers',
    blurb: 'One exercise for a number of sets. The everyday choice.',
  },
  {
    type: 'superset',
    label: 'Superset',
    icon: 'link',
    blurb: 'Two or more exercises back to back, for a number of rounds.',
  },
  {
    type: 'amrap',
    label: 'AMRAP',
    icon: 'timer',
    blurb: 'As many rounds as possible inside a time cap.',
  },
  {
    type: 'rft',
    label: 'Rounds for time',
    icon: 'flag',
    blurb: 'A set number of rounds, raced against the clock.',
  },
  {
    type: 'emom',
    label: 'EMOM',
    icon: 'clock',
    blurb: 'Every minute on the minute, for a number of minutes.',
  },
];

export function blockTypeInfo(type) {
  return BLOCK_TYPES.find((b) => b.type === type) || BLOCK_TYPES[0];
}

/** One set inside a straight-sets or superset block. */
export function makeSet(over = {}) {
  return {
    weight: over.weight ?? null,
    reps: over.reps ?? null,
    seconds: over.seconds ?? null,
    distance: over.distance ?? null,
    done: !!over.done,
  };
}

/** A movement line inside a metcon (AMRAP / RFT / EMOM). */
export function makeMovement(over = {}) {
  return {
    exerciseId: over.exerciseId || null,
    reps: over.reps ?? null,
    weight: over.weight ?? null,
    seconds: over.seconds ?? null,
    distance: over.distance ?? null,
  };
}

export function makeBlock(type, over = {}) {
  const base = { id: newId(), type, name: over.name || '', note: '' };
  if (type === 'superset') {
    return {
      ...base,
      rounds: over.rounds ?? 3,
      items: over.items || [],   // [{exerciseId, sets:[makeSet()]}]
    };
  }
  if (type === 'amrap') {
    return {
      ...base,
      minutes: over.minutes ?? 12,
      movements: over.movements || [],
      result: { rounds: null, extraReps: null },
    };
  }
  if (type === 'rft') {
    return {
      ...base,
      rounds: over.rounds ?? 5,
      capMinutes: over.capMinutes ?? 20,
      movements: over.movements || [],
      result: { seconds: null, roundsDone: null, capped: false },
    };
  }
  if (type === 'emom') {
    return {
      ...base,
      minutes: over.minutes ?? 10,
      movements: over.movements || [],
      result: { minutesDone: null },
    };
  }
  return {
    ...base,
    type: 'straight',
    exerciseId: over.exerciseId || null,
    sets: over.sets || [makeSet()],
  };
}

/** Fill a straight block with N identical sets — the "same every set" path. */
export function fillEqualSets(count, template) {
  return Array.from({ length: Math.max(1, count) }, () => makeSet(template));
}

/* --------------------------------------------------- turning blocks to work -

   Every block type collapses to the same flat list of performed sets. This is
   the one function the whole history layer depends on.

   `kind` records HOW the work happened, because it matters for interpretation:
     'set'     deliberate strength work — meaningful for a heaviest set or 1RM
     'metcon'  reps inside a timed piece — real work and real volume, but a
               95 lb thruster in minute 11 of an AMRAP is not a 1RM attempt,
               so estimated-max metrics ignore these.
   ------------------------------------------------------------------------- */

export function blockRecords(block) {
  const out = [];
  const push = (exerciseId, weight, reps, kind, extra = {}) => {
    if (!exerciseId) return;
    const r = Number(reps) || 0;
    const w = Number(weight) || 0;
    const secs = Number(extra.seconds) || 0;
    const dist = Number(extra.distance) || 0;
    /* Nothing performed means nothing to record. */
    if (!r && !secs && !dist) return;
    out.push({ exerciseId, weight: w, reps: r, seconds: secs, distance: dist, kind });
  };

  if (block.type === 'straight') {
    block.sets.forEach((s) => {
      if (!s.done) return;
      push(block.exerciseId, s.weight, s.reps, 'set', s);
    });
    return out;
  }

  if (block.type === 'superset') {
    block.items.forEach((item) => {
      (item.sets || []).forEach((s) => {
        if (!s.done) return;
        push(item.exerciseId, s.weight, s.reps, 'set', s);
      });
    });
    return out;
  }

  if (block.type === 'amrap') {
    const rounds = Number(block.result?.rounds) || 0;
    const extra = Number(block.result?.extraReps) || 0;
    block.movements.forEach((m) => {
      if (rounds > 0) push(m.exerciseId, m.weight, (Number(m.reps) || 0) * rounds, 'metcon', m);
    });
    /* The partial round: reps are consumed in order until they run out. */
    let left = extra;
    block.movements.forEach((m) => {
      if (left <= 0) return;
      const take = Math.min(left, Number(m.reps) || 0);
      if (take > 0) push(m.exerciseId, m.weight, take, 'metcon', {});
      left -= take;
    });
    return out;
  }

  if (block.type === 'rft') {
    /* Credit the rounds actually finished — which may be fewer than planned
       if the time cap hit first. */
    const done = block.result?.roundsDone ?? (block.result?.seconds ? block.rounds : 0);
    block.movements.forEach((m) => {
      if (done > 0) push(m.exerciseId, m.weight, (Number(m.reps) || 0) * done, 'metcon', m);
    });
    return out;
  }

  if (block.type === 'emom') {
    const mins = Number(block.result?.minutesDone) || 0;
    if (!mins) return out;
    /* Movements alternate minute by minute, so each gets its share. */
    block.movements.forEach((m, i) => {
      const times = Math.floor(mins / block.movements.length)
        + (i < mins % block.movements.length ? 1 : 0);
      if (times > 0) push(m.exerciseId, m.weight, (Number(m.reps) || 0) * times, 'metcon', m);
    });
    return out;
  }

  return out;
}

/** Every performed set in a session, stamped with its day. */
export function sessionRecords(session) {
  const out = [];
  (session.blocks || []).forEach((b) => {
    blockRecords(b).forEach((r) => out.push({ ...r, day: session.day, sessionId: session.id }));
  });
  return out;
}

/** Every performed set, ever. The backbone of all workout metrics. */
export function allRecords(state) {
  const out = [];
  (state.sessions || []).forEach((s) => sessionRecords(s).forEach((r) => out.push(r)));
  return out;
}

/* ------------------------------------------------------------------ maths - */

/** Epley. Reliable up to about 12 reps; beyond that it flatters badly. */
export const EST_1RM_REP_LIMIT = 12;

export function estimated1RM(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (!w || !r || r > EST_1RM_REP_LIMIT) return null;
  if (r === 1) return w;
  return w * (1 + r / 30);
}

export function recordVolume(rec) {
  return (Number(rec.weight) || 0) * (Number(rec.reps) || 0);
}

export function sessionVolume(session) {
  return sessionRecords(session).reduce((a, r) => a + recordVolume(r), 0);
}

export function sessionSetCount(session) {
  return sessionRecords(session).length;
}

/* ------------------------------------------------------------- formatting - */

export function fmtWeight(w, unit = 'lb') {
  if (!Number.isFinite(w) || w === 0) return '';
  return `${Math.round(w * 10) / 10} ${unit}`;
}

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function parseDuration(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    return (Number(m) || 0) * 60 + (Number(s) || 0);
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 60) : null;
}

/** A one-line human summary of a block, for the workout list. */
export function describeBlock(state, block, unit = 'lb') {
  const name = (id) => exerciseName(state, id);

  if (block.type === 'straight') {
    const sets = block.sets || [];
    if (!sets.length) return name(block.exerciseId);
    const allSame = sets.every((s) => s.weight === sets[0].weight && s.reps === sets[0].reps);
    if (allSame) {
      const w = sets[0].weight ? ` @ ${fmtWeight(sets[0].weight, unit)}` : '';
      return `${sets.length} × ${sets[0].reps ?? '—'}${w}`;
    }
    return `${sets.length} sets · ${sets.map((s) => s.reps ?? '—').join('/')}`;
  }

  if (block.type === 'superset') {
    return `${block.rounds} rounds · ${block.items.map((i) => name(i.exerciseId)).join(' + ')}`;
  }

  if (block.type === 'amrap') {
    return `${block.minutes} min · ${block.movements.map((m) => `${m.reps ?? ''} ${name(m.exerciseId)}`.trim()).join(', ')}`;
  }

  if (block.type === 'rft') {
    return `${block.rounds} rounds · ${block.movements.map((m) => `${m.reps ?? ''} ${name(m.exerciseId)}`.trim()).join(', ')}`;
  }

  if (block.type === 'emom') {
    return `${block.minutes} min · ${block.movements.map((m) => `${m.reps ?? ''} ${name(m.exerciseId)}`.trim()).join(', ')}`;
  }

  return '';
}

/** The block's headline — its own name if given, else the exercise/type. */
export function blockTitle(state, block) {
  if (block.name) return block.name;
  if (block.type === 'straight') return exerciseName(state, block.exerciseId);
  if (block.type === 'superset') return 'Superset';
  return blockTypeInfo(block.type).label;
}

/* ------------------------------------------------------- templates→session -

   Starting a workout deep-copies the template so editing history can never
   reach back and rewrite the plan you started from.
   ------------------------------------------------------------------------- */

export function sessionFromTemplate(template, day) {
  const blocks = JSON.parse(JSON.stringify(template?.blocks || []));
  blocks.forEach((b) => {
    b.id = newId();
    /* A fresh session starts with nothing ticked and no results. */
    if (b.type === 'straight') (b.sets || []).forEach((s) => { s.done = false; });
    if (b.type === 'superset') (b.items || []).forEach((i) => (i.sets || []).forEach((s) => { s.done = false; }));
    if (b.type === 'amrap') b.result = { rounds: null, extraReps: null };
    if (b.type === 'rft') b.result = { seconds: null, roundsDone: null, capped: false };
    if (b.type === 'emom') b.result = { minutesDone: null };
  });
  return {
    id: newId(),
    day,
    name: template?.name || 'Workout',
    templateId: template?.id || null,
    blocks,
    note: '',
    startedAt: Date.now(),
    finishedAt: null,
  };
}

/** Save a finished session back out as a reusable template. */
export function templateFromSession(session) {
  const blocks = JSON.parse(JSON.stringify(session.blocks || []));
  blocks.forEach((b) => { b.id = newId(); });
  return {
    id: newId(),
    name: session.name || 'Workout',
    blocks,
    createdAt: Date.now(),
  };
}

/* ------------------------------------------------------------ personal bests */

/**
 * The best single set ever recorded for an exercise, and the best estimated
 * max. Deliberately ignores metcon reps for the estimate — see blockRecords.
 */
export function personalBests(state, exerciseId) {
  const recs = allRecords(state).filter((r) => r.exerciseId === exerciseId);
  if (!recs.length) return null;

  let heaviest = null;
  let best1RM = null;
  let bestReps = null;
  recs.forEach((r) => {
    if (r.weight > 0 && (!heaviest || r.weight > heaviest.weight)) heaviest = r;
    if (!bestReps || r.reps > bestReps.reps) bestReps = r;
    if (r.kind === 'set') {
      const e = estimated1RM(r.weight, r.reps);
      if (e !== null && (!best1RM || e > best1RM.value)) best1RM = { value: e, rec: r };
    }
  });

  const days = [...new Set(recs.map((r) => r.day))];
  return {
    heaviest,
    best1RM,
    bestReps,
    totalSets: recs.length,
    totalVolume: recs.reduce((a, r) => a + recordVolume(r), 0),
    sessions: days.length,
    firstDay: days.sort()[0],
    lastDay: days.sort().slice(-1)[0],
  };
}
