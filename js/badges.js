/* ============================================================================
   BADGES — the artwork.
   ----------------------------------------------------------------------------
   Every badge is drawn as an SVG right in the page, so they're razor sharp at
   any size and weigh nothing. They're deliberately ranked: a Foundation badge
   is a plain struck coin, and by the time you reach Eclipse you've got a
   rotating corona and a starfield. You should be able to tell rank at a glance
   across a room.

   Each function returns SVG markup. `renderBadge(art, size)` picks the right
   one. Ids are made unique per call so several badges can share a screen
   without their gradients bleeding into each other.
   ========================================================================== */

let uid = 0;
const nid = () => `b${(uid += 1)}`;

/* A ring of evenly spaced points — used for studs, rays and stars. */
function ring(count, radius, cx = 50, cy = 50, offset = -90) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = ((offset + (360 / count) * i) * Math.PI) / 180;
    out.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return out;
}

function star(cx, cy, r, points = 5, inner = 0.42) {
  const pts = [];
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 ? r * inner : r;
    const a = ((-90 + (180 / points) * i) * Math.PI) / 180;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/* ---------------------------------------------------------------------------
   TIER 1 — Foundation. A plain struck bronze coin. Honest, unfussy.
   ------------------------------------------------------------------------- */
function bronze() {
  const g = nid();
  return `
  <defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c98f5a"/><stop offset="0.5" stop-color="#9b6236"/><stop offset="1" stop-color="#6d4222"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="40" fill="url(#${g})"/>
  <circle cx="50" cy="50" r="40" fill="none" stroke="#3f2513" stroke-width="3"/>
  <circle cx="50" cy="50" r="31" fill="none" stroke="#e2b184" stroke-width="1.6" opacity="0.55"/>
  <path d="M36 51 L46 61 L66 40" fill="none" stroke="#f3ddc7" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/* ---------------------------------------------------------------------------
   TIER 2 — Momentum. Brushed steel, studded rim, a forward chevron.
   ------------------------------------------------------------------------- */
function steel() {
  const g = nid(); const s = nid();
  const studs = ring(12, 35).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.7" fill="#cfe0ee" opacity="0.75"/>`).join('');
  return `
  <defs>
    <linearGradient id="${g}" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#e8f1f8"/><stop offset="0.35" stop-color="#93a8bb"/>
      <stop offset="0.65" stop-color="#5d7488"/><stop offset="1" stop-color="#8fa6ba"/>
    </linearGradient>
    <linearGradient id="${s}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.1"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="41" fill="url(#${g})"/>
  <circle cx="50" cy="50" r="41" fill="none" stroke="#2f3f4d" stroke-width="3"/>
  ${studs}
  <circle cx="50" cy="50" r="28" fill="#33445473"/>
  <path d="M34 62 L50 40 L66 62" fill="none" stroke="url(#${s})" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M34 72 L50 50 L66 72" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/* ---------------------------------------------------------------------------
   TIER 3 — Consistency. Gold, radiating, a laurel and a star.
   ------------------------------------------------------------------------- */
function gold() {
  const g = nid(); const r = nid();
  const rays = ring(24, 46).map(([x, y], i) => (i % 2
    ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.4" fill="#ffe9a8" opacity="0.8"/>`
    : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="#ffd25e" opacity="0.9"/>`)).join('');
  return `
  <defs>
    <radialGradient id="${r}" cx="0.5" cy="0.35">
      <stop offset="0" stop-color="#fff6cf"/><stop offset="0.55" stop-color="#f2b731"/><stop offset="1" stop-color="#9a6a06"/>
    </radialGradient>
    <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3c0"/><stop offset="1" stop-color="#d99612"/>
    </linearGradient>
  </defs>
  <g class="bx-spin-slow" style="transform-origin:50px 50px">${rays}</g>
  <circle cx="50" cy="50" r="37" fill="url(#${r})"/>
  <circle cx="50" cy="50" r="37" fill="none" stroke="#7d5300" stroke-width="2.5"/>
  <circle cx="50" cy="50" r="29" fill="none" stroke="#fff2c4" stroke-width="1.4" opacity="0.7"/>
  <polygon points="${star(50, 49, 20)}" fill="url(#${g})" stroke="#8a5c00" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M28 66 q8 10 22 10 q14 0 22 -10" fill="none" stroke="#fff0bb" stroke-width="2" opacity="0.5"/>`;
}

