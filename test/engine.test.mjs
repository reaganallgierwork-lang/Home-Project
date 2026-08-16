/* Exercises the scoring engine against the rules the app promises. */
import { compute } from '../js/engine.js';
import { DEFAULTS } from '../js/config.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

function makeState(habits, log, settings = {}) {
  return {
    settings: { ...DEFAULTS, ...settings },
    habits: habits.map((h, i) => ({
      id: h.id || `h${i}`, name: h.name || `H${i}`, emoji: '•',
      type: h.type || 'binary', weight: h.weight, threshold: h.threshold ?? 3, max: 5,
      archived: false, archivedAt: null, createdAt: h.createdAt || '2026-03-01',
    })),
    log, seen: [],
  };
}
const D = (n) => `2026-03-${String(n).padStart(2, '0')}`;

/* ------------------------------------------------------------------ */
console.log('\n1. Fixed pot — the daily maximum never moves');
{
  const habits = [{ id: 'a', weight: 20 }, { id: 'b', weight: 20 }, { id: 'c', weight: 5 }];
  // 'a' lapses for days 2-5 (max escalation), everything else perfect
  const log = {};
  for (let i = 1; i <= 10; i++) {
    log[D(i)] = { b: 1, c: 1 };
    if (i === 1 || i >= 6) log[D(i)].a = 1;
  }
  const r = compute(makeState(habits, log), D(10));
  const allDays = r.days.map((d) => r.byDay[d]);
  ok('every day sums to exactly 100 available', allDays.every((d) => near(d.rows.reduce((s, x) => s + x.available, 0), 100)));
  ok('a perfect day earns exactly 100', near(r.byDay[D(1)].earned, 100));
  ok('adding a 4th habit does not raise the pot', (() => {
    const r2 = compute(makeState([...habits, { id: 'd', weight: 30 }], { [D(1)]: { a: 1, b: 1, c: 1, d: 1 } }), D(1));
    return near(r2.byDay[D(1)].earned, 100);
  })());
}

/* ------------------------------------------------------------------ */
console.log('\n2. Escalation — resuming is worth more, capped at 2x weight');
{
  const habits = [{ id: 'a', weight: 20 }, { id: 'b', weight: 20 }];
  const log = { [D(1)]: { a: 1, b: 1 } };
  for (let i = 2; i <= 8; i++) log[D(i)] = { b: 1 };   // 'a' off from day 2
  const r = compute(makeState(habits, log), D(8));
  const av = (d) => r.byDay[D(d)].byHabit.a.available;
  const boost = (d) => r.byDay[D(d)].byHabit.a.boost;

  ok('day 1 at baseline weight', near(boost(1), 0));
  ok('after 1 missed day the weight rises', boost(3) > 0 && near(boost(3), 0.34));
  ok('after 2 missed days it rises further', near(boost(4), 0.68));
  ok('after 3 missed days it hits the cap', near(boost(5), 1.0));
  ok('it never exceeds the cap', [6, 7, 8].every((d) => near(boost(d), 1.0)));
  ok('escalating value strictly increases', av(2) < av(3) && av(3) < av(4) && av(4) < av(5));
  ok('capped weight is exactly 2x baseline', near(r.byDay[D(8)].byHabit.a.available / (100 * 20 / 40), 2 * 20 / (2 * 20 + 20) / (20 / 40)));
  ok('the other habit still holds a real share', r.byDay[D(8)].byHabit.b.available > 30,
     `got ${r.byDay[D(8)].byHabit.b.available.toFixed(1)}`);
  ok('lapsed habit cannot swallow the bucket', r.byDay[D(8)].byHabit.a.available <= 66.7);
}

/* ------------------------------------------------------------------ */
console.log('\n3. Redemption — next-day comeback only');
{
  const habits = [{ id: 'a', weight: 20 }, { id: 'b', weight: 20 }];
  // miss 'a' on day 2 only, back on day 3
  const log = { [D(1)]: { a: 1, b: 1 }, [D(2)]: { b: 1 }, [D(3)]: { a: 1, b: 1 } };
  const r = compute(makeState(habits, log), D(3));
  const lost = r.byDay[D(2)].byHabit.a.available;
  const got = r.byDay[D(3)].byHabit.a.reclaimed;
  ok('reclaims exactly half of what was lost', near(got, lost * 0.5), `${got.toFixed(2)} vs ${(lost * 0.5).toFixed(2)}`);
  ok('reclaim is reported separately from the day score', near(r.byDay[D(3)].earned, 100) && r.byDay[D(3)].total > 100);

  // two-day lapse: escalating value, but NO reclaim
  const log2 = { [D(1)]: { a: 1, b: 1 }, [D(2)]: { b: 1 }, [D(3)]: { b: 1 }, [D(4)]: { a: 1, b: 1 } };
  const r2 = compute(makeState(habits, log2), D(4));
  ok('a two-day lapse reclaims nothing', near(r2.byDay[D(4)].byHabit.a.reclaimed, 0));
  ok('...but the resume value is higher than after one day', r2.byDay[D(4)].byHabit.a.available > r.byDay[D(3)].byHabit.a.available);
  ok('the two mechanics never both fire', r2.days.every((d) => {
    const row = r2.byDay[d].byHabit.a;
    return !(row.reclaimed > 0 && row.gapEntering >= 2);
  }));
}

