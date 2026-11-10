/**
 * The closed pilot, in the browser.
 *
 * The server decides who may use the AI (services/pilot.js); this only tells
 * people where they stand. On sign-in it asks /api/pilot/me. Anyone not
 * holding a place sees a waitlist screen over the workspace instead of a
 * workspace whose every button would fail. Admins get a "Pilot" panel in the
 * sidebar to approve and release places.
 *
 * Any AI call refused for the pilot (403, code "pilot") also raises the
 * screen, through the "mc:pilot" event that requestJson dispatches.
 */
import { requestJson } from '../services/api.js';
import { confirmDialog } from './ui.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = { pilot: null, admin: false, email: '', user: null };
const sentVerify = new Set();   // uids we have already sent a verification email to, this visit

function copyFor(p) {
  const s = p && p.status;
  if (s === 'closed') return {
    title: 'The pilot has ended',
    body: "The pilot has ended and we're working on what our testers told us. We'll mail you when MootCoach opens up to everyone.",
  };
  if (s === 'released' && p.reason === 'admin') return {
    title: 'You are on the waitlist',
    body: "The pilot spots have gone to other students, so you're on the waitlist. We'll mail you when MootCoach opens up to everyone.",
  };
  if (s === 'released') return {
    title: 'Your spot went to someone else',
    body: 'Spots are held for three days, and yours wasn\'t used, so it went to another student. You\'re back on the waitlist. If you\'re at NALSAR, sign in again and upload a proposition whenever a spot is free.',
  };
  if (p && p.reason === 'verify') return {
    verify: true,
    title: 'Confirm your NALSAR email',
    body: `Almost there! We've sent a mail to ${state.email || 'your address'}. Click the button in it, then come back here and press "I have confirmed it".`,
  };
  if (p && p.reason === 'full') return {
    title: 'All the spots are taken',
    body: `MootCoach is being tested by ${p.cap || 50} students and every spot is taken right now, so you're on the waitlist. If a spot opens up, sign in again and grab it. Otherwise we'll mail you when MootCoach opens up to everyone.`,
  };
  return {
    title: 'You\'re on the waitlist',
    body: `Thanks for signing up! MootCoach is in a small pilot with ${(p && p.cap) || 50} spots. NALSAR students can start straight away; everyone else gets in a few at a time. We'll mail you as soon as your spot is ready.`,
  };
}

function gateEl() {
  let el = document.getElementById('pilot-gate');
  if (el) return el;
  const host = document.getElementById('view-workspace') || document.body;
  el = document.createElement('div');
  el.id = 'pilot-gate';
  el.className = 'pilot-gate';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'pilot-gate-title');
  host.appendChild(el);
  return el;
}

export function showPilotGate(p) {
  const c = copyFor(p);
  const el = gateEl();
  el.innerHTML = `<div class="pilot-card">
      <div class="pilot-eyebrow">MootCoach pilot</div>
      <h2 id="pilot-gate-title">${esc(c.title)}</h2>
      <p>${esc(c.body)}</p>
      ${state.email ? `<p class="pilot-small">Signed in as ${esc(state.email)}</p>` : ''}
      ${c.verify ? `<div class="pilot-actions">
        <button type="button" class="mc-dialog-primary" data-act="verified">I have confirmed it</button>
        <button type="button" class="mc-dialog-secondary" data-act="resend">Send the email again</button>
      </div>
      <p class="pilot-small" id="pilot-verify-note">Not in your inbox? Check spam. Or sign out and use <b>Continue with Google</b> with your NALSAR account.</p>` : ''}
      <div class="pilot-actions">
        <button type="button" class="mc-dialog-secondary" data-act="home">Back to the home page</button>
        <button type="button" class="mc-dialog-danger" data-act="signout">Sign out</button>
      </div>
      <p class="pilot-small"><a href="/about.html">What is MootCoach?</a></p>
    </div>`;
  el.onclick = async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    if (b.dataset.act === 'verified') return confirmVerified(b);
    if (b.dataset.act === 'resend') return sendVerifyEmail(true);
    if (b.dataset.act === 'signout' && window.handleLogout) window.handleLogout();
    if (b.dataset.act === 'home' && window.navigate) window.navigate('landing');
  };
  el.hidden = false;
  el.querySelector('button')?.focus();
  if (c.verify) sendVerifyEmail(false);
}

