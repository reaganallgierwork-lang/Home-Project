/* ============================================================================
   METRICS SOURCE: WORKOUTS
   ----------------------------------------------------------------------------
   Feeds training data into the Data tab. It follows the same contract as
   metrics-habits.js — see the top of metrics.js — so charts, ranges, buckets,
   trends, stat tiles and CSV export all work with no changes to that code.

   Every exercise you have actually performed gets its own group of metrics.
   Exercises you've never logged are left out, so the picker stays short and
   only fills up as you genuinely use things.

   Two deliberate choices worth knowing about:

   1. Work is counted no matter which block it came from. Bench press done as
      straight sets, inside a superset, or as reps in an AMRAP all count toward
      the same volume and rep totals. That's the whole point — otherwise your
      history would be split across workout formats.

   2. Estimated 1RM ignores metcon reps. A 95 lb thruster in minute 11 of an
      AMRAP is real work, but running it through a 1RM formula would invent a
      max you never tested. Only deliberate sets feed the estimate.
   ========================================================================== */

import { registerSource } from './metrics.js';
import { subscribe } from './store.js';
import {
  allRecords, estimated1RM, recordVolume, exerciseById,
  EST_1RM_REP_LIMIT, blockRecords,
} from './workouts.js';

/* Scanning every session on every metric call would be wasteful, so the flat
   record list is built once and reused until something is saved. Same
   invalidate-on-save approach as the habits source. */
let cache = { state: null, byExercise: null, byDay: null };

export function invalidateWorkoutCache() {
  cache = { state: null, byExercise: null, byDay: null };
}
subscribe(invalidateWorkoutCache);

function indexed(state) {
  if (cache.state === state && cache.byExercise) return cache;

  const recs = allRecords(state);
  const byExercise = new Map();
  const byDay = new Map();

  recs.forEach((r) => {
    if (!byExercise.has(r.exerciseId)) byExercise.set(r.exerciseId, new Map());
    const days = byExercise.get(r.exerciseId);
    if (!days.has(r.day)) days.set(r.day, []);
    days.get(r.day).push(r);

    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day).push(r);
  });

  cache = { state, byExercise, byDay };
  return cache;
}

/** Build a series function over one exercise's records, day by day. */
function overExercise(exerciseId, reduce) {
  return (state, days) => {
    const { byExercise } = indexed(state);
    const perDay = byExercise.get(exerciseId);
    const out = new Map();
    days.forEach((d) => {
      const recs = perDay?.get(d);
      out.set(d, recs && recs.length ? reduce(recs) : null);
    });
    return out;
  };
}

function overAllTraining(reduce) {
  return (state, days) => {
    const { byDay } = indexed(state);
    const out = new Map();
    days.forEach((d) => {
      const recs = byDay.get(d);
      out.set(d, recs && recs.length ? reduce(recs) : null);
    });
    return out;
  };
}

/* ------------------------------------------------------------ metcon results

   A named metcon repeated over time is its own progress story — "how has my
   Fran time moved" — so each distinct name gets a metric of its own.
   ---------------------------------------------------------------------------- */

function metconSeries(state, name, kind) {
  const out = new Map();
  (state.sessions || []).forEach((s) => {
    (s.blocks || []).forEach((b) => {
      if ((b.name || '').trim().toLowerCase() !== name.toLowerCase()) return;
      let v = null;
      if (kind === 'time' && b.type === 'rft') v = b.result?.seconds ?? null;
      if (kind === 'rounds' && b.type === 'amrap') {
        const r = b.result?.rounds;
        if (Number.isFinite(r)) {
          /* Express a partial round as a fraction, so 5 rounds + half the
             work reads as better than a flat 5 rather than identical. */
          const perRound = (b.movements || []).reduce((a, m) => a + (Number(m.reps) || 0), 0);
          const extra = Number(b.result?.extraReps) || 0;
          v = perRound > 0 ? r + extra / perRound : r;
        }
      }
      if (v !== null) {
        /* Best effort wins if the same piece was done twice in a day. */
        const prev = out.get(s.day);
        if (prev === undefined || prev === null) out.set(s.day, v);
        else out.set(s.day, kind === 'time' ? Math.min(prev, v) : Math.max(prev, v));
      }
    });
  });
  return out;
}

