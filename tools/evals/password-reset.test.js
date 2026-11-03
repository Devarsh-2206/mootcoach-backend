/**
 * services/passwordReset.js with a fake Firebase Admin and mailer.
 *   node tools/evals/password-reset.test.js
 */
const assert = require('assert');
const Module = require('module');
const outbox = [];
let configured = true;
const users = {
  'pw@x.in': { email: 'pw@x.in', displayName: 'Asha Rao', providerData: [{ providerId: 'password' }] },
  'g@x.in': { email: 'g@x.in', displayName: 'Ravi', providerData: [{ providerId: 'google.com' }] },
};
const fakeAdmin = { apps: [1], auth: () => ({
  getUserByEmail: async (e) => { if (!users[e]) { const er = new Error('no user'); er.code = 'auth/user-not-found'; throw er; } return users[e]; },
  generatePasswordResetLink: async (e) => `https://mootcoach-acbae.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=CODE-${e}&apiKey=k&lang=en`,
}) };
const fakeMailer = { configured: () => configured, send: async (m) => { outbox.push(m); return { sent: true }; } };
const orig = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'firebase-admin') return fakeAdmin;
  if (req === './mailer') return fakeMailer;
  return orig.apply(this, arguments);
};
const { sendReset } = require('../../services/passwordReset');

(async () => {
  assert.deepStrictEqual(await sendReset('not an email'), { ok: false, error: 'bad-email' });

  let r = await sendReset('  PW@x.in ');
  assert.ok(r.ok && !r.fallback);
  const m = outbox.pop();
  assert.strictEqual(m.to, 'pw@x.in');
  assert.ok(/Hi Asha,/.test(m.html));
  assert.ok(m.html.includes('https://mootcoach.in/account.html?mode=resetPassword&amp;oobCode=CODE-pw%40x.in'), m.html);
  assert.ok(!/firebaseapp\.com/.test(m.html + m.text), 'no Firebase link in the email');

  // Unknown address: same answer, nothing sent.
  r = await sendReset('nobody@x.in');
  assert.ok(r.ok); assert.strictEqual(outbox.length, 0);

  // Google-only account: told to use Google.
  r = await sendReset('g@x.in');
  assert.ok(r.ok); assert.ok(/signs in with Google/.test(outbox.pop().html));

  // Per-address limit: 3 an hour (one already used above), quietly.
  await sendReset('pw@x.in'); await sendReset('pw@x.in');
  outbox.length = 0;
  r = await sendReset('pw@x.in');
  assert.ok(r.ok); assert.strictEqual(outbox.length, 0, 'fourth within the hour not sent');

  // Not configured: browser falls back to Firebase's email.
  configured = false;
  assert.deepStrictEqual(await sendReset('other@x.in'), { ok: false, fallback: true });
  console.log('PASS password reset: own link, no probing, Google accounts, rate limit, fallback');
})().catch(e => { console.error('FAIL password reset:', e); process.exit(1); });
