import { BASE_URL } from '../config.js';
import { currentUser } from '../services/firebase.js';
import {
  currentPropositionContext,
  showToast,
  esc,
  fmtInline,
  showWsPanel,
  toggleSection,
  lastAnalysis
} from './ui.js';
import {
  startOralRound as engineStartOralRound,
  stopOralRound as engineStopOralRound,
  getSocketState,
  sendSpeechText
} from '../services/audioEngine.js';
import { logSessionSecurely } from '../services/api.js';
import { getCurrentSelectedSide, selectedAuthorities } from './argumentBuilder.js';
import { DEPTH_PROFILES, JUDGE_ROSTERS, COURT_ROSTERS, FULL_BENCH } from '../config/benchProfiles.js';

// Simulator State
export let benchConversation = [];
export let claimLedger = [];
export let benchActive = false;
export let benchSubmitting = false;
export let benchDifficultyMode = 'moderate';
window.benchDifficultyMode = 'moderate';
export let voiceSessionActive = false;
export let voiceSessionStartTime = null;

// Local Voice State
let recognition = null;
let voiceTimerInterval = null;
let voiceElapsedTime = 0;
let currentBenchState = 'idle';
let lastInterimTranscript = '';
let isRecognizing = false;
let recognitionRestartTimer = null;

// Expose benchActive on window for UI checks (e.g. showWsPanel)
window.benchActive = false;

// ── FORUM ADAPTATION ──
// Reads the Stage 1 forumIntelligence (real schema: forumClassification /
// adjudicatorModel / simulatorDirectives) and produces a normalized profile so
// the Simulator speaks the correct language (Court+Judges vs Tribunal+Arbitrators).
// ALWAYS-AVAILABLE FALLBACK: derive forum + jurisdiction from the analysis data
// (precedent jurisdictions/citations + summary). lastAnalysis is set for every
// session — old or new — so this makes the roster correct without re-analysis.
export function deriveForumFromAnalysis() {
  try {
    const s = window.lastAnalysis || (typeof lastAnalysis !== 'undefined' ? lastAnalysis : null);
    if (!s) return null;
    const data = typeof s === 'string' ? JSON.parse(s) : s;
    const precs = Array.isArray(data.precedentsNeeded) ? data.precedentsNeeded : [];
    const precBlob = precs.map(p => `${p.jurisdiction || ''} ${p.citation || ''} ${p.caseName || ''}`).join(' ');
    const blob = `${precBlob} ${data.summary || ''} ${(data.constitutionalIssues || []).join(' ')}`.toLowerCase();
    if (!blob.trim()) return null;
    // PRECISE classification with India prioritised over bare "tribunal"/"arbitration"
    // (Indian moots routinely mention ITAT/NCLT/NGT tribunals without being arbitration).
    const strongIntlArb = /icsid|uncitral|investor-state|bilateral investment|\bbit\b|investment treaty|seat of arbitration|international (commercial )?arbitration|permanent court of arbitration|\bpca\b|arb\//;
    const anyArb = /arbitral tribunal|arbitration/;
    const indiaSig = /\bindia\b|indian|supreme court of india|\bscc\b|\bair\s+\d|article\s*(32|226)|delhi high court|bombay high court|madras high court|calcutta high court|high court of/;
    const ukSig = /england|wales|united kingdom|\buk\b|\[\d{4}\]\s*(ac|qb|wlr|ewca|ewhc|exch|ch|all er)|house of lords/;

    let isArbitration = false, courtJurisdiction = 'generic';
    if (indiaSig.test(blob) && !strongIntlArb.test(blob)) {
      courtJurisdiction = 'india';                 // Indian court/constitutional (even if it mentions a tribunal)
    } else if (strongIntlArb.test(blob)) {
      isArbitration = true;                         // unambiguous international arbitration
    } else if (ukSig.test(blob)) {
      courtJurisdiction = 'uk';
    } else if (anyArb.test(blob)) {
      isArbitration = true;                         // domestic/other arbitration, no court jurisdiction signal
    }
    return { isArbitration, courtJurisdiction };
  } catch (e) { return null; }
}

export function getForumProfile() {
  const fi = window.forumIntelligence || {};
  const cls = fi.forumClassification || {};
  const adj = fi.adjudicatorModel || {};
  const dir = fi.simulatorDirectives || {};
  let term = dir.terminologyOverrides || {};
  const proc = fi.proceduralFramework || {};

  // Use the lightweight P0 forum detection ONLY when the rich engine didn't run.
  // When rich forumIntelligence exists it is authoritative — never mix in detectedForum.
  const hasRich = !!(adj.benchType || cls.broadType || term.judge || term.court);
  const df = hasRich ? {} : (window.detectedForum || {});
  if (!hasRich && df.terminology && !term.judge) term = df.terminology;

  let benchType = adj.benchType || cls.broadType || df.adjudicatorType || df.forum || 'Constitutional Bench';
  const blob = `${benchType} ${cls.broadType || ''} ${cls.specificBody || ''} ${df.forum || ''} ${df.jurisdiction || ''} ${df.adjudicatorType || ''} ${term.judge || ''} ${term.court || ''}`.toLowerCase();
  let isArbitration = /arbitr|tribunal/.test(blob);

  // Which national court roster to use (only relevant when NOT arbitration).
  const jurBlob = `${df.jurisdiction || ''} ${cls.specificBody || ''} ${cls.broadType || ''} ${benchType}`.toLowerCase();
  let courtJurisdiction = 'generic';
  if (/india|indian|art(icle)?\.?\s*(32|226)/.test(jurBlob)) courtJurisdiction = 'india';
  else if (/united kingdom|\buk\b|u\.k\.|england|wales|english|house of lords/.test(jurBlob)) courtJurisdiction = 'uk';

  // If there is NO explicit forum signal (older sessions, or engines that failed),
  // derive everything from the analysis data — which is always present.
  const hasSignal = hasRich || !!(df.forum || df.adjudicatorType || df.jurisdiction);
  if (!hasSignal) {
    const derived = deriveForumFromAnalysis();
    if (derived) {
      isArbitration = derived.isArbitration;
      courtJurisdiction = derived.courtJurisdiction;
      benchType = isArbitration ? 'Arbitral Tribunal'
        : (courtJurisdiction === 'uk' ? 'Court of Appeal'
          : courtJurisdiction === 'india' ? 'Constitutional Bench' : 'Court');
    }
  }

  const judge = term.judge || (isArbitration ? 'Arbitrator' : 'Judge');
  const court = term.court || (isArbitration ? 'Tribunal' : 'Court');
  const addressing = adj.addressingStyle || (isArbitration ? 'Members of the Tribunal' : 'Your Lordships');

  return {
    benchType,
    judge,
    judgePlural: /s$/i.test(judge) ? judge : judge + 's',
    court,
    addressing,
    specificBody: cls.specificBody || df.forum || '',
    broadType: cls.broadType || df.forum || '',
    standardOfReview: proc.standardOfReview || 'Preponderance',
    burdenOfProof: proc.burdenOfProof || '',
    questioningStyle: dir.questioningStyle || '',
    chambersLabel: isArbitration ? 'Arbitral Chamber' : 'Judicial Chambers',
    lobbyLabel: isArbitration ? 'Tribunal Lobby' : 'Chambers Lobby',
    isArbitration,
    courtJurisdiction
  };
}
window.getForumProfile = getForumProfile;

// ── JUDGE SELECTION (card picker, forum-gated, single-select) ──
// The selected judge actually presides: his name shows in the round and his
// profile (and ONLY his profile) drives the questions. Difficulty = depth.
export let selectedJudgeId = null;
window.selectedJudgeId = null;

