/* ============================================================================
   ENGINE — all the maths, in one place.
   ----------------------------------------------------------------------------
   Nothing here touches the screen and nothing here saves anything. It takes
   your saved data and works out, from scratch, every day's score, every streak,
   where you are on the month's ladder and which badges you hold.

   Because it always recomputes from raw history, filling in a day you forgot
   about automatically repairs the streak, the score and the tier it belonged
   to. There is no stale bookkeeping to get out of sync.

   The five ideas it implements:
     1. FIXED POT      every day is out of exactly 100, always
     2. WEIGHTS        habits divide that pot; heavier habit = bigger slice
     3. ESCALATION     time off a habit inflates its slice, capped at 2x
     4. REDEMPTION     back on it the very next day claws back half the loss
     5. TIERS          the month's total climbs a ladder of thresholds
   ========================================================================== */

import {
  todayKey, addDays, monthOf, daysInMonth, rangeDays, parseKey,
} from './store.js';
import { TIERS, META_BADGES, COMEBACK_BADGE } from './config.js';

/* Was this habit being tracked on this day? Habits don't count before you
   created them, or after you retired them. */
function isActive(habit, day) {
  if (day < habit.createdAt) return false;
  if (habit.archived && habit.archivedAt && day >= habit.archivedAt) return false;
  if (habit.archived && !habit.archivedAt) return false;
  return true;
}

/** How much of this habit's points a logged value earns: 0 to 1. */
function fractionOf(habit, value) {
  if (value === undefined || value === null) return 0;
  if (habit.type === 'scale') return Math.max(0, Math.min(1, value / habit.max));
  return value ? 1 : 0;
}

/** Did this count as a "good day" for streak purposes? */
function isSuccess(habit, value) {
  if (value === undefined || value === null) return false;
  if (habit.type === 'scale') return value >= habit.threshold;
  return !!value;
}

/* ============================================================================
   THE MAIN PASS
   ========================================================================== */

