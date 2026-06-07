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
  selectIssueFromCard
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
  copyBuilderArgument,
  toggleAuthority,
  renderStage3Workspace,
  getCurrentSelectedSide
} from './components/argumentBuilder.js';
import { initClarity, identifyUserInClarity } from './services/clarity.js';

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
    
    await updateProfile(user, { displayName: fname });
    
    // Save to Firestore under the new secure path moot.coach
    await db.collection('artifacts').doc('moot.coach').collection('users').doc(user.uid).set({
      firstName: fname,
      lastName: lname || '',
      university: school || '',
      email: email,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Trigger onboarding welcome email
    await triggerWelcomeEmail(email, fname);
    
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
    await updateProfile(user, { displayName: fname });
    await db.collection('artifacts').doc('moot.coach').collection('users').doc(user.uid).set({
      firstName: fname, lastName: lname, university: school, email: email,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    });
    await triggerWelcomeEmail(email, fname);
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

function handleLogout() {
  signOut(auth);
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
    if (dashboardView) {
      dashboardView.classList.remove('hidden');
      dashboardView.classList.add('active');
    }
    
    // Automatically navigate to workspace
    navigate('workspace');
    
    // Enforce default routing to Lodge Proposition screen
    showWsPanel('upload');
    
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
    
    // Enforce unhiding auth overlay when user signs out, preventing black void
    if (authView) {
      if (!isInitialAuthCheck) {
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
    navigate('login');
  });
  document.getElementById('beta-btn-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('login');
  });
  document.getElementById('bottom-btn-practice')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('login');
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
window.submitToBench = submitToBench;
window.handleBenchKeydown = handleBenchKeydown;
window.startOralRound = startOralRound;
window.stopOralRound = stopOralRound;

window.copyBuilderArgument = copyBuilderArgument;
window.populateIssuesFromAnalysis = populateIssuesFromAnalysis;
window.toggleAuthority = toggleAuthority;
window.renderStage3Workspace = renderStage3Workspace;
window.getCurrentSelectedSide = getCurrentSelectedSide;

window.goToStage = goToStage;
window.wizardNext = wizardNext;
window.wizardPrev = wizardPrev;
window.selectIssueFromCard = selectIssueFromCard;
window.switchStage5Tab = switchStage5Tab;
window.renderStage4OralNotes = renderStage4OralNotes;

async function triggerWelcomeEmail(email, fname) {
  try {
    const cleanFname = String(fname || 'Advocate').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    await db.collection('mail').add({
      to: email,
      message: {
        subject: 'Welcome to MootCoach — Your Premium Legal Advocacy Partner',
        html: `
<div style="font-family: 'Merriweather', Georgia, serif; line-height: 1.8; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ecebe7; background-color: #fcfbfa;">
  <div style="text-align: center; border-bottom: 2px double #ddd; padding-bottom: 15px; margin-bottom: 25px;">
    <h1 style="font-family: Arial, sans-serif; font-size: 22px; letter-spacing: 0.1em; text-transform: uppercase; margin: 0; color: #a88220;">MootCoach AI</h1>
    <span style="font-family: Arial, sans-serif; font-size: 9px; color: #888; letter-spacing: 0.15em; text-transform: uppercase;">Appellate Advocacy Suite</span>
  </div>
  
  <p>Dear ${cleanFname},</p>
  
  <p>Welcome to <strong>MootCoach AI</strong>, the premium legal-tech simulator designed to elevate your appellate advocacy and courtroom performance.</p>
  
  <h3 style="font-family: Arial, sans-serif; font-size: 14px; text-transform: uppercase; color: #a88220; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 25px;">Platform Overview & Getting Started</h3>
  
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
  
  <h3 style="font-family: Arial, sans-serif; font-size: 14px; text-transform: uppercase; color: #a88220; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 25px;">Professional Support</h3>
  
  <p style="font-size: 13px;">If you have questions or feedback, please reach out to us at <a href="mailto:support@mootcoach.ai" style="color: #a88220; text-decoration: none;">support@mootcoach.ai</a>.</p>
  
  <p style="margin-top: 35px; font-size: 13px;">Sincerely,<br><strong>The MootCoach Team</strong></p>
  
  <div style="text-align: center; border-top: 1px solid #eee; margin-top: 40px; padding-top: 15px; font-family: Arial, sans-serif; font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.1em;">
    Appellate Drafting Studio · MootCoach AI
  </div>
</div>
        `
      }
    });
    console.log(`[DEBUG AUDIT] Onboarding welcome email queued in Firestore for ${email}`);
  } catch (err) {
    console.error("[WELCOME EMAIL ERROR]", err);
  }
}
