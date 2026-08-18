# ASCENT

**Fitness. Habits. Legacy.**

A personal daily tracker. Log habits in a few taps, build and log workouts, earn
points from a fixed daily pot, keep a separate streak for every habit, and climb
a ladder of monthly tiers with badges you keep forever.

It is a web app that installs to your phone's home screen and works offline.
There is nothing to buy, no account to make, and your data never leaves your
phone.

## Look and feel

Onyx, steel and gold, dark only — this is a deliberate choice, not a missing
feature. A light rendering of a gold-on-black identity looks like a weaker
product, so `color-scheme: dark` is declared and the app stays dark whatever the
phone asks for.

- **Palette** — Onyx `#0B0D11`, Slate `#1E222A`, Steel `#A7ADB5`,
  Gold `#D4AF37`, Bronze `#B8860B`. Gold is the only signal colour: it marks
  what's done, what's live, and what's next, and nothing else competes with it.
- **Type** — Anton for display (titles, hero figures, the big numbers), Inter
  for everything else. Both load from Google Fonts with a full system fallback,
  so the app is legible before they arrive and stays legible offline.
- **Icons** — a single-weight line set drawn in `js/icons.js`, no emoji
  anywhere. Icons inherit their container's colour, so they never fight the
  palette. Habits saved with an emoji before the overhaul are migrated onto the
  matching icon automatically; anything unrecognised keeps rendering as it was.
- **Badges** — struck metal in the same gold/steel/onyx family, ranked so you
  can read the tier at a glance: a gold shield at Foundation, a crown at
  Relentless, a black sun with a gold corona at Eclipse.

To recolour the whole app, change the variables at the top of `app.css`. The
chart mark colour is validated for contrast against the card surface — if you
change it, re-validate rather than guessing.

Every picker, form and detail view that pops up from the bottom of the
screen can be swiped away — pull down from the very top and let go, the way
an iOS sheet closes. Below the top it's an ordinary scroll instead, so a
long list (the exercise library, say) never needs to be scrolled all the
way back down just to find a Close button.

---

## Getting it on your phone

**You do this once.** It takes about five minutes.

### 1. Turn on GitHub Pages

1. Go to this repository on github.com.
2. Click **Settings** (the tab along the top).
3. In the left sidebar click **Pages**.
4. Under **Source**, choose **GitHub Actions** from the dropdown.

That's it — nothing to save, it applies immediately.

### 2. Wait a minute

Click the **Actions** tab at the top of the repository. You'll see a job called
"Deploy to GitHub Pages" running. When the dot next to it turns green, the app
is live.

If nothing is running, click **Actions** → **Deploy to GitHub Pages** in the
sidebar → **Run workflow**.

### 3. Open it on your phone and save it

Your app's address is:

```
https://reaganallgierwork-lang.github.io/home-project/
```

(It's also shown on the **Pages** settings screen once it's live.)

**On iPhone** — open that link **in Safari** (this does not work in Chrome on
iOS), tap the **Share** button at the bottom, scroll down, tap **Add to Home
Screen**, then **Add**.

**On Android** — open the link in Chrome, tap the **⋮** menu, tap **Add to Home
screen**.

You'll get an icon on your home screen. Opening it launches the app full
screen with no browser bars, and it works with no signal.

---

## How the scoring actually works

Worth reading once — it explains what you'll see happening.

### The fixed pot

**Every day is scored out of exactly 100 points.** Always. Your habits divide
that 100 between them according to their weights.

This matters because it means a day is always comparable to any other day.
Adding a ninth habit doesn't make your days worth more — it just cuts the same
100 points into more slices. Making "no alcohol" heavier doesn't inflate your
score; it takes a bigger slice and leaves less for everything else.

Sleep is rated 1–5 and scores proportionally: a 5 earns its full slice, a 3
earns 60% of it.

### Counting up to a goal

A counter habit (ounces of water, grams of protein) scores the same way —
proportionally, up to its goal. Tap **+** to add one step at a time, or tap
**Enter an amount** to type a number in one go and add it to today's total —
the fast path for a 145g protein goal, which would otherwise be 145 taps.
Typing an amount always **adds** to what's already logged; it never replaces
it, so two entries in the same day combine correctly.

**There's no ceiling.** Points stop growing once you hit the goal — that's
just the shape of a fixed 100-point pot — but the number itself keeps
counting past it for as long as you keep logging. If your goal is 145g and
you actually eat 210g, the app shows 210g, not a number clamped down to
145. Real intake is worth recording even after the points are maxed.