function verifyNote(text) {
  const n = document.getElementById('pilot-verify-note');
  if (n) n.textContent = text;
}

/** Send the "confirm your email" message: once on its own, again on request. */
async function sendVerifyEmail(again) {
  const u = state.user;
  if (!u || (!again && sentVerify.has(u.uid))) return;
  sentVerify.add(u.uid);
  if (again) verifyNote('Sending…');
  try {
    const r = await requestJson('/api/auth/verify-email', { body: {}, timeoutMs: 30000 });
    if (r.already) return confirmVerified();
    if (!r.success) throw new Error('fallback');
  } catch (e) {
    // The server cannot send right now: Firebase's own email does the same job.
    try { await u.sendEmailVerification(); }
    catch (err) { if (again) verifyNote('Couldn\'t send it just now. Try again in a minute.'); return; }
  }
  if (again) verifyNote(`Sent again to ${state.email}. Check your inbox and spam folder.`);
}

/** After the student clicks the link: refresh their sign-in so the server sees the confirmed address. */
async function confirmVerified(btn) {
  const u = state.user;
  if (!u) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  try {
    await u.reload();
    if (!u.emailVerified) {
      verifyNote('Not confirmed yet. Click the button in the mail first (check spam too), then press "I have confirmed it" again.');
      return;
    }
    await u.getIdToken(true);
    const p = await checkPilot(u);
    if (p && p.reason === 'verify') verifyNote('Confirmed! Just couldn\'t update your spot yet, try again in a moment.');
  } catch (e) {
    verifyNote('Couldn\'t check just now. Check your connection and try again.');
  } finally {
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = 'I have confirmed it'; }
  }
}

export function hidePilotGate() {
  const el = document.getElementById('pilot-gate');
  if (el) el.hidden = true;
}

const allowed = (p) => !p || p.status === 'active' || p.status === 'admin';

/** The signed-in user's pilot status, for the feedback prompts (components/feedback.js). */
export function pilotState() { return state; }

/** Ask the server where this user stands. Never blocks on a failed check: the server still enforces. */
export async function checkPilot(user) {
  state = { pilot: null, admin: false, email: (user && user.email) || '', user: user || null };
  try {
    const data = await requestJson('/api/pilot/me', { body: {}, timeoutMs: 30000 });
    state.pilot = data.pilot; state.admin = !!data.admin;
  } catch (e) {
    return null;
  }
  const btn = document.getElementById('sb-pilot-admin');
  if (btn) btn.hidden = !state.admin;
  if (allowed(state.pilot)) hidePilotGate(); else showPilotGate(state.pilot);
  // Limits come back only while the pilot is on; with it off everyone is
  // "active" and none of the pilot furniture should appear.
  const tester = state.pilot && state.pilot.status === 'active' && state.pilot.limits;
  window.pilotLimits = tester ? { voiceMinutes: state.pilot.voiceMinutes } : null;
  renderAllowance();
  // The feedback email links to /?feedback=1: open the form once signed in.
  let fromEmail = false;
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('feedback') === '1') { fromEmail = true; q.delete('feedback'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
  } catch (e) {}
  if (fromEmail && tester && window.openFeedbackForm) window.openFeedbackForm({ trigger: 'email' });
  else if (tester && window.showPilotWelcome) window.showPilotWelcome(user);
  return state.pilot;
}

/* ───────────────────────── allowance ───────────────────────── */

const BUCKETS = [
  ['uploads', 'Proposition uploads'],
  ['memorials', 'Memorial drafts'],
  ['voiceRounds', 'Voice rounds'],
  ['judgeTurns', 'Text bench turns'],
  ['memorialReviews', 'Memorial reviews'],
  ['extras', 'Other AI help'],
];

