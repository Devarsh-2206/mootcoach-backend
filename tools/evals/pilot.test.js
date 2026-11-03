/**
 * The closed-pilot rules (services/pilot.js), offline.
 *   node tools/evals/pilot.test.js
 */
const assert = require('assert');
const { createPilot, memoryStore } = require('../../services/pilot');

let clock = Date.UTC(2026, 10, 3);
const now = () => clock;
const HOUR = 3600e3;
const cfg = (over = {}) => ({ mode: 'on', cap: 3, autoDomains: ['nalsar.ac.in'], admins: ['boss@mootcoach.in'], releaseHours: 72, ...over });
const nalsar = (n) => ({ uid: 'n' + n, email: `s${n}@nalsar.ac.in`, emailVerified: true, name: 'S' + n });
const outsider = (n) => ({ uid: 'o' + n, email: `x${n}@gmail.com`, emailVerified: true });

(async () => {
  // off: everyone in, nothing stored
  {
    const store = memoryStore();
    const p = createPilot(store, { config: cfg({ mode: 'off' }), now });
    assert.strictEqual((await p.join(outsider(1))).status, 'active');
    assert.strictEqual((await store.listMembers()).length, 0, 'off mode stores nothing');
  }

  const store = memoryStore();
  let config = cfg();
  const pilot = createPilot(store, { now, get config() { return config; } });

  // NALSAR verified → active; outsider → waitlist (approval)
  assert.strictEqual((await pilot.join(nalsar(1))).status, 'active');
  const o1 = await pilot.join(outsider(1));
  assert.deepStrictEqual([o1.status, o1.reason], ['waitlist', 'approval']);
  assert.strictEqual(await pilot.allowed(outsider(1)), false);

  // unverified NALSAR address (email/password sign-up) is not trusted
  const fake = { uid: 'f1', email: 'fake@nalsar.ac.in', emailVerified: false };
  const fj = await pilot.join(fake);
  assert.strictEqual(fj.status, 'waitlist');
  assert.strictEqual(fj.reason, 'verify', 'unverified NALSAR waits for verification, not approval');
  {
    // ...and gets in on its own once the address is verified (room permitting)
    const p2 = createPilot(memoryStore(), { config: cfg(), now });
    assert.strictEqual((await p2.join(fake)).reason, 'verify');
    const fv = await p2.join({ ...fake, emailVerified: true });
    assert.deepStrictEqual([fv.status, fv.reason], ['active', 'auto'], 'verified NALSAR address gets the place');
    assert.strictEqual((await p2.join({ uid: 'g1', email: 'x@gmail.com', emailVerified: false })).reason, 'approval');
  }

  // admin always in, never stored
  assert.strictEqual((await pilot.join({ uid: 'a', email: 'Boss@MootCoach.in', emailVerified: true })).status, 'admin');
  assert.ok(!(await store.listMembers()).some(m => m.uid === 'a'));

  // Signing in takes no place: anyone at NALSAR may look around.
  for (const n of [2, 3, 4, 5]) assert.strictEqual((await pilot.join(nalsar(n))).status, 'active');
  let ov = await pilot.overview();
  assert.deepStrictEqual([ov.counts.active, ov.counts.browsing], [0, 5], 'sign-ins fill no places');
  assert.strictEqual((await pilot.join(nalsar(2))).placeTaken, false);

  // The first upload claims a place: n1, n2, n3 fill the 3; n4 finds it full.
  for (const n of [1, 2, 3]) assert.deepStrictEqual(await pilot.claimPlace(nalsar(n)), { ok: true, claimed: true });
  assert.deepStrictEqual(await pilot.claimPlace(nalsar(1)), { ok: true }, 'claiming twice takes one place');
  assert.strictEqual((await pilot.join(nalsar(1))).placeTaken, true);
  const n4 = await pilot.claimPlace(nalsar(4));
  assert.ok(!n4.ok && n4.full);
  assert.deepStrictEqual((s => [s.status, s.reason])(await pilot.join(nalsar(4))), ['waitlist', 'full']);
  ov = await pilot.overview();
  assert.deepStrictEqual([ov.counts.active, ov.counts.browsing, ov.counts.waitlist], [3, 1, 3]); // waitlist: o1, f1 (verify), n4

  // approve while full → refused
  assert.strictEqual((await pilot.setStatus('o1', 'approve')).ok, false);

  // n1 uses its place; n2, n3 claimed but never used → released after 72h.
  // n5 (only looking) holds no place, so it is never "released".
  await pilot.markUsed(nalsar(1));
  clock += 73 * HOUR;
  assert.strictEqual(await pilot.releaseIdle(), 2);
  assert.strictEqual(await pilot.allowed(nalsar(1)), true, 'a used place is kept');
  ov = await pilot.overview();
  assert.deepStrictEqual([ov.counts.active, ov.counts.released, ov.counts.used], [1, 2, 1]);
  assert.strictEqual((await pilot.join(nalsar(5))).status, 'active');

  // n4 (found it full) may look around again, and its next upload gets a place.
  assert.strictEqual((await pilot.join(nalsar(4))).status, 'active');
  assert.ok((await pilot.claimPlace(nalsar(4))).ok);
  // admin approves the outsider into the last place
  assert.strictEqual((await pilot.setStatus('o1', 'approve')).ok, true);
  assert.strictEqual(await pilot.allowed(outsider(1)), true);
  assert.strictEqual((await pilot.overview()).counts.active, 3);
  // n5 tries to upload now: full, so waitlisted.
  assert.ok((await pilot.claimPlace(nalsar(5))).full);

  // "Move to waitlist" (an MBA student, say): out, place freed, no way back on their own.
  await pilot.setStatus('n4', 'release');
  assert.strictEqual(await pilot.allowed(nalsar(4)), false);
  assert.strictEqual((await pilot.join(nalsar(4))).status, 'released', 'removed by admin stays out');
  assert.strictEqual((await pilot.overview()).counts.active, 2);
  // ...and removing someone only looking around works too.
  await pilot.join(nalsar(6));
  await pilot.setStatus('n6', 'release');
  assert.strictEqual((await pilot.join(nalsar(6))).status, 'released');
  assert.strictEqual((await pilot.overview()).counts.active, 2, 'removing a browser frees nothing');

  // Members from before claim-on-upload keep their place.
  {
    const s3 = memoryStore();
    const q = createPilot(s3, { now, config: cfg() });
    await s3.transact(async tx => { tx.putMember({ uid: 'old', email: 'old@nalsar.ac.in', status: 'active', reason: 'auto', joinedAt: clock }); tx.putState({ active: 1 }); });
    assert.strictEqual((await q.join({ uid: 'old', email: 'old@nalsar.ac.in', emailVerified: true })).placeTaken, true);
    assert.deepStrictEqual(await q.claimPlace({ uid: 'old', email: 'old@nalsar.ac.in', emailVerified: true }), { ok: true });
  }

  // concurrent first uploads never exceed the cap
  {
    const s2 = memoryStore();
    const q = createPilot(s2, { now, config: cfg({ cap: 5 }) });
    await Promise.all(Array.from({ length: 20 }, (_, i) => q.join(nalsar(100 + i))));
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => q.claimPlace(nalsar(100 + i))));
    assert.strictEqual(res.filter(r => r.ok).length, 5);
    assert.strictEqual((await q.overview()).counts.active, 5);
  }

  // closed: everyone but admins is out, new sign-ups go on the launch list
  config = cfg({ mode: 'closed' });
  assert.strictEqual((await pilot.join(nalsar(1))).status, 'closed');
  assert.strictEqual(await pilot.allowed(nalsar(1)), false);
  const late = await pilot.join(outsider(9));
  assert.strictEqual(late.status, 'closed');
  assert.strictEqual((await store.listMembers()).find(m => m.uid === 'o9').reason, 'closed');
  assert.strictEqual((await pilot.join({ uid: 'a', email: 'boss@mootcoach.in', emailVerified: true })).status, 'admin');
  // an unverified sign-up using the admin's address is not an admin
  assert.notStrictEqual((await pilot.join({ uid: 'imp', email: 'boss@mootcoach.in', emailVerified: false })).status, 'admin');

  console.log('ALL PASS');
})().catch(e => { console.error(e); process.exit(1); });

