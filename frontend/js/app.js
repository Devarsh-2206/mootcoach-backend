import { 
  auth, 
  db, 
  onAuthChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updateProfile
} from './services/firebase.js';
import { BASE_URL } from './config.js';
// Registers window.openMemorialReview for the sidebar button. Self-contained:
// it owns its own overlay and cannot affect the other workspace flows.
import './components/memorialReview.js';
import './components/mootCalendar.js';
import './services/mootProgress.js';
import { 
  showToast,
  getFriendlyError,
  setLoading,
  markErr,
  showHint,
  showAuthSuccess,
  navigate,
  loadRecentSessions,
  openLegalModal,
  closeLegalModal,
  toggleMobileSidebar,
  showWsPanel,
  loadSavedSession,
  copyAnalysis,
  updateWsMootName,
  toggleSection,
  copySectionText,
  scrollToSection,
  currentPropositionContext,
  switchAuthTab,
  goToStage,
  wizardNext,
  wizardPrev,
  switchStage5Tab,
  renderStage4OralNotes,
  selectIssueFromCard,
  renderStage2Issues,
  refreshAdditionalIssuesCard
} from './components/ui.js';

import {
  initDashboard,
  handleFileSelect,
  removeFile,
  runAnalysis
} from './components/dashboard.js';

import {
  setOralDifficulty,
  clearOralContext,
  runOralEvaluation
} from './components/oralEvaluation.js';

import {
  setBenchDifficulty,
  startBenchSession,
  clearBenchSession,
  exitChambers,
  submitToBench,
  handleBenchKeydown,
  startOralRound,
  stopOralRound
} from './components/benchSimulator.js';

import {
  initArgumentBuilder,
  populateIssuesFromAnalysis,
  copyBuilderArgument,
  toggleAuthority,
  renderStage3Workspace,
  getCurrentSelectedSide
} from './components/argumentBuilder.js';
import {
  renderExtraIssues,
  setIssueStatus,
  toggleDismissedIssues
} from './components/extraIssues.js';
import { initClarity, identifyUserInClarity } from './services/clarity.js';

// Auth Overlay State and Handlers
let isOverlaySignUpMode = false;

/* A field error the person can read: the underline turns red AND the hint
   under the field says what is wrong. Marking the field alone left an empty
   submit doing nothing visible. */
function fieldError(id, message) {
  markErr(id, !!message);
  const hint = document.getElementById('h-' + id);
  if (!hint) return;
  if (message) hint.textContent = message;
  hint.classList.toggle('hidden', !message);
}

/* After an explicit sign-in, open the workspace. Done from the auth
   listener (below) rather than straight after the sign-in call, because the
   app's own record of the user is set by that listener and the workspace
   refuses to open until it is. */
function goToWorkspaceWhenSignedIn() {
  if (window.currentUser) { navigate('workspace'); return; }
  window.__openWorkspaceOnSignIn = true;
}

function clearOverlayForm() {
  ['auth-fname', 'auth-lname', 'auth-school', 'auth-email', 'auth-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
    fieldError(id, null);
  });
  const errorDiv = document.getElementById('auth-overlay-error');
  if (errorDiv) { errorDiv.textContent = ''; errorDiv.classList.add('hidden'); }
  const status = document.getElementById('auth-status-message');
  if (status) status.textContent = '';
}

function toggleOverlayMode(signup) {
  isOverlaySignUpMode = signup;
  const toggleBtn = document.getElementById('auth-overlay-toggle-btn');
  const toggleText = document.getElementById('auth-overlay-toggle-text');
  const submitBtn = document.getElementById('auth-overlay-submit');
  const signupFields = document.getElementById('auth-overlay-signup-fields');
  const errorDiv = document.getElementById('auth-overlay-error');

  if (errorDiv) errorDiv.classList.add('hidden');
  
  // Clear any existing field errors and the last status line
  ['auth-email', 'auth-password', 'auth-fname'].forEach(id => fieldError(id, null));
  const status = document.getElementById('auth-status-message');
  if (status) status.textContent = '';

  const pass = document.getElementById('auth-password');
  if (pass) {
    pass.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    pass.placeholder = signup ? 'At least 8 characters' : 'Your password';
  }
  const forgot = document.getElementById('forgot-password-btn');
  if (forgot) forgot.style.display = signup ? 'none' : '';

  if (signup) {
    if (toggleBtn) toggleBtn.textContent = 'Sign In';
    if (toggleText) toggleText.textContent = 'Already have an account?';
    if (submitBtn) submitBtn.textContent = 'Create Account';
    if (signupFields) signupFields.style.display = 'block';
  } else {
    if (toggleBtn) toggleBtn.textContent = 'Create Account';
    if (toggleText) toggleText.textContent = "Don't have an account?";
    if (submitBtn) submitBtn.textContent = 'Sign In';
    if (signupFields) signupFields.style.display = 'none';
  }
}