function left(bucket) {
  const p = state.pilot;
  if (!p || p.status !== 'active' || !p.limits || p.limits[bucket] == null) return Infinity;
  return Math.max(0, p.limits[bucket] - ((p.usage || {})[bucket] || 0));
}

/** "X left" for each allowance, in the sidebar. Testers only. */
function renderAllowance() {
  const el = document.getElementById('pilot-allowance');
  if (!el) return;
  const p = state.pilot;
  if (!p || p.status !== 'active' || !p.limits) { el.hidden = true; return; }
  const claim = p.placeTaken === false
    ? `<div class="pa-claim">No spot yet. Your first upload gets you one of the ${esc(p.cap || 50)} pilot spots, while they last.</div>` : '';
  el.innerHTML = `<div class="ws-sb-label">Your pilot allowance</div>${claim}` + BUCKETS.map(([k, label]) => {
    const lim = p.limits[k] || 0, used = Math.min(lim, (p.usage || {})[k] || 0), rest = lim - used;
    return `<div class="pa-row${rest <= 0 ? ' out' : ''}"><span>${esc(label)}</span><b>${rest} of ${lim} left</b></div>
      <div class="pa-bar" aria-hidden="true"><i style="width:${lim ? Math.round((rest / lim) * 100) : 0}%"></i></div>`;
  }).join('') + `<div class="pa-note">Voice rounds last up to ${esc(p.voiceMinutes || 15)} minutes.</div>
    <button type="button" class="pa-feedback" onclick="window.openFeedbackForm && window.openFeedbackForm({ trigger: 'button' })">Give feedback</button>`;
  el.hidden = false;
}

const shownLimits = new Set();
function showLimitDialog(bucket, message) {
  if (shownLimits.has(bucket)) return;
  shownLimits.add(bucket);
  confirmDialog({
    title: 'That\'s your pilot limit',
    body: message,
    actions: [{ label: 'Got it', value: true, primary: true }],
  });
}

const LIMIT_TEXT = {
  uploads: "You've used both your uploads. Your saved moots are still here to open and practise with.",
  memorials: "You've used your memorial drafts. You can still open and download the ones you made.",
  memorialReviews: "You've used your memorial reviews.",
  voiceRounds: "You've used your voice rounds. The text bench is still open.",
  judgeTurns: "You've reached the pilot limit for the text bench.",
  extras: "You've hit the pilot limit for the smaller features like authority cards, forecasts and briefings.",
};

/**
 * Called before starting something that spends an allowance. True means it is
 * used up: the dialog has been shown and the caller should stop. The server
 * enforces the same limits regardless.
 */
export function pilotBlocks(bucket) {
  if (left(bucket) > 0) return false;
  shownLimits.delete(bucket);
  showLimitDialog(bucket, LIMIT_TEXT[bucket] || "You've used this part of your pilot allowance.");
  return true;
}
window.pilotBlocks = pilotBlocks;

window.addEventListener('mc:limit', (e) => {
  const d = e.detail || {};
  showLimitDialog(d.bucket || 'other', d.message || "You've reached your pilot limit for this feature.");
  refreshSoon();
});

let refreshTimer = null;
function refreshSoon() {
  if (!state.pilot || state.pilot.status !== 'active') return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      const data = await requestJson('/api/pilot/me', { body: {}, timeoutMs: 30000 });
      if (data && data.pilot) { state.pilot = data.pilot; renderAllowance(); }
    } catch (e) { /* the next call will try again */ }
  }, 2500);
}
window.addEventListener('mc:ai-done', refreshSoon);

export function resetPilot() {
  state = { pilot: null, admin: false, email: '' };
  window.pilotLimits = null;
  shownLimits.clear();
  renderAllowance();
  hidePilotGate();
  const btn = document.getElementById('sb-pilot-admin');
  if (btn) btn.hidden = true;
}

