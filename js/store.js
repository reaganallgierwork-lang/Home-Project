/* ============================================================================
   STORE — loading, saving, and changing your data.
   ----------------------------------------------------------------------------
   Everything lives in this phone's browser storage under one key. Nothing is
   ever sent anywhere. The export/import functions in here are what let you move
   your history to a new phone or keep a backup.
   ========================================================================== */

import { DEFAULT_HABITS, DEFAULTS } from './config.js';
import { buildDefaultExercises } from './workouts.js';
import { resolveIcon } from './icons.js';

const KEY = 'habitforge.v1';

/* ---------- small date helpers, used everywhere ---------- */

/** Today as 'YYYY-MM-DD' in *local* time (never UTC — that shifts your day). */
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'YYYY-MM-DD' -> Date at local midnight. */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Shift a day key by n days (n can be negative). */
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return todayKey(d);
}

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
export function monthOf(key) {
  return key.slice(0, 7);
}

export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(monthKey, opts = { month: 'long', year: 'numeric' }) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, opts);
}

export function dayLabel(key, opts = { weekday: 'long', month: 'short', day: 'numeric' }) {
  return parseKey(key).toLocaleDateString(undefined, opts);
}

/** Inclusive list of day keys from a to b. */
export function rangeDays(a, b) {
  const out = [];
  let cur = a;
  let guard = 0;
  while (cur <= b && guard++ < 20000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/* ---------- ids ---------- */

/* Imported for use in here, and re-exported so existing callers keep working.
   `export { newId } from './ids.js'` alone would NOT do — a re-export forwards
   the name without binding it in this module's own scope, so every internal
   call to newId() would throw. */
import { newId } from './ids.js';

export { newId };

/* ---------- the state shape ---------- */

function freshState() {
  const today = todayKey();
  return {
    version: 1,
    settings: { ...DEFAULTS },
    habits: DEFAULT_HABITS.map((h) => ({
      id: newId(),
      name: h.name,
      icon: h.icon,
      emoji: '',
      type: h.type,
      weight: h.weight,
      threshold: h.threshold ?? (h.inputStyle === 'counter' ? (h.max ?? 100) : 3),
      max: h.max ?? 5,
      step: h.step ?? 1,
      unit: h.unit ?? '',
      stepLabel: h.stepLabel ?? '',
      inputStyle: h.inputStyle === 'counter' ? 'counter' : 'rating',
      /* A counter habit can be wired to auto-fill from a nutrient logged on
         the Body tab's Nutrition section — 'calories'|'protein'|'carbs'|
         'fat', or null for an ordinary hand-tapped counter. None of the
         starter habits opt into this; it's a per-habit choice you make in
         the habit editor. */
      nutritionLink: null,
      archived: false,
      archivedAt: null,
      /* Habits don't count against you before they existed. Starting everyone
         at today means day one is a clean slate. */
      createdAt: today,
    })),
    /* log['2026-08-16'] = { habitId: value } — binary 0/1, rating 1..5,
       counter = the running amount for that day (e.g. ounces so far) */
    log: {},
    /* celebration keys already shown, so a toast never fires twice */
    seen: [],
    /* one-time data migrations already applied — see normalise() below */
    migratedHydrationV1: true,
    migratedCalorieBudgetV1: true,
    migratedProteinLinkV1: true,
    migratedNutritionResyncV1: true,
    /* remembered screen state, e.g. the Data tab's last selection */
    ui: {},

    /* ---- the training side ----
       exercises  your catalogue — the thing history is tracked against
       templates  workouts you've built and can start again
       sessions   workouts you actually did, one per performance */
    exercises: buildDefaultExercises(),
    templates: [],
    sessions: [],

    /* bodyLog['2026-08-16'] = { weight: 184.2, photo: 'data:image/jpeg...'|null }
       One entry per day. Weight is in whatever settings.weightUnit says —
       same rule as the Train tab: the app records the number you type and
       never converts it, so switch the unit before you start rather than
       partway through. */
    bodyLog: {},

    /* ---- nutrition ----
       nutritionLog['2026-08-16'] = [{ id, name, calories, protein, carbs,
         fat, mealId, loggedAt }, ...] — a day can have any number of food
       entries, unlike bodyLog's one-per-day. Every nutrient field is
       independently optional: logging "just calories" or "just protein" is
       fine, a missing field means it wasn't recorded, not zero.
       meals = saved food shapes for one-tap reuse ("frequent meals"),
       the same relationship templates has to sessions in workouts.js. */
    nutritionLog: {},
    meals: [],
  };
}

/** The four nutrients this app understands. A habit can be wired to auto-fill
    from any one of them — see syncNutritionLinks() below. */
export const NUTRIENT_FIELDS = ['calories', 'protein', 'carbs', 'fat'];

/** The live goal for a scale (rating/counter) habit. Almost always just its
    stored max — but a Calorie budget habit (goalSource:'tdee') computes its
    goal fresh from your TDEE setting minus its own deficit every time,
    instead of trusting a number cached on the habit at save time. That way
    changing your TDEE in one habit's editor moves every calorie-budget
    goal at once, today and retroactively, with nothing to fall out of sync. */
export function effectiveGoal(h, settings) {
  if (h.goalSource === 'tdee') {
    return Math.max(1, (settings?.tdee ?? DEFAULTS.tdee) - (h.deficitTarget ?? 0));
  }
  return h.max;
}

/* ---------------------------------------------------------------- safety --

   Everything below treats a loaded save file as UNTRUSTED. Your own data is
   obviously fine, but "restore from backup" accepts an arbitrary .json a
   file picker handed us, and that file's contents get rendered straight into
   the app's HTML. A backup emailed to you by someone else is the one and
   only way hostile data can reach this app, so it gets checked properly.
   -------------------------------------------------------------------------- */

/* A photo must be a base64 image data URL and nothing else.
   Checking only the "data:image/" prefix is NOT enough: a value like
       data:image/png," onerror="<script>
   passes a prefix test, and then breaks straight out of the src="..." it is
   interpolated into. The character class below cannot contain a quote, an
   angle bracket or a space, so there is nothing left to break out with.
   SVG is deliberately not in the list — it is the one image format that can
   carry script. */
const PHOTO_RE = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/]+=*$/;

export function isSafePhoto(v) {
  return typeof v === 'string' && v.length < 4_000_000 && PHOTO_RE.test(v);
}

/** A day key must look like a date, not like markup. */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Coerce to a plain string, capped so one field cannot bloat the save. */
const str = (v, fallback = '', max = 200) => {
  const s = typeof v === 'string' ? v : (v === null || v === undefined ? '' : String(v));
  return (s || fallback).slice(0, max);
};

/** Coerce to a finite number, or fall back. Rejects "12\" onmouseover=..." */
const nOr = (v, fallback) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : fallback);

