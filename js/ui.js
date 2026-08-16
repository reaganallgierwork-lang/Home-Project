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
import { renderTrain } from './train.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (id) => document.getElementById(id);

/* Which day the Today screen is showing. Defaults to today; the arrows let you
   walk back and fill in anything you missed. */
let viewDay = store.todayKey();
let viewMonth = store.monthOf(store.todayKey());
let current = 'today';
let R = null; // the latest computed result

const round = (n) => Math.round(n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============================================================================
   BOOT
   ========================================================================== */

/* The tab bar and the screens, in order. Add to this list to add a tab. */
const SCREENS = [
  { id: 'today', label: 'Log', icon: '✓', render: (s) => renderToday(s) },
  { id: 'train', label: 'Train', icon: '🏋️', render: (s) => renderTrain(s) },
  { id: 'streaks', label: 'Streaks', icon: '🔥', render: (s) => renderStreaks(s) },
  { id: 'tiers', label: 'Tiers', icon: '🪜', render: (s) => renderTiers(s) },
  { id: 'badges', label: 'Badges', icon: '🏅', render: (s) => renderBadges(s) },
  { id: 'history', label: 'History', icon: '📈', render: (s) => renderHistory(s) },
  { id: 'analyze', label: 'Data', icon: '🔎', render: (s) => renderAnalyze(s, refresh) },
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
      <span class="ico">${s.icon}</span>${s.label}
    </button>`).join('');
}

function bindTabs() {
  document.querySelectorAll('.tabbar button').forEach((b) => {
    b.addEventListener('click', () => {
      current = b.dataset.tab;
      document.querySelectorAll('.tabbar button').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${current}`));
      window.scrollTo({ top: 0, behavior: 'instant' });
      refresh();
    });
  });
}