async function handleOverlayLogin() {
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  const email = emailInput?.value.trim();
  const pass = passInput?.value;
  const errorDiv = document.getElementById('auth-overlay-error');
  
  let ok = true;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  fieldError('auth-email', emailOk ? null : (email ? 'That email address is not valid.' : 'Enter your email address.'));
  if (!emailOk) ok = false;
  fieldError('auth-password', pass ? null : 'Enter your password.');
  if (!pass) ok = false;
  
  if (!ok) return;
  
  setLoading('auth-overlay-submit', true, 'Sign In');
  if (errorDiv) errorDiv.classList.add('hidden');

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    setLoading('auth-overlay-submit', false, 'Sign In');
    // They asked to sign in to get to their work: take them there.
    clearOverlayForm();
    goToWorkspaceWhenSignedIn();
  } catch (err) {
    setLoading('auth-overlay-submit', false, 'Sign In');
    if (errorDiv) {
      errorDiv.textContent = getFriendlyError(err.code);
      errorDiv.classList.remove('hidden');
    }
    if (/password|credential/.test(err.code || '')) markErr('auth-password', true);
    if (/user-not-found|invalid-email/.test(err.code || '')) markErr('auth-email', true);
  }
}

async function handleOverlaySignup() {
  const fnameInput = document.getElementById('auth-fname');
  const lnameInput = document.getElementById('auth-lname');
  const schoolInput = document.getElementById('auth-school');
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  const errorDiv = document.getElementById('auth-overlay-error');

  const fname = fnameInput?.value.trim();
  const lname = lnameInput?.value.trim();
  const school = schoolInput?.value.trim();
  const email = emailInput?.value.trim();
  const pass = passInput?.value;

  let ok = true;

  fieldError('auth-fname', fname ? null : 'First name is required.');
  if (!fname) ok = false;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  fieldError('auth-email', emailOk ? null : (email ? 'That email address is not valid.' : 'Enter your email address.'));
  if (!emailOk) ok = false;

  const passOk = !!pass && pass.length >= 8;
  fieldError('auth-password', passOk ? null : 'Use at least 8 characters.');
  if (!passOk) ok = false;

  if (!ok) return;

  setLoading('auth-overlay-submit', true, 'Create Account');
  if (errorDiv) errorDiv.classList.add('hidden');

  let user;
  try {
    user = (await createUserWithEmailAndPassword(auth, email, pass)).user;
  } catch (err) {
    setLoading('auth-overlay-submit', false, 'Create Account');
    if (errorDiv) {
      errorDiv.textContent = getFriendlyError(err.code);
      errorDiv.classList.remove('hidden');
    }
    if (/email/.test(err.code || '')) markErr('auth-email', true);
    if (/password/.test(err.code || '')) markErr('auth-password', true);
    return;
  }

  // The account exists from here on. Saving the profile and the welcome
  // email are extras: if one fails, the signup did not, so it must not be
  // reported as an error.
  try { await updateProfile(user, { displayName: fname }); } catch (e) { console.warn('Profile name not saved:', e); }
  try {
    await db.collection('artifacts').doc('moot.coach').collection('users').doc(user.uid).set({
      firstName: fname,
      lastName: lname || '',
      university: school || '',
      email: email,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('Profile not saved:', e); }
  triggerWelcomeEmail();

  setLoading('auth-overlay-submit', false, 'Create Account');
  clearOverlayForm();
  toggleOverlayMode(false);
  goToWorkspaceWhenSignedIn();
  showToast(`Welcome to MootCoach, ${fname}.`, 'ok');
}

// Auth Event Handlers (Compat / Legacy)
async function handleLogin() {
  const email = document.getElementById('li-email')?.value.trim();
  const pass  = document.getElementById('li-pass')?.value;
  let ok = true;
  
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  markErr('li-email', !emailOk); showHint('h-li-email', !emailOk); if(!emailOk) ok=false;
  if(!pass){ markErr('li-pass', true); showHint('h-li-pass', true); ok=false; }
  else { markErr('li-pass', false); showHint('h-li-pass', false); }
  
  if(!ok) return;
  
  setLoading('btn-li', true, 'Sign In');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    showAuthSuccess();
  } catch (err) {
    setLoading('btn-li', false, 'Sign In');
    const hint = document.getElementById('h-li-pass');
    if (hint) {
      hint.textContent = getFriendlyError(err.code);
      showHint('h-li-pass', true);
    }
    markErr('li-pass', true);
  }
}

async function handleSignup() {
  const fname = document.getElementById('su-fname')?.value.trim();
  const lname = document.getElementById('su-lname')?.value.trim();
  const school = document.getElementById('su-school')?.value.trim();
  const email = document.getElementById('su-email')?.value.trim();
  const pass  = document.getElementById('su-pass')?.value;
  let ok = true;

  if(!fname){ markErr('su-fname', true); showHint('h-su-fname', true); ok=false; } else { markErr('su-fname', false); showHint('h-su-fname', false); }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  markErr('su-email', !emailOk); showHint('h-su-email', !emailOk); if(!emailOk) ok=false;
  if(!pass || pass.length < 8){ markErr('su-pass', true); showHint('h-su-pass', true); ok=false; } else { markErr('su-pass', false); showHint('h-su-pass', false); }
  
  if(!ok) return;

  setLoading('btn-su', true, 'Create Account');
  
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const user = userCredential.user;
    await updateProfile(user, { displayName: fname });
    await db.collection('artifacts').doc('moot.coach').collection('users').doc(user.uid).set({
      firstName: fname, lastName: lname, university: school, email: email,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    });
    triggerWelcomeEmail();
    showAuthSuccess();
  } catch (err) {
    setLoading('btn-su', false, 'Create Account');
    const hint = document.getElementById('h-su-pass');
    if (hint) {
      hint.textContent = getFriendlyError(err.code);
      showHint('h-su-pass', true);
    }
    markErr('su-pass', true);
  }
}