/** A nutrient amount from an untrusted file: a real number, floored at 0, or
    null if absent/garbage — negative food isn't a thing. */
const nOrPositive = (v) => (nOr(v, null) === null ? null : Math.max(0, +v));

/** Fill in anything a older/partial save is missing, so upgrades never crash. */
function normalise(raw) {
  const base = freshState();
  if (!raw || typeof raw !== 'object') return base;
  const s = {
    version: 1,
    settings: { ...base.settings, ...(raw.settings || {}) },
    habits: Array.isArray(raw.habits) && raw.habits.length ? raw.habits : base.habits,
    log: raw.log && typeof raw.log === 'object' ? raw.log : {},
    seen: Array.isArray(raw.seen) ? raw.seen : [],
    migratedHydrationV1: !!raw.migratedHydrationV1,
    migratedCalorieBudgetV1: !!raw.migratedCalorieBudgetV1,
    migratedProteinLinkV1: !!raw.migratedProteinLinkV1,
    migratedNutritionResyncV1: !!raw.migratedNutritionResyncV1,
    /* Remembered screen state (which metric the Data tab was showing, etc).
       Purely cosmetic — safe to be missing or stale. */
    ui: raw.ui && typeof raw.ui === 'object' ? raw.ui : {},

    /* Training. A save from before the workout tracker existed has none of
       these, so the exercise catalogue is seeded and the rest start empty. */
    exercises: Array.isArray(raw.exercises) && raw.exercises.length ? raw.exercises : base.exercises,
    templates: Array.isArray(raw.templates) ? raw.templates : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],

    bodyLog: raw.bodyLog && typeof raw.bodyLog === 'object' ? raw.bodyLog : {},
    nutritionLog: raw.nutritionLog && typeof raw.nutritionLog === 'object' ? raw.nutritionLog : {},
    meals: Array.isArray(raw.meals) ? raw.meals : [],
  };

  /* Sanitise every entry rather than trusting the file — a hand-edited or
     corrupted backup should degrade gracefully, never crash the app.
     Check null/undefined BEFORE coercing with +e.weight: +null === 0, so
     Number.isFinite(+e.weight) alone would turn an absent weight into a
     fabricated 0 instead of leaving it unset. */
  Object.keys(s.bodyLog).forEach((day) => {
    const e = s.bodyLog[day] || {};
    const weight = (e.weight === null || e.weight === undefined) ? null
      : (Number.isFinite(+e.weight) ? +e.weight : null);
    const photo = isSafePhoto(e.photo) ? e.photo : null;
    /* The key itself is rendered into a data- attribute, so a key that isn't
       a date is dropped rather than trusted. */
    if (!DAY_RE.test(day) || (weight === null && !photo)) delete s.bodyLog[day];
    else s.bodyLog[day] = { weight, photo };
  });

  /* Food entries: same untrusted-input rules as bodyLog above, but keyed to
     an ARRAY per day rather than one entry — a day can have any number of
     meals logged. Every nutrient field is independently optional (nOr with
     a null fallback), matching that logging "just calories" is legitimate. */
  Object.keys(s.nutritionLog).forEach((day) => {
    const list = s.nutritionLog[day];
    if (!DAY_RE.test(day) || !Array.isArray(list)) { delete s.nutritionLog[day]; return; }
    const clean = list.filter((e) => e && typeof e === 'object').map((e) => ({
      id: str(e.id, newId(), 64),
      name: str(e.name, 'Food', 120),
      calories: nOrPositive(e.calories),
      protein: nOrPositive(e.protein),
      carbs: nOrPositive(e.carbs),
      fat: nOrPositive(e.fat),
      mealId: e.mealId ? str(e.mealId, '', 64) : null,
      loggedAt: Number.isFinite(+e.loggedAt) ? +e.loggedAt : Date.now(),
    }));
    if (!clean.length) delete s.nutritionLog[day];
    else s.nutritionLog[day] = clean;
  });
  s.meals = s.meals.filter((m) => m && typeof m === 'object').map((m) => ({
    id: str(m.id, newId(), 64),
    name: str(m.name, 'Meal', 120),
    calories: nOrPositive(m.calories),
    protein: nOrPositive(m.protein),
    carbs: nOrPositive(m.carbs),
    fat: nOrPositive(m.fat),
    createdAt: Number.isFinite(+m.createdAt) ? +m.createdAt : Date.now(),
  }));

  /* Habits arrive straight from the file and are rendered into both text and
     HTML attributes, so every field the UI reads is coerced to its expected
     shape here rather than trusted. (Previously two separate sanitising
     passes ran back to back — the second, non-spreading one silently
     dropped any field only the first pass had touched. Consolidated into
     one so adding nutritionLink below can't repeat that mistake.) */
  s.habits = s.habits.filter((h) => h && typeof h === 'object').map((h) => ({
    id: str(h.id, newId(), 64),
    name: str(h.name, 'Untitled', 120),
    icon: str(h.icon, '', 64),
    /* `emoji` only survives for saves made before the icon set existed, and
       is migrated to an icon below. */
    emoji: str(h.emoji, '', 16),
    unit: str(h.unit, '', 24),
    stepLabel: str(h.stepLabel, '', 24),
    type: h.type === 'scale' ? 'scale' : 'binary',
    inputStyle: h.inputStyle === 'counter' ? 'counter' : 'rating',
    /* Which nutrient (if any) fills this counter in automatically from the
       Nutrition section. Anything else collapses to "not linked" rather
       than being trusted as a fourth, unlisted nutrient. */
    nutritionLink: NUTRIENT_FIELDS.includes(h.nutritionLink) ? h.nutritionLink : null,
    /* 'tdee' marks a Calorie budget habit — see effectiveGoal() below. Its
       goal is computed live from settings.tdee and never trusted from a
       stored max, so a hand-edited backup can't plant a fake budget. */
    goalSource: h.goalSource === 'tdee' ? 'tdee' : 'fixed',
    deficitTarget: Math.max(0, nOr(h.deficitTarget, 500)),
    weight: Math.max(1, nOr(h.weight, 10)),
    max: Math.max(1, nOr(h.max, 5)),
    step: Math.max(0.01, nOr(h.step, 1)),
    threshold: Math.max(1, nOr(h.threshold, 3)),
    archived: !!h.archived,
    archivedAt: DAY_RE.test(h.archivedAt) ? h.archivedAt : null,
    createdAt: DAY_RE.test(h.createdAt) ? h.createdAt : todayKey(),
  }));

  s.exercises = s.exercises.map((e) => ({
    id: e.id || newId(),
    name: String(e.name ?? 'Untitled'),
    category: e.category || 'Other',
    track: ['weight_reps', 'reps', 'time', 'distance'].includes(e.track) ? e.track : 'weight_reps',
    archived: !!e.archived,
  }));
  /* Sessions are the irreplaceable part — never silently drop a malformed one,
     just make sure the fields the app reads always exist. */
  s.sessions = s.sessions
    .filter((x) => x && x.day)
    .map((x) => ({
      id: x.id || newId(),
      day: x.day,
      name: x.name || 'Workout',
      templateId: x.templateId || null,
      blocks: Array.isArray(x.blocks) ? x.blocks : [],
      note: x.note || '',
      startedAt: x.startedAt || null,
      finishedAt: x.finishedAt || null,
    }))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  s.templates = s.templates
    .filter((x) => x && Array.isArray(x.blocks))
    .map((x) => ({
      id: x.id || newId(),
      name: x.name || 'Workout',
      blocks: x.blocks,
      createdAt: x.createdAt || Date.now(),
    }));
  /* Percentages must be ascending for the ladder to make sense. */
  s.settings.tierPercents = (s.settings.tierPercents || DEFAULTS.tierPercents)
    .map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  s.settings.tdee = Math.max(500, nOr(s.settings.tdee, DEFAULTS.tdee));

  /* ---- one-time migration: emoji habits become line icons ----
     Habits saved before the visual overhaul carry an emoji. Map the ones we
     recognise onto the new set; anything unrecognised keeps its character and
     still renders, so no habit can end up with a blank square where its icon
     used to be. */
  s.habits.forEach((h) => {
    if (h.icon) return;
    const mapped = resolveIcon(h.emoji);
    if (mapped) { h.icon = mapped; h.emoji = ''; }
  });

  /* ---- one-time migration: Hydration moved from a tick box to counting
     8oz cups toward a 150oz goal. A past "yes" day already scored full
     points for the habit, exactly like fully hitting the new goal does, so
     those days are carried over as maxed rather than losing their history.
     Runs once per device, then never again — even if you switch Hydration
     back to a tick box on purpose afterward. */
  if (!s.migratedHydrationV1) {
    const hab = s.habits.find((h) => h.name.trim().toLowerCase() === 'hydration' && h.type === 'binary');
    if (hab) {
      Object.assign(hab, {
        type: 'scale', max: 150, threshold: 150, step: 8, unit: 'oz', stepLabel: 'cup', inputStyle: 'counter',
      });
      Object.keys(s.log).forEach((day) => {
        if (s.log[day][hab.id]) s.log[day][hab.id] = 150;
      });
    }
    s.migratedHydrationV1 = true;
  }

  /* ---- one-time migration: add a starter Calorie budget habit -----------
     The calorie-budget goal type is only useful once a habit actually
     exists using it — an option sitting in the Type dropdown that nobody
     goes looking for isn't a live goal. So the first time a device loads
     this version, one is added automatically at weight 10 (as requested),
     linked to calories, with the default 500-calorie deficit off whatever
     TDEE is already set. Runs once per device; retiring or deleting it
     afterward is normal and it will not come back. Skipped entirely if a
     calorie-budget habit already exists — from an earlier manual add, or a
     backup restored from another device that already ran this migration. */
  if (!s.migratedCalorieBudgetV1) {
    if (!s.habits.some((h) => h.goalSource === 'tdee')) {
      const deficitTarget = 500;
      const budget = Math.max(1, s.settings.tdee - deficitTarget);
      s.habits.push({
        id: newId(),
        name: 'Calorie budget',
        icon: 'flame',
        emoji: '',
        type: 'scale',
        inputStyle: 'counter',
        weight: 10,
        max: budget,
        threshold: budget,
        step: 1,
        unit: 'cal',
        stepLabel: '',
        nutritionLink: 'calories',
        goalSource: 'tdee',
        deficitTarget,
        archived: false,
        archivedAt: null,
        createdAt: todayKey(),
      });
      // If food is already logged today (or any day) when this first runs,
      // the brand-new habit needs a sync to pick it up immediately — the
      // same reasoning as the protein-link migration below.
      Object.keys(s.nutritionLog).forEach((day) => syncNutritionLinks(s, day));
    }
    s.migratedCalorieBudgetV1 = true;
  }

  /* ---- one-time migration: link an existing protein counter to the food
     log --------------------------------------------------------------------
     Nutrition-linking a habit disables its manual +/-, which is exactly the
     kind of surprise behaviour change that shouldn't happen silently — so
     when the Nutrition section first shipped, it deliberately left this as
     something you opt into per habit rather than something done for you.
     In practice nobody found the opt-in: a protein-goal counter you were
     already hand-logging is the obvious, expected thing to auto-fill from
     food you log, not an edge case that needs a manual switch. So this
     finds a counter habit that looks like a protein goal by name and links
     it automatically, once. If you don't want that, unlink it from the
     habit editor afterward and it will not relink itself.

     Linking alone isn't enough: a habit like this almost always already
     carries HAND-TAPPED values from before it was linked — every day you
     tapped it yourself, sitting in s.log completely disconnected from your
     food log. Those stale numbers would otherwise sit there unchanged
     until the next time you happened to edit that day's food, silently
     disagreeing with the real total the whole time. So every day that has
     food logged gets resynced right here, immediately, not just today. */
  if (!s.migratedProteinLinkV1) {
    const hab = s.habits.find((h) => h.type === 'scale' && h.inputStyle === 'counter'
      && !h.nutritionLink && h.name.trim().toLowerCase().includes('protein'));
    if (hab) {
      hab.nutritionLink = 'protein';
      Object.keys(s.nutritionLog).forEach((day) => syncNutritionLinks(s, day));
    }
    s.migratedProteinLinkV1 = true;
  }

  /* ---- one-time migration: catch up anyone already linked under the bug
     above --------------------------------------------------------------
     The two migrations above resync the days they touch, but only reason
     about it going forward — anyone whose device already ran the protein
     link (or the calorie-budget one) before this fix landed is stuck with
     whatever stale number was showing at that moment, on every day, until
     they happen to edit that day's food again. This is the actual fix for
     that: a blanket resync of every nutrition-linked habit against every
     day that has food logged, once, regardless of when or how it got
     linked. Harmless — and a no-op — for anyone whose data was already
     correct. */
  if (!s.migratedNutritionResyncV1) {
    Object.keys(s.nutritionLog).forEach((day) => syncNutritionLinks(s, day));
    s.migratedNutritionResyncV1 = true;
  }

  return s;
}

