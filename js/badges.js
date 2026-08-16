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
   The house palette, shared by every badge so the set reads as one family.
   Gold, bronze, steel and onyx — no other hues anywhere in the collection.
   ------------------------------------------------------------------------- */
const M = {
  gold: '#D4AF37', goldHi: '#F5E08C', goldLo: '#8A6410',
  bronze: '#B8860B', bronzeHi: '#E0A93C', bronzeLo: '#6B4A08',
  steel: '#A7ADB5', steelHi: '#E4E8EC', steelLo: '#4E555F',
  onyx: '#0B0D11', slate: '#1E222A', ink: '#05060A',
};

/** A brushed-metal fill: highlight top-left, shadow bottom-right. */
function metal(id, hi, mid, lo) {
  return `<linearGradient id="${id}" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="${hi}"/><stop offset="0.42" stop-color="${mid}"/>
    <stop offset="0.72" stop-color="${lo}"/><stop offset="1" stop-color="${mid}"/>
  </linearGradient>`;
}

/* ---------------------------------------------------------------------------
   TIER 1 — Foundation. A struck gold shield with a clean check. The board's
   opening mark: solid, unfussy, obviously the first rung.
   ------------------------------------------------------------------------- */
function bronze() {
  const g = nid(); const r = nid();
  return `
  <defs>
    ${metal(g, M.goldHi, M.gold, M.goldLo)}
    <radialGradient id="${r}" cx="0.5" cy="0.36">
      <stop offset="0" stop-color="#2A2E36"/><stop offset="1" stop-color="${M.onyx}"/>
    </radialGradient>
  </defs>
  <path d="M50 8l34 13v25c0 19-14 33-34 42-20-9-34-23-34-42V21z" fill="url(#${g})"/>
  <path d="M50 15l27 10.5v20c0 15-11 26-27 33-16-7-27-18-27-33v-20z" fill="url(#${r})"/>
  <path d="M36 51l10 10 20-22" fill="none" stroke="url(#${g})" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/* ---------------------------------------------------------------------------
   TIER 2 — Momentum. A dark steel medallion with the ascent chevron.
   ------------------------------------------------------------------------- */
function steel() {
  const g = nid(); const c = nid();
  const studs = ring(16, 40).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" fill="${M.steelHi}" opacity="0.5"/>`).join('');
  return `
  <defs>
    ${metal(g, M.steelHi, M.steel, M.steelLo)}
    ${metal(c, M.goldHi, M.gold, M.goldLo)}
  </defs>
  <circle cx="50" cy="50" r="45" fill="url(#${g})"/>
  <circle cx="50" cy="50" r="45" fill="none" stroke="${M.ink}" stroke-width="2" opacity="0.6"/>
  <circle cx="50" cy="50" r="36" fill="${M.onyx}"/>
  ${studs}
  <circle cx="50" cy="50" r="36" fill="none" stroke="url(#${g})" stroke-width="1.4" opacity="0.7"/>
  <path d="M32 62L50 36l18 26" fill="none" stroke="url(#${c})" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M38 70L50 52l12 18" fill="none" stroke="url(#${c})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>`;
}

/* ---------------------------------------------------------------------------
   TIER 3 — Consistency. A steel compass star inside a hexagon.
   ------------------------------------------------------------------------- */
function gold() {
  const g = nid(); const h = nid();
  const hex = ring(6, 44, 50, 50, -90).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const hexIn = ring(6, 35, 50, 50, -90).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `
  <defs>
    ${metal(g, M.steelHi, M.steel, M.steelLo)}
    ${metal(h, M.goldHi, M.gold, M.goldLo)}
  </defs>
  <polygon points="${hex}" fill="url(#${g})" stroke="${M.ink}" stroke-width="1.6" stroke-linejoin="round"/>
  <polygon points="${hexIn}" fill="${M.onyx}"/>
  <polygon points="${star(50, 50, 26, 4, 0.30)}" fill="url(#${h})"/>
  <polygon points="${star(50, 50, 15, 4, 0.34)}" fill="${M.steelHi}" opacity="0.55" transform="rotate(45 50 50)"/>
  <circle cx="50" cy="50" r="4" fill="${M.onyx}" stroke="url(#${h})" stroke-width="1.4"/>`;
}

/* ---------------------------------------------------------------------------
   TIER 4 — Discipline. A platinum hexagon holding a cut diamond. The
   prestige gate, so it is visibly a step up in construction.
   ------------------------------------------------------------------------- */