async function handleGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    triggerWelcomeEmail();   // the server only sends for a brand-new account
    clearOverlayForm();
    goToWorkspaceWhenSignedIn();
  } catch (err) {
    console.error("Google Auth Error:", err);
    // Closing the Google window is a choice, not an error.
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    if (err.code === 'auth/popup-blocked') {
      showToast("Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.", "err");
    } else if (err.code === 'auth/operation-not-supported-in-this-environment') {
       showToast("Google Sign-In is blocked in this preview window. Please use Email/Password, or open your deployed site to use Google Auth.", "err");
    } else {
       showToast(getFriendlyError(err.code), "err");
    }
  }
}

async function handleForgotPassword() {
  const emailInput = document.getElementById('li-email');
  const email = emailInput?.value.trim();
  if (!email) {
    markErr('li-email', true);
    const hint = document.getElementById('h-li-email');
    if (hint) {
      hint.textContent = "Please enter your email to reset password.";
      showHint('h-li-email', true);
    }
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Password reset link sent to your email!", "ok");
    showHint('h-li-email', false);
    markErr('li-email', false);
  } catch (err) {
    showToast(getFriendlyError(err.code), "err");
  }
}

async function handleOverlayForgotPassword() {
  const emailInput = document.getElementById('auth-email');
  const email = emailInput?.value.trim();
  const statusMsg = document.getElementById('auth-status-message');
  const errorDiv = document.getElementById('auth-overlay-error');
  
  if (statusMsg) {
    statusMsg.className = "text-xs text-center mt-3";
    statusMsg.textContent = "";
  }
  if (errorDiv) {
    errorDiv.classList.add('hidden');
    errorDiv.textContent = "";
  }

  if (!email) {
    markErr('auth-email', true);
    if (errorDiv) {
      errorDiv.textContent = "Please enter your email address to reset your password.";
      errorDiv.classList.remove('hidden');
    }
    return;
  }

  markErr('auth-email', false);

  try {
    setLoading('forgot-password-btn', true, 'Sending...');
    await sendPasswordResetEmail(auth, email);
    setLoading('forgot-password-btn', false, 'Forgot password?');
    if (statusMsg) {
      statusMsg.className = "text-xs text-center mt-3 text-green-400";
      statusMsg.textContent = "Password reset link sent to your email!";
    }
  } catch (err) {
    setLoading('forgot-password-btn', false, 'Forgot password?');
    if (errorDiv) {
      errorDiv.textContent = getFriendlyError(err.code);
      errorDiv.classList.remove('hidden');
    }
  }
}

