/**
 * services/calendarSync.js against a fake Firestore.
 *   node tools/evals/calendar-sync.test.js
 */
const assert = require('assert');
const { syncCompetitions } = require('../../services/calendarSync');
const { COMPETITIONS } = require('../../services/competitions');

function fakeDb(initial = {}) {
  const docs = new Map(Object.entries(initial));
  let commits = 0;
  const col = {
    get: async () => ({ docs: [...docs].map(([id, d]) => ({ id, data: () => JSON.parse(JSON.stringify(d)) })) }),
    doc: (id) => ({ id }),
  };
  const db = {
    collection: () => ({ doc: () => ({ collection: () => col }) }),
    batch: () => { const ops = []; return { set: (ref, d) => ops.push([ref.id, d]), commit: async () => { commits++; ops.forEach(([id, d]) => docs.set(id, JSON.parse(JSON.stringify(d)))); } }; },
  };
  return { db, docs, commits: () => commits };
}
const quiet = { log() {}, error() {} };

(async () => {
  // Empty Firestore: everything written.
  const f = fakeDb();
  let r = await syncCompetitions(f.db, { log: quiet });
  assert.strictEqual(r.written, COMPETITIONS.length);
  assert.strictEqual(f.docs.size, COMPETITIONS.length);
  assert.ok(!('id' in f.docs.get(COMPETITIONS[0].id)), 'id is the document key, not a field');

  // Second start: nothing to do, no write at all.
  const before = f.commits();
  r = await syncCompetitions(f.db, { log: quiet });
  assert.deepStrictEqual([r.written, r.unchanged], [0, COMPETITIONS.length]);
  assert.strictEqual(f.commits(), before);

  // A date removed from the list disappears from Firestore (replace, not merge).
  const edited = JSON.parse(JSON.stringify(COMPETITIONS));
  edited[0].milestones = edited[0].milestones.slice(1);
  edited[0].tent = true;
  r = await syncCompetitions(f.db, { list: edited, log: quiet });
  assert.strictEqual(r.written, 1);
  assert.strictEqual(f.docs.get(edited[0].id).milestones.length, COMPETITIONS[0].milestones.length - 1);

  // Hand-added entry is left alone and reported.
  f.docs.set('by-hand', { name: 'X', cat: 'intra', milestones: [{ type: 'memo', d: '2027-01-01' }] });
  r = await syncCompetitions(f.db, { list: edited, log: quiet });
  assert.deepStrictEqual(r.extra, ['by-hand']);
  assert.ok(f.docs.has('by-hand'));

  // An invalid entry stops the whole sync.
  const broken = [...edited, { id: 'bad', name: 'Bad', cat: 'national', milestones: [{ type: 'memo', d: '2027-13-99x' }] }];
  r = await syncCompetitions(f.db, { list: broken, log: quiet });
  assert.strictEqual(r.written, 0); assert.strictEqual(r.invalid, 1);

  console.log('PASS calendar sync: writes changes only, replaces, keeps hand entries, refuses invalid lists');
})().catch(e => { console.error('FAIL calendar sync:', e); process.exit(1); });
