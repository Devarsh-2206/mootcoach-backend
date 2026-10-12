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
 * Delivery itself needs the Firebase "Trigger Email" extension watching the
 * "mail" collection; without it the message is queued and goes nowhere.
 */
const admin = require('firebase-admin');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SUBJECT = 'Welcome to MootCoach — Your Premium Legal Advocacy Partner';

function html(name) {
  return `
<div style="font-family: 'Cormorant Garamond', Georgia, serif; line-height: 1.8; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ecebe7; background-color: #fcfbfa;">
  <div style="text-align: center; border-bottom: 2px double #ddd; padding-bottom: 15px; margin-bottom: 25px;">
    <h1 style="font-family: Arial, sans-serif; font-size: 22px; letter-spacing: 0.1em; text-transform: uppercase; margin: 0; color: #B0392E;">MootCoach AI</h1>
    <span style="font-family: Arial, sans-serif; font-size: 9px; color: #888; letter-spacing: 0.15em; text-transform: uppercase;">Appellate Advocacy Suite</span>
  </div>
  
  <p>Dear ${name},</p>
  
  <p>Welcome to <strong>MootCoach AI</strong>, the premium legal-tech simulator designed to elevate your appellate advocacy and courtroom performance.</p>
  
  <h3 style="font-family: Arial, sans-serif; font-size: 14px; text-transform: uppercase; color: #B0392E; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 25px;">Platform Overview & Getting Started</h3>
  
  <ol style="padding-left: 20px; font-size: 13px;">
    <li style="margin-bottom: 12px;">
      <strong>Create Your First Moot Case:</strong> Navigate to the Dashboard, upload your moot proposition (PDF or text), and let the AI extract the core legal issues, constitutional provisions, and relevant landmark precedents.
    </li>
    <li style="margin-bottom: 12px;">
      <strong>Appellate Memorial Synthesis:</strong> Select your stance (Petitioner or Respondent) and target a specific issue to generate a structured, professional Appellate Memorial adhering to high-grade IRAC standards.
    </li>
    <li style="margin-bottom: 12px;">
      <strong>Oral Advocacy Suite:</strong> Prepare your speech, review court openings, and memorize key precedent ratios tailored to your stance.
    </li>
    <li style="margin-bottom: 12px;">
      <strong>Rebuttal Strategy & Citation Strengthening:</strong> Audit bench vulnerabilities, formulate preemptive rebuttals, and enhance your citation strength with the Citation Strengthener.
    </li>
    <li style="margin-bottom: 12px;">
      <strong>Bench Simulation:</strong> Face a realistic, hostile Bench of AI Judges. Speak or type your submissions, receive aggressive questioning, and get graded on legal accuracy, responsiveness, and courtroom demeanor.
    </li>
  </ol>
  
  <h3 style="font-family: Arial, sans-serif; font-size: 14px; text-transform: uppercase; color: #B0392E; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 25px;">Professional Support</h3>
  
  <p style="font-size: 13px;">If you have questions or feedback, please reach out to us at <a href="mailto:support@mootcoach.ai" style="color: #B0392E; text-decoration: none;">support@mootcoach.ai</a>.</p>
  
  <p style="margin-top: 35px; font-size: 13px;">Sincerely,<br><strong>The MootCoach Team</strong></p>
  
  <div style="text-align: center; border-top: 1px solid #eee; margin-top: 40px; padding-top: 15px; font-family: Arial, sans-serif; font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.1em;">
    Appellate Drafting Studio · MootCoach AI
  </div>
</div>
`;
}

async function sendWelcome(user) {
  if (!user || !user.uid || !user.email) return { sent: false, reason: 'no-email' };
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

  const name = esc(go.firstName || record.displayName || user.name || 'Advocate');
  await db.collection('mail').add({ to: user.email, message: { subject: SUBJECT, html: html(name) } });
  return { sent: true };
}

module.exports = { sendWelcome };
