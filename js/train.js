/* ============================================================================
   TRAIN — building workouts, doing them, and browsing what you've done.
   ----------------------------------------------------------------------------
   Four views behind one tab:

     home      start a workout, continue one in progress, recent sessions,
               your saved workouts, and the exercise library
     build     the workout builder — pick a block type, pick exercises,
               set the numbers. All sheets and dropdowns, no typing you can
               avoid.
     log       actually doing the workout: tick sets off, adjust as you go
     exercise  one exercise's personal bests and recent history

   The logging screen deliberately does NOT redraw on every keystroke — that
   would steal focus from the field you're typing in. Numbers are written
   straight into the session as you type and saved on a short delay; the screen
   only redraws for structural changes like ticking a set or adding one.
   ========================================================================== */

import * as store from './store.js';
import {
  BLOCK_TYPES, CATEGORIES, TRACK_MODES, makeBlock, makeSet, makeMovement,
  fillEqualSets, describeBlock, blockTitle, blockTypeInfo, exerciseById,
  exerciseName, sessionFromTemplate, templateFromSession,
  sessionSetCount, sessionRecords, recordVolume, personalBests, fmtWeight,
  fmtDuration, parseDuration, recordsFor, isBodyweightLoaded, invalidateRecords,
} from './workouts.js';
import { icon } from './icons.js';
import { openSheet as sheet, closeAllSheets as closeAll } from './sheet.js';
import { el, esc, toast } from './dom.js';

const num = (v) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : null);

let view = 'home';
let draft = null;           // the template being built
let activeId = null;        // session being logged
let exerciseView = null;
let redraw = () => {};

export function renderTrain(state) {
  redraw = () => renderTrain(store.get());
  const unit = state.settings.weightUnit || 'lb';
  if (view === 'build') return renderBuild(state, unit);
  if (view === 'log') return renderLog(state, unit);
  if (view === 'exercise') return renderExercise(state, unit);
  return renderHome(state, unit);
}

/** Jump straight into a session's log view — used by History's calendar to
    open "what did I do that day" from the day-detail sheet. Setting the
    view here is enough; the caller switches to the Train tab right after,
    which triggers the render that actually shows it. */
export function openSession(sessionId) {
  activeId = sessionId;
  view = 'log';
}

/* ============================================================================
   HOME
   ========================================================================== */

function renderHome(state, unit) {
  const open = state.sessions.find((s) => !s.finishedAt);
  const recent = state.sessions.filter((s) => s.finishedAt).slice(0, 8);

  el('screen-train').innerHTML = `
    <div class="topbar">
      <h1>Train<div class="sub">${state.sessions.length} ${state.sessions.length === 1 ? 'workout' : 'workouts'} logged</div></h1>
      <button class="icon-btn" id="libBtn" aria-label="Exercise library">${icon('library', 19)}</button>
    </div>

    ${open ? `
      <div class="card resume">
        <div class="rz">
          <b>${esc(open.name)}</b>
          <span>In progress · ${esc(store.dayLabel(open.day, { month: 'short', day: 'numeric' }))}</span>
        </div>
        <button class="btn primary" id="resumeBtn">Continue</button>
      </div>` : `
      <button class="btn primary big" id="startBtn">${icon('plus', 18)} Start a workout</button>`}

    ${state.templates.length ? `
      <div class="section-title">My workouts</div>
      ${state.templates.map((t) => `
        <div class="wcard" data-tpl="${esc(t.id)}">
          <div class="wc-body">
            <div class="wc-name">${esc(t.name)}</div>
            <div class="wc-sub">${t.blocks.length} ${t.blocks.length === 1 ? 'block' : 'blocks'} · ${esc(t.blocks.map((b) => blockTitle(state, b)).slice(0, 3).join(', '))}</div>
          </div>
          <button class="wc-go" data-start="${esc(t.id)}">Start</button>
          <button class="wc-edit" data-edit="${esc(t.id)}" aria-label="Edit">${icon('pencil', 15)}</button>
        </div>`).join('')}` : ''}

    <button class="btn" id="buildBtn" style="margin-top:12px">${icon('layers', 17)} Build a workout</button>

    ${recent.length ? `
      <div class="section-title">Recent</div>
      ${recent.map((s) => {
    /* One flatten per card, not two — sessionVolume() and sessionSetCount()
       would each redo the same work for the same session. */
    const recs = sessionRecords(state, s);
    const vol = recs.reduce((a, r) => a + recordVolume(r), 0);
    return `
        <div class="wcard" data-sess="${esc(s.id)}">
          <div class="wc-body">
            <div class="wc-name">${esc(s.name)}</div>
            <div class="wc-sub">${esc(store.dayLabel(s.day, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${recs.length} sets${vol ? ` · ${Math.round(vol).toLocaleString()} ${unit}` : ''}</div>
          </div>
          <span class="wc-chev">${icon('chevronRight', 18)}</span>
        </div>`;
  }).join('')}` : `
      <div class="empty" style="margin-top:20px">
        <div class="big">${icon('dumbbell', 34)}</div>
        Nothing logged yet. Build a workout, or start an empty one and add as you go.
      </div>`}`;

  if (open) el('resumeBtn').onclick = () => { activeId = open.id; view = 'log'; redraw(); };
  else el('startBtn').onclick = () => openStartSheet(state);
  el('buildBtn').onclick = () => { draft = { id: store.newId(), name: '', blocks: [], createdAt: Date.now() }; view = 'build'; redraw(); };
  el('libBtn').onclick = () => openLibrary(state);

  document.querySelectorAll('[data-start]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const t = state.templates.find((x) => x.id === b.dataset.start);
      startSession(t);
    };
  });
  document.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      draft = JSON.parse(JSON.stringify(state.templates.find((x) => x.id === b.dataset.edit)));
      view = 'build';
      redraw();
    };
  });
  document.querySelectorAll('[data-sess]').forEach((c) => {
    c.onclick = () => { activeId = c.dataset.sess; view = 'log'; redraw(); };
  });
}

function startSession(template) {
  const s = sessionFromTemplate(template, store.todayKey());
  store.saveSession(s);
  activeId = s.id;
  view = 'log';
  redraw();
}