function platinum() {
  const g = nid(); const d = nid(); const glow = nid();
  const hex = ring(6, 45, 50, 50, -90).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const hexIn = ring(6, 37, 50, 50, -90).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const pips = ring(6, 41, 50, 50, -60).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${M.goldHi}" opacity="0.85"/>`).join('');
  return `
  <defs>
    ${metal(g, '#FFFFFF', M.steel, M.steelLo)}
    ${metal(d, M.steelHi, M.steel, '#5B636E')}
    <radialGradient id="${glow}" cx="0.5" cy="0.5">
      <stop offset="0.45" stop-color="${M.steelHi}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${M.steelHi}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="49" fill="url(#${glow})" class="bx-pulse"/>
  <polygon points="${hex}" fill="url(#${g})" stroke="${M.ink}" stroke-width="1.8" stroke-linejoin="round"/>
  <polygon points="${hexIn}" fill="${M.onyx}"/>
  ${pips}
  <polygon points="50,26 68,45 50,74 32,45" fill="url(#${d})" stroke="${M.steelHi}" stroke-width="1.4" stroke-linejoin="round"/>
  <polygon points="50,26 59,45 50,49 41,45" fill="#FFFFFF" opacity="0.5"/>
  <polygon points="32,45 50,49 50,74" fill="${M.ink}" opacity="0.28"/>
  <polygon points="68,45 50,49 50,74" fill="${M.ink}" opacity="0.12"/>`;
}

/* ---------------------------------------------------------------------------
   TIER 5 — Relentless. The gold crown. Top of the month, and it looks it.
   ------------------------------------------------------------------------- */
function prismatic() {
  const g = nid(); const sh = nid(); const glow = nid();
  const sparks = ring(12, 46).map(([x, y], i) => `<polygon points="${star(x, y, i % 2 ? 1.8 : 3.2, 4, 0.22)}" fill="${M.goldHi}" opacity="${i % 2 ? 0.45 : 0.9}"/>`).join('');
  return `
  <defs>
    ${metal(g, M.goldHi, M.gold, M.goldLo)}
    <linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="${glow}" cx="0.5" cy="0.55">
      <stop offset="0.45" stop-color="${M.gold}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${M.gold}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="${sh}c"><circle cx="50" cy="50" r="40"/></clipPath>
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#${glow})" class="bx-pulse"/>
  <g class="bx-spin-slow" style="transform-origin:50px 50px">${sparks}</g>
  <circle cx="50" cy="50" r="40" fill="${M.onyx}" stroke="url(#${g})" stroke-width="2.4"/>
  <g clip-path="url(#${sh}c)"><rect class="bx-sheen" x="-60" y="0" width="42" height="100" fill="url(#${sh})"/></g>
  <path d="M28 63V38l11 9 11-15 11 15 11-9v25z" fill="url(#${g})" stroke="${M.goldLo}" stroke-width="1.2" stroke-linejoin="round"/>
  <rect x="28" y="66" width="44" height="6" rx="1.5" fill="url(#${g})" stroke="${M.goldLo}" stroke-width="1"/>
  <circle cx="39" cy="45" r="2.4" fill="${M.onyx}"/>
  <circle cx="50" cy="40" r="2.4" fill="${M.onyx}"/>
  <circle cx="61" cy="45" r="2.4" fill="${M.onyx}"/>`;
}

/* ---------------------------------------------------------------------------
   SECOND WIND — the guardrail badge. Bronze, upward, unmistakably positive.
   ------------------------------------------------------------------------- */