async function handleLogout() {
  // Close this person's work before the account goes, so the next person to
  // sign in on this browser does not find it loaded.
  if (typeof window.resetWorkspace === 'function') window.resetWorkspace();
  window.currentMootDocId = null;
  window.currentMootName = '';
  const recent = document.getElementById('ws-recent-list');
  if (recent) recent.innerHTML = '';
  const recentSec = document.getElementById('ws-recent-section');
  if (recentSec) recentSec.style.display = 'none';
  clearOverlayForm();
  window.__signingOut = true;
  try { await signOut(auth); } finally {
    navigate('landing');
    showToast('Signed out.', 'ok');
    window.__signingOut = false;
  }
}

let isInitialAuthCheck = true;

// Global Auth Observer Setup
onAuthChanged(async (user) => {
  const dashboardView = document.getElementById('view-workspace');
  const authView = document.getElementById('auth-overlay');

  if (user) {
    // Set global user first
    window.currentUser = user;
    identifyUserInClarity(user);

    const initial = user.displayName ? user.displayName.charAt(0) : (user.email ? user.email.charAt(0) : 'U');
    const avatar = document.getElementById('ws-avatar');
    if (avatar) avatar.textContent = initial.toUpperCase();
    
    document.querySelectorAll('.btn-login-nav').forEach(btn => {
      btn.textContent = 'Dashboard →';
    });
    const loginNavBtn = document.getElementById('nav-btn-login');
    if (loginNavBtn) loginNavBtn.style.display = 'none';
    
    // User is logged in: Show dashboard, hide auth
    if (authView) {
      authView.classList.add('hidden');
      authView.classList.remove('show');
    }
    
    // Do NOT auto-navigate into the workspace here. Even a logged-in user
    // should land on the home page after the intro; they enter the
    // workspace by clicking File Appearance (which routes them there
    // automatically since they're already authenticated — see navigate()
    // in ui.js).

    if (window.__openWorkspaceOnSignIn) {
      window.__openWorkspaceOnSignIn = false;
      navigate('workspace');
    }

    // ONLY fetch moots AFTER the UI is stable and user is set
    await loadRecentSessions();
  } else {
    window.currentUser = null;

    document.querySelectorAll('.btn-login-nav').forEach(btn => {
      btn.textContent = btn.getAttribute('data-default') || 'Get Started'; 
    });
    const loginNavBtn = document.getElementById('nav-btn-login');
    if (loginNavBtn) loginNavBtn.style.display = 'inline-block';
    
    // User is NOT logged in: Hide dashboard
    if (dashboardView) {
      dashboardView.classList.add('hidden');
      dashboardView.classList.remove('active');
    }
    
    // A session that ends on its own (expiry, another tab) asks them to sign
    // in again; signing out on purpose goes to the landing page instead.
    if (authView) {
      if (!isInitialAuthCheck && !window.__signingOut) {
        authView.classList.remove('hidden');
        authView.classList.add('show');
        authView.classList.remove('opacity-0', 'pointer-events-none');
      } else {
        authView.classList.add('hidden');
        authView.classList.remove('show');
      }
    }
  }
  isInitialAuthCheck = false;
});