function openStartSheet(state) {
  const close = sheet(`
    <h3>Start a workout</h3>
    <div class="lede">Pick one you've built, or start empty and add blocks as you go.</div>
    ${state.templates.map((t) => `
      <button class="pick-item" data-t="${esc(t.id)}">
        <span><b>${esc(t.name)}</b><br><small style="color:var(--muted)">${t.blocks.length} blocks</small></span>
      </button>`).join('')}
    <button class="btn" id="emptyStart" style="margin-top:10px">Empty workout</button>
    <button class="btn ghost" id="cancelStart">Cancel</button>`);

  document.querySelectorAll('.modal [data-t]').forEach((b) => {
    b.onclick = () => { close(); startSession(state.templates.find((x) => x.id === b.dataset.t)); };
  });
  el('emptyStart').onclick = () => { close(); startSession({ name: 'Workout', blocks: [] }); };
  el('cancelStart').onclick = close;
}

/* ============================================================================
   BUILD — the workout builder
   ========================================================================== */

function renderBuild(state, unit) {
  el('screen-train').innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn" aria-label="Back">${icon('chevronLeft', 18)}</button>
      <h1 style="font-size:22px">Build workout</h1>
    </div>
    <div class="field">
      <label>Workout name</label>
      <input type="text" id="tplName" value="${esc(draft.name)}" placeholder="e.g. Push Day A">
    </div>

    ${draft.blocks.length ? draft.blocks.map((b, i) => blockCard(state, b, i, unit)).join('')
    : `<div class="empty"><div class="big">${icon('layers', 34)}</div>No blocks yet. Add your first one below.</div>`}

    <button class="btn ${draft.blocks.length ? '' : 'primary'}" id="addBlock" style="margin-top:12px">${icon('plus', 17)} Add a block</button>
    <button class="btn ${draft.blocks.length ? 'primary' : ''}" id="saveTpl">Save workout</button>
    <button class="btn ghost" id="cancelTpl">Cancel</button>`;

  el('tplName').oninput = () => { draft.name = el('tplName').value; };
  el('backBtn').onclick = () => { view = 'home'; redraw(); };
  el('cancelTpl').onclick = () => { view = 'home'; redraw(); };
  el('addBlock').onclick = () => pickBlockType(state, (blk) => { draft.blocks.push(blk); redraw(); });
  el('saveTpl').onclick = () => {
    if (!draft.blocks.length) { alert('Add at least one block first.'); return; }
    draft.name = (draft.name || '').trim() || 'Workout';
    store.saveTemplate(draft);
    view = 'home';
    redraw();
  };

  wireBlockCards(state, draft.blocks, () => redraw());
}

function blockCard(state, b, i, unit) {
  const info = blockTypeInfo(b.type);
  return `
    <div class="block-card" data-block="${esc(b.id)}">
      <div class="bc-head">
        <span class="bc-ic">${icon(info.icon, 19)}</span>
        <div class="bc-t">
          <b>${esc(blockTitle(state, b))}</b>
          <span>${esc(info.label)}</span>
        </div>
        <button class="bc-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('arrowUp', 14)}</button>
        <button class="bc-btn" data-cfg="${esc(b.id)}" aria-label="Edit">${icon('pencil', 14)}</button>
        <button class="bc-btn" data-del="${esc(b.id)}" aria-label="Remove">${icon('close', 14)}</button>
      </div>
      <div class="bc-desc">${esc(describeBlock(state, b, unit))}</div>
    </div>`;
}

function wireBlockCards(state, blocks, after) {
  document.querySelectorAll('[data-up]').forEach((btn) => {
    btn.onclick = () => {
      const i = +btn.dataset.up;
      [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
      after();
    };
  });
  document.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = () => {
      const i = blocks.findIndex((x) => x.id === btn.dataset.del);
      if (i >= 0) blocks.splice(i, 1);
      after();
    };
  });
  document.querySelectorAll('[data-cfg]').forEach((btn) => {
    btn.onclick = () => {
      const b = blocks.find((x) => x.id === btn.dataset.cfg);
      configureBlock(state, b, after);
    };
  });
}

/* ---------- step 1: what kind of block ---------- */

function pickBlockType(state, done) {
  const close = sheet(`
    <h3>What are you adding?</h3>
    <div class="lede">Pick the shape first, then the details.</div>
    ${BLOCK_TYPES.map((t) => `
      <button class="type-item" data-type="${t.type}">
        <span class="ti-ic">${icon(t.icon, 22)}</span>
        <span class="ti-tx"><b>${esc(t.label)}</b><span>${esc(t.blurb)}</span></span>
      </button>`).join('')}
    <button class="btn ghost" id="cancelType">Cancel</button>`);

  document.querySelectorAll('.modal [data-type]').forEach((b) => {
    b.onclick = () => {
      close();
      const type = b.dataset.type;
      if (type === 'straight') {
        pickExercise(state, (exId) => {
          const blk = makeBlock('straight', { exerciseId: exId });
          configureBlock(state, blk, () => done(blk), true);
        });
      } else {
        const blk = makeBlock(type);
        configureBlock(state, blk, () => done(blk), true);
      }
    };
  });
  el('cancelType').onclick = close;
}

/* ---------- step 2: pick an exercise ---------- */

function pickExercise(state, done) {
  const live = state.exercises.filter((e) => !e.archived);
  const byCat = CATEGORIES.map((c) => ({ cat: c, items: live.filter((e) => e.category === c) }))
    .filter((g) => g.items.length);

  const close = sheet(`
    <h3>Which exercise?</h3>
    <input type="text" id="exSearch" class="search" placeholder="Search…" autocomplete="off">
    <div id="exList">
      ${byCat.map((g) => `
        <div class="pick-group" data-cat="${esc(g.cat.toLowerCase())}">
          <div class="pick-head">${esc(g.cat)}</div>
          ${g.items.map((e) => `
            <button class="pick-item" data-ex="${esc(e.id)}" data-name="${esc(e.name.toLowerCase())}">
              <span>${esc(e.name)}</span>
              <small style="color:var(--faint)">${esc(TRACK_MODES[e.track].label)}</small>
            </button>`).join('')}
        </div>`).join('')}
    </div>
    <button class="btn" id="newEx">${icon('plus', 17)} New exercise</button>
    <button class="btn ghost" id="cancelEx">Cancel</button>`);

  const search = el('exSearch');
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    document.querySelectorAll('.modal .pick-group').forEach((g) => {
      let any = false;
      g.querySelectorAll('.pick-item').forEach((it) => {
        const hit = !q || it.dataset.name.includes(q) || g.dataset.cat.includes(q);
        it.style.display = hit ? '' : 'none';
        if (hit) any = true;
      });
      g.style.display = any ? '' : 'none';
    });
  };
  document.querySelectorAll('.modal [data-ex]').forEach((b) => {
    b.onclick = () => { close(); done(b.dataset.ex); };
  });
  el('newEx').onclick = () => {
    close();
    editExercise(state, null, (created) => { if (created) done(created.id); });
  };
  el('cancelEx').onclick = close;
}

/* ---------- step 3: configure the block ---------- */

function configureBlock(state, block, done, isNew = false) {
  if (block.type === 'straight') return configStraight(state, block, done, isNew);
  if (block.type === 'superset') return configSuperset(state, block, done, isNew);
  return configMetcon(state, block, done, isNew);
}

/* --- straight sets: the "same every set" vs "set them individually" flow --- */

function configStraight(state, block, done, isNew) {
  const ex = exerciseById(state, block.exerciseId);
  const unit = state.settings.weightUnit || 'lb';
  const sets = block.sets.length ? block.sets : [makeSet()];
  const same = sets.every((s) => s.weight === sets[0].weight && s.reps === sets[0].reps);
  let mode = same ? 'equal' : 'custom';
  let count = sets.length;
  let work = sets.map((s) => ({ ...s }));

  const bwLoaded = ex && isBodyweightLoaded(ex);
  const showsWeight = ex && (ex.track === 'weight_reps' || bwLoaded);
  const showsTime = ex && ex.track === 'time';
  const showsDist = ex && ex.track === 'distance';
  const weightLabel = bwLoaded ? 'Added weight' : 'Weight';
  const weightPlaceholder = bwLoaded ? `+${unit}` : unit;

  const body = () => `
    <h3>${esc(ex ? ex.name : 'Exercise')}</h3>
    <div class="lede">${esc(TRACK_MODES[ex?.track || 'weight_reps'].label)}</div>

    <div class="field">
      <label>How many sets?</label>
      <div class="stepper">
        <button data-step="-1">−</button>
        <b id="setCount">${count}</b>
        <button data-step="1">＋</button>
      </div>
    </div>

    <div class="seg" id="modeSeg">
      <button data-mode="equal" class="${mode === 'equal' ? 'on' : ''}">Same every set</button>
      <button data-mode="custom" class="${mode === 'custom' ? 'on' : ''}">Set individually</button>
    </div>

    <div id="setFields">${mode === 'equal' ? equalFields() : customFields()}</div>
    ${bwLoaded ? '<div class="help">Counted on top of your logged bodyweight. Leave blank for bodyweight alone, or add what a belt or vest is carrying.</div>' : ''}

    <button class="btn primary" id="okBlock">${isNew ? 'Add to workout' : 'Save changes'}</button>
    <button class="btn ghost" id="cancelBlock">Cancel</button>`;

  const fieldFor = (s, i) => {
    if (showsTime) return `<input type="number" inputmode="numeric" data-f="seconds" data-i="${i}" value="${s.seconds ?? ''}" placeholder="secs">`;
    if (showsDist) return `<input type="number" inputmode="numeric" data-f="distance" data-i="${i}" value="${s.distance ?? ''}" placeholder="metres">`;
    return `
      ${showsWeight ? `<input type="number" inputmode="decimal" data-f="weight" data-i="${i}" value="${s.weight ?? ''}" placeholder="${weightPlaceholder}">` : ''}
      <input type="number" inputmode="numeric" data-f="reps" data-i="${i}" value="${s.reps ?? ''}" placeholder="reps">`;
  };

  function equalFields() {
    return `<div class="set-row head"><span></span>${showsWeight && !showsTime && !showsDist ? `<span>${weightLabel}</span>` : ''}<span>${showsTime ? 'Seconds' : showsDist ? 'Metres' : 'Reps'}</span></div>
      <div class="set-row"><span class="sr-n">All</span>${fieldFor(work[0], 0)}</div>`;
  }

  function customFields() {
    return `<div class="set-row head"><span></span>${showsWeight && !showsTime && !showsDist ? `<span>${weightLabel}</span>` : ''}<span>${showsTime ? 'Seconds' : showsDist ? 'Metres' : 'Reps'}</span></div>`
      + work.map((s, i) => `<div class="set-row"><span class="sr-n">${i + 1}</span>${fieldFor(s, i)}</div>`).join('');
  }

  const close = sheet(body());

  const rewire = () => {
    el('setFields').innerHTML = mode === 'equal' ? equalFields() : customFields();
    bindFields();
  };

  function bindFields() {
    document.querySelectorAll('.modal #setFields input').forEach((inp) => {
      inp.oninput = () => {
        const i = +inp.dataset.i;
        const f = inp.dataset.f;
        if (mode === 'equal') work.forEach((s) => { s[f] = num(inp.value); });
        else work[i][f] = num(inp.value);
      };
    });
  }

  function resize(n) {
    count = Math.max(1, Math.min(30, n));
    const tmpl = work[work.length - 1] || makeSet();
    while (work.length < count) work.push({ ...tmpl });
    work.length = count;
    el('setCount').textContent = count;
    if (mode === 'custom') rewire();
  }

  const bindTop = () => {
    document.querySelectorAll('.modal [data-step]').forEach((b) => {
      b.onclick = () => resize(count + +b.dataset.step);
    });
    document.querySelectorAll('.modal [data-mode]').forEach((b) => {
      b.onclick = () => {
        mode = b.dataset.mode;
        document.querySelectorAll('.modal [data-mode]').forEach((x) => x.classList.toggle('on', x === b));
        if (mode === 'equal') work = work.map(() => ({ ...work[0] }));
        rewire();
      };
    });
    el('okBlock').onclick = () => {
      block.sets = work.map((s) => makeSet(s));
      close();
      done();
    };
    el('cancelBlock').onclick = close;
  };
  bindTop();
  bindFields();
}

/* --- superset: several exercises, N rounds --- */

function configSuperset(state, block, done, isNew) {
  const unit = state.settings.weightUnit || 'lb';
  if (!block.items.length) block.items = [];

  const render = () => {
    const html = `
      <h3>Superset</h3>
      <div class="lede">Exercises done back to back. One round means one pass through all of them.</div>
      <div class="field">
        <label>Rounds</label>
        <div class="stepper">
          <button data-r="-1">−</button><b id="ssRounds">${block.rounds}</b><button data-r="1">＋</button>
        </div>
      </div>
      <div class="section-title" style="margin-top:6px">Exercises</div>
      ${block.items.length ? block.items.map((it, i) => `
        <div class="ss-item">
          <div class="ss-name">${esc(exerciseName(state, it.exerciseId))}</div>
          <div class="ss-in">
            <input type="number" inputmode="decimal" data-ss="${i}" data-f="weight" value="${it.sets[0]?.weight ?? ''}" placeholder="${unit}">
            <input type="number" inputmode="numeric" data-ss="${i}" data-f="reps" value="${it.sets[0]?.reps ?? ''}" placeholder="reps">
            <button class="bc-btn" data-ssdel="${i}" aria-label="Remove">${icon('close', 14)}</button>
          </div>
        </div>`).join('') : '<div class="hint">Add at least two exercises.</div>'}
      <button class="btn" id="ssAdd">${icon('plus', 17)} Add exercise</button>
      <button class="btn primary" id="okBlock">${isNew ? 'Add to workout' : 'Save changes'}</button>
      <button class="btn ghost" id="cancelBlock">Cancel</button>`;
    document.querySelector('.modal').innerHTML = html;
    bind();
  };

  const syncSets = () => {
    block.items.forEach((it) => {
      const t = it.sets[0] || makeSet();
      it.sets = fillEqualSets(block.rounds, t);
    });
  };

  function bind() {
    document.querySelectorAll('.modal [data-r]').forEach((b) => {
      b.onclick = () => {
        block.rounds = Math.max(1, Math.min(20, block.rounds + +b.dataset.r));
        syncSets();
        render();
      };
    });
    document.querySelectorAll('.modal [data-ss]').forEach((inp) => {
      inp.oninput = () => {
        const it = block.items[+inp.dataset.ss];
        const v = num(inp.value);
        it.sets.forEach((s) => { s[inp.dataset.f] = v; });
      };
    });
    document.querySelectorAll('.modal [data-ssdel]').forEach((b) => {
      b.onclick = () => { block.items.splice(+b.dataset.ssdel, 1); render(); };
    });
    el('ssAdd').onclick = () => {
      pickExercise(state, (exId) => {
        block.items.push({ exerciseId: exId, sets: fillEqualSets(block.rounds, makeSet()) });
        closeAll();
        configSuperset(state, block, done, isNew);
      });
    };
    el('okBlock').onclick = () => {
      if (block.items.length < 1) { alert('Add at least one exercise.'); return; }
      syncSets();
      closeAll();
      done();
    };
    el('cancelBlock').onclick = closeAll;
  }

  sheet('<div></div>');
  render();
}

/* --- AMRAP / RFT / EMOM: a list of movements plus the clock --- */

function configMetcon(state, block, done, isNew) {
  const unit = state.settings.weightUnit || 'lb';
  const info = blockTypeInfo(block.type);

  const clockFields = () => {
    if (block.type === 'amrap') {
      return `<div class="field"><label>Time cap (minutes)</label>
        <input type="number" inputmode="numeric" id="mcMin" value="${block.minutes}"></div>`;
    }
    if (block.type === 'emom') {
      return `<div class="field"><label>How many minutes</label>
        <input type="number" inputmode="numeric" id="mcMin" value="${block.minutes}"></div>`;
    }
    return `<div class="row2">
      <div class="field"><label>Rounds</label><input type="number" inputmode="numeric" id="mcRounds" value="${block.rounds}"></div>
      <div class="field"><label>Time cap (min)</label><input type="number" inputmode="numeric" id="mcCap" value="${block.capMinutes}"></div>
    </div>`;
  };

  const render = () => {
    document.querySelector('.modal').innerHTML = `
      <h3>${esc(info.label)}</h3>
      <div class="lede">${esc(info.blurb)}</div>
      <div class="field">
        <label>Name it (optional)</label>
        <input type="text" id="mcName" value="${esc(block.name)}" placeholder="e.g. Fran">
        <div class="help">Naming it lets the app chart this exact piece over time.</div>
      </div>
      ${clockFields()}
      <div class="section-title" style="margin-top:6px">Movements${block.type === 'emom' ? ' (rotated each minute)' : ' (one round)'}</div>
      ${block.movements.length ? block.movements.map((m, i) => `
        <div class="ss-item">
          <div class="ss-name">${esc(exerciseName(state, m.exerciseId))}</div>
          <div class="ss-in">
            <input type="number" inputmode="numeric" data-mv="${i}" data-f="reps" value="${m.reps ?? ''}" placeholder="reps">
            <input type="number" inputmode="decimal" data-mv="${i}" data-f="weight" value="${m.weight ?? ''}" placeholder="${unit}">
            <button class="bc-btn" data-mvdel="${i}" aria-label="Remove">${icon('close', 14)}</button>
          </div>
        </div>`).join('') : '<div class="hint">Add the movements for one round.</div>'}
      <button class="btn" id="mcAdd">${icon('plus', 17)} Add movement</button>
      <button class="btn primary" id="okBlock">${isNew ? 'Add to workout' : 'Save changes'}</button>
      <button class="btn ghost" id="cancelBlock">Cancel</button>`;
    bind();
  };

  function readTop() {
    block.name = el('mcName').value.trim();
    if (el('mcMin')) block.minutes = Math.max(1, +el('mcMin').value || 1);
    if (el('mcRounds')) block.rounds = Math.max(1, +el('mcRounds').value || 1);
    if (el('mcCap')) block.capMinutes = Math.max(1, +el('mcCap').value || 1);
  }

  function bind() {
    document.querySelectorAll('.modal [data-mv]').forEach((inp) => {
      inp.oninput = () => { block.movements[+inp.dataset.mv][inp.dataset.f] = num(inp.value); };
    });
    document.querySelectorAll('.modal [data-mvdel]').forEach((b) => {
      b.onclick = () => { readTop(); block.movements.splice(+b.dataset.mvdel, 1); render(); };
    });
    el('mcAdd').onclick = () => {
      readTop();
      pickExercise(state, (exId) => {
        block.movements.push(makeMovement({ exerciseId: exId }));
        closeAll();
        configMetcon(state, block, done, isNew);
      });
    };
    el('okBlock').onclick = () => {
      readTop();
      if (!block.movements.length) { alert('Add at least one movement.'); return; }
      closeAll();
      done();
    };
    el('cancelBlock').onclick = closeAll;
  }

  sheet('<div></div>');
  render();
}

/* ============================================================================
   LOG — doing the workout
   ========================================================================== */

let saveTimer = null;
function queueSave(session) {
  /* The session object is already mutated by the time this runs, so the
     memoised record index is stale from this moment, not from when the
     debounced save lands. */
  invalidateRecords();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.saveSession(session), 350);
}

function renderLog(state, unit) {
  const session = state.sessions.find((s) => s.id === activeId);
  if (!session) { view = 'home'; return redraw(); }

  const done = !!session.finishedAt;

  el('screen-train').innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn" aria-label="Back">${icon('chevronLeft', 18)}</button>
      <h1 style="font-size:22px">${esc(session.name)}<div class="sub">${esc(store.dayLabel(session.day, { weekday: 'long', month: 'short', day: 'numeric' }))}</div></h1>
      <button class="icon-btn" id="sessMenu" aria-label="More">${icon('more', 19)}</button>
    </div>

    <div class="card tight totals" id="totals">${totalsHtml(state, session, unit)}</div>
    ${done ? '<div class="hint" style="text-align:center;margin:-2px 0 12px">Finished workouts are locked. Reopen it below to change anything.</div>' : ''}

    ${session.blocks.map((b) => logBlock(state, b, unit, done)).join('')
      || `<div class="empty"><div class="big">${icon('layers', 34)}</div>Nothing in this workout yet.</div>`}

    ${done ? '' : `<button class="btn" id="addBlockLog" style="margin-top:12px">${icon('plus', 17)} Add a block</button>`}
    ${done
    ? '<button class="btn ghost" id="reopenBtn">Reopen this workout</button>'
    : '<button class="btn primary" id="finishBtn">Finish workout</button>'}`;

  el('backBtn').onclick = () => { view = 'home'; redraw(); };
  el('sessMenu').onclick = () => openSessionMenu(state, session);
  if (done) {
    el('reopenBtn').onclick = () => { session.finishedAt = null; store.saveSession(session); redraw(); };
  } else {
    el('finishBtn').onclick = () => finishSheet(state, session);
    el('addBlockLog').onclick = () => pickBlockType(state, (blk) => {
      session.blocks.push(blk);
      store.saveSession(session);
      redraw();
    });
    wireLogBlock(state, session, unit);
    wireBlockCards(state, session.blocks, () => { store.saveSession(session); redraw(); });
  }
}