/** Recompute everything and redraw the visible screen. */
export function refresh() {
  const state = store.get();
  R = compute(state);
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
      <button class="nav" id="dayPrev" aria-label="Previous day">‹</button>
      <div class="label">
        <b>${isToday ? 'Today' : store.dayLabel(viewDay, { weekday: 'long' })}</b>
        <span>${store.dayLabel(viewDay, { month: 'long', day: 'numeric' })}${isToday ? '' : ' · catching up'}</span>
      </div>
      <button class="nav" id="dayNext" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button>
    </div>`;

  /* --- the score ring --- */
  const score = `
    <div class="card scorecard">
      <div class="ring">
        <svg width="108" height="108" viewBox="0 0 108 108">
          <defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ff8a4c"/><stop offset="0.55" stop-color="#ffb454"/><stop offset="1" stop-color="#5cffc0"/>
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
        ${d.reclaimed > 0.01 ? `<div class="reclaim-chip">↩︎ +${round(d.reclaimed)} reclaimed</div>` : ''}
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
    if (h.type === 'scale' && h.inputStyle === 'counter') {
      const amt = row.value || 0;
      const cups = Math.round(amt / (h.step || 1));
      const stepWord = h.stepLabel || 'tap';
      const stepWordPlural = `${stepWord}${cups === 1 ? '' : 's'}`;
      const unitTxt = h.unit ? ` ${esc(h.unit)}` : '';
      control = `
        <div class="counter" data-habit="${h.id}" data-max="${h.max}" data-step="${h.step}">
          <button class="ctr-btn minus" data-dir="-1" aria-label="Remove a ${esc(stepWord)}">−</button>
          <div class="fill">
            <div class="lbl"><b>${cups} ${esc(stepWordPlural)}</b><span>${amt}${unitTxt} of ${h.max}${unitTxt}</span></div>
            <div class="bar ${row.success ? 'good' : ''}"><i style="width:${(Math.min(1, amt / h.max) * 100).toFixed(1)}%"></i></div>
          </div>
          <button class="ctr-btn plus ${amt >= h.max ? 'maxed' : ''}" data-dir="1" aria-label="Add a ${esc(stepWord)}">+</button>
        </div>`;
    } else if (h.type === 'scale') {
      control = `<div class="scale" data-habit="${h.id}">${[1, 2, 3, 4, 5].map((n) => `
          <button data-val="${n}" class="${row.value === n ? `on ${n < h.threshold ? 'low' : ''}` : ''}">${n}</button>`).join('')}</div>`;
    } else {
      control = `<button class="check ${row.success ? 'on' : ''}" data-habit="${h.id}" aria-label="${esc(h.name)}">✓</button>`;
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
      streakNow > 0 ? `<span class="flame">🔥 ${streakNow}</span>` : '',
      h.type === 'scale' && h.inputStyle !== 'counter' ? `<span>${row.value ? `rated ${row.value}/5` : 'rate 1–5'}</span>` : '',
    ].filter(Boolean).join('');

    /* "scaled" wraps both the 1-5 buttons and the counter onto their own
       row below the name — the same layout need, so they share the class. */
    return `
      <div class="habit ${row.success ? 'done' : ''} ${boosted ? 'boosted' : ''} ${h.type === 'scale' ? 'scaled' : ''}">
        <div class="emoji">${esc(h.emoji)}</div>
        <div class="body"><div class="name">${esc(h.name)}</div><div class="meta">${meta}</div></div>
        ${control}
      </div>${note}`;
  }).join('');

  el('screen-today').innerHTML = `
    <div class="topbar">
      <h1>Daily log<div class="sub">${state.habits.filter((h) => !h.archived).length} habits · ${round(pot)} points a day</div></h1>
      <button class="icon-btn" id="openSettings" aria-label="Settings">⚙︎</button>
    </div>
    ${head}${score}
    ${d.rows.length ? rows : '<div class="empty"><div class="big">🌱</div>No habits yet. Open settings to add your first one.</div>'}
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
      const max = +wrap.dataset.max;
      const step = +wrap.dataset.step || 1;
      const cur = store.getEntry(viewDay, id) || 0;
      const next = Math.max(0, Math.min(max, cur + (+b.dataset.dir) * step));
      /* Back to zero means "not logged" again, same as every other habit —
         not a real 0 worth remembering. */
      store.setEntry(viewDay, id, next > 0 ? next : null);
      buzz();
      refresh();
    };
  });
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
        <div class="emoji">${esc(h.emoji)}</div>
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
    ${active.length ? cards : '<div class="empty"><div class="big">🌱</div>No habits yet.</div>'}
    <div class="section-title">Last 14 days</div>
    <div class="card tight"><div class="hint">
      <span style="color:var(--good)">■</span> done ·
      <span style="color:var(--accent)">■</span> partial ·
      <span style="color:#364059">■</span> missed ·
      <span style="color:var(--card-2)">■</span> not logged
    </div></div>`;
}

/* ============================================================================
   SCREEN 3 — TIERS. The month's roadmap.
   ========================================================================== */