function namedMetcons(state) {
  const found = new Map();
  (state.sessions || []).forEach((s) => {
    (s.blocks || []).forEach((b) => {
      const n = (b.name || '').trim();
      if (!n) return;
      if (b.type === 'rft' && Number.isFinite(b.result?.seconds)) found.set(`${n}|time`, { name: n, kind: 'time' });
      if (b.type === 'amrap' && Number.isFinite(b.result?.rounds)) found.set(`${n}|rounds`, { name: n, kind: 'rounds' });
    });
  });
  return [...found.values()];
}

/* ------------------------------------------------------------------ source - */

registerSource({
  id: 'workouts',
  label: 'Training',
  icon: '🏋️',

  list(state) {
    const unit = state.settings?.weightUnit || 'lb';
    const metrics = [];

    /* ---- whole-training-day metrics ---- */
    metrics.push({
      id: 'train:volume',
      group: 'Training overall',
      groupIcon: '🏋️',
      label: 'Total volume',
      unit,
      defaultAgg: 'sum',
      aggOptions: ['sum', 'avg', 'max'],
      higherIsBetter: true,
      form: 'bar',
      /* A rest day is genuinely zero volume, not missing data. */
      blankPolicy: 'zero',
      series: overAllTraining((recs) => recs.reduce((a, r) => a + recordVolume(r), 0)),
    });

    metrics.push({
      id: 'train:sets',
      group: 'Training overall',
      groupIcon: '🏋️',
      label: 'Sets performed',
      unit: '',
      defaultAgg: 'sum',
      aggOptions: ['sum', 'avg', 'max'],
      higherIsBetter: true,
      form: 'bar',
      blankPolicy: 'zero',
      series: overAllTraining((recs) => recs.length),
    });

    metrics.push({
      id: 'train:sessions',
      group: 'Training overall',
      groupIcon: '🏋️',
      label: 'Days trained',
      unit: '%',
      scale: 100,
      defaultAgg: 'avg',
      aggOptions: ['avg', 'sum'],
      higherIsBetter: true,
      form: 'bar',
      blankPolicy: 'zero',
      series: overAllTraining(() => 1),
    });

    /* ---- one group per exercise you've actually done ---- */
    const { byExercise } = indexed(state);
    [...byExercise.keys()].forEach((exId) => {
      const ex = exerciseById(state, exId);
      if (!ex) return;
      const g = ex.name;
      const weighted = ex.track === 'weight_reps' || ex.track === 'reps';

      if (weighted) {
        metrics.push({
          id: `lift:${exId}:top`,
          group: g,
          groupIcon: '🏋️',
          label: 'Heaviest set',
          unit,
          defaultAgg: 'max',
          aggOptions: ['max', 'avg'],
          higherIsBetter: true,
          form: 'bar',
          /* A day you didn't do this lift is not a 0 lb lift — it's silence. */
          blankPolicy: 'skip',
          series: overExercise(exId, (recs) => Math.max(...recs.map((r) => r.weight))),
        });

        metrics.push({
          id: `lift:${exId}:e1rm`,
          group: g,
          groupIcon: '🏋️',
          label: `Estimated 1RM`,
          unit,
          defaultAgg: 'max',
          aggOptions: ['max', 'avg'],
          higherIsBetter: true,
          form: 'line',
          blankPolicy: 'skip',
          series: overExercise(exId, (recs) => {
            const est = recs
              .filter((r) => r.kind === 'set')
              .map((r) => estimated1RM(r.weight, r.reps))
              .filter((v) => v !== null);
            return est.length ? Math.max(...est) : null;
          }),
        });

        metrics.push({
          id: `lift:${exId}:volume`,
          group: g,
          groupIcon: '🏋️',
          label: 'Volume',
          unit,
          defaultAgg: 'sum',
          aggOptions: ['sum', 'avg', 'max'],
          higherIsBetter: true,
          form: 'bar',
          blankPolicy: 'zero',
          series: overExercise(exId, (recs) => recs.reduce((a, r) => a + recordVolume(r), 0)),
        });
      }

      metrics.push({
        id: `lift:${exId}:reps`,
        group: g,
        groupIcon: '🏋️',
        label: 'Total reps',
        unit: '',
        defaultAgg: 'sum',
        aggOptions: ['sum', 'avg', 'max'],
        higherIsBetter: true,
        form: 'bar',
        blankPolicy: 'zero',
        series: overExercise(exId, (recs) => recs.reduce((a, r) => a + (r.reps || 0), 0)),
      });

      if (ex.track === 'time') {
        metrics.push({
          id: `lift:${exId}:seconds`,
          group: g,
          groupIcon: '⏱️',
          label: 'Best hold',
          unit: 's',
          defaultAgg: 'max',
          aggOptions: ['max', 'avg', 'sum'],
          higherIsBetter: true,
          form: 'bar',
          blankPolicy: 'skip',
          series: overExercise(exId, (recs) => Math.max(...recs.map((r) => r.seconds || 0))),
        });
      }

      if (ex.track === 'distance') {
        metrics.push({
          id: `lift:${exId}:distance`,
          group: g,
          groupIcon: '📏',
          label: 'Distance',
          unit: 'm',
          defaultAgg: 'sum',
          aggOptions: ['sum', 'max', 'avg'],
          higherIsBetter: true,
          form: 'bar',
          blankPolicy: 'zero',
          series: overExercise(exId, (recs) => recs.reduce((a, r) => a + (r.distance || 0), 0)),
        });
      }
    });

    /* ---- named metcons: Fran time, Cindy rounds, and so on ---- */
    namedMetcons(state).forEach(({ name, kind }) => {
      metrics.push({
        id: `metcon:${name}:${kind}`,
        group: name,
        groupIcon: kind === 'time' ? '🏁' : '⏱️',
        label: kind === 'time' ? 'Finish time' : 'Rounds completed',
        unit: kind === 'time' ? 's' : 'rounds',
        precision: kind === 'time' ? 0 : 1,
        defaultAgg: kind === 'time' ? 'min' : 'max',
        aggOptions: kind === 'time' ? ['min', 'avg'] : ['max', 'avg'],
        /* Faster is better; more rounds is better. */
        higherIsBetter: kind !== 'time',
        form: 'bar',
        blankPolicy: 'skip',
        series: (state2, days) => {
          const s = metconSeries(state2, name, kind);
          const out = new Map();
          days.forEach((d) => out.set(d, s.has(d) ? s.get(d) : null));
          return out;
        },
      });
    });

    return metrics;
  },
});

/* ----------------------------------------------------------------------------
   Table columns for the Data tab's Table view.
   -------------------------------------------------------------------------- */
export function workoutTableColumns(state) {
  const unit = state.settings?.weightUnit || 'lb';
  return [
    {
      id: '__workout',
      label: 'Workout',
      icon: '🏋️',
      get: (s, day) => {
        const names = (s.sessions || []).filter((x) => x.day === day).map((x) => x.name);
        return names.length ? names.join(', ') : null;
      },
      raw: (s, day) => ((s.sessions || []).some((x) => x.day === day) ? 1 : null),
    },
    {
      id: '__volume',
      label: `Volume (${unit})`,
      icon: '📦',
      get: (s, day) => {
        const { byDay } = indexed(s);
        const recs = byDay.get(day);
        if (!recs || !recs.length) return null;
        return String(Math.round(recs.reduce((a, r) => a + recordVolume(r), 0)));
      },
      raw: (s, day) => {
        const { byDay } = indexed(s);
        const recs = byDay.get(day);
        return recs && recs.length ? recs.reduce((a, r) => a + recordVolume(r), 0) : null;
      },
    },
  ];
}

export { EST_1RM_REP_LIMIT, blockRecords };