// ── Day 2: per-tester limits ──
(async () => {
  const s = memoryStore();
  const q = createPilot(s, { now, config: { ...cfg({ cap: 5 }), limits: { uploads: 2, voiceRounds: 1, extras: 3 }, voiceMinutes: 15 } });
  const t = nalsar(500);
  let st = await q.join(t);
  assert.strictEqual(q.remaining(st, 'uploads'), 2);
  // No place yet (only signed in): no voice round.
  assert.strictEqual((await q.consume(t, 'voiceRounds')).ok, false, 'looking around gives no voice round');
  await q.claimPlace(t);   // the first upload
  await q.count(t, 'uploads'); await q.count(t, 'uploads');
  st = await q.join(t);
  assert.strictEqual(q.remaining(st, 'uploads'), 0, 'two uploads used');
  assert.deepStrictEqual(st.usage, { uploads: 2 });
  // consume: first voice round ok, second refused
  assert.strictEqual((await q.consume(t, 'voiceRounds')).ok, true);
  const second = await q.consume(t, 'voiceRounds');
  assert.deepStrictEqual([second.ok, second.used, second.limit], [false, 1, 1]);
  // waitlisted users can't consume; admins are unlimited
  assert.strictEqual((await q.consume(outsider(77), 'voiceRounds')).ok, false);
  const boss = { uid: 'b', email: 'boss@mootcoach.in', emailVerified: true };
  for (let i = 0; i < 5; i++) assert.strictEqual((await q.consume(boss, 'voiceRounds')).ok, true);
  await q.count(boss, 'uploads');
  assert.ok(!(await s.listMembers()).some(m => m.uid === 'b'), 'admins are not stored or counted');
  // overview carries usage for the admin panel
  const ov = await q.overview();
  assert.deepStrictEqual(ov.members.find(m => m.uid === 'n500').usage, { uploads: 2, voiceRounds: 1 });
  console.log('LIMITS PASS');
})().catch(e => { console.error(e); process.exit(1); });

// ── Day 3: feedback ──
(async () => {
  const s = memoryStore();
  const q = createPilot(s, { now, config: { ...cfg({ cap: 5 }), limits: { uploads: 2 }, voiceMinutes: 15 } });
  const t = nalsar(900);
  await q.join(t);
  assert.strictEqual((await q.recordFeedback(t, 'quick', { rating: 4, source: 'voice' }, { trigger: 'round' })).ok, true);
  assert.strictEqual((await q.recordFeedback(t, 'full', { overall: 9, realMoot: 'yes', recommend: 8 })).ok, false, 'out of range rejected');
  assert.strictEqual((await q.recordFeedback(t, 'full', { overall: 5, realMoot: 'maybe', recommend: 10, problems: 'none', hacked: 'x' })).ok, true);
  const st = await q.join(t);
  assert.ok(st.feedback.quick && st.feedback.full, 'flags stored on the member');
  const all = await q.listFeedback();
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all[0].kind, 'full');
  assert.ok(!('hacked' in all[0].answers));
  console.log('FEEDBACK PASS');
})().catch(e => { console.error(e); process.exit(1); });