// Setup DOM Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Wake the backend while the visitor is still reading the landing page.
  // An idle host can take tens of seconds to start, and that wait used to
  // land on their first AI request instead. Fire and forget.
  fetch(`${BASE_URL}/health`, { method: 'GET', cache: 'no-store' }).catch(() => {});

  // Initialize Microsoft Clarity
  initClarity();

  // ─── LANDING & LOGIN PAGE ROUTING LISTENERS ───
  document.getElementById('land-nav-logo')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('landing');
  });
  document.getElementById('nav-btn-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('login');
  });
  document.getElementById('nav-btn-get-started')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('login');
  });
  document.getElementById('hero-btn-start')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.startNewAnalysis();
  });
  document.getElementById('beta-btn-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('login');
  });
  document.getElementById('bottom-btn-practice')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.startNewAnalysis();
  });
  document.getElementById('footer-link-terms')?.addEventListener('click', (e) => {
    e.preventDefault();
    openLegalModal('terms');
  });
  document.getElementById('footer-link-privacy')?.addEventListener('click', (e) => {
    e.preventDefault();
    openLegalModal('privacy');
  });

  // Login Page elements
  document.getElementById('login-nav-logo')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('landing');
  });
  document.getElementById('login-nav-back')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('landing');
  });
  document.getElementById('login-forgot-pass')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleForgotPassword();
  });
  document.getElementById('btn-li')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleLogin();
  });
  document.getElementById('btn-google-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleGoogle();
  });
  document.getElementById('btn-google-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleGoogle();
  });
  document.getElementById('btn-su')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleSignup();
  });
  document.getElementById('signup-link-terms')?.addEventListener('click', (e) => {
    e.preventDefault();
    openLegalModal('terms');
  });
  document.getElementById('signup-link-privacy')?.addEventListener('click', (e) => {
    e.preventDefault();
    openLegalModal('privacy');
  });

  // Workspace elements
  document.getElementById('ws-logo')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('landing');
  });
  document.getElementById('auth-overlay-back')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('landing');
  });

  const tabLogin = document.getElementById('tab-login');
  if (tabLogin) {
    tabLogin.addEventListener('click', (e) => {
      e.preventDefault();
      switchAuthTab('login');
    });
  }

  const tabSignup = document.getElementById('tab-signup');
  if (tabSignup) {
    tabSignup.addEventListener('click', (e) => {
      e.preventDefault();
      switchAuthTab('signup');
    });
  }

  const linkGotoSignup = document.getElementById('link-goto-signup');
  if (linkGotoSignup) {
    linkGotoSignup.addEventListener('click', (e) => {
      e.preventDefault();
      switchAuthTab('signup');
    });
  }

  const linkGotoLogin = document.getElementById('link-goto-login');
  if (linkGotoLogin) {
    linkGotoLogin.addEventListener('click', (e) => {
      e.preventDefault();
      switchAuthTab('login');
    });
  }

  const oralTA = document.getElementById('oral-argument-input');
  if (oralTA) {
    oralTA.addEventListener('input', () => {
      const btn = document.getElementById('btn-oral-eval');
      if (btn) btn.disabled = oralTA.value.trim().length < 30;
    });
  }
  
  const benchTA = document.getElementById('bench-input');
  if (benchTA) {
    benchTA.addEventListener('input', () => {
      const btn = document.getElementById('btn-bench-send');
      if (btn) btn.disabled = benchTA.value.trim().length < 3;
    });
  }

  try {
    initArgumentBuilder();
  } catch (err) {
    console.error("Failed to initialize Argument Builder:", err);
  }

  try {
    initDashboard();
  } catch (err) {
    console.error("Failed to initialize Dashboard:", err);
  }

  // Sidebar navigation click listeners
  const navItems = [
    { id: 'wsb-upload', view: 'upload' },
    { id: 'wsb-results', view: 'results' },
    { id: 'wsb-oral', view: 'oral' },
    { id: 'wsb-bench', view: 'bench' },
    { id: 'wsb-builder', view: 'builder' }
  ];

  navItems.forEach(item => {
    const btn = document.getElementById(item.id);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        showWsPanel(item.view, btn);
      });
    }
  });

  // Ensure "Active Docket" / Dashboard view is default visible on load
  showWsPanel('upload');

  // Recent Moots click delegation
  const recentList = document.getElementById('ws-recent-list');
  if (recentList) {
    recentList.addEventListener('click', async (e) => {
      console.log("[DEBUG] Click event on ws-recent-list. target:", e.target, "currentTarget:", e.currentTarget);
      const btn = e.target.closest('.ws-sb-item');
      if (!btn) {
        console.log("[DEBUG] No .ws-sb-item closest to click target.");
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const onclickAttr = btn.getAttribute('onclick');
      const match = onclickAttr ? onclickAttr.match(/loadSavedSession\('([^']+)'\)/) : null;
      if (!match) {
        console.log("[DEBUG] Click target has no matching loadSavedSession onclick attr.");
        return;
      }
      const docId = match[1];
      console.log("[DEBUG] Click delegation calling loadSavedSession for docId:", docId);

      try {
        await loadSavedSession(docId);
      } catch (err) {
        console.error("Error loading session:", err);
      }
    });
  }

  // Auth Overlay toggle and submit listeners
  const overlayToggleBtn = document.getElementById('auth-overlay-toggle-btn');
  if (overlayToggleBtn) {
    overlayToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleOverlayMode(!isOverlaySignUpMode);
    });
  }

  const overlaySubmitBtn = document.getElementById('auth-overlay-submit');
  if (overlaySubmitBtn) {
    overlaySubmitBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (isOverlaySignUpMode) {
        await handleOverlaySignup();
      } else {
        await handleOverlayLogin();
      }
    });
  }

  // Enter submits from any field, as it does in every other sign-in form.
  document.querySelectorAll('#auth-overlay-form input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('auth-overlay-submit')?.click(); }
    });
  });
  document.getElementById('auth-overlay-google')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleGoogle();
  });

  const forgotPasswordBtn = document.getElementById('forgot-password-btn');
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await handleOverlayForgotPassword();
    });
  }
});

