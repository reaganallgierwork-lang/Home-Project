/* ============================================================================
   NUTRITION — food entries, frequent meals, and feeding counter habits.
   ----------------------------------------------------------------------------
   Lives inside the Body tab (see weight.js, which owns the Weight/Nutrition
   toggle and calls renderNutritionContent() into its own screen). A day can
   have any number of food entries, unlike bodyLog's one-per-day — so this
   file, unlike weight.js, has no single "the entry for this day" concept;
   everything works off a flat list of entries.

   The one thing worth understanding before reading the rest: a counter habit
   can be LINKED to a nutrient (set in the habit editor in ui.js). A linked
   habit's counter is entirely derived from what gets logged here — store.js's
   logFoodEntry/updateFoodEntry/deleteFoodEntry all keep it in sync
   automatically. This file only ever calls those three functions; it never
   touches a linked habit's log value directly, on purpose — one place owns
   that rule, not two.

   This module never imports from ui.js. weight.js imports FROM here (same
   direction as ui.js importing from weight.js/train.js/analyze.js) so there
   is no import cycle — see the comment on store.js's newId() re-export for
   why that matters.
   ========================================================================== */

import * as store from './store.js';
import { icon } from './icons.js';
import { openSheet as sheet } from './sheet.js';
import { el, esc } from './dom.js';

const FIELDS = ['calories', 'protein', 'carbs', 'fat'];
const LABELS = { calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
const UNITS = { calories: '', protein: 'g', carbs: 'g', fat: 'g' };
const fmt = (v, f) => (v == null ? '—' : `${Math.round(v)}${UNITS[f]}`);

/* ============================================================================
   THE SECTION — rendered into weight.js's #bodyContent.
   ========================================================================== */

/**
 * @param state   the current app state (pass store.get())
 * @param redraw  re-renders the WHOLE Body tab (topbar + toggle + this),
 *                since this section has no render loop of its own — it is
 *                always weight.js that owns the screen container.
 */
export function renderNutritionContent(state, redraw) {
  const today = store.todayKey();
  const todayEntries = state.nutritionLog[today] || [];
  const totals = store.nutritionTotals(today);
  const hasToday = todayEntries.length > 0;

  const recent = flattenRecent(state, 30);

  el('bodyContent').innerHTML = `
    <button class="btn primary big" id="logFood">${icon('utensils', 18)} Log food</button>

    <div class="card tight">
      <div class="tiles">
        ${FIELDS.map((f) => `<div class="tile"><b>${hasToday ? fmt(totals[f], f) : '—'}</b><span>${LABELS[f]}${UNITS[f] ? ` (${UNITS[f]})` : ''}</span></div>`).join('')}
      </div>
    </div>
    <div class="hint" style="text-align:center;margin:-4px 0 4px">
      Open the <b>Data</b> tab to chart these over months and years.
    </div>

    ${state.meals.length ? `
      <div class="section-title">Frequent meals</div>
      ${state.meals.slice().sort((a, b) => b.createdAt - a.createdAt).map((m) => mealRowHtml(m)).join('')}
    ` : ''}

    <div class="section-title">Recent</div>
    ${recent.length ? recent.map((e) => entryRowHtml(e)).join('') : `
      <div class="empty">
        <div class="big">${icon('utensils', 34)}</div>
        Nothing logged yet. Log what you eat, and any linked habits — like a
        protein goal — fill themselves in from it.
      </div>`}`;

  el('logFood').onclick = () => openFoodEntrySheet(store.get(), today, null, redraw);
  document.querySelectorAll('#bodyContent [data-entry]').forEach((row) => {
    row.onclick = () => {
      const [day, id] = row.dataset.entry.split('|');
      const entry = (store.get().nutritionLog[day] || []).find((x) => x.id === id);
      if (entry) openFoodEntrySheet(store.get(), day, entry, redraw);
    };
  });
  document.querySelectorAll('#bodyContent [data-meal]').forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest('[data-meal-del]')) return;
      const meal = store.get().meals.find((m) => m.id === row.dataset.meal);
      if (meal) openFoodEntrySheet(store.get(), today, { ...meal, id: undefined }, redraw);
    };
  });
  document.querySelectorAll('#bodyContent [data-meal-del]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const meal = store.get().meals.find((m) => m.id === b.dataset.mealDel);
      if (meal && confirm(`Forget "${meal.name}" as a frequent meal? This does not touch anything already logged.`)) {
        store.deleteMeal(meal.id);
        redraw();
      }
    };
  });
}

/** Every logged entry across every day, newest first — capped for the
    "Recent" list the same way weight.js caps its own recent-entries list. */
function flattenRecent(state, limit) {
  const out = [];
  Object.keys(state.nutritionLog).forEach((day) => {
    state.nutritionLog[day].forEach((e) => out.push({ ...e, day }));
  });
  return out.sort((a, b) => b.loggedAt - a.loggedAt).slice(0, limit);
}

