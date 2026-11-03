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
  assert.strictEqual((await pilot.join(fake)).status, 'waitlist');

  // admin always in, never stored
  assert.strictEqual((await pilot.join({ uid: 'a', email: 'Boss@MootCoach.in', emailVerified: true })).status, 'admin');
  assert.ok(!(await store.listMembers()).some(m => m.uid === 'a'));

  // fill the cap: n2, n3 → active (3/3); n4 → waitlist full
  await pilot.join(nalsar(2)); await pilot.join(nalsar(3));
  const n4 = await pilot.join(nalsar(4));
  assert.deepStrictEqual([n4.status, n4.reason], ['waitlist', 'full']);

  // repeated joins don't double count
  await pilot.join(nalsar(1)); await pilot.join(nalsar(1));
  assert.strictEqual((await pilot.overview()).counts.active, 3);

  // approve while full → refused
  assert.strictEqual((await pilot.setStatus('o1', 'approve')).ok, false);

  // n1 uses it; n2, n3 never do. After 72h the idle ones are released
  await pilot.markUsed(nalsar(1));
  clock += 73 * HOUR;
  assert.strictEqual(await pilot.releaseIdle(), 2);
  assert.strictEqual(await pilot.allowed(nalsar(1)), true, 'a used place is kept');
  const ov = await pilot.overview();
  assert.deepStrictEqual([ov.counts.active, ov.counts.released, ov.counts.used], [1, 2, 1]);

  // n4 (waitlisted because full) gets in on its own now there is room
  assert.strictEqual((await pilot.join(nalsar(4))).status, 'active');
  // admin approves the outsider into the last place
  assert.strictEqual((await pilot.setStatus('o1', 'approve')).ok, true);
  assert.strictEqual(await pilot.allowed(outsider(1)), true);
  assert.strictEqual((await pilot.overview()).counts.active, 3);
  // full again: a released NALSAR student stays out until there is room
  assert.strictEqual((await pilot.join(nalsar(2))).status, 'released');

  // admin release frees a place; the idle-released n2 then rejoins by itself
  await pilot.setStatus('o1', 'release');
  assert.strictEqual(await pilot.allowed(outsider(1)), false);
  assert.strictEqual((await pilot.join(nalsar(2))).status, 'active');

  // concurrent first sign-ins never exceed the cap
  {
    const s2 = memoryStore();
    const q = createPilot(s2, { now, config: cfg({ cap: 5 }) });
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => q.join(nalsar(100 + i))));
    assert.strictEqual(res.filter(r => r.status === 'active').length, 5);
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