function renderTiers(state) {
  const m = R.months[viewMonth] || R.month;
  if (!m) { el('screen-tiers').innerHTML = '<div class="empty">No data yet.</div>'; return; }

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

  el('screen-tiers').innerHTML = `
    <div class="topbar">
      <h1>${esc(store.monthLabel(m.key))}<div class="sub">${round(m.total)} of ${round(m.maxPossible)} possible${m.isCurrent ? ` · ${daysLeft} days left` : ''}</div></h1>
      <button class="icon-btn" id="tierPrev" aria-label="Previous month">‹</button>
      <button class="icon-btn" id="tierNext" aria-label="Next month">›</button>
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
  `;

  el('tierPrev').onclick = () => { viewMonth = prevKey(viewMonth); ensureMonth(); renderTiers(store.get()); };
  el('tierNext').onclick = () => { viewMonth = nextKey(viewMonth); ensureMonth(); renderTiers(store.get()); };
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
   SCREEN 4 — BADGES. The permanent collection.
   ========================================================================== */

function renderBadges(state) {
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

  el('screen-badges').innerHTML = `
    <div class="topbar"><h1>Collection<div class="sub">${permanent.length} earned for good${inPlay.length ? ` · ${inPlay.length} still in play` : ''}</div></h1></div>
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
      : '<div class="empty"><div class="big">🏅</div>No badges banked yet. Finish a month above the first tier and it lands here permanently.</div>'}

    <div class="section-title">Still to find</div>
    <div class="badge-grid">
      ${TIERS.filter((t) => !earned.some((b) => b.name === t.name)).map((t) => `
        <div class="badge-cell">${renderBadge(t.art, 74, true)}<div class="bname">${esc(t.name)}</div><div class="bwhen">Monthly tier</div></div>`).join('')}
      ${META_BADGES.filter((t) => !earned.some((b) => b.name === t.name)).map((t) => `
        <div class="badge-cell">${renderBadge(t.art, 74, true)}<div class="bname">${esc(t.name)}</div><div class="bwhen">${t.months} months running</div></div>`).join('')}
    </div>`;
}

/* ============================================================================
   SCREEN 5 — HISTORY. Weekly bars and a month calendar.
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
      const bg = r && r.anyLogged
        ? `background:rgba(92,255,192,${(0.12 + pct * 0.55).toFixed(2)})`
        : '';
      return `<div class="cell ${r?.anyLogged ? 'has' : ''} ${dk === R.endDay ? 'today' : ''} ${future ? 'future' : ''}" style="${bg}"
                title="${store.dayLabel(dk)} — ${round(r?.total || 0)} pts">${+dk.slice(8)}</div>`;
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
        <button class="icon-btn" id="calPrev">‹</button>
        <button class="icon-btn" id="calNext">›</button>
      </div>
      <div class="cal">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <div class="hint" style="margin-top:11px">Greener means a bigger share of that day's points. Tap into any day from the log screen to fill it in.</div>
    </div>
    <div class="section-title">Month by month</div>
    ${monthList}`;

  el('calPrev').onclick = () => { viewMonth = prevKey(viewMonth); ensureMonth(); renderHistory(store.get()); };
  el('calNext').onclick = () => { viewMonth = nextKey(viewMonth); ensureMonth(); renderHistory(store.get()); };
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
      <div class="emoji">${esc(h.emoji)}</div>
      <div class="body">
        <div class="name">${esc(h.name)}${h.archived ? ' · retired' : ''}</div>
        <div class="share">${h.archived ? 'not counted' : `${((h.weight / sumBase) * s.dailyTotal).toFixed(1)} points a day · weight ${h.weight}`}</div>
        ${h.archived ? '' : `<input type="range" min="1" max="40" value="${h.weight}" data-w="${h.id}">`}
      </div>
      <div class="tools">
        <button data-up="${h.id}" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>↑</button>
        <button data-edit="${h.id}">✎</button>
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
    <button class="btn" id="doExport">⬇︎ Export backup file</button>
    <button class="btn" id="doImport">⬆︎ Restore from backup</button>
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

  el('doExport').onclick = () => { store.exportBackup(); toast({ tone: 'streak', emoji: '💾', title: 'Backup saved', body: 'Keep it somewhere safe.' }); };
  el('doImport').onclick = () => el('importFile').click();
  el('importFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      await store.importBackup(f);
      close();
      refresh();
      toast({ tone: 'streak', emoji: '✅', title: 'Backup restored', body: 'Everything is back.' });
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
/** Which of the three input kinds a habit currently is, for the editor. */
function habitKind(h) {
  if (!h || h.type === 'binary') return 'binary';
  return h.inputStyle === 'counter' ? 'counter' : 'rating';
}

function editHabit(id) {
  const state = store.get();
  const h = id ? state.habits.find((x) => x.id === id) : null;
  const kind = habitKind(h);

  const close = modal(`
    <h3>${h ? 'Edit habit' : 'New habit'}</h3>
    <div class="lede">${h ? 'Change anything. Past days keep the scores they already had.' : 'It starts counting from today — no retroactive misses.'}</div>
    <div class="field">
      <label>Name</label>
      <input type="text" id="hName" value="${h ? esc(h.name) : ''}" placeholder="e.g. Tracked my food">
    </div>
    <div class="row2">
      <div class="field">
        <label>Icon</label>
        <input type="text" id="hEmoji" maxlength="4" value="${h ? esc(h.emoji) : '⭐'}">
      </div>
      <div class="field">
        <label>Weight</label>
        <input type="number" id="hWeight" min="1" max="40" value="${h ? h.weight : 10}">
        <div class="help">Bigger = a larger slice of the daily pot.</div>
      </div>
    </div>
    <div class="field">
      <label>Type</label>
      <select id="hType">
        <option value="binary" ${kind === 'binary' ? 'selected' : ''}>Did it / didn't (a tick box)</option>
        <option value="rating" ${kind === 'rating' ? 'selected' : ''}>Rate it 1–5 (like sleep)</option>
        <option value="counter" ${kind === 'counter' ? 'selected' : ''}>Count up to a goal (like ounces of water)</option>
      </select>
    </div>
    <div class="field" id="thresholdField" style="display:${kind === 'rating' ? 'block' : 'none'}">
      <label>Counts as a good day at</label>
      <input type="number" id="hThreshold" min="1" max="5" value="${h?.threshold ?? 3}">
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
    </div>
    <button class="btn primary" id="saveHabit">${h ? 'Save changes' : 'Add habit'}</button>
    ${h ? `
      <button class="btn" id="retireHabit">${h.archived ? 'Bring it back' : 'Retire it (keeps history)'}</button>
      <button class="btn danger" id="deleteHabit">Delete it and its history</button>` : ''}
    <button class="btn ghost" id="cancelHabit">Cancel</button>
  `);

  el('hType').onchange = () => {
    const k = el('hType').value;
    el('thresholdField').style.display = k === 'rating' ? 'block' : 'none';
    el('counterFields').style.display = k === 'counter' ? 'block' : 'none';
  };

  el('saveHabit').onclick = () => {
    const k = el('hType').value;
    const patch = {
      name: el('hName').value.trim() || 'Untitled',
      emoji: el('hEmoji').value.trim() || '⭐',
      weight: Math.max(1, Math.min(40, +el('hWeight').value || 10)),
    };
    if (k === 'binary') {
      Object.assign(patch, { type: 'binary', inputStyle: 'rating' });
    } else if (k === 'rating') {
      Object.assign(patch, {
        type: 'scale', inputStyle: 'rating', max: 5, step: 1, unit: '', stepLabel: '',
        threshold: Math.max(1, Math.min(5, +el('hThreshold').value || 3)),
      });
    } else {
      const goal = Math.max(1, +el('hGoal').value || 150);
      Object.assign(patch, {
        type: 'scale', inputStyle: 'counter',
        max: goal,
        step: Math.max(0.1, +el('hStep').value || 1),
        unit: el('hUnit').value.trim(),
        stepLabel: el('hStepLabel').value.trim() || 'tap',
        threshold: Math.max(1, Math.min(goal, +el('hCounterThreshold').value || goal)),
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
function modal(html) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  const close = () => { back.remove(); document.body.style.overflow = ''; };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  return close;
}

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
    toast(e);
    if (e.tone === 'tier' || e.tone === 'perfect') confetti();
  }, i * 700));
}

function toast(e) {
  const box = el('toasts');
  const node = document.createElement('div');
  node.className = `toast ${e.tone || ''}`;
  node.innerHTML = `<div class="ic">${e.emoji || '✨'}</div><div class="tx"><div class="tt">${esc(e.title)}</div><div class="tb">${esc(e.body)}</div></div>`;
  box.appendChild(node);
  node.onclick = () => node.remove();
  setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 320); }, 4600);
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el('confetti');
  const colors = ['#ffb454', '#ff8a4c', '#5cffc0', '#3fd6ff', '#8b7bff', '#ff7bd5'];
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