function macroLine(e) {
  return FIELDS.filter((f) => e[f] != null).map((f) => `${Math.round(e[f])}${UNITS[f] || ' kcal'}`).join(' · ') || 'No macros logged';
}

function entryRowHtml(e) {
  return `
    <div class="wcard" data-entry="${esc(e.day)}|${esc(e.id)}">
      <div class="wc-body">
        <div class="wc-name">${esc(e.name)}</div>
        <div class="wc-sub">${macroLine(e)} · ${esc(store.dayLabel(e.day, { weekday: 'short', month: 'short', day: 'numeric' }))}</div>
      </div>
      <span class="wc-chev">${icon('chevronRight', 18)}</span>
    </div>`;
}

function mealRowHtml(m) {
  return `
    <div class="wcard" data-meal="${esc(m.id)}">
      <div class="wc-body">
        <div class="wc-name">${esc(m.name)}</div>
        <div class="wc-sub">${macroLine(m)}</div>
      </div>
      <button class="bc-btn" data-meal-del="${esc(m.id)}" aria-label="Forget this meal">${icon('close', 14)}</button>
      <span class="wc-chev">${icon('chevronRight', 18)}</span>
    </div>`;
}

/* ============================================================================
   THE ENTRY SHEET — exported so History's day-detail sheet can open it too.
   ========================================================================== */

/**
 * @param state    the current app state (pass store.get())
 * @param day      'YYYY-MM-DD' this entry belongs to (or should default to)
 * @param prefill  null for a blank entry; an existing entry object (has .id)
 *                 to edit it; or a plain {name, calories, protein, carbs,
 *                 fat} with no .id to prefill a NEW entry — how tapping a
 *                 frequent meal quick-logs it without a blind, unconfirmed
 *                 write.
 * @param onSaved  called after a save or delete actually lands.
 */
export function openFoodEntrySheet(state, day, prefill, onSaved = () => {}) {
  const isEdit = !!prefill?.id;

  const close = sheet(`
    <h3>${isEdit ? 'Edit entry' : 'Log food'}</h3>
    <div class="lede">${isEdit ? 'Change anything, or remove this entry entirely.' : 'Any field you skip is left unknown, not zero — log just what you tracked.'}</div>
    <div class="field">
      <label>Date</label>
      <input type="date" id="fDate" value="${esc(day)}" max="${store.todayKey()}">
    </div>
    <div class="field">
      <label>Name</label>
      <input type="text" id="fName" value="${esc(prefill?.name ?? '')}" placeholder="e.g. Chicken &amp; rice">
    </div>
    <div class="row2">
      <div class="field"><label>Calories</label><input type="number" inputmode="decimal" id="fCal" value="${prefill?.calories ?? ''}" placeholder="kcal"></div>
      <div class="field"><label>Protein (g)</label><input type="number" inputmode="decimal" id="fProt" value="${prefill?.protein ?? ''}" placeholder="g"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Carbs (g)</label><input type="number" inputmode="decimal" id="fCarb" value="${prefill?.carbs ?? ''}" placeholder="g"></div>
      <div class="field"><label>Fat (g)</label><input type="number" inputmode="decimal" id="fFat" value="${prefill?.fat ?? ''}" placeholder="g"></div>
    </div>
    ${!isEdit ? `
      <label class="checkrow">
        <input type="checkbox" id="fSaveMeal">
        <span>Save this as a frequent meal</span>
      </label>` : ''}
    <button class="btn primary" id="fSave">${isEdit ? 'Save changes' : 'Log it'}</button>
    ${isEdit ? '<button class="btn danger" id="fDelete">Delete this entry</button>' : ''}
    <button class="btn ghost" id="fCancel">Cancel</button>`);

  el('fSave').onclick = () => {
    const dateVal = el('fDate').value || day;
    const patch = {
      name: el('fName').value,
      calories: el('fCal').value.trim(),
      protein: el('fProt').value.trim(),
      carbs: el('fCarb').value.trim(),
      fat: el('fFat').value.trim(),
    };
    const anyField = FIELDS.some((f) => patch[f] !== '');
    if (!anyField) { alert('Add at least a calorie or macro number.'); return; }

    if (isEdit && dateVal !== day) {
      /* Changing the date is really "move this entry" — delete the old slot
         so it doesn't linger once the record has relocated, same rule the
         weight entry sheet follows. */
      store.deleteFoodEntry(day, prefill.id);
      store.logFoodEntry(dateVal, patch);
    } else if (isEdit) {
      store.updateFoodEntry(day, prefill.id, patch);
    } else {
      store.logFoodEntry(dateVal, patch);
    }
    if (!isEdit && el('fSaveMeal')?.checked) store.saveMeal(patch);

    close();
    onSaved();
  };

  if (isEdit) {
    el('fDelete').onclick = () => {
      if (!confirm(`Delete "${prefill.name}"? This may change a linked habit's total for that day.`)) return;
      store.deleteFoodEntry(day, prefill.id);
      close();
      onSaved();
    };
  }
  el('fCancel').onclick = close;
}
