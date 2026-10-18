import { BASE_URL } from '../config.js';
import { currentUser, db, firebaseRef, hasCheckedAuth } from '../services/firebase.js';
import { logSessionSecurely, checkBackendHealth, prepareOralBriefing, requestJson } from '../services/api.js';
import { storedOralNotes, storedRebuttals, lastBuiltArgument, populateIssuesFromAnalysis } from './argumentBuilder.js';

// Shared State Variables
export let lastAnalysis = '';
export let currentPropositionContext = '';

export function setLastAnalysis(val) { lastAnalysis = val; }
export function setCurrentPropositionContext(val) { currentPropositionContext = val; }

/* ─── TOAST NOTIFICATIONS ─── */
export function showToast(msg, type = 'err') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  // Clear any existing toasts to prevent stacking overlays
  stack.innerHTML = '';

  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type === 'err' ? '✕' : type === 'ok' ? '✓' : 'ℹ';
  t.innerHTML = `<div class="toast-icon">${icon}</div><div>${esc(msg)}</div>`;
  stack.appendChild(t);

  const duration = (msg.includes('selected') || msg.includes('Selected') || msg.includes('Deselected')) ? 1500 : 3500;

  setTimeout(() => {
    t.classList.add('removing');
    setTimeout(() => t.remove(), 250);
  }, duration);
}

/**
 * A failure the user can see and act on.
 *
 * Renders into `host` (replacing its content when `replace` is set, otherwise
 * appended) a card with the message and a Retry button. Returns the element so
 * callers can remove it when the retry starts.
 */
export function renderActionError(host, { title = 'That did not work', message, onRetry, retryLabel = 'Try again', replace = false } = {}) {
  if (!host) return null;
  const box = document.createElement('div');
  box.className = 'mc-error';
  box.setAttribute('role', 'alert');
  box.innerHTML = `<div class="mc-error-title">${esc(title)}</div>
    <div class="mc-error-msg">${esc(message || 'Something went wrong. Try again.')}</div>
    <div class="mc-error-actions">
      ${onRetry ? `<button type="button" class="mc-error-retry">${esc(retryLabel)}</button>` : ''}
      <button type="button" class="mc-error-dismiss">Dismiss</button>
    </div>`;
  if (onRetry) box.querySelector('.mc-error-retry').addEventListener('click', () => { box.remove(); onRetry(); });
  box.querySelector('.mc-error-dismiss').addEventListener('click', () => box.remove());
  if (replace) host.innerHTML = '';
  host.appendChild(box);
  return box;
}

/**
 * Counts up while a slow call runs, so a 60-second wait reads as progress
 * rather than as a hang. `render(seconds)` returns the text to show.
 * Returns a stop function.
 */
export function startElapsed(el, render) {
  if (!el) return () => {};
  const t0 = Date.now();
  const tick = () => { el.textContent = render(Math.round((Date.now() - t0) / 1000)); };
  tick();
  const iv = setInterval(tick, 1000);
  return () => clearInterval(iv);
}

/**
 * An in-app choice, styled like the rest of the app (window.confirm is
 * unstyled and offers only two answers). Resolves with the chosen action's
 * value, or null if dismissed with Escape or a click outside.
 */
export function confirmDialog({ title, body, actions }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'mc-dialog-overlay';
    overlay.innerHTML = `<div class="mc-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-dialog-title">
      <h3 id="mc-dialog-title">${esc(title)}</h3>
      <p>${esc(body)}</p>
      <div class="mc-dialog-actions">
        ${actions.map((a, i) => `<button type="button" data-i="${i}" class="${a.primary ? 'mc-dialog-primary' : a.danger ? 'mc-dialog-danger' : 'mc-dialog-secondary'}">${esc(a.label)}</button>`).join('')}
      </div>
    </div>`;
    const done = (v) => { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) return done(null);
      const b = e.target.closest('button[data-i]');
      if (b) done(actions[+b.dataset.i].value);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('.mc-dialog-primary, button')?.focus();
  });
}

/* ─── LEGAL MODAL LOGIC ─── */
export function openLegalModal(type) {
  const modal = document.getElementById('legal-modal');
  const title = document.getElementById('lm-title');
  const body = document.getElementById('lm-body');
  if (!modal || !title || !body) return;
  
  if (type === 'terms') {
    title.textContent = 'Terms of Service';
    body.innerHTML = `
      <h3>1. Acceptance of Terms</h3>
      <p>By accessing MootCoach, you agree to be bound by these Terms of Service. Designed specifically for law students, legal professionals, and moot court competitors, our platform acts as an elite preparatory aide.</p>
      <h3>2. Academic Integrity</h3>
      <p>MootCoach is a training simulator, not a substitute for human legal counsel, verified case law, or original research. You agree to use the AI's feedback to supplement your own understanding and verify all precedents, citations, and constitutional provisions independently before using them in any competition or academic submission.</p>
      <h3>3. User Workspace & Intellectual Property</h3>
      <p>Your workspace is strictly yours. The propositions, oral scripts, and strategic arguments you upload or generate belong to you. We respect the highly competitive nature of mooting and do not use your private competition strategies to train public models or share them with opposing teams.</p>
      <h3>4. Limitation of Liability</h3>
      <p>Under no circumstances will MootCoach be liable for the outcome of any moot court competition, academic grading, or real-world litigation based on the feedback provided by this platform.</p>
    `;
  } else if (type === 'privacy') {
    title.textContent = 'Privacy Policy';
    body.innerHTML = `
      <h3>1. Absolute Confidentiality</h3>
      <p>We understand that moot propositions and memorial strategies are highly classified prior to the competition date. MootCoach employs strict data isolation. Your uploads are processed securely for analysis and saved only to your private, authenticated cloud database.</p>
      <h3>2. Information Collection</h3>
      <p>We collect essential account information (Email, Name, Law School) to provide you with a personalized dashboard. We store the analysis results of your uploaded propositions solely so you can retrieve your history seamlessly across devices.</p>
      <h3>3. AI Processing & Third Parties</h3>
      <p>To analyse a proposition we send its text to our AI providers &mdash; Groq and Google (Gemini) &mdash; for processing. Nothing is sold, and nothing is shared with anyone else.</p>
      <p>What those providers may retain is governed by their terms rather than ours, and depends on the plan MootCoach runs on. If your proposition is under embargo, treat uploading it as you would treat sending it to any service outside your team, and check your competition&rsquo;s rules first.</p>
      <h3>4. Data Control</h3>
      <p>You retain full control over your data. You reserve the right to completely wipe your workspace. If you require a complete account deletion, please contact our support team.</p>
    `;
  }
  
  body.scrollTop = 0;
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

// Esc closes the Terms/Privacy dialog, as it does every other dialog.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('legal-modal')?.classList.contains('show')) closeLegalModal();
});

export function closeLegalModal(e) {
  if (e && e.target !== document.getElementById('legal-modal')) return;
  document.getElementById('legal-modal')?.classList.remove('show');
  if (document.querySelector('.view.active')?.id !== 'view-workspace') {
    document.body.style.overflow = 'auto';
  }
}

export function getFriendlyError(code) {
  switch(code) {
    case 'auth/wrong-password': 
    case 'auth/invalid-credential':
      return "Incorrect email or password. Please try again.";
    case 'auth/user-not-found': 
      return "No account found with this email.";
    case 'auth/invalid-email': 
      return "That email address is not valid.";
    case 'auth/email-already-in-use': 
      return "This email is already registered. Please log in.";
    case 'auth/weak-password': 
      return "Use a password of at least 8 characters.";
    case 'auth/too-many-requests':
      return "Too many attempts. Wait a few minutes, or reset your password.";
    case 'auth/network-request-failed':
      return "Couldn't reach the sign-in service. Check your connection and try again.";
    case 'auth/user-disabled':
      return "This account has been disabled.";
    case 'auth/missing-email':
      return "Enter your email address.";
    case 'auth/account-exists-with-different-credential':
      return "This email is registered with a password. Sign in with your password instead.";
    case 'auth/popup-blocked':
      return "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";
    default: 
      return "An authentication error occurred. Please try again.";
  }
}

export function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4);
    obj.innerHTML = Math.floor(ease * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.innerHTML = end; 
    }
  };
  window.requestAnimationFrame(step);
}

export function toggleMobileSidebar() {
  const sidebar = document.getElementById('ws-sidebar');
  const overlay = document.getElementById('ws-sidebar-overlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.toggle('show');
  overlay.classList.toggle('show');
}

export function navigate(view) {
  // Firebase has not said yet whether someone is signed in (the first second
  // or so after a load). Showing the sign-in form now flashed it at signed-in
  // users and then dropped them on the landing page, so the click looked
  // dead. Remember the intent; the auth observer finishes it.
  if ((view === 'workspace' || view === 'login') && !currentUser && !hasCheckedAuth) {
    window.__openWorkspaceOnSignIn = true;
    window.__pendingAuthView = view;
    return;
  }
  if (view === 'workspace' && !currentUser) {
    // Show Auth UI overlay
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.classList.add('show');
      overlay.classList.remove('opacity-0', 'pointer-events-none');
    }
    return;
  }
  if (view === 'login') {
    if (currentUser) {
      view = 'workspace';
    } else {
      // Show Auth UI overlay
      const overlay = document.getElementById('auth-overlay');
      if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('show');
        overlay.classList.remove('opacity-0', 'pointer-events-none');
      }
      return;
    }
  }

  // Hide Auth UI overlay when navigating elsewhere
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.classList.add('opacity-0', 'pointer-events-none', 'hidden');
  }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById('view-' + view);
  // #view-workspace starts with class="view hidden" in the raw HTML, and
  // .hidden is `display:none !important` — that always wins over
  // .view.active{display:flex} until .hidden is explicitly removed. This
  // used to happen as a side effect of the old auto-navigate-on-login code;
  // now that that's gone, navigate() itself has to be the one place that
  // reliably clears it, or the workspace can never become visible again.
  if (targetView) {
    targetView.classList.add('active');
    targetView.classList.remove('hidden');
  }
  
  document.body.style.overflow = (view === 'workspace') ? 'hidden' : 'auto';
  window.scrollTo(0, 0);
  if (view === 'workspace') {
    triggerBackendCheck();
    // Locked/ticked steps and the Next button reflect what is loaded from
    // the moment the workspace opens, not only after the first stage change.
    refreshStepper();
    // The list loads on sign-in; if that read was lost (token lag right after
    // a load), entering the workspace fetches it again.
    const recent = document.getElementById('ws-recent-list');
    if (currentUser && recent && !recent.children.length) loadRecentSessions();
    const nextBtn = document.getElementById('wizard-next-btn');
    if (nextBtn && currentStage === 1) nextBtn.style.display = (window.lastAnalysis || lastAnalysis) ? 'block' : 'none';
  }

  // Passively update URL hash for Microsoft Clarity SPA route tracking
  const newHash = `#view/${view}`;
  if (window.location.hash !== newHash) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, null, newHash);
    } else {
      window.location.hash = newHash;
    }
  }
}

export async function triggerBackendCheck() {
  const statusEl = document.getElementById('backend-status');
  const labelEl  = document.getElementById('bs-label');
  if (!statusEl || !labelEl) return;
  
  statusEl.className = 'backend-status checking';
  labelEl.textContent = 'Checking server…';
  
  const online = await checkBackendHealth();
  if (online) {
    statusEl.className = 'backend-status online';
    labelEl.textContent = '● Server Online';
  } else {
    statusEl.className = 'backend-status offline';
    labelEl.textContent = '● Server Offline';
  }
}

export function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  const tabL = document.getElementById('tab-login');
  const tabS = document.getElementById('tab-signup');
  if (tabL) tabL.classList.toggle('active', isLogin);
  if (tabS) tabS.classList.toggle('active', !isLogin);
  
  const formL = document.getElementById('form-login');
  const formS = document.getElementById('form-signup');
  if (formL) formL.style.display = isLogin ? '' : 'none';
  if (formS) formS.style.display = isLogin ? 'none' : '';
  
  const noteL = document.getElementById('note-login');
  const noteS = document.getElementById('note-signup');
  if (noteL) noteL.style.display = isLogin ? '' : 'none';
  if (noteS) noteS.style.display = isLogin ? 'none' : '';
  
  const successMsg = document.getElementById('auth-success');
  if (successMsg) successMsg.style.display = 'none';
}

export function setLoading(btnId, on, txt) {
  const b = document.getElementById(btnId);
  if (!b) return;
  b.disabled = on;
  b.innerHTML = on ? '<span class="spinner"></span>Please wait…' : txt;
}

export function markErr(id, has) { document.getElementById(id)?.classList.toggle('err', has); }
export function showHint(id, show) { document.getElementById(id)?.classList.toggle('show', show); }

export function showAuthSuccess() {
  const formL = document.getElementById('form-login');
  const formS = document.getElementById('form-signup');
  const authS = document.getElementById('auth-success');
  const noteL = document.getElementById('note-login');
  const noteS = document.getElementById('note-signup');
  
  if (formL) formL.style.display  = 'none';
  if (formS) formS.style.display = 'none';
  if (authS) authS.style.display = 'block';
  if (noteL) noteL.style.display  = 'none';
  if (noteS) noteS.style.display = 'none';
}

/**
 * Clear every stage of the moot that was open, so the next one starts from
 * nothing. New Analysis used to switch to the upload panel and leave the old
 * analysis loaded underneath: Issues, Advocacy and the Simulator kept
 * showing it, and the stepper kept ticking it.
 */