function totalsHtml(state, session, unit) {
  const recs = sessionRecords(state, session);
  const vol = recs.reduce((a, r) => a + (r.weight || 0) * (r.reps || 0), 0);
  /* "Sets" means sets you ticked off. A metcon contributes real reps and real
     volume, but calling its rounds "sets" would make the count disagree with
     the number of ticks on screen. */
  const sets = recs.filter((r) => r.kind === 'set').length;
  const reps = recs.reduce((a, r) => a + r.reps, 0);
  return `
    <div class="tiles">
      <div class="tile"><b>${sets}</b><span>Sets done</span></div>
      <div class="tile"><b>${reps}</b><span>Total reps</span></div>
      <div class="tile"><b>${vol ? Math.round(vol).toLocaleString() : '—'}</b><span>Volume ${esc(unit)}</span></div>
    </div>`;
}

function logBlock(state, b, unit, done = false) {
  const info = blockTypeInfo(b.type);
  const dis = done ? 'disabled' : '';
  const head = `
    <div class="bc-head">
      <span class="bc-ic">${icon(info.icon, 19)}</span>
      <div class="bc-t"><b>${esc(blockTitle(state, b))}</b><span>${esc(info.label)}</span></div>
      ${done ? '' : `
        <button class="bc-btn" data-cfg="${esc(b.id)}" aria-label="Edit">${icon('pencil', 14)}</button>
        <button class="bc-btn" data-del="${esc(b.id)}" aria-label="Remove">${icon('close', 14)}</button>`}
    </div>`;

  if (b.type === 'straight') {
    const ex = exerciseById(state, b.exerciseId);
    return `<div class="block-card">${head}
      ${setRows(b.sets, b.id, null, ex, unit, done)}
      ${done ? '' : `<button class="addset" data-addset="${esc(b.id)}">${icon('plus', 14)} Add set</button>`}
    </div>`;
  }

  if (b.type === 'superset') {
    return `<div class="block-card">${head}
      ${Array.from({ length: b.rounds }, (_, r) => `
        <div class="ss-round">
          <div class="ss-rl">Round ${r + 1}</div>
          ${b.items.map((it, ii) => {
    const ex = exerciseById(state, it.exerciseId);
    const s = it.sets[r] || makeSet();
    return `
              <div class="set-row log ss">
                <span class="sr-n" title="${esc(exerciseName(state, it.exerciseId))}">${esc(shortName(exerciseName(state, it.exerciseId)))}</span>
                ${ex && (ex.track === 'weight_reps' || isBodyweightLoaded(ex)) ? `<input type="number" inputmode="decimal" data-ss="${esc(b.id)}:${ii}:${r}" data-f="weight" value="${s.weight ?? ''}" placeholder="${isBodyweightLoaded(ex) ? `+${unit}` : unit}" ${dis}>` : ''}
                <input type="number" inputmode="numeric" data-ss="${esc(b.id)}:${ii}:${r}" data-f="reps" value="${s.reps ?? ''}" placeholder="reps" ${dis}>
                <button class="tick ${s.done ? 'on' : ''}" data-sstick="${esc(b.id)}:${ii}:${r}" aria-label="Done" ${dis}>${icon('check', 19)}</button>
              </div>`;
  }).join('')}
        </div>`).join('')}
    </div>`;
  }

  /* metcons: prescribed movements, then the result */
  const pre = b.movements.map((m) => `
    <div class="mv-line">
      <span>${m.reps ? `${m.reps} × ` : ''}${esc(exerciseName(state, m.exerciseId))}</span>
      <span class="dim">${m.weight ? esc(fmtWeight(m.weight, unit)) : ''}</span>
    </div>`).join('');

  let result = '';
  if (b.type === 'amrap') {
    result = `
      <div class="res-row">
        <div class="field"><label>Rounds</label><input type="number" inputmode="numeric" data-res="${esc(b.id)}:rounds" value="${b.result.rounds ?? ''}" placeholder="0" ${dis}></div>
        <div class="field"><label>+ extra reps</label><input type="number" inputmode="numeric" data-res="${esc(b.id)}:extraReps" value="${b.result.extraReps ?? ''}" placeholder="0" ${dis}></div>
      </div>
      <div class="hint">${b.minutes} minute cap.</div>`;
  } else if (b.type === 'rft') {
    result = `
      <div class="res-row">
        <div class="field"><label>Time (m:ss)</label><input type="text" inputmode="numeric" data-res="${esc(b.id)}:secondsText" value="${b.result.seconds ? fmtDuration(b.result.seconds) : ''}" placeholder="12:30" ${dis}></div>
        <div class="field"><label>Rounds done</label><input type="number" inputmode="numeric" data-res="${esc(b.id)}:roundsDone" value="${b.result.roundsDone ?? ''}" placeholder="${b.rounds}" ${dis}></div>
      </div>
      <div class="hint">${b.rounds} rounds · ${b.capMinutes} min cap. Leave rounds blank if you finished them all.</div>`;
  } else if (b.type === 'emom') {
    result = `
      <div class="res-row">
        <div class="field"><label>Minutes completed</label><input type="number" inputmode="numeric" data-res="${esc(b.id)}:minutesDone" value="${b.result.minutesDone ?? ''}" placeholder="${b.minutes}" ${dis}></div>
      </div>`;
  }

  return `<div class="block-card">${head}<div class="mv-list">${pre}</div>${result}</div>`;
}

