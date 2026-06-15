import { showWsPanel } from './ui.js';

let currentSessionData = null;
let activeIssueIndex = 0;
let activeStance = 'petitioner';

// ── SHARED MOOT STATE (single source of truth across Issues → Advocacy → Simulator) ──
// Every stage reads/writes this so the Bench Simulator can prove it is using the
// advocate's actual issue, stance, authorities and drafts.
if (!window.mootState) {
  window.mootState = {
    issueIndex: 0,
    issueText: '',
    stance: 'Petitioner',     // 'Petitioner' | 'Respondent'
    authorities: [],
    strategicNotes: '',
    oralSubmission: '',
    memorialDraft: ''
  };
}

// Normalised list of issues regardless of source shape.
// Each entry: { title, raw } where raw is the original object (or string).
let normalizedIssues = [];

function buildNormalizedIssues(data) {
  const out = [];
  const intel = data && data.issueIntelligence;
  if (intel && Array.isArray(intel.issues) && intel.issues.length > 0) {
    intel.issues.forEach((issue, index) => {
      const titleText = issue.issueDefinition?.exactLegalQuestion || issue.issueTitle || ('Issue ' + (index + 1));
      out.push({ title: titleText, raw: issue, source: 'intel' });
    });
    return out;
  }

  // FALLBACK 1: structured analysis legalIssues (always present after analysis)
  const fromAnalysis = (data && data.analysisData && data.analysisData.legalIssues)
    || (data && data.legalIssues)
    || null;
  if (Array.isArray(fromAnalysis) && fromAnalysis.length > 0) {
    fromAnalysis.forEach((iss, index) => {
      const titleText = typeof iss === 'string' ? iss : (iss.issue || iss.title || ('Issue ' + (index + 1)));
      out.push({ title: titleText, raw: iss, source: 'analysis' });
    });
  }
  return out;
}

export function populateIssueStack(data) {
  currentSessionData = data;
  // Expose forum intelligence so the Bench Simulator can adapt its terminology.
  if (data && data.forumIntelligence) window.forumIntelligence = data.forumIntelligence;
  normalizedIssues = buildNormalizedIssues(data);

  const listEl = document.getElementById('ws-issue-list');
  const stackEl = document.getElementById('ws-issue-stack');
  const dividerEl = document.getElementById('ws-issue-divider');

  if (!listEl || !stackEl) return;

  if (normalizedIssues.length === 0) {
    stackEl.style.display = 'none';
    if (dividerEl) dividerEl.style.display = 'none';
    return;
  }

  stackEl.classList.remove('hidden');
  if (dividerEl) dividerEl.classList.remove('hidden');
  stackEl.style.display = 'flex';
  if (dividerEl) dividerEl.style.display = 'flex';

  let html = '';
  normalizedIssues.forEach((issue, index) => {
    const shortName = String(issue.title).split(':')[0].trim();
    html += `
      <button class="ws-sb-item text-left" id="btn-issue-${index}" onclick="window.selectIssue(${index})">
        <span class="ws-sb-icon">❖</span> <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" class="text-xs">${shortName}</span>
      </button>
    `;
  });

  listEl.innerHTML = html;

  // Prep the first issue (highlight + render content) WITHOUT force-navigating away
  // from whatever stage the user is currently on.
  activeIssueIndex = 0;
  prepActiveIssue();
}

// Highlight sidebar + render workspace for the active issue, no stage navigation.
function prepActiveIssue() {
  highlightSidebar(activeIssueIndex);
  syncMootStateForIssue(activeIssueIndex);
  renderIssueWorkspace();
}

function highlightSidebar(index) {
  document.querySelectorAll('#ws-issue-list .ws-sb-item').forEach(btn =>
    btn.classList.remove('active', 'bg-moot-accent/10', 'text-moot-accent'));
  const activeBtn = document.getElementById(`btn-issue-${index}`);
  if (activeBtn) activeBtn.classList.add('active', 'bg-moot-accent/10', 'text-moot-accent');
}

function syncMootStateForIssue(index) {
  const issue = normalizedIssues[index];
  window.mootState.issueIndex = index;
  window.mootState.issueText = issue ? issue.title : '';
  window.mootState.stance = activeStance === 'respondent' ? 'Respondent' : 'Petitioner';
}