// A refused AI call: show where they stand rather than a bare error.
window.addEventListener('mc:pilot', (e) => {
  const p = e.detail || {};
  if (!allowed(p)) { state.pilot = p; showPilotGate(p); }
});

/* ───────────────────────── admin panel ───────────────────────── */

const fmtDate = (t) => (t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const REASON = { auto: 'NALSAR, automatic', approved: 'approved by you', approval: 'needs approval', full: 'NALSAR, arrived when full', idle: 'unused for 3 days', verify: 'NALSAR, confirming email', admin: 'moved to waitlist by you', closed: 'signed up after the pilot' };

async function openPilotAdmin() {
  let overlay = document.getElementById('pilot-admin');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pilot-admin';
    overlay.className = 'mc-dialog-overlay';
    overlay.innerHTML = `<div class="mc-dialog pilot-admin" role="dialog" aria-modal="true" aria-labelledby="pilot-admin-title">
        <div class="pilot-admin-head"><h3 id="pilot-admin-title">Pilot</h3><button type="button" class="pilot-x" data-act="close" aria-label="Close">×</button></div>
        <div class="pilot-admin-body"><p>Loading…</p></div>
      </div>`;
    overlay.addEventListener('click', async (e) => {
      if (e.target === overlay || e.target.closest('[data-act="close"]')) { overlay.remove(); return; }
      const tab = e.target.closest('button[data-tab]');
      if (tab) { overlay.dataset.view = tab.dataset.tab; render(overlay); return; }
      if (e.target.closest('[data-act="csv"]')) { downloadCsv(overlay._fb || []); return; }
      const prev = e.target.closest('[data-act="email-preview"]');
      if (prev) {
        prev.disabled = true; prev.textContent = 'Sending…';
        try { const r = await requestJson('/api/pilot/admin/email-preview', { body: {}, timeoutMs: 60000 }); alertIn(overlay, `Sent ${r.sent} preview emails to ${r.to}.`); }
        catch (err) { alertIn(overlay, err.message); }
        prev.disabled = false; prev.textContent = 'Send me a preview of every email';
        return;
      }
      const st = e.target.closest('[data-act="sentry-test"]');
      if (st) {
        st.disabled = true; st.textContent = 'Sending…';
        try {
          const r = await requestJson('/api/pilot/admin/sentry-test', { body: {}, timeoutMs: 30000 });
          alertIn(overlay, !r.enabled ? 'Sentry is not switched on: SENTRY_DSN is not set in Render.'
            : r.sent ? `Test error sent (id ${r.eventId}). Open Sentry → Issues: it should appear within a minute, with an email. If it does not, the DSN in Render is probably wrong.`
            : 'Sentry is on, but the test error could not be confirmed as delivered. Check the Render logs for "[SENTRY] test event".');
        } catch (err) { alertIn(overlay, err.message); }
        st.disabled = false; st.textContent = 'Send a test error to Sentry';
        return;
      }
      const reset = e.target.closest('[data-act="spend-reset"]');
      if (reset) {
        // Two clicks, so a stray click cannot wipe the numbers.
        if (!reset.dataset.armed) { reset.dataset.armed = '1'; reset.textContent = 'Click again to reset'; return; }
        reset.disabled = true;
        try { const r = await requestJson('/api/pilot/admin/spend-reset', { body: {}, timeoutMs: 30000 }); overlay._ov.spend = r.spend; render(overlay); }
        catch (err) { reset.disabled = false; alertIn(overlay, err.message); }
        return;
      }
      if (e.target.closest('[data-act="copy"]')) {
        const emails = (overlay._ov.members || []).filter(m => m.status === 'active' && !(m.feedback && m.feedback.full)).map(m => m.email).filter(Boolean);
        try { await navigator.clipboard.writeText(emails.join(', ')); alertIn(overlay, `Copied ${emails.length} email address${emails.length === 1 ? '' : 'es'}.`); }
        catch (err) { alertIn(overlay, emails.join(', ') || 'Everyone has given feedback.'); }
        return;
      }
      const b = e.target.closest('button[data-uid]');
      if (!b) return;
      b.disabled = true;
      try {
        await requestJson('/api/pilot/admin/set', { body: { uid: b.dataset.uid, action: b.dataset.action }, timeoutMs: 30000 });
      } catch (err) {
        alertIn(overlay, err.message);
      }
      await load(overlay);
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape' && document.getElementById('pilot-admin')) { overlay.remove(); document.removeEventListener('keydown', onKey); }
    });
    document.body.appendChild(overlay);
  }
  overlay.dataset.view = overlay.dataset.view || 'waitlist';
  await load(overlay);
}