export function compute(state, endDay = todayKey()) {
  const S = state.settings;
  const habits = state.habits;

  /* --- how far back do we need to walk? --- */
  const logDays = Object.keys(state.log).sort();
  let start = habits.map((h) => h.createdAt).sort()[0] || endDay;
  if (logDays.length && logDays[0] < start) start = logDays[0];
  if (start > endDay) start = endDay;

  const days = rangeDays(start, endDay);

  /* Per-habit running state as we walk forward through time. */
  const run = {};
  habits.forEach((h) => {
    run[h.id] = {
      boost: 0,        // 0..maxBoost — the extra weight from being off it
      gap: 0,          // consecutive missed days immediately behind us
      streak: 0,       // current run of good days
      best: 0,         // longest run ever
      done: 0,         // total good days
      opportunities: 0,// total days it was being tracked
      prevLost: 0,     // points it dropped yesterday (for redemption)
      prevActive: false,
      streakBefore: 0, // streak as of the end of yesterday
      bestBefore: 0,
    };
  });

  const byDay = {};

  for (let di = 0; di < days.length; di += 1) {
    const day = days[di];
    const isLastDay = di === days.length - 1;
    const entries = state.log[day] || {};
    const active = habits.filter((h) => isActive(h, day));

    /* ---- 1. this day's weights, after escalation ---- */
    const eff = {};
    let sumEff = 0;
    let sumBase = 0;
    active.forEach((h) => {
      const r = run[h.id];
      /* Update the boost for entering today:
         - still off it? escalate with the length of the lapse, capped
         - back on it? decay a step toward normal */
      if (r.gap > 0) {
        r.boost = Math.min(S.maxBoost, S.escalationStep * r.gap);
      } else {
        r.boost = Math.max(0, r.boost - S.maxBoost / Math.max(1, S.recoveryDays));
      }
      eff[h.id] = h.weight * (1 + r.boost);
      sumEff += eff[h.id];
      sumBase += h.weight;
    });

    /* ---- 2. slice the fixed pot ---- */
    const potToday = active.length ? S.dailyTotal : 0;
    const rows = [];
    let earnedToday = 0;
    let reclaimedToday = 0;

    active.forEach((h) => {
      const r = run[h.id];
      const value = entries[h.id];
      const frac = fractionOf(h, value);
      const success = isSuccess(h, value);

      const available = sumEff > 0 ? (potToday * eff[h.id]) / sumEff : 0;
      const baseline = sumBase > 0 ? (potToday * h.weight) / sumBase : 0;
      const earned = available * frac;

      /* ---- 3. redemption: only for a one-day lapse, only on the comeback ---- */
      let reclaimed = 0;
      const gapEntering = r.gap;
      if (success && gapEntering === 1 && r.prevActive) {
        reclaimed = S.redemptionShare * r.prevLost;
      }

      earnedToday += earned;
      reclaimedToday += reclaimed;

      rows.push({
        habitId: h.id,
        value,
        logged: value !== undefined,
        fraction: frac,
        success,
        available,
        baseline,
        earned,
        reclaimed,
        boost: r.boost,
        gapEntering,
        streakEntering: r.streak,
      });

      /* ---- 4. carry state into tomorrow ---- */
      if (isLastDay) { r.streakBefore = r.streak; r.bestBefore = r.best; }
      r.opportunities += 1;
      if (success) {
        r.done += 1;
        r.streak += 1;
        if (r.streak > r.best) r.best = r.streak;
        r.gap = 0;
      } else {
        r.streak = 0;
        r.gap += 1;
      }
      r.prevLost = available * (1 - frac);
      r.prevActive = true;
    });

    /* Habits not being tracked today are frozen — no misses, no streak damage. */
    habits.forEach((h) => { if (!isActive(h, day)) run[h.id].prevActive = false; });

    byDay[day] = {
      day,
      rows,
      byHabit: Object.fromEntries(rows.map((r) => [r.habitId, r])),
      pot: potToday,
      earned: earnedToday,
      reclaimed: reclaimedToday,
      total: earnedToday + reclaimedToday,
      anyLogged: rows.some((r) => r.logged),
      complete: rows.length > 0 && rows.every((r) => r.success),
    };
  }

  /* --- per-habit summary for the streaks screen --- */
  const habitStats = {};
  habits.forEach((h) => {
    const r = run[h.id];
    const todayRow = byDay[endDay]?.byHabit[h.id];
    const doneToday = !!todayRow?.success;
    habitStats[h.id] = {
      /* If today isn't logged yet we show yesterday's streak rather than a
         zero — the streak isn't broken until the day actually ends. */
      current: doneToday ? r.streak : r.streakBefore,
      best: Math.max(r.best, r.bestBefore),
      atRisk: !doneToday && r.streakBefore > 0,
      doneToday,
      gap: doneToday ? 0 : r.gap,
      boost: todayRow ? todayRow.boost : 0,
      available: todayRow ? todayRow.available : 0,
      baseline: todayRow ? todayRow.baseline : 0,
      active: !!todayRow,
      done: r.done,
      opportunities: r.opportunities,
      rate: r.opportunities ? r.done / r.opportunities : 0,
    };
  });

  const months = buildMonths(state, byDay, days, endDay);

  return {
    endDay,
    days,
    byDay,
    today: byDay[endDay] || { day: endDay, rows: [], pot: 0, earned: 0, reclaimed: 0, total: 0 },
    habitStats,
    months,
    month: months[monthOf(endDay)],
    badges: deriveBadges(state, months, endDay),
  };
}

/* ============================================================================
   MONTHS, TIERS AND THE LOCKOUT MATHS
   ========================================================================== */

/** The pot available on a given day — 0 before you had any habits. */
function potFor(state, day) {
  const any = state.habits.some((h) => isActive(h, day));
  return any ? state.settings.dailyTotal : 0;
}