### Calorie budget — the one goal that runs backwards

Every other counter rewards **more**: more water, more protein, more reps.
A calorie budget is the opposite — the goal is to land **at or under** a
number, so a **Calorie budget** habit (pick it from the Type dropdown when
adding or editing a habit) scores the mirror image of everything else.

Its goal isn't typed in directly. Instead you set two numbers:

- **Your average TDEE** — your total daily energy expenditure, one number
  for your whole profile. It defaults to 2600 the first time, but that's
  only a starting point to adjust, not an estimate of anything — put in
  your own if you know it. It stays the same every day until you come back
  and change it, and changing it moves every calorie-budget habit at once.
- **Desired daily deficit** — how far under your TDEE you're aiming to eat.

The habit's goal is simply **TDEE − deficit**, recalculated live every time
it's needed — so raising or lowering your TDEE later reshapes the goal (and
every past day's score) without having to touch the habit itself.

Like every other nutrition-linked counter, it's entirely fed by your food
log — see the **Nutrition** section under the Body tab — so there's nothing
to tap by hand, just a **Log food to fill this in** shortcut.

Scoring: land at or under budget on a given day and that habit earns **full
credit**, same as any other day it hits its goal — there's no extra reward
for eating far less than your budget, same-target, same-score. Go over and
credit falls off smoothly rather than dropping to zero in one step:
10% over your budget still keeps about 90% of the credit, 50% over keeps
about half, and it bottoms out at zero once you've eaten double your
budget. No cliffs, same as everywhere else in the app — one bad meal costs
you gradually, not all at once.

### Separate streaks

Every habit keeps **its own** current streak and its own longest-ever streak.
A glass of wine breaks your dry streak and touches nothing else. Your training
streak, your McGill streak and your Bible streak all carry on untouched.

### Picking it back up is worth more than keeping it going

This is the part that does the real work.

Each day you're off a habit, that habit's weight grows by 34% of its baseline,
so it claims a bigger slice of the same 100 points:

| Days off it | What it's worth |
|---|---|
| On it | Normal weight |
| 1 day off | 1.34× weight |
| 2 days off | 1.68× weight |
| 3+ days off | 2× weight — the cap |

**It stops at 2×, permanently.** That cap is deliberate: one lapsed habit can
never swallow the day and leave the others meaningless. The longer you've been
off something, the louder the app pulls you back to it — and because the pot is
fixed, that pull is real points, not a made-up bonus.

Once you're back on it, the extra weight melts away over three days rather than
snapping back, so the comeback keeps paying for a bit.

### The next-day comeback

Two different things happen depending on how long you were off:

- **Back on it the very next day** → you reclaim **half the points that habit
  lost** on the day you missed. Miss a 20-point habit, do it tomorrow, get 10
  points back. This is shown separately as "reclaimed", on top of the day's
  score.
- **Off it two days or more** → no reclaim. Instead you get the escalating
  weight above, which keeps growing the longer you're away.

They never both fire. Short slip, quick recovery, get the points back. Long
lapse, restarting is what's worth more.

Tiers and badges live together on one tab (**Ranks** in the tab bar) since
they're both answering the same question — where do I stand — just at
different timescales: tiers reset every month, badges are what you keep.

### Monthly tiers

Points accumulate through the month toward five tiers. Each threshold is a
percentage of the month's **maximum possible** points, so it adapts to 28, 30
and 31-day months automatically.

| Tier | Needs | Note |
|---|---|---|
| Foundation | 25% | Very reachable |
| Momentum | 45% | |
| Consistency | 65% | |
| **Discipline** | **80%** | **Counts toward prestige badges** |
| Relentless | 92% | The top |

Because misses reduce your total permanently, enough of them will put the top
tier mathematically out of reach before the month ends. The app tells you when
that's happened, and frames it as "aim for it next month" — because that's what
it is. The rest of the month still counts and the lower tiers are still real.

**There are no dead months.** If a month goes so badly that even Foundation is
out of reach, the app opens a **Second Wind** goal — finish with 70% of
everything still on the table and you earn a Second Wind badge. It's built from
what's actually left, so it is always reachable, and it re-opens lower if things
keep sliding. You can always still climb to something.

### Badges

At month end the tiers reset, but the badge you earned is yours permanently and
lands in your collection.

