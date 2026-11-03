/**
 * Password-reset emails sent by MootCoach itself, from hello@mootcoach.in,
 * linking to MootCoach's own page (frontend/account.html) instead of
 * Firebase's default email and page.
 *
 * Firebase still makes and checks the one-time code: the Admin SDK's
 * generatePasswordResetLink gives a link carrying it, and only the code is
 * taken from it. account.html then calls Firebase to check and use the code.
 *
 * Safeguards:
 *   - the answer never says whether an account exists (no address probing);
 *   - at most 3 emails per address per hour, and per address only, so
 *     nobody can flood someone else's inbox;
 *   - an account that signs in only with Google gets a short "use the
 *     Google button" email instead of a reset link.
 *
 * Returns { ok, fallback }: fallback=true means this server cannot send
 * (no RESEND_API_KEY), and the browser should use Firebase's own email.
 */
const admin = require('firebase-admin');
const mailer = require('./mailer');

const APP = () => (process.env.APP_URL || 'https://mootcoach.in').replace(/\/$/, '');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const recent = new Map();   // email -> [timestamps]
const WINDOW = 3600e3, MAX_PER_WINDOW = 3;
function allow(email, now = Date.now()) {
  const list = (recent.get(email) || []).filter(t => now - t < WINDOW);
  if (list.length >= MAX_PER_WINDOW) { recent.set(email, list); return false; }
  list.push(now); recent.set(email, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some(t => now - t < WINDOW)) recent.delete(k);
  return true;
}

function page(paragraphs, button) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f4ef">
<div style="max-width:560px;margin:0 auto;padding:28px 24px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1f1d1a;background:#fffdf9">
<p style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#a23b2c"><b>MootCoach</b></p>
${paragraphs.map(p => `<p style="margin:0 0 14px">${p}</p>`).join('\n')}
${button ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#a23b2c;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px">${esc(button.label)}</a></p>` : ''}
<p style="margin:22px 0 0">MootCoach</p>
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e8e4dc;font-family:Arial,sans-serif;font-size:12px;color:#8a857c">You are getting this because someone asked to reset the password for this address on ${esc(APP().replace(/^https?:\/\//, ''))}. Questions: support@mootcoach.in.</p>
</div></body></html>`;
}

async function sendReset(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'bad-email' };
  if (!mailer.configured() || !admin.apps.length) return { ok: false, fallback: true };
  if (!allow(email)) return { ok: true };   // quietly: same answer as a send

  let user;
  try { user = await admin.auth().getUserByEmail(email); }
  catch (e) { return { ok: true }; }        // no such account: say nothing
  if (user.disabled) return { ok: true };

  // Account emails come from "MootCoach", not a person, and do not guess at
  // a first name (Google often gives "Surname Firstname").
  const from = process.env.EMAIL_FROM_ACCOUNT || 'MootCoach <hello@mootcoach.in>';
  const hi = 'Hello,';
  const hasPassword = (user.providerData || []).some(p => p.providerId === 'password');

  if (!hasPassword) {
    const r = await mailer.send({ from, to: email, subject: 'Signing in to MootCoach',
      html: page([hi, 'Someone asked to reset the MootCoach password for this address. This account does not use a password: it signs in with Google.',
        'On the sign-in page, choose <b>Continue with Google</b> and pick this address.',
        'If you did not ask for this, you can ignore this email.'], { label: 'Go to sign in', href: APP() + '/?signin=1' }),
      text: `${hi.replace(/<[^>]+>/g, '')}\n\nThis MootCoach account signs in with Google, not a password. On the sign-in page choose "Continue with Google".\n\n${APP()}/?signin=1\n\nIf you did not ask for this, ignore this email.` });
    return { ok: !!r.sent, fallback: !r.sent };
  }

  const link = await admin.auth().generatePasswordResetLink(email);
  const code = new URL(link).searchParams.get('oobCode');
  if (!code) throw new Error('Firebase returned a reset link without a code');
  const url = `${APP()}/account.html?mode=resetPassword&oobCode=${encodeURIComponent(code)}`;
  // The time in the subject keeps each request its own email: Gmail threads
  // same-subject emails, and only the newest link works.
  const at = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  const r = await mailer.send({ from, to: email, subject: `Reset your MootCoach password (${at})`,
    html: page([hi, 'Someone asked to reset the password for your MootCoach account. Click the button to choose a new one. The link works once, expires in about an hour, and stops working if you ask for another reset email.',
      'If you did not ask for this, ignore this email. Your password stays the same.'], { label: 'Choose a new password', href: url }),
    text: `${hi.replace(/<[^>]+>/g, '')}\n\nChoose a new MootCoach password here (works once, expires in about an hour):\n${url}\n\nIf you did not ask for this, ignore this email. Your password stays the same.` });
  return { ok: !!r.sent, fallback: !r.sent };
}

/**
 * "Confirm your email" for a signed-in user whose address is not verified
 * (an email-and-password sign-up). Used by the pilot: a NALSAR address gets
 * its place automatically once confirmed. Same limits as resets.
 * Returns { ok, fallback, already }.
 */
async function sendVerification(uid) {
  if (!mailer.configured() || !admin.apps.length) return { ok: false, fallback: true };
  const user = await admin.auth().getUser(uid);
  if (!user.email) return { ok: false, error: 'no-email' };
  if (user.emailVerified) return { ok: true, already: true };
  if (!allow('verify:' + user.email.toLowerCase())) return { ok: true };
  const link = await admin.auth().generateEmailVerificationLink(user.email);
  const code = new URL(link).searchParams.get('oobCode');
  if (!code) throw new Error('Firebase returned a verification link without a code');
  const url = `${APP()}/account.html?mode=verifyEmail&oobCode=${encodeURIComponent(code)}`;
  const from = process.env.EMAIL_FROM_ACCOUNT || 'MootCoach <hello@mootcoach.in>';
  const at = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  const r = await mailer.send({ from, to: user.email, subject: `Confirm your email for MootCoach (${at})`,
    html: page(['Hello,', 'Click the button to confirm this is your email address. Then go back to MootCoach: if you are at NALSAR, your pilot place is waiting.',
      'If you did not create a MootCoach account, ignore this email.'], { label: 'Confirm my email', href: url })
      .replace('someone asked to reset the password for this address', 'this address was used to create a MootCoach account'),
    text: `Confirm your email for MootCoach:\n${url}\n\nIf you did not create a MootCoach account, ignore this email.` });
  return { ok: !!r.sent, fallback: !r.sent };
}

module.exports = { sendReset, sendVerification, _allow: allow };