export function resetWorkspace() {
  // Nothing from the moot being closed may be saved over the next one.
  if (window.pauseMootProgress) window.pauseMootProgress();
  clearChambersBriefing();
  if (window.loadMootFeedback) window.loadMootFeedback(null);
  lastAnalysis = '';
  currentPropositionContext = '';
  if (window.lastAnalysis) window.lastAnalysis = '';
  window.forumIntelligence = null;
  window.detectedForum = null;
  if (window.mootState) Object.assign(window.mootState, {
    issueIndex: 0, issueText: '', issueChosen: false, roundMarked: false,
    authorities: [], memorialDraft: '', oralSubmission: '', strategicNotes: '', plan: null,
  });
  // The side went unreset, so one moot's Respondent carried into the next.
  // Back to the default, marked as not chosen: nothing is checked against a
  // side the advocate never picked.
  if (typeof window.setIwStance === 'function') window.setIwStance('petitioner');
  if (window.mootState) { window.mootState.stance = 'Petitioner'; window.mootState.stanceChosen = false; }
  // The Oral Coach box kept one moot's argument for the next.
  const oralBox = document.getElementById('oral-argument-input');
  if (oralBox) { oralBox.value = ''; oralBox.dispatchEvent(new Event('input', { bubbles: true })); }
  // Nor may its bench carry over; a moot with a saved bench gets it back on restore.
  if (typeof window.setOralDifficulty === 'function') window.setOralDifficulty('easy');
  if (typeof window.resetBuilderState === 'function') window.resetBuilderState();
  if (typeof window.clearBenchSession === 'function') window.clearBenchSession();
  ['analysis-output', 'stage-2-extracted-issues-list', 'ws-issue-list', 'oral-results-content']
    .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  const oral = document.getElementById('oral-results-area');
  if (oral) oral.style.display = 'none';
  const stack = document.getElementById('ws-issue-stack');
  if (stack) stack.style.display = 'none';
  updateWsMootName('');
  const file = document.getElementById('wsib-file');
  if (file) { file.textContent = 'No file uploaded'; file.className = 'wsib-value empty'; }
  refreshStepper();
}
window.resetWorkspace = resetWorkspace;

/**
 * A clean upload screen. "File your first proposition" used to reveal the
 * workspace as it was last left - an old analysis, scrolled halfway down,
 * with the old moot still highlighted in the sidebar.
 */
export function startNewAnalysis() {
  if (!currentUser) { navigate('login'); return; }
  navigate('workspace');
  document.querySelectorAll('#ws-recent-list .ws-sb-item').forEach(b =>
    b.classList.remove('active', 'bg-moot-accent/10', 'text-moot-accent'));
  window.currentMootDocId = null;
  window.currentMootName = '';
  resetWorkspace();
  if (typeof window.removeFile === 'function') window.removeFile();
  const nameInput = document.getElementById('ws-moot-name');
  if (nameInput) nameInput.value = '';
  updateWsMootName('');
  showWsPanel('upload');
  const up = document.getElementById('wsp-upload');
  if (up) up.scrollTop = 0;
}
window.startNewAnalysis = startNewAnalysis;

export function showWsPanel(name, buttonEl) {
  if (name === 'upload') {
    const uploadEl = document.getElementById('wsp-upload');
    const resultsEl = document.getElementById('wsp-results');
    if (uploadEl) {
      uploadEl.classList.add('active');
      uploadEl.classList.remove('hidden');
    }
    if (resultsEl) {
      resultsEl.classList.remove('active');
      resultsEl.classList.add('hidden');
    }
    goToStage(1);
  } else if (name === 'results') {
    const uploadEl = document.getElementById('wsp-upload');
    const resultsEl = document.getElementById('wsp-results');
    if (uploadEl) {
      uploadEl.classList.remove('active');
      uploadEl.classList.add('hidden');
    }
    if (resultsEl) {
      resultsEl.classList.add('active');
      resultsEl.classList.remove('hidden');
    }
    goToStage(1);
  } else if (name === 'builder') {
    goToStage(3);
  } else if (name === 'oral') {
    goToStage(4);
  } else if (name === 'bench') {
    goToStage(5);
  }
}

export function updateWsMootName(val) {
  const nameEl = document.getElementById('ws-topbar-name');
  if (nameEl) nameEl.innerHTML = val.trim() ? `<strong>${val.trim()}</strong>` : 'Active Docket';
  const wsibMoot = document.getElementById('wsib-moot');
  if (wsibMoot) {
    wsibMoot.textContent = val.trim() || 'Not set';
    wsibMoot.className = 'wsib-value' + (val.trim() ? '' : ' empty');
  }
  const resMoot = document.getElementById('res-moot-title');
  if (resMoot) resMoot.textContent = val.trim() || 'Proposition Briefing';
}

// Decoupled upload logic is now managed inside components/dashboard.js

/**
 * A name a person can tell apart from their other moots.
 *
 * Every upload without a typed name was saved as "Untitled Moot", so a list
 * of five read "Untitled Moot" five times. In order: the name they typed,
 * the case name the analysis found, an "X v. Y" title in the summary, then
 * the file name. Also applied when listing moots saved before this existed.
 */
export function deriveMootName({ mootName, fileName, analysisData, propositionIntelligence } = {}) {
  const typed = String(mootName || '').trim();
  if (typed && !/^untitled( moot| analysis)?$/i.test(typed)) return typed;
  const pi = propositionIntelligence || {};
  const cn = (pi.caseMetadata && pi.caseMetadata.caseName) || pi.caseName
    || (analysisData && analysisData.caseMetadata && analysisData.caseMetadata.caseName);
  if (cn && String(cn).trim()) return String(cn).trim().slice(0, 90);
  const summary = (analysisData && analysisData.summary) || '';
  // A party: capitalised words, joined only by of/the/and/for.
  const party = "[A-Z][\\w.'&-]*(?:\\s+(?:(?:of|the|and|for)\\s+)?[A-Z][\\w.'&-]*){0,5}";
  const vs = String(summary).match(new RegExp('(' + party + ')\\s+vs?\\.?\\s+(' + party + ')'));
  if (vs) {
    const first = vs[1].replace(/^(?:In|The|This|That|Whether|Under|After|Before)\s+/, '');
    return (first + ' v. ' + vs[2]).replace(/\s+/g, ' ').trim().slice(0, 90);
  }
  const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (base) return base.replace(/\bv\b/g, 'v.').slice(0, 90);
  return 'Untitled Moot';
}
window.deriveMootName = deriveMootName;

let recentLoading = null;
export function loadRecentSessions() {
  if (!recentLoading) recentLoading = loadRecentSessionsOnce().finally(() => { recentLoading = null; });
  return recentLoading;
}
async function loadRecentSessionsOnce(attempt = 0) {
  if (!currentUser) return;
  const sec = document.getElementById('ws-recent-section');
  const list = document.getElementById('ws-recent-list');
  if(!sec || !list) return;

  try {
    // Force the ID token to be fully resolved/attached before reading —
    // right after a fresh sign-in or page load, Firestore's own internal
    // auth listener can lag slightly behind currentUser being set, and a
    // read fired in that gap fails with "Missing or insufficient
    // permissions" even though the rules and uid are correct.
    await currentUser.getIdToken();
    const snapshot = await db.collection('artifacts').doc('moot.coach')
      .collection('users').doc(currentUser.uid).collection('analyses')
      // 50, not 6: older moots used to fall off the list with no way back.
      .orderBy('timestamp', 'desc').limit(50).get();
      
    if (snapshot.empty) {
      sec.style.display = 'none';
      return;
    }
    
    sec.style.display = 'flex';
    /* The upload date beside each name: the same proposition uploaded twice
       gave two identical entries with no way to tell them apart. When two
       share a name and a day, the time is added too. */
    const rows = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      let when = null;
      try { when = d.timestamp && d.timestamp.toDate ? d.timestamp.toDate() : (d.timestamp ? new Date(d.timestamp) : null); } catch (e) {}
      if (when && isNaN(when)) when = null;
      rows.push({ id: doc.id, title: deriveMootName(d), when });
    });
    const sameYear = (dt) => dt.getFullYear() === new Date().getFullYear();
    const dayLabel = (dt) => dt.toLocaleDateString(undefined, sameYear(dt) ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
    const timeLabel = (dt) => dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const dayKey = (r) => r.when ? r.title + '|' + r.when.toDateString() : null;
    const clash = {};
    rows.forEach(r => { const k = dayKey(r); if (k) clash[k] = (clash[k] || 0) + 1; });
    let html = '';
    rows.forEach(r => {
      const short = r.when ? dayLabel(r.when) + (clash[dayKey(r)] > 1 ? ', ' + timeLabel(r.when) : '') : '';
      const full = r.when ? `${r.when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${timeLabel(r.when)}` : '';
      const label = full ? `${r.title} — uploaded ${full}` : r.title;
      html += `<div class="ws-recent-row">
        <button class="ws-sb-item" onclick="loadSavedSession('${r.id}')" title="${esc(label)}">
          <span class="ws-sb-icon">▤</span>
          <span style="display:flex;flex-direction:column;min-width:0;flex:1;text-align:left;line-height:1.25;">
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(r.title)}</span>
            ${short ? `<span class="ws-recent-date" style="font-size:10px;color:var(--white-muted);white-space:nowrap;letter-spacing:.02em;">${esc(short)}</span>` : ''}
          </span>
        </button>
        <button type="button" class="ws-recent-del" onclick="deleteSavedSession('${r.id}')" aria-label="Delete ${esc(label)}" title="Delete this moot">&times;</button>
      </div>`;
    });
    list.innerHTML = html;
  } catch (e) {
    // Right after a load Firestore's auth can lag the user object; one quiet
    // retry covers that before anything is shown.
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
      return loadRecentSessionsOnce(attempt + 1);
    }
    console.error("Failed to load history", e);
    showToast("Failed to load history: " + e.message, "err");
  }
}

/**
 * Delete a saved moot, after asking. There was no way to remove one, though
 * the privacy text promises the user can wipe their workspace.
 */
export async function deleteSavedSession(docId) {
  if (!currentUser || !docId) return;
  const row = document.querySelector(`#ws-recent-list button[onclick*="${docId}"]`);
  const title = row ? row.getAttribute('title') : 'this moot';
  const choice = await confirmDialog({
    title: 'Delete this moot?',
    body: `"${title}" and its analysis will be removed from your account. This cannot be undone.`,
    actions: [
      { label: 'Delete moot', value: 'delete', danger: false, primary: true },
      { label: 'Keep it', value: null },
    ],
  });
  if (choice !== 'delete') return;
  try {
    // A pending save or feedback write for this moot would recreate its
    // documents under the deleted analysis.
    if (window.currentMootDocId === docId) {
      if (window.pauseMootProgress) window.pauseMootProgress();
      if (window.loadMootFeedback) window.loadMootFeedback(null);
    }
    const userDoc = db.collection('artifacts').doc('moot.coach').collection('users').doc(currentUser.uid);
    const analysis = userDoc.collection('analyses').doc(docId);
    // Firestore does not delete sub-collections with their parent: remove the
    // moot's saved drafts and the stored proposition explicitly.
    try {
      const drafts = await analysis.collection('advocacy').get();
      await Promise.all(drafts.docs.map(d => d.ref.delete()));
    } catch (e) { console.warn('Drafts not removed:', e); }
    try { await userDoc.collection('propositions').doc(docId).delete(); } catch (e) { console.warn('Proposition copy not removed:', e); }
    await analysis.delete();
    if (window.currentMootDocId === docId) startNewAnalysis();
    await loadRecentSessions();
    showToast('Moot deleted.', 'ok');
  } catch (e) {
    showToast('Could not delete the moot: ' + e.message, 'err');
  }
}
window.deleteSavedSession = deleteSavedSession;

