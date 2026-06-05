import { BASE_URL } from '../config.js';
import { currentUser, db, firebaseRef } from '../services/firebase.js';
import { logSessionSecurely, checkBackendHealth } from '../services/api.js';
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
      <p>We utilize enterprise-grade LLM APIs (such as Groq and Llama) operating under strict zero-data-retention agreements where applicable. Your competition strategies are NOT ingested into public base models.</p>
      <h3>4. Data Control</h3>
      <p>You retain full control over your data. You reserve the right to completely wipe your workspace. If you require a complete account deletion, please contact our support team.</p>
    `;
  }
  
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

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
      return "Password should be at least 6 characters.";
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
  if (targetView) targetView.classList.add('active');
  
  document.body.style.overflow = (view === 'workspace') ? 'hidden' : 'auto';
  window.scrollTo(0, 0);
  if (view === 'workspace') triggerBackendCheck();

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
    labelEl.textContent = '🟢 Server Online';
  } else {
    statusEl.className = 'backend-status offline';
    labelEl.textContent = '🔴 Server Offline';
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

export async function loadRecentSessions() {
  if (!currentUser) return;
  const sec = document.getElementById('ws-recent-section');
  const list = document.getElementById('ws-recent-list');
  if(!sec || !list) return;

  try {
    const snapshot = await db.collection('artifacts').doc('moot.coach')
      .collection('users').doc(currentUser.uid).collection('analyses')
      .orderBy('timestamp', 'desc').limit(6).get();
      
    if (snapshot.empty) {
      sec.style.display = 'none';
      return;
    }
    
    sec.style.display = 'flex';
    let html = '';
    snapshot.forEach(doc => {
      const d = doc.data();
      const title = d.mootName || d.fileName || 'Untitled Analysis';
      html += `<button class="ws-sb-item" onclick="loadSavedSession('${doc.id}')" title="${esc(title)}">
        <span class="ws-sb-icon">📄</span> <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(title)}</span>
      </button>`;
    });
    list.innerHTML = html;
  } catch (e) {
    console.error("Failed to load history", e);
    showToast("Failed to load history: " + e.message, "err");
  }
}

export async function loadSavedSession(docId) {
  console.log("[DEBUG] loadSavedSession invoked with docId:", docId);
  console.trace("[DEBUG] loadSavedSession trace");
  if (!currentUser) return;
  
  // Failsafe in case it's passed a click event instead of docId string
  if (docId && typeof docId === 'object' && docId.target) {
    const btn = docId.target.closest('.ws-sb-item');
    const onclickAttr = btn ? btn.getAttribute('onclick') : '';
    const match = onclickAttr ? onclickAttr.match(/loadSavedSession\('([^']+)'\)/) : null;
    docId = match ? match[1] : null;
  }
  if (!docId || typeof docId !== 'string') return;

  document.getElementById('loading-overlay').classList.add('show');
  
  const stepsDiv = document.querySelector('.lo-steps');
  const labelEl = document.getElementById('lo-label');
  if (stepsDiv) stepsDiv.style.display = 'none';
  if (labelEl) labelEl.textContent = 'Loading saved analysis...';
  
  try {
    const doc = await db.collection('artifacts').doc('moot.coach')
      .collection('users').doc(currentUser.uid).collection('analyses').doc(docId).get();
      
    if (!doc.exists) throw new Error("Analysis not found.");
    
    const data = doc.data();
    updateWsMootName(data.mootName || '');
    document.getElementById('res-file-chip').textContent = `· ${data.fileName || 'Saved Document'}`;
    
    const wsibFile = document.getElementById('wsib-file');
    if (wsibFile) {
      wsibFile.textContent = data.fileName || 'Saved Document';
      wsibFile.className = 'wsib-value';
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    hideLoading();
    if (stepsDiv) stepsDiv.style.display = 'flex'; 
    if (data.analysisData) {
      showStructuredResults(data.analysisData);
      
      // Highlight matching recent moot button in sidebar (results tab is already highlighted by showWsPanel inside showStructuredResults)
      const recentBtn = document.querySelector(`button[onclick*="${docId}"]`);
      if (recentBtn) {
        recentBtn.classList.add('active', 'bg-moot-accent/10', 'text-moot-accent');
      }
    } else {
      showError("Invalid saved data.");
    }
  } catch (e) {
    hideLoading();
    if (stepsDiv) stepsDiv.style.display = 'flex'; 
    showError("Could not load saved session: " + e.message);
    showToast("Failed to load saved session: " + e.message, "err");
  }
}

/* ─── RENDERERS & UTILS ─── */
export const SECTION_CONFIGS = {
  summary:      { icon:'◈', iconCls:'asc-icon-gold',   badgeTxt:'Overview',   badgeCls:'badge-gold',   title:'Case Summary'                 },
  legal:        { icon:'⚖', iconCls:'asc-icon-blue',   badgeTxt:'Issues',     badgeCls:'badge-blue',   title:'Legal Issues'                 },
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
  strengths:    { icon:'▲', iconCls:'asc-icon-green',  badgeTxt:'Strengths',  badgeCls:'badge-green',  title:'Proposition Strengths'        },
  weaknesses:   { icon:'▼', iconCls:'asc-icon-red',    badgeTxt:'Weaknesses', badgeCls:'badge-red',    title:'Proposition Weaknesses'       },
  scoring:      { icon:'◎', iconCls:'asc-icon-gold',   badgeTxt:'Evaluation', badgeCls:'badge-gold',   title:'Scoring Breakdown'         },
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

  // Convert markdown headers to styled HTML headers instead of leaving them raw
  t = t.replace(/^\s*#{5,6}\s*(.+)$/gm, '<h6 style="font-family:var(--font-sans, Arial); font-size:11px; font-weight:bold; letter-spacing:0.04em; color:var(--white-2); margin-top:10px; margin-bottom:4px; text-transform:uppercase;">$1</h6>');
  t = t.replace(/^\s*####\s*(.+)$/gm, '<h5 style="font-family:var(--font-sans, Arial); font-size:12px; font-weight:bold; letter-spacing:0.06em; color:var(--white); margin-top:14px; margin-bottom:6px; text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:2px;">$1</h5>');
  t = t.replace(/^\s*###\s*(.+)$/gm, '<h4 style="font-family:var(--font-sans, Arial); font-size:14px; font-weight:bold; letter-spacing:0.08em; color:var(--moot-accent); margin-top:18px; margin-bottom:8px; text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">$1</h4>');
  t = t.replace(/^\s*##\s*(.+)$/gm, '<h3 style="font-family:var(--font-serif, Merriweather); font-size:16px; font-weight:normal; letter-spacing:0.1em; color:var(--moot-accent); margin-top:22px; margin-bottom:10px; text-transform:uppercase; border-bottom:2px double rgba(255,255,255,0.15); padding-bottom:6px;">$1</h3>');

  // Escape HTML characters (excluding our newly added HTML tags, so do escaping first or be careful)
  let escaped = t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  
  // Re-run the heading replacements on the escaped text to ensure tags work
  escaped = escaped.replace(/^\s*#{5,6}\s*(.+)$/gm, '<h6 style="font-family:var(--font-sans, Arial); font-size:11px; font-weight:bold; letter-spacing:0.04em; color:var(--white-2); margin-top:10px; margin-bottom:4px; text-transform:uppercase;">$1</h6>');
  escaped = escaped.replace(/^\s*####\s*(.+)$/gm, '<h5 style="font-family:var(--font-sans, Arial); font-size:12px; font-weight:bold; letter-spacing:0.06em; color:var(--white); margin-top:14px; margin-bottom:6px; text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:2px;">$1</h5>');
  escaped = escaped.replace(/^\s*###\s*(.+)$/gm, '<h4 style="font-family:var(--font-sans, Arial); font-size:14px; font-weight:bold; letter-spacing:0.08em; color:var(--moot-accent); margin-top:18px; margin-bottom:8px; text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">$1</h4>');
  escaped = escaped.replace(/^\s*##\s*(.+)$/gm, '<h3 style="font-family:var(--font-serif, Merriweather); font-size:16px; font-weight:normal; letter-spacing:0.1em; color:var(--moot-accent); margin-top:22px; margin-bottom:10px; text-transform:uppercase; border-bottom:2px double rgba(255,255,255,0.15); padding-bottom:6px;">$1</h3>');

  // Convert Bold/Italics markdown to HTML
  escaped = escaped.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/`([\s\S]+?)`/g, '<code style="background:rgba(255,255,255,.07);padding:1px 5px;border-radius:4px;font-size:.82em;color:var(--gold);">$1</code>');

  // Clean raw horizontal rules
  escaped = escaped.replace(/^\s*[-*_]{3,}\s*$/gm, '<hr style="border:none; border-top:1px solid rgba(255,255,255,0.1); margin:12px 0;">');

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

export function renderCases(content, rawCasesArray) {
  if (rawCasesArray && Array.isArray(rawCasesArray) && rawCasesArray.length && typeof rawCasesArray[0] === 'object') {
    return rawCasesArray.map((c, i) => {
      const n    = i + 1;
      const conf = c.confidenceLevel || 'medium';
      const borderStyle = conf === 'high' ? '' : conf === 'low' ? 'style="border-color:rgba(224,82,82,.2)"' : 'style="border-color:rgba(251,191,36,.2)"';
      const caveatHTML  = (c.caveat && c.caveat !== 'null' && c.caveat !== null)
        ? `<span style="font-size:.65rem;color:#fbbf24;background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.2);border-radius:4px;padding:2px 7px;margin-top:5px;display:inline-block;">⚠ ${esc(String(c.caveat))}</span>`
        : '';
      const jBadge = c.jurisdiction
        ? `<span style="font-size:.6rem;color:var(--white-muted);background:rgba(255,255,255,.04);border:1px solid var(--glass-b);border-radius:3px;padding:1px 6px;margin-left:5px;">${esc(c.jurisdiction)}</span>`
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
        </div>
      </div>`;
    }).join('');
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
    case 'strengths':    return renderBullets(content,'ib-green');
    case 'weaknesses':   return renderBullets(content,'ib-red');
    case 'argDefects':   return renderBullets(content,'ib-red');
    default:             return renderBullets(content);
  }
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

