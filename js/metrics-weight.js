/* ============================================================================
   METRICS SOURCE: BODY WEIGHT
   ----------------------------------------------------------------------------
   Exposes your logged weight to the Data tab. Follows the same contract as
   metrics-habits.js and metrics-workouts.js — see the top of metrics.js.

   There's only one metric here, because there's only one number: the weight
   you logged that day. No caching layer either — unlike the workouts source,
   reading state.bodyLog is already a direct lookup with nothing to flatten.
   ========================================================================== */

import { registerSource, perDay } from './metrics.js';

registerSource({
  id: 'body',
  label: 'Body',
  icon: 'bodyweight',

  list(state) {
    const unit = state.settings?.weightUnit || 'lb';
    return [{
      id: 'body:weight',
      group: 'Body weight',
      groupIcon: 'bodyweight',
      label: 'Weight',
      unit,
      precision: 1,
      defaultAgg: 'avg',
      aggOptions: ['avg', 'min', 'max'],
      /* A generic default — most people opening a weight tracker are working
         toward losing rather than gaining. It only colours a delta chip, so
         getting it "wrong" for someone bulking is a cosmetic nit, not a
         judgment the app makes anywhere else. */
      higherIsBetter: false,
      form: 'line',
      /* A day you didn't step on the scale is unknown, not a 0 lb reading —
         the same rule the docblock in metrics.js asks for. */
      blankPolicy: 'skip',
      series: perDay((s, day) => {
        const v = s.bodyLog?.[day]?.weight;
        return Number.isFinite(v) ? v : null;
      }),
    }];
  },
});

/* ----------------------------------------------------------------------------
   Table columns for the Data tab's Table view.
   -------------------------------------------------------------------------- */
export function bodyTableColumns(state) {
  const unit = state.settings?.weightUnit || 'lb';
  return [
    {
      id: '__weight',
      label: `Weight (${unit})`,
      icon: 'bodyweight',
      get: (s, day) => {
        const v = s.bodyLog?.[day]?.weight;
        return Number.isFinite(v) ? String(v) : null;
      },
      raw: (s, day) => {
        const v = s.bodyLog?.[day]?.weight;
        return Number.isFinite(v) ? v : null;
      },
    },
    {
      id: '__photo',
      label: 'Photo',
      icon: 'image',
      get: (s, day) => (s.bodyLog?.[day]?.photo ? 'Yes' : null),
      raw: (s, day) => (s.bodyLog?.[day]?.photo ? 1 : null),
    },
  ];
}
