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

// Simulator State
export let benchConversation = [];
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
let localTtsSpeaking = false;
let currentBenchState = 'idle';
let sentenceBuffer = "";
let lastScheduledUtterance = null;

// Expose benchActive on window for UI checks (e.g. showWsPanel)
window.benchActive = false;

export function setBenchDifficulty(mode) {
  benchDifficultyMode = mode;
  window.benchDifficultyMode = mode;
  ['easy','moderate','hard'].forEach(d => {
    const el = document.getElementById(`bench-diff-${d}`);
    if (el) el.className = `diff-btn${d === mode ? ` active-${d}` : ''}`;
  });
  updateBenchProfileUI(mode);
}

export function updateBenchProfileUI(mode) {
  const titleEl = document.getElementById('lobby-bench-type-title');
  const questionsEl = document.getElementById('lobby-expected-questions');
  const interruptionEl = document.getElementById('lobby-interruption-freq');
  const aggressionEl = document.getElementById('lobby-aggression');
  const focusEl = document.getElementById('lobby-focus-areas');
  const durationEl = document.getElementById('lobby-duration');
  const rosterEl = document.getElementById('lobby-judges-roster');

  if (!rosterEl) return;

  const data = {
    easy: {
      title: "Lenient Appellate Bench",
      questions: "5–10",
      interruption: "Low",
      aggression: "Low",
      focus: "Basic Jurisdiction · Core Statutory Definitions · Standard Grounds of Appeal",
      duration: "10 mins",
      judges: [
        {
          name: "Justice Sen",
          ideology: "The Mentor",
          behavior: "Encouraging, focuses on basic maintainability. Wants to see clean framing and understanding of fundamental legal principles."
        },
        {
          name: "Justice Patil",
          ideology: "Procedural Formalist",
          behavior: "Patient but expects standard court procedures to be followed. Focuses on the factual timeline and record of the lower courts."
        }
      ]
    },
    moderate: {
      title: "Moderate Constitutional Bench",
      questions: "15–20",
      interruption: "Medium",
      aggression: "High",
      focus: "Privacy · Proportionality · Due Process · Algorithmic Accountability",
      duration: "20 mins",
      judges: [
        {
          name: "Chief Justice Rao",
          ideology: "Constitutional Purist",
          behavior: "Focuses on the letter of the constitution and proportionality. Probes how reading down a clause matches state interest."
        },
        {
          name: "Justice Menon",
          ideology: "Procedural Hawk",
          behavior: "Zero tolerance for missed deadlines or incorrect appeal procedures. Queries locus standi and legislative intent."
        },
        {
          name: "Justice Iyer",
          ideology: "Rights-Oriented",
          behavior: "Focuses on equity, fairness, and human rights. Interested in public interest impact and natural justice."
        }
      ]
    },
    hard: {
      title: "Hostile Full Constitutional Bench",
      questions: "25–30",
      interruption: "High",
      aggression: "Extreme",
      focus: "Manifest Arbitrariness · Standard of Review · Separation of Powers · Deep Precedential Inconsistencies",
      duration: "35 mins",
      judges: [
        {
          name: "Chief Justice Rao",
          ideology: "Constitutional Purist",
          behavior: "Focuses on separation of powers and judicial restraint. Hostile to arguments suggesting policy decisions should be second-guessed."
        },
        {
          name: "Justice Menon",
          ideology: "Procedural Hawk",
          behavior: "Intense, Socratic questioning. Probes jurisdictional boundaries and constitutional maintainability gates."
        },
        {
          name: "Justice Iyer",
          ideology: "Rights-Oriented",
          behavior: "Extremely analytical about systemic impacts. Probes proportionate measures and checks whether a lesser-restrictive alternative exists."
        }
      ]
    }
  };

  const bench = data[mode] || data.moderate;

  if (titleEl) titleEl.textContent = bench.title;
  if (questionsEl) questionsEl.textContent = bench.questions;
  if (interruptionEl) interruptionEl.textContent = bench.interruption;
  if (aggressionEl) aggressionEl.textContent = bench.aggression;
  if (focusEl) focusEl.textContent = bench.focus;
  if (durationEl) durationEl.textContent = bench.duration;

  rosterEl.innerHTML = bench.judges.map(j => `
    <div class="p-3 bg-white/[0.01] border border-white/5 rounded-xl flex items-start gap-3" style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; display: flex; align-items: start; gap: 12px;">
      <div class="w-8 h-8 rounded-full bg-moot-accent/10 border border-moot-accent/30 flex items-center justify-center text-xs font-bold text-moot-accent flex-shrink-0 mt-0.5" style="width: 32px; height: 32px; border-radius: 50%; background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.3); display: flex; align-items: center; justify-content: center; color: var(--gold); flex-shrink: 0;">⚖️</div>
      <div>
        <h5 class="text-xs font-semibold text-white" style="font-size: 12px; font-weight: 600; color: #fff; margin: 0;">${esc(j.name)} <span class="text-[9px] uppercase tracking-wider text-white-muted font-normal ml-2" style="font-size: 9px; color: #a0aec0; text-transform: uppercase; font-weight: normal; margin-left: 8px;">${esc(j.ideology)}</span></h5>
        <p class="text-[10px] text-white-muted mt-1 leading-relaxed" style="font-size: 10px; color: #cbd5e0; line-height: 1.4; margin: 4px 0 0 0;">${esc(j.behavior)}</p>
      </div>
    </div>
  `).join('');
}

