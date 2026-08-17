/* ============================================================================
   ICONS — the app's line-art set, replacing every emoji.
   ----------------------------------------------------------------------------
   All 24×24, drawn with a single stroke weight and `currentColor`, so an icon
   takes the colour of whatever it sits in and never fights the palette the way
   a full-colour emoji does.

   Usage:  icon('flame')            -> 20px
           icon('flame', 28)        -> 28px
           icon('flame', 20, 'gold')-> adds a class

   ADDING ONE: add an entry to PATHS. Anything in `solid` is filled instead of
   stroked. Keys are stable identifiers — they get saved into habit data, so
   rename a key only if you also migrate the saved value.
   ========================================================================== */

const PATHS = {
  /* ---- navigation & chrome ---- */
  check: 'M4 12.5l5.2 5.2L20 6.8',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronUp: 'M5 15l7-7 7 7',
  chevronDown: 'M5 9l7 7 7-7',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  gear: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H10a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V10a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  pencil: 'M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20.5 20.5L16 16',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  upload: 'M12 21V9M7 13l5-5 5 5M4 4h16',
  calendar: 'M3 8h18M7 3v3M17 3v3M4 6h16v15H4z',
  book: 'M4 4h6a3 3 0 013 3v13a2.5 2.5 0 00-2.5-2H4zM20 4h-6a3 3 0 00-3 3v13a2.5 2.5 0 012.5-2H20z',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 5l3.5 15-3 .7L15 6z',
  camera: 'M3 8h4l1.5-2h7L17 8h4v11H3z M12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  image: 'M4 5h16v14H4z M8 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M5 17l4.5-5 3.5 4 2.5-3L20 17',
  expand: 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5',

  /* ---- the tab bar ---- */
  logMark: 'M4 12.5l5.2 5.2L20 6.8M4 19h16',
  dumbbell: 'M2.5 9.5v5M6 7v10M18 7v10M21.5 9.5v5M6 12h12',
  flame: 'M12 22a6 6 0 006-6c0-4-4-6-4-11 0 0-3 2-3 5 0 1.5-1 2-1.6 1.2C7 9 6 11 6 16a6 6 0 006 6z',
  steps: 'M3 20h4v-4h4v-4h4V8h4V4M3 20v-4',
  shield: 'M12 3l7.5 3v6.2c0 4.3-3.1 7.5-7.5 9.3-4.4-1.8-7.5-5-7.5-9.3V6z',
  chartLine: 'M3 3v18h18M6.5 14.5l3.5-4 3.5 2.5 4.5-6',
  analyze: 'M11 18.5a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM21 21l-4.6-4.6M8.5 11.5v3M11 8.5v6M13.5 12v2.5',
  bodyweight: 'M4 6h16a1 1 0 011 1v10a3 3 0 01-3 3H6a3 3 0 01-3-3V7a1 1 0 011-1z M12 9.3a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2z M9 16.5h6',

  /* ---- habits ---- */
  noAlcohol: 'M7 4h10l-1 5.5a4.2 4.2 0 01-8 0zM12 14v5.5M8.5 20h7M3.5 3.5l17 17',
  spine: 'M12 3v18M9 6h6M9 10h6M9 14h6M9 18h6',
  moon: 'M21 13.2A9 9 0 1110.8 3a7 7 0 0010.2 10.2z',
  droplet: 'M12 3s6 6.4 6 10.5a6 6 0 01-12 0C6 9.4 12 3 12 3z',
  utensils: 'M6 3v8a2 2 0 004 0V3M8 11v10M17 3c-1.7 1-2.5 3-2.5 5.5S15.5 13 17 13.5V21',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM12 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  star: 'M12 3l2.9 5.9 6.6 1-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9l6.6-1z',
  heart: 'M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0112 8a4.4 4.4 0 017.5 2.4c0 5-7.5 9.6-7.5 9.6z',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  run: 'M13.5 5.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM8 21l3-5.5-2.5-2.5.8-4.5L6 10.5 4 14M11 15.5l3.5 1.5 1.5 4M12.3 8.5l3.2 2.5 3.5-.5',
  mountain: 'M3 19h18L14 6l-3.5 6-2-2.5z',
  brain: 'M9 4a3 3 0 00-3 3 3 3 0 00-1.5 5.6A3 3 0 006 18a3 3 0 003 2.5V4zM15 4a3 3 0 013 3 3 3 0 011.5 5.6A3 3 0 0118 18a3 3 0 01-3 2.5V4z',
  phoneOff: 'M8 3h8v18H8zM4 4l16 16',
  cameraOff: 'M3 8h4l1.5-2h7L17 8h4v11H3zM4 4l16 16',
  leaf: 'M5 19C5 10 11 5 20 5c0 9-5 14-13 14zM5 19c3-4 6-6 9-7',
  coffee: 'M4 8h13v5a5 5 0 01-10 0zM17 9h2a2.5 2.5 0 010 5h-2M4 21h14',
  pill: 'M8.5 3.5a5 5 0 017 7l-5 5a5 5 0 01-7-7zM7 7l7 7',
  note: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5',
  wallet: 'M3 7h15a2 2 0 012 2v8a2 2 0 01-2 2H3zM3 7V5h13M17 13h.01',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M16 5.2a3.5 3.5 0 010 6.6M18 20c0-2.5-.8-4-2-4.6',
  award: 'M12 14a5.5 5.5 0 100-11 5.5 5.5 0 000 11zM8.5 13L7 21l5-2.5L17 21l-1.5-8',
  zap: 'M13 2L5 13h6l-1 9 8-11h-6z',
  compass: 'M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5z',
  anchor: 'M12 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM12 8v13M5 13H3a9 9 0 0018 0h-2M8 12h8',
  feather: 'M20 4c-6 0-11 3-11 9v4l-4 4M20 4c0 6-3 11-9 11H7M11 12h6',

  /* ---- workout block types ---- */
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  link: 'M10 13a4 4 0 006 .5l2.5-2.5a4 4 0 00-5.7-5.7L11.5 7M14 11a4 4 0 00-6-.5L5.5 13a4 4 0 005.7 5.7L12.5 17',
  timer: 'M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l2.5 2M9 2h6',
  flag: 'M5 21V4M5 4h11l-2 3.5L16 11H5',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.5 2',
  trophy: 'M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 14v4M8.5 21h7',
  ruler: 'M3 15L15 3l6 6L9 21zM7 11l2 2M11 7l2 2M10.5 14.5l2 2',
  box: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v10',
};

