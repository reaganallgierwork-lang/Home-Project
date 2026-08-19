/* ============================================================================
   UI — everything you see and tap.
   ----------------------------------------------------------------------------
   The pattern is deliberately simple: any change saves, then the whole screen
   is redrawn from freshly computed numbers. No clever partial updates to get
   out of step with your data.

   ---------------------------------------------------------------------------
   ADDING A NEW TAB (e.g. the workout tracker)
   ---------------------------------------------------------------------------
   1. Write js/<yourthing>.js exporting a render(state) function.
   2. Add one line to the SCREENS list below.
   3. If it has data worth charting, also register a metric source (see the
      contract at the top of metrics.js) and it appears in the Data tab with
      no further work.
   The tab bar builds itself from SCREENS, so nothing else needs touching.
   ========================================================================== */

import * as store from './store.js';
import { compute, celebrationsFor, weeklySeries } from './engine.js';
import { renderBadge } from './badges.js';
import { TIERS, META_BADGES } from './config.js';
import './metrics-habits.js';          // registers the habits metric source
import './metrics-workouts.js';        // registers the training metric source
import { renderAnalyze } from './analyze.js';
import { renderTrain, openSession as openTrainSession } from './train.js';
import { sessionVolume, sessionSetCount, invalidateRecords } from './workouts.js';
import './metrics-weight.js';          // registers the body-weight metric source
import { renderWeight, openBodyEntrySheet, openPhotoViewer, showNutritionSection } from './weight.js';
import './metrics-nutrition.js';       // registers the nutrition metric source
import { openFoodEntrySheet } from './nutrition.js';
import { icon, PICKER_ICONS, hasIcon } from './icons.js';
import { openSheet as modal } from './sheet.js';
import { el, esc, toast } from './dom.js';

const $ = (sel, root = document) => root.querySelector(sel);

/* Which day the Today screen is showing. Defaults to today; the arrows let you
   walk back and fill in anything you missed. */
let viewDay = store.todayKey();
let viewMonth = store.monthOf(store.todayKey());
let current = 'today';
let R = null; // the latest computed result

const round = (n) => Math.round(n);
/* A habit's glyph: an icon key when we have one, otherwise whatever character
   the habit was saved with, so nothing ever renders blank. */
const glyph = (h, size = 20) => icon(h.icon || h.emoji, size);

/* ============================================================================
   BOOT
   ========================================================================== */

/* The tab bar and the screens, in order. Add to this list to add a tab.
   Tiers and Badges share one tab (renderProgress) — they're both "where do I
   stand this month," and folding them together made room for Body without
   growing the bar past seven. */
const SCREENS = [
  { id: 'today', label: 'Log', icon: 'logMark', render: (s) => renderToday(s) },
  { id: 'train', label: 'Train', icon: 'dumbbell', render: (s) => renderTrain(s) },
  { id: 'streaks', label: 'Streaks', icon: 'flame', render: (s) => renderStreaks(s) },
  { id: 'body', label: 'Body', icon: 'bodyweight', render: (s) => renderWeight(s) },
  /* Tab label is short on purpose — "Progress" is what the screen itself is
     titled, but at 8 characters it was the one label that clipped in a
     7-wide bar (everything else tops out at 7, like "Streaks"/"History"). */
  { id: 'progress', label: 'Ranks', icon: 'shield', render: (s) => renderProgress(s) },
  { id: 'history', label: 'History', icon: 'chartLine', render: (s) => renderHistory(s) },
  { id: 'analyze', label: 'Data', icon: 'analyze', render: (s) => renderAnalyze(s, refresh) },
];