/* Superset rows put the exercise name in a narrow gutter, so long names get
   trimmed. The full name stays in the row's title attribute. */
function shortName(n) {
  return n.length > 15 ? `${n.slice(0, 14)}…` : n;
}

function setRows(sets, blockId, _r, ex, unit, done = false) {
  const bwLoaded = ex && isBodyweightLoaded(ex);
  const showsW = ex && (ex.track === 'weight_reps' || bwLoaded);
  const showsT = ex && ex.track === 'time';
  const showsD = ex && ex.track === 'distance';
  const dis = done ? 'disabled' : '';
  return `<div class="set-row head log"><span></span>${showsW ? `<span>${bwLoaded ? 'Added weight' : 'Weight'}</span>` : ''}<span>${showsT ? 'Secs' : showsD ? 'Metres' : 'Reps'}</span><span></span></div>`
    + sets.map((s, i) => `
      <div class="set-row log">
        <span class="sr-n">${i + 1}</span>
        ${showsW ? `<input type="number" inputmode="decimal" data-set="${esc(blockId)}:${i}" data-f="weight" value="${s.weight ?? ''}" placeholder="${bwLoaded ? `+${unit}` : unit}" ${dis}>` : ''}
        ${showsT ? `<input type="number" inputmode="numeric" data-set="${esc(blockId)}:${i}" data-f="seconds" value="${s.seconds ?? ''}" placeholder="secs" ${dis}>`
    : showsD ? `<input type="number" inputmode="numeric" data-set="${esc(blockId)}:${i}" data-f="distance" value="${s.distance ?? ''}" placeholder="m" ${dis}>`
      : `<input type="number" inputmode="numeric" data-set="${esc(blockId)}:${i}" data-f="reps" value="${s.reps ?? ''}" placeholder="reps" ${dis}>`}
        <button class="tick ${s.done ? 'on' : ''}" data-tick="${esc(blockId)}:${i}" aria-label="Done" ${dis}>${icon('check', 19)}</button>
      </div>`).join('');
}