// Map handlers to window to preserve inline HTML onclick/onkeydown mappings
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleGoogle = handleGoogle;
window.handleForgotPassword = handleForgotPassword;
window.handleOverlayForgotPassword = handleOverlayForgotPassword;
window.handleLogout = handleLogout;

window.openLegalModal = openLegalModal;
window.closeLegalModal = closeLegalModal;
window.toggleMobileSidebar = toggleMobileSidebar;
window.navigate = navigate;
window.switchAuthTab = switchAuthTab;
window.showWsPanel = showWsPanel;
window.handleFileSelect = handleFileSelect;
window.removeFile = removeFile;
window.runAnalysis = runAnalysis;
window.loadSavedSession = loadSavedSession;
window.copyAnalysis = copyAnalysis;
window.updateWsMootName = updateWsMootName;
window.toggleSection = toggleSection;
window.copySectionText = copySectionText;
window.scrollToSection = scrollToSection;

window.setOralDifficulty = setOralDifficulty;
window.clearOralContext = clearOralContext;
window.runOralEvaluation = runOralEvaluation;

window.setBenchDifficulty = setBenchDifficulty;
window.startBenchSession = startBenchSession;
window.clearBenchSession = clearBenchSession;
window.exitChambers = exitChambers;
window.submitToBench = submitToBench;
window.handleBenchKeydown = handleBenchKeydown;
window.startOralRound = startOralRound;
window.stopOralRound = stopOralRound;

window.copyBuilderArgument = copyBuilderArgument;
window.populateIssuesFromAnalysis = populateIssuesFromAnalysis;
window.toggleAuthority = toggleAuthority;
window.renderStage3Workspace = renderStage3Workspace;
window.getCurrentSelectedSide = getCurrentSelectedSide;

// The Extra Issues step and the inline onclick handlers on its cards.
// renderStage2Issues goes up too: adding an issue has to refresh the issue
// workspace immediately, or the advocate adds one and sees nothing happen.
window.renderExtraIssues = renderExtraIssues;
window.setIssueStatus = setIssueStatus;
window.toggleDismissedIssues = toggleDismissedIssues;
window.renderStage2Issues = renderStage2Issues;
window.refreshAdditionalIssuesCard = refreshAdditionalIssuesCard;

window.goToStage = goToStage;
window.wizardNext = wizardNext;
window.wizardPrev = wizardPrev;
window.selectIssueFromCard = selectIssueFromCard;
window.switchStage5Tab = switchStage5Tab;
window.renderStage4OralNotes = renderStage4OralNotes;

async function triggerWelcomeEmail() {
  // Sent by the server: browsers cannot write to the mail queue (the
  // Firestore rules forbid it, rightly), so the old client-side write never
  // delivered anything. The server sends only to the signed-in user's own
  // address, once, right after the account is created.
  try {
    const u = auth.currentUser;
    if (!u) return;
    const token = await u.getIdToken();
    await fetch(`${BASE_URL}/api/welcome`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  } catch (err) {
    console.warn('[WELCOME EMAIL] not sent:', err && err.message);
  }
}
