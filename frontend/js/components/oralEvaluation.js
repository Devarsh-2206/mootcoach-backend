import { evaluateOral } from '../services/api.js';
import { 
  currentPropositionContext, 
  setCurrentPropositionContext, 
  showToast, 
  esc, 
  fmtInline, 
  animateBars, 
  animateValue, 
  renderMarkdown,
  renderActionError,
  startElapsed
} from './ui.js';
import { SHARED_AUTHORITY_REGISTRY } from './argumentBuilder.js';

/* Every authority this moot already relies on: the analysis's cases (the
   Authority Armory) and the built-in registry. The scorer treats these as
   real, so a case the app itself suggested is never called fabricated. */
function knownAuthorityNames() {
  const names = new Set();
  try { (window.getCasesFromAnalysis ? window.getCasesFromAnalysis() : []).forEach(a => a && a.name && names.add(String(a.name))); } catch (e) {}
  try {
    Object.values(SHARED_AUTHORITY_REGISTRY || {}).forEach(byStance =>
      Object.values(byStance || {}).forEach(list => (list || []).forEach(a => a && a.name && names.add(String(a.name)))));
  } catch (e) {}
  return [...names].slice(0, 200);
}

let evaluating = false;

export let oralDifficultyMode = 'easy';

export function setOralDifficulty(mode) {
  oralDifficultyMode = mode;
  window.oralDifficultyMode = mode;
  // The briefing says which bench it was prepared for; let it notice.
  if (typeof window.renderStage4OralNotes === 'function') window.renderStage4OralNotes();
  ['easy','moderate','hard'].forEach(d => {
    const el = document.getElementById(`oral-diff-${d}`);
    if (el) el.className = `diff-btn${d === mode ? ` active-${d}` : ''}`;
  });
}

export function clearOralContext() {
  setCurrentPropositionContext('');
  const notice = document.getElementById('oral-context-notice');
  if (notice) notice.style.display = 'none';
}

export async function runOralEvaluation() {
  const argumentText = document.getElementById('oral-argument-input')?.value?.trim();
  if (!argumentText || argumentText.length < 30 || evaluating) return;
  evaluating = true;

  const btn = document.getElementById('btn-oral-eval');
  let stop = () => {};
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span class="oral-eval-elapsed">Evaluating…</span>';
    stop = startElapsed(btn.querySelector('.oral-eval-elapsed'), s =>
      s < 20 ? `Evaluating… ${s}s` : s < 60 ? `Still evaluating… ${s}s (usually under a minute)` : `Still working… ${s}s — the server may be waking up`);
  }

  const mootId = window.currentMootDocId || null;
  try {
    const data = await evaluateOral(argumentText, currentPropositionContext, oralDifficultyMode, {
      // Checked against the side only when the advocate chose one; the
      // default is not a choice.
      stance: (window.mootState && window.mootState.stanceChosen && window.mootState.stance) || '',
      knownAuthorities: knownAuthorityNames(),
    });

    // Another moot was opened while this was being marked: drop the result.
    if ((window.currentMootDocId || null) !== mootId) return;
    if (data.isStructured && data.response && typeof data.response === 'object') {
      renderOralResults(data.response);
    } else {
      renderOralResultsFallback(String(data.response || 'No result returned.'));
    }

  } catch (err) {
    const area    = document.getElementById('oral-results-area');
    const content = document.getElementById('oral-results-content');
    if (area && content) {
      area.style.display = 'block';
      renderActionError(content, {
        title: 'Evaluation failed',
        message: err.message + ' Your argument is still in the box.',
        onRetry: () => runOralEvaluation(),
        replace: true,
      });
    }
  } finally {
    stop();
    evaluating = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Evaluate Argument →'; }
  }
}