/* These read better filled than stroked. */
const SOLID = new Set(['flame', 'star', 'zap', 'droplet', 'mountain', 'moon']);

/** The subset offered in the habit icon picker, in a sensible order. */
export const PICKER_ICONS = [
  'noAlcohol', 'dumbbell', 'spine', 'moon', 'book', 'utensils', 'droplet',
  'target', 'star', 'flame', 'heart', 'sun', 'run', 'mountain', 'brain',
  'phoneOff', 'cameraOff', 'leaf', 'coffee', 'pill', 'note', 'wallet',
  'users', 'award', 'zap', 'compass', 'anchor', 'feather', 'clock', 'trophy',
  'check', 'calendar', 'box', 'ruler',
];

/* Old saves used emoji. This maps the ones the app shipped with — plus common
   near-misses — onto the new set, so nobody's habits turn into blank squares.
   Anything not listed here keeps rendering as its original character. */
export const EMOJI_TO_ICON = {
  '🚫': 'noAlcohol', '🍺': 'noAlcohol', '🍷': 'noAlcohol', '🥂': 'noAlcohol',
  '🏋️': 'dumbbell', '🏋': 'dumbbell', '💪': 'dumbbell', '🤸': 'run', '🏃': 'run',
  '🧘': 'spine', '🦴': 'spine', '🧎': 'spine',
  '😴': 'moon', '🛌': 'moon', '💤': 'moon', '🌙': 'moon',
  '📖': 'book', '📕': 'book', '📗': 'book', '📘': 'book', '✝️': 'book',
  '🥩': 'utensils', '🍗': 'utensils', '🍖': 'utensils', '🍽️': 'utensils', '🥚': 'utensils',
  '💧': 'droplet', '🚰': 'droplet', '🥤': 'droplet',
  '⭐': 'star', '🌟': 'star', '✨': 'star',
  '🔥': 'flame', '🎯': 'target', '❤️': 'heart', '☀️': 'sun', '🧠': 'brain',
  '📱': 'phoneOff', '📷': 'cameraOff', '📸': 'cameraOff',
  '🌿': 'leaf', '☕': 'coffee', '💊': 'pill', '📝': 'note', '💰': 'wallet',
  '👥': 'users', '🏅': 'award', '🏆': 'trophy', '⚡': 'zap', '🧭': 'compass',
  '⚓': 'anchor', '🪶': 'feather', '⏰': 'clock', '📅': 'calendar', '📦': 'box',
  '📏': 'ruler', '⛰️': 'mountain', '🏔️': 'mountain', '📈': 'chartLine',
};

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(PATHS, name);
}

/**
 * Render an icon as an SVG string.
 * Falls back to rendering the value as plain text, so a habit still carrying
 * an unrecognised emoji shows that emoji rather than nothing at all.
 */
export function icon(name, size = 20, cls = '') {
  if (!hasIcon(name)) {
    const safe = String(name ?? '').replace(/[&<>"']/g, '');
    return `<span class="ic-fallback ${cls}" style="font-size:${size * 0.9}px">${safe}</span>`;
  }
  const solid = SOLID.has(name);
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24"
    fill="${solid ? 'currentColor' : 'none'}" stroke="currentColor"
    stroke-width="${solid ? 0 : 1.8}" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false"><path d="${PATHS[name]}"/></svg>`;
}

/** Best icon key for a saved value, or null when it isn't one we know. */
export function resolveIcon(value) {
  if (!value) return null;
  if (hasIcon(value)) return value;
  return EMOJI_TO_ICON[value] || null;
}
