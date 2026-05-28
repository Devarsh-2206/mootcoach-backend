import { BASE_URL } from '../config.js';
import { currentUser } from '../services/firebase.js';
import { 
  currentPropositionContext, 
  showToast, 
  esc, 
  fmtInline, 
  showWsPanel, 
  toggleSection 
} from './ui.js';
import { 
  startOralRound as engineStartOralRound, 
  stopOralRound as engineStopOralRound 
} from '../services/audioEngine.js';
import { logSessionSecurely } from '../services/api.js';

// Simulator State
export let benchConversation = [];
export let benchActive = false;
export let benchSubmitting = false;
export let benchDifficultyMode = 'moderate';
export let voiceSessionActive = false;
export let voiceSessionStartTime = null;

// Local Voice State
let recognition = null;
let voiceTimerInterval = null;
let voiceElapsedTime = 0;

// Expose benchActive on window for UI checks (e.g. showWsPanel)
window.benchActive = false;

export function setBenchDifficulty(mode) {
  benchDifficultyMode = mode;
  ['easy','moderate','hard'].forEach(d => {
    const el = document.getElementById(`bench-diff-${d}`);
    if (el) el.className = `diff-btn${d === mode ? ` active-${d}` : ''}`;
  });
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
    const res = await fetch(`${BASE_URL}/simulate-bench`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationHistory: benchConversation.slice(-10),
        propositionSummary: currentPropositionContext || '',
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
function updateVoiceUI(status, text) {
  const badge = document.getElementById('bench-voice-status');
  const dot = document.getElementById('bench-voice-dot');
  const label = document.getElementById('bench-voice-text');
  
  // Courtroom UI elements
  const crBadge = document.getElementById('cr-status-badge');
  const crAvatarJudge = document.getElementById('cr-avatar-judge');
  const crAvatarUser = document.getElementById('cr-avatar-user');
  const crVisualizer = document.getElementById('cr-visualizer-bar');

  if (!badge || !dot || !label) return;
  
  badge.style.display = 'flex';
  label.textContent = text;
  
  window.voiceStatus = status;

  // Reset animations
  if (crAvatarJudge) crAvatarJudge.className = 'cr-avatar';
  if (crAvatarUser) crAvatarUser.className = 'cr-avatar';
  if (crVisualizer) crVisualizer.className = 'cr-visualizer-bar';

  if (crBadge) {
    crBadge.className = 'cr-status-badge';
    crBadge.innerHTML = `<span class="badge-dot"></span>${text}`;
  }

  if (status === 'connecting') {
    badge.className = 'backend-status checking';
    dot.className = 'bs-dot';
    label.style.color = 'var(--gold)';
    if (crBadge) crBadge.classList.add('connecting');
  } else if (status === 'listening') {
    badge.className = 'backend-status online';
    dot.className = 'bs-dot';
    label.style.color = 'var(--success)';
    if (crBadge) {
      crBadge.classList.add('listening');
      crBadge.innerHTML = `<span class="badge-dot"></span>Court is Listening`;
    }
    if (crAvatarUser) crAvatarUser.classList.add('listening-user');
  } else if (status === 'speaking') {
    badge.className = 'backend-status checking';
    dot.className = 'bs-dot';
    label.style.color = '#fbbf24';
    if (crBadge) {
      crBadge.classList.add('speaking-judge');
      crBadge.innerHTML = `<span class="badge-dot"></span>Judge Speaking`;
    }
    if (crAvatarJudge) crAvatarJudge.classList.add('speaking-judge');
    if (crVisualizer) crVisualizer.classList.add('active', 'judge');
  } else if (status === 'user_speaking') {
    badge.className = 'backend-status online';
    dot.className = 'bs-dot';
    label.style.color = '#60a5fa';
    if (crBadge) {
      crBadge.classList.add('speaking-user');
      crBadge.innerHTML = `<span class="badge-dot"></span>Advocate Speaking`;
    }
    if (crAvatarUser) crAvatarUser.classList.add('speaking-user');
    if (crVisualizer) crVisualizer.classList.add('active', 'user');
  } else if (status === 'processing') {
    badge.className = 'backend-status checking';
    dot.className = 'bs-dot';
    label.style.color = '#a78bfa';
    if (crBadge) crBadge.classList.add('processing');
  } else if (status === 'error') {
    badge.className = 'backend-status offline';
    dot.className = 'bs-dot';
    label.style.color = 'var(--error)';
    if (crBadge) crBadge.classList.add('error');
  } else {
    badge.style.display = 'none';
  }
}

export async function startOralRound() {
  if (voiceSessionActive) {
    stopOralRound();
    return;
  }

  console.log("🎙️ Initiating oral round...");
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
  const feed = document.getElementById('cr-transcript-feed');
  if (feed) feed.innerHTML = '';
  if (courtroom) courtroom.classList.add('active');

  // Load Moot details into headers
  const mootName = document.getElementById('ws-moot-name')?.value?.trim() || 'General Appellate Docket';
  const sessionTitleEl = document.getElementById('cr-session-title');
  const sessionMetaEl = document.getElementById('cr-session-meta');
  if (sessionTitleEl) sessionTitleEl.textContent = mootName;
  if (sessionMetaEl) sessionMetaEl.textContent = `VOICE BENCH SIMULATION · ${benchDifficultyMode.toUpperCase()} BENCH`;

  updateVoiceUI('connecting', 'Connecting...');
  appendCourtroomTranscript('system', 'Starting Oral Round. Please grant microphone permissions.');

  // Start timers and local speech-to-text
  startVoiceTimer();
  startSpeechRecognition();

  try {
    await engineStartOralRound({
      onStatusChange: (status, text) => {
        updateVoiceUI(status, text);
      },
      onText: (text) => {
        appendBenchMessage('judge', text);
        appendCourtroomTranscript('judge', text);
      },
      onError: (message) => {
        appendBenchMessage('system', `Judge Error: ${message}`);
        appendCourtroomTranscript('system', `Judge Error: ${message}`);
      },
      onClose: () => {
        if (voiceSessionActive) {
          stopOralRound();
        }
      }
    });
  } catch (err) {
    console.error("Failed to start oral round:", err);
    appendCourtroomTranscript('system', `Failed to start: ${err.message}`);
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

  const durationSec = engineStopOralRound();
  updateVoiceUI('disconnected', 'Round Ended');

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
export function appendCourtroomTranscript(role, text) {
  const feed = document.getElementById('cr-transcript-feed');
  if (!feed) return;

  const interim = document.getElementById('cr-interim-bubble');
  if (interim) interim.remove();

  const div = document.createElement('div');
  div.className = `cr-transcript-msg ${role}`;

  if (role === 'system') {
    div.innerHTML = `<div class="cr-msg-text">${esc(text)}</div>`;
  } else {
    const roleLabel = role === 'judge' ? 'BENCH' : 'COUNSEL';
    const roleCls   = role === 'judge' ? 'judge' : 'advocate';
    div.innerHTML = `
      <div class="cr-msg-role ${roleCls}">${roleLabel}</div>
      <div class="cr-msg-text">${fmtInline(text)}</div>
    `;
  }

  feed.appendChild(div);
  feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
}

export function showInterimUserSpeech(text) {
  const feed = document.getElementById('cr-transcript-feed');
  if (!feed) return;

  let interim = document.getElementById('cr-interim-bubble');
  if (!interim) {
    interim = document.createElement('div');
    interim.className = 'cr-interim-bubble';
    interim.id = 'cr-interim-bubble';
    feed.appendChild(interim);
  }
  interim.textContent = text + '...';
  feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
}

function startSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    console.log("Speech recognition not supported in this browser.");
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    console.log("🎙️ Local Speech Recognition active.");
  };

  recognition.onspeechstart = () => {
    if (window.voiceStatus !== 'speaking') {
      updateVoiceUI('user_speaking', 'Advocate Speaking');
    }
  };

  recognition.onspeechend = () => {
    if (window.voiceStatus === 'user_speaking') {
      updateVoiceUI('listening', 'Court is listening...');
    }
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript) {
      appendCourtroomTranscript('advocate', finalTranscript);
      benchConversation.push({ role: 'advocate', content: finalTranscript });
      const interim = document.getElementById('cr-interim-bubble');
      if (interim) interim.remove();
    } else if (interimTranscript) {
      showInterimUserSpeech(interimTranscript);
    }
  };

  recognition.onerror = (e) => {
    console.error("Local Speech Recognition error:", e.error);
  };

  recognition.onend = () => {
    if (voiceSessionActive) {
      try { recognition.start(); } catch(err){}
    }
  };

  try {
    recognition.start();
  } catch (err) {
    console.error("Failed to start Speech Recognition:", err);
  }
}

function stopSpeechRecognition() {
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch(e){}
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