export function scrollToSection(i) {
  const el = document.getElementById(`asc-card-${i}`);
  const body = document.querySelector('.ws-results-panel .res-body');
  if (el && body) body.scrollTo({ top: el.offsetTop - 50, behavior: 'smooth' });
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
  resBody.addEventListener('scroll', () => {
    let closest = 0, minDist = Infinity;
    document.querySelectorAll('.analysis-section-card[id^="asc-card-"]').forEach(card => {
      const dist = Math.abs(card.getBoundingClientRect().top - 120);
      if (dist < minDist) { minDist = dist; closest = +card.id.replace('asc-card-',''); }
    });
    navBtns.forEach((n, i) => n.classList.toggle('active', i === closest));
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

  const sevBorder = { fatal:'#e05252', significant:'#fbbf24', minor:'#2dd4bf' };
  const sevStyle  = {
    fatal:       'background:rgba(224,82,82,.1);border:1px solid rgba(224,82,82,.28);color:#e05252;',
    significant: 'background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.22);color:#fbbf24;',
    minor:       'background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.22);color:#2dd4bf;'
  };

  const renderSideDefects = (items, label) => {
    if (!items || !items.length) return '';
    const rows = items.map(d => {
      const sev  = (d.severity || 'minor').toLowerCase();
      const bc   = sevBorder[sev] || sevBorder.minor;
      const bsty = sevStyle[sev]  || sevStyle.minor;
      return `
        <div style="margin-bottom:11px;padding:14px 16px;background:rgba(255,255,255,.02);border:1px solid var(--glass-b);border-left:3px solid ${bc};border-radius:0 9px 9px 0;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
            <div style="font-size:.78rem;font-weight:500;color:var(--white-2);flex:1;font-style:italic;">"${fmtInline(d.argument || '')}"</div>
            <div style="display:flex;gap:5px;flex-shrink:0;">
              <span style="font-size:.56rem;padding:2px 7px;border-radius:4px;letter-spacing:.08em;text-transform:uppercase;font-weight:500;${bsty}">${sev}</span>
              <span style="font-size:.56rem;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,.04);border:1px solid var(--glass-b);color:var(--white-muted);">${esc(d.defectType || '')}</span>
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
        ${documentType ? `<div style="display:flex;align-items:center;gap:8px;padding:9px 14px;background:rgba(255,255,255,.03);border:1px solid var(--glass-b);border-radius:8px;margin-bottom:18px;"><span style="font-size:.58rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--white-muted);">Detected as:</span><span style="font-size:.82rem;color:var(--white-2);">${esc(documentType)}</span></div>` : ''}
        <div style="font-size:.76rem;color:var(--white-muted);line-height:1.75;margin-bottom:22px;">MootCoach accepts: moot court propositions, legal case problems, constitutional disputes, memorials, statutes, judicial orders, and law-related submissions only.</div>
        <button onclick="showWsPanel('upload')" style="font-family:var(--sans);font-size:.74rem;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--white-muted);background:rgba(255,255,255,.04);border:1px solid var(--glass-b);border-radius:8px;padding:10px 20px;cursor:pointer;">← Upload a Different Document</button>
      </div>
    </div>`;
  document.getElementById('res-empty').style.display = 'none';
  document.getElementById('res-filled').style.display = 'flex';
  showWsPanel('results');
  document.getElementById('analyze-submit-btn').disabled = false;
}

export function renderCategoryScores(categoryScores) {
  if (!categoryScores) return '';
  const cats = [
    { key:'issueIdentification', label:'Issue Identification', max:20 },
    { key:'legalComplexity',     label:'Legal Complexity',     max:20 },
    { key:'constitutionalDepth', label:'Constitutional Depth', max:15 },
    { key:'precedentPotential',  label:'Precedent Potential',  max:15 },
    { key:'argumentBalance',     label:'Argument Balance',     max:10 },
    { key:'mootReadiness',       label:'Moot Readiness',       max:10 },
    { key:'originality',         label:'Originality / Novelty',max:10 },
  ];
  const rows = cats.map(cat => {
    const d = categoryScores[cat.key];
    if (!d) return '';
    const sc  = Math.min(cat.max, Math.max(0, Number(d.score) || 0));
    const pct = Math.round((sc / cat.max) * 100);
    const bCls = pct >= 74 ? 'sf-green' : pct >= 50 ? 'sf-gold' : 'sf-red';
    return `
      <div style="margin-bottom:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
          <div style="font-size:.8rem;color:var(--white-2);">${cat.label}</div>
          <div style="font-size:.8rem;color:var(--white);font-weight:500;">${sc}<span style="color:var(--white-muted);font-weight:300;">/${cat.max}</span></div>
        </div>
        <div class="sc-bar" style="height:4px;border-radius:2px;">
          <div class="sc-bar-fill ${bCls}" data-target="${pct}%" style="width:0%"></div>
        </div>
        ${d.justification ? `<div style="font-size:.74rem;color:var(--white-muted);margin-top:7px;line-height:1.65;">${fmtInline(d.justification)}</div>` : ''}
      </div>`;
  }).join('');
  return `
    <div class="analysis-section-card" id="asc-card-scoring" style="animation-delay:0.04s">
      <div class="asc-header" id="asc-h-scoring" onclick="toggleSection('scoring')">
        <div class="asc-header-left">
          <div class="asc-icon asc-icon-gold">◎</div>
          <div class="asc-title">Scoring Breakdown</div>
        </div>
        <div class="asc-header-right">
          <span class="asc-badge badge-gold">Evaluation</span>
          <button class="asc-copy" onclick="event.stopPropagation();copySectionText('scoring',this)">Copy</button>
          <span class="asc-chevron">▾</span>
        </div>
      </div>
      <div class="asc-body" id="asc-b-scoring" style="padding:22px 24px;">${rows}</div>
    </div>`;
}

export function buildStructuredScoreHero(data) {
  const score  = Number(data.overallScore) || 0;
  const oralD  = data.oralDifficulty  || 'medium';
  const resD   = data.researchDifficulty || 'medium';
  const verdict = data.scoreVerdict || 'Average';
  const sPct   = score;
  const oPct   = oralD === 'high' ? 84 : oralD === 'low' ? 25 : 52;
  const rPct   = resD  === 'high' ? 88 : resD  === 'low' ? 28 : 56;
  const sBCls  = score >= 73 ? 'sf-green' : score >= 51 ? 'sf-gold' : 'sf-red';
  
  const txtCls = score >= 73 ? 'text-green' : score >= 51 ? 'text-gold' : 'text-red';
  
  const dlbl   = { high:'High', medium:'Moderate', low:'Low' };
  const oReason = data.oralDifficultyReason   ? data.oralDifficultyReason.slice(0,72)   + (data.oralDifficultyReason.length   > 72 ? '…' : '') : '';
  const rReason = data.researchDifficultyReason ? data.researchDifficultyReason.slice(0,72) + (data.researchDifficultyReason.length > 72 ? '…' : '') : '';
  return `
    <div class="score-hero">
      <div class="score-card">
        <div class="sc-label"><span class="sc-label-dot"></span>Moot Readiness</div>
        <div class="sc-value ${txtCls}" id="animated-main-score">0</div>
        <div class="sc-sub">${verdict}</div>
        <div class="sc-bar"><div class="sc-bar-fill ${sBCls}" data-target="${sPct}%" style="width:0%"></div></div>
      </div>
      <div class="score-card">
        <div class="sc-label"><span class="sc-label-dot"></span>Oral Difficulty</div>
        <div class="sc-value" style="font-size:1.5rem;padding-top:8px;">${dlbl[oralD] || 'Moderate'}</div>
        <div class="sc-sub" style="font-size:.68rem;line-height:1.5;">${oReason}</div>
        <div class="sc-bar"><div class="sc-bar-fill sf-blue" data-target="${oPct}%" style="width:0%"></div></div>
      </div>
      <div class="score-card">
        <div class="sc-label"><span class="sc-label-dot"></span>Research Load</div>
        <div class="sc-value" style="font-size:1.5rem;padding-top:8px;">${dlbl[resD] || 'Moderate'}</div>
        <div class="sc-sub" style="font-size:.68rem;line-height:1.5;">${rReason}</div>
        <div class="sc-bar"><div class="sc-bar-fill sf-purple" data-target="${rPct}%" style="width:0%"></div></div>
      </div>
    </div>`;
}

export function showStructuredResults(data) {
  if (!data || Object.keys(data).length === 0) {
    showError("No structured analysis data available for this session.");
    return;
  }
  try {
    lastAnalysis = JSON.stringify(data, null, 2);
    currentPropositionContext = data.summary || '';
    populateIssuesFromAnalysis();

    const toList = arr => (arr || []).map(x => `- ${x}`).join('\n');

    const sections = [
      data.summary && { type:'summary', heading:'Case Summary', content: data.summary },
      (data.legalIssues || []).length          && { type:'legal',         heading:'Legal Issues',              content: toList(data.legalIssues) },
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
      (data.strengths || []).length            && { type:'strengths',     heading:'Proposition Strengths',     content: toList(data.strengths) },
      (data.weaknesses || []).length           && { type:'weaknesses',    heading:'Proposition Weaknesses',    content: toList(data.weaknesses) },
      (data.missingAngles || []).length        && { type:'missing',       heading:'Missing Legal Angles',      content: toList(data.missingAngles) },
      (data.mostContestableIssue || data.finalVerdict) && {
        type:'strategy', heading:'Strategic Insights',
        content: [
          data.mostContestableIssue && `**Most Contestable Issue:** ${data.mostContestableIssue}`,
          data.finalVerdict && `**Final Verdict:** ${data.finalVerdict}`,
        ].filter(Boolean).join('\n\n')
      },
    ].filter(Boolean);

    const heroHTML    = buildStructuredScoreHero(data);
    const scoringHTML = renderCategoryScores(data.categoryScores);

    const navHTML = sections.map((s, i) => {
      const cfg = SECTION_CONFIGS[s.type] || SECTION_CONFIGS.default;
      return `<button class="rn-item" id="rn-${i}" onclick="scrollToSection(${i})">${cfg.icon} ${s.heading}</button>`;
    }).join('');

    const cardsHTML = sections.map((sec, i) => {
      const cfg = SECTION_CONFIGS[sec.type] || SECTION_CONFIGS.default;
      let body;
      if (sec.type === 'argDefects')                      body = renderArgumentDefects(sec._raw);
      else if (sec.type === 'cases' && sec._rawCases)     body = renderCases(sec.content, sec._rawCases);
      else                                                body = renderSectionBody(sec.type, sec.content, data.overallScore);

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
          <div class="asc-body" id="asc-b-${i}" style="padding:20px 22px;">${body}</div>
        </div>`;
    }).join('');

    document.getElementById('analysis-output').innerHTML = `
      <div class="result-grid">
        ${heroHTML}
        ${scoringHTML}
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
      if (scoreElement) animateValue(scoreElement, 0, data.overallScore || 0, 1500);
    }, 180);
  } catch (error) {
    console.error("Rendering Error:", error);
    alert("The analysis succeeded, but the UI failed to render. Check the console.");
    hideLoading();
    showWsPanel('upload');
  }
}

export function renderMarkdown(text) {
  return text
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
export function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export let currentStage = 1;

export function goToStage(stageNum) {
  if (stageNum < 1 || stageNum > 4) return;
  if (!currentUser) return;

  const hasContext = !!(window.lastAnalysis || lastAnalysis);

  if (stageNum > 1 && !hasContext) {
    showToast("Please upload and analyze a proposition in Stage 1 first.", "info");
    return;
  }

  currentStage = stageNum;

  // Update Stepper UI
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById('step-' + i);
    const connectorEl = document.getElementById('connector-' + i);
    if (stepEl) {
      stepEl.classList.remove('active', 'completed', 'upcoming');
      if (i === currentStage) {
        stepEl.classList.add('active');
        const iconEl = stepEl.querySelector('.step-icon');
        if (iconEl) iconEl.innerHTML = i;
      } else if (i < currentStage) {
        stepEl.classList.add('completed');
        const iconEl = stepEl.querySelector('.step-icon');
        if (iconEl) iconEl.innerHTML = '✓';
      } else {
        stepEl.classList.add('upcoming');
        const iconEl = stepEl.querySelector('.step-icon');
        if (iconEl) iconEl.innerHTML = i;
      }
    }
    if (connectorEl) {
      connectorEl.classList.toggle('completed', i < currentStage);
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
    nextBtn.style.display = currentStage === 4 ? 'none' : 'block';
  }

  // Stage-specific renderings
  if (currentStage === 2) {
    renderStage2Issues();
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
  if (currentStage < 4) {
    goToStage(currentStage + 1);
  }
}

export function wizardPrev() {
  if (currentStage > 1) {
    goToStage(currentStage - 1);
  }
}

export function renderStage2Issues() {
  const container = document.getElementById('stage-2-extracted-issues-list');
  if (!container) return;

  let issues = [];
  try {
    const analysisStr = window.lastAnalysis || lastAnalysis;
    if (analysisStr) {
      const data = JSON.parse(analysisStr);
      issues = data.legalIssues || [];
    }
  } catch (e) {
    console.error("Error parsing analysis for Stage 2 issues:", e);
  }

  if (issues.length === 0) {
    container.innerHTML = `
      <div class="text-center p-6 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
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
        
        const selectStr = issue.toLowerCase();
        let importance = "Core Issue";
        let importanceCls = "bg-blue-500/10 text-blue-400 border border-blue-500/20";
        let difficulty = "Medium";
        let difficultyCls = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
        let path = "Alternate Path";
        let pathCls = "bg-slate-500/10 text-slate-400 border border-slate-500/20";
        let advice = "Focus on presenting fact-based arguments backed by strong precedents.";

        if (selectStr.includes("jurisdiction") || selectStr.includes("maintainability") || selectStr.includes("standing") || selectStr.includes("preliminary")) {
          importance = "Threshold Gate";
          importanceCls = "bg-purple-500/10 text-purple-400 border border-purple-500/20";
          difficulty = "Medium";
          difficultyCls = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
          path = "Jurisdictional Bar";
          pathCls = "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
          advice = "Must be resolved first. Focus on statutory alternative remedies and constitutional writ jurisdiction scope.";
        } else if (selectStr.includes("validity") || selectStr.includes("constitutionality") || selectStr.includes("ultra vires") || selectStr.includes("arbitrary") || selectStr.includes("equality")) {
          importance = "Strategic Pinnacle";
          importanceCls = "bg-[#c9a84c]/10 text-moot-accent border border-[#c9a84c]/20";
          difficulty = "High";
          difficultyCls = "bg-red-500/10 text-red-400 border border-red-500/20";
          path = "High Risk / High Reward";
          pathCls = "bg-orange-500/10 text-orange-400 border border-orange-500/20";
          advice = "Hardest to argue. High presumption of constitutionality. Rely on manifest arbitrariness or rights override.";
        } else if (selectStr.includes("merits") || selectStr.includes("breach") || selectStr.includes("privacy") || selectStr.includes("speech") || selectStr.includes("rights")) {
          importance = "Critical Merits";
          importanceCls = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          difficulty = "Medium";
          difficultyCls = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
          path = "Strongest Precedent Path";
          pathCls = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          advice = "Offers the strongest path. Ground claims in binding landmark precedents (like Puttaswamy or Shreya Singhal).";
        } else if (selectStr.includes("remedy") || selectStr.includes("relief") || selectStr.includes("compensation") || selectStr.includes("damages") || selectStr.includes("prayer")) {
          importance = "Remedial Path";
          importanceCls = "bg-blue-500/10 text-blue-400 border border-blue-500/20";
          difficulty = "Low";
          difficultyCls = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          path = "Alternate Path";
          pathCls = "bg-slate-500/10 text-slate-400 border border-slate-500/20";
          advice = "Evaluate alternative remedies. Ensure prayer for relief maps directly to substantive violations.";
        }

        return `
          <div class="${cardClass} p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3 cursor-pointer" onclick="window.selectIssueFromCard('${issue.replace(/'/g, "\\'")}')">
            <div class="flex justify-between items-start gap-4">
              <div class="flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-moot-accent/10 border border-moot-accent/20 text-moot-accent text-[11px] font-semibold flex items-center justify-center shrink-0">
                  ${idx + 1}
                </span>
                <div class="text-xs font-sans text-white font-medium leading-relaxed">${esc(issue)}</div>
              </div>
              <div class="shrink-0 flex items-center justify-center mt-1">
                ${isSelected ? '<span class="text-moot-accent text-sm">✓</span>' : '<span class="text-white-faint text-sm">○</span>'}
              </div>
            </div>
            
            <div class="flex flex-wrap gap-2">
              <span class="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-sans font-semibold ${importanceCls}">${importance}</span>
              <span class="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-sans font-semibold ${difficultyCls}">${difficulty} Difficulty</span>
              <span class="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded font-sans font-semibold ${pathCls}">${path}</span>
            </div>
            
            <div class="text-[10px] text-white-muted italic leading-relaxed font-sans border-t border-white/5 pt-2">
              💡 <strong>Strategy:</strong> ${advice}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  if (selectEl && !selectEl.value && issues.length > 0) {
    selectEl.value = issues[0];
    const changeEvent = new Event('change', { bubbles: true });
    selectEl.dispatchEvent(changeEvent);
  }
}

export function selectIssueFromCard(val) {
  const selectEl = document.getElementById('builder-issue-select');
  if (selectEl) {
    selectEl.value = val;
    const changeEvent = new Event('change', { bubbles: true });
    selectEl.dispatchEvent(changeEvent);
    showToast("Issue selected ✓", "ok");
    renderStage2Issues();
  }
}

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
        icon: '❓'
      },
      {
        id: 'key-authorities',
        title: 'Key Authorities',
        description: 'Precedents and their ratios to cite during oral arguments.',
        readTime: '4 min',
        icon: '📖'
      },
      {
        id: 'judicial-traps',
        title: 'Judicial Traps',
        description: 'Vulnerable points in your argument and 30-second escape routes.',
        readTime: '2 min',
        icon: '⚠️'
      },
      {
        id: 'rebuttal-strategy',
        title: 'Rebuttal Strategy',
        description: 'Counter-arguments and strategies to demolish the opposition\'s claims.',
        readTime: '3 min',
        icon: '⚔️'
      },
      {
        id: 'emergency-rescue',
        title: 'Emergency Rescue',
        description: 'Last-resort constitutional principles to salvage a collapsing case.',
        readTime: '1 min',
        icon: '🔥'
      },
      {
        id: 'closing-prayer',
        title: 'Closing Prayer',
        description: 'A formal demand for relief tailored to the bench structure.',
        readTime: '1 min',
        icon: '⏱️'
      },
      {
        id: 'follow-up-questions',
        title: 'Follow-Up Questions',
        description: 'Secondary queries the judges may use to probe deep into your logic.',
        readTime: '2 min',
        icon: '🎯'
      },
      {
        id: 'fallback-position',
        title: 'Fallback Position',
        description: 'A secondary legal ground to fall back on if the main submission is rejected.',
        readTime: '2 min',
        icon: '🛡️'
      }
    ];

    const currentStance = window.builtArgumentSide || document.querySelector('input[name="stance"]:checked')?.value || 'Petitioner';
    const isPetitioner = currentStance.toLowerCase().includes('petitioner') || currentStance.toLowerCase().includes('appellant');

    let modulesHTML = '';
    const arg = window.lastBuiltArgument || lastBuiltArgument;
    const hasData = arg && (arg.oralAdvocacy || arg.rebuttals);

    if (hasData) {
      modulesHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${modules.map(mod => `
            <div class="bg-white/[0.02] border border-white/5 rounded-xl p-4 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.04] flex flex-col justify-between" style="min-height: 120px;">
              <div class="flex items-center justify-between mb-1.5" style="display: flex; justify-content: space-between; align-items: center;">
                <span class="text-[10px] text-white-muted font-sans font-semibold flex items-center gap-1.5" style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 14px;">${mod.icon}</span> <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--white);">${mod.title}</span>
                </span>
                <span class="text-[9px] uppercase tracking-wider font-semibold text-moot-accent bg-moot-accent/5 px-2 py-0.5 rounded font-sans" style="border: 1px solid rgba(201,168,76,0.15);">${mod.readTime}</span>
              </div>
              <p class="text-[11px] text-white-muted leading-relaxed font-sans" style="margin: 4px 0 8px 0; color: #a0aec0;">${mod.description}</p>
              <button onclick="window.openArsenalModule('${mod.id}')" class="btn-sm text-[10px] py-1.5 bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded cursor-pointer text-center w-full transition-all duration-200" style="width: 100%; text-transform: uppercase; letter-spacing: 0.05em;">
                Open Module
              </button>
            </div>
          `).join('')}
        </div>
      `;
    } else if (hasContext) {
      modulesHTML = `
        <div class="text-white-muted italic p-4 bg-white/[0.01] border border-dashed border-white/10 rounded-xl font-sans text-center">
          <div class="text-lg mb-1">🎙️</div>
          No generated submissions found. Complete Stage 3 first to automatically populate your Chambers Briefing & Battle Plan.
        </div>
      `;
    } else {
      modulesHTML = `
        <div class="text-white-muted italic p-4 bg-white/[0.01] border border-dashed border-white/10 rounded-xl font-sans text-center">
          <div class="text-lg mb-1">🎙️</div>
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

  const arg = window.lastBuiltArgument || lastBuiltArgument || {};
  const oralAdvocacy = arg.oralAdvocacy || {};
  const rebuttals = arg.rebuttals || {};

  let title = '';
  let content = '';

  switch (moduleId) {
    case 'bench-questions':
      title = 'Bench Questions';
      content = `
        <div class="space-y-3 font-sans">
          ${(oralAdvocacy.qa || []).map((pair, idx) => `
            <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg" style="margin-bottom: 10px;">
              <strong class="text-[#c9a84c] block mb-1" style="color: var(--gold); font-size: 12px;">Q${idx+1}: ${esc(pair.q)}</strong>
              <div class="text-gray-300 italic font-serif leading-relaxed mt-1" style="font-size: 11px; line-height: 1.5; color: #cbd5e0; padding-left: 8px; border-left: 2px solid rgba(255,255,255,0.1);">"${esc(pair.a)}"</div>
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
            <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs" style="margin-bottom: 10px;">
              <strong class="text-white block mb-1" style="font-size: 12px; color: #fff;">⚖️ ${esc(p.name)} (${esc(p.bench || 'Constitutional Bench')})</strong>
              <div class="text-white-muted mt-1.5" style="font-size: 11px;"><span class="text-[#c9a84c] font-semibold uppercase text-[9px] tracking-wider" style="color: var(--gold); font-size: 9px; font-weight: bold; margin-right: 4px;">Ratio:</span> ${esc(p.ratio)}</div>
              <div class="text-white-muted mt-1.5" style="font-size: 11px;"><span class="text-[#4caf82] font-semibold uppercase text-[9px] tracking-wider" style="color: #4caf82; font-size: 9px; font-weight: bold; margin-right: 4px;">Application:</span> ${esc(p.strategicValue || p.why)}</div>
              <div class="text-white-muted mt-1.5" style="font-size: 11px;"><span class="text-[#c9a84c] font-semibold uppercase text-[9px] tracking-wider" style="color: var(--gold); font-size: 9px; font-weight: bold; margin-right: 4px;">Usage:</span> <span class="italic font-serif" style="color: #e2e8f0;">"${esc(p.usage)}"</span></div>
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
            <div class="p-3 bg-red-950/10 border border-red-900/20 rounded-lg text-xs leading-relaxed text-gray-300" style="margin-bottom: 10px; border-left: 3px solid #f87171;">
              <strong class="text-red-400 block mb-1" style="color: #f87171; font-size: 12px;">⚠️ ${esc(trap.title || 'Judicial Trap')}</strong>
              <div class="text-gray-400 mb-1" style="font-size: 11px; margin-top: 4px;"><strong style="color: #e2e8f0;">Danger:</strong> ${esc(trap.description)}</div>
              <div class="mt-2 italic text-gray-300 font-serif" style="font-size: 11px; color: #cbd5e0; padding-top: 4px; border-t: 1px solid rgba(255,255,255,0.05);">Escape Route: "${esc(trap.escapeResponse)}"</div>
            </div>
          `).join('') || '<p class="text-white-muted italic">No judicial traps identified yet.</p>'}
        </div>
      `;
      break;
    case 'rebuttal-strategy':
      title = 'Rebuttal Strategy';
      content = `
        <div class="space-y-4 font-sans">
          <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg" style="margin-bottom: 10px;">
            <h4 class="text-[#c9a84c] font-semibold uppercase text-[10px] tracking-wider mb-2" style="color: var(--gold); font-size: 10px;">Opposition Arguments</h4>
            <ul class="list-disc pl-4 text-gray-300 space-y-1.5" style="font-size: 11px; color: #cbd5e0;">
              ${(rebuttals.opponentArguments || []).map(arg => `<li>${esc(arg)}</li>`).join('') || '<li class="italic text-gray-500">None identified.</li>'}
            </ul>
          </div>
          <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
            <h4 class="text-emerald-400 font-semibold uppercase text-[10px] tracking-wider mb-2" style="color: #34d399; font-size: 10px;">Demolition Strategy</h4>
            <div class="text-gray-300 space-y-2" style="font-size: 11px; color: #cbd5e0;">
              ${(rebuttals.demolitionStrategy || []).map((strat, idx) => `<p style="margin-bottom: 6px;"><strong style="color: #fff; margin-right: 4px;">${idx + 1}.</strong> ${esc(strat)}</p>`).join('') || '<p class="italic text-gray-500">No response strategy prepared.</p>'}
            </div>
          </div>
        </div>
      `;
      break;
    case 'emergency-rescue':
      title = 'Emergency Rescue';
      const rescueArg = rebuttals.emergencyRescue || (isPetitioner 
        ? "Submit that fundamental rights are absolute bounds on executive action, and any deviation violates the basic structure of the Constitution."
        : "Submit that administrative policies enjoy a wide latitude of immunity under public law, and judicial review is restricted to procedural impropriety.");
      content = `
        <div class="p-4 bg-red-950/10 border border-red-900/20 rounded-xl font-sans" style="border-left: 3px solid #ef4444;">
          <p class="text-gray-300 leading-relaxed font-serif italic" style="font-size: 12px; color: #cbd5e0; line-height: 1.6;">
            "${esc(rescueArg)}"
          </p>
        </div>
      `;
      break;
    case 'closing-prayer':
      title = 'Closing Prayer';
      const prayerArg = oralAdvocacy.closingPrayer || (isPetitioner
        ? "We pray that this Honorable Court allow the petition and strike down the impugned action as unconstitutional."
        : "We pray that this Honorable Court dismiss the petition in its entirety with exemplary costs.");
      content = `
        <div class="p-4 bg-indigo-950/10 border border-indigo-900/20 rounded-xl font-sans" style="border-left: 3px solid #6366f1;">
          <p class="text-gray-300 leading-relaxed font-serif italic" style="font-size: 12px; color: #cbd5e0; line-height: 1.6;">
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
            <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg" style="margin-bottom: 10px;">
              <strong class="text-white block mb-1" style="font-size: 12px;">Follow-up ${idx + 1}: "${esc(pair.q)}"</strong>
              <div class="italic block mt-1 font-serif text-gray-300" style="font-size: 11px; color: #cbd5e0; padding-left: 8px; border-left: 2px solid rgba(255,255,255,0.1);">Answer: "${esc(pair.a)}"</div>
            </div>
          `).join('') || '<p class="text-white-muted italic">No follow-up questions prepared.</p>'}
        </div>
      `;
      break;
    case 'fallback-position':
      title = 'Fallback Position';
      const fallbackArg = rebuttals.planB || (isPetitioner
        ? "Request this Court to read down the provision to preserve its validity while addressing our client\'s core rights."
        : "In the alternative, submit that if this Court finds a right was infringed, it was a proportional and necessary limitation in a democratic society.");
      content = `
        <div class="p-4 bg-indigo-950/10 border border-indigo-900/20 rounded-xl font-sans" style="border-left: 3px solid #6366f1;">
          <p class="text-gray-300 leading-relaxed font-serif italic" style="font-size: 12px; color: #cbd5e0; line-height: 1.6;">
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
      btn.classList.toggle('text-indigo-400', t === tab);
      btn.classList.toggle('bg-transparent', t !== tab);
      btn.classList.toggle('text-white-muted', t !== tab);
    }
    if (content) {
      content.classList.toggle('hidden', t !== tab);
    }
  });
}