/* ---------- load / save ---------- */

let state = null;
const listeners = new Set();

export function load() {
  if (state) return state;
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    raw = null;
  }
  state = normalise(raw);
  return state;
}

export function get() {
  return state || load();
}

/** Returns true if the write actually reached localStorage. */
export function save() {
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save — storage may be full or blocked.', err);
    ok = false;
  }
  /* The in-memory state changed either way — a failed persist still means
     anything reading `state` (not localStorage) should treat it as current,
     and derived caches (metrics) still need to invalidate. */
  listeners.forEach((fn) => fn(state));
  return ok;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Change state and persist in one step. Returns save()'s success flag. */
export function update(mutator) {
  mutator(get());
  return save();
}

/* ---------- logging a day ---------- */

export function setEntry(dayKey, habitId, value) {
  update((s) => {
    if (!s.log[dayKey]) s.log[dayKey] = {};
    if (value === null || value === undefined) delete s.log[dayKey][habitId];
    else s.log[dayKey][habitId] = value;
    if (!Object.keys(s.log[dayKey]).length) delete s.log[dayKey];
  });
}

export function getEntry(dayKey, habitId) {
  return get().log[dayKey]?.[habitId];
}

/* ---------- editing the habit list ---------- */

export function addHabit(partial) {
  const h = {
    id: newId(),
    name: partial.name || 'New habit',
    icon: partial.icon || 'star',
    emoji: '',
    type: partial.type === 'scale' ? 'scale' : 'binary',
    weight: +partial.weight || 10,
    threshold: Number.isFinite(+partial.threshold) ? +partial.threshold : 3,
    max: Number.isFinite(+partial.max) && +partial.max > 0 ? +partial.max : 5,
    step: Number.isFinite(+partial.step) && +partial.step > 0 ? +partial.step : 1,
    unit: partial.unit || '',
    stepLabel: partial.stepLabel || '',
    inputStyle: partial.inputStyle === 'counter' ? 'counter' : 'rating',
    nutritionLink: NUTRIENT_FIELDS.includes(partial.nutritionLink) ? partial.nutritionLink : null,
    goalSource: partial.goalSource === 'tdee' ? 'tdee' : 'fixed',
    deficitTarget: Number.isFinite(+partial.deficitTarget) ? Math.max(0, +partial.deficitTarget) : 500,
    archived: false,
    archivedAt: null,
    /* Starts counting from today. A habit you add on the 20th can never give
       you retroactive misses for the 1st through the 19th. */
    createdAt: todayKey(),
  };
  update((s) => s.habits.push(h));
  return h;
}

