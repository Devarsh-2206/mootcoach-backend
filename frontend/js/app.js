import { 
  auth, 
  db, 
  onAuthChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider
} from './services/firebase.js';
import { BASE_URL } from './config.js';
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
  switchAuthTab
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
  submitToBench,
  handleBenchKeydown,
  startOralRound,
  stopOralRound
} from './components/benchSimulator.js';

import {
  initArgumentBuilder,
  populateIssuesFromAnalysis,
  copyBuilderArgument
} from './components/argumentBuilder.js';

// Auth Overlay State and Handlers
let isOverlaySignUpMode = false;

function toggleOverlayMode(signup) {
  isOverlaySignUpMode = signup;
  const toggleBtn = document.getElementById('auth-overlay-toggle-btn');
  const toggleText = document.getElementById('auth-overlay-toggle-text');
  const submitBtn = document.getElementById('auth-overlay-submit');
  const signupFields = document.getElementById('auth-overlay-signup-fields');
  const errorDiv = document.getElementById('auth-overlay-error');

  if (errorDiv) errorDiv.classList.add('hidden');
  
  // Clear any existing field errors
  markErr('auth-email', false);
  markErr('auth-password', false);
  markErr('auth-fname', false);

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
  markErr('auth-email', !emailOk);
  if (!emailOk) ok = false;
  
  if (!pass) {
    markErr('auth-password', true);
    ok = false;
  } else {
    markErr('auth-password', false);
  }
  
  if (!ok) return;
  
  setLoading('auth-overlay-submit', true, 'Sign In');
  if (errorDiv) errorDiv.classList.add('hidden');

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // Success: observer will handle hiding overlay and showing dashboard
    setLoading('auth-overlay-submit', false, 'Sign In');
  } catch (err) {
    setLoading('auth-overlay-submit', false, 'Sign In');
    if (errorDiv) {
      errorDiv.textContent = getFriendlyError(err.code);
      errorDiv.classList.remove('hidden');
    }
    markErr('auth-password', true);
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

  if (!fname) {
    markErr('auth-fname', true);
    ok = false;
  } else {
    markErr('auth-fname', false);
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  markErr('auth-email', !emailOk);
  if (!emailOk) ok = false;

  if (!pass || pass.length < 8) {
    markErr('auth-password', true);
    ok = false;
    if (errorDiv) {
      errorDiv.textContent = "Password must be at least 8 characters.";
      errorDiv.classList.remove('hidden');
    }
  } else {
    markErr('auth-password', false);
  }

  if (!ok) return;

  setLoading('auth-overlay-submit', true, 'Create Account');
  if (errorDiv) errorDiv.classList.add('hidden');

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const user = userCredential.user;
    
    if (typeof user.updateProfile === 'function') {
      await user.updateProfile({ displayName: fname });
    }
    
    // Save to Firestore under the new secure path moot.coach
    await db.collection('artifacts').doc('moot.coach').collection('users').doc(user.uid).set({
      firstName: fname,
      lastName: lname || '',
      university: school || '',
      email: email,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Success will be handled by auth state observer
    setLoading('auth-overlay-submit', false, 'Create Account');
  } catch (err) {
    setLoading('auth-overlay-submit', false, 'Create Account');
    if (errorDiv) {
      errorDiv.textContent = getFriendlyError(err.code);
      errorDiv.classList.remove('hidden');
    }
    markErr('auth-password', true);
  }
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
    await user.updateProfile({ displayName: fname });
    await db.collection('artifacts').doc('moot.coach').collection('users').doc(user.uid).set({
      firstName: fname, lastName: lname, university: school, email: email,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    });
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
    showAuthSuccess();
  } catch (err) {
    console.error("Google Auth Error:", err);
    if (err.code === 'auth/operation-not-supported-in-this-environment') {
       showToast("Google Sign-In is blocked in this preview window. Please use Email/Password, or open your deployed site to use Google Auth.", "err");
    } else {
       showToast("Google Sign-in failed: " + err.message, "err");
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
    // Keep using legacy auth for other features if necessary, or update to modular later. Compat auth still works.
    await auth.sendPasswordResetEmail(email);
    showToast("Password reset link sent to your email!", "ok");
    showHint('h-li-email', false);
    markErr('li-email', false);
  } catch (err) {
    showToast(getFriendlyError(err.code), "err");
  }
}

function handleLogout() {
  signOut(auth);
}

// Global Auth Observer Setup
onAuthChanged(async (user) => {
  const dashboardView = document.getElementById('view-workspace');
  const authView = document.getElementById('auth-overlay');

  if (user) {
    // Set global user first
    window.currentUser = user;

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
    if (dashboardView) {
      dashboardView.classList.remove('hidden');
      dashboardView.classList.add('active');
    }
    
    // Automatically navigate to workspace
    navigate('workspace');
    
    // ONLY fetch moots AFTER the UI is stable and user is set
    await loadRecentSessions(); 
  } else {
    window.currentUser = null;

    document.querySelectorAll('.btn-login-nav').forEach(btn => {
      btn.textContent = btn.getAttribute('data-default') || 'Get Started'; 
    });
    const loginNavBtn = document.getElementById('nav-btn-login');
    if (loginNavBtn) loginNavBtn.style.display = 'inline-block';
    
    // User is NOT logged in: Hide dashboard, hide auth overlay
    if (dashboardView) {
      dashboardView.classList.add('hidden');
      dashboardView.classList.remove('active');
    }
    if (authView) {
      authView.classList.add('hidden');
      authView.classList.remove('show');
    }
  }
});

// Setup DOM Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('ws-dropzone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag-over'); if(e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]); });
  }

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

  initArgumentBuilder();
  initDashboard();

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
      const btn = e.target.closest('.ws-sb-item');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const onclickAttr = btn.getAttribute('onclick');
      const match = onclickAttr ? onclickAttr.match(/loadSavedSession\('([^']+)'\)/) : null;
      if (!match) return;
      const docId = match[1];

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
});

// Map handlers to window to preserve inline HTML onclick/onkeydown mappings
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleGoogle = handleGoogle;
window.handleForgotPassword = handleForgotPassword;
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
window.submitToBench = submitToBench;
window.handleBenchKeydown = handleBenchKeydown;
window.startOralRound = startOralRound;
window.stopOralRound = stopOralRound;

window.copyBuilderArgument = copyBuilderArgument;
window.populateIssuesFromAnalysis = populateIssuesFromAnalysis;