// The roster shown depends on the forum (Justices for courts, Arbitrators for
// tribunals). The Full Bench card is offered ONLY in Hard mode.
export function getActiveRoster(mode) {
  const fp = getForumProfile();
  const base = fp.isArbitration
    ? JUDGE_ROSTERS.tribunal
    : (COURT_ROSTERS[fp.courtJurisdiction] || COURT_ROSTERS.generic);
  const list = base.slice();
  if ((mode || benchDifficultyMode) === 'hard') list.push(FULL_BENCH);
  return list;
}

function findJudge(id) {
  if (id === FULL_BENCH.id) return FULL_BENCH;
  const all = [
    ...COURT_ROSTERS.india, ...COURT_ROSTERS.uk, ...COURT_ROSTERS.generic,
    ...JUDGE_ROSTERS.tribunal
  ];
  return all.find(j => j.id === id) || null;
}

export function getPresidingJudge() {
  const roster = getActiveRoster();
  let judge = selectedJudgeId ? roster.find(j => j.id === selectedJudgeId) : null;
  if (!judge) judge = roster[0]; // default to first valid judge for the forum/mode
  return judge || null;
}

export function getPresidingJudgeName() {
  const j = getPresidingJudge();
  return j ? j.name : 'The Bench';
}

export function selectJudge(id) {
  selectedJudgeId = id;
  window.selectedJudgeId = id;
  renderJudgeCards();
  // Reflect the presiding judge in the profile title AND focus areas.
  const j = getPresidingJudge();
  const titleEl = document.getElementById('lobby-bench-type-title');
  if (titleEl && j) titleEl.textContent = `${j.name} · ${j.archetype}`;
  const focusEl = document.getElementById('lobby-focus-areas');
  if (focusEl && j) focusEl.textContent = j.focus;
}
window.selectJudge = selectJudge;

// Render the forum-gated judge cards (single-select). Re-runs on forum/mode change.
export function renderJudgeCards() {
  const wrap = document.getElementById('bench-judge-cards');
  if (!wrap) return;
  const roster = getActiveRoster();
  // Ensure a valid default selection for this forum/mode.
  if (!selectedJudgeId || !roster.some(j => j.id === selectedJudgeId)) {
    selectedJudgeId = roster[0] ? roster[0].id : null;
    window.selectedJudgeId = selectedJudgeId;
  }
  // Clean, uniform roster rows (old MootCoach style): subtle muted cards, a gold
  // accent ONLY on the selected judge — no gold-flooded multi-colour cards.
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '8px';
  wrap.innerHTML = roster.map(j => {
    const on = j.id === selectedJudgeId;
    const rowStyle = on
      ? 'border:1px solid rgba(201,168,76,0.5); background:rgba(201,168,76,0.06);'
      : 'border:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.01);';
    return `
      <button type="button" onclick="window.selectJudge('${j.id}')" title="${esc(j.focus)}"
        style="display:flex; align-items:flex-start; gap:12px; width:100%; text-align:left; padding:10px 12px; border-radius:8px; cursor:pointer; transition:all .15s; ${rowStyle}">
        <div style="width:30px; height:30px; border-radius:50%; background:rgba(201,168,76,0.1); border:1px solid rgba(201,168,76,0.3); display:flex; align-items:center; justify-content:center; color:var(--gold); flex-shrink:0; font-size:13px;">⚖️</div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:12px; font-weight:600; color:#fff;">${esc(j.name)}</span>
            <span style="font-size:8px; letter-spacing:0.08em; text-transform:uppercase; color:#a0aec0;">${esc(j.archetype)}</span>
            ${on ? '<span style="font-size:8px; letter-spacing:0.08em; text-transform:uppercase; color:var(--gold); margin-left:auto;">✓ Selected</span>' : ''}
          </div>
          <div style="font-size:10px; color:#cbd5e0; line-height:1.4; margin-top:3px;">${esc(j.temperament)}</div>
        </div>
      </button>`;
  }).join('');
}
window.renderJudgeCards = renderJudgeCards;

// Directives injected into the simulate-bench context.
export function getJudgeDirective() {
  const j = getPresidingJudge();
  if (!j) return '';
  return `[Presiding: ${j.name} (${j.archetype}). ${j.directive}]`;
}
export function getDepthDirective() {
  const d = DEPTH_PROFILES[benchDifficultyMode] || DEPTH_PROFILES.moderate;
  return `[${d.directive}]`;
}
export function getForumDirective() {
  const fp = getForumProfile();
  return `[Forum: ${fp.benchType}${fp.specificBody ? ' — ' + fp.specificBody : ''}] [You are the ${fp.judgePlural}; refer to yourselves as the ${fp.court}; the advocate addresses you as "${fp.addressing}". Standard of review: ${fp.standardOfReview}.]`;
}
// Combined forum + judge + depth directive — carried into the VOICE round so the
// spoken bench adapts to the forum exactly like the text bench.
export function getBenchContextString() {
  return `${getForumDirective()}\n${getJudgeDirective()}\n${getDepthDirective()}`;
}
window.getBenchContextString = getBenchContextString;

export function setBenchDifficulty(mode) {
  benchDifficultyMode = mode;
  window.benchDifficultyMode = mode;
  ['easy', 'moderate', 'hard'].forEach(d => {
    const el = document.getElementById(`bench-diff-${d}`);
    if (el) el.className = `diff-btn${d === mode ? ` active-${d}` : ''}`;
  });
  updateBenchProfileUI(mode);
  renderJudgeCards();
}

export function updateBenchProfileUI(mode) {
  const titleEl = document.getElementById('lobby-bench-type-title');
  const depthLabelEl = document.getElementById('lobby-depth-label');
  const depthDescEl = document.getElementById('lobby-depth-desc');
  const focusEl = document.getElementById('lobby-focus-areas');

  const depth = DEPTH_PROFILES[mode] || DEPTH_PROFILES.moderate;
  const fp = getForumProfile();
  const j = getPresidingJudge();

  if (titleEl) titleEl.textContent = j ? `${j.name} · ${j.archetype}` : (fp.isArbitration ? 'Arbitral Tribunal' : 'The Bench');
  if (depthLabelEl) depthLabelEl.textContent = depth.label;
  if (depthDescEl) depthDescEl.textContent = depth.summary;
  // Focus areas now follow the SELECTED judge's remit (his profile drives questioning).
  if (focusEl) focusEl.textContent = j ? j.focus : '—';
}

