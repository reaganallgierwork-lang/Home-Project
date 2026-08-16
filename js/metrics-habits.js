/* ============================================================================
   METRICS SOURCE: HABITS
   ----------------------------------------------------------------------------
   Exposes your habit data to the Data tab. This is the reference example for
   writing another source (a workout tracker, body weight, anything) — see the
   long contract comment at the top of metrics.js.

   Everything here is built from state at call time, so a habit you add in
   Settings shows up in the Data tab immediately, with no code change.

   Each habit contributes up to three metrics:

     • Amount    the raw number you logged — ounces of water, sleep rating.
                 Only for scale habits; a tick box has no interesting amount.
     • Done      1 or 0 per day, averaged into a "% of days" consistency rate.
     • Points    what the habit actually contributed to your daily score,
                 which moves with the dynamic weighting as well as with you.

   Plus two whole-day metrics: your daily score, and clean-sweep days.
   ========================================================================== */

import { registerSource, perDay } from './metrics.js';
import { compute } from './engine.js';
import { subscribe } from './store.js';

/* compute() walks your whole history, so calling it once per metric per redraw
   would be wasteful — a dozen habits means a dozen full passes. So the result
   is cached.

   The cache is invalidated by SAVES rather than by fingerprinting the data.
   An earlier version hashed "number of days logged + last day", which looked
   fine until you ticked a second habit on a day that already had one: the
   fingerprint didn't move, so the Data tab kept showing the old score. Tying
   it to the save event has no such blind spot — anything that can change a
   number goes through store.save() on its way. */
let cache = { state: null, result: null };

/** Drop the cache. Called on every save, and available for direct use. */
export function invalidateMetricsCache() {
  cache = { state: null, result: null };
}

subscribe(invalidateMetricsCache);

function scored(state) {
  /* The identity check also catches a wholesale state replacement, which is
     what restoring a backup does. */
  if (cache.state !== state || !cache.result) {
    cache = { state, result: compute(state) };
  }
  return cache.result;
}

function activeRange(habit) {
  return {
    activeFrom: habit.createdAt || null,
    activeTo: habit.archived && habit.archivedAt ? habit.archivedAt : null,
  };
}

registerSource({
  id: 'habits',
  label: 'Habits',
  icon: '✓',

  list(state) {
    const metrics = [];

    /* ---- whole-day metrics, listed first ---- */
    metrics.push({
      id: 'day:score',
      group: 'Your day overall',
      groupIcon: '📊',
      label: 'Daily score',
      unit: 'pts',
      defaultAgg: 'avg',
      aggOptions: ['avg', 'sum', 'max'],
      target: state.settings.dailyTotal,
      higherIsBetter: true,
      form: 'line',
      blankPolicy: 'zero',
      series: perDay((s, day) => {
        const d = scored(s).byDay[day];
        return d ? d.total : null;
      }),
    });

    metrics.push({
      id: 'day:complete',
      group: 'Your day overall',
      groupIcon: '📊',
      label: 'Clean-sweep days',
      unit: '%',
      scale: 100,
      precision: 0,
      defaultAgg: 'avg',
      aggOptions: ['avg', 'sum'],
      higherIsBetter: true,
      form: 'bar',
      blankPolicy: 'zero',
      series: perDay((s, day) => {
        const d = scored(s).byDay[day];
        return d && d.rows.length ? (d.complete ? 1 : 0) : null;
      }),
    });

    /* ---- one group per habit ---- */
    (state.habits || []).forEach((h) => {
      const range = activeRange(h);
      const isCounter = h.type === 'scale' && h.inputStyle === 'counter';
      const isRating = h.type === 'scale' && h.inputStyle !== 'counter';

      /* The raw amount, for anything with a number behind it. */
      if (h.type === 'scale') {
        metrics.push({
          id: `habit:${h.id}:amount`,
          group: h.name,
          groupIcon: h.emoji,
          label: isCounter ? `Amount logged` : 'Rating',
          unit: isCounter ? (h.unit || '') : '/ 5',
          precision: isCounter ? 0 : 1,
          /* A counter's week is naturally "how much per day on average";
             totals are available from the toggle when you want them. */
          defaultAgg: 'avg',
          aggOptions: isCounter ? ['avg', 'sum', 'max', 'min'] : ['avg', 'max', 'min'],
          target: h.threshold ?? h.max,
          higherIsBetter: true,
          form: 'line',
          /* A night you forgot to rate isn't a zero-quality night, but a day
             you logged no water genuinely is zero ounces. */
          blankPolicy: isRating ? 'skip' : 'zero',
          ...range,
          series: perDay((s, day) => {
            const v = s.log[day]?.[h.id];
            return Number.isFinite(v) ? v : null;
          }),
        });
      }

      /* Consistency — the same for every habit type. */
      metrics.push({
        id: `habit:${h.id}:done`,
        group: h.name,
        groupIcon: h.emoji,
        label: 'Consistency',
        unit: '%',
        scale: 100,
        precision: 0,
        defaultAgg: 'avg',
        aggOptions: ['avg', 'sum'],
        higherIsBetter: true,
        form: 'bar',
        blankPolicy: 'zero',
        ...range,
        series: perDay((s, day) => {
          const row = scored(s).byDay[day]?.byHabit[h.id];
          return row ? (row.success ? 1 : 0) : null;
        }),
      });

      /* What it actually contributed to the score. */
      metrics.push({
        id: `habit:${h.id}:points`,
        group: h.name,
        groupIcon: h.emoji,
        label: 'Points earned',
        unit: 'pts',
        precision: 0,
        defaultAgg: 'avg',
        aggOptions: ['avg', 'sum', 'max'],
        higherIsBetter: true,
        form: 'line',
        blankPolicy: 'zero',
        ...range,
        series: perDay((s, day) => {
          const row = scored(s).byDay[day]?.byHabit[h.id];
          return row ? row.earned + row.reclaimed : null;
        }),
      });
    });

    return metrics;
  },
});

/* ----------------------------------------------------------------------------
   The columns the Table view shows. Kept here (rather than in the Data screen)
   so a future source can offer its own columns the same way.
   -------------------------------------------------------------------------- */
export function habitTableColumns(state) {
  const cols = (state.habits || []).filter((h) => !h.archived).map((h) => ({
    id: h.id,
    label: h.name,
    icon: h.emoji,
    /* The raw thing you entered, formatted for reading. */
    get: (s, day) => {
      const v = s.log[day]?.[h.id];
      if (!Number.isFinite(v)) return null;
      if (h.type === 'binary') return v ? 'Yes' : 'No';
      if (h.inputStyle === 'counter') return `${v}${h.unit ? ` ${h.unit}` : ''}`;
      return `${v} / ${h.max}`;
    },
    /* The same value as a bare number, for sorting and CSV. */
    raw: (s, day) => {
      const v = s.log[day]?.[h.id];
      return Number.isFinite(v) ? v : null;
    },
  }));

  cols.push({
    id: '__score',
    label: 'Day score',
    icon: '📊',
    get: (s, day) => {
      const d = scored(s).byDay[day];
      return d ? String(Math.round(d.total)) : null;
    },
    raw: (s, day) => {
      const d = scored(s).byDay[day];
      return d ? d.total : null;
    },
  });

  return cols;
}