export async function loadSavedSession(docId) {
  console.log("[DEBUG] loadSavedSession invoked with docId:", docId);
  // On a phone the moot list is a drawer; picking a moot closes it.
  const sbEl = document.getElementById('ws-sidebar');
  if (sbEl && sbEl.classList.contains('show')) toggleMobileSidebar();
  // Reopening the moot already open keeps its unsaved draft; any other moot
  // starts clean.
  const previousDocId = window.currentMootDocId;
  if (window.pauseMootProgress) window.pauseMootProgress();
  console.trace("[DEBUG] loadSavedSession trace");
  
  if (docId && typeof docId === 'string') {
    window.currentMootDocId = docId;
  }
  
  if (!currentUser) return;
  
  // Failsafe in case it's passed a click event instead of docId string
  if (docId && typeof docId === 'object' && docId.target) {
    const btn = docId.target.closest('.ws-sb-item');
    const onclickAttr = btn ? btn.getAttribute('onclick') : '';
    const match = onclickAttr ? onclickAttr.match(/loadSavedSession\('([^']+)'\)/) : null;
    docId = match ? match[1] : null;
    if (docId && typeof docId === 'string') {
      window.currentMootDocId = docId;
    }
  }
  if (!docId || typeof docId !== 'string') return;

  document.getElementById('loading-overlay').classList.add('show');
  
  const stepsDiv = document.querySelector('.lo-steps');
  const labelEl = document.getElementById('lo-label');
  if (stepsDiv) stepsDiv.style.display = 'none';
  if (labelEl) labelEl.textContent = 'Loading saved analysis...';
  
  try {
    // See loadRecentSessions() for why this goes first.
    await currentUser.getIdToken();
    const doc = await getWithReconnect(db.collection('artifacts').doc('moot.coach')
      .collection('users').doc(currentUser.uid).collection('analyses').doc(docId), labelEl);
      
    if (!doc.exists) throw new Error("Analysis not found.");
    
    const data = doc.data();
    // A different moot: nothing chosen, drafted or argued in it yet. Without
    // this, one moot's draft and authorities followed you into the next.
    if (previousDocId !== docId) resetWorkspace();
    window.currentMootName = deriveMootName(data);
    updateWsMootName(window.currentMootName);
    
    const wsibFile = document.getElementById('wsib-file');
    if (wsibFile) {
      wsibFile.textContent = data.fileName || 'Saved Document';
      wsibFile.className = 'wsib-value';
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    hideLoading();
    if (stepsDiv) stepsDiv.style.display = 'flex'; 
    
    // Restore forum context so the Simulator adapts (judges vs arbitrators) on reload.
    if (data.forumIntelligence) window.forumIntelligence = data.forumIntelligence;
    if (data.detectedForum) window.detectedForum = data.detectedForum;

    // NEW: Populate Issue Stack (Sprint 2A)
    const issueModule = await import('./issueWorkspace.js');
    issueModule.populateIssueStack(data);

    if (data.analysisData) {
      showStructuredResults(data.analysisData);
      
      // Highlight ONLY the selected recent moot — clear any previous highlight first.
      document.querySelectorAll('#ws-recent-list .ws-sb-item').forEach(b =>
        b.classList.remove('active', 'bg-moot-accent/10', 'text-moot-accent'));
      const recentBtn = document.querySelector(`#ws-recent-list button[onclick*="${docId}"]`)
        || document.querySelector(`button[onclick*="${docId}"]`);
      if (recentBtn) {
        recentBtn.classList.add('active', 'bg-moot-accent/10', 'text-moot-accent');
      }
    } else {
      showError("Invalid saved data.");
    }
    // Put every stage back where this moot was left: issue, side, the
    // structured draft and any prepared briefing (services/mootProgress.js).
    if (window.restoreMootProgress) await window.restoreMootProgress(docId);
  } catch (e) {
    hideLoading();
    if (stepsDiv) stepsDiv.style.display = 'flex'; 
    if (isConnectionError(e)) { showOpenError(docId); return; }
    showError("Could not load saved session: " + e.message);
    showToast("Failed to load saved session: " + e.message, "err");
  }
}

/* ─── RENDERERS & UTILS ─── */
export const SECTION_CONFIGS = {
  summary:      { icon:'◈', iconCls:'asc-icon-gold',   badgeTxt:'Overview',   badgeCls:'badge-gold',   title:'Case Summary'                 },
  legal:        { icon:'⚖︎', iconCls:'asc-icon-blue',   badgeTxt:'Issues',     badgeCls:'badge-blue',   title:'Issues Framed in the Proposition' },
  petitioner:   { icon:'▲', iconCls:'asc-icon-green',  badgeTxt:'Applicant',  badgeCls:'badge-green',  title:'Petitioner Arguments'         },
  respondent:   { icon:'▼', iconCls:'asc-icon-red',    badgeTxt:'Opposition', badgeCls:'badge-red',    title:'Respondent Arguments'         },
  cases:        { icon:'◉', iconCls:'asc-icon-purple', badgeTxt:'Precedents', badgeCls:'badge-purple', title:'Cases & Precedents'           },
  constitution: { icon:'§', iconCls:'asc-icon-teal',   badgeTxt:'Law',        badgeCls:'badge-teal',   title:'Constitutional Provisions'    },
  score:        { icon:'◎', iconCls:'asc-icon-gold',   badgeTxt:'Score',      badgeCls:'badge-gold',   title:'Moot Readiness Score'         },
  oral:         { icon:'♦', iconCls:'asc-icon-blue',   badgeTxt:'Oral',       badgeCls:'badge-blue',   title:'Oral Round Difficulty'        },
  research:     { icon:'◈', iconCls:'asc-icon-purple', badgeTxt:'Research',   badgeCls:'badge-purple', title:'Research Complexity'          },
  strategy:     { icon:'✦', iconCls:'asc-icon-gold',   badgeTxt:'Strategy',   badgeCls:'badge-gold',   title:'Strategic Insights'           },
  default:      { icon:'◎', iconCls:'asc-icon-gold',   badgeTxt:'Section',    badgeCls:'badge-gold',   title:''                             },
  bench:        { icon:'⚑', iconCls:'asc-icon-blue',   badgeTxt:'Bench',      badgeCls:'badge-blue',   title:'Bench Questions'              },
  vulnerability:{ icon:'◬', iconCls:'asc-icon-red',    badgeTxt:'Risk',       badgeCls:'badge-red',    title:'Bench Vulnerabilities'        },
  missing:      { icon:'◌', iconCls:'asc-icon-purple', badgeTxt:'Gaps',       badgeCls:'badge-purple', title:'Missing Legal Angles'         },
  addIssues:    { icon:'✛', iconCls:'asc-icon-green',  badgeTxt:'Extra Marks',badgeCls:'badge-green',  title:'Additional Issues You Can Raise' },
  argDefects:   { icon:'◬', iconCls:'asc-icon-red',    badgeTxt:'Defects',    badgeCls:'badge-red',    title:'Argument Defect Analysis'  },
};

export function classifySection(heading) {
  const h = heading.toLowerCase();
  if (/summary/.test(h))                                 return 'summary';
  if (/legal.issue|^issue/.test(h))                      return 'legal';
  if (/petitioner|appellant|claimant/.test(h))           return 'petitioner';
  if (/respondent|defendant/.test(h))                    return 'respondent';
  if (/case|precedent|judgment|citation/.test(h))        return 'cases';
  if (/constitution|provision|article|statute/.test(h))  return 'constitution';
  if (/readiness|moot.score|score/.test(h))              return 'score';
  if (/oral|hearing|difficulty/.test(h))                 return 'oral';
  if (/research|complex/.test(h))                        return 'research';
  if (/strateg|insight|tip|tactical|recommend/.test(h))  return 'strategy';
  if (/bench.question|bench.quer/.test(h))               return 'bench';
  if (/vulnerabilit/.test(h))                            return 'vulnerability';
  if (/missing|gap|angle/.test(h))                       return 'missing';
  if (/strength/.test(h))                                return 'strengths';
  if (/weakness|weak.point/.test(h))                     return 'weaknesses';
  if (/scoring|breakdown|category/.test(h))              return 'scoring';
  if (/defect|flaw|weak.arg/.test(h))                    return 'argDefects';
  return 'default';
}

export function parseAnalysisSections(rawText) {
  const sections = [];
  const boldNum = [...rawText.matchAll(/\n\s*\*{1,2}(\d+)[.)]\s*([^*\n]{3,80}?)\*{0,2}\s*\n/g)];
  if (boldNum.length >= 3) {
    boldNum.forEach((m, i) => {
      const start = m.index + m[0].length;
      const end   = i + 1 < boldNum.length ? boldNum[i+1].index : rawText.length;
      sections.push({ num: +m[1], heading: m[2].trim(), content: rawText.slice(start, end).trim() });
    });
    return sections;
  }
  const plainNum = [...rawText.matchAll(/\n(\d+)[.)]\s+([^\n]{3,60})\n/g)];
  if (plainNum.length >= 3) {
    plainNum.forEach((m, i) => {
      const start = m.index + m[0].length;
      const end   = i + 1 < plainNum.length ? plainNum[i+1].index : rawText.length;
      sections.push({ num: +m[1], heading: m[2].replace(/\*+/g,'').trim(), content: rawText.slice(start, end).trim() });
    });
    return sections;
  }
  const mdHeads = [...rawText.matchAll(/\n#{1,3}\s+([^\n]+)\n/g)];
  if (mdHeads.length >= 2) {
    mdHeads.forEach((m, i) => {
      const start = m.index + m[0].length;
      const end   = i + 1 < mdHeads.length ? mdHeads[i+1].index : rawText.length;
      sections.push({ num: i+1, heading: m[1].replace(/\*+/g,'').trim(), content: rawText.slice(start, end).trim() });
    });
    return sections;
  }
  return [{ num: 1, heading: 'Full Analysis', content: rawText }];
}

export function extractScore(sections) {
  const s = sections.find(x => classifySection(x.heading) === 'score');
  if (!s) return null;
  const m = s.content.match(/(\d{1,3})\s*(?:\/\s*100|out of 100|\s*%)/i);
  return m ? Math.min(100, +m[1]) : null;
}

export function getDiffLevel(content) {
  const t = content.toLowerCase();
  if (/high|difficult|complex|challenging|hard/.test(t))   return 'high';
  if (/low|easy|simple|straightforward/.test(t))           return 'low';
  return 'medium';
}

export function fmtInline(text) {
  if (!text) return '';
  let t = String(text);


  // Escape HTML characters (excluding our newly added HTML tags, so do escaping first or be careful)
  let escaped = t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  
  // Re-run the heading replacements on the escaped text to ensure tags work
  escaped = escaped.replace(/^\s*#{5,6}\s*(.+)$/gm, '<h6 style="font-family:var(--font-sans, Arial); font-size:11px; font-weight:bold; letter-spacing:0.04em; color:var(--white-2); margin-top:10px; margin-bottom:4px; text-transform:uppercase;">$1</h6>');
  escaped = escaped.replace(/^\s*####\s*(.+)$/gm, '<h5 style="font-family:var(--font-sans, Arial); font-size:12px; font-weight:bold; letter-spacing:0.06em; color:var(--white); margin-top:14px; margin-bottom:6px; text-transform:uppercase; border-bottom:1px solid rgba(28,23,16,0.05); padding-bottom:2px;">$1</h5>');
  escaped = escaped.replace(/^\s*###\s*(.+)$/gm, '<h4 style="font-family:var(--font-sans, Arial); font-size:14px; font-weight:bold; letter-spacing:0.08em; color:var(--moot-accent); margin-top:18px; margin-bottom:8px; text-transform:uppercase; border-bottom:1px solid rgba(28,23,16,0.1); padding-bottom:4px;">$1</h4>');
  escaped = escaped.replace(/^\s*##\s*(.+)$/gm, '<h3 style="font-family:var(--font-serif, Merriweather); font-size:16px; font-weight:normal; letter-spacing:0.1em; color:var(--moot-accent); margin-top:22px; margin-bottom:10px; text-transform:uppercase; border-bottom:2px double rgba(28,23,16,0.15); padding-bottom:6px;">$1</h3>');

  // Convert Bold/Italics markdown to HTML
  escaped = escaped.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/`([\s\S]+?)`/g, '<code style="background:rgba(28,23,16,.07);padding:1px 5px;border-radius:4px;font-size:.82em;color:var(--gold);">$1</code>');

  // Clean raw horizontal rules
  escaped = escaped.replace(/^\s*[-*_]{3,}\s*$/gm, '<hr style="border:none; border-top:1px solid rgba(28,23,16,0.1); margin:12px 0;">');

  // Clean robotic transitions and generic ChatGPT phrases
  escaped = escaped.replace(/\bFirstly,\s+/gi, 'First, ');
  escaped = escaped.replace(/\bSecondly,\s+/gi, 'Second, ');
  escaped = escaped.replace(/\bThirdly,\s+/gi, 'Third, ');
  escaped = escaped.replace(/\bLastly,\s+/gi, 'Finally, ');
  escaped = escaped.replace(/\bIn conclusion,\s+/gi, 'Consequently, ');
  escaped = escaped.replace(/\bIt is important to note that\s+/gi, '');
  escaped = escaped.replace(/\bMoreover,\s+/gi, 'Furthermore, ');
  escaped = escaped.replace(/\bFirst of all,\s+/gi, 'Initially, ');

  // Clean redundant IRAC headings inside contents
  escaped = escaped.replace(/^\s*(?:ISSUE|RULE|APPLICATION|CONCLUSION)\s*[:\-–—]*\s*$/gmi, '');

  // Orphan markdown asterisks left by the model ("Issue:*") and doubled punctuation (".:", ".".")
  escaped = escaped.replace(/(:|<\/strong>|<\/em>)\*+(?=\s|$)/gm, '$1');
  escaped = escaped.replace(/(^|\s)\*+(?=\s|$)/gm, '$1');
  escaped = escaped.replace(/([.!?]):(?=\s|$|<)/g, '$1');
  escaped = escaped.replace(/(?<!\.)\.\.(?!\.)/g, '.');
  escaped = escaped.replace(/\.(&quot;|"|”)\./g, '.$1');

  return escaped;
}

export function extractBullets(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  let cur = '';
  for (const line of lines) {
    const isBullet = /^[-•*◆→▶]/.test(line) || /^\d+[.)]\s/.test(line);
    if (isBullet) { if (cur) items.push(cur); cur = line.replace(/^[-•*◆→▶\d.)]\s*/,'').trim(); }
    else if (cur)  { cur += ' ' + line; }
    else           { items.push(line); }
  }
  if (cur) items.push(cur);
  return items.filter(x => x.length > 2);
}

export function renderBullets(content, bulletExtraCls = '') {
  const items = extractBullets(content);
  if (!items.length) return `<p style="font-size:.85rem;color:var(--white-2);line-height:1.75;padding:2px 0;">${fmtInline(content)}</p>`;
  return `<ul class="insight-list">${items.map(t=>`
    <li class="insight-item">
      <div class="insight-bullet ${bulletExtraCls}"></div>
      <div class="insight-text">${fmtInline(t)}</div>
    </li>`).join('')}</ul>`;
}

/* Citation checking (Harvey-style "every authority is sourced").
   The server only counts an authority as found when a web source backs it;
   see services/authorityVerifier.js. */
function citationBadge(v) {
  if (!v) return '';
  const src = (v.sources || [])[0];
  const link = src ? ` · <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.title)}</a>` : '';
  if (v.status === 'verified') return `<span class="cite-badge ok">✓ Found${link}</span>`;
  if (v.status === 'corrected') return `<span class="cite-badge fix">Corrected citation: ${esc(v.foundCitation || '')}${link}</span>`;
  return `<span class="cite-badge no">Not found — ${esc(v.note || 'check this before citing it.')}</span>`;
}

window.checkCaseCitations = async function () {
  const cases = window.__casesForCheck || [];
  const btn = document.getElementById('btn-check-citations');
  if (!cases.length || !btn) return;
  const list = cases.slice(0, 12).map(c => ({ name: c.caseName || '', citation: c.citation && c.citation !== 'Citation unverified' ? c.citation : '' }));
  btn.disabled = true; btn.textContent = 'Checking…';
  document.querySelectorAll('[data-cite-slot]').forEach((el, i) => { if (i < list.length && !cases[i].verification) el.innerHTML = '<span class="cite-badge wait">Checking…</span>'; });
  try {
    const forum = (lastAnalysis && lastAnalysis.detectedForum && lastAnalysis.detectedForum.forum) || '';
    const data = await requestJson('/api/verify-authorities', { body: { authorities: list, forum } });
    (data.results || []).forEach((v, i) => {
      cases[i].verification = v;
      const slot = document.querySelector(`[data-cite-slot="${i}"]`);
      if (slot) slot.innerHTML = citationBadge(v);
    });
    const found = (data.results || []).filter(v => v.status !== 'unverified').length;
    btn.textContent = `Checked: ${found} of ${list.length} found`;
    showToast(`${found} of ${list.length} citations found with a source.`, found === list.length ? 'ok' : 'warn');
  } catch (err) {
    document.querySelectorAll('[data-cite-slot]').forEach((el, i) => { if (!cases[i] || !cases[i].verification) el.innerHTML = ''; });
    btn.disabled = false; btn.textContent = 'Check these citations';
    showToast(err.message || 'Could not check the citations just now.', 'err');
  }
};

export function renderCases(content, rawCasesArray) {
  if (rawCasesArray && Array.isArray(rawCasesArray) && rawCasesArray.length && typeof rawCasesArray[0] === 'object') {
    return rawCasesArray.map((c, i) => {
      const n    = i + 1;
      const conf = c.confidenceLevel || 'medium';
      const borderStyle = conf === 'high' ? '' : conf === 'low' ? 'style="border-color:rgba(224,82,82,.2)"' : 'style="border-color:rgba(251,191,36,.2)"';
      const caveatHTML  = (c.caveat && c.caveat !== 'null' && c.caveat !== null)
        ? `<span style="font-size:.65rem;color:var(--gold);background:var(--gold-muted);border:1px solid var(--gold-border);border-radius:4px;padding:2px 7px;margin-top:5px;display:inline-block;">△ ${esc(String(c.caveat))}</span>`
        : '';
      const jBadge = c.jurisdiction
        ? `<span style="font-size:.6rem;color:var(--white-muted);background:rgba(28,23,16,.04);border:1px solid var(--glass-b);border-radius:3px;padding:1px 6px;margin-left:5px;">${esc(c.jurisdiction)}</span>`
        : '';
      const citationHTML = (c.citation && c.citation !== 'Citation unverified')
        ? `<div style="font-size:.7rem;color:var(--gold);opacity:.75;margin-bottom:4px;">${esc(c.citation)}</div>`
        : '';
      return `
      <div class="case-card" ${borderStyle}>
        <div class="case-num">${n < 10 ? '0'+n : n}</div>
        <div style="flex:1;min-width:0;">
          <div class="case-name">${fmtInline(c.caseName || 'Unknown')}${jBadge}</div>
          ${citationHTML}
          ${c.holdingRelevant ? `<div class="case-desc">${fmtInline(c.holdingRelevant)}</div>` : ''}
          ${caveatHTML}
          <div class="cite-check" data-cite-slot="${i}">${c.verification ? citationBadge(c.verification) : ''}</div>
        </div>
      </div>`;
    }).join('') + (window.__casesForCheck = rawCasesArray, `
      <div class="cite-check-bar">
        <button type="button" class="btn-sm" id="btn-check-citations" onclick="window.checkCaseCitations()">Check these citations</button>
        <span class="cite-check-hint">Searches the web for each case. An authority is marked found only when a source backs it.</span>
      </div>`);
  }
  const items = extractBullets(content);
  if (!items.length) return renderBullets(content, 'ib-purple');
  return items.map((line, i) => {
    const parts = line.split(/\s+[-–:]\s+/);
    const name  = parts[0];
    const desc  = parts.slice(1).join(' — ');
    const n     = i + 1;
    return `
    <div class="case-card">
      <div class="case-num">${n < 10 ? '0'+n : n}</div>
      <div>
        <div class="case-name">${fmtInline(name)}</div>
        ${desc ? `<div class="case-desc">${fmtInline(desc)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

export function renderProvisions(content) {
  const items = extractBullets(content);
  if (!items.length) return renderBullets(content);
  return `<div class="provision-tags">${items.map(t=>`
    <div class="provision-tag"><span class="provision-tag-sym">§</span>${fmtInline(t)}</div>`
  ).join('')}</div>`;
}

export function renderStrategy(content) {
  const items = extractBullets(content);
  if (!items.length) return `<div class="strategy-item">${fmtInline(content)}</div>`;
  return items.map(t=>`<div class="strategy-item">${fmtInline(t)}</div>`).join('');
}

export function renderDifficulty(content) {
  const level = getDiffLevel(content);
  const cls   = { high:'dp-high', medium:'dp-medium', low:'dp-low' }[level];
  const label = { high:'High Difficulty', medium:'Moderate Difficulty', low:'Low Difficulty' }[level];
  return `<div><span class="diff-pill ${cls}">${label}</span></div>${renderBullets(content)}`;
}

export function renderScoreBody(content, score) {
  if (score === null) return renderBullets(content);
  const pct  = Math.min(100, Math.max(0, score));
  const lbl  = pct >= 75 ? 'Strong Readiness' : pct >= 50 ? 'Moderate Readiness' : 'Needs Preparation';
  const bCls = pct >= 75 ? 'sf-green' : pct >= 50 ? 'sf-gold' : 'sf-red';
  return `
    <div style="display:flex;align-items:center;gap:24px;margin-bottom:20px;flex-wrap:wrap;">
      <div style="text-align:center;">
        <div style="font-family:var(--serif);font-size:4.5rem;font-weight:500;color:var(--gold);line-height:1;">${score}</div>
        <div style="font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--white-muted);margin-top:4px;">/ 100</div>
      </div>
      <div style="flex:1;min-width:160px;">
        <div style="font-size:.8rem;font-weight:500;color:var(--white);margin-bottom:10px;">${lbl}</div>
        <div class="sc-bar" style="height:5px;border-radius:3px;"><div class="sc-bar-fill ${bCls}" data-target="${pct}%" style="width:0%"></div></div>
        <div style="font-size:.7rem;color:var(--white-muted);margin-top:8px;">${pct}% moot-ready</div>
      </div>
    </div>
    ${renderBullets(content)}`;
}

export function renderSummaryBody(content) {
  const cleaned = fmtInline(content);
  return `
    <div class="summary-card">
      <div class="summary-quote">"</div>
      <div class="summary-body">${cleaned}</div>
    </div>`;
}

export function renderSectionBody(type, content, score) {
  switch(type) {
    case 'summary':      return renderSummaryBody(content);
    case 'legal':        return renderBullets(content,'ib-blue');
    case 'petitioner':   return renderBullets(content,'ib-green');
    case 'respondent':   return renderBullets(content,'ib-red');
    case 'cases':        return renderCases(content);
    case 'constitution': return renderProvisions(content);
    case 'score':        return renderScoreBody(content, score);
    case 'oral':
    case 'research':     return renderDifficulty(content);
    case 'strategy':     return renderStrategy(content);
    case 'bench':        return renderBullets(content,'ib-blue');
    case 'vulnerability':return renderBullets(content,'ib-red');
    case 'missing':      return renderBullets(content,'ib-purple');
    case 'addIssues':    return renderBullets(content,'ib-green');
    case 'argDefects':   return renderBullets(content,'ib-red');
    default:             return renderBullets(content);
  }
}

/**
 * Stage 1 summary of the suggested issues.
 *
 * Deliberately NOT the place to accept them. The analysis should show what
 * was found, but choosing which to argue is its own step - mixed in among
 * nine analysis cards, the decision gets scrolled past, and a suggestion
 * adopted without thought is one the bench will take apart.
 */
export function renderAdditionalIssues(list, framedCount) {
  const items = (list || []).filter(a => a && a.issue);
  if (!items.length) return '';

  const RISK_CLS = { Safe: 'badge-green', Arguable: 'badge-gold', Aggressive: 'badge-red' };
  const addedCount = items.filter(a => a.status === 'added').length;

  const rows = items.map(a => {
    const added = a.status === 'added';
    const dismissed = a.status === 'dismissed';
    const cls = RISK_CLS[a.confidence] || 'badge-gold';
    const mark = added ? '<span style="color:var(--acc-green);">\u2713</span> '
               : dismissed ? '<span style="color:var(--white-muted);">\u2014</span> ' : '';
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;'
      + 'padding:11px 14px;border:1px solid var(--glass-b);border-radius:9px;margin-bottom:9px;'
      + 'background:var(--glass);' + (dismissed ? 'opacity:.55;' : '') + '">'
      + '<div style="font-size:.83rem;line-height:1.6;color:var(--white-2);flex:1;">'
      + mark + fmtInline(String(a.issue)) + '</div>'
      + '<span class="asc-badge ' + cls + '" style="flex:0 0 auto;white-space:nowrap;">' + esc(a.confidence) + '</span>'
      + '</div>';
  }).join('');

  const fc = framedCount || 0;
  const intro = 'The proposition frames ' + fc + ' issue' + (fc === 1 ? '' : 's') + '. These '
    + items.length + ' are further issues its facts will carry but it never states. '
    + 'None of them is in your memorial or oral prep unless you add it.';

  const status = addedCount
    ? '<span style="color:var(--acc-green);">\u2713 ' + addedCount + ' added</span> \u00b7 review the rest in the Issue Workspace'
    : 'Decide which to argue in the Issue Workspace.';

  return '<div style="font-size:.78rem;color:var(--white-muted);line-height:1.68;margin-bottom:14px;">'
    + intro + '</div>'
    + rows
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;'
    +   'margin-top:14px;padding-top:13px;border-top:1px solid var(--glass-b);">'
    + '<div style="font-size:.76rem;color:var(--white-muted);line-height:1.6;">' + status + '</div>'
    + '<button class="btn-sm btn-sm-gold" onclick="window.goToStage(2)">Review in the Issue Workspace \u2192</button>'
    + '</div>';
}

export function buildScoreHero(sections) {
  const score   = extractScore(sections);
  const oralSec = sections.find(s => classifySection(s.heading) === 'oral');
  const resSec  = sections.find(s => classifySection(s.heading) === 'research');
  const oralD   = oralSec ? getDiffLevel(oralSec.content) : null;
  const resD    = resSec  ? getDiffLevel(resSec.content)  : null;

  if (score === null && !oralD && !resD) return '';

  const dlabel = { high:'High', medium:'Moderate', low:'Low' };
  const oralPct = oralD === 'high' ? 84 : oralD === 'medium' ? 52 : 26;
  const resPct  = resD  === 'high' ? 88 : resD  === 'medium' ? 56 : 28;

  const cards = [];
  if (score !== null) cards.push(`
    <div class="score-card">
      <div class="sc-label"><span class="sc-label-dot"></span>Moot Readiness</div>
      <div class="sc-value">${score}</div>
      <div class="sc-sub">out of 100</div>
      <div class="sc-bar"><div class="sc-bar-fill sf-gold" data-target="${score}%" style="width:0%"></div></div>
    </div>`);
  if (oralD) cards.push(`
    <div class="score-card">
      <div class="sc-label"><span class="sc-label-dot"></span>Oral Difficulty</div>
      <div class="sc-value" style="font-size:1.55rem;padding-top:8px;">${dlabel[oralD]}</div>
      <div class="sc-sub">${oralD === 'high' ? 'Intense bench expected' : oralD === 'medium' ? 'Moderate bench' : 'Accessible bench'}</div>
      <div class="sc-bar"><div class="sc-bar-fill sf-blue" data-target="${oralPct}%" style="width:0%"></div></div>
    </div>`);
  if (resD) cards.push(`
    <div class="score-card">
      <div class="sc-label"><span class="sc-label-dot"></span>Research Load</div>
      <div class="sc-value" style="font-size:1.55rem;padding-top:8px;">${dlabel[resD]}</div>
      <div class="sc-sub">${resD === 'high' ? 'Extensive research req.' : resD === 'medium' ? 'Standard research' : 'Lean research'}</div>
      <div class="sc-bar"><div class="sc-bar-fill sf-purple" data-target="${resPct}%" style="width:0%"></div></div>
    </div>`);

  while (cards.length < 3) cards.push('<div class="score-card" style="opacity:0;pointer-events:none;"></div>');
  return `<div class="score-hero">${cards.join('')}</div>`;
}

export function toggleSection(i) {
  const h = document.getElementById(`asc-h-${i}`);
  const b = document.getElementById(`asc-b-${i}`);
  if (!h || !b) return;
  const col = b.classList.contains('asc-collapsed');
  b.classList.toggle('asc-collapsed', !col);
  h.classList.toggle('asc-collapsed', !col);
}

export function copySectionText(i, btn) {
  const b = document.getElementById(`asc-b-${i}`);
  if (!b) return;
  navigator.clipboard.writeText(b.innerText).then(() => {
    btn.textContent = '✓ Copied'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

// Jumps land the section's heading just below the top of the scroll area
// (offsetTop is measured from a different ancestor, so headings ended up
// hidden or the next section showed). The clicked tab is marked at once and
// the scroll-spy waits until the smooth scroll has finished.
let spyPausedUntil = 0;
function markNav(i) {
  document.querySelectorAll('.rn-item').forEach(n => n.classList.toggle('active', n.id === `rn-${i}`));
  const btn = document.getElementById(`rn-${i}`);
  if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}
export function scrollToSection(i) {
  const el = document.getElementById(`asc-card-${i}`);
  const body = document.querySelector('.ws-results-panel .res-body');
  if (!el || !body) return;
  const top = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 16;
  spyPausedUntil = Date.now() + 900;
  markNav(i);
  body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

export function animateBars() {
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.sc-bar-fill[data-target]').forEach(el => {
        el.style.width = el.dataset.target;
      });
    }, 120);
  });
}

export function initScrollSpy() {
  const resBody = document.querySelector('.ws-results-panel .res-body');
  const navBtns = document.querySelectorAll('.rn-item');
  if (!resBody || !navBtns.length) return;
  if (resBody.dataset.spy) return;
  resBody.dataset.spy = '1';
  resBody.addEventListener('scroll', () => {
    if (Date.now() < spyPausedUntil) return;
    // The current section is the last one whose top has passed the top of
    // the scroll area (measured against the area, not a fixed 120px).
    const line = resBody.getBoundingClientRect().top + 40;
    let current = null;
    document.querySelectorAll('.analysis-section-card[id^="asc-card-"]').forEach(card => {
      if (card.getBoundingClientRect().top <= line) current = +card.id.replace('asc-card-', '');
    });
    if (current === null) current = 0;
    document.querySelectorAll('.rn-item').forEach(n => n.classList.toggle('active', n.id === `rn-${current}`));
  }, { passive: true });
}

export function showResults(rawText) {
  try {
    lastAnalysis = rawText;
    populateIssuesFromAnalysis();

    const sections   = parseAnalysisSections(rawText);
    const globalScore = extractScore(sections);
    const heroHTML   = buildScoreHero(sections);

    const navHTML = sections.map((s, i) => {
      const cfg = SECTION_CONFIGS[classifySection(s.heading)] || SECTION_CONFIGS.default;
      return `<button class="rn-item" id="rn-${i}" onclick="scrollToSection(${i})">${cfg.icon} ${s.heading}</button>`;
    }).join('');

    const HERO_TYPES = new Set(['score','oral','research']);
    const cardsHTML  = sections.map((sec, i) => {
      const type  = classifySection(sec.heading);
      const cfg   = SECTION_CONFIGS[type] || SECTION_CONFIGS.default;
      const title = cfg.title || sec.heading;
      const body  = renderSectionBody(type, sec.content, globalScore);
      const startCollapsed = heroHTML && HERO_TYPES.has(type);
      const hCls  = startCollapsed ? ' asc-collapsed' : '';
      const bCls  = startCollapsed ? ' asc-collapsed' : '';
      const delay = `${i * 0.055}s`;

      return `
        <div class="analysis-section-card" id="asc-card-${i}" style="animation-delay:${delay}">
          <div class="asc-header${hCls}" id="asc-h-${i}" onclick="toggleSection(${i})">
            <div class="asc-header-left">
              <div class="asc-icon ${cfg.iconCls}">${cfg.icon}</div>
              <div class="asc-title">${title}</div>
            </div>
            <div class="asc-header-right">
              <span class="asc-badge ${cfg.badgeCls}">${cfg.badgeTxt}</span>
              <button class="asc-copy" onclick="event.stopPropagation();copySectionText(${i},this)">Copy</button>
              <span class="asc-chevron">▾</span>
            </div>
          </div>
          <div class="asc-body${bCls}" id="asc-b-${i}" style="padding:20px 22px;">${body}</div>
        </div>`;
    }).join('');

    document.getElementById('analysis-output').innerHTML = `
      <div class="result-grid">
        ${heroHTML}
        ${sections.length > 1 ? `<div class="result-divider"><span>Analysis Sections</span></div>` : ''}
        ${cardsHTML}
      </div>`;

    const navEl = document.getElementById('res-sticky-nav-inner');
    if (navEl) { navEl.innerHTML = navHTML; }

    document.getElementById('res-empty').style.display  = 'none';
    document.getElementById('res-filled').style.display = 'flex';
    showWsPanel('results');
    document.getElementById('analyze-submit-btn').disabled = false;

    setTimeout(() => { animateBars(); initScrollSpy(); }, 180);
  } catch (error) {
    console.error("Rendering Error:", error);
    alert("The analysis succeeded, but the UI failed to render. Check the console.");
    hideLoading();
    showWsPanel('upload');
  }
}

export function renderArgumentDefects(defectsData) {
  if (!defectsData || (!defectsData.petitioner?.length && !defectsData.respondent?.length)) {
    return `<div style="font-size:.82rem;color:#4caf82;padding:6px 0;">No significant argument defects identified in this proposition.</div>`;
  }

  const sevBorder = { fatal:'var(--gold)', significant:'var(--gold-light)', minor:'var(--rule)' };
  const sevStyle  = {
    fatal:       'background:rgba(224,82,82,.1);border:1px solid rgba(224,82,82,.28);color:var(--acc-red);',
    significant: 'background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.22);color:var(--acc-amber);',
    minor:       'background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.22);color:var(--acc-teal);'
  };

  const renderSideDefects = (items, label) => {
    if (!items || !items.length) return '';
    const rows = items.map(d => {
      const sev  = (d.severity || 'minor').toLowerCase();
      const bc   = sevBorder[sev] || sevBorder.minor;
      const bsty = sevStyle[sev]  || sevStyle.minor;
      return `
        <div style="margin-bottom:11px;padding:14px 16px;background:rgba(28,23,16,.02);border:1px solid var(--glass-b);border-left:3px solid ${bc};border-radius:0 9px 9px 0;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
            <div style="font-size:.78rem;font-weight:500;color:var(--white-2);flex:1;font-style:italic;">"${fmtInline(d.argument || '')}"</div>
            <div style="display:flex;gap:5px;flex-shrink:0;">
              <span style="font-size:.56rem;padding:2px 7px;border-radius:4px;letter-spacing:.08em;text-transform:uppercase;font-weight:500;${bsty}">${esc(sev)}</span>
              <span style="font-size:.56rem;padding:2px 7px;border-radius:4px;background:rgba(28,23,16,.04);border:1px solid var(--glass-b);color:var(--white-muted);">${esc((v => (/\s/.test(String(v||'')) ? String(v||'') : String(v||'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()).replace(/ ([A-Z])(?=[a-z])/g,(m,c)=>' '+c.toLowerCase())))(d.defectType))}</span>
            </div>
          </div>
          <div style="font-size:.79rem;color:var(--white-muted);line-height:1.67;">${fmtInline(d.explanation || '')}</div>
        </div>`;
    }).join('');
    return `
      <div style="margin-bottom:20px;">
        <div style="font-size:.6rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--white-muted);margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid var(--glass-b);">${label} Defects</div>
        ${rows}
      </div>`;
  };

  return renderSideDefects(defectsData.petitioner, 'Petitioner') +
         renderSideDefects(defectsData.respondent,  'Respondent');
}

export function showRejection(msg, documentType) {
  document.getElementById('analysis-output').innerHTML = `
    <div style="padding:36px 28px;">
      <div style="background:rgba(224,82,82,.06);border:1px solid rgba(224,82,82,.2);border-radius:16px;padding:32px 28px;max-width:620px;margin:0 auto;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:36px;height:36px;border-radius:9px;background:rgba(224,82,82,.12);border:1px solid rgba(224,82,82,.28);display:flex;align-items:center;justify-content:center;color:#e05252;font-size:1rem;flex-shrink:0;">⊘</div>
          <div>
            <div style="font-size:.58rem;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#e05252;margin-bottom:3px;">Document Rejected</div>
            <div style="font-family:var(--serif);font-size:1.15rem;font-weight:500;color:var(--white);">Not a Legal Document</div>
          </div>
        </div>
        <div style="font-size:.84rem;color:var(--white-2);line-height:1.82;margin-bottom:18px;">${esc(msg)}</div>
        ${documentType ? `<div style="display:flex;align-items:center;gap:8px;padding:9px 14px;background:rgba(28,23,16,.03);border:1px solid var(--glass-b);border-radius:8px;margin-bottom:18px;"><span style="font-size:.58rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--white-muted);">Detected as:</span><span style="font-size:.82rem;color:var(--white-2);">${esc(documentType)}</span></div>` : ''}
        <div style="font-size:.76rem;color:var(--white-muted);line-height:1.75;margin-bottom:22px;">MootCoach accepts: moot court propositions, legal case problems, constitutional disputes, memorials, statutes, judicial orders, and law-related submissions only.</div>
        <button onclick="showWsPanel('upload')" style="font-family:var(--sans);font-size:.74rem;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--white-muted);background:rgba(28,23,16,.04);border:1px solid var(--glass-b);border-radius:8px;padding:10px 20px;cursor:pointer;">← Upload a Different Document</button>
      </div>
    </div>`;
  document.getElementById('res-empty').style.display = 'none';
  document.getElementById('res-filled').style.display = 'flex';
  showWsPanel('results');
  document.getElementById('analyze-submit-btn').disabled = false;
}

/**
 * The three things worth knowing before prep starts.
 *
 * The first card used to be a 0-94 grade for the proposition. That is gone on
 * purpose: the proposition is fixed by the competition, so telling an advocate
 * their problem is "Weak" costs them confidence and buys them nothing. The
 * issue count replaces it because it is actionable - it is how many issues they
 * can carry into the memorial, framed plus suggested.
 *
 * Oral Difficulty and Research Load stay. They describe the task rather than
 * grade the drafter, so they genuinely help budget prep time.
 */
export function buildStructuredScoreHero(data) {
  const framed = (data.legalIssues || []).length;
  // What the advocate has actually taken on. A suggestion they have not
  // accepted is not yet one of their issues, so counting it here would
  // overstate the memorial they are about to write.
  const suggested = (data.additionalIssues || []).filter(a => a && a.issue);
  const extra  = suggested.filter(a => a.status === 'added').length;
  const undecided = suggested.length - extra;
  const total  = framed + extra;
  const oralD  = data.oralDifficulty || "medium";
  const resD   = data.researchDifficulty || "medium";
  const oPct   = oralD === "high" ? 84 : oralD === "low" ? 25 : 52;
  const rPct   = resD  === "high" ? 88 : resD  === "low" ? 28 : 56;
  const iPct   = Math.min(100, total * 11);
  const dlbl   = { high:"High", medium:"Moderate", low:"Low" };
  // Shown in full: the cards used to cut the reason at 72 characters with
  // no way to read the rest.
  const clip   = (t) => t || "";
  const oReason = clip(data.oralDifficultyReason);
  const rReason = clip(data.researchDifficultyReason);
  const issueSub = extra
    ? framed + " framed \u00b7 " + extra + " added by you"
    : undecided
      ? framed + " framed · " + undecided + " more to consider"
      : framed + " framed in the proposition";

  return `
    <div class="score-hero">
      <div class="score-card">
        <div class="sc-label"><span class="sc-label-dot"></span>Issues to Argue</div>
        <div class="sc-value text-green" id="animated-main-score">0</div>
        <div class="sc-sub">${issueSub}</div>
        <div class="sc-bar"><div class="sc-bar-fill sf-green" data-target="${iPct}%" style="width:0%"></div></div>
      </div>
      <div class="score-card">
        <div class="sc-label"><span class="sc-label-dot"></span>Oral Difficulty</div>
        <div class="sc-value" style="font-size:1.5rem;padding-top:8px;">${dlbl[oralD] || "Moderate"}</div>
        <div class="sc-sub" style="font-size:.68rem;line-height:1.5;">${esc(oReason)}</div>
        <div class="sc-bar"><div class="sc-bar-fill sf-blue" data-target="${oPct}%" style="width:0%"></div></div>
      </div>
      <div class="score-card">
        <div class="sc-label"><span class="sc-label-dot"></span>Research Load</div>
        <div class="sc-value" style="font-size:1.5rem;padding-top:8px;">${dlbl[resD] || "Moderate"}</div>
        <div class="sc-sub" style="font-size:.68rem;line-height:1.5;">${esc(rReason)}</div>
        <div class="sc-bar"><div class="sc-bar-fill sf-purple" data-target="${rPct}%" style="width:0%"></div></div>
      </div>
    </div>`;
}

/**
 * Re-render only the suggested-issues card in the Stage 1 analysis.
 *
 * Called when a suggestion is adopted or dismissed elsewhere. Rebuilding the
 * whole analysis would be simpler but would also reset the reader's scroll
 * position and collapse state, which is a poor trade for refreshing one line.
 */
export function refreshAdditionalIssuesCard() {
  const card = [...document.querySelectorAll('.analysis-section-card')].find(
    c => /Additional Issues/i.test((c.querySelector('.asc-title') || {}).textContent || '')
  );
  if (!card) return;
  const body = card.querySelector('.asc-body');
  if (!body) return;
  try {
    const data = JSON.parse(window.lastAnalysis || lastAnalysis || '{}');
    body.innerHTML = renderAdditionalIssues(
      data.additionalIssues || [],
      (data.legalIssues || []).length
    );
  } catch (e) {
    console.error('[ANALYSIS] Could not refresh the suggested-issues card:', e);
  }
}

/* What the drafting, coaching and simulator calls are told about the case:
   the summary, then the issues, so it is never empty when the analysis
   exists. */
function buildPropositionContext(data) {
  const parts = [];
  const summary = data.summary || data.caseSummary || data.executiveSummary || '';
  if (summary) parts.push(String(summary));
  const issues = (Array.isArray(data.legalIssues) ? data.legalIssues : [])
    .map(i => typeof i === 'string' ? i : (i && (i.issue || i.title || i.question)) || '')
    .filter(Boolean);
  if (issues.length) parts.push('Issues: ' + issues.map((t, n) => `(${n + 1}) ${t}`).join(' '));
  return parts.join('\n').slice(0, 2400);
}

export function showStructuredResults(data) {
  if (!data || Object.keys(data).length === 0) {
    showError("No structured analysis data available for this session.");
    return;
  }
  try {
    // A reduced analysis names its summary "caseSummary". Reading only
    // "summary" left the proposition context empty for those moots, so the
    // draft, Oral Coach, briefing and simulator all ran without the facts.
    if (!data.summary && data.caseSummary) data.summary = data.caseSummary;
    lastAnalysis = JSON.stringify(data, null, 2);
    currentPropositionContext = buildPropositionContext(data);
    populateIssuesFromAnalysis();

    // Legacy: Ensure the Stage 2 issue sidebar always populates from the analysis
    // We just call renderStage2Issues to populate the old UI.
    setTimeout(() => {
      renderStage2Issues();
    }, 100);

    const toList = arr => (arr || []).map(x => `- ${x}`).join('\n');

    const sections = [
      data.summary && { type:'summary', heading:'Case Summary', content: data.summary },
      (data.legalIssues || []).length          && { type:'legal',         heading:'Issues Framed in the Proposition', content: toList(data.legalIssues) },
      (data.additionalIssues || []).length     && {
        type:"addIssues", heading:"Additional Issues You Can Raise", content:"",
        _rawAddIssues: data.additionalIssues, _framedCount: (data.legalIssues || []).length
      },
      (data.petitionerArguments || []).length  && { type:'petitioner',    heading:'Petitioner Arguments',      content: toList(data.petitionerArguments) },
      (data.respondentArguments || []).length  && { type:'respondent',    heading:'Respondent Arguments',      content: toList(data.respondentArguments) },
      (data.argumentDefects?.petitioner?.length || data.argumentDefects?.respondent?.length) && {
        type:'argDefects', heading:'Argument Defect Analysis', content:'', _raw: data.argumentDefects
      },
      (data.constitutionalIssues || []).length && { type:'constitution',  heading:'Constitutional Provisions', content: toList(data.constitutionalIssues) },
      (data.precedentsNeeded || []).length     && {
        type:'cases', heading:'Cases & Precedents',
        content: toList((data.precedentsNeeded || []).map(c => typeof c === 'string' ? c : `${c.caseName} — ${c.holdingRelevant || ''}`)),
        _rawCases: data.precedentsNeeded
      },
      (data.benchQuestions || []).length       && { type:'bench',         heading:'Bench Questions',           content: toList(data.benchQuestions) },
      (data.benchVulnerabilities || []).length && { type:'vulnerability', heading:'Bench Vulnerabilities',     content: toList(data.benchVulnerabilities) },
      (data.missingAngles || []).length        && { type:'missing',       heading:'Missing Legal Angles',      content: toList(data.missingAngles) },
      data.mostContestableIssue && {
        type:'strategy', heading:'Strategic Insights',
        content: `**Most Contestable Issue:** ${String(data.mostContestableIssue).replace(/^[\s*]+|[\s*]+$/g, "")}`
      },
    ].filter(Boolean);

    const heroHTML    = buildStructuredScoreHero(data);

    const navHTML = sections.map((s, i) => {
      const cfg = SECTION_CONFIGS[s.type] || SECTION_CONFIGS.default;
      return `<button class="rn-item" id="rn-${i}" onclick="scrollToSection(${i})">${cfg.icon} ${s.heading}</button>`;
    }).join('');

    const cardsHTML = sections.map((sec, i) => {
      const cfg = SECTION_CONFIGS[sec.type] || SECTION_CONFIGS.default;
      let body;
      if (sec.type === 'argDefects')                      body = renderArgumentDefects(sec._raw);
      else if (sec.type === 'addIssues')                   body = renderAdditionalIssues(sec._rawAddIssues, sec._framedCount);
      else if (sec.type === 'cases' && sec._rawCases)     body = renderCases(sec.content, sec._rawCases);
      else                                                body = renderSectionBody(sec.type, sec.content);

      // Every card is capped at 450px with an inner scrollbar. That suits a
      // bullet list, but a suggested issue carries five lines of grounding, so
      // four of them run past 1000px and the advocate sees two with no obvious
      // reason to look for more. This is the one card that sizes to its
      // content, because a suggestion nobody scrolls to is not a suggestion.
      const bodyExtra = sec.type === 'addIssues' ? 'max-height:none;' : '';

      return `
        <div class="analysis-section-card" id="asc-card-${i}" style="animation-delay:${(i + 2) * 0.055}s">
          <div class="asc-header" id="asc-h-${i}" onclick="toggleSection(${i})">
            <div class="asc-header-left">
              <div class="asc-icon ${cfg.iconCls}">${cfg.icon}</div>
              <div class="asc-title">${cfg.title || sec.heading}</div>
            </div>
            <div class="asc-header-right">
              <span class="asc-badge ${cfg.badgeCls}">${cfg.badgeTxt}</span>
              <button class="asc-copy" onclick="event.stopPropagation();copySectionText(${i},this)">Copy</button>
              <span class="asc-chevron">▾</span>
            </div>
          </div>
          <div class="asc-body" id="asc-b-${i}" style="padding:20px 22px;${bodyExtra}">${body}</div>
        </div>`;
    }).join('');

    // When the full analysis could not run, say so on the page. Otherwise
    // this one just looks thinner than the last and the advocate is left
    // wondering whether their proposition was the problem.
    const noticeHTML = data._notice
      ? `<div style="grid-column:1/-1;border:1px solid var(--glass-b);background:var(--glass);
             padding:13px 16px;font-size:.84rem;line-height:1.7;color:var(--white-2);">
           <strong style="color:var(--white);font-weight:600;">Shorter analysis</strong><br>${esc(data._notice)}
         </div>`
      : '';

    document.getElementById('analysis-output').innerHTML = `
      <div class="result-grid">
        ${noticeHTML}
        ${heroHTML}
        <div class="result-divider"><span>Detailed Analysis</span></div>
        ${cardsHTML}
      </div>`;

    const navEl = document.getElementById('res-sticky-nav-inner');
    if (navEl) navEl.innerHTML = navHTML;

    document.getElementById('res-empty').style.display  = 'none';
    document.getElementById('res-filled').style.display = 'flex';
    showWsPanel('results');
    document.getElementById('analyze-submit-btn').disabled = false;

    const scoreElement = document.getElementById('animated-main-score');
    
    setTimeout(() => { 
      animateBars(); 
      initScrollSpy(); 
      if (scoreElement) {
        const issueTotal = (data.legalIssues || []).length
          + (data.additionalIssues || []).filter(a => a && a.status === 'added').length;
        animateValue(scoreElement, 0, issueTotal, 1200);
      }
    }, 180);
  } catch (error) {
    console.error("Rendering Error:", error);
    alert("The analysis succeeded, but the UI failed to render. Check the console.");
    hideLoading();
    showWsPanel('upload');
  }
}

export function renderMarkdown(text) {
  return String(text ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^&gt; (.+)$/gm,'> $1')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^---+$/gm,'<hr>')
    .replace(/^\s*[-•]\s+(.+)$/gm,'<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.+)$/gm,'<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)(?!\s*<li>)/g,m=>`<ul>${m}</ul>`)
    .split(/\n{2,}/)
    .map(b => {
      if(/<(h[1-3]|ul|blockquote|hr)/.test(b)) return b;
      const t = b.trim().replace(/\n/g,' ');
      return t ? `<p>${t}</p>` : '';
    })
    .join('\n');
}

/* Firestore in the browser reports "the client is offline" when its
   connection drops for a moment, which happened right after a long upload:
   the analysis was saved, but opening it failed once and the page said
   "Analysis Failed". The connection usually returns within seconds, so ask
   again a few times before giving up. */
function isConnectionError(e) {
  return /offline|unavailable|network|Failed to get document|deadline/i.test(String((e && (e.code || e.message)) || ''));
}
async function getWithReconnect(ref, labelEl) {
  const waits = [1500, 3000, 5000];
  for (let i = 0; ; i++) {
    try {
      return await ref.get();
    } catch (e) {
      if (!isConnectionError(e) || i >= waits.length) throw e;
      if (labelEl) labelEl.textContent = 'Reconnecting to your saved moots…';
      try { if (typeof db.enableNetwork === 'function') await db.enableNetwork(); } catch (_) {}
      await new Promise(r => setTimeout(r, waits[i]));
    }
  }
}
/* The analysis is saved; only opening it failed. Say so, and retry the open
   rather than sending the student back to upload it again. */
function showOpenError(docId) {
  document.getElementById('res-empty').style.display = 'none';
  document.getElementById('res-filled').style.display = 'flex';
  document.getElementById('analysis-output').innerHTML = `
    <div class="error-box">
      <div class="error-box-title">Couldn't open this moot just now</div>
      <div class="error-box-msg">Your analysis is saved to your account. The connection dropped while opening it.
        Try again in a moment, or open it from Recent Moots in the sidebar.</div>
      <button class="btn-retry" onclick="loadSavedSession('${esc(docId)}')">Try again</button>
    </div>`;
  showWsPanel('results');
}

export function showError(msg) {
  document.getElementById('res-empty').style.display  = 'none';
  document.getElementById('res-filled').style.display = 'flex';
  document.getElementById('analysis-output').innerHTML = `
    <div class="error-box">
      <div class="error-box-title">Analysis Failed</div>
      <div class="error-box-msg">${esc(msg)}</div>
      <button class="btn-retry" onclick="showWsPanel('upload')">← Try Again</button>
    </div>
  `;
  showWsPanel('results');
  document.getElementById('analyze-submit-btn').disabled = false;
}

export function copyAnalysis() {
  if(!lastAnalysis) return;
  navigator.clipboard.writeText(lastAnalysis).then(()=>{
    const b = document.getElementById('copy-btn');
    if(b) {
      b.textContent='✓ Copied'; b.classList.add('copied');
      setTimeout(()=>{ b.textContent='Copy'; b.classList.remove('copied'); }, 2000);
    }
  });
}

export function hideLoading() { document.getElementById('loading-overlay').classList.remove('show'); }
export function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
export function esc(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

export let currentStage = 1;

/**
 * A step is ticked when its work is done, not when you have walked past it.
 * It used to tick every step before the current one, so visiting Advocacy
 * marked Analysis and Issues complete with nothing chosen or drafted.
 */
function stageDone(i) {
  const ms = window.mootState || {};
  if (i === 1) return !!(window.lastAnalysis || lastAnalysis);
  if (i === 2) return !!ms.issueChosen;
  if (i === 3) return !!((ms.memorialDraft || '').trim() || (ms.oralSubmission || '').trim());
  if (i === 4) return !!ms.roundMarked;
  return false;
}

export function refreshStepper() {
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById('step-' + i);
    const connectorEl = document.getElementById('connector-' + i);
    const done = stageDone(i);
    if (stepEl) {
      stepEl.classList.remove('active', 'completed', 'upcoming');
      const iconEl = stepEl.querySelector('.step-icon');
      if (i === currentStage) {
        stepEl.classList.add('active');
        if (iconEl) iconEl.innerHTML = done ? '✓' : i;
      } else if (done) {
        stepEl.classList.add('completed');
        if (iconEl) iconEl.innerHTML = '✓';
      } else {
        stepEl.classList.add('upcoming');
        if (iconEl) iconEl.innerHTML = i;
      }
      const locked = i > 1 && !(window.lastAnalysis || lastAnalysis);
      stepEl.classList.toggle('locked', locked);
      stepEl.setAttribute('aria-disabled', locked ? 'true' : 'false');
      stepEl.setAttribute('aria-label', `Step ${i}${done ? ', complete' : locked ? ', analyse a proposition first' : ''}`);
    }
    if (connectorEl) connectorEl.classList.toggle('completed', done);
  }
}
window.refreshStepper = refreshStepper;

export function goToStage(stageNum) {
  if (stageNum < 1 || stageNum > 4) return;
  if (!currentUser) return;

  const hasContext = !!(window.lastAnalysis || lastAnalysis);

  if (stageNum > 1 && !hasContext) {
    showToast("Please upload and analyze a proposition in Stage 1 first.", "info");
    return;
  }

  currentStage = stageNum;

  refreshStepper();

  if (stageNum === 4 && window.renderLobbyBrief) window.renderLobbyBrief();

  // Advocacy's "Case Summary Context" card was never filled, so it asked
  // for an upload even with a proposition loaded.
  if (stageNum === 3) {
    const ctxEl = document.getElementById('stage3-case-context');
    if (ctxEl) {
      let summary = '';
      try { summary = (JSON.parse(window.lastAnalysis || lastAnalysis || '{}').summary) || ''; } catch (e) {}
      ctxEl.textContent = summary || 'Upload and analyse a proposition to see its summary here.';
    }
  }

  // Toggle active stage containers
  for (let i = 1; i <= 4; i++) {
    const stageEl = document.getElementById('stage-' + i + '-container');
    if (stageEl) {
      if (i === currentStage) {
        stageEl.classList.add('active');
        stageEl.style.display = 'flex';
      } else {
        stageEl.classList.remove('active');
        stageEl.style.display = 'none';
      }
    }
  }


  // Update footer button states
  const prevBtn = document.getElementById('wizard-prev-btn');
  const nextBtn = document.getElementById('wizard-next-btn');
  if (prevBtn) {
    prevBtn.style.display = currentStage === 1 ? 'none' : 'block';
  }
  if (nextBtn) {
    const loaded = !!(window.lastAnalysis || lastAnalysis);
    nextBtn.style.display = (currentStage === 4 || (currentStage === 1 && !loaded)) ? 'none' : 'block';
  }

  // Stage-specific renderings
  if (currentStage === 2) {
    renderStage2Issues();
    // The recommendations live in this stage now, under the issue list.
    if (typeof window.renderExtraIssues === 'function') window.renderExtraIssues();
  } else if (currentStage === 3) {
    if (typeof window.renderStage3Workspace === 'function') {
      window.renderStage3Workspace();
    }
  } else if (currentStage === 4) {
    if (typeof window.setBenchDifficulty === 'function') {
      window.setBenchDifficulty(window.benchDifficultyMode || 'moderate');
    }
  }

  // Passively update URL hash for Clarity route tracking
  const newHash = `#stage/${currentStage}`;
  if (window.location.hash !== newHash) {
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, null, newHash);
    } else {
      window.location.hash = newHash;
    }
  }
}

export function wizardNext() {
  if (currentStage < 4) goToStage(currentStage + 1);
}

export function wizardPrev() {
  if (currentStage > 1) goToStage(currentStage - 1);
}

export function renderStage2Issues() {
  const container = document.getElementById('stage-2-extracted-issues-list');
  if (!container) return;

  let issues = [];
  // Parallel to `issues`: null for a framed issue, the suggestion object for
  // an added one. Keyed by index so the card renderer can badge them without
  // changing the shape of `issues`, which the builder reads by value.
  let issueMeta = [];
  let intelFor = [];          // issueIntelligence entry per issue, when present
  let benchQs = [], vulns = [];
  try {
    const analysisStr = window.lastAnalysis || lastAnalysis;
    if (analysisStr) {
      const data = JSON.parse(analysisStr);
      benchQs = Array.isArray(data.benchQuestions) ? data.benchQuestions : [];
      vulns = Array.isArray(data.benchVulnerabilities) ? data.benchVulnerabilities : [];
      const intelIssues = data.issueIntelligence?.issues;
      if (intelIssues && intelIssues.length > 0) intelFor = intelIssues;
      if (intelIssues && intelIssues.length > 0) {
        issues = intelIssues.map((iss, i) => iss.issueDefinition?.exactLegalQuestion || iss.issueTitle || ('Issue ' + (i+1)));
      } else {
        issues = data.legalIssues || [];
      }
      issueMeta = issues.map(() => null);
      // Only the suggestions the advocate actually adopted in the Extra Issues
      // step. A suggestion they have not accepted is not one of their issues,
      // and showing it here would decide for them. They stay last so the framed
      // ones keep the numbering the memorial and the bench expect.
      (data.additionalIssues || [])
        .filter(a => a && a.issue && a.status === 'added')
        .forEach(a => { issues.push(a.issue); issueMeta.push(a); });
    }
  } catch (e) {
    console.error("Error parsing analysis for Stage 2 issues:", e);
  }

  if (issues.length === 0) {
    container.innerHTML = `
      <div class="text-center p-6 border border-dashed border-black/10 rounded-xl bg-black/[0.02]">
        <div class="text-2xl mb-2">◎</div>
        <p class="text-xs text-white-muted">No legal issues extracted yet. Please upload and analyze a proposition in Stage 1 first.</p>
      </div>
    `;
    return;
  }

  const selectEl = document.getElementById('builder-issue-select');
  const currentVal = selectEl ? selectEl.value : '';

  container.innerHTML = `
    <div class="issue-card-container flex flex-col gap-4">
      ${issues.map((issue, idx) => {
        const isSelected = currentVal === issue || (!currentVal && idx === 0);
        const cardClass = isSelected ? 'issue-card selected' : 'issue-card';
        
        // Only what the analysis actually says about this issue. These cards
        // used to assign difficulty and strategy by keyword, so nearly every
        // issue read "Medium Difficulty" with the same stock tip - one of which
        // called Indian precedent "binding" whatever the forum.
        const selectStr = issue.toLowerCase();
        let importance = "Framed Issue";
        let importanceCls = "bg-[#8C8270]/12 text-[#6b5f4d] border border-[#8C8270]/30";
        if (/jurisdiction|maintainab|locus|standing|limitation|preliminary|admissib/.test(selectStr)) {
          importance = "Threshold — decided first";
          importanceCls = "bg-purple-500/10 text-purple-400 border border-purple-500/20";
        } else if (/remed|relief|compensat|damages|prayer|costs/.test(selectStr)) {
          importance = "Remedy";
          importanceCls = "bg-blue-500/10 text-blue-400 border border-blue-500/20";
        } else {
          importance = "Merits";
          importanceCls = "bg-[#B0392E]/10 text-moot-accent border border-[#B0392E]/20";
        }
        let difficulty = '';
        let difficultyCls = '';
        let path = '';
        let pathCls = '';
        let advice = '';
        let adviceLabel = 'Strategy';

        const intel = intelFor[idx];
        const rawDiff = intel && (intel.difficulty || intel.difficultyLevel || intel.issueDifficulty);
        if (rawDiff) {
          const d = String(rawDiff).toLowerCase();
          difficulty = d.includes('high') || d.includes('hard') ? 'High' : d.includes('low') || d.includes('easy') ? 'Low' : 'Medium';
          difficultyCls = difficulty === 'High' ? "bg-red-500/10 text-red-400 border border-red-500/20"
            : difficulty === 'Low' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : "bg-amber-500/10 text-amber-400 border border-amber-500/20";
        }
        if (intel && intel.issueDefinition && intel.issueDefinition.whyItMatters) {
          advice = intel.issueDefinition.whyItMatters;
          adviceLabel = 'Why it matters';
        } else {
          // The bench question (or known weakness) that shares the most
          // substantive words with this issue - shown only on a real match.
          const words = w => new Set(String(w).toLowerCase().match(/[a-z][a-z0-9()]{4,}/g) || []);
          const mine = words(issue);
          const best = (list) => {
            let top = null, score = 0;
            list.forEach(q => { let n = 0; words(q).forEach(w => { if (mine.has(w)) n++; }); if (n > score) { score = n; top = q; } });
            return score >= 2 ? top : null;
          };
          const q = best(benchQs);
          const v = best(vulns);
          if (q) { advice = q; adviceLabel = 'Expect from the bench'; }
          else if (v) { advice = v; adviceLabel = 'Watch for'; }
        }

        const sugg = issueMeta[idx];
        if (sugg) {
          importance = "Suggested \u2014 Extra Marks";
          importanceCls = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          path = sugg.legalBasis ? String(sugg.legalBasis).slice(0, 44) : "Added Ground";
          pathCls = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          if (sugg.confidence === "Safe") {
            difficulty = "Safe to raise";
            difficultyCls = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          } else if (sugg.confidence === "Aggressive") {
            difficulty = "Aggressive";
            difficultyCls = "bg-red-500/10 text-red-400 border border-red-500/20";
          } else {
            difficulty = "Arguable";
            difficultyCls = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
          }
          advice = (sugg.groundedIn ? "Anchor it in the record: " + sugg.groundedIn + " " : "")
                 + (sugg.whyItEarnsMarks || "");
        }

        return `
          <div class="${cardClass} p-4 bg-black/5 border border-black/10 rounded-xl flex flex-col gap-3 cursor-pointer" onclick="window.selectIssueFromCard(${idx})">
            <div class="flex justify-between items-start gap-4">
              <div class="flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-moot-accent/10 border border-moot-accent/20 text-moot-accent text-[11px] font-semibold flex items-center justify-center shrink-0">
                  ${idx + 1}
                </span>
                <div class="text-xs font-sans text-[#1C1710] font-medium leading-relaxed">${esc(issue)}</div>
              </div>
              <div class="shrink-0 flex items-center justify-center mt-1">
                ${isSelected ? '<span class="text-moot-accent text-sm">✓</span>' : '<span class="text-white-faint text-sm">○</span>'}
              </div>
            </div>
            
            <div class="flex flex-wrap gap-2">
              <span class="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-sans font-semibold ${importanceCls}">${esc(importance)}</span>
              ${difficulty ? `<span class="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-sans font-semibold ${difficultyCls}">${esc(difficulty)}${/^(High|Medium|Low)$/.test(difficulty) ? ' Difficulty' : ''}</span>` : ''}
              ${path ? `<span class="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-sans font-semibold ${pathCls}">${esc(path)}</span>` : ''}
            </div>
            
            ${advice ? `<div class="text-[11px] text-white-muted leading-relaxed font-sans border-t border-black/5 pt-2">
              <strong class="not-italic">${esc(adviceLabel)}:</strong> <span class="italic">${esc(advice)}</span>
            </div>` : ''}
          </div>
        `;
      }).join('')}
      
      <button class="btn-analyze w-full py-3 mt-4 text-xs tracking-widest font-medium transition-all" onclick="window.wizardNext()" style="margin-top: 20px;">
        Proceed to Drafting Workspace →
      </button>
    </div>
  `;

  if (selectEl && !selectEl.value && issues.length > 0) {
    selectEl.value = issues[0];
    const changeEvent = new Event('change', { bubbles: true });
    selectEl.dispatchEvent(changeEvent);
  }
}

export function selectIssueFromCard(idx) {
  const selectEl = document.getElementById('builder-issue-select');
  if (selectEl && selectEl.options[idx]) {
    selectEl.selectedIndex = idx;
    const changeEvent = new Event('change', { bubbles: true });
    selectEl.dispatchEvent(changeEvent);
    if (window.mootState) window.mootState.issueChosen = true;
    refreshStepper();
    showToast("Issue selected ✓", "ok");
    renderStage2Issues();
  }
}

/* ── Chambers Briefing ──
   Prepared on demand for the chosen bench (/api/oral-briefing). Until then the
   modules show what the Stage 3 draft carried — which, from the memorial-only
   button, is one item each, and the panel says so instead of padding it out. */
let chambersBriefing = null;
export function clearChambersBriefing() { chambersBriefing = null; }
window.clearChambersBriefing = clearChambersBriefing;
window.getChambersBriefing = () => chambersBriefing;
window.restoreChambersBriefing = (b) => { chambersBriefing = b || null; renderStage4OralNotes(); };

const BENCH_NAME = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };
const currentBenchMode = () => window.oralDifficultyMode || 'easy';

function briefingSource() {
  if (chambersBriefing) return Object.assign({ prepared: true }, chambersBriefing);
  const arg = window.lastBuiltArgument || lastBuiltArgument || {};
  return { prepared: false, benchMode: null, oralAdvocacy: arg.oralAdvocacy || {}, rebuttals: arg.rebuttals || {} };
}

/* What each module holds, so the card can say "6 questions" and a read time
   that matches what is actually inside. */
function moduleStats(id, src) {
  const oa = src.oralAdvocacy || {}, rb = src.rebuttals || {};
  const arr = v => Array.isArray(v) ? v : [];
  const words = x => String(JSON.stringify(x || '')).split(/\s+/).length;
  const map = {
    'bench-questions': [arr(oa.qa), 'question'],
    'key-authorities': [arr(oa.precedents), 'authority'],
    'judicial-traps': [arr(oa.traps), 'trap'],
    'rebuttal-strategy': [arr(rb.opponentArguments), 'counter-argument'],
    'follow-up-questions': [arr(rb.followUpQuestions), 'follow-up'],
    'emergency-rescue': [rb.emergencyRescue ? [rb.emergencyRescue] : [], 'rescue'],
    'closing-prayer': [oa.closingPrayer ? [oa.closingPrayer] : [], 'prayer'],
    'fallback-position': [rb.planB ? [rb.planB] : [], 'position'],
  };
  const [items, noun] = map[id] || [[], 'item'];
  const content = id === 'rebuttal-strategy' ? [items, rb.demolitionStrategy] : items;
  const n = items.length;
  const plural = noun === 'authority' ? 'authorities' : noun + 's';
  return {
    count: n,
    label: n ? (['rescue', 'prayer', 'position'].includes(noun) ? 'Ready' : `${n} ${n === 1 ? noun : plural}`) : 'Not prepared',
    minutes: n ? Math.max(1, Math.round(words(content) / 170)) : 0,
  };
}

function briefingIsThin(src) {
  const oa = src.oralAdvocacy || {}, rb = src.rebuttals || {};
  const n = v => Array.isArray(v) ? v.length : 0;
  return n(oa.qa) < 3 || n(oa.precedents) < 2 || n(oa.traps) < 2 || n(rb.followUpQuestions) < 2
    || !oa.closingPrayer || !rb.emergencyRescue || !rb.planB;
}

let briefingInFlight = false;
window.prepareChambersBriefing = async function () {
  // The panel re-renders (bench change, new feedback) while this runs, which
  // replaces the button with an enabled one; the flag, not the button, stops
  // a second request.
  if (briefingInFlight) return;
  briefingInFlight = true;
  const mootId = window.currentMootDocId || null;
  const btn = document.getElementById('btn-prepare-briefing');
  const stance = (window.mootState && window.mootState.stance) || window.builtArgumentSide || 'Petitioner';
  const draft = [
    window.mootState && window.mootState.memorialDraft,
    document.getElementById('oral-argument-input')?.value,
  ].filter(Boolean).join('\n\n').slice(0, 12000);
  const known = (window.getCasesFromAnalysis ? window.getCasesFromAnalysis() : [])
    .map(a => a.ratio ? `${a.name} — ${a.ratio}` : a.name).slice(0, 40);
  let stop = () => {};
  if (btn) { btn.disabled = true; stop = startElapsed(btn, s => `Preparing for the ${BENCH_NAME[currentBenchMode()]} bench… ${s}s`); }
  try {
    const data = await prepareOralBriefing({
      stance, benchMode: currentBenchMode(), draft,
      issue: document.getElementById('builder-issue-select')?.value || '',
      propositionContext: currentPropositionContext || '',
      knownAuthorities: known,
      pastWeaknesses: window.getMootFeedbackPoints ? window.getMootFeedbackPoints(6) : [],
    });
    if ((window.currentMootDocId || null) !== mootId) return;   // another moot opened meanwhile
    chambersBriefing = data.briefing;
    if (window.saveMootProgress) window.saveMootProgress();
    showToast('Chambers Briefing prepared', 'ok');
  } catch (e) {
    showToast(e.message, 'err');
  } finally {
    briefingInFlight = false;
    stop();
    renderStage4OralNotes();
  }
};

export function renderStage4OralNotes() {
  const briefingEl = document.getElementById('stage4-chamber-briefing');
  const inputEl = document.getElementById('oral-argument-input');

  const hasContext = !!(window.lastAnalysis || lastAnalysis);

  if (briefingEl) {
    const modules = [
      {
        id: 'bench-questions',
        title: 'Bench Questions',
        description: 'Anticipated questions from the bench with strategic responses.',
        readTime: '3 min',
        icon: '?'
      },
      {
        id: 'key-authorities',
        title: 'Key Authorities',
        description: 'Precedents and their ratios to cite during oral arguments.',
        readTime: '4 min',
        icon: '§'
      },
      {
        id: 'judicial-traps',
        title: 'Judicial Traps',
        description: 'Vulnerable points in your argument and 30-second escape routes.',
        readTime: '2 min',
        icon: '△'
      },
      {
        id: 'rebuttal-strategy',
        title: 'Rebuttal Strategy',
        description: 'Counter-arguments and strategies to demolish the opposition\'s claims.',
        readTime: '3 min',
        icon: '⚔︎'
      },
      {
        id: 'emergency-rescue',
        title: 'Emergency Rescue',
        description: 'Last-resort constitutional principles to salvage a collapsing case.',
        readTime: '1 min',
        icon: '▲'
      },
      {
        id: 'closing-prayer',
        title: 'Closing Prayer',
        description: 'A formal demand for relief tailored to the bench structure.',
        readTime: '1 min',
        icon: '◷'
      },
      {
        id: 'follow-up-questions',
        title: 'Follow-Up Questions',
        description: 'Secondary queries the judges may use to probe deep into your logic.',
        readTime: '2 min',
        icon: '◎'
      },
      {
        id: 'fallback-position',
        title: 'Fallback Position',
        description: 'A secondary legal ground to fall back on if the main submission is rejected.',
        readTime: '2 min',
        icon: '◈'
      }
    ];

    const currentStance = window.builtArgumentSide || document.querySelector('input[name="stance"]:checked')?.value || 'Petitioner';
    const isPetitioner = currentStance.toLowerCase().includes('petitioner') || currentStance.toLowerCase().includes('appellant');

    let modulesHTML = '';
    const arg = window.lastBuiltArgument || lastBuiltArgument;
    const src = briefingSource();
    const hasDraft = !!(arg && (arg.oralAdvocacy || arg.rebuttals)) || !!(window.mootState && window.mootState.memorialDraft);
    const hasData = src.prepared || hasDraft;
    const mode = currentBenchMode();

    if (hasData) {
      const stale = src.prepared && src.benchMode !== mode;
      const thin = !src.prepared && briefingIsThin(src);
      const banner = (thin || stale || !src.prepared) ? `
        <div style="padding:12px 14px;border:1px solid var(--glass-b);border-left:3px solid var(--gold);border-radius:0 10px 10px 0;margin-bottom:12px;font-size:12px;line-height:1.55;color:var(--white-2);">
          ${stale ? `This briefing was prepared for the ${BENCH_NAME[src.benchMode]} bench; you have the ${BENCH_NAME[mode]} bench selected.`
            : thin ? 'The draft only carried a short briefing (one item per module).'
            : 'This briefing comes from your Stage 3 draft.'}
          <button type="button" id="btn-prepare-briefing" onclick="window.prepareChambersBriefing()" class="btn-sm" ${briefingInFlight ? 'disabled' : ''} style="display:block;width:100%;margin-top:8px;padding:8px;text-transform:uppercase;letter-spacing:.05em;font-size:10px;">
            ${briefingInFlight ? 'Preparing…' : `Prepare full briefing for the ${BENCH_NAME[mode]} bench`}
          </button>
        </div>` : `<div style="font-size:11px;color:var(--white-muted);margin-bottom:10px;">Prepared for the ${BENCH_NAME[src.benchMode]} bench.</div>`;
      modulesHTML = (window.mootFeedbackHTML ? window.mootFeedbackHTML() : '') + banner + `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${modules.map(mod => `
            <div class="bg-black/[0.03] border border-black/5 rounded-xl p-4 transition-all duration-200 hover:border-black/10 hover:bg-black/[0.05] flex flex-col justify-between" style="min-height: 120px;">
              <div class="flex items-center justify-between mb-1.5" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="text-[10px] text-white-muted font-sans font-semibold flex items-center gap-1.5" style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 14px;">${mod.icon}</span> <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--white);">${mod.title}</span>
                </span>
                <span class="text-[9px] uppercase tracking-wider font-semibold text-moot-accent bg-moot-accent/5 px-2 py-0.5 rounded font-sans" style="border: 1px solid rgba(176,57,46,0.15);">${(st => st.count ? `${st.label} · ${st.minutes} min` : st.label)(moduleStats(mod.id, src))}</span>
              </div>
              <p class="text-[11px] text-white-muted leading-relaxed font-sans" style="margin: 4px 0 8px 0; color:var(--white-muted);">${mod.description}</p>
              <button onclick="window.openArsenalModule('${mod.id}')" class="btn-sm text-[10px] py-1.5 bg-black/5 border border-black/10 text-[#1C1710] hover:bg-black/10 rounded cursor-pointer text-center w-full transition-all duration-200" style="width: 100%; text-transform: uppercase; letter-spacing: 0.05em;">
                Open Module
              </button>
            </div>
          `).join('')}
        </div>
      `;
    } else if (hasContext) {
      modulesHTML = `
        <div class="text-white-muted italic p-4 bg-black/[0.02] border border-dashed border-black/10 rounded-xl font-sans text-center">
          <div class="text-lg mb-1">◉</div>
          No generated submissions found. Complete Stage 3 first to automatically populate your Chambers Briefing & Battle Plan.
        </div>
      `;
    } else {
      modulesHTML = `
        <div class="text-white-muted italic p-4 bg-black/[0.02] border border-dashed border-black/10 rounded-xl font-sans text-center">
          <div class="text-lg mb-1">◉</div>
          Draft your submissions in Stage 3 to populate your custom Battle Plan here.
        </div>
      `;
    }

    briefingEl.innerHTML = modulesHTML;
  }

  // Pre-fill speech input from generated draft opening speech
  if (inputEl && !inputEl.value.trim()) {
    if (window.lastBuiltArgument && window.lastBuiltArgument.oralAdvocacy && window.lastBuiltArgument.oralAdvocacy.openingSpeech) {
      inputEl.value = window.lastBuiltArgument.oralAdvocacy.openingSpeech;
    } else if (lastBuiltArgument && lastBuiltArgument.oralAdvocacy && lastBuiltArgument.oralAdvocacy.openingSpeech) {
      inputEl.value = lastBuiltArgument.oralAdvocacy.openingSpeech;
    }
    // Dispatch input event to enable the Evaluate button
    if (inputEl.value.trim()) {
      const inputEvent = new Event('input', { bubbles: true });
      inputEl.dispatchEvent(inputEvent);
    }
  }
}

export function openArsenalModule(moduleId) {
  const modal = document.getElementById('advocacy-arsenal-modal');
  const titleEl = document.getElementById('arsenal-modal-title');
  const bodyEl = document.getElementById('arsenal-modal-body');
  if (!modal || !titleEl || !bodyEl) return;

  const currentStance = window.builtArgumentSide || document.querySelector('input[name="stance"]:checked')?.value || 'Petitioner';
  const isPetitioner = currentStance.toLowerCase().includes('petitioner') || currentStance.toLowerCase().includes('appellant');

  const src = briefingSource();
  const oralAdvocacy = src.oralAdvocacy || {};
  const rebuttals = src.rebuttals || {};
  const notPrepared = '<p class="text-white-muted italic">Not prepared yet. Close this and use "Prepare full briefing" above the modules.</p>';

  let title = '';
  let content = '';

  switch (moduleId) {
    case 'bench-questions':
      title = 'Bench Questions';
      content = `
        <div class="space-y-3 font-sans">
          ${(oralAdvocacy.qa || []).map((pair, idx) => `
            <div class="p-3 bg-black/[0.03] border border-black/5 rounded-lg" style="margin-bottom: 10px;">
              <strong class="text-[#B0392E] block mb-1" style="color: var(--gold); font-size: 12px;">Q${idx+1}: ${esc(pair.q)}</strong>
              <div class="text-[#4a4030] italic font-serif leading-relaxed mt-1" style="font-size: 11px; line-height: 1.5; color:var(--white-muted); padding-left: 8px; border-left: 2px solid rgba(28,23,16,0.1);">"${esc(pair.a)}"</div>
            </div>
          `).join('') || '<p class="text-white-muted italic">No bench questions generated yet.</p>'}
        </div>
      `;
      break;
    case 'key-authorities':
      title = 'Key Authorities';
      content = `
        <div class="space-y-3 font-sans">
          ${(oralAdvocacy.precedents || []).map(p => `
            <div class="p-3 bg-black/[0.03] border border-black/5 rounded-lg text-xs" style="margin-bottom: 10px;">
              <strong class="text-[#1C1710] block mb-1" style="font-size: 12px; color: var(--white);">⚖︎ ${esc(p.name)} (${esc(p.bench || 'Constitutional Bench')})</strong>
              <div class="text-white-muted mt-1.5" style="font-size: 11px;"><span class="text-[#B0392E] font-semibold uppercase text-[9px] tracking-wider" style="color: var(--gold); font-size: 9px; font-weight: bold; margin-right: 4px;">Ratio:</span> ${esc(p.ratio)}</div>
              <div class="text-white-muted mt-1.5" style="font-size: 11px;"><span class="text-[#4caf82] font-semibold uppercase text-[9px] tracking-wider" style="color:var(--acc-green); font-size: 9px; font-weight: bold; margin-right: 4px;">Application:</span> ${esc(p.strategicValue || p.why)}</div>
              <div class="text-white-muted mt-1.5" style="font-size: 11px;"><span class="text-[#B0392E] font-semibold uppercase text-[9px] tracking-wider" style="color: var(--gold); font-size: 9px; font-weight: bold; margin-right: 4px;">Usage:</span> <span class="italic font-serif" style="color:var(--white);">"${esc(p.usage)}"</span></div>
            </div>
          `).join('') || '<p class="text-white-muted italic">No precedents annotated yet.</p>'}
        </div>
      `;
      break;
    case 'judicial-traps':
      title = 'Judicial Traps';
      content = `
        <div class="space-y-3 font-sans">
          ${(oralAdvocacy.traps || []).map(trap => `
            <div class="p-3 bg-red-950/10 border border-red-900/20 rounded-lg text-xs leading-relaxed text-[#4a4030]" style="margin-bottom: 10px; border-left: 3px solid var(--gold);">
              <strong class="text-red-400 block mb-1" style="color:var(--acc-red); font-size: 12px;">△ ${esc(trap.title || 'Judicial Trap')}</strong>
              <div class="text-gray-400 mb-1" style="font-size: 11px; margin-top: 4px;"><strong style="color:var(--white);">Danger:</strong> ${esc(trap.description)}</div>
              <div class="mt-2 italic text-[#4a4030] font-serif" style="font-size: 11px; color:var(--white-muted); padding-top: 4px; border-t: 1px solid rgba(28,23,16,0.05);">Escape Route: "${esc(trap.escapeResponse)}"</div>
            </div>
          `).join('') || '<p class="text-white-muted italic">No judicial traps identified yet.</p>'}
        </div>
      `;
      break;
    case 'rebuttal-strategy':
      title = 'Rebuttal Strategy';
      content = `
        <div class="space-y-4 font-sans">
          <div class="p-3 bg-black/[0.03] border border-black/5 rounded-lg" style="margin-bottom: 10px;">
            <h4 class="text-[#B0392E] font-semibold uppercase text-[10px] tracking-wider mb-2" style="color: var(--gold); font-size: 10px;">Opposition Arguments</h4>
            <ul class="list-disc pl-4 text-[#4a4030] space-y-1.5" style="font-size: 11px; color:var(--white-muted);">
              ${(rebuttals.opponentArguments || []).map(arg => `<li>${esc(arg)}</li>`).join('') || '<li class="italic text-gray-500">None identified.</li>'}
            </ul>
          </div>
          <div class="p-3 bg-black/[0.03] border border-black/5 rounded-lg">
            <h4 class="text-emerald-400 font-semibold uppercase text-[10px] tracking-wider mb-2" style="color:var(--acc-green); font-size: 10px;">Demolition Strategy</h4>
            <div class="text-[#4a4030] space-y-2" style="font-size: 11px; color:var(--white-muted);">
              ${(rebuttals.demolitionStrategy || []).map((strat, idx) => `<p style="margin-bottom: 6px;"><strong style="color: var(--white); margin-right: 4px;">${idx + 1}.</strong> ${esc(strat)}</p>`).join('') || '<p class="italic text-gray-500">No response strategy prepared.</p>'}
            </div>
          </div>
        </div>
      `;
      break;
    case 'emergency-rescue':
      title = 'Emergency Rescue';
      const rescueArg = rebuttals.emergencyRescue || '';
      content = !rescueArg ? notPrepared : `
        <div class="p-4 bg-red-950/10 border border-red-900/20 rounded-xl font-sans" style="border-left: 3px solid #ef4444;">
          <p class="text-[#4a4030] leading-relaxed font-serif italic" style="font-size: 12px; color:var(--white-muted); line-height: 1.6;">
            "${esc(rescueArg)}"
          </p>
        </div>
      `;
      break;
    case 'closing-prayer':
      title = 'Closing Prayer';
      const prayerArg = oralAdvocacy.closingPrayer || '';
      content = !prayerArg ? notPrepared : `
        <div class="p-4 bg-indigo-950/10 border border-indigo-900/20 rounded-xl font-sans" style="border-left: 3px solid var(--gold);">
          <p class="text-[#4a4030] leading-relaxed font-serif italic" style="font-size: 12px; color:var(--white-muted); line-height: 1.6;">
            "${esc(prayerArg)}"
          </p>
        </div>
      `;
      break;
    case 'follow-up-questions':
      title = 'Follow-Up Questions';
      content = `
        <div class="space-y-3 font-sans">
          ${(rebuttals.followUpQuestions || []).map((pair, idx) => `
            <div class="p-3 bg-black/[0.03] border border-black/5 rounded-lg" style="margin-bottom: 10px;">
              <strong class="text-[#1C1710] block mb-1" style="font-size: 12px;">Follow-up ${idx + 1}: "${esc(pair.q)}"</strong>
              <div class="italic block mt-1 font-serif text-[#4a4030]" style="font-size: 11px; color:var(--white-muted); padding-left: 8px; border-left: 2px solid rgba(28,23,16,0.1);">Answer: "${esc(pair.a)}"</div>
            </div>
          `).join('') || '<p class="text-white-muted italic">No follow-up questions prepared.</p>'}
        </div>
      `;
      break;
    case 'fallback-position':
      title = 'Fallback Position';
      const fallbackArg = rebuttals.planB || '';
      content = !fallbackArg ? notPrepared : `
        <div class="p-4 bg-indigo-950/10 border border-indigo-900/20 rounded-xl font-sans" style="border-left: 3px solid var(--gold);">
          <p class="text-[#4a4030] leading-relaxed font-serif italic" style="font-size: 12px; color:var(--white-muted); line-height: 1.6;">
            "${esc(fallbackArg)}"
          </p>
        </div>
      `;
      break;
  }

  titleEl.textContent = title;
  bodyEl.innerHTML = content;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeArsenalModal() {
  const modal = document.getElementById('advocacy-arsenal-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

window.openArsenalModule = openArsenalModule;
window.closeArsenalModal = closeArsenalModal;

export function switchStage5Tab(tab) {
  const tabs = ['outline', 'rebuttals', 'vulnerabilities'];
  tabs.forEach(t => {
    const btn = document.getElementById(`stage5-tab-${t}`);
    const content = document.getElementById(`stage5-content-${t}`);
    if (btn) {
      btn.classList.toggle('bg-indigo-500/10', t === tab);
      btn.classList.toggle('is-on', t === tab);   // the indigo tint is neutralised by the theme; this carries the state
      btn.classList.toggle('text-indigo-400', t === tab);
      btn.classList.toggle('bg-transparent', t !== tab);
      btn.classList.toggle('text-white-muted', t !== tab);
    }
    if (content) {
      content.classList.toggle('hidden', t !== tab);
    }
  });
}

window.goToStage = goToStage;
