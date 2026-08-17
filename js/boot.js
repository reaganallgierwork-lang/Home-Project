/* ============================================================================
   BOOT — starts the app and registers the service worker.
   ----------------------------------------------------------------------------
   This lives in its own file rather than in a <script> block inside
   index.html for one specific reason: the Content-Security-Policy in that
   file sets script-src 'self', which blocks inline scripts outright. That
   is the point — an inline-script allowance is exactly what a cross-site
   scripting payload needs to run. Keeping every line of JavaScript in a
   real file is what lets the policy stay strict.
   ========================================================================== */

import { start } from './ui.js';

start();

/* The service worker is what makes the app open instantly and work with no
   signal. It only registers on a real https address, so opening the file
   locally just skips it harmlessly. */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