export function updateHabit(id, patch) {
  update((s) => {
    const h = s.habits.find((x) => x.id === id);
    if (h) Object.assign(h, patch);
  });
}

/** Retire: stops counting from today onward, leaves every past day untouched. */
export function archiveHabit(id, archived = true) {
  updateHabit(id, archived ? { archived: true, archivedAt: todayKey() } : { archived: false, archivedAt: null });
}

/** Delete for real, including its history. Used only behind a confirm. */
export function deleteHabit(id) {
  update((s) => {
    s.habits = s.habits.filter((h) => h.id !== id);
    Object.keys(s.log).forEach((d) => {
      delete s.log[d][id];
      if (!Object.keys(s.log[d]).length) delete s.log[d];
    });
  });
}

export function moveHabit(id, dir) {
  update((s) => {
    const i = s.habits.findIndex((h) => h.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.habits.length) return;
    [s.habits[i], s.habits[j]] = [s.habits[j], s.habits[i]];
  });
}

/* ---------- celebrations already shown ---------- */

export function hasSeen(key) {
  return get().seen.includes(key);
}

export function markSeen(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  update((s) => {
    list.forEach((k) => {
      if (!s.seen.includes(k)) s.seen.push(k);
    });
    /* Keep the list from growing forever. */
    if (s.seen.length > 800) s.seen = s.seen.slice(-500);
  });
}