// User clicked an issue in the sidebar → select it AND navigate to Stage 2.
export function selectIssue(index) {
  activeIssueIndex = index;
  highlightSidebar(index);
  syncMootStateForIssue(index);

  if (typeof window.goToStage === 'function') window.goToStage(2);

  renderIssueWorkspace();
}

// Called by goToStage(2) so navigating via the stepper still renders content.
export function renderActiveIssueWorkspace() {
  if (normalizedIssues.length === 0) return;
  highlightSidebar(activeIssueIndex);
  syncMootStateForIssue(activeIssueIndex);
  renderIssueWorkspace();
}
window.renderActiveIssueWorkspace = renderActiveIssueWorkspace;

// Apply clear, unmistakable active styling to the stance toggle. Works even before
// any session data is loaded, so the button always gives immediate feedback.
function applyStanceButtonStyles() {
  const btnPet = document.getElementById('iw-stance-petitioner');
  const btnRes = document.getElementById('iw-stance-respondent');
  const activeClasses = 'text-[10px] uppercase tracking-widest font-sans font-bold px-5 py-2 rounded shadow-lg border border-[#c9a84c] text-[#0a0d14] bg-[#c9a84c] ring-2 ring-[#c9a84c]/50 transition-all focus:outline-none';
  const inactiveClasses = 'text-[10px] uppercase tracking-widest font-sans font-semibold px-5 py-2 rounded border border-white/30 text-white bg-white/5 hover:bg-white/15 hover:border-white/50 transition-all cursor-pointer focus:ring-2 focus:ring-[#c9a84c]/50 focus:outline-none';
  if (btnPet && btnRes) {
    if (activeStance === 'petitioner') {
      btnPet.className = activeClasses;
      btnRes.className = inactiveClasses;
    } else {
      btnRes.className = activeClasses;
      btnPet.className = inactiveClasses;
    }
  }
}

export function setIwStance(stance) {
  activeStance = stance;
  // Always reflect the choice visually + in shared state immediately.
  applyStanceButtonStyles();
  window.mootState.stance = stance === 'respondent' ? 'Respondent' : 'Petitioner';
  // Re-render the matrix if we have data for it.
  if (currentSessionData) renderIssueWorkspace();
}

function renderIssueWorkspace() {
  // Always keep the stance buttons styled correctly.
  applyStanceButtonStyles();

  if (!currentSessionData || normalizedIssues.length === 0) return;

  const issueEntry = normalizedIssues[activeIssueIndex];
  if (!issueEntry) return;

  const forumIntelligence = currentSessionData.forumIntelligence;

  // 1. CORE SUBMISSION HEADER
  const titleEl = document.getElementById('iw-issue-title');
  if (titleEl) titleEl.textContent = issueEntry.title || 'Selected Issue';

  // Forum Data — read the REAL forumIntelligence schema
  // (forumClassification / proceduralFramework / adjudicatorModel).
  let forumText = "Forum: Not yet detected | Burden: —";
  if (forumIntelligence) {
    const cls = forumIntelligence.forumClassification || {};
    const proc = forumIntelligence.proceduralFramework || {};
    const adj = forumIntelligence.adjudicatorModel || {};
    const forumName = cls.specificBody || cls.broadType || adj.benchType || 'Forum';
    const burden = proc.burdenOfProof || proc.standardOfReview || 'Standard of review unspecified';
    forumText = `${forumName}  |  Burden: ${burden}`;
  }
  const forumEl = document.getElementById('iw-forum-burden');
  if (forumEl) forumEl.textContent = forumText;

  // Core submission (rich shape only; fallback issues show the question itself)
  let coreSubmission = "Core submission not available.";
  const issue = issueEntry.raw;
  if (issue && issue.stances) {
    if (activeStance === 'petitioner' && issue.stances.petitioner) {
      coreSubmission = issue.stances.petitioner.coreSubmission || coreSubmission;
    } else if (activeStance === 'respondent' && issue.stances.respondent) {
      coreSubmission = issue.stances.respondent.coreSubmission || coreSubmission;
    }
  } else {
    coreSubmission = `Argue this issue for the ${activeStance === 'respondent' ? 'Respondent' : 'Petitioner'}. Build your structured submission in the Advocacy stage.`;
  }
  const coreEl = document.getElementById('iw-core-submission');
  if (coreEl) coreEl.textContent = `"${coreSubmission}"`;

  // 2. ADVOCACY INTELLIGENCE (IRAC Matrix)
  const issueId = (issue && issue.issueId) ? issue.issueId : `issue_${activeIssueIndex + 1}`;

  // Capture this issue+stance's battle plan into shared state so Stage 3 (Advocacy)
  // and Stage 4 (Simulator) can use the work the analysis produced for THIS issue.
  captureIssuePlan(issue, issueId, issueEntry.title);

  renderStrategyPanel();
  renderAdvocacyMatrix(issueId);
}