function alertIn(overlay, msg) {
  const body = overlay.querySelector('.pilot-admin-body');
  const p = document.createElement('p');
  p.className = 'pilot-error';
  p.textContent = msg;
  body.prepend(p);
}

async function load(overlay) {
  try {
    const [data, fb] = await Promise.all([
      requestJson('/api/pilot/admin/overview', { body: {}, timeoutMs: 30000 }),
      requestJson('/api/pilot/admin/feedback', { body: {}, timeoutMs: 30000 }).catch(() => ({ feedback: [] })),
    ]);
    overlay._ov = data.overview;
    overlay._fb = fb.feedback || [];
    render(overlay);
  } catch (e) {
    overlay.querySelector('.pilot-admin-body').innerHTML = `<p class="pilot-error">${esc(e.message)}</p>`;
  }
}

function render(overlay) {
  const ov = overlay._ov;
  if (!ov) return;
  const tab = overlay.dataset.view;
  const c = ov.counts;
  const fb = overlay._fb || [];
  const rows = ov.members.filter(m => m.status === tab);
  const noFeedback = ov.members.filter(m => m.status === 'active' && !(m.feedback && m.feedback.full)).length;
  const modeNote = ov.mode === 'off'
    ? '<p class="pilot-error">PILOT_MODE is off: anyone signed in can use MootCoach. Set PILOT_MODE=on in Render to start the pilot.</p>'
    : ov.mode === 'closed' ? '<p class="pilot-small">The pilot is closed. Only admins can use MootCoach.</p>' : '';
  overlay.querySelector('.pilot-admin-body').innerHTML = `${modeNote}
    <div class="pilot-stats">
      <div><b>${c.active}</b> / ${ov.cap}<span>places taken</span></div>
      <div><b>${c.used}</b><span>have uploaded</span></div>
      <div><b>${c.waitlist}</b><span>waiting</span></div>
      <div><b>${c.released}</b><span>released</span></div>
    </div>
    <div class="pilot-tabs" role="tablist">
      ${['waitlist', 'active', 'released', 'feedback', 'spend', 'emails'].map(t => `<button type="button" role="tab" aria-selected="${t === tab}" class="${t === tab ? 'is-on' : ''}" data-tab="${t}">${t === 'waitlist' ? 'Waitlist' : t === 'active' ? 'Testers' : t === 'released' ? 'Released' : t === 'feedback' ? 'Feedback' : t === 'spend' ? 'Spend' : 'Emails'}${t === 'emails' ? '' : t === 'spend' ? (ov.spend ? ' (' + inr(ov.spend.totalInr) + ')' : '') : ` (${t === 'feedback' ? fb.length : c[t]})`}</button>`).join('')}
    </div>
    ${tab === 'emails' ? renderEmails(ov.emails) : tab === 'spend' ? renderSpend(ov.spend) : tab === 'feedback' ? renderFeedback(fb, noFeedback) : `<div class="pilot-list">
      ${rows.length ? rows.map(m => `<div class="pilot-row">
          <div class="pilot-who"><b>${esc(m.name || '(no name)')}</b><span>${esc(m.email)}</span>
            <span class="pilot-small">${esc(REASON[m.reason] || m.reason || '')} · joined ${esc(fmtDate(m.joinedAt))}${m.status === 'active' ? (m.placeTaken === false ? ' · <b>looking around, no place yet</b>' : m.firstUseAt ? ' · uploaded ' + esc(fmtDate(m.firstUseAt)) : ' · place claimed, not used yet') : ''}</span>
            ${m.usage && Object.keys(m.usage).length ? `<span class="pilot-small">Used: ${esc(Object.entries(m.usage).map(([k, v]) => `${k} ${v}`).join(', '))}</span>` : ''}
            ${m.status === 'active' ? `<span class="pilot-small">${m.feedback && m.feedback.full ? '✓ Gave feedback' : 'No feedback yet'}</span>` : ''}</div>
          ${m.status === 'active'
            ? `<button type="button" class="mc-dialog-secondary" data-uid="${esc(m.uid)}" data-action="release">Move to waitlist</button>`
            : `<button type="button" class="mc-dialog-primary" data-uid="${esc(m.uid)}" data-action="approve" ${c.active >= ov.cap ? 'disabled title="All places are taken"' : ''}>Approve</button>`}
        </div>`).join('') : `<p class="pilot-small">Nobody here yet.</p>`}
    </div>`}
    <p class="pilot-small">Unused places are released after ${ov.releaseHours} hours. Automatic entry: ${esc(ov.autoDomains.join(', '))}.</p>
    ${ov.load ? `<p class="pilot-small">Right now: ${ov.load.analyze.active} of ${ov.load.analyze.max} uploads analysing, ${ov.load.analyze.waiting} waiting · ${ov.load.voice.active} of ${ov.load.voice.max} voice rounds · busiest since restart: ${ov.load.analyze.peakActive} analysing, ${ov.load.analyze.peakQueue} waiting${ov.load.analyze.rejected ? `, <b>${ov.load.analyze.rejected} turned away as busy</b>` : ''}.</p>` : ''}
    ${ov.indianKanoon ? `<p class="pilot-small">Indian Kanoon since the last restart: ${ov.indianKanoon.configured ? (ov.indianKanoon.paused ? `<b>PAUSED: ${ov.indianKanoon.missStreak} searches in a row found nothing, so it is off until the next restart (cases use the free web check)</b>` : 'on') : '<b>no token (INDIANKANOON_API_TOKEN not set)</b>'} · at most ${ov.indianKanoon.maxPerUpload} searches per upload · today ${ov.indianKanoon.usedToday || 0} of ${ov.indianKanoon.dailyMax || '—'} · ${ov.indianKanoon.lookups} lookups · ${ov.indianKanoon.found} found · ${ov.indianKanoon.notFound} not found · ${ov.indianKanoon.errors} errors${ov.indianKanoon.lastError ? ' (last: ' + esc(ov.indianKanoon.lastError) + ')' : ''}${ov.indianKanoon.lastSample ? ' · reply ' + esc(ov.indianKanoon.lastSample) : ''}.</p>` : ''}
    ${ov.indianKanoon && (ov.indianKanoon.lastMisses || []).length ? `<p class="pilot-small">Indian Kanoon, last cases not matched: ${(ov.indianKanoon.lastMisses).map(m => `<b>${esc(m.query)}</b> → ${m.results} results${m.titles.length ? ': ' + m.titles.map((t, i) => `"${esc(t)}"${m.courts[i] ? ' (' + esc(m.courts[i]) + ')' : ''}`).join('; ') : ''}`).join(' &nbsp;|&nbsp; ')}</p>` : ''}
    ${ov.ai ? `<p class="pilot-small">AI since the last restart: ${ov.ai.backend === 'vertex' ? 'Vertex AI' : 'AI Studio key'} · ${ov.ai.vertex} Vertex calls · ${ov.ai.fallback} fell back to the AI Studio key · voice rounds: ${ov.ai.voiceVertex || 0} on Vertex, ${ov.ai.voiceStudio || 0} on the AI Studio key${ov.ai.lastFallback ? ' (last reason: ' + esc(ov.ai.lastFallback) + ')' : ''}.</p>` : ''}`;
}

