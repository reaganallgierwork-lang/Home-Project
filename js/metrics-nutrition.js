/* ============================================================================
   METRICS SOURCE: NUTRITION
   ----------------------------------------------------------------------------
   Exposes your logged food to the Data tab — one metric per nutrient, each
   summed across every entry logged that day. Follows the same contract as
   metrics-habits.js and metrics-weight.js — see the top of metrics.js.

   higherIsBetter is left at its true default for all four: whether more
   calories is "good" depends on a goal this app doesn't know (cutting vs.
   bulking), so there's no honest default to pick — it only colours a trend
   chip, never scoring, so getting it "wrong" here costs nothing real.
   ========================================================================== */

import { registerSource, perDay } from './metrics.js';
import { NUTRIENT_FIELDS } from './store.js';

const LABELS = { calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
const UNITS = { calories: 'kcal', protein: 'g', carbs: 'g', fat: 'g' };

registerSource({
  id: 'nutrition',
  label: 'Nutrition',
  icon: 'utensils',

  list() {
    return NUTRIENT_FIELDS.map((f) => ({
      id: `nutrition:${f}`,
      group: 'Nutrition',
      groupIcon: 'utensils',
      label: LABELS[f],
      unit: UNITS[f],
      precision: f === 'calories' ? 0 : 1,
      defaultAgg: 'avg',
      aggOptions: ['avg', 'sum', 'max'],
      higherIsBetter: true,
      form: 'bar',
      /* A day with nothing logged is unknown, not a zero-calorie day — the
         same rule the Body-weight metric follows, for the same reason. */
      blankPolicy: 'skip',
      series: perDay((s, day) => {
        const entries = s.nutritionLog?.[day];
        if (!entries || !entries.length) return null;
        const has = entries.some((e) => Number.isFinite(e[f]));
        if (!has) return null;
        return entries.reduce((a, e) => a + (e[f] || 0), 0);
      }),
    }));
  },
});

/* ----------------------------------------------------------------------------
   Table columns for the Data tab's Table view — one per nutrient, plus a
   count of how many things were logged that day.
   -------------------------------------------------------------------------- */
export function nutritionTableColumns() {
  return [
    ...NUTRIENT_FIELDS.map((f) => ({
      id: `__nutrition_${f}`,
      label: `${LABELS[f]} (${UNITS[f]})`,
      icon: 'utensils',
      get: (s, day) => {
        const entries = s.nutritionLog?.[day];
        if (!entries || !entries.some((e) => Number.isFinite(e[f]))) return null;
        return String(entries.reduce((a, e) => a + (e[f] || 0), 0));
      },
      raw: (s, day) => {
        const entries = s.nutritionLog?.[day];
        if (!entries || !entries.some((e) => Number.isFinite(e[f]))) return null;
        return entries.reduce((a, e) => a + (e[f] || 0), 0);
      },
    })),
    {
      id: '__nutrition_count',
      label: 'Meals logged',
      icon: 'utensils',
      get: (s, day) => {
        const n = s.nutritionLog?.[day]?.length || 0;
        return n ? String(n) : null;
      },
      raw: (s, day) => s.nutritionLog?.[day]?.length || null,
    },
  ];
}