// ── STAGE 2 COMMAND CENTER ──
// Lets the user COMMIT a strategy: accept the arguments they'll run and pin the
// authorities they'll rely on. Accepted args seed Advocacy; pinned authorities
// flow straight to the Simulator (mootState.authorities). Selection-driven, elegant.
function renderStrategyPanel() {
  const panel = document.getElementById('iw-strategy-panel');
  if (!panel) return;
  const ms = window.mootState || {};
  const plan = ms.plan || {};
  ms.acceptedArgs = ms.acceptedArgs || {};
  ms.pinnedAuthorities = ms.pinnedAuthorities || [];

  const args = Array.isArray(plan.recommendedArguments) ? plan.recommendedArguments : [];
  const pool = (typeof window.getCasesFromAnalysis === 'function') ? window.getCasesFromAnalysis() : [];
  const accepted = ms.acceptedArgs[plan.issueText || ''] || [];
  const pinnedNames = ms.pinnedAuthorities.map(a => a.name);

  if (args.length === 0 && pool.length === 0) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  const argHtml = args.length ? `
    <div class="flex flex-col gap-2">
      <div class="text-[10px] uppercase tracking-widest text-moot-accent font-semibold">Arguments to run — accept the ones you'll take to the bench</div>
      ${args.map((a, i) => {
        const on = accepted.indexOf(a) >= 0;
        return `<div class="flex items-start gap-3 p-3 rounded-lg border ${on ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/[0.02]'}">
          <button onclick="window.toggleAcceptArgument(${i})" class="shrink-0 text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded border ${on ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-white/15 text-white-muted bg-white/5 hover:text-white'}">${on ? '✓ Accepted' : '+ Accept'}</button>
          <div class="text-xs text-white-2 leading-relaxed font-sans">${esc(a)}</div>
        </div>`;
      }).join('')}
    </div>` : '';

  const authHtml = pool.length ? `
    <div class="flex flex-col gap-2 mt-4">
      <div class="text-[10px] uppercase tracking-widest text-moot-accent font-semibold">Authorities — pin the ones you'll rely on (these go into the bench)</div>
      <div class="flex flex-wrap gap-2">
        ${pool.map(a => {
          const on = pinnedNames.indexOf(a.name) >= 0;
          return `<button onclick="window.togglePinAuthority('${String(a.name).replace(/'/g, "\\'")}')" title="${esc(a.ratio || '')}" class="text-[11px] px-3 py-1.5 rounded-full border ${on ? 'border-moot-accent text-[#0a0d14] bg-moot-accent font-semibold' : 'border-white/15 text-white-2 bg-white/5 hover:border-white/30'}">${on ? '📌 ' : ''}${esc(a.name)}${a.jurisdiction ? ` · ${esc(a.jurisdiction)}` : ''}</button>`;
        }).join('')}
      </div>
    </div>` : '';

  panel.innerHTML = `
    <div class="bg-white/5 border border-white/10 rounded-xl p-5 backdrop-blur-md flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <div class="text-xs uppercase tracking-widest text-white font-semibold flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-moot-accent"></span> Your Strategy for this Issue</div>
        <div class="text-[10px] text-white-muted">${accepted.length} accepted · ${ms.pinnedAuthorities.length} pinned</div>
      </div>
      ${argHtml}
      ${authHtml}
    </div>`;
}
window.renderStrategyPanel = renderStrategyPanel;

window.toggleAcceptArgument = function(argIndex) {
  const ms = window.mootState; if (!ms || !ms.plan) return;
  const key = ms.plan.issueText || '';
  ms.acceptedArgs = ms.acceptedArgs || {};
  const arr = ms.acceptedArgs[key] = ms.acceptedArgs[key] || [];
  const arg = (ms.plan.recommendedArguments || [])[argIndex];
  if (!arg) return;
  const i = arr.indexOf(arg);
  if (i >= 0) arr.splice(i, 1); else arr.push(arg);
  renderStrategyPanel();
};

window.togglePinAuthority = function(name) {
  const ms = window.mootState; if (!ms) return;
  ms.pinnedAuthorities = ms.pinnedAuthorities || [];
  const pool = (typeof window.getCasesFromAnalysis === 'function') ? window.getCasesFromAnalysis() : [];
  const auth = pool.find(a => a.name === name);
  const idx = ms.pinnedAuthorities.findIndex(a => a.name === name);
  if (idx >= 0) ms.pinnedAuthorities.splice(idx, 1);
  else if (auth) ms.pinnedAuthorities.push({ name: auth.name, ratio: auth.ratio });
  // Mirror pinned authorities into the list the Simulator reads.
  ms.authorities = ms.pinnedAuthorities.slice();
  renderStrategyPanel();
};

// Pulls the AI's issue-specific plan (recommended arguments, oral hook, the fatal
// questions the bench will ask, counter-attacks, plus the global predicted bench
// questions and the side's known defects) into window.mootState.plan.
function captureIssuePlan(issueRaw, issueId, issueTitle) {
  const ms = window.mootState;
  if (!ms) return;
  const stance = activeStance === 'respondent' ? 'respondent' : 'petitioner';
  const adv = currentSessionData.advocacyIntelligence;
  const analysis = currentSessionData.analysisData || {};

  const plan = {
    issueId,
    issueText: issueTitle || '',
    stance: stance === 'respondent' ? 'Respondent' : 'Petitioner',
    recommendedArguments: [],
    oralHook: '',
    signposting: [],
    fatalQuestions: [],
    rebuttals: [],
    benchQuestions: Array.isArray(analysis.benchQuestions) ? analysis.benchQuestions.slice(0, 8) : [],
    defects: (analysis.argumentDefects && Array.isArray(analysis.argumentDefects[stance])) ? analysis.argumentDefects[stance] : []
  };

  if (adv && Array.isArray(adv.advocacyBlueprints)) {
    const bp = adv.advocacyBlueprints.find(b =>
      b.issueId === issueId && (b.stance || '').toLowerCase() === stance);
    if (bp) {
      if (bp.memorialStructure && Array.isArray(bp.memorialStructure.subheadings)) {
        plan.recommendedArguments = bp.memorialStructure.subheadings
          .map(s => `${s.heading}: ${s.ruleApplication}`);
      }
      if (bp.oralAdvocacyFlow) {
        plan.oralHook = bp.oralAdvocacyFlow.openingHook || '';
        plan.signposting = Array.isArray(bp.oralAdvocacyFlow.signposting) ? bp.oralAdvocacyFlow.signposting : [];
      }
      if (bp.benchPreparationMap && Array.isArray(bp.benchPreparationMap.fatalQuestions)) {
        plan.fatalQuestions = bp.benchPreparationMap.fatalQuestions;
      }
      if (bp.rebuttalMatrix && Array.isArray(bp.rebuttalMatrix.opponentCounterAttacks)) {
        plan.rebuttals = bp.rebuttalMatrix.opponentCounterAttacks;
      }
    }
  }

  ms.plan = plan;
}

function renderAdvocacyMatrix(issueId) {
  const advocacyIntelligence = currentSessionData.advocacyIntelligence;
  const memorialContainer = document.getElementById('iw-memorial-container');
  const rebuttalContainer = document.getElementById('iw-rebuttal-container');
  const benchContainer = document.getElementById('iw-bench-container');
  const oralFlowContainer = document.getElementById('iw-oral-flow-container');

  if (!memorialContainer) return;

  const createEmptyState = (reason, required, actionText, actionClick="window.goToStage(3)") => `
    <div class="p-4 border border-dashed border-white/20 rounded-md bg-white/5 flex flex-col items-center justify-center text-center gap-2">
      <div class="text-sm font-sans text-white/50 font-semibold uppercase tracking-widest">NEXT STEP</div>
      <div class="text-xs font-serif text-white-muted italic">"${reason}"</div>
      <div class="text-[11px] font-sans text-moot-accent/80">${required}</div>
      <button onclick="${actionClick}" class="mt-2 text-[10px] uppercase tracking-widest text-navy bg-moot-accent px-4 py-2 rounded hover:bg-moot-accent/90 transition-all font-bold shadow-md ring-2 ring-moot-accent/30 focus:outline-none">${actionText}</button>
    </div>
  `;

  if (!advocacyIntelligence || !advocacyIntelligence.advocacyBlueprints) {
    memorialContainer.innerHTML = createEmptyState("This issue is ready to draft.", "Open the Advocacy workspace to write your memorial and oral submission for this issue.", "Build Argument in Advocacy →", `window.currentAdvocacyIssueIndex=${activeIssueIndex};window.goToStage(3)`);
    if (rebuttalContainer) rebuttalContainer.innerHTML = createEmptyState("Map opponent counter-attacks.", "Draft your strategy in Advocacy.", "Open Advocacy →", `window.currentAdvocacyIssueIndex=${activeIssueIndex};window.goToStage(3)`);
    if (benchContainer) benchContainer.innerHTML = createEmptyState("Test this issue against the AI Bench.", "Launch the Simulator when ready.", "Open Simulator →", "window.goToStage(4)");
    if (oralFlowContainer) oralFlowContainer.innerHTML = createEmptyState("Plan your oral flow.", "Draft your oral submission in Advocacy.", "Open Advocacy →", `window.currentAdvocacyIssueIndex=${activeIssueIndex};window.goToStage(3)`);
    return;
  }

  const blueprint = advocacyIntelligence.advocacyBlueprints.find(b => b.issueId === issueId && b.stance.toLowerCase() === activeStance);

  if (!blueprint) {
    memorialContainer.innerHTML = createEmptyState(`No arguments mapped for ${activeStance.toUpperCase()}.`, "You must map custom legal prose for this stance.", "+ Formulate Argument", `window.currentAdvocacyIssueIndex=${activeIssueIndex};window.goToStage(3)`);
    if (rebuttalContainer) rebuttalContainer.innerHTML = createEmptyState("No counter-attacks identified.", "Opponent vulnerabilities must be mapped manually.", "+ Predict Counter-Attacks", `window.currentAdvocacyIssueIndex=${activeIssueIndex};window.goToStage(3)`);
    if (benchContainer) benchContainer.innerHTML = createEmptyState("No fatal questions mapped.", "Generate specific bench questions to prepare.", "+ Simulate Bench Threat", "window.goToStage(4)");
    if (oralFlowContainer) oralFlowContainer.innerHTML = createEmptyState("No oral flow generated.", "A signposting roadmap is required for the oral round.", "+ Generate Oral Script", `window.currentAdvocacyIssueIndex=${activeIssueIndex};window.goToStage(3)`);
    return;
  }

  // Fetch authority intelligence for this issue
  const authorityInt = currentSessionData.authorityIntelligence;
  const authorityMissions = authorityInt?.authorityRoadmap?.filter(a => String(a.targetIssueId) === String(issueId)) || [];

  // Render IRAC
  let iracHtml = '';
  if (blueprint.memorialStructure && blueprint.memorialStructure.subheadings && blueprint.memorialStructure.subheadings.length > 0) {
    blueprint.memorialStructure.subheadings.forEach((sub, i) => {
      const mission = authorityMissions[i] || authorityMissions[0];
      let authoritySlotHtml = '';
      if (mission) {
        const priority = mission.authorityType === 'Landmark' || mission.authorityType === 'Mandatory' ? 'CRITICAL' : 'HIGH';
        const priorityColor = priority === 'CRITICAL' ? 'text-red-400' : 'text-moot-accent';
        const defeats = mission.strategicPurpose || 'Opponent\'s primary argument';
        authoritySlotHtml = `
          <div class="mt-3 p-4 bg-navy-4 border border-moot-accent/30 rounded-lg flex flex-col gap-3 shadow-lg hover:border-moot-accent hover:bg-navy-3 transition-all group">
             <div class="flex items-center justify-between border-b border-white/10 pb-2">
               <div class="flex items-center gap-2">
                 <span class="w-2 h-2 rounded-full bg-moot-accent animate-pulse shadow-[0_0_8px_rgba(201,168,76,0.6)]"></span>
                 <span class="text-[11px] font-sans text-white uppercase tracking-widest font-bold">Authority Mission</span>
               </div>
               <div class="text-[10px] font-sans ${priorityColor} uppercase tracking-widest bg-white/5 px-2 py-1 rounded">Priority: ${priority}</div>
             </div>
             <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
               <div class="flex flex-col gap-1">
                 <span class="text-[9px] text-white/50 uppercase tracking-widest">Need</span>
                 <span class="text-xs font-serif text-white-2">${mission.authorityType} from ${mission.jurisdictionIntelligence?.requiredJurisdiction || 'Any Binding Jurisdiction'}</span>
               </div>
               <div class="flex flex-col gap-1">
                 <span class="text-[9px] text-white/50 uppercase tracking-widest">Defeats</span>
                 <span class="text-xs font-serif text-white-2">${defeats}</span>
               </div>
               <div class="flex flex-col gap-1 md:col-span-2">
                 <span class="text-[9px] text-white/50 uppercase tracking-widest">Required Ratio</span>
                 <span class="text-xs font-serif text-moot-accent italic">"${mission.ratioIntelligence?.requiredLegalRatio || sub.authorityNeeded}"</span>
               </div>
               <div class="flex flex-col gap-1 md:col-span-2">
                 <span class="text-[9px] text-white/50 uppercase tracking-widest">Why Needed</span>
                 <span class="text-xs font-serif text-white-muted">${mission.ratioIntelligence?.whyItIsNeeded || 'To substantiate the core legal claim.'}</span>
               </div>
             </div>
             <div class="mt-2 flex justify-end">
               <button onclick="window.currentAdvocacyIssueIndex=${activeIssueIndex};window.goToStage(3)" class="text-[10px] uppercase tracking-widest font-bold text-navy bg-moot-accent px-4 py-2 rounded shadow-md hover:scale-105 transition-transform">+ Deploy Authority</button>
             </div>
          </div>
        `;
      } else {
        authoritySlotHtml = `
          <div class="mt-2 p-3 bg-navy-4 border border-dashed border-moot-accent/30 rounded flex items-center justify-between cursor-pointer hover:border-moot-accent hover:bg-moot-accent/5 transition-all group">
             <div class="flex flex-col gap-1">
               <div class="text-[10px] font-sans text-white-muted uppercase tracking-widest"><span class="text-moot-accent">⚡ Authority Mission:</span> Priority High</div>
               <div class="text-xs font-serif text-white/80 group-hover:text-white transition-colors">
                 ${sub.authorityNeeded || 'Landmark precedent confirming this application'}
               </div>
             </div>
             <button onclick="window.currentAdvocacyIssueIndex=${activeIssueIndex};window.goToStage(3)" class="text-[10px] uppercase tracking-widest font-bold text-navy bg-moot-accent px-3 py-1.5 rounded shadow-sm hover:scale-105 transition-transform">+ Deploy Authority</button>
          </div>
        `;
      }

      iracHtml += `
        <div class="border-l-2 border-white/20 pl-4 py-2 flex flex-col gap-2 relative group-hover:border-moot-accent transition-all">
          <div class="absolute -left-[5px] top-2.5 w-2 h-2 rounded-full bg-moot-accent/50 shadow-[0_0_8px_rgba(201,168,76,0.5)]"></div>
          <div class="text-[11px] font-sans text-moot-accent font-semibold tracking-wider uppercase">${sub.heading}</div>
          <div class="text-sm font-serif text-white-2">${sub.ruleApplication}</div>
          ${authoritySlotHtml}
        </div>
      `;
    });
  } else {
    iracHtml = createEmptyState("Structured IRAC arguments missing.", "Generate specific legal subheadings to build the memorial.", "+ Formulate IRAC");
  }
  memorialContainer.innerHTML = iracHtml;

  // Rebuttals
  let rebHtml = '';
  if (blueprint.rebuttalMatrix && blueprint.rebuttalMatrix.opponentCounterAttacks && blueprint.rebuttalMatrix.opponentCounterAttacks.length > 0) {
    blueprint.rebuttalMatrix.opponentCounterAttacks.forEach(att => {
      rebHtml += `
        <div class="p-3 bg-red-500/5 border border-red-500/20 rounded hover:border-red-500/40 transition-colors">
          <div class="text-[11px] font-sans text-red-400 font-semibold uppercase mb-1 tracking-wider flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Warning: ${att.attackAngle}
          </div>
          <div class="text-xs font-serif text-white-muted">${att.defenseStrategy}</div>
        </div>
      `;
    });
  } else {
    rebHtml = createEmptyState("No specific counter-attacks identified.", "Opponent vulnerabilities must be mapped manually.", "+ Predict Counter-Attacks");
  }
  if (rebuttalContainer) rebuttalContainer.innerHTML = rebHtml;

  // Bench Vulnerabilities
  let benchHtml = '';
  if (blueprint.benchPreparationMap && blueprint.benchPreparationMap.fatalQuestions && blueprint.benchPreparationMap.fatalQuestions.length > 0) {
    blueprint.benchPreparationMap.fatalQuestions.forEach(q => {
      benchHtml += `
        <div class="p-3 bg-orange-500/5 border border-orange-500/20 rounded hover:border-orange-500/40 transition-colors">
          <div class="text-[11px] font-sans text-orange-400 font-semibold uppercase mb-1 tracking-wider flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.5)]"></span> Judge Question
          </div>
          <div class="text-xs font-serif text-white italic mb-2">"${q.question}"</div>
          <div class="text-[10px] font-sans text-white/50 uppercase bg-black/20 p-2 rounded">Safe Exit: <span class="text-xs font-serif normal-case text-white/90">${q.safeExit}</span></div>
        </div>
      `;
    });
  } else {
    benchHtml = createEmptyState("No fatal questions mapped.", "Generate specific bench questions to prepare for oral rounds.", "+ Simulate Bench Threat");
  }
  if (benchContainer) benchContainer.innerHTML = benchHtml;

  // Oral Flow
  let flowHtml = '';
  if (blueprint.oralAdvocacyFlow && blueprint.oralAdvocacyFlow.openingHook) {
    flowHtml += `
      <div class="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded hover:border-indigo-500/40 transition-colors">
        <div class="text-[10px] font-sans text-indigo-400 font-semibold uppercase mb-1 tracking-wider">Opening Hook</div>
        <div class="text-sm font-serif text-white leading-relaxed italic border-l-2 border-indigo-500/50 pl-2">"${blueprint.oralAdvocacyFlow.openingHook}"</div>
      </div>
    `;
    if (blueprint.oralAdvocacyFlow.signposting && blueprint.oralAdvocacyFlow.signposting.length > 0) {
       flowHtml += `
        <div class="p-3 bg-white/5 border border-white/10 rounded mt-2 hover:border-white/20 transition-colors">
          <div class="text-[10px] font-sans text-white/60 font-semibold uppercase mb-2 tracking-wider">Signposting Roadmap</div>
          <ul class="list-none text-xs font-serif text-white-2 space-y-2">
            ${blueprint.oralAdvocacyFlow.signposting.map((s, i) => `<li class="flex items-start gap-2"><span class="text-moot-accent text-[10px] mt-0.5">${i+1}.</span> <span>${s}</span></li>`).join('')}
          </ul>
        </div>
      `;
    }
  } else {
    flowHtml = createEmptyState("No oral flow generated.", "A signposting roadmap is required for the oral round.", "+ Generate Oral Script");
  }
  if (oralFlowContainer) oralFlowContainer.innerHTML = flowHtml;
}

// Global hook for the HTML buttons
window.selectIssue = selectIssue;
window.setIwStance = setIwStance;

window.launchIssueSimulator = () => { window.goToStage(4); };