function wireLogBlock(state, session, unit) {
  const find = (id) => session.blocks.find((b) => b.id === id);

  document.querySelectorAll('[data-set]').forEach((inp) => {
    inp.oninput = () => {
      const [bid, i] = inp.dataset.set.split(':');
      const b = find(bid);
      if (!b) return;
      b.sets[+i][inp.dataset.f] = num(inp.value);
      queueSave(session);
      refreshTotals(state, session, unit);
    };
  });
  document.querySelectorAll('[data-tick]').forEach((btn) => {
    btn.onclick = () => {
      const [bid, i] = btn.dataset.tick.split(':');
      const b = find(bid);
      const s = b.sets[+i];
      s.done = !s.done;
      /* Ticking an untouched set means "I did what was planned" — but if it's
         blank there's nothing to record, so treat it as needing a number. */
      btn.classList.toggle('on', s.done);
      store.saveSession(session);
      refreshTotals(state, session, unit);
      buzz();
    };
  });
  document.querySelectorAll('[data-ss]').forEach((inp) => {
    inp.oninput = () => {
      const [bid, ii, r] = inp.dataset.ss.split(':');
      const b = find(bid);
      const it = b.items[+ii];
      if (!it.sets[+r]) it.sets[+r] = makeSet();
      it.sets[+r][inp.dataset.f] = num(inp.value);
      queueSave(session);
      refreshTotals(state, session, unit);
    };
  });
  document.querySelectorAll('[data-sstick]').forEach((btn) => {
    btn.onclick = () => {
      const [bid, ii, r] = btn.dataset.sstick.split(':');
      const b = find(bid);
      const it = b.items[+ii];
      if (!it.sets[+r]) it.sets[+r] = makeSet();
      it.sets[+r].done = !it.sets[+r].done;
      btn.classList.toggle('on', it.sets[+r].done);
      store.saveSession(session);
      refreshTotals(state, session, unit);
      buzz();
    };
  });
  document.querySelectorAll('[data-res]').forEach((inp) => {
    inp.oninput = () => {
      const [bid, field] = inp.dataset.res.split(':');
      const b = find(bid);
      if (field === 'secondsText') b.result.seconds = parseDuration(inp.value);
      else b.result[field] = num(inp.value);
      queueSave(session);
      refreshTotals(state, session, unit);
    };
  });
  document.querySelectorAll('[data-addset]').forEach((btn) => {
    btn.onclick = () => {
      const b = find(btn.dataset.addset);
      const last = b.sets[b.sets.length - 1];
      b.sets.push(makeSet(last ? { weight: last.weight, reps: last.reps } : {}));
      store.saveSession(session);
      redraw();
    };
  });
}