/** Rupees: paise shown while amounts are small, so ₹0.15 calls don't read as ₹0. */
function inr(n) {
  n = Number(n) || 0;
  return '₹' + (n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString('en-IN'));
}
const fmtTokens = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n || 0);

const EMAIL_LABELS = { waitlisted: 'On the waitlist', welcome: 'Welcome', approved: 'Place ready', reminder: 'Unused-place reminder (24h)', voice: 'Try a voice round (day 2)', feedback: 'Feedback request (day 4)' };
function renderEmails(em) {
  if (!em) return '<p class="pilot-small">Email status is not available on this server yet.</p>';
  const t = em.totals || {};
  return `${em.configured ? '' : '<p class="pilot-error">Emails are not being sent: RESEND_API_KEY is not set in Render. Every email is only written to the logs until it is.</p>'}
    <div class="pilot-list"><table class="spend-table"><thead><tr><th>Email</th><th>Sent</th></tr></thead><tbody>
      ${Object.entries(EMAIL_LABELS).map(([k, l]) => `<tr><td>${esc(l)}</td><td>${t[k] || 0}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="pilot-small">${em.startedAt ? 'Sending since ' + esc(fmtDate(em.startedAt)) + '. Only people who joined after that are emailed.' : 'Not started yet.'} ${em.unsubscribed || 0} unsubscribed from reminders.${em.failedSinceRestart ? ' ' + em.failedSinceRestart + ' failed since the last restart (last: ' + esc(em.lastError) + ').' : ''}${em.lastTick ? ' Last check ' + esc(fmtDate(em.lastTick)) + '; checks run every 30 minutes.' : ''}</p>
    <div class="pilot-actions"><button type="button" class="mc-dialog-primary" data-act="email-preview" ${em.configured ? '' : 'disabled'}>Send me a preview of every email</button></div>`;
}

function renderSpend(sp) {
  if (!sp) return '<p class="pilot-small">Spend figures are not available on this server yet.</p>';
  const TRIAL_INR = 28569;
  const left = TRIAL_INR - sp.vertexInr;
  const perUse = (r) => r.perUseInr == null ? '—' : inr(r.perUseInr);
  const USE = { upload: 'per upload', draft: 'per draft', memorial: 'per memorial', memorialReview: 'per review', forecast: 'per forecast', oralCoach: 'per submission', authority: 'per card', briefing: 'per briefing', voice: 'per round', scoresheet: 'per scoresheet', bench: 'per turn', other: '' };
  return `<div class="pilot-stats">
      <div><b>${inr(sp.totalInr)}</b><span>estimated total</span></div>
      <div><b>${inr(sp.vertexInr)}</b><span>on Vertex (trial credit)</span></div>
      <div><b>${inr(sp.studioInr + (sp.kanoonInr || 0))}</b><span>AI Studio key${sp.kanoonInr ? ' + Indian Kanoon ' + inr(sp.kanoonInr) : ''}</span></div>
      <div><b>${inr(Math.max(0, left))}</b><span>of ₹28,569 credit left (est.)</span></div>
    </div>
    <div class="pilot-list">
      ${sp.rows.length ? `<table class="spend-table"><thead><tr><th>Feature</th><th>Uses</th><th>AI calls</th><th>Tokens in / out</th><th>Spend</th><th>Each</th></tr></thead><tbody>
        ${sp.rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.uses || '—'}</td><td>${r.calls}</td><td>${fmtTokens(r.input)} / ${fmtTokens(r.output)}</td><td>${inr(r.inr)}</td><td>${perUse(r)} <span class="pilot-small">${USE[r.feature] || ''}</span></td></tr>`).join('')}
      </tbody></table>` : '<p class="pilot-small">Nothing counted yet. Figures appear after the next upload, memorial or voice round.</p>'}
      ${sp.models.length ? `<p class="pilot-small">By model: ${sp.models.map(m => `${esc(m.model)} ${inr(m.inr)} (${m.calls})`).join(' · ')}</p>` : ''}
    </div>
    <p class="pilot-small">These are estimates from the token counts Gemini reports, priced at list rates that may be out of date${sp.pricesOverridden ? ' (prices set with SPEND_PRICES)' : ''}, at ₹${sp.rate.toFixed(2)} per dollar. Google Cloud Billing is the real figure and shows it about a day late. "Each" divides by successful uses, so extra steps after an upload (issues, authorities, forecast) are included in the upload's cost.${sp.since ? ' Counting since ' + esc(fmtDate(sp.since)) + '.' : ''}</p>
    <div class="pilot-actions"><button type="button" class="mc-dialog-secondary" data-act="spend-reset">Reset the spend figures</button>
      <button type="button" class="mc-dialog-secondary" data-act="sentry-test">Send a test error to Sentry</button></div>`;
}