Hit **Discipline or higher** in back-to-back months and you build a chain.
Consecutive qualifying months earn rare prestige badges:

- **3 months → Ember**
- **6 months → Aurora**
- **12 months → Eclipse**

Note that the chain qualifies at Discipline, not the top tier — one merely very
good month won't break a year-long run.

Badges get visibly more elaborate as they get rarer. Foundation is a struck gold
shield; Eclipse is a black sun with a rotating gold corona. You can tell rank at
a glance.

---

## Changing things without touching code

Tap the **gear** in the top right of the log screen. From there you can:

- **Add, rename or re-icon any habit** — "Tracked my food", "No photo-checking",
  whatever you want, with an icon picked from the grid. New habits start counting from the day you add them, so
  you never get retroactive misses.
- **Change any weight** with a slider. It shows you live what each habit is
  worth per day.
- **Link a counter habit to your food log.** A counter habit (see below) has a
  **Fill this in automatically from** dropdown — Calories, Protein, Carbs, or
  Fat. Linking it hands the counter over entirely to whatever you log on the
  Body tab's Nutrition section: the +/− and the manual entry field turn off,
  and the number fills itself in from that day's food. A protein-goal counter
  gets linked to Protein automatically the first time you open the app after
  this shipped — the app can tell what a habit named for protein wants without
  you having to go find the setting. Anything else (Calories, Carbs, Fat, or a
  differently-named counter) is still your call: come here and set it.
- **Add a Calorie budget habit** — the fourth option in the Type dropdown.
  It's a counter that runs backwards from every other one: instead of
  rewarding more, it wants you at or under a budget computed as your TDEE
  minus a desired deficit, both editable right there. See *Calorie budget —
  the one goal that runs backwards*, below, for how it scores.
- **Retire a habit** — it stops counting from today but every past day keeps the
  score it already had. This is almost always what you want instead of deleting.
- **Change the daily pot, the escalation rate, the recovery window, and the
  reclaim share.**
- **Move any tier threshold.**
- **Change which tier qualifies for the prestige chain.**
- **Export a backup** and restore from one.

Everything recalculates instantly, all the way back through your history.

---

## The Train tab

### Building a workout

**Build a workout** walks you through it — you never type anything you can pick
instead. Add a block, choose what kind, and fill in the numbers:

| Block | What it's for |
|---|---|
| **Straight sets** | One exercise for a number of sets. The everyday choice. |
| **Superset** | Two or more exercises back to back, for a number of rounds. |
| **AMRAP** | As many rounds as possible inside a time cap. |
| **Rounds for time** | A set number of rounds against the clock, with a cap. |
| **EMOM** | Every minute on the minute, for a number of minutes. |

For straight sets you pick the exercise, tap the number of sets up or down, then
choose **Same every set** (type the weight and reps once) or **Set
individually** (a row per set, for pyramids and top sets). A workout can mix
every block type freely — heavy squats, then a superset, then a 12-minute AMRAP.

Name an AMRAP or a Rounds-for-time piece (say, "Fran") and the app charts that
exact workout over time, so you can watch the same benchmark improve.

Save it and it's in **My workouts**, ready to start again any time.

### Doing a workout

Tap **Start**, and you get the plan with the numbers already filled in. Adjust
anything on the fly, tap the big ✓ as you finish each set, and the totals at the
top update live. Timed pieces just ask for the result — rounds and extra reps
for an AMRAP, a finish time for Rounds for time.

You can add blocks mid-workout, reopen a finished session to fix something, move
it to a different date, or save it out as a reusable workout. When you finish,
it offers to tick your Training habit for that day.

### Why every format still counts

However you did the work, it's recorded against the exercise. Bench press done
as straight sets, inside a superset, or as reps in an AMRAP all add to the same
history — otherwise your record would be split across workout formats and none
of it would mean much.

Tap any exercise in the **library** (📚, top right) to see your heaviest set,
estimated 1RM, and recent sessions.

One deliberate limit: **estimated 1RM ignores metcon reps.** A 95 lb thruster in
minute 11 of an AMRAP is real work, but running it through a 1RM formula would
invent a max you never tested. Only deliberate sets of 12 reps or fewer feed the
estimate.

### Bodyweight movements count your actual weight