function refreshTotals(state, session, unit) {
  const box = el('totals');
  if (box) box.innerHTML = totalsHtml(state, session, unit);
}

function openSessionMenu(state, session) {
  const close = sheet(`
    <h3>${esc(session.name)}</h3>
    <div class="field">
      <label>Name</label>
      <input type="text" id="sName" value="${esc(session.name)}">
    </div>
    <div class="field">
      <label>Date</label>
      <input type="date" id="sDay" value="${esc(session.day)}" max="${esc(store.todayKey())}">
    </div>
    <div class="field">
      <label>Notes</label>
      <input type="text" id="sNote" value="${esc(session.note)}" placeholder="How did it feel?">
    </div>
    <button class="btn primary" id="sSave">Save</button>
    <button class="btn" id="sTpl">Save as a reusable workout</button>
    <button class="btn danger" id="sDel">Delete this workout</button>
    <button class="btn ghost" id="sCancel">Cancel</button>`);

  el('sSave').onclick = () => {
    session.name = el('sName').value.trim() || 'Workout';
    session.day = el('sDay').value || session.day;
    session.note = el('sNote').value;
    store.saveSession(session);
    close();
    redraw();
  };
  el('sTpl').onclick = () => {
    const t = templateFromSession(session);
    store.saveTemplate(t);
    close();
    toast({ glyph: 'dumbbell', tone: 'streak', ms: 3800, title: 'Saved', body: `"${t.name}" is now in your workouts.` });
  };
  el('sDel').onclick = () => {
    if (!confirm('Delete this workout and everything logged in it?')) return;
    store.deleteSession(session.id);
    close();
    view = 'home';
    redraw();
  };
  el('sCancel').onclick = close;
}

