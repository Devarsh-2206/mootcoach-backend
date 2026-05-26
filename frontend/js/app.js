import { auth, db, onAuthChanged } from './services/firebase.js';
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
  currentPropositionContext
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

// Auth Event Handlers
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
    await auth.signInWithEmailAndPassword(email, pass);
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
    const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
    const user = userCredential.user;
    await user.updateProfile({ displayName: fname });
    await db.collection('artifacts').doc('mootcoach').collection('users').doc(user.uid).set({
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
    const provider = new window.firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
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
    await auth.sendPasswordResetEmail(email);
    showToast("Password reset link sent to your email!", "ok");
    showHint('h-li-email', false);
    markErr('li-email', false);
  } catch (err) {
    showToast(getFriendlyError(err.code), "err");
  }
}

function handleLogout() {
  auth.signOut();
}

// Global Auth Observer Setup
onAuthChanged(user => {
  if (user) {
    const initial = user.displayName ? user.displayName.charAt(0) : (user.email ? user.email.charAt(0) : 'U');
    const avatar = document.getElementById('ws-avatar');
    if (avatar) avatar.textContent = initial.toUpperCase();
    
    document.querySelectorAll('.btn-login-nav').forEach(btn => {
      btn.textContent = 'Dashboard →';
    });
    const loginNavBtn = document.getElementById('nav-btn-login');
    if (loginNavBtn) loginNavBtn.style.display = 'none';
    
    const currentView = document.querySelector('.view.active')?.id;
    if (currentView === 'view-login') {
      navigate('workspace');
    }
    
    loadRecentSessions(); 
  } else {
    document.querySelectorAll('.btn-login-nav').forEach(btn => {
      btn.textContent = btn.getAttribute('data-default') || 'Get Started'; 
    });
    const loginNavBtn = document.getElementById('nav-btn-login');
    if (loginNavBtn) loginNavBtn.style.display = 'inline-block';
    
    const currentView = document.querySelector('.view.active')?.id;
    if (currentView === 'view-workspace') {
      navigate('landing');
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
        switchWorkspaceView(item.view, btn);
      });
    }
  });

  // Ensure "New Workspace" / Dashboard view is default visible on load
  switchWorkspaceView('upload');

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

      // Remove active styling from all other sidebar buttons
      document.querySelectorAll('.ws-sb-item').forEach(item => {
        item.classList.remove('active', 'bg-moot-accent/10', 'text-moot-accent');
      });

      // Add active styling to the clicked item
      btn.classList.add('active', 'bg-moot-accent/10', 'text-moot-accent');

      const titleText = btn.title || btn.textContent.trim().replace(/^📄\s*/, '') || 'Untitled Moot';

      try {
        await loadSavedSession(docId);
      } catch (err) {
        console.error("Error loading session:", err);
      }

      // Update the "MOOT NAME" text in the "MOOT DETAILS" panel to match the clicked item's name
      updateWsMootName(titleText);

      // Switch main view to the Analysis Results container
      switchWorkspaceView('results');

      // Keep the clicked Recent Moot item active alongside Analysis Results
      btn.classList.add('active', 'bg-moot-accent/10', 'text-moot-accent');
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

export function switchWorkspaceView(viewName, buttonEl) {
  const views = ['upload', 'results', 'oral', 'bench', 'builder'];
  
  // Hide all panels
  views.forEach(v => {
    const el = document.getElementById('wsp-' + v);
    if (el) {
      el.classList.remove('active');
      el.classList.add('hidden');
    }
  });
  
  // Deactivate all sidebar items and remove active styles including Tailwind classes
  document.querySelectorAll('.ws-sb-item').forEach(btn => {
    btn.classList.remove('active', 'bg-moot-accent/10', 'text-moot-accent');
  });
  
  // Show target panel
  const targetPanel = document.getElementById('wsp-' + viewName);
  if (targetPanel) {
    targetPanel.classList.add('active');
    targetPanel.classList.remove('hidden');
  }
  
  // Activate clicked button or matching button
  if (buttonEl) {
    buttonEl.classList.add('active', 'bg-moot-accent/10', 'text-moot-accent');
  } else {
    const btn = document.getElementById('wsb-' + viewName);
    if (btn) btn.classList.add('active', 'bg-moot-accent/10', 'text-moot-accent');
  }

  // Preserve context checks
  if (viewName === 'oral') {
    const notice = document.getElementById('oral-context-notice');
    if (notice) {
      const hasContext = !!(currentPropositionContext || document.getElementById('wsib-file')?.textContent?.trim() !== 'No file uploaded');
      notice.style.display = hasContext ? 'flex' : 'none';
    }
  }
  if (viewName === 'bench' && !window.benchActive) {
    const noCtx = document.getElementById('bench-no-context');
    if (noCtx) {
      const hasContext = !!(currentPropositionContext || document.getElementById('wsib-file')?.textContent?.trim() !== 'No file uploaded');
      noCtx.style.display = hasContext ? 'none' : 'block';
    }
  }
  if (viewName === 'builder') {
    if (typeof window.populateIssuesFromAnalysis === 'function') {
      window.populateIssuesFromAnalysis();
    }
  }

  const sidebar = document.getElementById('ws-sidebar');
  if (sidebar && sidebar.classList.contains('show')) {
    toggleMobileSidebar();
  }
}

// Override showWsPanel to run switchWorkspaceView
window.showWsPanel = function(name) {
  switchWorkspaceView(name);
};