export function startBenchSession() {
  benchConversation = [];
  claimLedger = [];
  benchActive = true;
  window.benchActive = true;
  benchSubmitting = false;

  const chat = document.getElementById('bench-chat');
  const empty = document.getElementById('bench-empty');
  const inputRow = document.getElementById('bench-input-row');
  const btnClear = document.getElementById('btn-bench-clear');
  const btnStart = document.getElementById('btn-bench-start');
  const courtroom = document.getElementById('courtroom-view');

  if (courtroom) courtroom.classList.remove('active');
  if (empty) empty.style.display = 'none';
  if (inputRow) inputRow.style.display = 'flex';
  if (btnClear) btnClear.style.display = '';
  if (btnStart) btnStart.textContent = 'Restart';

  if (chat) {
    chat.style.display = 'flex';
    chat.querySelectorAll('.bench-msg').forEach(m => m.remove());
  }

  // Forum-adaptive labels (Court+Judges vs Tribunal+Arbitrators)
  const fp = getForumProfile();
  const benchWord = fp.isArbitration ? 'TRIBUNAL' : 'BENCH';

  // Update Global Chambers Header for Text Session
  const mootName = document.getElementById('ws-moot-name')?.value?.trim() || 'General Appellate Docket';
  const sessionTitleEl = document.getElementById('cr-session-title');
  const sessionMetaEl = document.getElementById('cr-session-meta');
  const exitBtn = document.getElementById('chambers-exit-btn');
  if (sessionTitleEl) sessionTitleEl.textContent = mootName;
  if (exitBtn) exitBtn.style.display = 'block';

  const openingMap = {
    easy: `Good morning, Counsel. This ${fp.court} is ready to hear your submissions. Please state the nature of your case and establish your standing before proceeding.`,
    moderate: `Counsel, you may proceed. This ${fp.isArbitration ? 'Tribunal' : 'Bench'} has read the proposition. Begin with your first issue and your primary submission on it. Be precise.`,
    hard: `Counsel — before you commence your submissions on the merits, satisfy this ${fp.court} on one thing: on what precise basis does this ${fp.court} have jurisdiction to entertain this matter?`
  };

  // Show the advocate exactly what context the Bench is using (proves the
  // Issues + Advocacy selections are connected to this session).
  const ms = window.mootState || {};
  const ctxStance = ms.stance || 'Petitioner';
  const ctxIssue = ms.issueText || 'General appellate docket';
  const ctxAuthCount = Array.isArray(ms.authorities) ? ms.authorities.length : 0;
  const ctxHasMemorial = !!(ms.memorialDraft && ms.memorialDraft.trim());
  const ctxHasOral = !!(ms.oralSubmission && ms.oralSubmission.trim());
  if (sessionMetaEl) {
    sessionMetaEl.textContent = `${ctxStance.toUpperCase()} · ${benchDifficultyMode.toUpperCase()} ${benchWord} · ${fp.benchType.toUpperCase()}`;
  }
  const ctxPlan = ms.plan || {};
  const ctxPredicted = ((ctxPlan.fatalQuestions || []).length) + ((ctxPlan.benchQuestions || []).length);
  const ctxParts = [
    `Forum: ${fp.benchType}${fp.specificBody ? ' (' + fp.specificBody + ')' : ''}`,
    `Arguing as: ${ctxStance}`,
    `Issue: ${ctxIssue}`,
    `Authorities loaded: ${ctxAuthCount}`,
    `Memorial draft: ${ctxHasMemorial ? 'attached' : 'none'}`,
    `Oral draft: ${ctxHasOral ? 'attached' : 'none'}`,
    `Predicted questions loaded: ${ctxPredicted}`,
    `Presiding: ${getPresidingJudgeName()} · Depth: ${(DEPTH_PROFILES[benchDifficultyMode] || DEPTH_PROFILES.moderate).label}`
  ];
  appendBenchMessage('system', `This ${fp.court} is using your selections — ${ctxParts.join('  ·  ')}`);

  let opening = openingMap[benchDifficultyMode] || openingMap.moderate;
  // Open on the advocate's ACTUAL case so it's immediately their session, not generic.
  if (ctxIssue && ctxIssue !== 'General appellate docket') {
    opening = `Counsel for the ${ctxStance}, we are taking up your issue — "${ctxIssue}". ${opening}`;
  }
  appendBenchMessage('judge', opening, null, 'Opening the session', 1, getPresidingJudgeName());
  benchConversation.push({ role: 'judge', content: opening });

  const input = document.getElementById('bench-input');
  if (input) {
    input.value = '';
    input.disabled = false;
    input.placeholder = "Type your response to the bench...";
    input.focus();
  }
  const sendBtn = document.getElementById('btn-bench-send');
  if (sendBtn) sendBtn.disabled = true;
}

export function clearBenchSession() {
  stopOralRound();
  benchConversation = [];
  claimLedger = [];
  benchActive = false;
  window.benchActive = false;
  benchSubmitting = false;

  const chat = document.getElementById('bench-chat');
  const inputRow = document.getElementById('bench-input-row');
  const btnClear = document.getElementById('btn-bench-clear');
  const btnStart = document.getElementById('btn-bench-start');
  const empty = document.getElementById('bench-empty');
  const courtroom = document.getElementById('courtroom-view');

  if (courtroom) courtroom.classList.remove('active');
  if (chat) {
    chat.style.display = 'none';
    chat.querySelectorAll('.bench-msg').forEach(m => m.remove());
  }
  if (inputRow) inputRow.style.display = 'none';
  if (btnClear) btnClear.style.display = 'none';
  if (btnStart) btnStart.textContent = 'Start New Session';
  if (empty) empty.style.display = '';

  // Reset Global Chambers Header
  const sessionTitleEl = document.getElementById('cr-session-title');
  const sessionMetaEl = document.getElementById('cr-session-meta');
  const exitBtn = document.getElementById('chambers-exit-btn');
  const timerEl = document.getElementById('cr-timer');
  const voiceStatusEl = document.getElementById('bench-voice-status');
  const fpReset = getForumProfile();
  if (sessionTitleEl) sessionTitleEl.textContent = fpReset.chambersLabel;
  if (sessionMetaEl) sessionMetaEl.textContent = fpReset.lobbyLabel;
  if (exitBtn) exitBtn.style.display = 'none';
  if (timerEl) timerEl.style.display = 'none';
  if (voiceStatusEl) voiceStatusEl.style.display = 'none';
}

export function appendBenchMessage(role, text, pressureLevel, targetWeakness, displayPressure, speakingJudge) {
  const chat = document.getElementById('bench-chat');
  if (!chat) return;

  const div = document.createElement('div');
  div.className = `bench-msg bench-msg-${role}`;

  if (role === 'system') {
    div.innerHTML = `<div class="bm-role bm-role-system">System</div><div class="bm-text">${esc(text)}</div>`;
  } else {
    const roleLabel = role === 'judge' ? (speakingJudge ? esc(speakingJudge).toUpperCase() : 'BENCH') : 'COUNSEL';
    const roleCls = role === 'judge' ? 'bm-role-judge' : 'bm-role-advocate';

    if (role === 'judge') {
      const judgeNameEl = document.getElementById('cr-judge-name');
      if (judgeNameEl) {
        judgeNameEl.textContent = `⚖️ ${speakingJudge ? esc(speakingJudge) : 'Presiding Judge'}`;
      }
    }

    const pressure = displayPressure || pressureLevel || 0;

    const pressureHTML = (pressure > 0 && role === 'judge')
      ? `<div class="pressure-dots">${[1, 2, 3, 4, 5].map(n => `<div class="pressure-dot${n <= pressure ? ' filled' : ''}"></div>`).join('')}</div>`
      : '';
    const weaknessHTML = (targetWeakness && role === 'judge')
      ? `<div class="bm-weakness">↳ ${esc(targetWeakness)}</div>`
      : '';

    div.innerHTML = `
      <div class="bm-role ${roleCls}">${roleLabel}</div>
      <div class="bm-text">${fmtInline(text)}</div>
      ${(pressureHTML || weaknessHTML) ? `<div class="bm-meta">${pressureHTML}${weaknessHTML}</div>` : ''}`;
  }

  chat.appendChild(div);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
}