function finishSheet(state, session) {
  /* Offer to tick a training-ish habit, since that's almost always the point. */
  const hab = state.habits.find((h) => !h.archived && h.type === 'binary'
    && /train|workout|lift|gym|exercis/i.test(h.name));
  const already = hab && state.log[session.day]?.[hab.id];

  const close = sheet(`
    <h3>Finish this workout?</h3>
    <div class="lede">${sessionSetCount(state, session)} sets logged. You can always reopen it later.</div>
    ${hab && !already ? `
      <label class="checkrow">
        <input type="checkbox" id="tickHabit" checked>
        <span>Also mark <b>${esc(hab.name)}</b> done for ${esc(store.dayLabel(session.day, { month: 'short', day: 'numeric' }))}</span>
      </label>` : ''}
    ${!session.templateId ? `
      <label class="checkrow">
        <input type="checkbox" id="saveTpl">
        <span>Save this as a reusable workout</span>
      </label>` : ''}
    <button class="btn primary" id="doFinish">Finish</button>
    <button class="btn ghost" id="cancelFinish">Not yet</button>`);

  el('doFinish').onclick = () => {
    session.finishedAt = Date.now();
    store.saveSession(session);
    if (el('tickHabit')?.checked && hab) store.setEntry(session.day, hab.id, 1);
    if (el('saveTpl')?.checked) store.saveTemplate(templateFromSession(session));
    close();
    view = 'home';
    redraw();
    toast({ glyph: 'dumbbell', tone: 'streak', ms: 3800, title: 'Workout logged', body: `${sessionSetCount(state, session)} sets in the book.` });
  };
  el('cancelFinish').onclick = close;
}

/* ============================================================================
   EXERCISE LIBRARY + one exercise's history
   ========================================================================== */