/* ---------------------------------------------------------------------------
   TIER 4 — Discipline. Platinum shield, cut gem, faceted. The prestige gate.
   ------------------------------------------------------------------------- */
function platinum() {
  const g = nid(); const gem = nid(); const glow = nid();
  const studs = ring(8, 40).map(([x, y]) => `<polygon points="${star(x, y, 3.4, 4, 0.35)}" fill="#d8fbff" opacity="0.85"/>`).join('');
  return `
  <defs>
    <linearGradient id="${g}" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#f3fbff"/><stop offset="0.4" stop-color="#a9c6d4"/>
      <stop offset="0.7" stop-color="#4f7488"/><stop offset="1" stop-color="#c2dae6"/>
    </linearGradient>
    <linearGradient id="${gem}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8ff4e6"/><stop offset="0.45" stop-color="#22c1c3"/><stop offset="1" stop-color="#0b6b8f"/>
    </linearGradient>
    <radialGradient id="${glow}" cx="0.5" cy="0.5">
      <stop offset="0" stop-color="#7ef0ff" stop-opacity="0.55"/><stop offset="1" stop-color="#7ef0ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#${glow})" class="bx-pulse"/>
  <g class="bx-spin-slow" style="transform-origin:50px 50px">${studs}</g>
  <path d="M50 10 L84 26 V52 Q84 76 50 90 Q16 76 16 52 V26 Z" fill="url(#${g})" stroke="#2a4353" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M50 17 L78 30 V52 Q78 71 50 83 Q22 71 22 52 V30 Z" fill="#16303d" opacity="0.55"/>
  <polygon points="50,32 66,50 50,72 34,50" fill="url(#${gem})" stroke="#d9fbff" stroke-width="1.6" stroke-linejoin="round"/>
  <polygon points="50,32 58,50 50,52 42,50" fill="#ffffff" opacity="0.45"/>
  <polygon points="34,50 50,52 50,72" fill="#000000" opacity="0.18"/>`;
}

/* ---------------------------------------------------------------------------
   TIER 5 — Relentless. Prismatic, crowned, shimmering. The top of the month.
   ------------------------------------------------------------------------- */
function prismatic() {
  const g = nid(); const sh = nid(); const glow = nid();
  const spikes = ring(16, 47).map(([x, y], i) => `<polygon points="${star(x, y, i % 2 ? 2.2 : 4, 4, 0.3)}" fill="#ffffff" opacity="${i % 2 ? 0.5 : 0.85}"/>`).join('');
  return `
  <defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff7bd5"/><stop offset="0.25" stop-color="#8b7bff"/>
      <stop offset="0.5" stop-color="#3fd6ff"/><stop offset="0.75" stop-color="#5cffc0"/>
      <stop offset="1" stop-color="#ffd86b"/>
    </linearGradient>
    <linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="${glow}" cx="0.5" cy="0.5">
      <stop offset="0.55" stop-color="#c9a6ff" stop-opacity="0.5"/><stop offset="1" stop-color="#c9a6ff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${sh}c"><circle cx="50" cy="50" r="34"/></clipPath>
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#${glow})" class="bx-pulse"/>
  <g class="bx-spin" style="transform-origin:50px 50px">${spikes}</g>
  <circle cx="50" cy="50" r="38" fill="url(#${g})" class="bx-hue"/>
  <circle cx="50" cy="50" r="38" fill="none" stroke="#ffffff" stroke-width="2.4" opacity="0.9"/>
  <circle cx="50" cy="50" r="34" fill="#1a1030" opacity="0.55"/>
  <g clip-path="url(#${sh}c)"><rect class="bx-sheen" x="-60" y="0" width="45" height="100" fill="url(#${sh})"/></g>
  <path d="M31 60 L31 42 L40 50 L50 37 L60 50 L69 42 L69 60 Z" fill="url(#${g})" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" class="bx-hue"/>
  <rect x="31" y="63" width="38" height="5" rx="2.5" fill="url(#${g})" stroke="#fff" stroke-width="1.4" class="bx-hue"/>
  <polygon points="${star(50, 30, 4.5)}" fill="#fff"/>`;
}