Pull-ups, push-ups, dips, burpees, air squats — anything filed under the
**Bodyweight** category and measured in reps — are worth your logged
bodyweight, not zero. Leave the weight field blank on a set of pull-ups and
it's credited at whatever you weighed that day, pulled from the **Body**
tab's log (or your most recent weigh-in before it, if you didn't weigh in
that exact day). If you've never logged a weigh-in yet, it's simply counted
as zero until you do.

Any number you do type in there is **added on top of your bodyweight**, not
instead of it — that's what turns a plain pull-up into a weighted one. So
183 lb bodyweight + a 25 lb dip belt logs as a 208 lb pull-up. This applies
automatically to any exercise you add yourself under the Bodyweight category
with reps tracking — nothing is hardcoded to specific exercise names — and
it flows straight through to heaviest set, estimated 1RM, and volume on
both the exercise's own history and the Data tab.

---

## The Body tab

Weight, tracked over time, with an optional photo for any day you take one.

**Log today's weigh-in** opens a short sheet: a date (defaults to today, but
you can backfill any past day), a weight in whatever unit you last used
(toggle **LB / KG** right there — it only changes the label, the app never
converts a number you already typed), and an optional photo.

A day can carry a weight, a photo, or both — a photo-only day is a legitimate
entry, useful if you want a visual record without stepping on the scale that
moment. Tap a photo to view it full-screen; tap the **✕** on it to remove just
the photo without touching the weight.

**Photos never leave your phone.** They're compressed client-side before
they're saved — resized and re-encoded as a JPEG, backing off through smaller
passes automatically until the file is a size that will actually fit in your
phone's storage budget. If a photo genuinely won't fit even at the smallest
pass, the weight still saves and you get a plain toast saying so — the app
never silently drops data or pretends a save worked when it didn't.

### On the calendar

Every day you've weighed in gets a small gold dot on the **History** tab's
calendar; a dot with a halo means that day also has a photo. Tap any day
(weighed in or not) to open a full rundown of it: every habit and how it
went, any workout logged that day — tap it to open that session, locked
if it's finished — and your weight entry, with a one-tap **Log weight for
this day** if there isn't one yet or **Edit this entry** if there is.
**Open daily log for this day** at the bottom jumps straight into the Log
tab for that date, so the calendar doubles as a way back into any day, not
just a scoreboard for it.

### On the Data tab

Weight shows up as its own metric — see below — so you can chart it the same
way as everything else: any window from 7 days to all time, averaged, or by
its min/max over a bucket. A day you didn't weigh in is left out of the
average rather than counted as a 0, the same honesty rule the Data tab uses
for sleep ratings.

### Nutrition

A **Weight / Nutrition** switch at the top of the Body tab swaps the whole
tab over to your food log — it's a section of Body, not a separate tab, so
the tab bar stays at seven.

**Log food** opens a sheet for one item: a name, a date (defaults to today,
backdatable like everything else), and calories/protein/carbs/fat. Any field
you skip is left **unknown, not zero** — if you only tracked calories for a
snack, its protein just isn't counted toward the day's protein total, the
same way an unlogged day isn't counted as a zero anywhere else in the app.
Today's four macro tiles show a dash until you've logged at least one thing
today; after that, each tile is the real sum for the day, including an
honest 0 if you logged food but never entered a value for that particular
nutrient.

**Frequent meals** — tick "Save this as a frequent meal" while logging
something you eat often, and it shows up as a one-tap shortcut next to the
day's tiles. Tapping it opens the entry sheet pre-filled with that meal's
macros so you can log it for today (or adjust it first) without retyping
anything; the **✕** on it forgets the shortcut without touching any day you
already logged with it.

Every entry from the last 30 days also shows up in a flat **Recent** list
underneath, and tapping one opens it for editing or deleting. The same food
log for a specific day is also reachable from that day's entry in the
**History** calendar, right alongside its habits, workout, and weight.

**Feeding into a goal.** Link a counter habit — like a protein or calorie
target — to one of the four nutrients from the habit editor (see
*Changing things without touching code*, above). Once linked, that habit's
counter is entirely computed from what you log here: eat something with 40g
of protein and a linked "Protein target" habit jumps straight to 40, no
tapping required. It's the same **no ceiling** rule as any other counter —
logging past your goal keeps counting, it doesn't clamp at the top — and
it's opt-in per habit, so nothing you already track changes behavior until
you explicitly link it.

---

## The Data tab

Everything you log is kept as raw numbers, and this tab is where you dig
through them.

**Trends** — pick anything you track and see it over time. The picker lists
every habit automatically, each with up to three things to chart:

- **Amount** — the actual number you entered. Ounces of water, sleep rating.
- **Consistency** — what percentage of days you managed it.
- **Points earned** — what it contributed to your score, which moves with the
  dynamic weighting as well as with you.

Plus your daily score and your clean-sweep rate for the day as a whole.

Every exercise you've actually trained gets its own group too — **heaviest set**,
**estimated 1RM**, **volume** and **total reps** — along with whole-training
metrics (total volume, sets performed, days trained) and any named metcon's
time or rounds. That's the long game: pick "Bench Press → Estimated 1RM", set
the range to **All time**, and watch it climb over the years.

Exercises get their own **dedicated picker** rather than sitting in the main
list — tap the small dumbbell button next to the metric picker. It's the same
searchable, grouped picker either way; splitting it off just means the main
list stays short instead of getting buried under every lift you've ever
logged, and the exercise one has a search bar built in for the same reason.

Your body weight log gets a group too, right alongside habits and lifts — same
chart, same date-range picker, same table columns. Nutrition gets the same
treatment — calories, protein, carbs and fat each chart on their own, plus a
"meals logged" count column in the table view — and a day with no food logged
is left out of the average, same as everywhere else; a day that logged food
but never touched a particular nutrient is counted as a real 0 for it, not
skipped.

**Compare two things on one chart.** Tap **Compare with another metric** below
the range buttons to overlay a second line — protein against your calorie
budget, bodyweight against a lift, whatever you're actually trying to relate.
Each series gets its own colour and its own line in the legend. If the two
are genuinely on the same footing — same unit, similar scale, like two body
weights or two lifts — they share one axis so the lines are directly
comparable. If they're not — different units, or one dwarfs the other — the
second gets its **own axis on the right**, colour-matched to its line, so you
can never mistake "these two lines cross" for "these two values are equal."
Tap the chip again to swap the comparison, or the **×** to drop it. Capped at
two series on purpose — a third turns a chart into noise on a phone-width
screen.

Choose a window (7 days to all time), and the chart buckets it sensibly — by
day for short windows, by week or month for long ones, and you can override
that. Where it makes sense you can also switch between average, total, best and
lowest. Tap or drag across the chart to read any point; the same numbers are
listed underneath, so nothing is only reachable by hovering.

Two honesty details worth knowing:

- **The headline number is computed from days, not from the bars.** Averaging a
  set of weekly averages weights a 2-day week the same as a 7-day one and
  quietly reports the wrong number.
- **A day you didn't log means different things for different metrics.** For
  water or training it counts as zero, because not logging it means it didn't
  happen — the same rule the scoring uses. For a 1–5 sleep rating it's left out
  instead, because a night you forgot to rate wasn't a zero-quality night. The
  tab tells you which rule is in force, and always shows how many days you
  actually logged.

**Table** — every day as a row, every habit as a column, sortable by any column,
and an **Export as spreadsheet** button that hands you a CSV for Numbers, Excel
or Google Sheets if you want to slice it yourself.

### Missed a day?

Use the **‹** arrow at the top of the log screen to walk back to any past day
and fill it in. Streaks, points and tiers all recompute from scratch every
time, so a late entry genuinely repairs the streak it belonged to — it isn't
cosmetic.

---

## Backing up

Your data lives in your phone's browser storage. It survives closing the app and
restarting the phone, but it will be lost if you clear your browser data or lose
the device.

**Settings → Export backup file** saves a `.json` file. Put it in iCloud Drive
or Google Drive now and then. **Restore from backup** loads it back — that's
also how you move everything to a new phone.

**Only restore a backup you made yourself.** A backup is a plain `.json` file
and restoring it replaces your data with whatever is inside it. The app checks
what it loads — a "photo" has to be a real embedded image, dates have to be
dates, numbers have to be numbers, and anything else is dropped rather than
trusted — and the page runs under a strict content-security policy that
forbids loading outside code and blocks the page from sending anything to any
other server. But the simple rule still holds: it's your file, from your
phone, and there's no reason to load someone else's.

---

## For when you want to edit the code

You don't need to, but everything is plain HTML/CSS/JavaScript with no build
step, no framework and no dependencies. Edit a file on github.com and it's live
on your phone about a minute later.