function comeback() {
  const g = nid(); const glow = nid();
  return `
  <defs>
    ${metal(g, M.bronzeHi, M.bronze, M.bronzeLo)}
    <radialGradient id="${glow}" cx="0.5" cy="0.6">
      <stop offset="0" stop-color="${M.bronzeHi}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${M.bronzeHi}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#${glow})" class="bx-pulse"/>
  <circle cx="50" cy="50" r="41" fill="${M.onyx}" stroke="url(#${g})" stroke-width="3"/>
  <circle cx="50" cy="50" r="34" fill="none" stroke="url(#${g})" stroke-width="1" opacity="0.35"/>
  <path d="M28 66Q38 42 52 48Q64 53 72 33" fill="none" stroke="url(#${g})" stroke-width="6" stroke-linecap="round"/>
  <path d="M61 32l13-2-1 13" fill="none" stroke="url(#${g})" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/* ---------------------------------------------------------------------------
   META 3 — Ember. Bronze medallion, living flame.
   ------------------------------------------------------------------------- */
function ember() {
  const g = nid(); const f = nid(); const glow = nid();
  return `
  <defs>
    ${metal(g, M.bronzeHi, M.bronze, M.bronzeLo)}
    <linearGradient id="${f}" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#8A3B06"/><stop offset="0.45" stop-color="${M.bronze}"/>
      <stop offset="1" stop-color="${M.goldHi}"/>
    </linearGradient>
    <radialGradient id="${glow}" cx="0.5" cy="0.6">
      <stop offset="0" stop-color="#C97A18" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#C97A18" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#${glow})" class="bx-pulse"/>
  <circle cx="50" cy="50" r="42" fill="${M.ink}" stroke="url(#${g})" stroke-width="3"/>
  <g class="bx-flicker">
    <path d="M50 20c14 16 20 26 20 37a20 20 0 01-40 0c0-13 12-17 14-29 8 7 6 14 6-8z" fill="url(#${f})"/>
    <path d="M50 42c7 9 9 13 9 19a9 9 0 01-18 0c0-7 6-9 9-19z" fill="${M.goldHi}" opacity="0.9"/>
  </g>
  <text x="50" y="90" text-anchor="middle" font-size="12" font-weight="700" fill="${M.bronzeHi}" font-family="system-ui,sans-serif" letter-spacing="1">III</text>`;
}

/* ---------------------------------------------------------------------------
   META 6 — Aurora. A gold orbit ring around an onyx core.
   ------------------------------------------------------------------------- */
function aurora() {
  const g = nid(); const glow = nid();
  const stars = ring(18, 47).map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i % 3 ? 0.9 : 1.7}" fill="${M.goldHi}" opacity="${i % 3 ? 0.35 : 0.85}"/>`).join('');
  return `
  <defs>
    ${metal(g, M.goldHi, M.gold, M.goldLo)}
    <radialGradient id="${glow}" cx="0.5" cy="0.5">
      <stop offset="0.35" stop-color="${M.gold}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${M.gold}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#${glow})" class="bx-pulse"/>
  <g class="bx-spin-slow" style="transform-origin:50px 50px">${stars}</g>
  <circle cx="50" cy="50" r="30" fill="${M.ink}" stroke="url(#${g})" stroke-width="2.4"/>
  <circle cx="50" cy="50" r="23" fill="none" stroke="${M.steelLo}" stroke-width="0.8" opacity="0.5"/>
  <polygon points="${star(50, 50, 13, 4, 0.3)}" fill="url(#${g})"/>
  <g class="bx-spin" style="transform-origin:50px 50px">
    <ellipse cx="50" cy="50" rx="46" ry="15" fill="none" stroke="url(#${g})" stroke-width="2.6" transform="rotate(-22 50 50)"/>
    <ellipse cx="50" cy="50" rx="46" ry="15" fill="none" stroke="${M.goldHi}" stroke-width="0.9" opacity="0.6" transform="rotate(-22 50 50)"/>
  </g>
  <text x="50" y="93" text-anchor="middle" font-size="11" font-weight="700" fill="${M.gold}" font-family="system-ui,sans-serif" letter-spacing="1">VI</text>`;
}

/* ---------------------------------------------------------------------------
   META 12 — Eclipse. The rarest thing in the app: a black sun, gold corona.
   ------------------------------------------------------------------------- */
function eclipse() {
  const g = nid(); const cor = nid(); const glow = nid();
  const flares = ring(40, 43).map(([x, y], i) => {
    const long = i % 4 === 0;
    return `<polygon points="${star(x, y, long ? 6.5 : 2.4, 4, 0.16)}" fill="${long ? M.goldHi : M.gold}" opacity="${long ? 0.95 : 0.45}"/>`;
  }).join('');
  return `
  <defs>
    <radialGradient id="${cor}" cx="0.5" cy="0.5">
      <stop offset="0.5" stop-color="${M.gold}" stop-opacity="0"/>
      <stop offset="0.585" stop-color="${M.goldHi}" stop-opacity="1"/>
      <stop offset="0.68" stop-color="${M.gold}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${M.bronzeLo}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${glow}" cx="0.5" cy="0.5">
      <stop offset="0.3" stop-color="${M.gold}" stop-opacity="0.4"/>
      <stop offset="1" stop-color="${M.gold}" stop-opacity="0"/>
    </radialGradient>
    ${metal(g, M.goldHi, M.gold, M.goldLo)}
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#${glow})" class="bx-pulse"/>
  <g class="bx-spin" style="transform-origin:50px 50px">${flares}</g>
  <circle cx="50" cy="50" r="46" fill="url(#${cor})"/>
  <circle cx="50" cy="50" r="27" fill="${M.ink}"/>
  <circle cx="50" cy="50" r="27" fill="none" stroke="url(#${g})" stroke-width="2.2"/>
  <circle cx="50" cy="50" r="23" fill="none" stroke="${M.goldHi}" stroke-width="0.7" opacity="0.4"/>
  <text x="50" y="56" text-anchor="middle" font-size="16" font-weight="700" fill="url(#${g})" font-family="system-ui,sans-serif" letter-spacing="0.5">XII</text>`;
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