export function startBenchSession() {
  benchConversation = [];
  benchActive = true;
  window.benchActive = true;
  benchSubmitting = false;

  const chat     = document.getElementById('bench-chat');
  const empty    = document.getElementById('bench-empty');
  const inputRow = document.getElementById('bench-input-row');
  const btnClear = document.getElementById('btn-bench-clear');
  const btnStart = document.getElementById('btn-bench-start');
  const courtroom = document.getElementById('courtroom-view');

  if (courtroom) courtroom.classList.remove('active');
  if (empty)    empty.style.display    = 'none';
  if (inputRow) inputRow.style.display = 'flex';
  if (btnClear) btnClear.style.display = '';
  if (btnStart) btnStart.textContent   = 'Restart';

  if (chat) {
    chat.style.display = 'flex';
    chat.querySelectorAll('.bench-msg').forEach(m => m.remove());
  }

  // Update Global Chambers Header for Text Session
  const mootName = document.getElementById('ws-moot-name')?.value?.trim() || 'General Appellate Docket';
  const sessionTitleEl = document.getElementById('cr-session-title');
  const sessionMetaEl = document.getElementById('cr-session-meta');
  const exitBtn = document.getElementById('chambers-exit-btn');
  if (sessionTitleEl) sessionTitleEl.textContent = mootName;
  if (sessionMetaEl) sessionMetaEl.textContent = `TEXT BENCH SIMULATION · ${benchDifficultyMode.toUpperCase()} BENCH`;
  if (exitBtn) exitBtn.style.display = 'block';

  const openingMap = {
    easy:     "Good morning, Counsel. This Court is ready to hear your submissions. Please state the nature of your petition and establish your locus standi before proceeding.",
    moderate: "Counsel, you may proceed. This Bench has read the proposition. Begin with your first issue and your primary submission on it. Be precise.",
    hard:     "Counsel — before you commence your submissions on the merits, satisfy this Bench on one thing: on what precise constitutional or statutory basis does this Court have jurisdiction to entertain this petition?"
  };

  const opening = openingMap[benchDifficultyMode] || openingMap.moderate;
  appendBenchMessage('judge', opening, null, 'Opening the session', 1);
  benchConversation.push({ role:'judge', content: opening });

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
  benchConversation = [];
  benchActive = false;
  window.benchActive = false;
  benchSubmitting = false;

  const chat     = document.getElementById('bench-chat');
  const inputRow = document.getElementById('bench-input-row');
  const btnClear = document.getElementById('btn-bench-clear');
  const btnStart = document.getElementById('btn-bench-start');
  const empty    = document.getElementById('bench-empty');
  const courtroom = document.getElementById('courtroom-view');

  if (courtroom) courtroom.classList.remove('active');
  if (chat) {
    chat.style.display = 'none';
    chat.querySelectorAll('.bench-msg').forEach(m => m.remove());
  }
  if (inputRow) inputRow.style.display = 'none';
  if (btnClear) btnClear.style.display = 'none';
  if (btnStart) btnStart.textContent   = 'Start New Session';
  if (empty)    empty.style.display    = '';

  // Reset Global Chambers Header
  const sessionTitleEl = document.getElementById('cr-session-title');
  const sessionMetaEl = document.getElementById('cr-session-meta');
  const exitBtn = document.getElementById('chambers-exit-btn');
  const timerEl = document.getElementById('cr-timer');
  const voiceStatusEl = document.getElementById('bench-voice-status');
  if (sessionTitleEl) sessionTitleEl.textContent = 'Judicial Chambers';
  if (sessionMetaEl) sessionMetaEl.textContent = 'Chambers Lobby';
  if (exitBtn) exitBtn.style.display = 'none';
  if (timerEl) timerEl.style.display = 'none';
  if (voiceStatusEl) voiceStatusEl.style.display = 'none';
}

