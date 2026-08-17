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
   Pointer Events cover touch, pen and mouse in one API, which is also what
   lets this be driven from a script (mouse events) for testing.
   -------------------------------------------------------------------------- */

function wireSwipeToDismiss(panel, close) {
  let active = false;   // currently tracking a possible dismiss drag
  let startY = 0;
  let dy = 0;
  let prevY = 0;
  let prevT = 0;
  let velocity = 0;     // px/ms, positive = downward

  const reset = () => {
    active = false;
    dy = 0;
    velocity = 0;
    panel.style.transition = 'transform .22s cubic-bezier(.2,.9,.2,1), opacity .22s ease';
    panel.style.transform = '';
    panel.style.opacity = '';
  };

  panel.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    /* Only a candidate if the sheet is already scrolled to the very top —
       otherwise this is an ordinary scroll and should behave like one. */
    if (panel.scrollTop > 0) return;
    active = true;
    startY = e.clientY;
    prevY = e.clientY;
    prevT = e.timeStamp;
    dy = 0;
    velocity = 0;
    /* The entrance animation has "both" fill — without cancelling it here,
       it keeps winning the cascade over the inline transform below and the
       drag would visibly do nothing. */
    panel.style.animation = 'none';
    panel.style.transition = 'none';
  });

  panel.addEventListener('pointermove', (e) => {
    if (!active) return;
    const y = e.clientY;
    dy = y - startY;
    /* Swiping back up, or having scrolled past the top mid-gesture, hands
       control straight back to the browser's normal scrolling. */
    if (dy <= 0 || panel.scrollTop > 0) { reset(); return; }
    e.preventDefault();
    const dt = Math.max(1, e.timeStamp - prevT);
    velocity = (y - prevY) / dt;
    prevY = y;
    prevT = e.timeStamp;
    /* Resistance past the first ~140px so it never feels like the sheet is
       about to fly off screen before you've decided to let go. */
    const eased = dy < 140 ? dy : 140 + (dy - 140) * 0.25;
    panel.style.transform = `translateY(${eased}px)`;
    panel.style.opacity = String(Math.max(0.5, 1 - eased / 400));
  });

  const finish = () => {
    if (!active) return;
    active = false;
    if (dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      panel.style.transition = 'transform .18s ease-in, opacity .18s ease-in';
      panel.style.transform = 'translateY(100%)';
      panel.style.opacity = '0';
      setTimeout(close, 160);
    } else {
      reset();
    }
  };
  panel.addEventListener('pointerup', finish);
  panel.addEventListener('pointercancel', reset);
}
