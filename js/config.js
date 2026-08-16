/* ============================================================================
   CONFIG — the dials of the whole app.
   ----------------------------------------------------------------------------
   Almost everything here can also be changed inside the app on the Settings
   screen, so you should rarely need to edit this file. It matters in one case:
   these are the values used the very FIRST time the app runs on a device.
   Change them here and a fresh install starts with your preferences.

   Every number is explained. Nothing here will break the app if you change a
   number to another sensible number.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   THE HABITS YOU START WITH
   ---------------------------------------------------------------------------
   You can add, rename, re-weight, retire or delete habits inside the app — you
   never have to come back here. This is only the starting set.

     name      what you see on the log screen
     emoji     the little icon beside it
     type      'binary' = did it / didn't do it
               'scale'  = rate it 1-5 (like sleep quality)
     weight    how much this habit matters relative to the others.
               These are NOT points. They're shares of a fixed daily pot, so
               raising one habit's weight lowers everyone else's slice and the
               daily maximum always stays exactly 100.
     threshold (scale habits only) the rating that counts as a "good day" for
               streak purposes. Points still scale smoothly with the rating.
   ------------------------------------------------------------------------- */
export const DEFAULT_HABITS = [
  { name: 'No alcohol',        emoji: '🚫',  type: 'binary', weight: 20 },
  { name: 'Training',          emoji: '🏋️',  type: 'binary', weight: 20 },
  { name: 'McGill Big Three',  emoji: '🧘',  type: 'binary', weight: 18 },
  { name: 'Sleep quality',     emoji: '😴',  type: 'scale',  weight: 12, threshold: 3 },
  { name: 'Bible reading',     emoji: '📖',  type: 'binary', weight: 10 },
  { name: 'Protein target',    emoji: '🥩',  type: 'binary', weight: 10 },
  { name: 'Hydration',         emoji: '💧',  type: 'binary', weight: 10 },
];

/* ---------------------------------------------------------------------------
   SCORING
   ------------------------------------------------------------------------- */
export const DEFAULTS = {
  /* The fixed daily pot. Every day is scored out of exactly this number, no
     matter how many habits you track or how their weights are set. Adding a
     habit doesn't make days worth more — it just re-slices the same pot. */
  dailyTotal: 100,

  /* ---- Dynamic weighting: picking a habit back up is worth more -----------
     Each day you're off a habit, that habit's weight grows by this fraction of
     its baseline. 0.34 means: 1 day off -> 1.34x, 2 days -> 1.68x, 3+ -> 2x.
     Because the pot is fixed, a heavier habit automatically takes a bigger
     slice of the same 100 points, and the others shrink slightly. */
  escalationStep: 0.34,

  /* The hard ceiling on that growth, as a multiple of baseline.
     1.0 means "up to +100%", i.e. at most 2x baseline weight. Raising this
     above 1.0 lets a single lapsed habit start crowding out the rest of your
     day, which is exactly what the cap exists to prevent. */
  maxBoost: 1.0,

  /* Once you've picked the habit back up, how many days the extra weight takes
     to melt back to normal. The resume day itself keeps the full bonus. */
  recoveryDays: 3,

  /* ---- Redemption: the next-day comeback ---------------------------------
     Miss a habit ONE day and do it the very next day, and you reclaim this
     share of the points that habit lost on the missed day. 0.5 = half back.
     Off it two days or more and there's no reclaim — you get the escalating
     weight above instead. The two mechanics never stack. */
  redemptionShare: 0.5,

  /* ---- Monthly tiers ------------------------------------------------------
     Thresholds are shares of the month's MAXIMUM possible points, so they
     scale automatically to 28, 30 or 31-day months. Lowest first.
     The top one (0.92) is the tier that can lock out after a bad stretch. */
  tierPercents: [0.25, 0.45, 0.65, 0.80, 0.92],

  /* Reaching this tier or higher makes a month "qualifying" for the multi-month
     prestige badges. It's 0-based and deliberately NOT the top tier, so one
     merely-very-good month doesn't snap a long chain.
     3 = the 4th tier, Discipline. */
  metaQualifyTierIndex: 3,

  /* ---- The no-dead-months guardrail ---------------------------------------
     If a month ever goes so sideways that even the FIRST tier is out of
     mathematical reach, the app opens a Second Wind goal instead: earn this
     share of everything still on the table between now and month end. It's
     reachable by construction, so there is always something live to chase. */
  comebackGoalShare: 0.7,

  /* Streak lengths worth a celebration, in days. */
  streakMilestones: [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365],
};

/* ---------------------------------------------------------------------------
   THE TIER LADDER
   ---------------------------------------------------------------------------
   Five rungs, lowest first, paired with the percentages above. Rename them to
   whatever you like — the names are cosmetic, the order is what matters.
   `art` picks which badge illustration is drawn, and they get progressively
   more elaborate as you climb.
   ------------------------------------------------------------------------- */
export const TIERS = [
  { name: 'Foundation',  art: 'bronze',    blurb: 'You showed up. That is the whole game.' },
  { name: 'Momentum',    art: 'steel',     blurb: 'It is starting to carry itself.' },
  { name: 'Consistency', art: 'gold',      blurb: 'This is what a good month looks like.' },
  { name: 'Discipline',  art: 'platinum',  blurb: 'Rare air. This one counts toward prestige.' },
  { name: 'Relentless',  art: 'prismatic', blurb: 'Just about everything, just about every day.' },
];

/* The Second Wind badge — the guardrail reward, earned by finishing strong in a
   month that got away from you early. */
export const COMEBACK_BADGE = {
  name: 'Second Wind',
  art: 'comeback',
  blurb: 'The month got away from you, and you closed it out anyway.',
};

/* ---------------------------------------------------------------------------
   PRESTIGE BADGES — consecutive qualifying months.
   Rarer and visibly fancier the further you go.
   ------------------------------------------------------------------------- */
export const META_BADGES = [
  { months: 3,  name: 'Ember',   art: 'ember',   blurb: 'Three months in a row. A habit of having habits.' },
  { months: 6,  name: 'Aurora',  art: 'aurora',  blurb: 'Half a year held together. Genuinely rare.' },
  { months: 12, name: 'Eclipse', art: 'eclipse', blurb: 'Twelve straight months. This is the top of the mountain.' },
];
