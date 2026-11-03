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
  return state.pilot;
}

export function resetPilot() {
  state = { pilot: null, admin: false, email: '' };
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
    const data = await requestJson('/api/pilot/admin/overview', { body: {}, timeoutMs: 30000 });
    overlay._ov = data.overview;
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
  const rows = ov.members.filter(m => m.status === tab);
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
      ${['waitlist', 'active', 'released'].map(t => `<button type="button" role="tab" aria-selected="${t === tab}" class="${t === tab ? 'is-on' : ''}" data-tab="${t}">${t === 'waitlist' ? 'Waitlist' : t === 'active' ? 'Testers' : 'Released'} (${c[t]})</button>`).join('')}
    </div>
    <div class="pilot-list">
      ${rows.length ? rows.map(m => `<div class="pilot-row">
          <div class="pilot-who"><b>${esc(m.name || '(no name)')}</b><span>${esc(m.email)}</span>
            <span class="pilot-small">${esc(REASON[m.reason] || m.reason || '')} · joined ${esc(fmtDate(m.joinedAt))}${m.status === 'active' ? (m.firstUseAt ? ' · uploaded ' + esc(fmtDate(m.firstUseAt)) : ' · not used yet') : ''}</span></div>
          ${m.status === 'active'
            ? `<button type="button" class="mc-dialog-secondary" data-uid="${esc(m.uid)}" data-action="release">Release</button>`
            : `<button type="button" class="mc-dialog-primary" data-uid="${esc(m.uid)}" data-action="approve" ${c.active >= ov.cap ? 'disabled title="All places are taken"' : ''}>Approve</button>`}
        </div>`).join('') : `<p class="pilot-small">Nobody here yet.</p>`}
    </div>
    <p class="pilot-small">Unused places are released after ${ov.releaseHours} hours. Automatic entry: ${esc(ov.autoDomains.join(', '))}.</p>`;
}

window.openPilotAdmin = openPilotAdmin;
