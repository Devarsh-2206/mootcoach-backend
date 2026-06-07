const fs = require('fs');
const file = 'frontend/js/components/benchSimulator.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Import benchProfiles
if (!content.includes('import { benchProfiles }')) {
  content = content.replace(
    "import { getCurrentSelectedSide, selectedAuthorities } from './argumentBuilder.js';",
    "import { getCurrentSelectedSide, selectedAuthorities } from './argumentBuilder.js';\nimport { benchProfiles } from '../config/benchProfiles.js';"
  );
}

// 2. appendBenchMessage
const oldAppendBenchMessage = `export function appendBenchMessage(role, text, pressureLevel, targetWeakness, displayPressure) {
  const chat = document.getElementById('bench-chat');
  if (!chat) return;

  const div = document.createElement('div');
  div.className = \`bench-msg bench-msg-\${role}\`;

  if (role === 'system') {
    div.innerHTML = \`<div class="bm-role bm-role-system">System</div><div class="bm-text">\${esc(text)}</div>\`;
  } else {
    const roleLabel = role === 'judge' ? 'BENCH' : 'COUNSEL';
    const roleCls = role === 'judge' ? 'bm-role-judge' : 'bm-role-advocate';

    const pressure = displayPressure || pressureLevel || 0;
    const pressureHTML = role === 'judge' && pressure 
      ? \`<span class="pressure-badge pressure-\${pressure}">Pressure: \${pressure}/10</span>\` 
      : '';
    const weaknessHTML = role === 'judge' && targetWeakness 
      ? \`<span class="weakness-badge">Target: \${esc(targetWeakness)}</span>\` 
      : '';

    div.innerHTML = \`
      <div class="bm-role \${roleCls}">\${roleLabel}</div>
      <div class="bm-text">\${fmtInline(text)}</div>
      \${(pressureHTML || weaknessHTML) ? \`<div class="bm-meta">\${pressureHTML}\${weaknessHTML}</div>\` : ''}\`;
  }

  chat.appendChild(div);
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
}`;

const newAppendBenchMessage = `export function appendBenchMessage(role, text, pressureLevel, targetWeakness, displayPressure, speakingJudge = null) {
  const chat = document.getElementById('bench-chat');
  if (!chat) return;

  const div = document.createElement('div');
  div.className = \`bench-msg bench-msg-\${role}\`;

  let finalRoleLabel = role === 'judge' ? 'BENCH' : 'COUNSEL';
  let cleanText = text;

  if (role === 'judge') {
    if (speakingJudge) {
      finalRoleLabel = speakingJudge.toUpperCase();
    } else {
      const match = text.match(/^\\[(.*?)\\]\\s*(.*)/);
      if (match) {
        finalRoleLabel = match[1].trim().toUpperCase();
        cleanText = match[2].trim();
      }
    }
  }

  if (role === 'system') {
    div.innerHTML = \`<div class="bm-role bm-role-system">System</div><div class="bm-text">\${esc(cleanText)}</div>\`;
  } else {
    const roleCls = role === 'judge' ? 'bm-role-judge' : 'bm-role-advocate';

    const pressure = displayPressure || pressureLevel || 0;
    const pressureHTML = role === 'judge' && pressure 
      ? \`<span class="pressure-badge pressure-\${pressure}">Pressure: \${pressure}/10</span>\` 
      : '';
    const weaknessHTML = role === 'judge' && targetWeakness 
      ? \`<span class="weakness-badge">Target: \${esc(targetWeakness)}</span>\` 
      : '';

    div.innerHTML = \`
      <div class="bm-role \${roleCls}">\${esc(finalRoleLabel)}</div>
      <div class="bm-text">\${fmtInline(cleanText)}</div>
      \${(pressureHTML || weaknessHTML) ? \`<div class="bm-meta">\${pressureHTML}\${weaknessHTML}</div>\` : ''}\`;
  }

  chat.appendChild(div);
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
}`;
content = content.replace(oldAppendBenchMessage, newAppendBenchMessage);

// 3. simulateBenchTurn appendBenchMessage call
content = content.replace(
  "appendBenchMessage('judge', judgeText, data.pressureLevel, data.targetWeakness);\n    requestAnimationFrame",
  "appendBenchMessage('judge', judgeText, data.pressureLevel, data.targetWeakness, undefined, data.speakingJudge);\n    requestAnimationFrame"
);

