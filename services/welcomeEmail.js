/**
 * The welcome email, sent by the server.
 *
 * It used to be written to the Firestore "mail" collection from the browser,
 * which the security rules (correctly) refuse, so nothing was ever sent. The
 * server writes it with the Admin SDK instead, under three conditions that
 * keep the endpoint from being used to send mail anywhere else:
 *
 *   - only to the signed-in user's own address, from the verified token;
 *   - only for an account created in the last 15 minutes;
 *   - only once per account.
 *
 * It is sent through services/mailer.js (Resend). It used to be queued for
 * the Firebase "Trigger Email" extension, which was never installed, so it
 * never arrived. During the pilot this is skipped: services/emails.js sends
 * the pilot welcome instead.
 */
const admin = require('firebase-admin');

const mailer = require('./mailer');
const { readConfig } = require('./pilot');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SUBJECT = 'Welcome to MootCoach';
const APP = () => (process.env.APP_URL || 'https://mootcoach.in').replace(/\/$/, '');

function html(name) {
  const p = (t) => `<p style="margin:0 0 14px">${t}</p>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f4ef">
<div style="max-width:560px;margin:0 auto;padding:28px 24px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1f1d1a;background:#fffdf9">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr><td style="padding:0 10px 0 0;vertical-align:middle"><img src="https://mootcoach.in/icon-192.png" width="30" height="30" alt="MootCoach" style="display:block;border:0;width:30px;height:30px"></td><td style="vertical-align:middle;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#a23b2c"><b>MootCoach</b></td></tr></table>
${p(name === 'there' ? 'Hi there,' : `Hi ${name},`)}
${p('Thanks for signing up for MootCoach!')}
${p('Just upload your proposition as a PDF and it\'ll break down the issues, cases and arguments for both sides in a couple of minutes. Then you can draft your memorial and practise your oral round with the judge.')}
${p('If anything feels off or confusing, just reply here. I\'d really like to know.')}
<p style="margin:22px 0"><a href="${APP()}" style="display:inline-block;background:#a23b2c;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px">Open MootCoach</a></p>
<p style="margin:22px 0 0">Cheers,<br>Devarsh<br><span style="color:#6b665e">Founder, MootCoach</span></p>
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e8e4dc;font-family:Arial,sans-serif;font-size:12px;color:#8a857c">You are getting this because you created a MootCoach account. Questions? Write to support@mootcoach.in.</p>
</div></body></html>`;
}

async function sendWelcome(user) {
  if (!user || !user.uid || !user.email) return { sent: false, reason: 'no-email' };
  // During the pilot, services/emails.js sends the welcome (it knows about places).
  if (readConfig().mode !== 'off') return { sent: false, reason: 'pilot' };
  if (!mailer.configured()) return { sent: false, reason: 'unconfigured' };
  const record = await admin.auth().getUser(user.uid);
  const created = Date.parse(record.metadata.creationTime || '');
  if (!created || Date.now() - created > 15 * 60 * 1000) return { sent: false, reason: 'not-new' };

  const db = admin.firestore();
  const profile = db.collection('artifacts').doc('moot.coach').collection('users').doc(user.uid);
  // A transaction, so two quick calls cannot both send.
  const go = await db.runTransaction(async (t) => {
    const snap = await t.get(profile);
    if (snap.exists && snap.data().welcomeSentAt) return null;
    t.set(profile, { welcomeSentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return snap.exists ? snap.data() : {};
  });
  if (!go) return { sent: false, reason: 'already-sent' };

  const name = esc(String(go.firstName || record.displayName || user.name || '').trim().split(/\s+/)[0] || 'there');
  return mailer.send({ to: user.email, subject: SUBJECT, html: html(name) });
}

module.exports = { sendWelcome };