/* ---------------------------------------------------------------------------
   SECOND WIND — the guardrail badge. Warm, upward, unmistakably positive.
   ------------------------------------------------------------------------- */
function comeback() {
  const g = nid(); const glow = nid();
  return `
  <defs>
    <linearGradient id="${g}" x1="0" y1="1" x2="0.4" y2="0">
      <stop offset="0" stop-color="#ff8a4c"/><stop offset="0.55" stop-color="#ffc14d"/><stop offset="1" stop-color="#7ef0a0"/>
    </linearGradient>
    <radialGradient id="${glow}" cx="0.5" cy="0.65">
      <stop offset="0" stop-color="#ffb066" stop-opacity="0.5"/><stop offset="1" stop-color="#ffb066" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="47" fill="url(#${glow})" class="bx-pulse"/>
  <circle cx="50" cy="50" r="38" fill="#241a12"/>
  <circle cx="50" cy="50" r="38" fill="none" stroke="url(#${g})" stroke-width="4"/>
  <path d="M26 68 Q34 40 50 44 Q66 48 74 30" fill="none" stroke="url(#${g})" stroke-width="6.5" stroke-linecap="round"/>
  <path d="M63 29 L76 27 L74 40" fill="none" stroke="#7ef0a0" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="50" cy="44" r="4" fill="#fff"/>`;
}

/* ---------------------------------------------------------------------------
   META 3 — Ember. Living fire.
   ------------------------------------------------------------------------- */
function ember() {
  const g = nid(); const c = nid(); const glow = nid();
  return `
  <defs>
    <linearGradient id="${g}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff3d2e"/><stop offset="0.45" stop-color="#ff8b1f"/><stop offset="1" stop-color="#ffe36b"/>
    </linearGradient>
    <linearGradient id="${c}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ffd15c"/><stop offset="1" stop-color="#fff6d4"/>
    </linearGradient>
    <radialGradient id="${glow}" cx="0.5" cy="0.6">
      <stop offset="0" stop-color="#ff7a1f" stop-opacity="0.65"/><stop offset="1" stop-color="#ff7a1f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#${glow})" class="bx-pulse"/>
  <circle cx="50" cy="50" r="39" fill="#1c0d06" stroke="url(#${g})" stroke-width="3.5"/>
  <g class="bx-flicker">
    <path d="M50 18 C64 34 70 44 70 55 A20 20 0 0 1 30 55 C30 42 42 38 44 26 C52 33 50 40 50 18 Z" fill="url(#${g})"/>
    <path d="M50 40 C57 49 59 53 59 59 A9 9 0 0 1 41 59 C41 52 47 50 50 40 Z" fill="url(#${c})"/>
  </g>
  <text x="50" y="87" text-anchor="middle" font-size="13" font-weight="800" fill="#ffd9a1" font-family="system-ui,sans-serif">3</text>`;
}

/* ---------------------------------------------------------------------------
   META 6 — Aurora. Orbiting, colour-shifting, cold and beautiful.
   ------------------------------------------------------------------------- */
