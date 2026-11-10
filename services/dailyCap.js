/**
 * A per-key daily allowance, counted BEFORE the work starts, so a burst of
 * parallel requests cannot all slip past the check (the pilot's per-bucket
 * counters are written after a request finishes, which is fine for slow,
 * one-at-a-time actions but not for a cheap request that can be fired in
 * parallel). Days are counted in India time. In memory: a restart resets
 * the day's counts, which only ever errs towards the student.
 */
function createDailyCap(max) {
  const counts = new Map();
  let day = '';
  const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const roll = () => { const d = today(); if (d !== day) { day = d; counts.clear(); } };
  return {
    /** Use one; false (and nothing used) when today's allowance is gone. */
    take(key) {
      roll();
      const n = counts.get(key) || 0;
      if (n >= max) return false;
      counts.set(key, n + 1);
      return true;
    },
    /** Give one back (the work did not happen). */
    refund(key) { const n = counts.get(key) || 0; if (n > 0) counts.set(key, n - 1); },
    used(key) { roll(); return counts.get(key) || 0; },
    max,
  };
}
module.exports = { createDailyCap };
