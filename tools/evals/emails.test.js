/**
 * services/emails.js: which pilot email goes when, sent once, unsubscribe.
 *   node tools/evals/emails.test.js
 * Fake clock, memory store, fake mailer: no network.
 */
const assert = require('assert');
const { createEmails, due, render, memoryEmailStore } = require('../../services/emails');
const H = 3600e3, D = 24 * H;

(async () => {
  const T0 = Date.UTC(2026, 10, 10, 6);
  const cfg = { now: T0, startedAt: T0 - D, releaseHours: 72 };

  // ---- due(): the schedule ----
  const tester = { uid: 'a', email: 'a@nalsar.ac.in', name: 'Asha Rao', status: 'active', reason: 'auto', joinedAt: T0, firstUseAt: null };
  assert.strictEqual(due(tester, {}, cfg), 'welcome');
  assert.strictEqual(due({ ...tester, joinedAt: T0 - 2 * D }, {}, cfg), null, 'joined before emails started');
  assert.strictEqual(due({ ...tester, status: 'waitlist', reason: 'approval' }, {}, cfg), 'waitlisted');
  assert.strictEqual(due({ ...tester, reason: 'approved' }, {}, cfg), 'approved');
  assert.strictEqual(due(tester, { sent: { waitlisted: T0 - D } }, cfg), 'approved', 'a place opened after waiting');
  const welcomed = { sent: { welcome: T0 }, lastSentAt: T0 };
  assert.strictEqual(due(tester, welcomed, { ...cfg, now: T0 + 23 * H }), null);
  assert.strictEqual(due(tester, welcomed, { ...cfg, now: T0 + 25 * H }), 'reminder');
  assert.strictEqual(due(tester, welcomed, { ...cfg, now: T0 + 71 * H }), null, 'too close to release');
  assert.strictEqual(due(tester, { ...welcomed, unsubscribed: T0 }, { ...cfg, now: T0 + 25 * H }), null);
  const used = { ...tester, firstUseAt: T0 + 2 * H, usage: { uploads: 1 } };
  assert.strictEqual(due(used, welcomed, { ...cfg, now: T0 + 30 * H }), null);
  assert.strictEqual(due(used, welcomed, { ...cfg, now: T0 + 51 * H }), 'voice');
  assert.strictEqual(due({ ...used, usage: { voiceRounds: 1 } }, welcomed, { ...cfg, now: T0 + 51 * H }), null);
  const afterVoice = { sent: { welcome: T0, voice: T0 + 51 * H }, lastSentAt: T0 + 51 * H };
  assert.strictEqual(due(used, afterVoice, { ...cfg, now: T0 + 99 * H }), 'feedback');
  assert.strictEqual(due(used, { ...afterVoice, lastSentAt: T0 + 90 * H }, { ...cfg, now: T0 + 99 * H }), null, 'one a day');
  assert.strictEqual(due({ ...used, feedback: { full: T0 } }, afterVoice, { ...cfg, now: T0 + 99 * H }), null);
  assert.strictEqual(due(used, { ...afterVoice, failed: { feedback: 3 } }, { ...cfg, now: T0 + 99 * H }), null, 'gives up after 3 failures');
  assert.strictEqual(due({ ...tester, status: 'released' }, {}, cfg), null);

  // ---- render(): content checks ----
  const w = render('welcome', tester, { releaseHours: 72, limits: { uploads: 2, memorials: 2, voiceRounds: 3 } }, 'https://x/unsub');
  assert.ok(/Dear Asha Rao,/.test(w.text) && /2 proposition uploads, 2 memorial drafts and 3 voice rounds/.test(w.text), w.text);
  assert.ok(!/Stop reminder/.test(w.html), 'status emails have no unsubscribe');
  const f = render('feedback', { ...tester, name: '<b>x</b>' }, { releaseHours: 72 }, 'https://x/unsub');
  assert.ok(/Stop reminder emails/.test(f.html) && /\?feedback=1/.test(f.html));
  assert.ok(!/<b>x<\/b>/.test(f.html), 'names are escaped');

  // ---- the engine: send once, claims, failures, unsubscribe ----
  let clock = T0, members = [tester], outbox = [], fail = false, configured = false;
  const mailer = { configured: () => configured, send: async (m) => { if (!configured) return { sent: false }; if (fail) throw new Error('Resend 500'); outbox.push(m); return { sent: true }; } };
  const store = memoryEmailStore();
  const e = createEmails({ store, mailer, members: async () => members, pilotConfig: () => ({ mode: 'on', releaseHours: 72, limits: { uploads: 2 } }), now: () => clock });

  assert.deepStrictEqual(await e.tick(), [], 'not configured: nothing sent, nothing started');
  configured = true; clock = T0 + 60e3;
  members = [{ ...tester, joinedAt: T0 + 30e3 }];
  let out = await e.tick();
  assert.deepStrictEqual(out.map(o => o.key), ['welcome']);
  assert.strictEqual(outbox[0].to, 'a@nalsar.ac.in');
  assert.deepStrictEqual(await e.tick(), [], 'sent once');
  await Promise.all([e.tick('a'), e.tick('a'), e.tick()]);
  assert.strictEqual(outbox.length, 1, 'parallel ticks do not double-send');

  clock = T0 + 26 * H; fail = true;
  assert.deepStrictEqual(await e.tick(), []);
  assert.strictEqual((await store.getLog('a')).failed.reminder, 1);
  fail = false;
  out = await e.tick();
  assert.deepStrictEqual(out.map(o => o.key), ['reminder']);
  assert.ok(outbox[1].headers && /unsubscribe/.test(outbox[1].headers['List-Unsubscribe']));

  // Unsubscribe link token
  const url = /<(.*)>/.exec(outbox[1].headers['List-Unsubscribe'])[1];
  const q = new URL(url).searchParams;
  assert.ok(await e.checkToken(q.get('u'), q.get('t')));
  assert.ok(!(await e.checkToken('b', q.get('t'))));
  assert.ok(!(await e.checkToken('a', 'x'.repeat(32))));
  await e.unsubscribe('a');
  members = [{ ...members[0], firstUseAt: T0 + 30 * H }];
  clock = T0 + 30 * H + 50 * H;
  assert.deepStrictEqual(await e.tick(), [], 'unsubscribed: no follow-ups');

  // Pilot off: nothing
  const e2 = createEmails({ store: memoryEmailStore(), mailer, members: async () => [tester], pilotConfig: () => ({ mode: 'off' }), now: () => T0 });
  assert.deepStrictEqual(await e2.tick(), []);

  const st = await e.status();
  assert.strictEqual(st.totals.welcome, 1); assert.strictEqual(st.totals.reminder, 1); assert.strictEqual(st.unsubscribed, 1);
  // Signed in without a place yet: welcome and reminder say the first upload claims it.
  const browsing = { ...tester, placeTaken: false };
  const wb = render('welcome', browsing, { releaseHours: 72, cap: 50, limits: { uploads: 2 } }, null);
  assert.ok(/first students who upload/.test(wb.text) && !/held until/.test(wb.text), wb.text);
  assert.strictEqual(due(browsing, { sent: { welcome: T0 }, lastSentAt: T0 }, { ...cfg, now: T0 + 25 * H }), 'reminder');
  assert.strictEqual(due(browsing, { sent: { welcome: T0 }, lastSentAt: T0 }, { ...cfg, now: T0 + 100 * H }), 'reminder', 'no release deadline for a browser');
  assert.ok(!/held until/.test(render('reminder', browsing, { releaseHours: 72 }, 'u').subject));
  console.log('PASS emails: schedule, content, once-only, failures, unsubscribe');
})().catch(err => { console.error('FAIL emails:', err); process.exit(1); });
