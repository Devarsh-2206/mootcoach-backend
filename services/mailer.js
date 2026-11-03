/**
 * Sends one email. MootCoach sends through Resend's HTTP API (no SMTP, no
 * extra package): https://resend.com, a sending service with a free tier.
 *
 *   RESEND_API_KEY   the API key; without it nothing is sent and every email
 *                    is only logged, so the app works the same either way
 *   EMAIL_FROM       default "MootCoach <hello@mootcoach.in>"
 *   EMAIL_REPLY_TO   default support@mootcoach.in (replies land in Zoho)
 *   EMAILS           "off" stops all sending (the brake)
 *
 * The domain must be verified in Resend first (DNS records at GoDaddy),
 * otherwise Resend refuses mail from @mootcoach.in.
 */
// Sent as MootCoach; the letters are signed by Devarsh, so the sender line
// does not repeat the name.
const FROM = () => process.env.EMAIL_FROM || 'MootCoach <hello@mootcoach.in>';
const REPLY_TO = () => process.env.EMAIL_REPLY_TO || 'support@mootcoach.in';

function configured() {
  return !!process.env.RESEND_API_KEY && process.env.EMAILS !== 'off';
}

/** @returns {Promise<{sent:boolean, id?:string, reason?:string}>} */
async function send({ to, subject, html, text, headers, from }) {
  if (process.env.EMAILS === 'off') return { sent: false, reason: 'off' };
  if (!process.env.RESEND_API_KEY) {
    console.log(`[EMAIL] not sent (no RESEND_API_KEY): "${subject}" to ${String(to).replace(/^(.).*@/, '$1***@')}`);
    return { sent: false, reason: 'unconfigured' };
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from || FROM(), to: [to], reply_to: REPLY_TO(), subject, html, text, headers }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`Resend ${r.status}: ${(body && (body.message || body.name)) || 'refused'}`);
    e.status = r.status;
    throw e;
  }
  return { sent: true, id: body.id };
}

module.exports = { send, configured };
