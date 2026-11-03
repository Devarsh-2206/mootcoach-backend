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

let state = { pilot: null, admin: false, email: '' };

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
      <div class="pilot-actions">
        <button type="button" class="mc-dialog-secondary" data-act="home">Back to the home page</button>
        <button type="button" class="mc-dialog-danger" data-act="signout">Sign out</button>
      </div>
      <p class="pilot-small"><a href="/about.html">What is MootCoach?</a></p>
    </div>`;
  el.onclick = (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    if (b.dataset.act === 'signout' && window.handleLogout) window.handleLogout();
    if (b.dataset.act === 'home' && window.navigate) window.navigate('landing');
  };
  el.hidden = false;
  el.querySelector('button')?.focus();
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
  state = { pilot: null, admin: false, email: (user && user.email) || '' };
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
  if (tester && window.showPilotWelcome) window.showPilotWelcome(user);
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
const REASON = { auto: 'NALSAR, automatic', approved: 'approved by you', approval: 'needs approval', full: 'NALSAR, arrived when full', idle: 'unused for 3 days', admin: 'released by you', closed: 'signed up after the pilot' };

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
      ${['waitlist', 'active', 'released', 'feedback'].map(t => `<button type="button" role="tab" aria-selected="${t === tab}" class="${t === tab ? 'is-on' : ''}" data-tab="${t}">${t === 'waitlist' ? 'Waitlist' : t === 'active' ? 'Testers' : t === 'released' ? 'Released' : 'Feedback'} (${t === 'feedback' ? fb.length : c[t]})</button>`).join('')}
    </div>
    ${tab === 'feedback' ? renderFeedback(fb, noFeedback) : `<div class="pilot-list">
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
    <p class="pilot-small">Unused places are released after ${ov.releaseHours} hours. Automatic entry: ${esc(ov.autoDomains.join(', '))}.</p>`;
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