const FB_LABELS = {
  overall: 'Useful (1–5)', favourite: 'Helped most', accuracy: 'Analysis accuracy (1–5)', wrongCases: 'Wrong cases?',
  wrongCasesDetail: 'Which cases', judge: 'Judge realism (1–5)', problems: 'Problems', realMoot: 'Use for a real moot',
  pay: 'Would pay', recommend: 'Recommend (0–10)', comments: 'Comments', rating: 'Round rating (1–5)', improve: 'Improve', source: 'Round type',
};
const FB_KEYS = Object.keys(FB_LABELS);

function renderFeedback(fb, noFeedback) {
  const full = fb.filter(f => f.kind === 'full');
  const avg = (k) => { const v = full.map(f => f.answers[k]).filter(n => typeof n === 'number'); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'; };
  const quick = fb.filter(f => f.kind === 'quick').map(f => f.answers.rating).filter(Boolean);
  return `<div class="pilot-stats">
      <div><b>${full.length}</b><span>full forms</span></div>
      <div><b>${avg('overall')}</b><span>avg usefulness /5</span></div>
      <div><b>${avg('recommend')}</b><span>avg recommend /10</span></div>
      <div><b>${quick.length ? (quick.reduce((a, b) => a + b, 0) / quick.length).toFixed(1) : '—'}</b><span>avg round rating</span></div>
    </div>
    <div class="pilot-actions">
      <button type="button" class="mc-dialog-primary" data-act="csv" ${fb.length ? '' : 'disabled'}>Download CSV</button>
      <button type="button" class="mc-dialog-secondary" data-act="copy">Copy emails of testers without feedback (${noFeedback})</button>
    </div>
    <div class="pilot-list">
      ${fb.length ? fb.slice(0, 200).map(f => `<div class="pilot-row fb-entry"><div class="pilot-who">
          <b>${esc(f.name || f.email || 'Tester')} · ${f.kind === 'full' ? 'full form' : 'round rating'}</b>
          <span class="pilot-small">${esc(fmtDate(f.createdAt))}${f.trigger ? ' · ' + esc(f.trigger) : ''}</span>
          ${Object.entries(f.answers || {}).map(([k, v]) => `<span><i>${esc(FB_LABELS[k] || k)}:</i> ${esc(v)}</span>`).join('')}
        </div></div>`).join('') : '<p class="pilot-small">No feedback yet.</p>'}
    </div>`;
}

/** Spreadsheet-safe: quoted, and cells that start like a formula are defused. */
function downloadCsv(fb) {
  const cell = (v) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const head = ['Date', 'Name', 'Email', 'Form', 'Trigger', ...FB_KEYS.map(k => FB_LABELS[k])];
  const rows = fb.map(f => [new Date(f.createdAt).toISOString(), f.name, f.email, f.kind, f.trigger, ...FB_KEYS.map(k => (f.answers || {})[k])]);
  const csv = [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'mootcoach-pilot-feedback.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

window.openPilotAdmin = openPilotAdmin;
