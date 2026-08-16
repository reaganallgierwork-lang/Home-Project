/* ============================================================================
   STORE — loading, saving, and changing your data.
   ----------------------------------------------------------------------------
   Everything lives in this phone's browser storage under one key. Nothing is
   ever sent anywhere. The export/import functions in here are what let you move
   your history to a new phone or keep a backup.
   ========================================================================== */

import { DEFAULT_HABITS, DEFAULTS } from './config.js';

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

let idSeq = 0;
export function newId() {
  idSeq += 1;
  return `h${Date.now().toString(36)}${idSeq.toString(36)}`;
}

/* ---------- the state shape ---------- */

function freshState() {
  const today = todayKey();
  return {
    version: 1,
    settings: { ...DEFAULTS },
    habits: DEFAULT_HABITS.map((h) => ({
      id: newId(),
      name: h.name,
      emoji: h.emoji,
      type: h.type,
      weight: h.weight,
      threshold: h.threshold ?? (h.inputStyle === 'counter' ? (h.max ?? 100) : 3),
      max: h.max ?? 5,
      step: h.step ?? 1,
      unit: h.unit ?? '',
      stepLabel: h.stepLabel ?? '',
      inputStyle: h.inputStyle === 'counter' ? 'counter' : 'rating',
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
    /* remembered screen state, e.g. the Data tab's last selection */
    ui: {},
  };
}

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
    /* Remembered screen state (which metric the Data tab was showing, etc).
       Purely cosmetic — safe to be missing or stale. */
    ui: raw.ui && typeof raw.ui === 'object' ? raw.ui : {},
  };
  s.habits = s.habits.map((h) => ({
    id: h.id || newId(),
    name: String(h.name ?? 'Untitled'),
    emoji: h.emoji || '•',
    type: h.type === 'scale' ? 'scale' : 'binary',
    weight: Number.isFinite(+h.weight) && +h.weight > 0 ? +h.weight : 10,
    threshold: Number.isFinite(+h.threshold) ? +h.threshold : 3,
    max: Number.isFinite(+h.max) && +h.max > 1 ? +h.max : 5,
    step: Number.isFinite(+h.step) && +h.step > 0 ? +h.step : 1,
    unit: typeof h.unit === 'string' ? h.unit : '',
    stepLabel: typeof h.stepLabel === 'string' ? h.stepLabel : '',
    inputStyle: h.inputStyle === 'counter' ? 'counter' : 'rating',
    archived: !!h.archived,
    archivedAt: h.archivedAt || null,
    createdAt: h.createdAt || todayKey(),
  }));
  /* Percentages must be ascending for the ladder to make sense. */
  s.settings.tierPercents = (s.settings.tierPercents || DEFAULTS.tierPercents)
    .map(Number).filter(Number.isFinite).sort((a, b) => a - b);

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

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save — storage may be full or blocked.', err);
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Change state and persist in one step. */
export function update(mutator) {
  mutator(get());
  save();
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
    emoji: partial.emoji || '⭐',
    type: partial.type === 'scale' ? 'scale' : 'binary',
    weight: +partial.weight || 10,
    threshold: Number.isFinite(+partial.threshold) ? +partial.threshold : 3,
    max: Number.isFinite(+partial.max) && +partial.max > 0 ? +partial.max : 5,
    step: Number.isFinite(+partial.step) && +partial.step > 0 ? +partial.step : 1,
    unit: partial.unit || '',
    stepLabel: partial.stepLabel || '',
    inputStyle: partial.inputStyle === 'counter' ? 'counter' : 'rating',
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
