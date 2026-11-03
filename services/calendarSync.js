/**
 * Keeps the live Moot Calendar equal to services/competitions.js.
 *
 * Runs when the server starts, so a deploy that edits the list updates every
 * user's calendar with no separate step (the hand-run seeder needed Admin
 * credentials no one had to hand, so the live calendar could fall behind).
 *
 *   - Writes only competitions whose stored copy differs from the list.
 *   - Replaces the whole document, so a date removed from the list is
 *     removed from the calendar too (a merge would leave it behind).
 *   - Never deletes a competition that is in Firestore but not in the list;
 *     it logs it instead, because that may be an entry added by hand.
 *   - Refuses to write anything if any entry is invalid.
 */
const { COMPETITIONS, problems } = require('./competitions');

/** Stable JSON: key order does not count as a difference. */
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

async function syncCompetitions(db, { list = COMPETITIONS, log = console } = {}) {
  const bad = list.map(c => ({ id: c.id, p: problems(c).filter(x => !x.startsWith('NOTE:')) })).filter(x => x.p.length);
  if (bad.length) {
    log.error('[CALENDAR] Not syncing: invalid entries ' + bad.map(b => `${b.id || '(no id)'} (${b.p.join('; ')})`).join(', '));
    return { written: 0, unchanged: 0, invalid: bad.length };
  }
  const col = db.collection('artifacts').doc('moot.coach').collection('competitions');
  const snap = await col.get();
  const stored = new Map(snap.docs.map(d => [d.id, d.data()]));
  const batch = db.batch();
  let written = 0, unchanged = 0;
  for (const c of list) {
    const { id, ...rest } = c;
    if (stored.has(id) && canon(stored.get(id)) === canon(rest)) { unchanged++; continue; }
    batch.set(col.doc(id), rest);
    written++;
  }
  if (written) await batch.commit();
  const extra = [...stored.keys()].filter(id => !list.some(c => c.id === id));
  log.log(`[CALENDAR] Synced: ${written} written, ${unchanged} unchanged${extra.length ? `; in Firestore but not in the list (left alone): ${extra.join(', ')}` : ''}.`);
  return { written, unchanged, extra };
}

module.exports = { syncCompetitions, canon };