/* ---------- training: exercises, templates, sessions ---------- */

export function addExercise(partial) {
  const e = {
    id: newId(),
    name: partial.name || 'New exercise',
    category: partial.category || 'Other',
    track: partial.track || 'weight_reps',
    archived: false,
  };
  update((s) => s.exercises.push(e));
  return e;
}

export function updateExercise(id, patch) {
  update((s) => {
    const e = s.exercises.find((x) => x.id === id);
    if (e) Object.assign(e, patch);
  });
}

/** Retiring keeps every session that used it intact; deleting would not. */
export function archiveExercise(id, archived = true) {
  updateExercise(id, { archived });
}

export function saveTemplate(template) {
  update((s) => {
    const i = s.templates.findIndex((t) => t.id === template.id);
    if (i >= 0) s.templates[i] = template;
    else s.templates.push(template);
  });
  return template;
}

export function deleteTemplate(id) {
  update((s) => { s.templates = s.templates.filter((t) => t.id !== id); });
}

export function saveSession(session) {
  update((s) => {
    const i = s.sessions.findIndex((x) => x.id === session.id);
    if (i >= 0) s.sessions[i] = session;
    else s.sessions.unshift(session);
    s.sessions.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  });
  return session;
}

export function deleteSession(id) {
  update((s) => { s.sessions = s.sessions.filter((x) => x.id !== id); });
}