/* ------------------------------------------------------------------ */
console.log('\n4. Recovery — weight eases back to baseline');
{
  const habits = [{ id: 'a', weight: 20 }, { id: 'b', weight: 20 }];
  const log = { [D(1)]: { a: 1, b: 1 } };
  for (let i = 2; i <= 5; i++) log[D(i)] = { b: 1 };        // long lapse -> capped
  for (let i = 6; i <= 12; i++) log[D(i)] = { a: 1, b: 1 }; // back on it
  const r = compute(makeState(habits, log), D(12));
  const b = (d) => r.byDay[D(d)].byHabit.a.boost;
  ok('resume day keeps the full bonus', near(b(6), 1.0));
  ok('it decays the day after', near(b(7), 2 / 3));
  ok('and again', near(b(8), 1 / 3));
  ok('back to baseline after the recovery window', near(b(9), 0));
  ok('stays at baseline', near(b(12), 0));
}

/* ------------------------------------------------------------------ */
console.log('\n5. Streaks are per habit, never combined');
{
  const habits = [{ id: 'a', weight: 20 }, { id: 'b', weight: 20 }];
  const log = {};
  for (let i = 1; i <= 10; i++) log[D(i)] = { b: 1, ...(i === 5 ? {} : { a: 1 }) };
  const r = compute(makeState(habits, log), D(10));
  ok('the missed habit resets only itself', r.habitStats.a.current === 5);
  ok('the other habit keeps its full run', r.habitStats.b.current === 10);
  ok('longest is remembered across the break', r.habitStats.a.best === 5);
  ok('longest for the unbroken habit', r.habitStats.b.best === 10);
}

console.log('\n6. Scale habits (sleep 1-5)');
{
  const habits = [{ id: 's', weight: 20, type: 'scale', threshold: 3 }];
  const log = { [D(1)]: { s: 5 }, [D(2)]: { s: 3 }, [D(3)]: { s: 2 } };
  const r = compute(makeState(habits, log), D(3));
  ok('a 5 earns the full slice', near(r.byDay[D(1)].earned, 100));
  ok('a 3 earns 60%', near(r.byDay[D(2)].earned, 60));
  ok('a 3 still counts for the streak', r.byDay[D(2)].byHabit.s.success);
  ok('a 2 breaks the streak but still scores', !r.byDay[D(3)].byHabit.s.success && r.byDay[D(3)].earned > 0);
}

/* ------------------------------------------------------------------ */
console.log('\n7. Tiers, lockout and the no-dead-months guardrail');
{
  const habits = [{ id: 'a', weight: 20 }, { id: 'b', weight: 20 }];
  // A perfect month
  const perfect = {};
  for (let i = 1; i <= 31; i++) perfect[D(i)] = { a: 1, b: 1 };
  const rp = compute(makeState(habits, perfect), D(31));
  const mp = rp.months['2026-03'];
  ok('month max is 100 x days', near(mp.maxPossible, 3100));
  ok('a perfect month clears the top tier', mp.achieved === 4);
  ok('a perfect month is a qualifying month', mp.qualifying);

  // A month that goes badly for two weeks, then goes perfect
  const bad = {};
  for (let i = 15; i <= 31; i++) bad[D(i)] = { a: 1, b: 1 };
  const rb = compute(makeState(habits, bad), D(31));
  const mb = rb.months['2026-03'];
  ok('top tier locks out after a bad stretch', mb.tiers[4].locked || !mb.tiers[4].reached);
  ok('lower tiers still reachable — no dead month', mb.achieved >= 0);
  ok('reached a real tier despite the bad start', mb.achieved >= 1, `achieved index ${mb.achieved}`);

  // A catastrophic month: nothing until the 28th
  const awful = {};
  for (let i = 28; i <= 31; i++) awful[D(i)] = { a: 1, b: 1 };
  const ra = compute(makeState(habits, awful), D(31));
  const ma = ra.months['2026-03'];
  ok('even tier 1 is out of reach here', ma.tiers[0].threshold > ma.ceiling || ma.comeback !== null);
  ok('the Second Wind guardrail opened', !!ma.comeback);

  /* The promise is that SOMETHING is always reachable — never that it is
     handed over. Assert reachability on every single day of a worst case:
     nothing logged all month, checked day by day. */
  const deadCheck = [];
  for (let d = 1; d <= 31; d++) {
    const rr = compute(makeState(habits, {}), D(d));
    const mmm = rr.months['2026-03'];
    const tierLive = mmm.tiers.some((t) => !t.locked);
    const cbLive = mmm.comeback ? mmm.comeback.goal <= mmm.ceiling + 0.01 : false;
    deadCheck.push({ d, ok: tierLive || cbLive, ceiling: mmm.ceiling, goal: mmm.comeback?.goal });
  }
  const deadDay = deadCheck.find((x) => !x.ok);
  ok('no dead day: a goal is reachable on every day of an empty month', !deadDay,
     deadDay ? `day ${deadDay.d}: ceiling ${deadDay.ceiling?.toFixed(0)} goal ${deadDay.goal?.toFixed(0)}` : '');

  /* And the same for a month that keeps going badly after the guardrail opens. */
  const stubborn = {};
  for (let i = 30; i <= 31; i++) stubborn[D(i)] = { a: 1, b: 1 };
  const rs = compute(makeState(habits, stubborn), D(31));
  const ms = rs.months['2026-03'];
  ok('a late re-anchored goal stays reachable', ms.comeback.goal <= ms.ceiling + 0.01,
     `goal ${ms.comeback.goal.toFixed(0)} vs ceiling ${ms.ceiling.toFixed(0)}`);
  ok('and finishing strong from there earns it', ms.comeback.reached);

  // Mid-month check: lockout is visible before the month ends
  const rm = compute(makeState(habits, {}), D(20));
  const mm = rm.months['2026-03'];
  ok('a fully unlogged month locks the top tier by day 20', mm.tiers[4].locked);
  ok('but the bottom tier is still live on day 20', !mm.tiers[0].locked,
     `t0=${mm.tiers[0].threshold.toFixed(0)} ceiling=${mm.ceiling.toFixed(0)}`);
}

