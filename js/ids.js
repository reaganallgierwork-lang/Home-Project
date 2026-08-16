/* ============================================================================
   IDS — one shared id generator.
   ----------------------------------------------------------------------------
   This lives on its own so that store.js and workouts.js can both use it
   without importing each other. Two modules that import each other work today
   but break the moment one of them calls the other's function at load time,
   which is a nasty failure to debug. A leaf module like this can't create that
   problem.
   ========================================================================== */

let seq = 0;

/** Short, unique, and stable once stored. Time-based plus a counter, so ids
    minted in the same millisecond can't collide. */
export function newId() {
  seq += 1;
  return `h${Date.now().toString(36)}${seq.toString(36)}`;
}