export function getSession(id) {
  return get().sessions.find((s) => s.id === id) || null;
}

/* ---------- body weight + progress photos ---------- */

export function getBodyEntry(day) {
  return get().bodyLog[day] || null;
}

/**
 * Log or update a day's weight and/or photo.
 *   patch.weight  a number, or null to clear the weight
 *   patch.photo   a data URL to set it, null to remove it, or omit the key
 *                 entirely to leave whatever photo is already there alone
 * An entry with neither a weight nor a photo is removed rather than kept
 * as an empty husk.
 *
 * If the photo won't fit in storage, the weight still saves and the photo
 * falls back to whatever it was before this call (not necessarily blank —
 * a failed "replace this photo" attempt should not destroy a perfectly good
 * existing one). Returns { ok, photoDropped } so the caller can say so
 * honestly rather than pretending the photo saved when it didn't.
 */
export function setBodyEntry(day, patch) {
  const prevPhoto = get().bodyLog[day]?.photo ?? null;
  let ok = update((s) => {
    if (!s.bodyLog) s.bodyLog = {};
    const cur = s.bodyLog[day] || { weight: null, photo: null };
    const next = { ...cur };
    /* Check null/undefined explicitly before coercing: +null === 0, so
       Number.isFinite(+patch.weight) alone would turn "clear the weight"
       into "set it to zero" — the same trap setEntry() above avoids. */
    if ('weight' in patch) {
      next.weight = (patch.weight === null || patch.weight === undefined) ? null
        : (Number.isFinite(+patch.weight) ? +patch.weight : null);
    }
    if ('photo' in patch) next.photo = patch.photo || null;
    if (next.weight === null && !next.photo) delete s.bodyLog[day];
    else s.bodyLog[day] = next;
  });

  let photoDropped = false;
  if (!ok && 'photo' in patch && patch.photo) {
    photoDropped = true;
    ok = update((s) => {
      if (s.bodyLog[day]) s.bodyLog[day].photo = prevPhoto;
    });
  }
  return { ok, photoDropped };
}