// 4. getJudgeName
const oldGetJudgeName = `const JUDGE_NAMES = [
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
  return \`Justice \${JUDGE_NAMES[index].replace("Justice ", "")}\`;
}`;
const newGetJudgeName = `function getJudgeName() {
  const mode = window.benchDifficultyMode || 'moderate';
  const bench = benchProfiles[mode] || benchProfiles.moderate;
  if (bench && bench.judges && bench.judges.length > 0) {
    return bench.judges[0].name;
  }
  return "Presiding Judge";
}`;
content = content.replace(oldGetJudgeName, newGetJudgeName);

// 5. onText, onTurnComplete, onInterrupted
const oldCallbacks = `      onText: (text) => {
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
        }`;
const newCallbacks = `      onText: (text) => {
        // Low-latency sentence-boundary chunking for real-time TTS responsiveness
        console.log("[DEBUG AUDIT] AI response chunk received:", text);
        fullJudgeResponse += text;
        appendTranscript('judge', fullJudgeResponse, true);
      },
      onTurnComplete: () => {
        const cleanResponse = fullJudgeResponse.trim();
        if (cleanResponse) {
          console.log('[JUDGE TRANSCRIPT] Response received:', cleanResponse);
          appendTranscript('judge', cleanResponse, true); // Finalize the current bubble
          currentJudgeBubble = null; // Reset for the next turn
          console.log('[JUDGE TRANSCRIPT] Appended to transcript');
          console.log('[JUDGE TRANSCRIPT] Container found:', !!document.getElementById('bench-transcript-panel'));
          console.log('[JUDGE TRANSCRIPT] Judge bubble finalized');
        }

        fullJudgeResponse = '';
      },
      onInterrupted: () => {
        const cleanResponse = fullJudgeResponse.trim();
        if (cleanResponse) {
          console.log('[JUDGE TRANSCRIPT] Response received (interrupted):', cleanResponse);
          appendTranscript('judge', cleanResponse + "...", true); // Finalize with ellipsis
          currentJudgeBubble = null; // Reset for the next turn
          console.log('[JUDGE TRANSCRIPT] Appended to transcript (interrupted)');
          console.log('[JUDGE TRANSCRIPT] Container found:', !!document.getElementById('bench-transcript-panel'));
        }`;
content = content.replace(oldCallbacks, newCallbacks);

// 6. appendTranscript
const oldAppendTranscriptBlock = `  if (role === 'judge') {
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

    div.innerHTML = \`
      <div class="text-[10px] font-semibold tracking-wider text-red-400 mb-1 flex items-center gap-1">
        <span>⚖️</span> \${judgeName}
      </div>
      <div class="bg-red-950/20 border border-red-900/30 rounded-r-xl rounded-bl-xl p-3 text-sm text-gray-200 leading-relaxed shadow-sm">
        <span class="cr-msg-text">\${fmtInline(text)}</span>
      </div>
    \`;
    panel.appendChild(div);
    currentJudgeBubble = div;
  }`;

const newAppendTranscriptBlock = `  if (role === 'judge') {
    let finalJudgeName = getJudgeName();
    let cleanText = text;
    
    // Parse "[Judge Name]" from text
    const match = text.match(/^\\[(.*?)\\]\\s*(.*)/s);
    if (match) {
      finalJudgeName = match[1].trim();
      cleanText = match[2].trim();
    }

    if (isChunk && currentJudgeBubble) {
      currentJudgeSpeech = cleanText; // OVERWRITE with fully parsed accumulated string
      const textEl = currentJudgeBubble.querySelector('.cr-msg-text');
      if (textEl) {
        textEl.innerHTML = fmtInline(currentJudgeSpeech);
      }
      
      const nameEl = currentJudgeBubble.querySelector('.cr-msg-name');
      if (nameEl) nameEl.textContent = finalJudgeName;

      panel.scrollTop = panel.scrollHeight;
      return;
    }

    currentJudgeSpeech = cleanText;
    const div = document.createElement('div');
    div.className = 'flex flex-col max-w-[80%] self-start items-start animate-[secReveal_0.3s_ease_both]';

    div.innerHTML = \`
      <div class="text-[10px] font-semibold tracking-wider text-red-400 mb-1 flex items-center gap-1">
        <span>⚖️</span> <span class="cr-msg-name">\${finalJudgeName}</span>
      </div>
      <div class="bg-red-950/20 border border-red-900/30 rounded-r-xl rounded-bl-xl p-3 text-sm text-gray-200 leading-relaxed shadow-sm">
        <span class="cr-msg-text">\${fmtInline(cleanText)}</span>
      </div>
    \`;
    panel.appendChild(div);
    currentJudgeBubble = div;
  }`;
content = content.replace(oldAppendTranscriptBlock, newAppendTranscriptBlock);

fs.writeFileSync(file, content);
console.log("Patched successfully!");