function buildMonths(state, byDay, days, endDay) {
  const months = {};
  const keys = [...new Set(days.map(monthOf))];
  const nowMonth = monthOf(endDay);
  if (!keys.includes(nowMonth)) keys.push(nowMonth);

  keys.forEach((mKey) => {
    const n = daysInMonth(mKey);
    const allDays = [];
    for (let i = 1; i <= n; i += 1) allDays.push(`${mKey}-${String(i).padStart(2, '0')}`);

    /* The month's ceiling: every day that has (or will have) tracked habits
       contributes a full pot. That's what tiers are measured against. */
    const maxPossible = allDays.reduce((sum, d) => sum + potFor(state, d), 0);

    /* Walk the month day by day building a running picture, so we can spot the
       exact day (if any) that the ladder went out of reach. */
    let earned = 0;
    const series = [];
    const percents = state.settings.tierPercents;
    const floorThreshold = (percents[0] || 0) * maxPossible;

    /* The guardrail goal, re-anchored whenever it would drift out of reach.
       See the long note below buildMonths for why it re-anchors. */
    let cbGoal = null;
    let cbFrom = null;

    allDays.forEach((d) => {
      if (d > endDay) return;
      const r = byDay[d];
      earned += r ? r.total : 0;

      /* Everything still winnable from tomorrow to month end. */
      let future = 0;
      allDays.forEach((f) => { if (f > d) future += potFor(state, f); });

      /* On today itself the day isn't over, so whatever is still unticked is
         still winnable — measure from yesterday's settled total plus today's
         full pot. */
      const isToday = d === endDay;
      const settled = earned - (isToday && r ? r.total : 0);
      const ceiling = isToday ? settled + potFor(state, d) + future : earned + future;

      series.push({ day: d, earned, ceiling });

      /* Open the goal the first time the bottom rung goes out of reach, and
         re-open it lower if a further bad stretch puts even that out of reach.
         Anchoring on what is still on the table makes it reachable by
         definition, every single day. */
      const outOfReach = cbGoal === null
        ? floorThreshold > ceiling + 1e-9
        : cbGoal > ceiling + 1e-9;
      if (outOfReach) {
        cbFrom = d;
        cbGoal = settled + state.settings.comebackGoalShare * (ceiling - settled);
      }
    });

    const last = series[series.length - 1];
    const total = last ? last.earned : 0;
    const ceiling = last ? last.ceiling : maxPossible;
    const isCurrent = mKey === nowMonth;

    const tiers = TIERS.map((t, i) => {
      const threshold = (percents[i] ?? 1) * maxPossible;
      return {
        index: i,
        name: t.name,
        art: t.art,
        blurb: t.blurb,
        percent: percents[i] ?? 1,
        threshold,
        reached: total >= threshold - 1e-9,
        locked: threshold > ceiling + 1e-9,
        remaining: Math.max(0, threshold - total),
      };
    });

    let achieved = -1;
    tiers.forEach((t) => { if (t.reached) achieved = t.index; });
    const next = tiers.find((t) => !t.reached && !t.locked) || null;
    const topLocked = tiers[tiers.length - 1].locked;
    const allLocked = tiers.every((t) => t.reached || t.locked) && achieved < tiers.length - 1;

    /* ---- the guardrail: no dead months ----
       If even the bottom rung goes out of reach, a Second Wind goal opens,
       pitched at a share of everything still on the table. It re-anchors if a
       further bad stretch would put it out of reach too, so there is always a
       live target — a bad month caps your ceiling, it never empties the month.
       Reachability is asserted in the test suite. */
    const comeback = cbGoal === null ? null : {
      active: true,
      from: cbFrom,
      goal: cbGoal,
      reached: total >= cbGoal - 1e-9,
      remaining: Math.max(0, cbGoal - total),
      progress: cbGoal > 0 ? Math.min(1, total / cbGoal) : 1,
    };

    months[mKey] = {
      key: mKey,
      isCurrent,
      complete: !isCurrent && mKey < nowMonth,
      days: allDays,
      loggedDays: allDays.filter((d) => byDay[d]?.anyLogged).length,
      total,
      maxPossible,
      ceiling,
      percentOfMax: maxPossible ? total / maxPossible : 0,
      tiers,
      achieved,
      next,
      topLocked,
      allLocked,
      comeback,
      series,
      qualifying: achieved >= state.settings.metaQualifyTierIndex,
    };
  });

  return months;
}

/* ============================================================================
   BADGES
   ----------------------------------------------------------------------------
   Derived from history rather than handed out and stored, so a backfilled day
   can restore a badge you should have had. Badges from finished months are
   permanent; the current month's is shown as still in play.
   ========================================================================== */

function deriveBadges(state, months, endDay) {
  const nowMonth = monthOf(endDay);
  const keys = Object.keys(months).sort();
  const earned = [];

  keys.forEach((k) => {
    const m = months[k];
    if (m.achieved >= 0) {
      const t = TIERS[m.achieved];
      earned.push({
        id: `tier:${k}:${m.achieved}`,
        kind: 'tier',
        art: t.art,
        name: t.name,
        blurb: t.blurb,
        month: k,
        rank: m.achieved,
        provisional: k === nowMonth,
      });
    }
    if (m.comeback?.reached) {
      earned.push({
        id: `comeback:${k}`,
        kind: 'comeback',
        art: COMEBACK_BADGE.art,
        name: COMEBACK_BADGE.name,
        blurb: COMEBACK_BADGE.blurb,
        month: k,
        rank: 0,
        provisional: k === nowMonth,
      });
    }
  });

  /* ---- prestige: consecutive qualifying calendar months ---- */
  let streak = 0;
  let cursor = keys[0];
  const chain = [];
  if (cursor) {
    while (cursor <= nowMonth) {
      const m = months[cursor];
      const finished = cursor < nowMonth;
      if (finished) {
        if (m && m.qualifying) {
          streak += 1;
          META_BADGES.forEach((mb) => {
            if (streak === mb.months) {
              earned.push({
                id: `meta:${mb.months}:${cursor}`,
                kind: 'meta',
                art: mb.art,
                name: mb.name,
                blurb: mb.blurb,
                month: cursor,
                rank: 10 + mb.months,
                provisional: false,
              });
            }
          });
        } else {
          streak = 0;
        }
        chain.push({ month: cursor, qualifying: !!(m && m.qualifying) });
      }
      cursor = nextMonth(cursor);
    }
  }

  const current = months[nowMonth];
  const liveChain = streak + (current?.qualifying ? 1 : 0);
  const nextMeta = META_BADGES.find((mb) => mb.months > streak) || null;

  return {
    earned,
    chain,
    /* Qualifying months in a row, counting this one if it's currently there. */
    chainLength: liveChain,
    settledChain: streak,
    nextMeta,
    monthsToNextMeta: nextMeta ? nextMeta.months - liveChain : 0,
  };
}

