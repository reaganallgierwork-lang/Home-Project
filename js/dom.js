/* ============================================================================
   DOM — the three helpers every screen needs, in one place.
   ----------------------------------------------------------------------------
   These were previously copy-pasted into ui.js, train.js, weight.js and
   analyze.js. Four copies of an HTML escaper is four chances for one of them
   to drift, which matters more here than the bytes: esc() is a security
   control, not a convenience.

   A leaf module with no imports except icons, so anything can use it without
   risking an import cycle.
   ========================================================================== */

import { icon } from './icons.js';

export const el = (id) => document.getElementById(id);

/** Escape for HTML text AND quoted attribute contexts. Both quote forms are
    covered, so `attr="${esc(v)}"` and `attr='${esc(v)}'` are equally safe. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/**
 * A transient message in the corner.
 *   glyph  icon key (default 'star')
 *   tone   extra class for colour ('streak', 'tier', ...)
 *   ms     how long before it fades
 * Tap to dismiss early — that used to be true of only one of the three
 * copies of this function, so it is now true everywhere.
 */
export function toast({ glyph = 'star', title = '', body = '', tone = '', ms = 4200 }) {
  const box = el('toasts');
  if (!box) return;
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.innerHTML = `<div class="ic-wrap">${icon(glyph, 20)}</div>`
    + `<div class="tx"><div class="tt">${esc(title)}</div><div class="tb">${esc(body)}</div></div>`;
  box.appendChild(node);
  node.onclick = () => node.remove();
  setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 320); }, ms);
}