| File | What's in it |
|---|---|
| `js/config.js` | **Start here.** Every dial, heavily commented — starting habits, weights, tier percentages, escalation rate, badge definitions. |
| `js/engine.js` | All the maths: points, escalation, redemption, streaks, tiers, badges. Touches nothing on screen. |
| `js/store.js` | Loading, saving, and editing your data. |
| `js/ui.js` | The screens, the tab bar and the settings sheet. |
| `js/badges.js` | The badge artwork, drawn as SVG. |
| `js/metrics.js` | The generic data layer behind the Data tab. **Read the comment at the top before adding a new kind of tracked data.** |
| `js/metrics-habits.js` | Exposes habits to the Data tab. |
| `js/metrics-workouts.js` | Exposes training to the Data tab. |
| `js/metrics-weight.js` | Exposes body weight to the Data tab. |
| `js/workouts.js` | The workout data model and maths — blocks, set records, 1RM, personal bests. No screen code. |
| `js/train.js` | The Train tab: builder, logger, exercise library. |
| `js/weight.js` | The Body tab: weigh-ins, optional photos, photo compression. Also opened from the History calendar. |
| `js/chart.js` | The reusable chart. Knows nothing about habits or lifts. |
| `js/analyze.js` | The Data tab itself. |
| `js/ids.js` | The shared id generator, kept separate so modules needn't import each other. |
| `js/icons.js` | The line-icon set, the picker list, and the emoji-to-icon migration map. |
| `js/sheet.js` | The shared bottom-sheet overlay — every picker, form and detail view — including swipe-to-dismiss. |
| `js/boot.js` | Starts the app. Separate from `index.html` so the security policy there can forbid inline scripts. |
| `js/dom.js` | `el`, `esc` and `toast` — shared so there is one HTML escaper, not four copies of it. |
| `app.css` | All the styling. The colours are variables at the very top. |
| `index.html` | The page shell. |
| `sw.js` | Makes the app work offline. |

### Adding a new tracker later (e.g. workouts)

The app is built so a new area bolts on without rewriting anything:

1. **Add a tab** — write `js/yourthing.js` with a `render(state)` function and
   add one line to the `SCREENS` list at the top of `js/ui.js`. The tab bar and
   the screen containers build themselves from that list.
2. **Make it show up in the Data tab** — call `registerSource()` with a `list()`
   that returns one metric per thing worth charting. The full contract, with a
   worked workout-tracker example, is the comment block at the top of
   `js/metrics.js`. Charts, ranges, bucketing, trends, stat tiles and CSV export
   all start working with no further changes.

Nothing in `analyze.js`, `chart.js` or `metrics.js` needs editing to add data —
that's the whole point of the split.

### If your phone won't show the new version

Open `sw.js` and bump the number in `const CACHE = 'ascent-vN'`. There's a
comment at the top of the file saying the same thing.

Two different things have to update for a change to actually reach your
phone, and it's worth knowing both:

1. **GitHub deploys it.** Check the **Actions** tab — a green check means the
   new files are live at your app's address. This can occasionally fail with
   a transient error from GitHub's own Pages service (not your code); if a
   run shows red, re-running that same job from the Actions tab is usually
   all it takes.
2. **Your phone actually re-fetches it.** This is the one that bites: the
   service worker's fetch handler passes `{ cache: 'no-store' }` on every
   request specifically so a stale response from the browser's own HTTP
   cache can never masquerade as a fresh one — GitHub Pages sends caching
   headers on everything it serves, and without that flag a "network first"
   fetch can be quietly answered from the phone's local cache without ever
   reaching GitHub at all. If you ever change that fetch handler, keep the
   `no-store` — dropping it silently reintroduces this exact bug, and it's a
   hard one to notice because everything still *looks* like it's fetching
   fresh.

If both of those are true and it's still stale, fully close the app (swipe
it away, don't just background it) and reopen it with signal — that forces
a real navigation rather than resuming whatever was already in memory.

### Running the tests

The scoring rules are covered by a test suite — including a proof that no month
can ever become mathematically dead.

```
cd test
node engine.test.mjs      # 56 checks — scoring, streaks, tiers, the guardrail
node migration.test.mjs   # 11 checks — the hydration counter migration
node metrics.test.mjs     # 44 checks — bucketing, aggregation, trends
node workouts.test.mjs    # 63 checks — blocks, set records, 1RM, templates, bodyweight loading
node weight.test.mjs      # 38 checks — weigh-ins, photo storage, the quota fallback
node security.test.mjs    # 20 checks — what a restored backup file is allowed to contain
```

Needs Node.js installed. All 232 should pass.