export function deleteBodyEntry(day) {
  update((s) => { delete s.bodyLog[day]; });
}

/* ---------- nutrition: food entries, frequent meals, habit linking ----------

   The habit-linking is the interesting part. A counter habit with
   h.nutritionLink set (e.g. 'protein') is meant to be entirely DERIVED from
   the Nutrition section rather than hand-tapped — see the locked counter UI
   in ui.js. syncNutritionLinks() is what keeps that promise: every food-log
   mutation recomputes the day's nutrient totals and pushes them straight
   into log[day][habitId] for every habit linked to that nutrient, through
   the exact same setEntry() semantics everything else uses (so streaks,
   scoring and the Data tab all see it as a completely ordinary logged
   value — nothing downstream needs to know it came from food logging).

   A day with no food entries clears linked habits back to "not logged"
   rather than a fabricated 0 — the same rule setEntry() already follows: an
   unlogged day isn't evidence of a bad day, it's evidence of nothing.
   ---------------------------------------------------------------------- */

function syncNutritionLinks(s, day) {
  const entries = s.nutritionLog[day] || [];
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  entries.forEach((e) => {
    NUTRIENT_FIELDS.forEach((f) => { totals[f] += e[f] || 0; });
  });
  s.habits.forEach((h) => {
    if (!NUTRIENT_FIELDS.includes(h.nutritionLink)) return;
    if (!entries.length) {
      if (s.log[day]) delete s.log[day][h.id];
    } else {
      if (!s.log[day]) s.log[day] = {};
      s.log[day][h.id] = totals[h.nutritionLink];
    }
    if (s.log[day] && !Object.keys(s.log[day]).length) delete s.log[day];
  });
}