export function appendBenchMessage(role, text, pressureLevel, targetWeakness, displayPressure) {
  const chat = document.getElementById('bench-chat');
  if (!chat) return;

  const div = document.createElement('div');
  div.className = `bench-msg bench-msg-${role}`;

  if (role === 'system') {
    div.innerHTML = `<div class="bm-role bm-role-system">System</div><div class="bm-text">${esc(text)}</div>`;
  } else {
    const roleLabel = role === 'judge' ? 'BENCH' : 'COUNSEL';
    const roleCls   = role === 'judge' ? 'bm-role-judge' : 'bm-role-advocate';
    
    const pressure  = displayPressure || pressureLevel || 0;

    const pressureHTML = (pressure > 0 && role === 'judge')
      ? `<div class="pressure-dots">${[1,2,3,4,5].map(n => `<div class="pressure-dot${n <= pressure ? ' filled':''}"></div>`).join('')}</div>`
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
  chat.scrollTo({ top: chat.scrollHeight, behavior:'smooth' });
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

  const grade = review.grade || 'C';
  const score = Number(review.overallScore) || 0;
  const gradeCls = `grade-${grade}`;

  const defectsHTML = (review.substantiveDefects || []).length
    ? (review.substantiveDefects).map(d => `
        <div style="margin-bottom:10px;padding:12px 14px;background:rgba(224,82,82,.04);border:1px solid rgba(224,82,82,.15);border-left:3px solid #e05252;border-radius:0 8px 8px 0;">
          <div style="font-size:.82rem;color:var(--white-2);line-height:1.6;">${fmtInline(d)}</div>
        </div>`).join('')
    : `<div style="font-size:.82rem;color:#4caf82;padding:8px 0;">No substantive defects recorded.</div>`;

  const strengthsHTML = (review.strengthPoints || []).length
    ? (review.strengthPoints).map(s => `
        <div style="margin-bottom:10px;padding:12px 14px;background:rgba(76,175,130,.04);border:1px solid rgba(76,175,130,.15);border-left:3px solid #4caf82;border-radius:0 8px 8px 0;">
          <div style="font-size:.82rem;color:var(--white-2);line-height:1.6;">${fmtInline(s)}</div>
        </div>`).join('')
    : `<div style="font-size:.82rem;color:var(--white-muted);padding:8px 0;">No specific strengths recorded.</div>`;

  const adviceHTML = (review.strategicAdvice || []).length
    ? (review.strategicAdvice).map(a => `
        <div style="margin-bottom:10px;padding:12px 14px;background:rgba(96,165,250,.04);border:1px solid rgba(96,165,250,.15);border-left:3px solid #60a5fa;border-radius:0 8px 8px 0;">
          <div style="font-size:.82rem;color:var(--white-2);line-height:1.6;">${fmtInline(a)}</div>
        </div>`).join('')
    : `<div style="font-size:.82rem;color:var(--white-muted);padding:8px 0;">No strategic advice recorded.</div>`;

  div.innerHTML = `
    <div style="display:flex;align-items:center;gap:18px;margin-bottom:20px;padding:16px 20px;background:var(--navy-4);border:1px solid var(--glass-b);border-radius:12px;flex-wrap:wrap;justify-content:space-between;width:100%;box-sizing:border-box;">
      <div style="display:flex;align-items:center;gap:18px;">
        <div class="oral-grade-badge ${gradeCls}" style="flex-shrink:0;margin:0;width:50px;height:50px;font-size:1.6rem;line-height:48px;">${grade}</div>
        <div>
          <div style="font-family:var(--serif);font-size:2.2rem;font-weight:500;color:var(--white);line-height:1;" id="animated-bench-score">0<span style="font-size:1rem;color:var(--white-muted);font-family:var(--sans);">/100</span></div>
          <div style="font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--white-muted);margin-top:3px;">Bench Advocacy Score</div>
        </div>
      </div>
      <button class="btn-sm btn-sm-ghost" onclick="startBenchSession()" style="align-self:center;">Restart Session</button>
    </div>

    ${review.finalVerdict ? `
    <div style="margin-bottom:20px;padding:16px;background:rgba(255,255,255,.02);border:1px solid var(--glass-b);border-radius:10px;">
      <div style="font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--white-muted);margin-bottom:8px;font-weight:600;">Court's Verdict</div>
      <div style="font-family:var(--serif);font-size:.95rem;font-style:italic;color:var(--white-2);line-height:1.7;">"${fmtInline(review.finalVerdict)}"</div>
    </div>` : ''}

    <div class="analysis-section-card" style="margin-bottom:12px;background:var(--navy-4);">
      <div class="asc-header" id="asc-h-bench-defects" onclick="toggleSection('bench-defects')">
        <div class="asc-header-left"><div class="asc-icon asc-icon-red">◬</div><div class="asc-title">Substantive Defects</div></div>
        <div class="asc-header-right"><span class="asc-badge badge-red">Issues</span><span class="asc-chevron" id="asc-ch-bench-defects">▾</span></div>
      </div>
      <div class="asc-body" id="asc-b-bench-defects" style="padding:16px 18px;">${defectsHTML}</div>
    </div>

    <div class="analysis-section-card" style="margin-bottom:12px;background:var(--navy-4);">
      <div class="asc-header" id="asc-h-bench-strengths" onclick="toggleSection('bench-strengths')">
        <div class="asc-header-left"><div class="asc-icon asc-icon-green">▲</div><div class="asc-title">Strengths Observed</div></div>
        <div class="asc-header-right"><span class="asc-badge badge-green">Positives</span><span class="asc-chevron" id="asc-ch-bench-strengths">▾</span></div>
      </div>
      <div class="asc-body" id="asc-b-bench-strengths" style="padding:16px 18px;">${strengthsHTML}</div>
    </div>

    <div class="analysis-section-card" style="margin-bottom:0;background:var(--navy-4);">
      <div class="asc-header" id="asc-h-bench-advice" onclick="toggleSection('bench-advice')">
        <div class="asc-header-left"><div class="asc-icon asc-icon-blue">↯</div><div class="asc-title">Strategic Advice</div></div>
        <div class="asc-header-right"><span class="asc-badge badge-blue">Advice</span><span class="asc-chevron" id="asc-ch-bench-advice">▾</span></div>
      </div>
      <div class="asc-body" id="asc-b-bench-advice" style="padding:16px 18px;">${adviceHTML}</div>
    </div>
  `;

  chat.appendChild(div);
  chat.scrollTo({ top: chat.scrollHeight, behavior:'smooth' });

  // Animate the score
  setTimeout(() => {
    const scoreEl = document.getElementById('animated-bench-score');
    if (scoreEl) {
       let startTimestamp = null;
       const duration = 1500;
       const step = (timestamp) => {
         if (!startTimestamp) startTimestamp = timestamp;
         const progress = Math.min((timestamp - startTimestamp) / duration, 1);
         const ease = 1 - Math.pow(1 - progress, 4);
         const currentScore = Math.floor(ease * score);
         scoreEl.innerHTML = `${currentScore}<span style="font-size:1rem;color:var(--white-muted);font-family:var(--sans);">/100</span>`;
         if (progress < 1) {
           window.requestAnimationFrame(step);
         } else {
           scoreEl.innerHTML = `${score}<span style="font-size:1rem;color:var(--white-muted);font-family:var(--sans);">/100</span>`; 
         }
       };
       window.requestAnimationFrame(step);
    }
  }, 100);
}

export async function submitToBench() {
  if (benchSubmitting || !benchActive) return;
  const input   = document.getElementById('bench-input');
  const sendBtn = document.getElementById('btn-bench-send');
  const statement = input?.value?.trim();
  if (!statement || statement.length < 3) return;

  benchSubmitting = true;
  if (sendBtn) sendBtn.disabled = true;

  appendBenchMessage('advocate', statement);
  benchConversation.push({ role:'advocate', content: statement });
  if (input) input.value = '';

  const typingId = 'typing-' + Date.now();
  const chat = document.getElementById('bench-chat');
  if (chat) {
    const t = document.createElement('div');
    t.className = 'bench-msg bench-msg-judge';
    t.id = typingId;
    t.innerHTML = `<div class="bm-role bm-role-judge">BENCH</div><div class="bm-text" style="opacity:.4;letter-spacing:.08em;">. . .</div>`;
    chat.appendChild(t);
    chat.scrollTo({ top: chat.scrollHeight, behavior:'smooth' });
  }

  try {
    const selectedIssue = document.getElementById('builder-issue-select')?.value || '';
    const selectedStance = (typeof getCurrentSelectedSide === 'function') ? getCurrentSelectedSide() : 'Petitioner';
    const selectedAuthsText = (selectedAuthorities || []).map(a => `${a.name}: ${a.ratio}`).join(', ');
    const contextPrefix = `[Advocate Side: ${selectedStance.toUpperCase()}] [Target Issue: ${selectedIssue}] [Selected Authorities: ${selectedAuthsText}]\n\n`;

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
        studentStatement: statement
      })
    });

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
    appendBenchMessage('judge', judgeText, data.pressureLevel, data.targetWeakness);
    requestAnimationFrame(() => {
      const chat = document.getElementById('bench-chat');
      if (chat) {
        chat.scrollTop = chat.scrollHeight;
      }
    });
    benchConversation.push({ role:'judge', content: judgeText });

  } catch (err) {
    document.getElementById(typingId)?.remove();
    appendBenchMessage('system', `Connection error: ${err.message} — Please try again.`);
  } finally {
    benchSubmitting = false;
    if (benchActive) {
      if (sendBtn) sendBtn.disabled = false;
      if (input)   input.focus();
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

const JUDGE_NAMES = [
  "Justice Rao",
  "Justice Malhotra",
  "Justice Bhat",
  "Justice Nagarathna",
  "Justice Roy",
  "Justice Gavai",
  "Justice Khanna",
  "Justice Banerjee",
  "Justice Kaul",
  "Justice Sundresh"
];

function getJudgeName() {
  const mootName = document.getElementById('ws-moot-name')?.value?.trim();
  if (!mootName) {
    const fileName = document.getElementById('wsib-file')?.textContent?.trim();
    if (fileName && fileName !== 'No file uploaded') {
      return getDeterministicJudge(fileName);
    }
    return "Presiding Judge";
  }
  return getDeterministicJudge(mootName);
}

function getDeterministicJudge(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % JUDGE_NAMES.length;
  return `Justice ${JUDGE_NAMES[index].replace("Justice ", "")}`;
}

function getOpeningStatement() {
  const issueSelect = document.getElementById('builder-issue-select');
  const selectedIssue = issueSelect ? issueSelect.value : '';
  const stance = (typeof getCurrentSelectedSide === 'function') ? getCurrentSelectedSide() : 'Petitioner';
  const displayStance = stance ? (stance.charAt(0).toUpperCase() + stance.slice(1).toLowerCase()) : 'Petitioner';

  if (selectedIssue) {
    let cleanedIssue = selectedIssue.replace(/^(issue\s*\d+\s*:?\s*|whether\s+)/i, '').trim();
    cleanedIssue = cleanedIssue.charAt(0).toUpperCase() + cleanedIssue.slice(1);
    
    if (!cleanedIssue.endsWith('?') && !cleanedIssue.endsWith('.')) {
      cleanedIssue += '?';
    }
    
    const dynamicOpening = `Counsel for the ${displayStance}, the Bench is prepared to hear your submissions on this issue: ${cleanedIssue}`;
    console.log("[DEBUG AUDIT] Generated dynamic selected issue/stance opening statement:", dynamicOpening);
    return dynamicOpening;
  }

  const genericOpening = `Counsel for the ${displayStance}, please summarize the principal constitutional issue before this Bench.`;
  return genericOpening;
}

export function playJudgeAudio(text, callback, queue = false) {
  console.log("[DEBUG AUDIT] playJudgeAudio starting for text:", text);
  if (!('speechSynthesis' in window)) {
    console.warn("speechSynthesis not supported, executing callback directly.");
    if (callback) callback();
    return;
  }

  // Cancel any ongoing speech if not queuing
  if (!queue) {
    window.speechSynthesis.cancel();
    lastScheduledUtterance = null;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Microsoft David") || v.lang === "en-US");
  if (preferredVoice) utterance.voice = preferredVoice;
  
  utterance.rate = 1.0;
  utterance.pitch = 0.9; // Slightly lower pitch for authority

  console.log('[TTS] Starting');
  console.log('[TTS] Voice:', utterance.voice?.name);

  utterance.onend = () => {
    console.log("[DEBUG AUDIT] playJudgeAudio utterance.onend fired.");
    console.log('[TTS] Finished');
    if (callback) callback();
  };

  utterance.onerror = (e) => {
    console.error("[DEBUG AUDIT] playJudgeAudio error:", e);
    console.log('[TTS] Finished');
    if (callback) callback();
  };

  lastScheduledUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function triggerJudgeOpeningStatement() {
  console.log("[DEBUG AUDIT] Triggering Judge opening statement...");
  updateBenchState('speaking');
  localTtsSpeaking = true;
  
  const openingText = getOpeningStatement();
  appendTranscript('judge', openingText);
  console.log("[DEBUG AUDIT] Opening statement text appended to transcript:", openingText);

  // Play opening statement via TTS
  playJudgeAudio(openingText, () => {
    console.log("[DEBUG AUDIT] Opening statement TTS completed.");
    localTtsSpeaking = false;
    updateBenchState('listening');
    safeStartRecognition();
  });
}

export function updateBenchState(state) {
  window.voiceStatus = state;
  currentBenchState = state;
  updateDiagTimestamp(`State: ${state}`);

  if (state === 'speaking' || state === 'connecting' || state === 'ended' || state === 'permission_denied') {
    if (recognition) {
      try {
        recognition.abort();
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
  if (judgeNameEl) {
    const judgeName = getJudgeName();
    judgeNameEl.textContent = `⚖️ ${judgeName}`;
  }
  if (benchNameEl) {
    const difficultyLabel = (benchDifficultyMode || 'moderate').toUpperCase();
    benchNameEl.textContent = difficultyLabel === 'HARD' ? 'Constitutional Bench' : (difficultyLabel === 'EASY' ? 'District Court Bench' : 'Division Bench');
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

  // Unlock SpeechSynthesis for mobile/iOS by playing a silent utterance in the direct click handler
  if ('speechSynthesis' in window) {
    try {
      const silentUtterance = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(silentUtterance);
      console.log("[DEBUG AUDIT] Warmed up SpeechSynthesis for iOS/mobile");
    } catch (e) {
      console.warn("Failed to warm up SpeechSynthesis:", e);
    }
  }

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

  if (sessionTitleEl) sessionTitleEl.textContent = mootName;
  if (sessionMetaEl) sessionMetaEl.textContent = `VOICE BENCH SIMULATION · ${benchDifficultyMode.toUpperCase()} BENCH`;
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
        if (status === 'connecting') {
          updateBenchState('connecting');
        } else if (status === 'ready') {
          triggerJudgeOpeningStatement();
        } else if (status === 'listening') {
          if (!localTtsSpeaking) {
            updateBenchState('listening');
            safeStartRecognition();
          } else {
            console.log("[DEBUG AUDIT] Ignored engine status 'listening' because local TTS is speaking.");
          }
        } else if (status === 'speaking') {
          if (getSocketState() === 'open') {
            updateBenchState('speaking');
            if (recognition) {
              try {
                recognition.stop();
                console.log("[DEBUG AUDIT] Mic stopped because Judge is speaking.");
              } catch (e) {
                console.warn("Failed to stop recognition:", e);
              }
            }
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
        sentenceBuffer += text;

        // Check for sentence boundaries: ., ?, or !
        if (/[.?!]/.test(text)) {
          const cleanChunk = sentenceBuffer.trim();
          if (cleanChunk) {
            localTtsSpeaking = true;
            playJudgeAudio(cleanChunk, null, true);
          }
          sentenceBuffer = "";
        }
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

        const trailing = sentenceBuffer.trim();
        if (trailing) {
          playJudgeAudio(trailing, () => {
            console.log("[DEBUG AUDIT] SpeechSynthesis playback completed (trailing). Activating mic...");
            localTtsSpeaking = false;
            updateBenchState('listening');
            safeStartRecognition();
          }, true);
        } else if (lastScheduledUtterance) {
          const oldOnEnd = lastScheduledUtterance.onend;
          lastScheduledUtterance.onend = () => {
            if (oldOnEnd) oldOnEnd();
            console.log("[DEBUG AUDIT] SpeechSynthesis playback completed (lastScheduledUtterance). Activating mic...");
            localTtsSpeaking = false;
            updateBenchState('listening');
            safeStartRecognition();
          };
        } else {
          localTtsSpeaking = false;
          updateBenchState('listening');
          safeStartRecognition();
        }

        fullJudgeResponse = '';
        sentenceBuffer = '';
      },
      onInterrupted: () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        const cleanResponse = fullJudgeResponse.trim();
        if (cleanResponse) {
          console.log('[JUDGE TRANSCRIPT] Response received (interrupted):', cleanResponse);
          appendTranscript('judge', cleanResponse + "...");
          console.log('[JUDGE TRANSCRIPT] Appended to transcript (interrupted)');
          console.log('[JUDGE TRANSCRIPT] Container found:', !!document.getElementById('bench-transcript-panel'));
          console.log('[JUDGE TRANSCRIPT] Judge bubble inserted');
        }
        fullJudgeResponse = '';
        sentenceBuffer = '';
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
        console.log("[DEBUG AUDIT] Gemini Live playback completed. (Ignored because we use local SpeechSynthesis callback)");
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
  localTtsSpeaking = false;
  sentenceBuffer = '';
  lastScheduledUtterance = null;

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
  if (sessionTitleEl) sessionTitleEl.textContent = 'Judicial Chambers';
  if (sessionMetaEl) sessionMetaEl.textContent = 'Chambers Lobby';
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

    currentJudgeSpeech = text;
    const div = document.createElement('div');
    div.className = 'flex flex-col max-w-[80%] self-start items-start animate-[secReveal_0.3s_ease_both]';
    
    // Get dynamic Judge Name
    const judgeName = getJudgeName();
    
    div.innerHTML = `
      <div class="text-[10px] font-semibold tracking-wider text-red-400 mb-1 flex items-center gap-1">
        <span>⚖️</span> ${judgeName}
      </div>
      <div class="bg-red-950/20 border border-red-900/30 rounded-r-xl rounded-bl-xl p-3 text-sm text-gray-200 leading-relaxed shadow-sm">
        <span class="cr-msg-text">${fmtInline(text)}</span>
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

function safeStartRecognition() {
  if (!recognition) return;
  
  if (currentBenchState !== 'listening') {
    console.log(`[VOICE] Aborted recognition.start() because currentBenchState is '${currentBenchState}' (not 'listening')`);
    return;
  }
  
  try {
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
      showInterimUserSpeech(interimTranscript);
    }
  };

  recognition.onerror = (e) => {
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
    console.log("[VOICE] Recognition ended");
    console.log('[MIC] Ended');
    updateDiagActive(false);
    updateDiagTimestamp('Recognition ended');
    
    if (voiceSessionActive && currentBenchState === 'listening') {
      setTimeout(() => {
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
  if (recognition) {
    recognition.onend = null;
    try { recognition.abort(); } catch(e){}
    recognition = null;
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