function aurora() {
  const g = nid(); const g2 = nid(); const glow = nid();
  const stars = ring(20, 47).map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i % 3 ? 1 : 1.9}" fill="#dff6ff" opacity="${i % 3 ? 0.45 : 0.9}"/>`).join('');
  return `
  <defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5cffc0"/><stop offset="0.4" stop-color="#3fd6ff"/>
      <stop offset="0.75" stop-color="#8b7bff"/><stop offset="1" stop-color="#ff7bd5"/>
    </linearGradient>
    <linearGradient id="${g2}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5cffc0" stop-opacity="0.15"/><stop offset="0.5" stop-color="#8b7bff" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#3fd6ff" stop-opacity="0.15"/>
    </linearGradient>
    <radialGradient id="${glow}" cx="0.5" cy="0.5">
      <stop offset="0.4" stop-color="#54d6ff" stop-opacity="0.45"/><stop offset="1" stop-color="#54d6ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#${glow})" class="bx-pulse"/>
  <g class="bx-spin-slow" style="transform-origin:50px 50px">${stars}</g>
  <circle cx="50" cy="50" r="38" fill="#080c22" stroke="url(#${g})" stroke-width="3.5" class="bx-hue"/>
  <g class="bx-hue">
    <path d="M20 62 Q32 34 44 52 Q54 68 64 44 Q72 26 82 46" fill="none" stroke="url(#${g2})" stroke-width="9" stroke-linecap="round" opacity="0.95"/>
    <path d="M20 70 Q32 46 44 62 Q54 76 64 56 Q72 40 82 58" fill="none" stroke="url(#${g2})" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
  </g>
  <ellipse cx="50" cy="50" rx="44" ry="15" fill="none" stroke="#9fe8ff" stroke-width="1.6" opacity="0.55" transform="rotate(-22 50 50)" class="bx-spin"/>
  <text x="50" y="88" text-anchor="middle" font-size="13" font-weight="800" fill="#bfe9ff" font-family="system-ui,sans-serif">6</text>`;
}

/* ---------------------------------------------------------------------------
   META 12 — Eclipse. The rarest thing in the app. Black sun, gold corona.
   ------------------------------------------------------------------------- */
function eclipse() {
  const g = nid(); const cor = nid(); const glow = nid();
  const flares = ring(36, 44).map(([x, y], i) => {
    const long = i % 3 === 0;
    return `<polygon points="${star(x, y, long ? 6 : 2.6, 4, 0.18)}" fill="#ffd77a" opacity="${long ? 0.95 : 0.5}"/>`;
  }).join('');
  const sparks = ring(7, 30, 50, 50, -70).map(([x, y]) => `<polygon points="${star(x, y, 3, 4, 0.22)}" fill="#fff8e0"/>`).join('');
  return `
  <defs>
    <radialGradient id="${cor}" cx="0.5" cy="0.5">
      <stop offset="0.52" stop-color="#ffcf5c" stop-opacity="0"/>
      <stop offset="0.6" stop-color="#ffcf5c" stop-opacity="0.95"/>
      <stop offset="0.72" stop-color="#ff8a2b" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#ff5c2b" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${glow}" cx="0.5" cy="0.5">
      <stop offset="0.3" stop-color="#ffb43a" stop-opacity="0.5"/><stop offset="1" stop-color="#ff5c2b" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff3c4"/><stop offset="0.5" stop-color="#ffc247"/><stop offset="1" stop-color="#c07a10"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#${glow})" class="bx-pulse"/>
  <g class="bx-spin" style="transform-origin:50px 50px">${flares}</g>
  <circle cx="50" cy="50" r="46" fill="url(#${cor})"/>
  <g class="bx-spin-rev" style="transform-origin:50px 50px">${sparks}</g>
  <circle cx="50" cy="50" r="26" fill="#05040a"/>
  <circle cx="50" cy="50" r="26" fill="none" stroke="url(#${g})" stroke-width="2.6"/>
  <circle cx="50" cy="50" r="26" fill="none" stroke="#fff" stroke-width="1" opacity="0.35"/>
  <text x="50" y="55" text-anchor="middle" font-size="19" font-weight="900" fill="url(#${g})" font-family="system-ui,sans-serif">12</text>`;
}

const ART = { bronze, steel, gold, platinum, prismatic, comeback, ember, aurora, eclipse };

/**
 * Draw a badge.
 * @param {string} art   one of the keys of ART
 * @param {number} size  pixels
 * @param {boolean} dim  render greyed-out (not yet earned)
 */
export function renderBadge(art, size = 84, dim = false) {
  const fn = ART[art] || bronze;
  return `<svg class="badge-svg${dim ? ' is-locked' : ''}" viewBox="0 0 100 100" width="${size}" height="${size}"
    role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${fn()}</svg>`;
}

export const BADGE_ART_KEYS = Object.keys(ART);
