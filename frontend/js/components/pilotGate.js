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
    body: 'Thank you for your interest in MootCoach. The pilot is over and we are working on what our testers told us. We will email you when MootCoach opens to everyone.',
  };
  if (s === 'released') return {
    title: 'Your place was released',
    body: 'Pilot places are held for three days, and yours was not used, so it went to someone else. You are back on the waitlist. If you are at NALSAR, signing in again gets your place back automatically whenever one is free.',
  };
  if (p && p.reason === 'verify') return {
    verify: true,
    title: 'Confirm your NALSAR email',
    body: `Your @nalsar.ac.in address gets a pilot place straight away. It only needs confirming: we have sent an email to ${state.email || 'your address'}. Click the button in it, then come back here and press "I have confirmed it".`,
  };
  if (p && p.reason === 'full') return {
    title: 'All pilot places are taken',
    body: `MootCoach is being tested by ${p.cap || 50} students, and every place is in use. You are on the waitlist: if a place opens up you get it automatically the next time you sign in, and otherwise we will email you when MootCoach opens to everyone.`,
  };
  return {
    title: 'You are on the waitlist',
    body: `MootCoach is in a closed pilot with ${(p && p.cap) || 50} places. NALSAR students who sign in with their @nalsar.ac.in Google account get a place straight away; everyone else is reviewed by hand. We will email you as soon as yours is approved.`,
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
      <p class="pilot-small" id="pilot-verify-note">Not in your inbox? Check spam. Or sign out and use <b>Continue with Google</b> with your NALSAR account instead.</p>` : ''}
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
    catch (err) { if (again) verifyNote('Could not send it just now. Wait a minute and try again.'); return; }
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
      verifyNote('Not confirmed yet. Click the button in the email first (check spam), then press "I have confirmed it" again.');
      return;
    }
    await u.getIdToken(true);
    const p = await checkPilot(u);
    if (p && p.reason === 'verify') verifyNote('Confirmed, but we could not update your place yet. Try again in a moment.');
  } catch (e) {
    verifyNote('Could not check just now. Check your connection and try again.');
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
  el.innerHTML = `<div class="ws-sb-label">Your pilot allowance</div>` + BUCKETS.map(([k, label]) => {
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
    title: 'Pilot allowance used',
    body: message,
    actions: [{ label: 'OK', value: true, primary: true }],
  });
}

const LIMIT_TEXT = {
  uploads: "You've used both of your pilot uploads. Your saved moots are still here to open and practise with.",
  memorials: "You've drafted your pilot memorials. You can still open, read and download them.",
  memorialReviews: "You've used your pilot memorial reviews.",
  voiceRounds: "You've used your pilot voice rounds. The text bench is still open.",
  judgeTurns: "You've reached the pilot limit for the text bench.",
  extras: "You've reached the pilot limit for smaller AI features such as authority cards, forecasts and briefings.",
};

/**
 * Called before starting something that spends an allowance. True means it is
 * used up: the dialog has been shown and the caller should stop. The server
 * enforces the same limits regardless.
 */
export function pilotBlocks(bucket) {
  if (left(bucket) > 0) return false;
  shownLimits.delete(bucket);
  showLimitDialog(bucket, (LIMIT_TEXT[bucket] || "You've used this pilot allowance.") + ' Thank you for testing MootCoach.');
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
const REASON = { auto: 'NALSAR, automatic', approved: 'approved by you', approval: 'needs approval', full: 'NALSAR, arrived when full', idle: 'unused for 3 days', verify: 'NALSAR, confirming email', admin: 'released by you', closed: 'signed up after the pilot' };

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
            <span class="pilot-small">${esc(REASON[m.reason] || m.reason || '')} · joined ${esc(fmtDate(m.joinedAt))}${m.status === 'active' ? (m.firstUseAt ? ' · uploaded ' + esc(fmtDate(m.firstUseAt)) : ' · not used yet') : ''}</span>
            ${m.usage && Object.keys(m.usage).length ? `<span class="pilot-small">Used: ${esc(Object.entries(m.usage).map(([k, v]) => `${k} ${v}`).join(', '))}</span>` : ''}
            ${m.status === 'active' ? `<span class="pilot-small">${m.feedback && m.feedback.full ? '✓ Gave feedback' : 'No feedback yet'}</span>` : ''}</div>
          ${m.status === 'active'
            ? `<button type="button" class="mc-dialog-secondary" data-uid="${esc(m.uid)}" data-action="release">Release</button>`
            : `<button type="button" class="mc-dialog-primary" data-uid="${esc(m.uid)}" data-action="approve" ${c.active >= ov.cap ? 'disabled title="All places are taken"' : ''}>Approve</button>`}
        </div>`).join('') : `<p class="pilot-small">Nobody here yet.</p>`}
    </div>`}
    <p class="pilot-small">Unused places are released after ${ov.releaseHours} hours. Automatic entry: ${esc(ov.autoDomains.join(', '))}.</p>
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
      <div><b>${inr(sp.studioInr)}</b><span>on the AI Studio key</span></div>
      <div><b>${inr(Math.max(0, left))}</b><span>of ₹28,569 credit left (est.)</span></div>
    </div>
    <div class="pilot-list">
      ${sp.rows.length ? `<table class="spend-table"><thead><tr><th>Feature</th><th>Uses</th><th>AI calls</th><th>Tokens in / out</th><th>Spend</th><th>Each</th></tr></thead><tbody>
        ${sp.rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.uses || '—'}</td><td>${r.calls}</td><td>${fmtTokens(r.input)} / ${fmtTokens(r.output)}</td><td>${inr(r.inr)}</td><td>${perUse(r)} <span class="pilot-small">${USE[r.feature] || ''}</span></td></tr>`).join('')}
      </tbody></table>` : '<p class="pilot-small">Nothing counted yet. Figures appear after the next upload, memorial or voice round.</p>'}
      ${sp.models.length ? `<p class="pilot-small">By model: ${sp.models.map(m => `${esc(m.model)} ${inr(m.inr)} (${m.calls})`).join(' · ')}</p>` : ''}
    </div>
    <p class="pilot-small">These are estimates from the token counts Gemini reports, priced at list rates that may be out of date${sp.pricesOverridden ? ' (prices set with SPEND_PRICES)' : ''}, at ₹${sp.rate.toFixed(2)} per dollar. Google Cloud Billing is the real figure and shows it about a day late. "Each" divides by successful uses, so extra steps after an upload (issues, authorities, forecast) are included in the upload's cost.${sp.since ? ' Counting since ' + esc(fmtDate(sp.since)) + '.' : ''}</p>
    <div class="pilot-actions"><button type="button" class="mc-dialog-secondary" data-act="spend-reset">Reset the spend figures</button></div>`;
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