/* ------------------------------------------------------------------ */
console.log('\n8. Badges and the prestige chain');
{
  const habits = [{ id: 'a', weight: 20 }, { id: 'b', weight: 20 }];
  const log = {};
  // Four perfect months: Jan-Apr 2026
  for (const [m, n] of [['01', 31], ['02', 28], ['03', 31], ['04', 30]]) {
    for (let i = 1; i <= n; i++) log[`2026-${m}-${String(i).padStart(2, '0')}`] = { a: 1, b: 1 };
  }
  const st = makeState(habits, log);
  st.habits.forEach((h) => { h.createdAt = '2026-01-01'; });
  const r = compute(st, '2026-05-10');

  const tierBadges = r.badges.earned.filter((b) => b.kind === 'tier');
  ok('one tier badge per month', tierBadges.length === 4, `got ${tierBadges.length}`);
  ok('finished months are permanent', tierBadges.filter((b) => !b.provisional).length === 4);
  ok('3-month prestige badge earned', r.badges.earned.some((b) => b.name === 'Ember'));
  ok('6-month not yet', !r.badges.earned.some((b) => b.name === 'Aurora'));
  ok('chain length is 4', r.badges.settledChain === 4, `got ${r.badges.settledChain}`);

  // Break the chain: make February a weak month
  const log2 = { ...log };
  for (let i = 1; i <= 20; i++) delete log2[`2026-02-${String(i).padStart(2, '0')}`];
  const st2 = makeState(habits, log2);
  st2.habits.forEach((h) => { h.createdAt = '2026-01-01'; });
  const r2 = compute(st2, '2026-05-10');
  ok('a weak month breaks the chain', r2.badges.settledChain === 2, `got ${r2.badges.settledChain}`);
  ok('and the 3-month badge is not awarded', !r2.badges.earned.some((b) => b.name === 'Ember'));
}

/* ------------------------------------------------------------------ */
console.log('\n9. Backfilling repairs history');
{
  const habits = [{ id: 'a', weight: 20 }];
  const gapped = { [D(1)]: { a: 1 }, [D(2)]: { a: 1 }, [D(4)]: { a: 1 }, [D(5)]: { a: 1 } };
  const r1 = compute(makeState(habits, gapped), D(5));
  ok('a hole in the middle breaks the streak', r1.habitStats.a.current === 2);
  const filled = { ...gapped, [D(3)]: { a: 1 } };
  const r2 = compute(makeState(habits, filled), D(5));
  ok('filling the day in restores the full streak', r2.habitStats.a.current === 5);
  ok('and clears the escalation that came with it', near(r2.byDay[D(4)].byHabit.a.boost, 0));
}

/* ------------------------------------------------------------------ */
console.log('\n10. New habits never create retroactive misses');
{
  const habits = [{ id: 'a', weight: 20 }, { id: 'n', weight: 20, createdAt: D(5) }];
  const log = {};
  for (let i = 1; i <= 8; i++) log[D(i)] = { a: 1, ...(i >= 5 ? { n: 1 } : {}) };
  const r = compute(makeState(habits, log), D(8));
  ok('the new habit is absent before it existed', !r.byDay[D(3)].byHabit.n);
  ok('early days still scored a full 100', near(r.byDay[D(3)].earned, 100));
  ok('the new habit has no phantom lapse', r.habitStats.n.current === 4);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