function openLibrary(state) {
  const unit = state.settings.weightUnit || 'lb';
  const live = state.exercises.filter((e) => !e.archived);
  const close = sheet(`
    <h3>Exercise library</h3>
    <div class="lede">${live.length} exercises. Everything you log is tracked against these.</div>
    <div class="field">
      <label>Weight unit</label>
      <div class="seg" id="unitSeg">
        <button data-u="lb" class="${unit === 'lb' ? 'on' : ''}">Pounds</button>
        <button data-u="kg" class="${unit === 'kg' ? 'on' : ''}">Kilos</button>
      </div>
      <div class="help">A label only — the app records the number you type and never converts.</div>
    </div>
    <input type="text" id="libSearch" class="search" placeholder="Search…">
    <div id="libList">
      ${CATEGORIES.map((c) => {
    const items = live.filter((e) => e.category === c);
    if (!items.length) return '';
    return `<div class="pick-group" data-cat="${esc(c.toLowerCase())}">
          <div class="pick-head">${esc(c)}</div>
          ${items.map((e) => `
            <button class="pick-item" data-open="${esc(e.id)}" data-name="${esc(e.name.toLowerCase())}">
              <span>${esc(e.name)}</span><small style="color:var(--faint)">${icon('chevronRight', 14)}</small>
            </button>`).join('')}
        </div>`;
  }).join('')}
    </div>
    <button class="btn" id="libNew">${icon('plus', 17)} New exercise</button>
    <button class="btn ghost" id="libClose">Done</button>`);

  document.querySelectorAll('.modal [data-u]').forEach((b) => {
    b.onclick = () => {
      store.update((s) => { s.settings.weightUnit = b.dataset.u; });
      close();
      openLibrary(store.get());
    };
  });
  const search = el('libSearch');
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    document.querySelectorAll('.modal .pick-group').forEach((g) => {
      let any = false;
      g.querySelectorAll('.pick-item').forEach((it) => {
        const hit = !q || it.dataset.name.includes(q) || g.dataset.cat.includes(q);
        it.style.display = hit ? '' : 'none';
        if (hit) any = true;
      });
      g.style.display = any ? '' : 'none';
    });
  };
  document.querySelectorAll('.modal [data-open]').forEach((b) => {
    b.onclick = () => { close(); exerciseView = b.dataset.open; view = 'exercise'; redraw(); };
  });
  el('libNew').onclick = () => { close(); editExercise(state, null, () => openLibrary(store.get())); };
  el('libClose').onclick = close;
}

function editExercise(state, id, done) {
  const e = id ? exerciseById(state, id) : null;
  const close = sheet(`
    <h3>${e ? 'Edit exercise' : 'New exercise'}</h3>
    <div class="field">
      <label>Name</label>
      <input type="text" id="exName" value="${esc(e?.name ?? '')}" placeholder="e.g. Weighted Pull-up">
    </div>
    <div class="field">
      <label>Category</label>
      <select id="exCat">${CATEGORIES.map((c) => `<option ${e?.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>How is it measured?</label>
      <select id="exTrack">
        ${Object.entries(TRACK_MODES).map(([k, v]) => `<option value="${k}" ${e?.track === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
      </select>
      <div class="help">Weight &amp; reps covers most lifting. Reps only suits bodyweight work; you can still add weight to a set.</div>
    </div>
    <button class="btn primary" id="exSave">${e ? 'Save' : 'Add exercise'}</button>
    ${e ? `<button class="btn" id="exArch">${e.archived ? 'Bring it back' : 'Retire it (keeps history)'}</button>` : ''}
    <button class="btn ghost" id="exCancel">Cancel</button>`);

  el('exSave').onclick = () => {
    const patch = {
      name: el('exName').value.trim() || 'Untitled',
      category: el('exCat').value,
      track: el('exTrack').value,
    };
    let out;
    if (e) { store.updateExercise(e.id, patch); out = { ...e, ...patch }; }
    else out = store.addExercise(patch);
    close();
    done?.(out);
  };
  if (e) el('exArch').onclick = () => { store.archiveExercise(e.id, !e.archived); close(); done?.(e); };
  el('exCancel').onclick = () => { close(); done?.(null); };
}

function renderExercise(state, unit) {
  const ex = exerciseById(state, exerciseView);
  if (!ex) { view = 'home'; return redraw(); }
  const pb = personalBests(state, ex.id);
  /* Same set of records personalBests just looked at — a keyed lookup rather
     than re-flattening every session in your history a second time. */
  const recs = recordsFor(state, ex.id);

  /* Group the recent history by day, newest first. */
  const byDay = new Map();
  recs.forEach((r) => {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day).push(r);
  });
  const days = [...byDay.keys()].sort().reverse().slice(0, 20);

  el('screen-train').innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="backBtn" aria-label="Back">‹</button>
      <h1 style="font-size:18px">${esc(ex.name)}<div class="sub">${esc(ex.category)} · ${esc(TRACK_MODES[ex.track].label)}</div></h1>
      <button class="icon-btn" id="exEdit" aria-label="Edit">${icon('pencil', 18)}</button>
    </div>

    ${pb ? `
      <div class="card tight">
        <div class="tiles">
          ${pb.heaviest ? `<div class="tile"><b>${Math.round(pb.heaviest.weight)}</b><span>Heaviest</span></div>` : ''}
          ${pb.best1RM ? `<div class="tile"><b>${Math.round(pb.best1RM.value)}</b><span>Est. 1RM</span></div>` : ''}
          <div class="tile"><b>${pb.sessions}</b><span>Sessions</span></div>
          <div class="tile"><b>${pb.totalSets}</b><span>Sets</span></div>
        </div>
        ${pb.best1RM ? `<div class="hint" style="margin-top:10px">
          Best estimate came from ${Math.round(pb.best1RM.rec.weight)} ${esc(unit)} × ${pb.best1RM.rec.reps}.
          Estimates only use deliberate sets of 12 reps or fewer.
        </div>` : ''}
        ${isBodyweightLoaded(ex) ? `<div class="hint" style="margin-top:10px">
          Weight here includes your logged bodyweight. Anything you enter on a set is added on top of it.
        </div>` : ''}
      </div>` : `<div class="empty"><div class="big">${icon('chartLine', 34)}</div>No history yet. Log a workout with this in it.</div>`}

    ${days.length ? `
      <div class="section-title">Recent sessions</div>
      ${days.map((d) => {
    const rs = byDay.get(d);
    return `<div class="wcard static">
          <div class="wc-body">
            <div class="wc-name">${esc(store.dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' }))}</div>
            <div class="wc-sub">${rs.map((r) => (r.weight ? `${Math.round(r.weight)}×${r.reps}` : `${r.reps || r.seconds || r.distance}`)).join('  ·  ')}</div>
          </div>
        </div>`;
  }).join('')}` : ''}

    <div class="hint" style="margin-top:14px;text-align:center">
      Open the <b>Data</b> tab to chart this over months and years.
    </div>`;

  el('backBtn').onclick = () => { view = 'home'; redraw(); };
  el('exEdit').onclick = () => editExercise(state, ex.id, () => redraw());
}

/* ============================================================================
   little helpers
   ========================================================================== */


function buzz() {
  try { navigator.vibrate?.(12); } catch { /* not supported */ }
}
