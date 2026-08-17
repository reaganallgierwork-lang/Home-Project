/* ============================================================================
   SHEET — the bottom-sheet overlay used everywhere a screen pops something up
   without leaving it: pickers, forms, the day/exercise detail views.
   ----------------------------------------------------------------------------
   One shared implementation so every caller — ui.js, train.js, weight.js,
   analyze.js — gets identical behaviour, including swipe-to-dismiss: pull
   down from the very top of the sheet's own scroll position and it closes,
   the way an iOS sheet does. Anywhere below the top, the same drag just
   scrolls the content, same as any list — so a long scrolling picker never
   has to be dragged all the way back down to find a Close button.

   A deliberate leaf module with no imports of its own, so every screen can
   import it without creating a cycle (see the note on store.js's newId()
   re-export for why that matters in this codebase).
   ========================================================================== */

/* How far (px) or how fast (px/ms) a release has to be to count as "let go
   of this sheet" rather than "snap back". Matched to feel like an iOS sheet
   — a firm flick closes it even if it barely moved. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 0.5;

/* Sheets currently open, most-recent last — lets closeAllSheets() unwind a
   whole flow (picker → sub-picker → ...) in one call, and lets the scroll
   lock only release once nothing is left open. */
const stack = [];
let lockCount = 0;

export function lockScroll() {
  lockCount += 1;
  document.body.style.overflow = 'hidden';
}

/** Release one scroll lock. Only actually unlocks once every sheet (and
    anything else sharing the lock, like the photo viewer) has released. */
export function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = '';
}

/**
 * Opens a bottom sheet containing `html`. Returns a close() function —
 * tapping the backdrop, pulling down from the top of the sheet, and calling
 * close() directly all end it the same way.
 */
export function openSheet(html) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(back);
  lockScroll();

  const panel = back.querySelector('.modal');
  const entry = { back };
  stack.push(entry);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    unlockScroll();
  };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  wireSwipeToDismiss(panel, close);
  return close;
}

/** Close every open sheet at once — used when one flow hands off straight
    to another (e.g. picking an exercise mid-way through building a block). */
export function closeAllSheets() {
  while (stack.length) stack.pop().back.remove();
  lockCount = 0;
  document.body.style.overflow = '';
}

/* ----------------------------------------------------------------------------
   Swipe-to-dismiss: pull down from the top of the sheet's own scroll.
   ----------------------------------------------------------------------------
   This is driven by TOUCH events, not Pointer Events, and that is not a
   stylistic choice — Pointer Events cannot do this job on a phone:

     touchstart           cancelable: true
     touchmove  (+16px)   cancelable: true   <- the only chance to claim it
     pointercancel                           <- browser takes the gesture
     touchmove  (+32px)   cancelable: false  <- too late, it is scrolling now

   The moment the browser decides a touch gesture is a scroll it fires
   pointercancel and stops sending pointermove, and preventDefault() on a
   pointermove never stopped the scroll in the first place. So the decision
   has to be made inside a non-passive touchmove handler, on the first move
   that still reports cancelable — hence { passive: false } below, and the
   deliberately small DECIDE_SLOP so we always decide before the browser's
   own (larger) scroll threshold does.

   Mouse drags go through a separate, much simpler path: no browser gesture
   arbitration to race, so pointer events are fine there.
   -------------------------------------------------------------------------- */

/* Movement (px) before a gesture is judged a pull-down rather than a scroll.
   Must stay below the browser's own scroll slop (~5-8px) so we decide first. */
const DECIDE_SLOP = 3;

function wireSwipeToDismiss(panel, close) {
  let atTop = false;    // was the sheet at its own scroll top when this began
  let decided = false;  // have we judged what this gesture is yet
  let dragging = false; // ...and did it turn out to be a dismiss drag
  let startY = 0;
  let dy = 0;
  let prevY = 0;
  let prevT = 0;
  let velocity = 0;     // px/ms, positive = downward

  const settle = () => {
    panel.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1), opacity .22s ease';
    panel.style.transform = '';
    panel.style.opacity = '';
  };

  const begin = (y, t, target) => {
    decided = false;
    dragging = false;
    dy = 0;
    velocity = 0;
    startY = y;
    prevY = y;
    prevT = t;
    /* Only a candidate if the sheet is already at its own scroll top —
       anywhere else, a downward drag is an ordinary scroll and must stay
       one. Controls that own their own drag (the weight sliders in
       settings) are never a dismiss, however sloppy the gesture. */
    atTop = panel.scrollTop <= 0 && !target?.closest?.('input[type=range]');
  };

  /** Returns true if the caller should preventDefault (we've taken over). */
  const move = (y, t) => {
    if (!atTop) return false;
    dy = y - startY;

    if (!decided) {
      if (Math.abs(dy) < DECIDE_SLOP) return false;
      decided = true;
      dragging = dy > 0 && panel.scrollTop <= 0;
      if (!dragging) { atTop = false; return false; }
      /* The entrance animation has "both" fill — without cancelling it the
         keyframed transform keeps beating the inline one set below and the
         drag would visibly do nothing. */
      panel.style.animation = 'none';
      panel.style.transition = 'none';
    }
    if (!dragging) return false;

    const dt = Math.max(1, t - prevT);
    velocity = (y - prevY) / dt;
    prevY = y;
    prevT = t;

    /* Pulled back above where it started: sit at rest but stay in the
       gesture, so carrying on downward again picks straight back up. */
    const shown = Math.max(0, dy);
    /* Resistance past the first ~140px so it never feels like the sheet is
       about to fly off screen before you've decided to let go. */
    const eased = shown < 140 ? shown : 140 + (shown - 140) * 0.25;
    panel.style.transform = `translateY(${eased}px)`;
    panel.style.opacity = String(Math.max(0.5, 1 - eased / 400));
    return true;
  };

  const end = () => {
    if (!dragging) { atTop = false; return; }
    dragging = false;
    atTop = false;
    if (dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      panel.style.transition = 'transform .18s ease-in, opacity .18s ease-in';
      panel.style.transform = 'translateY(100%)';
      panel.style.opacity = '0';
      setTimeout(close, 160);
    } else {
      settle();
    }
  };

  /* ---- touch: the path that actually runs on the phone ---- */
  panel.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { atTop = false; return; }
    begin(e.touches[0].clientY, e.timeStamp, e.target);
  }, { passive: true });

  panel.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    /* Non-passive on purpose: preventDefault here is the whole mechanism —
       it stops the browser turning this into a scroll and cancelling us. */
    if (move(e.touches[0].clientY, e.timeStamp) && e.cancelable) e.preventDefault();
  }, { passive: false });

  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', () => { dragging = false; atTop = false; settle(); });

  /* ---- mouse: no gesture arbitration to race, so this stays simple ---- */
  panel.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    begin(e.clientY, e.timeStamp, e.target);
  });
  panel.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (move(e.clientY, e.timeStamp)) e.preventDefault();
  });
  panel.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') end(); });
}