export function start() {
  store.load();
  store.save();   // first run: write the starting habits down straight away
  document.body.insertAdjacentHTML('beforeend', '<div id="toasts"></div><div id="confetti"></div>');
  buildShell();
  bindTabs();
  refresh();

  /* If the app is left open overnight, roll to the new day on return. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = store.todayKey();
    if (t !== R?.endDay) { viewDay = t; viewMonth = store.monthOf(t); refresh(); }
  });
}

/** Build the screen containers and the tab bar from SCREENS. */
function buildShell() {
  const app = el('app');
  const nav = $('.tabbar');
  app.innerHTML = SCREENS.map((s) => `<section class="screen${s.id === current ? ' active' : ''}" id="screen-${s.id}"></section>`).join('');
  nav.innerHTML = SCREENS.map((s) => `
    <button data-tab="${s.id}" class="${s.id === current ? 'active' : ''}">
      <span class="ico">${icon(s.icon, 21)}</span>${s.label}
    </button>`).join('');
}

/** Switch tabs programmatically — the click handler below is one caller,
    the History calendar's "log weight for this day" jump is the other. */
function goToTab(id) {
  current = id;
  document.querySelectorAll('.tabbar button').forEach((x) => x.classList.toggle('active', x.dataset.tab === id));
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${id}`));
  window.scrollTo({ top: 0, behavior: 'instant' });
  refresh();
}

function bindTabs() {
  document.querySelectorAll('.tabbar button').forEach((b) => {
    b.addEventListener('click', () => goToTab(b.dataset.tab));
  });
}

/* compute() replays your entire history from the first day every time it
   runs, which is what makes backfilling a missed day genuinely repair the
   streak it belonged to. That is worth paying for when the data changes —
   but switching tabs does not change the data, and refresh() runs on every
   single tap. So the result is kept until something actually writes.

   `dirty` is set by store's own save listener, the same mechanism the
   metrics caches already use, so nothing can change the data without
   invalidating this. The endDay check covers the other way it can go
   stale: the app being left open until after midnight. */
let dirty = true;
store.subscribe(() => {
  dirty = true;
  /* The flattened workout records are derived from the same data. */
  invalidateRecords();
});

/** Recompute if anything changed, then redraw the visible screen. */
export function refresh() {
  const state = store.get();
  if (dirty || !R || R.endDay !== store.todayKey()) {
    R = compute(state);
    dirty = false;
  }
  const screen = SCREENS.find((s) => s.id === current) || SCREENS[0];
  screen.render(state);
  fireCelebrations(state);
}

/* ============================================================================
   SCREEN 1 — TODAY. The one that has to be effortless.
   ========================================================================== */

function renderToday(state) {
  const today = store.todayKey();
  if (viewDay > today) viewDay = today;
  const d = R.byDay[viewDay] || { rows: [], pot: 0, earned: 0, reclaimed: 0, total: 0 };
  const prev = R.byDay[store.addDays(viewDay, -1)];
  const isToday = viewDay === today;

  const pot = d.pot || state.settings.dailyTotal;
  const pct = pot ? Math.min(1, d.earned / pot) : 0;
  const circ = 2 * Math.PI * 46;

  const habitsById = Object.fromEntries(state.habits.map((h) => [h.id, h]));

  /* --- header: which day am I looking at --- */
  const head = `
    <div class="dayhead">
      <button class="nav" id="dayPrev" aria-label="Previous day">${icon('chevronLeft', 18)}</button>
      <div class="label">
        <b>${isToday ? 'Today' : store.dayLabel(viewDay, { weekday: 'long' })}</b>
        <span>${store.dayLabel(viewDay, { month: 'long', day: 'numeric' })}${isToday ? '' : ' · catching up'}</span>
      </div>
      <button class="nav" id="dayNext" aria-label="Next day" ${isToday ? 'disabled' : ''}>${icon('chevronRight', 18)}</button>
    </div>`;

  /* --- the score ring --- */
  const score = `
    <div class="card scorecard">
      <div class="ring">
        <svg width="108" height="108" viewBox="0 0 108 108">
          <defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#8A6410"/><stop offset="0.5" stop-color="#D4AF37"/><stop offset="1" stop-color="#F0D67A"/>
          </linearGradient></defs>
          <circle class="track" cx="54" cy="54" r="46" fill="none" stroke-width="9"/>
          <circle class="fill" cx="54" cy="54" r="46" fill="none" stroke-width="9" stroke-linecap="round"
                  stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"/>
        </svg>
        <div class="val"><b>${round(d.earned)}</b><span>of ${round(pot)}</span></div>
      </div>
      <div class="scoremeta">
        <div class="headline">${esc(dayHeadline(d, isToday))}</div>
        <div class="note">${esc(dayNote(d, state, isToday))}</div>
        ${d.reclaimed > 0.01 ? `<div class="reclaim-chip">+${round(d.reclaimed)} reclaimed</div>` : ''}
      </div>
    </div>`;

  /* --- the checklist --- */
  const rows = d.rows.map((row) => {
    const h = habitsById[row.habitId];
    if (!h) return '';
    /* "Boosted" means you're actually off this habit right now — not merely
       that the weight is still easing back down after a comeback. */
    const st = row.gapEntering;
    const boosted = st >= 1 && !row.success;
    const upPct = row.baseline > 0 ? Math.round(((row.available - row.baseline) / row.baseline) * 100) : 0;

    /* The nudge that makes the escalation legible instead of magic. */
    const prevRow = prev?.byHabit[row.habitId];
    const reclaimable = prevRow ? state.settings.redemptionShare * prevRow.available * (1 - prevRow.fraction) : 0;
    const note = boosted ? `
      <div class="boost-note">
        Off this for ${st} ${st === 1 ? 'day' : 'days'} — so today it's worth <b>${round(row.available)} points</b>${upPct > 0 ? `, ${upPct}% above normal` : ''}.
        ${st === 1 && reclaimable > 0.5
          ? `Tick it and you also reclaim <b>${round(reclaimable)}</b> of yesterday's points.`
          : 'The longer you\'re off it, the bigger the pull back.'}
      </div>` : '';

    /* Tick boxes sit beside the name. Both scale flavours get their own
       full-width row underneath — the rating buttons, or a +/- counter for
       things like counting cups of water toward a goal. */
    let control;
    if (h.type === 'scale' && h.inputStyle === 'counter' && h.nutritionLink) {
      /* A linked counter is entirely derived from the Nutrition section —
         see nutrition.js's syncNutritionLinks(). Tapping it here would just
         get silently overwritten the next time a meal is logged, so the
         +/- and "Enter an amount" are replaced with a plain readout and a
         jump straight to where the real editing happens. */
      const amt = row.value;
      const unitTxt = h.unit ? ` ${esc(h.unit)}` : '';
      const goal = store.effectiveGoal(h, state.settings);
      control = `
        <div class="counter locked" data-habit="${h.id}">
          <button class="ctr-btn minus" disabled aria-hidden="true">${icon('minus', 18)}</button>
          <div class="fill">
            <div class="lbl"><b>${amt == null ? '—' : amt}${amt == null ? '' : unitTxt}</b><span>of ${goal}${unitTxt}</span></div>
            <div class="bar ${row.success ? 'good' : ''}"><i style="width:${(Math.min(1, (amt || 0) / goal) * 100).toFixed(1)}%"></i></div>
          </div>
          <button class="ctr-btn plus" disabled aria-hidden="true">${icon('plus', 18)}</button>
        </div>
        <button type="button" class="addset ctr-food" data-habit="${h.id}">${icon('utensils', 12)} Log food to fill this in</button>`;
    } else if (h.type === 'scale' && h.inputStyle === 'counter') {
      const amt = row.value || 0;
      const cups = Math.round(amt / (h.step || 1));
      const stepWord = h.stepLabel || 'tap';
      const stepWordPlural = `${stepWord}${cups === 1 ? '' : 's'}`;
      const unitTxt = h.unit ? ` ${esc(h.unit)}` : '';
      control = `
        <div class="counter" data-habit="${h.id}" data-step="${h.step}">
          <button class="ctr-btn minus" data-dir="-1" aria-label="Remove a ${esc(stepWord)}">${icon('minus', 18)}</button>
          <div class="fill">
            <div class="lbl"><b>${cups} ${esc(stepWordPlural)}</b><span>${amt}${unitTxt} of ${h.max}${unitTxt}</span></div>
            <div class="bar ${row.success ? 'good' : ''}"><i style="width:${(Math.min(1, amt / h.max) * 100).toFixed(1)}%"></i></div>
          </div>
          <button class="ctr-btn plus ${amt >= h.max ? 'maxed' : ''}" data-dir="1" aria-label="Add a ${esc(stepWord)}">${icon('plus', 18)}</button>
        </div>
        <button type="button" class="addset ctr-enter" data-habit="${h.id}">${icon('pencil', 12)} Enter an amount</button>`;
    } else if (h.type === 'scale') {
      const scaleMax = h.max || 5;
      const scaleVals = Array.from({ length: scaleMax }, (_, i) => i + 1);
      control = `<div class="scale" data-habit="${h.id}">${scaleVals.map((n) => `
          <button data-val="${n}" class="${row.value === n ? `on ${n < h.threshold ? 'low' : ''}` : ''}">${n}</button>`).join('')}</div>`;
    } else {
      control = `<button class="check ${row.success ? 'on' : ''}" data-habit="${h.id}" aria-label="${esc(h.name)}">${icon('check', 22)}</button>`;
    }

    /* On today we show the live streak; on a past day, the streak as it stood
       at the end of that day. */
    const streakNow = isToday
      ? (R.habitStats[h.id]?.current || 0)
      : (row.success ? row.streakEntering + 1 : 0);
    /* Counter habits already show their own amount/goal in the control
       below, so there's nothing to repeat here — only ratings need it. */
    const meta = [
      `<span class="${boosted ? 'up' : 'pts'}">${round(row.available)} pts</span>`,
      streakNow > 0 ? `<span class="flame">${icon('flame', 12)}${streakNow}</span>` : '',
      h.type === 'scale' && h.inputStyle !== 'counter' ? `<span>${row.value ? `rated ${row.value}/${h.max}` : `rate 1–${h.max}`}</span>` : '',
    ].filter(Boolean).join('');

    /* "scaled" wraps both the rating buttons and the counter onto their own
       row below the name — the same layout need, so they share the class. */
    return `
      <div class="habit ${row.success ? 'done' : ''} ${boosted ? 'boosted' : ''} ${h.type === 'scale' ? 'scaled' : ''}">
        <div class="emoji">${glyph(h)}</div>
        <div class="body"><div class="name">${esc(h.name)}</div><div class="meta">${meta}</div></div>
        ${control}
      </div>${note}`;
  }).join('');

  el('screen-today').innerHTML = `
    <div class="topbar">
      <h1>Daily log<div class="sub">${state.habits.filter((h) => !h.archived).length} habits · ${round(pot)} points a day</div></h1>
      <button class="icon-btn" id="openSettings" aria-label="Settings">${icon('gear', 19)}</button>
    </div>
    ${head}${score}
    ${d.rows.length ? rows : `<div class="empty"><div class="big">${icon('target', 34)}</div>No habits yet. Open settings to add your first one.</div>`}
    ${miniTier(R)}
  `;

  /* --- wire it up --- */
  el('dayPrev').onclick = () => { viewDay = store.addDays(viewDay, -1); renderToday(store.get()); };
  el('dayNext').onclick = () => { if (viewDay < today) { viewDay = store.addDays(viewDay, 1); renderToday(store.get()); } };
  el('openSettings').onclick = openSettings;

  document.querySelectorAll('#screen-today .check').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.habit;
      const on = store.getEntry(viewDay, id) === 1;
      store.setEntry(viewDay, id, on ? null : 1);
      buzz();
      refresh();
    };
  });
  document.querySelectorAll('#screen-today .scale button').forEach((b) => {
    b.onclick = () => {
      const id = b.parentElement.dataset.habit;
      const val = +b.dataset.val;
      store.setEntry(viewDay, id, store.getEntry(viewDay, id) === val ? null : val);
      buzz();
      refresh();
    };
  });
  document.querySelectorAll('#screen-today .counter .ctr-btn').forEach((b) => {
    b.onclick = () => {
      const wrap = b.closest('.counter');
      const id = wrap.dataset.habit;
      const step = +wrap.dataset.step || 1;
      const cur = store.getEntry(viewDay, id) || 0;
      /* No upper cap. Points already top out on their own once you hit the
         goal — fractionOf() clamps at 1 — but the number you log is your
         own record, and plenty of people track past 100% on purpose (extra
         protein, extra water). The app shouldn't refuse to count it just
         because the goal's been met. */
      const next = Math.max(0, cur + (+b.dataset.dir) * step);
      /* Back to zero means "not logged" again, same as every other habit —
         not a real 0 worth remembering. */
      store.setEntry(viewDay, id, next > 0 ? next : null);
      buzz();
      refresh();
    };
  });
  document.querySelectorAll('#screen-today .ctr-enter').forEach((b) => {
    b.onclick = () => openCounterEntrySheet(b.dataset.habit);
  });
  document.querySelectorAll('#screen-today .ctr-food').forEach((b) => {
    b.onclick = () => {
      const day = viewDay;
      showNutritionSection();
      goToTab('body');
      openFoodEntrySheet(store.get(), day, null, refresh);
    };
  });
}

/** A counter habit's "Enter an amount" sheet — the fast path for a goal
    that would otherwise take dozens of taps to reach (145g of protein is
    145 taps at 1g a tap). Whatever you type is ADDED to today's running
    total, same direction as the +/- buttons, just in bigger steps. */
function openCounterEntrySheet(habitId) {
  const state = store.get();
  const h = state.habits.find((x) => x.id === habitId);
  if (!h) return;
  const cur = store.getEntry(viewDay, habitId) || 0;
  const unitTxt = h.unit ? ` ${esc(h.unit)}` : '';

  const close = modal(`
    <h3>Add to ${esc(h.name)}</h3>
    <div class="lede">Currently ${cur}${unitTxt} of ${h.max}${unitTxt}. This adds to that — it doesn't replace it.</div>
    <div class="field">
      <label>Amount to add${h.unit ? ` (${esc(h.unit)})` : ''}</label>
      <input type="number" inputmode="decimal" id="ctrAmt" placeholder="e.g. 40">
    </div>
    <button class="btn primary" id="ctrAdd">Add</button>
    <button class="btn ghost" id="ctrCancel">Cancel</button>`);

  const input = el('ctrAmt');
  input.focus();

  const submit = () => {
    const raw = input.value.trim();
    const add = +raw;
    if (raw === '' || !Number.isFinite(add)) { input.focus(); return; }
    /* Same no-upper-cap rule as the tap buttons — this is a bigger step,
       not a different rule. Floored at 0 so a large negative correction
       can't leave the day in a confusing negative state. */
    const next = Math.max(0, cur + add);
    store.setEntry(viewDay, habitId, next > 0 ? next : null);
    close();
    buzz();
    refresh();
  };
  el('ctrAdd').onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  el('ctrCancel').onclick = close;
}

function dayHeadline(d, isToday) {
  if (!d.rows.length) return 'Nothing tracked yet';
  const pct = d.pot ? d.earned / d.pot : 0;
  if (d.complete) return 'Clean sweep. Every single one.';
  if (pct >= 0.8) return 'Strong day.';
  if (pct >= 0.5) return 'Good chunk of it done.';
  if (pct > 0) return 'On the board.';
  return isToday ? 'Fresh start. Tap what you have done.' : 'Nothing logged this day.';
}

function dayNote(d, state, isToday) {
  const left = d.rows.filter((r) => !r.success);
  if (!d.rows.length) return 'Add habits in settings to start scoring days.';
  if (d.complete) return 'Full pot. Nothing left on the table.';
  const biggest = left.slice().sort((a, b) => b.available - a.available)[0];
  const h = state.habits.find((x) => x.id === biggest?.habitId);
  if (!h) return '';
  return isToday
    ? `${left.length} left. ${h.name} is the biggest one on the table at ${round(biggest.available)} points.`
    : `${left.length} unlogged. You can still fill this day in.`;
}

/** A one-line "where am I this month" strip at the bottom of the log screen. */
function miniTier(day) {
  const m = day.month;
  if (!m) return '';
  const cur = m.achieved >= 0 ? m.tiers[m.achieved] : null;
  const next = m.next;
  const goal = next || m.comeback;
  if (!goal) return '';
  const label = next
    ? `${round(next.remaining)} points to ${next.name}`
    : `${round(m.comeback.remaining)} points to Second Wind`;
  const prog = next
    ? Math.min(1, m.total / next.threshold)
    : m.comeback.progress;
  return `
    <div class="card tight" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <b style="font-size:13.5px">${cur ? esc(cur.name) : 'Climbing'}</b>
        <span style="font-size:12px;color:var(--muted)">${esc(label)}</span>
      </div>
      <div class="bar"><i style="width:${(prog * 100).toFixed(1)}%"></i></div>
    </div>`;
}

/* ============================================================================
   SCREEN 2 — STREAKS. One per habit, never one combined.
   ========================================================================== */

function renderStreaks(state) {
  const active = state.habits.filter((h) => !h.archived);
  const last14 = store.rangeDays(store.addDays(R.endDay, -13), R.endDay);

  const cards = active.map((h) => {
    const s = R.habitStats[h.id] || {};
    const dots = last14.map((dk) => {
      const row = R.byDay[dk]?.byHabit[h.id];
      if (!row) return '<i class="none"></i>';
      if (row.success) return '<i class="hit"></i>';
      if (row.fraction > 0) return '<i class="part"></i>';
      return `<i class="${row.logged ? 'miss' : 'none'}"></i>`;
    }).join('');

    const cls = s.current > 0 ? (s.atRisk ? 'hot risk' : 'hot') : 'cold';
    let sub;
    if (s.doneToday) sub = s.current === s.best && s.best > 1 ? 'Your best run yet — keep going.' : `Best: ${s.best} days`;
    else if (s.atRisk) sub = `Still alive — log it today to make it ${s.current + 1}.`;
    else if (s.gap === 1) sub = `One day off. Today is worth ${round(s.available)} and reclaims points.`;
    else if (s.gap > 1) sub = `${s.gap} days off. Worth ${round(s.available)} today — the pull back is strongest now.`;
    else sub = `Best: ${s.best} days`;

    return `
      <div class="streak ${cls}">
        <div class="emoji">${glyph(h, 18)}</div>
        <div class="body">
          <div class="name">${esc(h.name)}</div>
          <div class="sub">${esc(sub)}</div>
          <div class="dots">${dots}</div>
        </div>
        <div class="count"><b>${s.current || 0}</b><span>${s.current === 1 ? 'day' : 'days'}</span></div>
      </div>`;
  }).join('');

  const totalBest = Math.max(0, ...active.map((h) => R.habitStats[h.id]?.best || 0));
  const live = active.filter((h) => (R.habitStats[h.id]?.current || 0) > 0).length;

  el('screen-streaks').innerHTML = `
    <div class="topbar"><h1>Streaks<div class="sub">Each habit keeps its own — one slip never resets the rest</div></h1></div>
    <div class="card">
      <div class="stat-row">
        <div class="stat"><b>${live}</b><span>Live streaks</span></div>
        <div class="stat"><b>${totalBest}</b><span>Longest ever</span></div>
        <div class="stat"><b>${round(R.month?.percentOfMax * 100 || 0)}%</b><span>Month so far</span></div>
      </div>
    </div>
    ${active.length ? cards : `<div class="empty"><div class="big">${icon('target', 34)}</div>No habits yet.</div>`}
    <div class="section-title">Last 14 days</div>
    <div class="card tight"><div class="hint">
      <span style="color:var(--good)">■</span> done ·
      <span style="color:var(--accent)">■</span> partial ·
      <span style="color:#364059">■</span> missed ·
      <span style="color:var(--card-2)">■</span> not logged
    </div></div>`;
}

/* ============================================================================
   SCREEN 3 — PROGRESS. The month's tier roadmap, and the badge collection
   beneath it — combined into one tab since both answer "where do I stand."
   ========================================================================== */

function renderProgress(state) {
  const m = R.months[viewMonth] || R.month;
  if (!m) { el('screen-progress').innerHTML = '<div class="empty">No data yet.</div>'; return; }

  const rows = m.tiers.map((t) => {
    const cls = t.reached ? 'reached' : (m.next && m.next.index === t.index ? 'next' : (t.locked ? 'locked' : ''));
    const prog = Math.min(1, m.total / t.threshold);
    const pill = t.reached ? '<span class="pill got">Earned</span>'
      : t.locked ? '<span class="pill next-month">Next month</span>'
      : (m.next && m.next.index === t.index ? '<span class="pill now">Next up</span>' : '');
    const need = t.reached
      ? `Cleared at ${round(t.threshold)} points`
      : t.locked
        ? `Needed ${round(t.threshold)} — out of reach this month, and that is fine.`
        : `${round(t.remaining)} points to go · ${round(t.threshold)} total`;
    return `
      <div class="tier-row ${cls}">
        ${renderBadge(t.art, 56, !t.reached)}
        <div class="info">
          <div class="name">${esc(t.name)} ${pill}</div>
          <div class="need">${esc(need)}</div>
          <div class="bar ${t.reached ? 'good' : ''}"><i style="width:${(prog * 100).toFixed(1)}%"></i></div>
        </div>
      </div>`;
  }).join('');

  /* The two encouraging notices: lockout framing, and the guardrail. */
  let notice = '';
  if (m.comeback) {
    notice = `<div class="notice warm">
      <b>Second Wind is open ${m.comeback.reached ? '— and earned' : ''}</b>
      This month got away from you early, so the ladder made room: finish with
      <b>${round(m.comeback.goal)}</b> points and you take the Second Wind badge.
      ${m.comeback.reached ? 'Done. That badge is yours.' : `You are ${round(m.comeback.remaining)} away, and it is built to be reachable.`}
    </div>`;
  } else if (m.topLocked && m.isCurrent) {
    const best = [...m.tiers].reverse().find((t) => !t.locked);
    notice = `<div class="notice warm">
      <b>${esc(TIERS[TIERS.length - 1].name)} is out of range this month</b>
      Aim for it next month with a full run of days. ${best ? `<b>${esc(best.name)}</b> is very much still live` : 'There is still ground to take'} — the rest of the month still counts.
    </div>`;
  } else if (m.achieved === m.tiers.length - 1) {
    notice = `<div class="notice good"><b>Top of the ladder</b>You cleared ${esc(m.tiers[m.achieved].name)}. There is nothing above this one.</div>`;
  }

  const daysLeft = m.isCurrent ? m.days.filter((d) => d > R.endDay).length : 0;

  /* ---- badges section: was its own screen, now the second half of this one ---- */
  const earned = R.badges.earned.slice().sort((a, b) => (b.rank - a.rank) || (b.month > a.month ? 1 : -1));
  const permanent = earned.filter((b) => !b.provisional);
  const inPlay = earned.filter((b) => b.provisional);

  const cell = (b) => `
    <div class="badge-cell ${b.kind === 'meta' ? 'meta' : ''} ${b.provisional ? 'prov' : ''}">
      ${renderBadge(b.art, 74)}
      <div class="bname">${esc(b.name)}</div>
      <div class="bwhen">${esc(store.monthLabel(b.month, { month: 'short', year: '2-digit' }))}${b.provisional ? ' · in play' : ''}</div>
    </div>`;

  const top = permanent[0] || inPlay[0];

  el('screen-progress').innerHTML = `
    <div class="topbar">
      <h1>Progress<div class="sub">${esc(store.monthLabel(m.key))} · ${round(m.total)} of ${round(m.maxPossible)} possible${m.isCurrent ? ` · ${daysLeft} days left` : ''}</div></h1>
      <button class="icon-btn" id="tierPrev" aria-label="Previous month">${icon('chevronLeft', 18)}</button>
      <button class="icon-btn" id="tierNext" aria-label="Next month">${icon('chevronRight', 18)}</button>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px">
        <b>${round(m.percentOfMax * 100)}% of the month's maximum</b>
        <span style="font-size:12px;color:var(--muted)">${m.loggedDays} days logged</span>
      </div>
      <div class="bar cool"><i style="width:${(m.percentOfMax * 100).toFixed(1)}%"></i></div>
      ${m.isCurrent ? `<div class="hint" style="margin-top:9px">Still mathematically on the table: <b>${round(m.ceiling)}</b> points.</div>` : ''}
    </div>
    ${notice}
    <div class="section-title">The ladder</div>
    ${rows}
    ${metaStrip()}

    <div class="section-title">Badge collection</div>
    <div class="hint" style="margin:-4px 0 12px">${permanent.length} earned for good${inPlay.length ? ` · ${inPlay.length} still in play` : ''}</div>
    ${top ? `
      <div class="card badge-hero">
        ${renderBadge(top.art, 96)}
        <div class="txt">
          <h2>${esc(top.name)}</h2>
          <div class="hint">${esc(top.blurb)}</div>
          <div class="hint" style="margin-top:6px;color:var(--faint)">${esc(store.monthLabel(top.month))}</div>
        </div>
      </div>` : ''}

    ${inPlay.length ? `<div class="section-title">This month, still in play</div><div class="badge-grid">${inPlay.map(cell).join('')}</div>` : ''}
    ${permanent.length ? `<div class="section-title">Kept forever</div><div class="badge-grid">${permanent.map(cell).join('')}</div>`
      : `<div class="empty"><div class="big">${icon('shield', 34)}</div>No badges banked yet. Finish a month above the first tier and it lands here permanently.</div>`}

    <div class="section-title">Still to find</div>
    <div class="badge-grid">
      ${TIERS.filter((t) => !earned.some((b) => b.name === t.name)).map((t) => `
        <div class="badge-cell">${renderBadge(t.art, 74, true)}<div class="bname">${esc(t.name)}</div><div class="bwhen">Monthly tier</div></div>`).join('')}
      ${META_BADGES.filter((t) => !earned.some((b) => b.name === t.name)).map((t) => `
        <div class="badge-cell">${renderBadge(t.art, 74, true)}<div class="bname">${esc(t.name)}</div><div class="bwhen">${t.months} months running</div></div>`).join('')}
    </div>`;

  el('tierPrev').onclick = () => { viewMonth = prevKey(viewMonth); ensureMonth(); renderProgress(store.get()); };
  el('tierNext').onclick = () => { viewMonth = nextKey(viewMonth); ensureMonth(); renderProgress(store.get()); };
}

function prevKey(k) { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function nextKey(k) { const [y, m] = k.split('-').map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function ensureMonth() {
  const now = store.monthOf(store.todayKey());
  if (viewMonth > now) viewMonth = now;
  if (!R.months[viewMonth]) viewMonth = now;
}

/** The multi-month prestige progress strip. */
function metaStrip() {
  const b = R.badges;
  const qualify = TIERS[store.get().settings.metaQualifyTierIndex]?.name || 'a high tier';
  return `
    <div class="section-title">Prestige chain</div>
    <div class="card">
      <div class="hint" style="margin-bottom:10px">
        Reach <b>${esc(qualify)}</b> or higher in back-to-back months to unlock the rare badges.
        You do not need a perfect month — just a strong one.
      </div>
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-around">
        ${META_BADGES.map((mb) => {
          const got = b.earned.some((x) => x.kind === 'meta' && x.name === mb.name);
          return `<div style="text-align:center">
            ${renderBadge(mb.art, 62, !got)}
            <div style="font-size:11.5px;font-weight:700;margin-top:5px">${esc(mb.name)}</div>
            <div style="font-size:10.5px;color:var(--faint)">${mb.months} months</div>
          </div>`;
        }).join('')}
      </div>
      <div class="bar" style="margin-top:14px"><i style="width:${Math.min(100, (b.chainLength / 12) * 100).toFixed(1)}%"></i></div>
      <div class="hint" style="margin-top:8px">
        ${b.chainLength > 0
          ? `<b>${b.chainLength}</b> qualifying ${b.chainLength === 1 ? 'month' : 'months'} in a row${b.nextMeta ? ` · ${Math.max(0, b.nextMeta.months - b.chainLength)} more for ${esc(b.nextMeta.name)}` : ''}.`
          : 'The chain starts with your first qualifying month.'}
      </div>
    </div>`;
}

/* ============================================================================
   SCREEN 4 — HISTORY. Weekly bars and a month calendar.
   ========================================================================== */

function renderHistory(state) {
  const weeks = weeklySeries(R, 8);

  /* Scaled against a perfect week rather than against your best week, so the
     bar heights mean the same thing every time you look. */
  const bars = weeks.map((w) => `
    <div class="col ${w.pct >= 0.85 ? 'good' : ''}">
      <i style="height:${Math.max(3, w.pct * 100)}%" title="${round(w.total)} of ${round(w.max)}"></i>
      <small>${store.dayLabel(w.start, { month: 'numeric', day: 'numeric' })}</small>
    </div>`).join('');

  /* month calendar */
  const m = R.months[viewMonth] || R.month;
  const firstDow = (store.parseKey(m.days[0]).getDay() + 6) % 7;
  const cells = [
    ...Array(firstDow).fill('<div></div>'),
    ...m.days.map((dk) => {
      const r = R.byDay[dk];
      const pct = r && r.pot ? r.earned / r.pot : 0;
      const future = dk > R.endDay;
      /* Gold, not the pre-rebrand mint — this was the one spot the visual
         overhaul missed, since the colour lived in an inline style rather
         than a CSS variable. */
      const bg = r && r.anyLogged
        ? `background:rgba(212,175,55,${(0.10 + pct * 0.45).toFixed(2)})`
        : '';
      const bw = state.bodyLog?.[dk];
      const dot = bw ? `<span class="wdot ${bw.photo ? 'haspic' : ''}"></span>` : '';
      return `<div class="cell dayclick ${r?.anyLogged ? 'has' : ''} ${dk === R.endDay ? 'today' : ''} ${future ? 'future' : ''}" style="${bg}"
                data-day="${dk}"
                title="${store.dayLabel(dk)} — ${round(r?.total || 0)} pts${bw ? ' · weight logged' : ''}">${+dk.slice(8)}${dot}</div>`;
    }),
  ].join('');

  const monthList = Object.values(R.months)
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .map((mm) => {
      const t = mm.achieved >= 0 ? mm.tiers[mm.achieved] : null;
      return `
        <div class="streak">
          ${t ? renderBadge(t.art, 42) : '<div class="emoji">·</div>'}
          <div class="body">
            <div class="name">${esc(store.monthLabel(mm.key))}</div>
            <div class="sub">${t ? esc(t.name) : 'No tier reached'}${mm.comeback?.reached ? ' · Second Wind' : ''} · ${mm.loggedDays} days logged</div>
          </div>
          <div class="count"><b style="font-size:18px">${round(mm.percentOfMax * 100)}%</b><span>of max</span></div>
        </div>`;
    }).join('');

  el('screen-history').innerHTML = `
    <div class="topbar"><h1>History<div class="sub">How the weeks and months are stacking up</div></h1></div>
    <div class="card">
      <h2>Last 8 weeks</h2>
      <div class="hint" style="margin-bottom:12px">Share of each week's available points.</div>
      <div class="chart">${bars}</div>
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:11px">
        <h2 style="flex:1">${esc(store.monthLabel(m.key))}</h2>
        <button class="icon-btn" id="calPrev" aria-label="Previous month">${icon('chevronLeft', 18)}</button>
        <button class="icon-btn" id="calNext" aria-label="Next month">${icon('chevronRight', 18)}</button>
      </div>
      <div class="cal">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <div class="hint" style="margin-top:11px">Brighter gold means a bigger share of that day's points. A dot marks a day you logged your weight — a halo means a photo too. Tap any day to see it.</div>
    </div>
    <div class="section-title">Month by month</div>
    ${monthList}`;

  el('calPrev').onclick = () => { viewMonth = prevKey(viewMonth); ensureMonth(); renderHistory(store.get()); };
  el('calNext').onclick = () => { viewMonth = nextKey(viewMonth); ensureMonth(); renderHistory(store.get()); };
  document.querySelectorAll('#screen-history .cal .cell[data-day]').forEach((c) => {
    c.onclick = () => openDayDetail(store.get(), c.dataset.day);
  });
}

/** What a habit row is worth showing next to its name in the day-detail
    sheet — the same value a control on the Today screen would show, just
    as plain text since nothing here is editable. */
function habitStatusText(h, row, settings) {
  if (!row.logged) return 'Not logged';
  if (h.type === 'scale' && h.inputStyle === 'counter') {
    const unitTxt = h.unit ? ` ${h.unit}` : '';
    return `${row.value || 0}${unitTxt} of ${store.effectiveGoal(h, settings)}${unitTxt}`;
  }
  if (h.type === 'scale') return `Rated ${row.value}/${h.max}`;
  return row.success ? 'Done' : 'Not done';
}

/** A day tapped on the History calendar: what you accomplished — habits,
    any workout, your weight entry if there is one — with one-tap jumps into
    each so this doubles as a way back into the day itself. */
function openDayDetail(state, dk) {
  const r = R.byDay[dk];
  const entry = state.bodyLog?.[dk] || null;
  const isFuture = dk > R.endDay;
  const unit = state.settings.weightUnit || 'lb';

  const close = modal(isFuture ? `
    <h3>${esc(store.dayLabel(dk, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3>
    <div class="hint">This day hasn't happened yet.</div>
    <button class="btn ghost" id="dayClose" style="margin-top:14px">Close</button>` : (() => {
    const habitsById = Object.fromEntries(state.habits.map((h) => [h.id, h]));
    const headline = r && r.rows.length
      ? `${round(r.total)} of ${round(r.pot)} points${r.complete ? ' — a clean sweep.' : '.'}`
      : 'No habits logged this day.';

    const habitRows = (r?.rows || []).map((row) => {
      const h = habitsById[row.habitId];
      if (!h) return '';
      return `
        <div class="streak ${row.success ? 'hot' : ''}">
          <div class="emoji">${glyph(h, 18)}</div>
          <div class="body"><div class="name">${esc(h.name)}</div><div class="sub">${esc(habitStatusText(h, row, state.settings))}</div></div>
          <div class="count"><b style="font-size:18px">${round(row.earned)}</b><span>pts</span></div>
        </div>`;
    }).join('');

    const sessions = (state.sessions || []).filter((s) => s.day === dk);
    const sessionRows = sessions.map((s) => {
      const vol = sessionVolume(state, s);
      const sets = sessionSetCount(state, s);
      return `
        <div class="wcard" data-jumpsess="${esc(s.id)}">
          <div class="wc-body">
            <div class="wc-name">${esc(s.name)}</div>
            <div class="wc-sub">${s.finishedAt ? 'Finished' : 'In progress'} · ${sets} ${sets === 1 ? 'set' : 'sets'}${vol ? ` · ${Math.round(vol).toLocaleString()} ${esc(unit)}` : ''}</div>
          </div>
          <span class="wc-chev">${icon('chevronRight', 18)}</span>
        </div>`;
    }).join('');

    const weightBit = entry ? `
      <div class="day-weight">
        ${entry.photo ? `<img class="wthumb" src="${esc(entry.photo)}" alt="" id="dayPhotoThumb" style="cursor:pointer">` : `<div class="wthumb placeholder">${icon('bodyweight', 20)}</div>`}
        <div>
          <div class="dw-num">${entry.weight != null ? `${entry.weight} ${esc(unit)}` : 'Photo only'}</div>
          <div class="dw-sub">${entry.photo ? 'Tap the photo to view it full size' : 'No photo attached'}</div>
        </div>
      </div>
      <button class="btn" id="dayEditWeight" style="margin-top:10px">Edit this entry</button>`
      : `<button class="btn" id="dayLogWeight">${icon('bodyweight', 17)} Log weight for this day</button>`;

    const foodEntries = state.nutritionLog?.[dk] || [];
    const foodRows = foodEntries.map((e) => `
      <div class="wcard" data-jumpfood="${esc(e.id)}">
        <div class="wc-body">
          <div class="wc-name">${esc(e.name)}</div>
          <div class="wc-sub">${[
    e.calories != null ? `${Math.round(e.calories)} kcal` : '',
    e.protein != null ? `${Math.round(e.protein)}g protein` : '',
    e.carbs != null ? `${Math.round(e.carbs)}g carbs` : '',
    e.fat != null ? `${Math.round(e.fat)}g fat` : '',
  ].filter(Boolean).join(' · ') || 'No macros logged'}</div>
        </div>
        <span class="wc-chev">${icon('chevronRight', 18)}</span>
      </div>`).join('');

    return `
      <h3>${esc(store.dayLabel(dk, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3>
      <div class="hint" style="margin-bottom:14px">${headline}</div>

      ${habitRows ? `<div class="section-title" style="margin-top:0">Habits</div>${habitRows}` : ''}

      <div class="section-title">Workout</div>
      ${sessionRows || '<div class="hint" style="margin-bottom:10px">No workout logged this day.</div>'}

      <div class="section-title">Weight</div>
      ${weightBit}

      <div class="section-title">Nutrition</div>
      ${foodRows || '<div class="hint" style="margin-bottom:10px">Nothing logged this day.</div>'}
      <button class="btn" id="dayLogFood" style="margin-top:${foodRows ? '0' : '10px'}">${icon('utensils', 17)} Log food for this day</button>

      <button class="btn primary" id="dayOpenLog" style="margin-top:16px">Open daily log for this day</button>
      <button class="btn ghost" id="dayClose" style="margin-top:10px">Close</button>`;
  })());

  if (isFuture) { el('dayClose').onclick = close; return; }

  if (entry?.photo) el('dayPhotoThumb').onclick = () => openPhotoViewer(entry.photo);
  const jumpToWeight = () => {
    close();
    goToTab('body');
    openBodyEntrySheet(store.get(), dk, () => refresh());
  };
  if (entry) el('dayEditWeight').onclick = jumpToWeight;
  else el('dayLogWeight').onclick = jumpToWeight;

  document.querySelectorAll('.modal [data-jumpsess]').forEach((c) => {
    c.onclick = () => {
      close();
      openTrainSession(c.dataset.jumpsess);
      goToTab('train');
    };
  });

  document.querySelectorAll('.modal [data-jumpfood]').forEach((c) => {
    c.onclick = () => {
      const foodEntry = (state.nutritionLog?.[dk] || []).find((x) => x.id === c.dataset.jumpfood);
      close();
      showNutritionSection();
      goToTab('body');
      openFoodEntrySheet(store.get(), dk, foodEntry, () => refresh());
    };
  });
  el('dayLogFood').onclick = () => {
    close();
    showNutritionSection();
    goToTab('body');
    openFoodEntrySheet(store.get(), dk, null, () => refresh());
  };

  el('dayOpenLog').onclick = () => {
    close();
    viewDay = dk;
    goToTab('today');
  };
  el('dayClose').onclick = close;
}

/* ============================================================================
   SETTINGS — habits, weights, tuning, backup. All of it, no code required.
   ========================================================================== */

function openSettings() {
  const state = store.get();
  const s = state.settings;
  const sumBase = state.habits.filter((h) => !h.archived).reduce((a, h) => a + h.weight, 0) || 1;

  const habitRows = state.habits.map((h, i) => `
    <div class="weight-row" data-id="${h.id}" style="${h.archived ? 'opacity:.5' : ''}">
      <div class="emoji">${glyph(h, 18)}</div>
      <div class="body">
        <div class="name">${esc(h.name)}${h.archived ? ' · retired' : ''}</div>
        <div class="share">${h.archived ? 'not counted' : `${((h.weight / sumBase) * s.dailyTotal).toFixed(1)} points a day · weight ${h.weight}`}</div>
        ${h.archived ? '' : `<input type="range" min="1" max="40" value="${h.weight}" data-w="${h.id}">`}
      </div>
      <div class="tools">
        <button data-up="${h.id}" ${i === 0 ? 'disabled style="opacity:.3"' : ''} aria-label="Move up">${icon('arrowUp', 15)}</button>
        <button data-edit="${h.id}" aria-label="Edit">${icon('pencil', 15)}</button>
      </div>
    </div>`).join('');

  const body = `
    <h3>Settings</h3>
    <div class="lede">Everything about how the app scores you lives here. Change anything — the whole history recalculates instantly.</div>

    <div class="section-title" style="margin-top:0">Your habits</div>
    <div class="hint" style="margin-bottom:11px">
      Drag a slider to change how much a habit is worth. The day is always out of
      <b>${s.dailyTotal}</b> points — raising one habit just takes a bigger slice of the same pot.
    </div>
    ${habitRows}
    <button class="btn primary" id="addHabit">+ Add a habit</button>

    <div class="section-title">Scoring</div>
    <div class="row2">
      <div class="field">
        <label>Points per day</label>
        <input type="number" id="setTotal" min="10" max="1000" step="10" value="${s.dailyTotal}">
        <div class="help">The fixed daily pot.</div>
      </div>
      <div class="field">
        <label>Recovery days</label>
        <input type="number" id="setRecovery" min="1" max="14" value="${s.recoveryDays}">
        <div class="help">How long a boosted habit takes to settle back to normal.</div>
      </div>
    </div>
    <div class="row2">
      <div class="field">
        <label>Escalation per missed day</label>
        <input type="number" id="setEsc" min="0" max="1" step="0.02" value="${s.escalationStep}">
        <div class="help">${Math.round(s.escalationStep * 100)}% more weight for each day off it, capped at double.</div>
      </div>
      <div class="field">
        <label>Next-day reclaim</label>
        <input type="number" id="setRedeem" min="0" max="1" step="0.05" value="${s.redemptionShare}">
        <div class="help">Share of a missed day's points you win back by going straight again.</div>
      </div>
    </div>

    <div class="section-title">Tier thresholds</div>
    <div class="hint" style="margin-bottom:11px">Each is a percentage of the month's maximum possible points.</div>
    ${TIERS.map((t, i) => `
      <div class="field">
        <label>${esc(t.name)}</label>
        <input type="number" id="tp${i}" min="1" max="100" step="1" value="${Math.round((s.tierPercents[i] ?? 0.5) * 100)}">
      </div>`).join('')}
    <div class="field">
      <label>Prestige qualifies at</label>
      <select id="setQualify">
        ${TIERS.map((t, i) => `<option value="${i}" ${i === s.metaQualifyTierIndex ? 'selected' : ''}>${esc(t.name)} or higher</option>`).join('')}
      </select>
      <div class="help">Months at this tier or above build the 3 / 6 / 12-month chain.</div>
    </div>

    <div class="section-title">Backup</div>
    <div class="hint" style="margin-bottom:11px">
      Your data lives only on this phone. Export now and then and keep the file somewhere safe — it is also how you move to a new phone.
    </div>
    <button class="btn" id="doExport">${icon('download', 17)} Export backup file</button>
    <button class="btn" id="doImport">${icon('upload', 17)} Restore from backup</button>
    <input type="file" id="importFile" accept="application/json" hidden>
    <button class="btn danger" id="doReset">Erase everything and start over</button>

    <button class="btn ghost" id="closeSettings" style="margin-top:18px">Done</button>`;

  const close = modal(body);

  /* weights */
  document.querySelectorAll('[data-w]').forEach((r) => {
    r.oninput = () => {
      store.updateHabit(r.dataset.w, { weight: +r.value });
      const row = r.closest('.weight-row');
      const st = store.get();
      const total = st.habits.filter((h) => !h.archived).reduce((a, h) => a + h.weight, 0) || 1;
      $('.share', row).textContent = `${((+r.value / total) * st.settings.dailyTotal).toFixed(1)} points a day · weight ${r.value}`;
    };
    r.onchange = () => { refresh(); };
  });
  document.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => { store.moveHabit(b.dataset.up, -1); close(); openSettings(); }; });
  document.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => { close(); editHabit(b.dataset.edit); }; });
  el('addHabit').onclick = () => { close(); editHabit(null); };

  const num = (id, key, min, max) => {
    el(id).onchange = () => {
      const v = Math.max(min, Math.min(max, +el(id).value));
      store.update((st) => { st.settings[key] = v; });
      refresh();
    };
  };
  num('setTotal', 'dailyTotal', 10, 1000);
  num('setRecovery', 'recoveryDays', 1, 14);
  num('setEsc', 'escalationStep', 0, 1);
  num('setRedeem', 'redemptionShare', 0, 1);

  TIERS.forEach((_, i) => {
    el(`tp${i}`).onchange = () => {
      store.update((st) => {
        const p = st.settings.tierPercents.slice();
        p[i] = Math.max(0.01, Math.min(1, +el(`tp${i}`).value / 100));
        st.settings.tierPercents = p.sort((a, b) => a - b);
      });
      refresh();
    };
  });
  el('setQualify').onchange = () => {
    store.update((st) => { st.settings.metaQualifyTierIndex = +el('setQualify').value; });
    refresh();
  };

  el('doExport').onclick = () => { store.exportBackup(); toast({ tone: 'streak', glyph: 'download', title: 'Backup saved', body: 'Keep it somewhere safe.' }); };
  el('doImport').onclick = () => el('importFile').click();
  el('importFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await store.importBackup(f);
      close();
      refresh();
      toast({ tone: 'streak', glyph: 'check', title: 'Backup restored', body: 'Everything is back.' });
    } catch (err) {
      alert(`Could not read that file.\n\n${err.message}`);
    }
  };
  el('doReset').onclick = () => {
    if (!confirm('Erase every habit and every logged day permanently?')) return;
    if (!confirm('Really sure? This cannot be undone.')) return;
    store.hardReset();
    close();
    refresh();
  };
  el('closeSettings').onclick = close;
}

/** Add or edit one habit. */
/** Which of the four input kinds a habit currently is, for the editor. */
function habitKind(h) {
  if (!h || h.type === 'binary') return 'binary';
  if (h.inputStyle === 'counter' && h.goalSource === 'tdee') return 'calorieBudget';
  return h.inputStyle === 'counter' ? 'counter' : 'rating';
}

function editHabit(id) {
  const state = store.get();
  const h = id ? state.habits.find((x) => x.id === id) : null;
  const kind = habitKind(h);
  /* Start on the habit's current icon when it's one of ours; a habit still
     carrying an unmapped emoji just starts the picker unselected. */
  let startIcon = h && hasIcon(h.icon) ? h.icon : (h ? '' : 'star');
  let chosenIcon = startIcon;

  const close = modal(`
    <h3>${h ? 'Edit habit' : 'New habit'}</h3>
    <div class="lede">${h ? 'Change anything. Past days keep the scores they already had.' : 'It starts counting from today — no retroactive misses.'}</div>
    <div class="field">
      <label>Name</label>
      <input type="text" id="hName" value="${h ? esc(h.name) : ''}" placeholder="e.g. Tracked my food">
    </div>
    <div class="field">
      <label>Weight</label>
      <input type="number" id="hWeight" min="1" max="40" value="${h ? h.weight : 10}">
      <div class="help">Bigger = a larger slice of the daily pot.</div>
    </div>
    <div class="field">
      <label>Icon</label>
      <div class="icon-grid" id="hIconGrid">
        ${PICKER_ICONS.map((k) => `
          <button type="button" class="icon-pick ${startIcon === k ? 'on' : ''}" data-icon="${k}" aria-label="${k}">${icon(k, 20)}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <label>Type</label>
      <select id="hType">
        <option value="binary" ${kind === 'binary' ? 'selected' : ''}>Did it / didn't (a tick box)</option>
        <option value="rating" ${kind === 'rating' ? 'selected' : ''}>Rate it on a scale (like sleep)</option>
        <option value="counter" ${kind === 'counter' ? 'selected' : ''}>Count up to a goal (like ounces of water)</option>
        <option value="calorieBudget" ${kind === 'calorieBudget' ? 'selected' : ''}>Calorie budget (stay under TDEE − deficit)</option>
      </select>
    </div>
    <div class="field" id="scaleField" style="display:${kind === 'rating' ? 'block' : 'none'}">
      <label>Rating scale</label>
      <input type="number" id="hScaleMax" min="2" max="20" value="${h?.max ?? 5}">
      <div class="help">Rate it 1 through this number — sleep quality, mood, energy, anything subjective. Change it any time; past ratings keep the scale they were logged on.</div>
    </div>
    <div class="field" id="thresholdField" style="display:${kind === 'rating' ? 'block' : 'none'}">
      <label>Counts as a good day at</label>
      <input type="number" id="hThreshold" min="1" max="${h?.max ?? 5}" value="${h?.threshold ?? 3}">
      <div class="help">Points always scale smoothly with the rating; this is only the bar for the streak.</div>
    </div>
    <div id="counterFields" style="display:${kind === 'counter' ? 'block' : 'none'}">
      <div class="row2">
        <div class="field">
          <label>Unit</label>
          <input type="text" id="hUnit" value="${esc(h?.unit ?? 'oz')}" placeholder="oz">
        </div>
        <div class="field">
          <label>Each tap adds</label>
          <input type="number" id="hStep" min="0.1" step="0.1" value="${h?.step ?? 8}">
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <label>Goal to max out</label>
          <input type="number" id="hGoal" min="1" value="${h?.max ?? 150}">
        </div>
        <div class="field">
          <label>One tap is called a</label>
          <input type="text" id="hStepLabel" value="${esc(h?.stepLabel ?? 'cup')}" placeholder="cup">
        </div>
      </div>
      <div class="field">
        <label>Counts as a good day at</label>
        <input type="number" id="hCounterThreshold" min="1" value="${h?.threshold ?? h?.max ?? 150}">
        <div class="help">Usually the same as the goal — reaching it is what keeps the streak alive. Points still scale smoothly below that, one tap at a time.</div>
      </div>
      <div class="field">
        <label>Fill this in automatically from</label>
        <select id="hNutritionLink">
          <option value="" ${!h?.nutritionLink ? 'selected' : ''}>Nothing — tap it by hand</option>
          <option value="calories" ${h?.nutritionLink === 'calories' ? 'selected' : ''}>Calories logged on the Body tab</option>
          <option value="protein" ${h?.nutritionLink === 'protein' ? 'selected' : ''}>Protein logged on the Body tab</option>
          <option value="carbs" ${h?.nutritionLink === 'carbs' ? 'selected' : ''}>Carbs logged on the Body tab</option>
          <option value="fat" ${h?.nutritionLink === 'fat' ? 'selected' : ''}>Fat logged on the Body tab</option>
        </select>
        <div class="help">Linking it hands the counter over to your food log — logging a meal on the Body tab's Nutrition section fills this in, and the +/− here turn off.</div>
      </div>
    </div>
    <div id="calorieBudgetFields" style="display:${kind === 'calorieBudget' ? 'block' : 'none'}">
      <div class="hint" style="margin-bottom:11px">
        Fed entirely from calories logged on the Body tab's Nutrition section — there's nothing to tap by hand. Full credit any day you land at or under the budget below; going over costs credit gradually rather than all at once, the same "no cliffs" rule as everything else here.
      </div>
      <div class="row2">
        <div class="field">
          <label>Your average TDEE</label>
          <input type="number" id="hTdee" min="500" value="${state.settings.tdee}">
          <div class="help">One number for your whole profile — changing it here moves every calorie-budget goal, not just this one.</div>
        </div>
        <div class="field">
          <label>Desired daily deficit</label>
          <input type="number" id="hDeficit" min="0" value="${h?.deficitTarget ?? 500}">
        </div>
      </div>
      <div class="field">
        <div class="help">Today's budget: <b id="hBudgetPreview">${Math.max(1, state.settings.tdee - (h?.deficitTarget ?? 500))}</b> calories.</div>
      </div>
    </div>
    <button class="btn primary" id="saveHabit">${h ? 'Save changes' : 'Add habit'}</button>
    ${h ? `
      <button class="btn" id="retireHabit">${h.archived ? 'Bring it back' : 'Retire it (keeps history)'}</button>
      <button class="btn danger" id="deleteHabit">Delete it and its history</button>` : ''}
    <button class="btn ghost" id="cancelHabit">Cancel</button>
  `);

  el('hType').onchange = () => {
    const k = el('hType').value;
    el('scaleField').style.display = k === 'rating' ? 'block' : 'none';
    el('thresholdField').style.display = k === 'rating' ? 'block' : 'none';
    el('counterFields').style.display = k === 'counter' ? 'block' : 'none';
    el('calorieBudgetFields').style.display = k === 'calorieBudget' ? 'block' : 'none';
  };
  /* The "good day" bar can't exceed the scale itself — keep its ceiling (and
     a value left stranded above it) in step as the scale is edited. */
  el('hScaleMax').oninput = () => {
    const scaleMax = Math.max(2, Math.min(20, +el('hScaleMax').value || 2));
    el('hThreshold').max = String(scaleMax);
    if (+el('hThreshold').value > scaleMax) el('hThreshold').value = String(scaleMax);
  };
  const refreshBudgetPreview = () => {
    const tdee = Math.max(500, +el('hTdee').value || state.settings.tdee);
    const deficit = Math.max(0, +el('hDeficit').value || 0);
    el('hBudgetPreview').textContent = Math.max(1, tdee - deficit);
  };
  el('hTdee').oninput = refreshBudgetPreview;
  el('hDeficit').oninput = refreshBudgetPreview;
  document.querySelectorAll('#hIconGrid .icon-pick').forEach((b) => {
    b.onclick = () => {
      chosenIcon = b.dataset.icon;
      document.querySelectorAll('#hIconGrid .icon-pick').forEach((x) => x.classList.toggle('on', x === b));
    };
  });

  el('saveHabit').onclick = () => {
    const k = el('hType').value;
    const patch = {
      name: el('hName').value.trim() || 'Untitled',
      /* Only overwrite the saved glyph if a new one was actually chosen, so
         an unmapped emoji survives an edit that didn't touch the icon. */
      ...(chosenIcon ? { icon: chosenIcon, emoji: '' } : {}),
      weight: Math.max(1, Math.min(40, +el('hWeight').value || 10)),
    };
    if (k === 'binary') {
      Object.assign(patch, {
        type: 'binary', inputStyle: 'rating', nutritionLink: null, goalSource: 'fixed',
      });
    } else if (k === 'rating') {
      const scaleMax = Math.max(2, Math.min(20, +el('hScaleMax').value || 5));
      Object.assign(patch, {
        type: 'scale', inputStyle: 'rating', max: scaleMax, step: 1, unit: '', stepLabel: '', nutritionLink: null, goalSource: 'fixed',
        threshold: Math.max(1, Math.min(scaleMax, +el('hThreshold').value || Math.ceil(scaleMax / 2))),
      });
    } else if (k === 'calorieBudget') {
      const tdee = Math.max(500, +el('hTdee').value || state.settings.tdee);
      const deficit = Math.max(0, +el('hDeficit').value || 0);
      const budget = Math.max(1, tdee - deficit);
      /* TDEE is one number for your whole profile, not per-habit — saving it
         here updates every calorie-budget habit at once via effectiveGoal(). */
      store.update((st) => { st.settings.tdee = tdee; });
      Object.assign(patch, {
        type: 'scale', inputStyle: 'counter',
        goalSource: 'tdee',
        deficitTarget: deficit,
        max: budget,
        threshold: budget,
        step: 1,
        unit: 'cal',
        stepLabel: '',
        nutritionLink: 'calories',
      });
    } else {
      const goal = Math.max(1, +el('hGoal').value || 150);
      Object.assign(patch, {
        type: 'scale', inputStyle: 'counter', goalSource: 'fixed',
        max: goal,
        step: Math.max(0.1, +el('hStep').value || 1),
        unit: el('hUnit').value.trim(),
        stepLabel: el('hStepLabel').value.trim() || 'tap',
        threshold: Math.max(1, Math.min(goal, +el('hCounterThreshold').value || goal)),
        nutritionLink: el('hNutritionLink').value || null,
      });
    }
    if (h) store.updateHabit(h.id, patch); else store.addHabit(patch);
    close();
    refresh();
    openSettings();
  };
  if (h) {
    el('retireHabit').onclick = () => { store.archiveHabit(h.id, !h.archived); close(); refresh(); openSettings(); };
    el('deleteHabit').onclick = () => {
      if (!confirm(`Delete "${h.name}" and every day it was logged? Retiring it instead keeps your history intact.`)) return;
      store.deleteHabit(h.id);
      close();
      refresh();
      openSettings();
    };
  }
  el('cancelHabit').onclick = () => { close(); openSettings(); };
}

/* ---------- a bottom sheet ---------- */
/* ============================================================================
   CELEBRATIONS
   ----------------------------------------------------------------------------
   Only fires for things that happened today, and only once each — backfilling a
   week of history shouldn't set off a fireworks show.
   ========================================================================== */

function fireCelebrations(state) {
  const events = celebrationsFor(state, R);
  const fresh = events.filter((e) => !store.hasSeen(e.key));
  if (!fresh.length) return;
  store.markSeen(fresh.map((e) => e.key));
  fresh.slice(0, 3).forEach((e, i) => setTimeout(() => {
    toast({ glyph: e.glyph || e.emoji || 'star', title: e.title, body: e.body, tone: e.tone, ms: 4600 });
    if (e.tone === 'tier' || e.tone === 'perfect') confetti();
  }, i * 700));
}


function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el('confetti');
  /* Gold and steel only — a rainbow burst would undo the whole palette. */
  const colors = ['#D4AF37', '#F0D67A', '#B8860B', '#A7ADB5', '#8A6410', '#E4E8EC'];
  for (let i = 0; i < 46; i += 1) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.5}s`;
    p.style.animationDuration = `${1.9 + Math.random() * 1.2}s`;
    box.appendChild(p);
    setTimeout(() => p.remove(), 3600);
  }
}

/** A tiny haptic tick on phones that support it. */
function buzz() {
  try { navigator.vibrate?.(12); } catch { /* not supported, no matter */ }
}