export function getNutritionDay(day) {
  return get().nutritionLog[day] || [];
}

/** Today's (or any day's) nutrient totals — 0 for each field with no
    entries, distinct from a linked habit's log value being null/absent for
    a day with literally nothing logged (see syncNutritionLinks above). */
export function nutritionTotals(day) {
  const entries = get().nutritionLog[day] || [];
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  entries.forEach((e) => NUTRIENT_FIELDS.forEach((f) => { totals[f] += e[f] || 0; }));
  return totals;
}

function cleanNutrients(partial) {
  const out = {};
  NUTRIENT_FIELDS.forEach((f) => {
    /* Negative food isn't a thing, and a stray negative would corrupt a
       linked habit's counter (its bar-width math assumes amt >= 0). */
    out[f] = (partial[f] === null || partial[f] === undefined || partial[f] === '') ? null
      : (Number.isFinite(+partial[f]) ? Math.max(0, +partial[f]) : null);
  });
  return out;
}

export function logFoodEntry(day, partial) {
  const e = {
    id: newId(),
    name: (partial.name || '').trim() || 'Food',
    ...cleanNutrients(partial),
    mealId: partial.mealId || null,
    loggedAt: Date.now(),
  };
  update((s) => {
    if (!s.nutritionLog[day]) s.nutritionLog[day] = [];
    s.nutritionLog[day].push(e);
    syncNutritionLinks(s, day);
  });
  return e;
}

export function updateFoodEntry(day, entryId, patch) {
  update((s) => {
    const e = (s.nutritionLog[day] || []).find((x) => x.id === entryId);
    if (!e) return;
    if ('name' in patch) e.name = (patch.name || '').trim() || 'Food';
    Object.assign(e, cleanNutrients({ ...e, ...patch }));
    syncNutritionLinks(s, day);
  });
}

export function deleteFoodEntry(day, entryId) {
  update((s) => {
    if (!s.nutritionLog[day]) return;
    s.nutritionLog[day] = s.nutritionLog[day].filter((x) => x.id !== entryId);
    if (!s.nutritionLog[day].length) delete s.nutritionLog[day];
    syncNutritionLinks(s, day);
  });
}

/* ---- frequent meals: a saved food shape, for logging the same thing again
   in two taps instead of retyping every field ---- */

export function saveMeal(partial) {
  const m = {
    id: newId(),
    name: (partial.name || '').trim() || 'Meal',
    ...cleanNutrients(partial),
    createdAt: Date.now(),
  };
  update((s) => s.meals.push(m));
  return m;
}

export function deleteMeal(id) {
  update((s) => { s.meals = s.meals.filter((m) => m.id !== id); });
}

/* ---------- backup ---------- */

export function exportBackup() {
  const blob = new Blob([JSON.stringify(get(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `habit-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Replace everything with the contents of a backup file. */
export async function importBackup(file) {
  const text = await file.text();
  const raw = JSON.parse(text);
  if (!raw || !Array.isArray(raw.habits)) throw new Error('That does not look like a habit backup file.');
  state = normalise(raw);
  save();
  return state;
}

export function resetSettings() {
  update((s) => { s.settings = { ...DEFAULTS }; });
}

/** Wipe everything and start over. */
export function hardReset() {
  state = freshState();
  save();
}