export function nextMonth(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function prevMonth(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ============================================================================
   WEEKLY ROLL-UP for the history screen
   ========================================================================== */

export function weeklySeries(result, weeks = 8, endDay = result.endDay) {
  const out = [];
  /* Walk back to the most recent Monday. */
  const dow = (parseKey(endDay).getDay() + 6) % 7;
  let weekStart = addDays(endDay, -dow);
  for (let w = 0; w < weeks; w += 1) {
    const days = rangeDays(weekStart, addDays(weekStart, 6));
    let total = 0;
    let max = 0;
    let logged = 0;
    days.forEach((d) => {
      const r = result.byDay[d];
      if (d > endDay) return;
      if (r) { total += r.total; max += r.pot; if (r.anyLogged) logged += 1; }
    });
    out.unshift({ start: weekStart, days, total, max, logged, pct: max ? total / max : 0 });
    weekStart = addDays(weekStart, -7);
  }
  return out;
}

/* ============================================================================
   CELEBRATIONS — what's worth a moment of noise today.
   ========================================================================== */

export function celebrationsFor(state, result) {
  const events = [];
  const day = result.endDay;
  const today = result.byDay[day];
  if (!today) return events;

  const habitName = (id) => state.habits.find((h) => h.id === id)?.name || 'that habit';
  const habitGlyph = (id) => { const h = state.habits.find((x) => x.id === id); return h?.icon || h?.emoji || 'star'; };

  today.rows.forEach((row) => {
    if (!row.success) return;

    /* A comeback — the next-day return, the hardest one to make. */
    if (row.reclaimed > 0.01) {
      events.push({
        key: `comeback:${row.habitId}:${day}`,
        tone: 'comeback',
        glyph: habitGlyph(row.habitId),
        title: `You reclaimed your ${habitName(row.habitId).toLowerCase()} streak`,
        body: `Straight back on it the next day — that's the hard part. +${Math.round(row.reclaimed)} points recovered.`,
      });
    } else if (row.gapEntering >= 2) {
      events.push({
        key: `restart:${row.habitId}:${day}`,
        tone: 'comeback',
        glyph: habitGlyph(row.habitId),
        title: `${habitName(row.habitId)} is back`,
        body: `${row.gapEntering} days off, and you picked it up anyway. Worth ${Math.round(row.available)} today — day one of the next run.`,
      });
    }

    /* Streak milestones. */
    const st = result.habitStats[row.habitId];
    if (st && state.settings.streakMilestones.includes(st.current)) {
      events.push({
        key: `streak:${row.habitId}:${st.current}:${day}`,
        tone: 'streak',
        glyph: habitGlyph(row.habitId),
        title: `${st.current}-day ${habitName(row.habitId)} streak`,
        body: st.current === st.best ? 'That is your best run yet.' : 'Still going. Keep it rolling.',
      });
    }
  });

  /* A perfect day deserves saying so. */
  if (today.complete && today.rows.length > 1) {
    events.push({
      key: `perfect:${day}`,
      tone: 'perfect',
      glyph: 'target',
      title: 'Clean sweep',
      body: 'Every habit logged and done. Full pot.',
    });
  }

  /* New tier reached this month. */
  const m = result.month;
  if (m && m.achieved >= 0) {
    const t = m.tiers[m.achieved];
    events.push({
      key: `tier:${m.key}:${m.achieved}`,
      tone: 'tier',
      glyph: 'shield',
      title: `${t.name} unlocked`,
      body: t.blurb,
    });
  }

  return events;
}