export function appendBenchPerformanceReview(review) {
  const chat = document.getElementById('bench-chat');
  if (!chat) return;

  const div = document.createElement('div');
  div.className = 'bench-msg bench-msg-system';
  div.style.maxWidth = '100%';
  div.style.width = '100%';
  div.style.textAlign = 'left';
  div.style.background = 'var(--navy-3)';
  div.style.border = '1px solid var(--glass-b)';
  div.style.borderRadius = '14px';
  div.style.padding = '24px';
  div.style.marginTop = '20px';
  div.style.boxSizing = 'border-box';

  const s_moment = review.strongestMoment || {};
  const d_moment = review.mostDangerousMoment || {};
  const prioritiesHTML = (review.trainingPriorities || []).map((p, i) => `
    <div style="margin-bottom:8px; display:flex; align-items:start; gap:8px;">
      <span style="display:inline-block; width:20px; height:20px; background:rgba(96,165,250,0.1); color:#60a5fa; border-radius:50%; text-align:center; line-height:20px; font-size:10px; font-weight:bold; flex-shrink:0;">${i + 1}</span>
      <span style="font-size:.82rem; color:var(--white-2); line-height:1.5;">${fmtInline(p)}</span>
    </div>
  `).join('');

  const concernsHTML = (review.judicialConcerns || []).map(c => `
    <span style="display:inline-block; padding:4px 8px; background:rgba(224,82,82,.08); border:1px solid rgba(224,82,82,.2); border-radius:4px; font-size:.75rem; color:#e05252; margin-right:6px; margin-bottom:6px;">${fmtInline(c)}</span>
  `).join('');

  div.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;border-bottom:1px solid var(--glass-b);padding-bottom:16px;">
      <div>
        <div style="font-family:var(--serif);font-size:1.6rem;font-weight:500;color:var(--white);line-height:1.2;">Post-Round Intelligence Report</div>
        <div style="font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:var(--white-muted);margin-top:6px;">Advocacy Coaching Analysis</div>
      </div>
      <button class="btn-sm btn-sm-ghost" onclick="startBenchSession()">Restart Session</button>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 16px;">
      <!-- Strongest Moment -->
      <div style="background:var(--navy-4); border:1px solid var(--glass-b); border-radius:10px; padding:16px;">
        <div style="font-size:.65rem; letter-spacing:.1em; text-transform:uppercase; color:#4caf82; font-weight:700; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span>🏆</span> Strongest Moment
        </div>
        <div style="font-family:var(--serif); font-size:.9rem; color:var(--white-2); font-style:italic; line-height:1.5; margin-bottom:10px; border-left:2px solid #4caf82; padding-left:10px;">
          "${fmtInline(s_moment.statement || 'N/A')}"
        </div>
        <div style="font-size:.8rem; color:var(--white-muted); line-height:1.5;">
          <strong style="color:#a0aec0;">Why it worked:</strong> ${fmtInline(s_moment.whyItWorked || 'N/A')}
        </div>
      </div>

      <!-- Most Dangerous Moment -->
      <div style="background:var(--navy-4); border:1px solid var(--glass-b); border-radius:10px; padding:16px;">
        <div style="font-size:.65rem; letter-spacing:.1em; text-transform:uppercase; color:#e05252; font-weight:700; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span>⚠️</span> Most Dangerous Moment
        </div>
        <div style="font-family:var(--serif); font-size:.9rem; color:var(--white-2); font-style:italic; line-height:1.5; margin-bottom:10px; border-left:2px solid #e05252; padding-left:10px;">
          "${fmtInline(d_moment.statement || 'N/A')}"
        </div>
        <div style="font-size:.8rem; color:var(--white-muted); line-height:1.5; margin-bottom:8px;">
          <strong style="color:#a0aec0;">Why it was vulnerable:</strong> ${fmtInline(d_moment.whyVulnerable || 'N/A')}
        </div>
        <div style="font-size:.8rem; color:#4caf82; line-height:1.5; background:rgba(76,175,130,0.05); padding:8px; border-radius:6px;">
          <strong>Better Answer:</strong> "${fmtInline(d_moment.betterAnswer || 'N/A')}"
        </div>
      </div>
    </div>

    <!-- Middle Row: Concerns & Consistency -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 16px;">
      <!-- Judicial Concerns -->
      <div style="background:var(--navy-4); border:1px solid var(--glass-b); border-radius:10px; padding:16px;">
        <div style="font-size:.65rem; letter-spacing:.1em; text-transform:uppercase; color:#c9a84c; font-weight:700; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span>🏛️</span> Judicial Concerns
        </div>
        <div style="margin-bottom:10px;">${concernsHTML || '<span style="color:var(--white-muted);font-size:.8rem;">None</span>'}</div>
        
        <div style="font-size:.65rem; letter-spacing:.1em; text-transform:uppercase; color:#9ca3af; font-weight:700; margin-top:16px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <span>💡</span> Missed Opportunity
        </div>
        <div style="font-size:.8rem; color:var(--white-2); line-height:1.5;">
          ${fmtInline(review.missedOpportunity || 'None identified.')}
        </div>
      </div>

      <!-- Consistency Analysis -->
      <div style="background:var(--navy-4); border:1px solid var(--glass-b); border-radius:10px; padding:16px;">
        <div style="font-size:.65rem; letter-spacing:.1em; text-transform:uppercase; color:#a855f7; font-weight:700; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <span>⚖️</span> Consistency Analysis
        </div>
        <div style="font-size:.8rem; color:var(--white-2); line-height:1.6;">
          ${fmtInline(review.consistencyAnalysis || 'No major inconsistencies detected.')}
        </div>
      </div>
    </div>

    <!-- Bottom: Training Priorities -->
    <div style="background:var(--navy-4); border:1px solid var(--glass-b); border-radius:10px; padding:16px;">
      <div style="font-size:.65rem; letter-spacing:.1em; text-transform:uppercase; color:#60a5fa; font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
        <span>🎯</span> Training Priorities Before Next Round
      </div>
      <div>
        ${prioritiesHTML || '<div style="font-size:.8rem;color:var(--white-muted);">Keep practicing.</div>'}
      </div>
    </div>
  `;

  chat.appendChild(div);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
}

export async function submitToBench() {
  if (benchSubmitting || !benchActive) return;
  const input = document.getElementById('bench-input');
  const sendBtn = document.getElementById('btn-bench-send');
  const statement = input?.value?.trim();
  if (!statement || statement.length < 3) return;

  benchSubmitting = true;
  if (sendBtn) sendBtn.disabled = true;

  appendBenchMessage('advocate', statement);
  benchConversation.push({ role: 'advocate', content: statement });
  if (input) input.value = '';

  const typingId = 'typing-' + Date.now();
  const chat = document.getElementById('bench-chat');
  if (chat) {
    const t = document.createElement('div');
    t.className = 'bench-msg bench-msg-judge';
    t.id = typingId;
    t.innerHTML = `<div class="bm-role bm-role-judge">BENCH</div><div class="bm-text" style="opacity:.4;letter-spacing:.08em;">. . .</div>`;
    chat.appendChild(t);
    chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  }

  try {
    // Read the live, shared moot state (set by the Issues + Advocacy stages).
    const ms = window.mootState || {};
    const selectedIssue = ms.issueText
      || document.getElementById('builder-issue-select')?.value
      || '';
    const selectedStance = ms.stance
      || ((typeof getCurrentSelectedSide === 'function') ? getCurrentSelectedSide() : null)
      || 'Petitioner';
    const authList = (Array.isArray(ms.authorities) && ms.authorities.length > 0)
      ? ms.authorities
      : (selectedAuthorities || []);
    const selectedAuthsText = authList.map(a => `${a.name}: ${a.ratio}`).join(', ') || 'None deployed';

    // Carry the advocate's actual drafts so the Bench questions their own submissions.
    const memorialDraft = (ms.memorialDraft || '').trim();
    const oralDraft = (ms.oralSubmission || '').trim();
    const draftBlock =
      (memorialDraft ? `\n[Advocate's Written Memorial Draft]\n${memorialDraft.slice(0, 1500)}\n` : '') +
      (oralDraft ? `\n[Advocate's Oral Submission Draft]\n${oralDraft.slice(0, 1500)}\n` : '');

    // Forum directive so the AI adjudicator adopts the correct persona/terminology.
    const fp = getForumProfile();
    const forumDirective = `[Forum: ${fp.benchType}${fp.specificBody ? ' — ' + fp.specificBody : ''}] [You are the ${fp.judgePlural}; refer to yourselves as the ${fp.court}; the advocate addresses you as "${fp.addressing}". Questioning style: ${fp.questioningStyle || 'rigorous and probing'}. Standard of review: ${fp.standardOfReview}.]`;

    // Use the analysis's issue-specific intelligence to DRIVE questioning:
    // the predicted bench questions and the side's known weaknesses.
    const plan = ms.plan || {};
    const predicted = [];
    (plan.fatalQuestions || []).forEach(q => { const t = (q && (q.question || q)) || ''; if (t) predicted.push(t); });
    (plan.benchQuestions || []).forEach(q => { if (q) predicted.push(q); });
    const predictedBlock = predicted.length
      ? `\n[Predicted questions for this issue — press the advocate on these first, phrased in your own words]\n- ${predicted.slice(0, 6).join('\n- ')}\n`
      : '';
    const defects = (plan.defects || []).map(d => `${d.defectType || 'Weakness'}: ${d.explanation || d}`);
    const defectBlock = defects.length
      ? `\n[Known weaknesses in the advocate's side — probe these relentlessly]\n- ${defects.slice(0, 4).join('\n- ')}\n`
      : '';

    const judgeDirective = getJudgeDirective();
    const depthDirective = getDepthDirective();
    const contextPrefix = `${forumDirective}${judgeDirective ? '\n' + judgeDirective : ''}${depthDirective ? '\n' + depthDirective : ''}\n[Advocate Side: ${String(selectedStance).toUpperCase()}] [Target Issue: ${selectedIssue || 'General'}] [Selected Authorities: ${selectedAuthsText}]${draftBlock}${predictedBlock}${defectBlock}\n\n`;

    // Reset judge's text container to clear old judge text
    const judgeTextContainer = document.getElementById('judge-text-container');
    if (judgeTextContainer) {
      judgeTextContainer.innerHTML = "";
    }

    const res = await fetch(`${BASE_URL}/simulate-bench`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationHistory: benchConversation.slice(-10),
        propositionSummary: contextPrefix + (currentPropositionContext || ''),
        difficulty: benchDifficultyMode,
        studentStatement: statement,
        claimLedger: claimLedger
      })
    });

    // Fire-and-forget Claim Extraction to build the ledger without adding latency
    fetch(`${BASE_URL}/simulate-bench/extract-claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentStatement: statement })
    })
    .then(r => r.json())
    .then(d => {
      if (d.success && d.claims) {
        d.claims.forEach(c => {
          if (c.confidence >= 0.8) claimLedger.push(c);
        });
        console.log("[CLAIM GRAPH] Ledger updated:", claimLedger);
      }
    })
    .catch(err => console.error("[CLAIM GRAPH] Extraction failed:", err));

    document.getElementById(typingId)?.remove();
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'No response from bench.');

    if (data.isSessionEnd) {
      appendBenchPerformanceReview(data.performanceReview);
      benchActive = false;
      window.benchActive = false;
      if (input) {
        input.disabled = true;
        input.placeholder = "Session ended. Click 'Restart Session' to try again.";
      }
      if (sendBtn) sendBtn.disabled = true;
      return;
    }

    const judgeText = data.judgeResponse || 'Proceed, Counsel.';
    appendBenchMessage('judge', judgeText, data.pressureLevel, data.targetWeakness, 0, data.speakingJudge);
    requestAnimationFrame(() => {
      const chat = document.getElementById('bench-chat');
      if (chat) {
        chat.scrollTop = chat.scrollHeight;
      }
    });
    benchConversation.push({ role: 'judge', content: judgeText });

  } catch (err) {
    document.getElementById(typingId)?.remove();
    appendBenchMessage('system', `Connection error: ${err.message} — Please try again.`);
  } finally {
    benchSubmitting = false;
    if (benchActive) {
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }
  }
}

export function handleBenchKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitToBench();
  }
}

/* ─── VOICE SIMULATOR (AUDIO WORKLET + WEBSOCKET) FUNCTIONS ─── */
export let currentJudgeBubble = null;
export let currentJudgeSpeech = '';



// Browser SpeechSynthesis opening statement removed in favor of Gemini Live native audio.

export function updateBenchState(state) {
  window.voiceStatus = state;
  currentBenchState = state;
  updateDiagTimestamp(`State: ${state}`);

  if (state === 'speaking' || state === 'connecting' || state === 'ended' || state === 'permission_denied') {
    if (recognition) {
      try {
        if (lastInterimTranscript) {
          console.log("[DEBUG AUDIT] Aborting recognition. Manual flush of last interim transcript:", lastInterimTranscript);
          appendTranscript('advocate', lastInterimTranscript);
          benchConversation.push({ role: 'advocate', content: lastInterimTranscript });
          lastInterimTranscript = '';
        }
        safeAbortRecognition();
        console.log(`[VOICE] Aborted recognition because state is ${state}`);
        updateDiagActive(false);
      } catch (err) {
        // already stopped or not active
      }
    }
  }

  const statusEl = document.getElementById('cr-session-status');
  const footerDot = document.getElementById('cr-indicator-dot');
  const footerLabel = document.getElementById('cr-indicator-label');
  const waveform = document.getElementById('cr-waveform-container');

  if (state === 'speaking') {
    currentJudgeBubble = null;
    currentJudgeSpeech = '';
  }

  let text = '';
  let dotColor = 'bg-[#c9a84c]'; // Gold

  switch (state) {
    case 'connecting':
      text = 'Connecting to Bench...';
      dotColor = 'bg-[#c9a84c]';
      break;
    case 'mic_ready':
      text = 'Waiting for Microphone Permission...';
      dotColor = 'bg-[#fbbf24]';
      break;
    case 'ready':
      text = 'Bench Ready';
      dotColor = 'bg-[#4caf82]';
      break;
    case 'listening':
      text = 'Listening to Advocate...';
      dotColor = 'bg-[#4caf82]';
      break;
    case 'processing':
      text = 'Processing Argument...';
      dotColor = 'bg-[#a78bfa]';
      break;
    case 'speaking':
      text = 'Judge Speaking';
      dotColor = 'bg-[#e05252]';
      break;
    case 'ended':
      text = 'Session Ended';
      dotColor = 'bg-[#e05252]';
      break;
    default:
      text = state;
  }

  // Update Bench Header Judge Info & Bench Name on state change
  const judgeNameEl = document.getElementById('cr-judge-name');
  const benchNameEl = document.getElementById('cr-bench-name');
  const fpState = getForumProfile();
  if (judgeNameEl && state === 'connecting') {
    judgeNameEl.textContent = `⚖️ Presiding ${fpState.judge}`;
  }
  if (benchNameEl) {
    // Forum-driven name when known; otherwise difficulty-based fallback.
    if (window.forumIntelligence) {
      benchNameEl.textContent = fpState.benchType;
    } else {
      const difficultyLabel = (benchDifficultyMode || 'moderate').toUpperCase();
      benchNameEl.textContent = difficultyLabel === 'HARD' ? 'Constitutional Bench' : (difficultyLabel === 'EASY' ? 'District Court Bench' : 'Division Bench');
    }
  }

  if (statusEl) statusEl.textContent = text;
  if (footerLabel) footerLabel.textContent = text;
  if (footerDot) {
    footerDot.className = `w-2.5 h-2.5 rounded-full ${dotColor} animate-pulse`;
  }

  // Update Chambers Header voice status badge and label dynamically
  const voiceStatusEl = document.getElementById('bench-voice-status');
  const voiceTextEl = document.getElementById('bench-voice-text');
  if (voiceStatusEl && voiceTextEl) {
    const socketState = getSocketState();
    if (socketState === 'open') {
      voiceStatusEl.className = 'backend-status online';
      voiceTextEl.textContent = 'CONNECTED';
    } else if (socketState === 'connecting') {
      voiceStatusEl.className = 'backend-status checking';
      voiceTextEl.textContent = 'CONNECTING...';
    } else {
      voiceStatusEl.className = 'backend-status offline';
      voiceTextEl.textContent = 'DISCONNECTED';
    }
  }

  console.log(`[DEBUG AUDIT] updateBenchState: ${state} -> ${text}`);
}

export async function startOralRound() {
  if (voiceSessionActive) {
    stopOralRound();
    return;
  }

  // Browser SpeechSynthesis iOS warmup removed in favor of Gemini Live native audio.

  let fullJudgeResponse = '';
  console.log("🎙️ Initiating oral round...");
  console.log("[DEBUG AUDIT] Starting oral round...");
  benchConversation = [];
  voiceSessionActive = true;
  voiceSessionStartTime = Date.now();

  const chat = document.getElementById('bench-chat');
  const empty = document.getElementById('bench-empty');
  const btnOral = document.getElementById('btn-bench-oral');
  const btnStart = document.getElementById('btn-bench-start');
  const btnClear = document.getElementById('btn-bench-clear');
  const inputRow = document.getElementById('bench-input-row');
  const courtroom = document.getElementById('courtroom-view');

  if (empty) empty.style.display = 'none';
  if (btnOral) btnOral.textContent = 'End Oral Round';
  if (btnStart) btnStart.disabled = true;
  if (btnClear) btnClear.style.display = '';
  if (inputRow) inputRow.style.display = 'none';

  if (chat) {
    chat.style.display = 'none';
    chat.querySelectorAll('.bench-msg').forEach(m => m.remove());
  }

  // Clear courtroom feed and show courtroom view
  const panel = document.getElementById('bench-transcript-panel');
  if (panel) panel.innerHTML = '';
  if (courtroom) courtroom.classList.add('active');

  // Load Moot details into headers and show controls
  const mootName = document.getElementById('ws-moot-name')?.value?.trim() || 'General Appellate Docket';
  const sessionTitleEl = document.getElementById('cr-session-title');
  const sessionMetaEl = document.getElementById('cr-session-meta');
  const exitBtn = document.getElementById('chambers-exit-btn');
  const timerEl = document.getElementById('cr-timer');
  const voiceStatusEl = document.getElementById('bench-voice-status');

  const fpVoice = getForumProfile();
  const benchWordVoice = fpVoice.isArbitration ? 'TRIBUNAL' : 'BENCH';
  if (sessionTitleEl) sessionTitleEl.textContent = mootName;
  if (sessionMetaEl) sessionMetaEl.textContent = `VOICE ${benchWordVoice} SIMULATION · ${benchDifficultyMode.toUpperCase()} ${benchWordVoice}`;
  if (exitBtn) exitBtn.style.display = 'block';
  if (timerEl) timerEl.style.display = 'block';
  if (voiceStatusEl) voiceStatusEl.style.display = 'flex';

  updateBenchState('connecting');
  updateBenchState('mic_ready');
  appendTranscript('system', 'Starting Oral Round. Please grant microphone permissions.');

  // Start timers and local speech-to-text
  startVoiceTimer();
  startSpeechRecognition();
  initDiagnostics();

  try {
    await engineStartOralRound({
      onStatusChange: (status, text) => {
        console.log("[DEBUG AUDIT] Engine status changed:", status, text);
        if (status === 'reconnecting') {
          // Hard wipe of frontend state to sync with backend Gemini session reset
          const panel = document.getElementById('bench-transcript-panel');
          if (panel) panel.innerHTML = '';
          appendTranscript('system', 'Connection lost. The Bench has been reset. Please begin your submissions again.');
          
          // Deep clean memory buffers
          fullJudgeResponse = '';
          currentJudgeBubble = null;
          currentJudgeSpeech = '';
          benchConversation = [];
          
          // Force microphone re-instantiation for iOS lock recovery
          stopSpeechRecognition();
          
          updateBenchState('connecting');
          startVoiceTimer(); // Reset the duration timer
        } else if (status === 'connecting') {
          updateBenchState('connecting');
        } else if (status === 'ready') {
          // Opening statement is handled natively by Gemini Live via priming prompt
        } else if (status === 'listening') {
          updateBenchState('listening');
          safeStartRecognition();
        } else if (status === 'speaking') {
          if (getSocketState() === 'open') {
            updateBenchState('speaking');
            // safeAbortRecognition() is natively called inside updateBenchState('speaking')
          } else {
            console.warn("[WARN] Socket is not open, ignoring status switch to 'speaking'.");
          }
        } else if (status === 'user_speaking') {
          updateBenchState('listening');
        } else if (status === 'processing') {
          updateBenchState('processing');
        } else if (status === 'error') {
          updateBenchState('ended');
          appendTranscript('system', `Judge Error: ${text}`);
        } else if (status === 'disconnected') {
          updateBenchState('ended');
        }
      },
      onText: (text) => {
        // Low-latency sentence-boundary chunking for real-time TTS responsiveness
        console.log("[DEBUG AUDIT] AI response chunk received:", text);
        fullJudgeResponse += text;
      },
      onTurnComplete: () => {
        const cleanResponse = fullJudgeResponse.trim();
        if (cleanResponse) {
          console.log('[JUDGE TRANSCRIPT] Response received:', cleanResponse);
          appendTranscript('judge', cleanResponse);
          console.log('[JUDGE TRANSCRIPT] Appended to transcript');
          console.log('[JUDGE TRANSCRIPT] Container found:', !!document.getElementById('bench-transcript-panel'));
          console.log('[JUDGE TRANSCRIPT] Judge bubble inserted');
        }

        fullJudgeResponse = '';
      },
      onInterrupted: () => {
        const cleanResponse = fullJudgeResponse.trim();
        if (cleanResponse) {
          console.log('[JUDGE TRANSCRIPT] Response received (interrupted):', cleanResponse);
          appendTranscript('judge', cleanResponse + "...");
          console.log('[JUDGE TRANSCRIPT] Appended to transcript (interrupted)');
          console.log('[JUDGE TRANSCRIPT] Container found:', !!document.getElementById('bench-transcript-panel'));
          console.log('[JUDGE TRANSCRIPT] Judge bubble inserted');
        }
        fullJudgeResponse = '';
      },
      onError: (message) => {
        console.log("[DEBUG AUDIT] AI response error received:", message);
        appendTranscript('system', `Judge Error: ${message}`);
      },
      onClose: () => {
        console.log("[DEBUG AUDIT] Engine connection closed.");
        if (voiceSessionActive) {
          stopOralRound();
        }
      },
      onPlaybackComplete: () => {
        console.log("[DEBUG AUDIT] Gemini Live playback completed. Transitioning to listening and reactivating mic...");
        updateBenchState('listening');
        safeStartRecognition();
      }
    });
  } catch (err) {
    console.error("Failed to start oral round:", err);
    appendTranscript('system', `Failed to start: ${err.message}`);
    stopOralRound();
  }
}

export function stopOralRound() {
  if (!voiceSessionActive) return;
  console.log("🎙️ Stopping oral round...");
  voiceSessionActive = false;

  const btnOral = document.getElementById('btn-bench-oral');
  const btnStart = document.getElementById('btn-bench-start');
  const empty = document.getElementById('bench-empty');
  const inputRow = document.getElementById('bench-input-row');
  const courtroom = document.getElementById('courtroom-view');

  if (btnOral) btnOral.textContent = 'Start Oral Round';
  if (btnStart) btnStart.disabled = false;

  if (courtroom) courtroom.classList.remove('active');
  if (empty) empty.style.display = '';

  stopVoiceTimer();
  stopSpeechRecognition();

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  const durationSec = engineStopOralRound();
  updateBenchState('ended');

  // Reset Global Chambers Header
  const sessionTitleEl = document.getElementById('cr-session-title');
  const sessionMetaEl = document.getElementById('cr-session-meta');
  const exitBtn = document.getElementById('chambers-exit-btn');
  const timerEl = document.getElementById('cr-timer');
  const voiceStatusEl = document.getElementById('bench-voice-status');
  const fpStop = getForumProfile();
  if (sessionTitleEl) sessionTitleEl.textContent = fpStop.chambersLabel;
  if (sessionMetaEl) sessionMetaEl.textContent = fpStop.lobbyLabel;
  if (exitBtn) exitBtn.style.display = 'none';
  if (timerEl) timerEl.style.display = 'none';
  if (voiceStatusEl) voiceStatusEl.style.display = 'none';

  if (currentUser && voiceSessionStartTime) {
    const duration = Math.floor((Date.now() - voiceSessionStartTime) / 1000);
    const mootName = document.getElementById('ws-moot-name')?.value?.trim() || 'Untitled Moot';

    logSessionSecurely({
      uid: currentUser.uid,
      type: 'voice_session',
      mootName: mootName,
      durationSeconds: duration
    }).then(data => {
      console.log("💾 Voice session metadata logged to secure backend.");
      showToast("Oral round saved to account.", "ok");
    }).catch(err => {
      console.error("Failed to log voice session securely:", err);
    });
  }
}

/* ─── VIRTUAL COURTROOM HELPERS ─── */
export function appendTranscript(role, text, isChunk = false) {
  const panel = document.getElementById('bench-transcript-panel');
  if (!panel) return;

  const interim = document.getElementById('cr-interim-bubble');
  if (interim) interim.remove();

  if (role === 'judge') {
    if (isChunk && currentJudgeBubble) {
      currentJudgeSpeech += text;
      const textEl = currentJudgeBubble.querySelector('.cr-msg-text');
      if (textEl) {
        textEl.innerHTML = fmtInline(currentJudgeSpeech);
      }
      panel.scrollTop = panel.scrollHeight;
      return;
    }

    let finalJudgeName = 'The Bench';
    let cleanText = text;

    const tagMatch = text.match(/^\[(.*?)\]\s*(.*)$/i);
    if (tagMatch) {
      finalJudgeName = tagMatch[1].trim();
      cleanText = tagMatch[2].trim();
    } else {
      // The selected judge presides — use his name in the transcript.
      finalJudgeName = getPresidingJudgeName();
    }

    currentJudgeSpeech = cleanText;
    const div = document.createElement('div');
    div.className = 'flex flex-col max-w-[80%] self-start items-start animate-[secReveal_0.3s_ease_both]';

    const crJudgeNameEl = document.getElementById('cr-judge-name');
    if (crJudgeNameEl) {
      crJudgeNameEl.textContent = `⚖️ ${finalJudgeName.toUpperCase()}`;
    }

    div.innerHTML = `
      <div class="text-[10px] font-semibold tracking-wider text-red-400 mb-1 flex items-center gap-1">
        <span>⚖️</span> ${finalJudgeName}
      </div>
      <div class="bg-red-950/20 border border-red-900/30 rounded-r-xl rounded-bl-xl p-3 text-sm text-gray-200 leading-relaxed shadow-sm">
        <span class="cr-msg-text">${fmtInline(cleanText)}</span>
      </div>
    `;
    panel.appendChild(div);
    currentJudgeBubble = div;
  } else if (role === 'advocate') {
    currentJudgeBubble = null;
    currentJudgeSpeech = '';

    const div = document.createElement('div');
    div.className = 'flex flex-col max-w-[80%] self-end items-end animate-[secReveal_0.3s_ease_both]';
    div.innerHTML = `
      <div class="text-[10px] font-semibold tracking-wider text-blue-400 mb-1 flex items-center gap-1">
        <span>🎓</span> Advocate
      </div>
      <div class="bg-blue-950/20 border border-blue-900/30 rounded-l-xl rounded-br-xl p-3 text-sm text-gray-200 leading-relaxed shadow-sm">
        <span class="cr-msg-text">${fmtInline(text)}</span>
      </div>
    `;
    panel.appendChild(div);
  } else {
    currentJudgeBubble = null;
    currentJudgeSpeech = '';

    const div = document.createElement('div');
    div.className = 'flex flex-col max-w-[90%] self-center items-center animate-[secReveal_0.3s_ease_both]';
    div.innerHTML = `
      <div class="bg-gray-900/40 border border-gray-800 rounded-lg py-1.5 px-4 text-xs text-gray-400 text-center">
        ${esc(text)}
      </div>
    `;
    panel.appendChild(div);
  }

  panel.scrollTop = panel.scrollHeight;
}

export function showInterimUserSpeech(text) {
  const panel = document.getElementById('bench-transcript-panel');
  if (!panel) return;

  let interim = document.getElementById('cr-interim-bubble');
  if (!interim) {
    interim = document.createElement('div');
    interim.className = 'bg-gray-900/20 border border-dashed border-gray-800 rounded-l-xl rounded-br-xl p-3 text-sm text-gray-400 font-light italic self-end max-w-[80%]';
    interim.id = 'cr-interim-bubble';
    panel.appendChild(interim);
  }
  interim.textContent = text + '...';
  panel.scrollTop = panel.scrollHeight;
}

/* ─── speech recognition diagnostics and safe start ─── */
function initDiagnostics() {
  const panel = document.getElementById('mic-diagnostics-panel');
  if (!panel) return;

  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isDev) {
    panel.classList.remove('hidden');
  }

  // Browser detection
  const userAgent = navigator.userAgent;
  let browser = 'Unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  document.getElementById('diag-browser').textContent = browser;

  // Availability
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const available = typeof SpeechRecognition !== 'undefined';
  const availableEl = document.getElementById('diag-available');
  if (availableEl) {
    availableEl.textContent = available ? 'YES' : 'NO';
    availableEl.className = available ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold';
  }

  if (!available) {
    const errorMsg = document.getElementById('diag-error-msg');
    if (errorMsg) {
      errorMsg.textContent = "Speech Recognition not supported in this browser";
      errorMsg.classList.remove('hidden');
    }
    showToast("Speech Recognition not supported in this browser", "err");
  }

  // Permission status check if supported
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then(permissionStatus => {
      updateDiagPermission(permissionStatus.state);
      permissionStatus.onchange = () => {
        updateDiagPermission(permissionStatus.state);
      };
    }).catch(err => {
      console.warn("Failed to query mic permission status:", err);
    });
  }
}

function updateDiagPermission(state) {
  const el = document.getElementById('diag-permission');
  if (!el) return;
  let text = 'DENIED';
  let cls = 'text-red-400 font-semibold';
  if (state === 'granted') {
    text = 'GRANTED';
    cls = 'text-green-400 font-semibold';
  } else if (state === 'prompt') {
    text = 'PROMPT REQUIRED';
    cls = 'text-amber-400 font-semibold';
  }
  el.textContent = text;
  el.className = cls;
}

function updateDiagActive(active) {
  const el = document.getElementById('diag-active');
  if (el) {
    el.textContent = active ? 'YES' : 'NO';
    el.className = active ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold';
  }
}

function updateDiagTimestamp(eventName) {
  const el = document.getElementById('diag-timestamp');
  if (el) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds().toString().padStart(3, '0');
    el.textContent = `[${timeStr}] ${eventName}`;
  }
}

function safeAbortRecognition() {
  if (recognitionRestartTimer) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
  }
  if (recognition && isRecognizing) {
    try { recognition.abort(); } catch (e) {}
  }
}

function safeStartRecognition() {
  console.log('[RECOVERY] safeStartRecognition invoked. recognition exists:', !!recognition, 'isRecognizing:', isRecognizing);
  if (!recognition) {
    console.warn("[VOICE] Re-instantiating SpeechRecognition (was null)");
    console.log('[RECOVERY] Rebuilding recognition object...');
    startSpeechRecognition();
    console.log('[RECOVERY] FATAL: Returning early before calling recognition.start()');
    return;
  }
  if (isRecognizing) return;

  if (currentBenchState !== 'listening') {
    console.log(`[VOICE] Aborted recognition.start() because currentBenchState is '${currentBenchState}' (not 'listening')`);
    return;
  }

  try {
    console.log('[RECOVERY] Invoking recognition.start()');
    recognition.start();
    updateDiagActive(true);
    console.log("[VOICE] Recognition started");
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.message === 'NotAllowedError') {
      console.error("[VOICE] Recognition error: Permission denied");
      updateBenchState('permission_denied');
      const statusEl = document.getElementById('cr-session-status');
      if (statusEl) statusEl.textContent = '🔴 Permission Required';
      const footerLabel = document.getElementById('cr-indicator-label');
      if (footerLabel) footerLabel.textContent = '🔴 Permission Required';
      updateDiagPermission('denied');
      stopSpeechRecognition();
    } else {
      console.warn("Speech recognition start warning:", err);
    }
  }
}

function startSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    console.log("Speech recognition not supported in this browser.");
    const availableEl = document.getElementById('diag-available');
    if (availableEl) {
      availableEl.textContent = 'NO';
      availableEl.className = 'text-red-400 font-semibold';
    }
    const errorMsg = document.getElementById('diag-error-msg');
    if (errorMsg) {
      errorMsg.textContent = "Speech Recognition not supported in this browser";
      errorMsg.classList.remove('hidden');
    }
    showToast("Speech Recognition not supported in this browser", "err");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  console.log("[VOICE] Recognition initialized");
  updateDiagTimestamp('Recognition initialized');

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecognizing = true;
    console.log("🎙️ Local Speech Recognition active.");
    console.log("[VOICE] Recognition started");
    console.log('[MIC] Started');
    updateDiagActive(true);
    updateDiagTimestamp('Recognition started');
  };

  recognition.onspeechstart = () => {
    console.log("speech start");
    updateDiagTimestamp('speech start');
    if (currentBenchState !== 'speaking' && currentBenchState !== 'processing') {
      updateBenchState('listening');
    }
  };

  recognition.onspeechend = () => {
    console.log("speech end");
    updateDiagTimestamp('speech end');
    if (currentBenchState === 'listening') {
      updateBenchState('processing');
    }
  };

  recognition.onresult = (event) => {
    console.log("speech result");
    console.log("[VOICE] Recognition result");
    updateDiagTimestamp('speech result');

    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    console.log("[DEBUG AUDIT] Web Speech API onresult:", { finalTranscript, interimTranscript });

    if (finalTranscript) {
      console.log("[DEBUG AUDIT] User speech captured (final):", finalTranscript);
      console.log('[MIC] Result:', finalTranscript);
      appendTranscript('advocate', finalTranscript);
      console.log("[DEBUG AUDIT] Advocate transcript appended:", finalTranscript);
      benchConversation.push({ role: 'advocate', content: finalTranscript });
      
      lastInterimTranscript = ''; // Clear tracking on successful final

      const interim = document.getElementById('cr-interim-bubble');
      if (interim) interim.remove();

      // Counsel finished speaking -> transition status to processing
      updateBenchState('processing');

      // Reset judge's text container to clear old judge text
      const judgeTextContainer = document.getElementById('judge-text-container');
      if (judgeTextContainer) {
        judgeTextContainer.innerHTML = "";
      }

      // Defensive check: If socket is not open, reconnect and send finalTranscript text payload
      if (getSocketState() !== 'open') {
        console.warn("[WARN] Socket is not open when speech completed. Reconnecting and sending text transcript.");
        sendSpeechText(finalTranscript);
      }
    } else if (interimTranscript) {
      lastInterimTranscript = interimTranscript;
      showInterimUserSpeech(interimTranscript);
    }
  };

  recognition.onerror = (e) => {
    if (e.error === 'aborted') {
      return; // Ignore intentional aborts to prevent log noise
    }
    console.log("speech error", e.error);
    console.error("[VOICE] Recognition error:", e.error);
    updateDiagTimestamp(`speech error: ${e.error}`);

    if (e.error === 'not-allowed') {
      updateDiagPermission('denied');
      updateBenchState('permission_denied');
      const statusEl = document.getElementById('cr-session-status');
      if (statusEl) statusEl.textContent = '🔴 Permission Required';
      const footerLabel = document.getElementById('cr-indicator-label');
      if (footerLabel) footerLabel.textContent = '🔴 Permission Required';
      stopSpeechRecognition();
      return;
    }
    if (e.error === 'no-speech') {
      console.warn('No speech detected');
      return;
    }
  };

  recognition.onend = () => {
    isRecognizing = false;
    console.log("[VOICE] Recognition ended");
    console.log('[MIC] Ended');
    updateDiagActive(false);
    updateDiagTimestamp('Recognition ended');

    if (voiceSessionActive && currentBenchState === 'listening') {
      if (recognitionRestartTimer) clearTimeout(recognitionRestartTimer);
      recognitionRestartTimer = setTimeout(() => {
        try {
          if (voiceSessionActive && currentBenchState === 'listening') {
            safeStartRecognition();
            console.log("[DEBUG AUDIT] Mic restarted in onend.");
          }
        } catch (err) {
          console.error('Mic restart failed', err);
        }
      }, 800);
    }
  };
}

function stopSpeechRecognition() {
  if (recognitionRestartTimer) {
    clearTimeout(recognitionRestartTimer);
    recognitionRestartTimer = null;
  }
  if (recognition) {
    recognition.onend = null;
    try { recognition.abort(); } catch (e) { }
    recognition = null;
    isRecognizing = false;
  }
}

function startVoiceTimer() {
  voiceElapsedTime = 0;
  updateVoiceTimerDisplay();
  clearInterval(voiceTimerInterval);
  voiceTimerInterval = setInterval(() => {
    voiceElapsedTime++;
    updateVoiceTimerDisplay();
  }, 1000);
}

function stopVoiceTimer() {
  clearInterval(voiceTimerInterval);
  voiceTimerInterval = null;
}

function updateVoiceTimerDisplay() {
  const timerEl = document.getElementById('cr-timer');
  if (!timerEl) return;
  const mins = Math.floor(voiceElapsedTime / 60).toString().padStart(2, '0');
  const secs = (voiceElapsedTime % 60).toString().padStart(2, '0');
  timerEl.textContent = `ELAPSED: ${mins}:${secs}`;
}