export function renderOralResults(data) {
  const area    = document.getElementById('oral-results-area');
  const content = document.getElementById('oral-results-content');
  if (!area || !content) return;

  const grade    = data.grade || '?';
  const score    = Number(data.overallScore) || 0;
  const gradeCls = `grade-${grade}`;

  const dims    = data.dimensionScores || {};
  const dimDefs = [
    { key:'legalAccuracy',     label:'Legal Accuracy',     max:25 },
    { key:'argumentStructure', label:'Argument Structure',  max:20 },
    { key:'persuasiveness',    label:'Persuasiveness',      max:20 },
    { key:'languageClarity',   label:'Language Clarity',    max:15 },
    { key:'pressureReadiness', label:'Pressure Readiness',  max:10 },
    { key:'courtRoomDemeanor', label:'Courtroom Demeanor',  max:10 },
  ];

  const dimHTML = dimDefs.map(d => {
    // The prompt asks for { score, max, feedback }; accept a bare number too,
    // which otherwise rendered as 0.
    const raw  = dims[d.key];
    const dim  = (raw && typeof raw === 'object') ? raw : { score: raw };
    const sc   = Math.min(d.max, Math.max(0, Number(dim.score) || 0));
    const pct  = Math.round((sc / d.max) * 100);
    const bCls = pct >= 74 ? 'sf-green' : pct >= 50 ? 'sf-gold' : 'sf-red';
    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <div style="font-size:.8rem;color:var(--white-2);">${d.label}</div>
          <div style="font-size:.8rem;color:var(--white);font-weight:500;">${sc}<span style="color:var(--white-muted);font-weight:300;">/${d.max}</span></div>
        </div>
        <div class="sc-bar" style="height:4px;">
          <div class="sc-bar-fill ${bCls}" data-target="${pct}%" style="width:0%"></div>
        </div>
        ${dim.feedback ? `<div style="font-size:.74rem;color:var(--white-muted);margin-top:6px;line-height:1.62;">${fmtInline(dim.feedback)}</div>` : ''}
      </div>`;
  }).join('');

  const defectsHTML = (data.defectsFound || []).length
    ? (data.defectsFound).map(d => {
        const sev  = (d.severity || 'minor').toLowerCase();
        const sCol = sev === 'fatal' ? '#e05252' : sev === 'significant' ? '#fbbf24' : '#2dd4bf';
        return `
          <div style="margin-bottom:10px;padding:13px 15px;background:rgba(28,23,16,.02);border:1px solid var(--glass-b);border-left:3px solid ${sCol};border-radius:0 8px 8px 0;">
            <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:7px;">
              <span style="font-size:.58rem;padding:2px 7px;border-radius:3px;background:rgba(28,23,16,.04);color:var(--white-muted);">${esc(d.type || '')}</span>
              <span style="font-size:.58rem;padding:2px 7px;border-radius:3px;color:${sCol};background:rgba(28,23,16,.03);">${sev}</span>
            </div>
            ${d.quote ? `<div style="font-size:.76rem;color:var(--gold);font-style:italic;margin-bottom:6px;">"${esc(d.quote)}"</div>` : ''}
            <div style="font-size:.78rem;color:var(--white-muted);line-height:1.65;">${fmtInline(d.issue || '')}</div>
          </div>`;
      }).join('')
    : `<div style="font-size:.82rem;color:#4caf82;padding:8px 0;">No critical defects detected in this submission.</div>`;

  const VERDICT = {
    yes: ['Recognised', '#4caf82'],
    no: ['Could not be identified', '#e05252'],
    unsure: ['Not verified — check on SCC Online', '#fbbf24'],
  };
  const citesHTML = (data.citations || []).map(c => {
    const [label, col] = VERDICT[c.exists] || VERDICT.unsure;
    const flags = [c.inMootAuthorities ? 'In this moot\'s authorities' : '', c.holdingMisstated ? 'Holding misstated' : '', c.wrongJurisdiction ? 'Not binding here' : ''].filter(Boolean);
    return `<div style="padding:10px 0;border-bottom:1px solid var(--glass-b);">
        <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
          <span style="font-size:.82rem;color:var(--white);font-style:italic;">${esc(c.name)}</span>
          <span style="font-size:.6rem;padding:2px 7px;border-radius:3px;color:${col};background:rgba(28,23,16,.04);">${label}</span>
          ${flags.map(f => `<span style="font-size:.6rem;padding:2px 7px;border-radius:3px;color:var(--white-muted);background:rgba(28,23,16,.04);">${esc(f)}</span>`).join('')}
        </div>
        ${c.note ? `<div style="font-size:.74rem;color:var(--white-muted);margin-top:4px;line-height:1.6;">${fmtInline(c.note)}</div>` : ''}
      </div>`;
  }).join('');

  const MODE_NAME = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };
  const notices = [
    data.wrongSide ? `<b>Wrong side.</b> This argues the ${data.sideArgued === 'respondent' ? 'Respondent' : 'Petitioner'}'s case, but your stance is ${esc((window.mootState && window.mootState.stance) || '')}. The score is capped at 40.` : '',
    data.truncated ? `Only the first ${Number(data.truncated.scoredChars).toLocaleString()} of ${Number(data.truncated.totalChars).toLocaleString()} characters were assessed. Evaluate long submissions a section at a time.` : '',
  ].filter(Boolean);
  const noticeHTML = notices.map(n => `<div role="status" style="margin-bottom:12px;padding:12px 15px;border:1px solid var(--glass-b);border-left:3px solid #e05252;border-radius:0 8px 8px 0;font-size:.8rem;color:var(--white-2);line-height:1.6;">${n}</div>`).join('');

  const listHTML = (arr, dotColor) => (arr || []).map(s =>
    `<div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--glass-b);">
      <div style="width:5px;height:5px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:7px;"></div>
      <div style="font-size:.82rem;color:var(--white-2);line-height:1.68;">${fmtInline(s)}</div>
    </div>`
  ).join('');

  content.innerHTML = `${noticeHTML}
    <div style="display:flex;align-items:center;gap:18px;margin-bottom:18px;padding:20px 22px;background:var(--navy-3);border:1px solid var(--glass-b);border-radius:14px;flex-wrap:wrap;">
      <div class="oral-grade-badge ${gradeCls}">${grade}</div>
      <div>
        <div style="font-family:var(--serif);font-size:2.2rem;font-weight:500;color:var(--white);line-height:1;" id="animated-oral-score">0<span style="font-size:1rem;color:var(--white-muted);font-family:var(--sans);">/100</span></div>
        <div style="font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--white-muted);margin-top:3px;">Oral Advocacy Score${data.difficulty ? ` · ${MODE_NAME[data.difficulty] || ''} Bench` : ''}</div>
      </div>
      ${data.judgeVerdict ? `<div style="flex:2;min-width:200px;font-family:var(--serif);font-size:.95rem;font-style:italic;color:var(--white-2);line-height:1.75;border-left:1px solid var(--glass-b);padding-left:18px;">"${fmtInline(data.judgeVerdict)}"</div>` : ''}
    </div>

    <div class="analysis-section-card" style="margin-bottom:14px;">
      <div class="asc-header" id="asc-h-oral-dims" onclick="toggleSection('oral-dims')">
        <div class="asc-header-left"><div class="asc-icon asc-icon-gold">◎</div><div class="asc-title">Dimension Scores</div></div>
        <div class="asc-header-right"><span class="asc-badge badge-gold">Breakdown</span><span class="asc-chevron" id="asc-ch-oral-dims">▾</span></div>
      </div>
      <div class="asc-body" id="asc-b-oral-dims" style="padding:20px 22px;">${dimHTML}</div>
    </div>

    ${citesHTML ? `
    <div class="analysis-section-card" style="margin-bottom:14px;">
      <div class="asc-header" id="asc-h-oral-cites" onclick="toggleSection('oral-cites')">
        <div class="asc-header-left"><div class="asc-icon asc-icon-blue">§</div><div class="asc-title">Authorities Cited</div></div>
        <div class="asc-header-right"><span class="asc-badge badge-blue">${(data.citations || []).length}</span><span class="asc-chevron" id="asc-ch-oral-cites">▾</span></div>
      </div>
      <div class="asc-body" id="asc-b-oral-cites" style="padding:8px 22px 14px;">${citesHTML}
        <div style="font-size:.7rem;color:var(--white-muted);margin-top:10px;line-height:1.6;">Cases in this moot's authorities are always treated as real. Anything marked "not verified" is not penalised — confirm it before relying on it.</div>
      </div>
    </div>` : ''}

    <div class="analysis-section-card" style="margin-bottom:14px;">
      <div class="asc-header" id="asc-h-oral-defects" onclick="toggleSection('oral-defects')">
        <div class="asc-header-left"><div class="asc-icon asc-icon-red">◬</div><div class="asc-title">Defects Found</div></div>
        <div class="asc-header-right"><span class="asc-badge badge-red">Issues</span><span class="asc-chevron" id="asc-ch-oral-defects">▾</span></div>
      </div>
      <div class="asc-body" id="asc-b-oral-defects" style="padding:18px 22px;">${defectsHTML}</div>
    </div>

    ${(data.strengths||[]).length ? `
    <div class="analysis-section-card" style="margin-bottom:14px;">
      <div class="asc-header" id="asc-h-oral-str" onclick="toggleSection('oral-str')">
        <div class="asc-header-left"><div class="asc-icon asc-icon-green">▲</div><div class="asc-title">Strengths Observed</div></div>
        <div class="asc-header-right"><span class="asc-badge badge-green">Positives</span><span class="asc-chevron" id="asc-ch-oral-str">▾</span></div>
      </div>
      <div class="asc-body" id="asc-b-oral-str" style="padding:14px 22px;">${listHTML(data.strengths,'#4caf82')}</div>
    </div>` : ''}

    ${(data.immediateCorrections||[]).length ? `
    <div class="analysis-section-card" style="margin-bottom:14px;">
      <div class="asc-header" id="asc-h-oral-fix" onclick="toggleSection('oral-fix')">
        <div class="asc-header-left"><div class="asc-icon asc-icon-blue">↯</div><div class="asc-title">Immediate Corrections</div></div>
        <div class="asc-header-right"><span class="asc-badge badge-blue">Action Items</span><span class="asc-chevron" id="asc-ch-oral-fix">▾</span></div>
      </div>
      <div class="asc-body" id="asc-b-oral-fix" style="padding:14px 22px;">${listHTML(data.immediateCorrections,'#60a5fa')}</div>
    </div>` : ''}
  `;

  area.style.display = 'block';

  if (window.recordMootFeedback) {
    window.recordMootFeedback({
      source: 'oral', score, mode: data.difficulty,
      points: [].concat(
        (data.defectsFound || []).filter(d => /fatal|significant/i.test(d.severity || '')).map(d => d.issue),
        data.immediateCorrections || []),
    });
  }
  
  setTimeout(() => {
    animateBars();
    const oralScoreEl = document.getElementById('animated-oral-score');
    if (oralScoreEl) {
       let startTimestamp = null;
       const duration = 1500;
       const step = (timestamp) => {
         if (!startTimestamp) startTimestamp = timestamp;
         const progress = Math.min((timestamp - startTimestamp) / duration, 1);
         const ease = 1 - Math.pow(1 - progress, 4);
         const currentScore = Math.floor(ease * score);
         oralScoreEl.innerHTML = `${currentScore}<span style="font-size:1rem;color:var(--white-muted);font-family:var(--sans);">/100</span>`;
         if (progress < 1) {
           window.requestAnimationFrame(step);
         } else {
           oralScoreEl.innerHTML = `${score}<span style="font-size:1rem;color:var(--white-muted);font-family:var(--sans);">/100</span>`; 
         }
       };
       window.requestAnimationFrame(step);
    }
  }, 120);
  
  area.scrollIntoView({ behavior:'smooth', block:'start' });
}

export function renderOralResultsFallback(text) {
  const area    = document.getElementById('oral-results-area');
  const content = document.getElementById('oral-results-content');
  if (!area || !content) return;
  content.innerHTML = `<div class="analysis-box"><div class="analysis-box-header"><div class="abh-title">Evaluation Result</div></div><div class="analysis-content">${renderMarkdown(text)}</div></div>`;
  area.style.display = 'block';
}
