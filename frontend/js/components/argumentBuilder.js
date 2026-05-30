import { buildArgument } from '../services/api.js';
import { 
  currentPropositionContext,
  lastAnalysis, 
  showToast, 
  fmtInline, 
  esc 
} from './ui.js';

// Argument Builder State
export let lastBuiltArgument = null;

// Side Panel State Management
export let storedOralNotes = '';
export let storedRebuttals = '';
export let storedCitations = '';
export let storedMemorialHTML = '';
export let activePackTab = 'speech';
export let selectedSide = 'Petitioner';
export let citationsStrengthened = false;
export let rebuttalViewed = false;
let activeTriggerElement = null;

export function getCurrentSelectedSide() {
  const stanceRadio = document.querySelector('input[name="stance"]:checked');
  return stanceRadio ? stanceRadio.value : null;
}

export function initArgumentBuilder() {
  const form = document.getElementById('builder-form');
  const notesInput = document.getElementById('builder-notes-input');
  const submitBtn = document.getElementById('btn-builder-submit');

  if (!form || !notesInput || !submitBtn) {
    console.error("Argument Builder DOM elements not found.");
    return;
  }

  // Validate notes input and trigger real-time scanning
  notesInput.addEventListener('input', () => {
    submitBtn.disabled = notesInput.value.trim().length < 5;
    updateLiveIntelligence(notesInput.value);
  });

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await generateArgument();
  });

  submitBtn.addEventListener('click', async () => {
    await generateArgument();
  });

  // Expose methods to window for premium dynamic components
  window.copyBuilderArgument = copyBuilderArgument;
  window.exportDraftPDF = exportDraftPDF;
  window.openAuxPanel = openAuxPanel;
  window.closeAuxPanel = closeAuxPanel;
  window.openMemorialViewer = openMemorialViewer;
  window.closeMemorialViewer = closeMemorialViewer;
  window.copyMemorial = copyMemorial;

  // Bind close panel listeners
  const closeBtn = document.getElementById('aux-panel-close-btn');
  const overlay = document.getElementById('aux-panel-overlay');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAuxPanel);
  }
  if (overlay) {
    overlay.addEventListener('click', () => {
      closeAuxPanel();
      closeMemorialViewer();
    });
  }

  const memorialCloseBtn = document.getElementById('memorial-panel-close-btn');
  if (memorialCloseBtn) {
    memorialCloseBtn.addEventListener('click', closeMemorialViewer);
  }

  // Bind panel action buttons
  const copyBtn = document.getElementById('btn-aux-copy');
  const printBtn = document.getElementById('btn-aux-print');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyPanelContent);
  }
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      exportDraftPDF('aux-panel-content');
    });
  }

  const memorialCopyBtn = document.getElementById('btn-memorial-copy');
  if (memorialCopyBtn) {
    memorialCopyBtn.addEventListener('click', copyMemorial);
  }
  const memorialPrintBtn = document.getElementById('btn-memorial-print');
  if (memorialPrintBtn) {
    memorialPrintBtn.addEventListener('click', () => {
      exportDraftPDF('memorial-viewer-canvas');
    });
  }

  // Bind stance radio change event listener to track selectedSide
  const stanceRadios = document.querySelectorAll('input[name="stance"]');
  stanceRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      selectedSide = radio.value;
    });
  });
}

function updateLiveIntelligence(text) {
  const casesCountEl = document.getElementById('intel-cases-count');
  const statutesCountEl = document.getElementById('intel-statutes-count');
  const pillsContainer = document.getElementById('intel-pills-container');
  const hintEl = document.getElementById('intel-empty-hint');

  if (!casesCountEl || !statutesCountEl || !pillsContainer || !hintEl) return;

  if (!text.trim()) {
    casesCountEl.textContent = '0';
    statutesCountEl.textContent = '0';
    pillsContainer.innerHTML = '';
    hintEl.style.display = 'block';
    return;
  }

  // 1. Cases Regex Matching
  const caseRegex = /\b([A-Z][A-Za-z0-9'\s]{2,})\s+(?:v\.?|v\/s|vs\.?)\s+([A-Z][A-Za-z0-9'\s]{2,})|Union of [A-Z][a-zA-Z\s]+/gi;
  const caseMatches = text.match(caseRegex) || [];
  
  // 2. Statutes/Provisions Regex Matching
  const statuteRegex = /\b(?:Article|Art\.?|Section|Sec\.?)\s+\d+(?:[A-Za-z0-9\-\(\)]*)?/gi;
  const statuteMatches = text.match(statuteRegex) || [];

  // Update counts
  casesCountEl.textContent = caseMatches.length.toString();
  statutesCountEl.textContent = statuteMatches.length.toString();

  // Deduplicate and render pills
  const uniquePills = Array.from(new Set([...caseMatches, ...statuteMatches])).map(m => m.trim()).filter(Boolean);

  if (uniquePills.length > 0) {
    hintEl.style.display = 'none';
    pillsContainer.innerHTML = uniquePills.slice(0, 12).map(pill => {
      const isCase = caseMatches.includes(pill) || pill.toLowerCase().includes('v.') || pill.toLowerCase().includes('union');
      const bgCls = isCase ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20';
      return `<span class="px-2 py-0.5 rounded text-[10px] font-sans font-medium tracking-wide uppercase ${bgCls}">${esc(pill)}</span>`;
    }).join('');
  } else {
    pillsContainer.innerHTML = '';
    hintEl.style.display = 'block';
  }
}

async function generateArgument() {
  const notesInput = document.getElementById('builder-notes-input');
  const submitBtn = document.getElementById('btn-builder-submit');
  const select = document.getElementById('builder-issue-select');
  
  const emptyState = document.getElementById('builder-empty-state');
  const loadingState = document.getElementById('builder-loading-state');
  const outputState = document.getElementById('builder-output-state');

  if (!notesInput || !submitBtn || !select) return;

  const notes = notesInput.value.trim();
  if (notes.length < 5) return;

  const stanceRadio = document.querySelector('input[name="stance"]:checked');
  const stance = stanceRadio ? stanceRadio.value : 'Petitioner';
  const issue = select.value;

  // Set loading UI states
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="animate-pulse">Weaving Draft...</span>';
  
  if (emptyState) emptyState.classList.add('hidden');
  if (outputState) outputState.classList.add('hidden');
  if (loadingState) loadingState.classList.remove('hidden');

  try {
    const data = await buildArgument(stance, issue, notes, currentPropositionContext);
    
    if (data.success && data.response) {
      lastBuiltArgument = data.response;
      renderIRAC(data.response);
      
      if (loadingState) loadingState.classList.add('hidden');
      if (outputState) outputState.classList.remove('hidden');
      
      showToast("Argument built successfully!", "ok");
    } else {
      throw new Error(data.error || "Failed to generate argument.");
    }
  } catch (err) {
    console.error("Failed to build argument:", err);
    showToast(err.message, "err");
    
    if (loadingState) loadingState.classList.add('hidden');
    if (lastBuiltArgument) {
      if (outputState) outputState.classList.remove('hidden');
    } else {
      if (emptyState) emptyState.classList.remove('hidden');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Draft Submission →';
  }
}

function renderIRAC(iracData) {
  const outputState = document.getElementById('builder-output-state');
  if (!outputState) return;

  const currentStance = getCurrentSelectedSide() || selectedSide || 'The Advocate';
  const currentIssue = document.getElementById('builder-issue-select')?.value || 'General Issue';
  const notes = document.getElementById('builder-notes-input')?.value || '';

  try {
    renderMemorial(iracData);
    renderOralNotes(iracData, currentStance, currentIssue);
    renderRebuttals(iracData, currentStance);
    renderCitations(notes);
  } catch (e) {
    console.error('[RENDER ERROR]', e);
    renderFallbackState(e);
    return;
  }

  // Scans for cases (v., vs, Union of)
  const caseRegex = /\b([A-Z][A-Za-z0-9'\s]{2,})\s+(?:v\.?|v\/s|vs\.?)\s+([A-Z][A-Za-z0-9'\s]{2,})|Union of [A-Z][a-zA-Z\s]+/gi;
  const caseMatches = notes.match(caseRegex) || [];
  const casesCount = caseMatches.length;

  // Scans for articles / sections
  const statuteRegex = /\b(?:Article|Art\.?|Section|Sec\.?)\s+\d+(?:[A-Za-z0-9\-\(\)]*)?/gi;
  const statuteMatches = notes.match(statuteRegex) || [];
  const statutesCount = statuteMatches.length;

  // Calculate detailed honest scores
  const combinedText = (notes + " " + JSON.stringify(iracData)).toLowerCase();
  const reporterMatches = combinedText.match(/\b\d+\s+(?:scc|scr|u\.s\.|f\.[0-9]d|air|d\.l\.r\.|s\.ct\.)\s+\d+/gi) || [];
  const allCasesMatches = combinedText.match(/\b[a-zA-Z0-9.\s]{3,150}?\s+(?:v\.?|vs\.?|v\/s)\s+?[a-zA-Z0-9.\s]{3,150}/gi) || [];
  const constMatches = combinedText.match(/\b(?:constitution|constitutional|article|art\.?|section|sec\.?|amendment|fundamental right|part iii)\b/gi) || [];
  const logicMatches = combinedText.match(/\b(?:consequently|therefore|pursuant to|held that|because|since|established|precedent|ratio decidendi|obiter dicta|proportionality|locus standi)\b/gi) || [];

  const authScore = Math.min(40, Math.max(5, (reporterMatches.length * 10) + (allCasesMatches.length * 5)));
  const constScore = Math.min(25, Math.max(5, (constMatches.length * 3)));
  const benchScore = Math.min(20, Math.max(5, (logicMatches.length * 3)));
  const hasAllIRAC = iracData.issue && iracData.rule && iracData.application && iracData.conclusion;
  const isDetailed = (iracData.rule || '').length > 200 && (iracData.application || '').length > 200;
  const structScore = Math.min(15, Math.max(3, (hasAllIRAC ? 12 : 6) + (isDetailed ? 3 : 0)));

  const synthesisScore = authScore + constScore + benchScore + structScore;

  // Initial Notes Score
  const notesText = notes.toLowerCase();
  const nReporters = notesText.match(/\b\d+\s+(?:scc|scr|u\.s\.|f\.[0-9]d|air|d\.l\.r\.|s\.ct\.)\s+\d+/gi) || [];
  const nCases = notesText.match(/\b[a-zA-Z0-9.\s]{3,150}?\s+(?:v\.?|vs\.?|v\/s)\s+?[a-zA-Z0-9.\s]{3,150}/gi) || [];
  const nConst = notesText.match(/\b(?:constitution|constitutional|article|art\.?|section|sec\.?|amendment|fundamental right|part iii)\b/gi) || [];
  const nLogic = notesText.match(/\b(?:consequently|therefore|pursuant to|held that|because|since|established|precedent|ratio decidendi|obiter dicta|proportionality|locus standi)\b/gi) || [];
  
  const notesAuth = Math.min(40, Math.max(5, (nReporters.length * 10) + (nCases.length * 5)));
  const notesConst = Math.min(25, Math.max(5, (nConst.length * 3)));
  const notesBench = Math.min(20, Math.max(5, (nLogic.length * 3)));
  const notesStruct = Math.min(15, Math.max(3, Math.round(notesText.length / 50)));
  const initialNotesScore = Math.min(85, notesAuth + notesConst + notesBench + notesStruct);

  const finalReadinessScore = Math.min(100, synthesisScore + (citationsStrengthened ? 8 : 0) + (rebuttalViewed ? 7 : 0));

  const strengthScore = Math.round(authScore * 2.5); // scale 40 to 100
  const readinessScore = finalReadinessScore;
  const persuasivenessScore = Math.min(95, Math.max(65, 78 + Math.round((iracData.application || '').length / 150)));

  // Generate dynamic strengths and weaknesses
  let dynamicStrength = "Strict adherence to the structural IRAC syllogism ensures logical clarity.";
  let dynamicWeakness = "Could be strengthened with additional citations to constitutional benches.";
  
  if (casesCount === 0) {
    dynamicWeakness = "No case law authorities detected. Add supporting precedent citations to enhance authority.";
  } else if (statutesCount === 0) {
    dynamicWeakness = "No statutory or constitutional articles referenced. Ground your claims in written provisions.";
  } else {
    dynamicStrength = `Well-reasoned integration of ${casesCount} authority case(s) and ${statutesCount} statutory reference(s).`;
  }

  // Dynamic Bench Vulnerability and Rebuttals
  let riskLevel = "Medium Risk";
  let riskBadgeCls = "bg-amber-500/20 text-amber-300 border border-amber-500/30";
  let vulnerabilityText = "The transition between the legal rule and its application requires more explicit factual links.";
  let rebuttalText = "When asked about factual links, Counsel should immediately direct the Bench's attention to the specific behavior outlined in the proposition.";

  if (casesCount === 0) {
    riskLevel = "High Risk";
    riskBadgeCls = "bg-red-500/20 text-red-300 border border-red-500/30";
    vulnerabilityText = "Lack of binding precedent leaves the legal rules open to major judicial skepticism.";
    rebuttalText = "If challenged on lack of specific precedent, submit that the case raises a novel question of law that this Bench is invited to resolve based on first-principles reasoning.";
  } else if (strengthScore > 88) {
    riskLevel = "Low Risk";
    riskBadgeCls = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
    vulnerabilityText = "Factual application is strong, but the Bench may test the outer boundaries of the rule.";
    rebuttalText = "If asked about extreme application scenarios, distinguish them by pointing out that the current petition is confined to the immediate facts of the case.";
  }

  // Quality Indicators
  const authLabel = casesCount === 0 ? "Weak" : (casesCount <= 2 ? "Moderate" : "Strong");
  const authClass = casesCount === 0 ? "text-red-400" : (casesCount <= 2 ? "text-amber-400" : "text-emerald-400");
  
  const riskLabel = casesCount === 0 ? "High" : (casesCount <= 2 ? "Medium" : "Low");
  const riskClass = casesCount === 0 ? "text-red-400" : (casesCount <= 2 ? "text-amber-400" : "text-emerald-400");

  const coverageLabel = (statutesCount === 0 && casesCount === 0) ? "Poor" : ((statutesCount <= 2 || casesCount <= 2) ? "Fair" : "Excellent");
  const coverageClass = (statutesCount === 0 && casesCount === 0) ? "text-red-400" : ((statutesCount <= 2 || casesCount <= 2) ? "text-amber-400" : "text-emerald-400");

  const confidenceLabel = finalReadinessScore < 50 ? "Low" : (finalReadinessScore < 75 ? "Medium" : "High");
  const confidenceClass = finalReadinessScore < 50 ? "text-red-400" : (finalReadinessScore < 75 ? "text-amber-400" : "text-emerald-400");

  outputState.innerHTML = `
<div class="flex flex-col gap-5 w-full h-full">
  
  <!-- Quick Actions & Status Toolbar -->
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
    <div>
      <div class="text-[10px] font-semibold tracking-wider text-moot-accent uppercase flex items-center gap-1.5 font-sans">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        Appellate Draft Active
      </div>
      <h3 class="text-sm font-sans font-semibold text-white mt-1">Appellate Submission Workspace</h3>
    </div>
    <div class="flex flex-wrap gap-2" id="draft-quick-actions">
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="copyBuilderArgument()">
        📋 Copy Draft
      </button>
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="exportDraftPDF('memorial-viewer-canvas')">
        📄 Export PDF
      </button>
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="openAuxPanel('rebuttal', this)">
        🛡️ Rebuttal
      </button>
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="openAuxPanel('citations', this)">
        📖 Strengthen Citations
      </button>
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="openAuxPanel('pack', this)">
        🎙️ Oral Advocacy Suite
      </button>
    </div>
  </div>

  <!-- Draft Metrics Card -->
  <div class="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
    <div class="flex flex-col">
      <span class="text-[9px] text-white-muted uppercase tracking-widest font-sans">Authorities Used</span>
      <span class="text-lg font-semibold text-white mt-1 flex items-center gap-1 font-sans">📖 <span id="metric-authorities">${casesCount}</span></span>
    </div>
    <div class="flex flex-col">
      <span class="text-[9px] text-white-muted uppercase tracking-widest font-sans">Articles Cited</span>
      <span class="text-lg font-semibold text-white mt-1 flex items-center gap-1 font-sans">🏛️ <span id="metric-articles">${statutesCount}</span></span>
    </div>
    <div class="flex flex-col">
      <span class="text-[9px] text-white-muted uppercase tracking-widest font-sans">Complexity</span>
      <span class="text-sm font-semibold text-indigo-400 mt-2 font-sans">Appellate Level</span>
    </div>
    <div class="flex flex-col">
      <span class="text-[9px] text-white-muted uppercase tracking-widest font-sans">Persuasiveness</span>
      <span class="text-sm font-semibold text-emerald-400 mt-2 font-sans"><span id="metric-persuasiveness">${persuasivenessScore}</span> / 100</span>
    </div>
    <div class="flex flex-col col-span-2 md:col-span-1">
      <span class="text-[9px] text-white-muted uppercase tracking-widest font-sans">Readiness Score</span>
      <span class="text-sm font-semibold text-moot-accent mt-2 font-sans"><span id="metric-readiness">${readinessScore}</span>%</span>
    </div>
  </div>

  <!-- Row of Intelligence Panels (Argument Strength & Bench Vulnerabilities) -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Argument Strength Engine -->
    <div class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3">
      <div class="flex justify-between items-center">
        <span class="text-xs uppercase tracking-wider text-white-2 font-semibold font-sans">Argument Strength Engine</span>
        <span class="text-xs font-bold text-moot-accent font-sans"><span id="strength-score-val">${strengthScore}</span>%</span>
      </div>
      <!-- CSS Progress Bar -->
      <div class="w-full h-2 bg-navy-5 rounded-full overflow-hidden border border-white/5 font-sans">
        <div id="strength-progress-bar" class="h-full bg-gradient-to-r from-amber-500 to-moot-accent transition-all duration-500" style="width: ${strengthScore}%"></div>
      </div>
      <!-- Strengths & Weaknesses list -->
      <div class="flex flex-col gap-2 mt-1">
        <div class="flex items-start gap-2 text-xs text-white-muted font-sans">
          <span class="text-emerald-400">✔</span>
          <span id="strength-engine-pos">${dynamicStrength}</span>
        </div>
        <div class="flex items-start gap-2 text-xs text-white-muted font-sans">
          <span class="text-amber-400">▲</span>
          <span id="strength-engine-neg">${dynamicWeakness}</span>
        </div>
      </div>
    </div>

    <!-- Bench Vulnerabilities Panel -->
    <div class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3 font-sans">
      <div class="flex justify-between items-center">
        <span class="text-xs uppercase tracking-wider text-white-2 font-semibold font-sans">Bench Vulnerabilities</span>
        <span id="vulnerability-risk-badge" class="px-2 py-0.5 text-[9px] font-semibold tracking-wider rounded uppercase font-sans ${riskBadgeCls}">${riskLevel}</span>
      </div>
      <div class="text-xs text-white-muted font-sans">
        <strong>Vulnerable claim:</strong> ${vulnerabilityText}
      </div>
      <div class="text-[11px] bg-red-950/20 border border-red-900/30 rounded p-2 text-gray-300 font-sans">
        <strong class="text-red-400 font-sans uppercase text-[9px] tracking-wider block mb-1">Suggested Rebuttal Strategy:</strong>
        <span id="vulnerability-rebuttal-strategy">${rebuttalText}</span>
      </div>
    </div>
  </div>

  <!-- Row of Progression and Transparency Panels -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Readiness Transparency Audit -->
    <div class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3">
      <div class="flex justify-between items-center">
        <span class="text-xs uppercase tracking-wider text-white-2 font-semibold font-sans">⚖️ Readiness Transparency Audit</span>
        <span class="text-[10px] font-bold text-moot-accent uppercase tracking-widest font-sans">Honest Breakdown</span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans">Authority Strength</span>
          <span class="text-xs font-semibold text-white mt-1 font-mono">${authScore} / 40</span>
        </div>
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans">Constitutional Depth</span>
          <span class="text-xs font-semibold text-white mt-1 font-mono">${constScore} / 25</span>
        </div>
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans">Bench Resistance</span>
          <span class="text-xs font-semibold text-white mt-1 font-mono">${benchScore} / 20</span>
        </div>
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans">Draft Structure</span>
          <span class="text-xs font-semibold text-white mt-1 font-mono">${structScore} / 15</span>
        </div>
      </div>
    </div>

    <!-- Advocacy Progression Tracker -->
    <div class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3 font-sans">
      <div class="flex justify-between items-center">
        <span class="text-xs uppercase tracking-wider text-white-2 font-semibold font-sans">📈 Advocacy Progression Tracker</span>
        <span class="text-xs font-bold text-moot-accent font-sans">${finalReadinessScore}%</span>
      </div>
      <div class="flex flex-col gap-2 pl-1 mt-1 font-sans">
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] bg-white/10 text-white font-mono">1</span>
          <div class="flex-1 flex justify-between items-center text-xs font-sans">
            <span class="text-white-muted">Initial Notes Quality</span>
            <span class="text-red-400 font-mono font-medium">${initialNotesScore}%</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] bg-emerald-500/20 text-emerald-400 font-mono">2</span>
          <div class="flex-1 flex justify-between items-center text-xs font-sans">
            <span class="text-white font-semibold">Appellate Memorial Synthesis</span>
            <span class="text-emerald-400 font-mono font-medium">${synthesisScore}% (+${synthesisScore - initialNotesScore}%)</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${citationsStrengthened ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white-muted'} font-mono">3</span>
          <div class="flex-1 flex justify-between items-center text-xs font-sans">
            <span class="text-white-muted">Citation Strengthening</span>
            <span class="${citationsStrengthened ? 'text-emerald-400' : 'text-white-muted'} font-mono font-semibold">${citationsStrengthened ? 'Completed (+8%)' : 'Pending (+8% Potential)'}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${rebuttalViewed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white-muted'} font-mono">4</span>
          <div class="flex-1 flex justify-between items-center text-xs font-sans">
            <span class="text-white-muted">Rebuttal Strategy Review</span>
            <span class="${rebuttalViewed ? 'text-emerald-400' : 'text-white-muted'} font-mono font-semibold">${rebuttalViewed ? 'Completed (+7%)' : 'Pending (+7% Potential)'}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Premium Memorial Completion Card -->
  <div class="p-8 bg-gradient-to-br from-indigo-950/20 to-navy-3 border border-indigo-500/20 rounded-xl flex flex-col items-center text-center gap-4 mt-2 shadow-xl animate-fade-in font-sans">
    <div class="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xl font-bold">✓</div>
    <div>
      <h3 class="text-lg font-sans font-semibold text-white">Appellate Memorial Generated</h3>
      <p class="text-xs text-white-muted mt-1 max-w-sm font-sans">The legal argument has been compiled into a professional Supreme Court memorial. Review the full draft, export, or print via the workspace panels.</p>
    </div>
    
    <!-- Quality Indicators Grid -->
    <div class="grid grid-cols-2 gap-3 w-full max-w-md mt-2 font-sans">
      <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center">
        <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans font-semibold">Authority Support</span>
        <span class="text-xs font-semibold ${authClass} mt-1 font-sans">${authLabel}</span>
      </div>
      <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center">
        <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans font-semibold">Bench Risk</span>
        <span class="text-xs font-semibold ${riskClass} mt-1 font-sans">${riskLabel}</span>
      </div>
      <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center">
        <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans font-semibold">Citation Coverage</span>
        <span class="text-xs font-semibold ${coverageClass} mt-1 font-sans">${coverageLabel}</span>
      </div>
      <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center">
        <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans font-semibold">Submission Confidence</span>
        <span class="text-xs font-semibold ${confidenceClass} mt-1 font-sans">${confidenceLabel}</span>
      </div>
    </div>

    <!-- Metadata grid -->
    <div class="grid grid-cols-2 gap-x-8 gap-y-3 p-4 bg-white/[0.02] border border-white/5 rounded-lg w-full max-w-md text-left text-xs font-sans text-white-muted mt-2">
      <div><strong>Issue:</strong> <span class="text-white font-sans">${esc(currentIssue)}</span></div>
      <div><strong>Side:</strong> <span class="text-white uppercase tracking-wider font-sans">${esc(currentStance)}</span></div>
      <div><strong>Authorities Used:</strong> <span class="text-white font-sans">${casesCount} case(s)</span></div>
      <div><strong>Articles Used:</strong> <span class="text-white font-sans">${statutesCount} article(s)</span></div>
      <div class="col-span-2 border-t border-white/5 pt-2 mt-1 flex justify-between items-center font-sans">
        <span>Readiness Score:</span>
        <span class="text-moot-accent font-bold text-sm font-sans">${readinessScore}%</span>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex gap-3 w-full max-w-md mt-2 font-sans">
      <button class="flex-1 py-3 bg-moot-accent text-black font-semibold text-xs uppercase tracking-wider rounded-md hover:bg-gold-light transition-all cursor-pointer border-none font-sans" onclick="openMemorialViewer()">
        ⚖️ View Memorial
      </button>
      <button class="flex-1 py-3 bg-white/5 border border-white/10 text-white font-semibold text-xs uppercase tracking-wider rounded-md hover:bg-white/10 transition-all cursor-pointer font-sans" onclick="exportDraftPDF('memorial-viewer-canvas')">
        📄 Export PDF
      </button>
    </div>
  </div>

</div>
  `;
}

export function cleanSectionText(text, headerToRemove) {
  if (!text) return '';
  let cleaned = String(text).trim();
  
  // Remove bolding around the header if present, e.g. **ISSUE**, **RULE**, etc.
  // Also match optional colons, dashes, and whitespace
  const regex = new RegExp(`^(\\s*\\*\\*\\s*)*${headerToRemove}(\\s*\\*\\*\\s*)*\\s*[:\\-–—]*\\s*`, 'i');
  cleaned = cleaned.replace(regex, '');
  
  // Also clean other general section headers if they appear at the start
  const generalRegex = /^\s*(\*\*)*(issue|rule|application|conclusion|issue of law|governing precedents|submissions|prayer for relief)(\*\*)*\s*[:\-–—]*\s*/i;
  cleaned = cleaned.replace(generalRegex, '');
  
  return cleaned.trim();
}

function renderMemorial(iracData) {
  const cleanIssue = cleanSectionText(iracData.issue || '', 'issue');
  const cleanRule = cleanSectionText(iracData.rule || '', 'rule');
  const cleanApp = cleanSectionText(iracData.application || '', 'application');
  const cleanConclusion = cleanSectionText(iracData.conclusion || '', 'conclusion');

  storedMemorialHTML = `
  <div class="flex-1 bg-[#fcfbfa] border border-[#dcdad5] rounded-xl shadow-xl overflow-hidden min-h-[400px] flex flex-col text-slate-800">
    <!-- Legal Page Header -->
    <div class="border-b border-[#ecebe7] bg-[#f9f8f4] py-3 px-6 flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-500 font-sans font-medium">
      <span>BEFORE THE SUPREME COURT OF APPRENTICE ADVOCACY</span>
      <span>MEMORIAL SUBMISSION</span>
    </div>
    
    <!-- Legal Document Content Area -->
    <div class="p-8 md:p-12 flex-1 flex flex-col gap-6 font-serif text-[14px] leading-relaxed text-slate-800" id="memorial-viewer-canvas">
      
      <!-- Issue -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#a88220] font-sans font-bold mb-2">ISSUE</h4>
        <div class="h-[1px] bg-[#dcdad5] w-full mb-4"></div>
        <div class="pl-4 border-l-2 border-[#a88220]/30 italic text-slate-700 font-serif">${fmtInline(cleanIssue)}</div>
      </div>
      
      <hr class="border-[#e5e3de]">

      <!-- Rule -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#2c3e50] font-sans font-bold mb-2">RULE</h4>
        <div class="h-[1px] bg-[#dcdad5] w-full mb-4"></div>
        <div class="text-slate-800 whitespace-pre-wrap pl-1">${fmtInline(cleanRule)}</div>
      </div>

      <hr class="border-[#e5e3de]">

      <!-- Application -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#2c3e50] font-sans font-bold mb-2">APPLICATION</h4>
        <div class="h-[1px] bg-[#dcdad5] w-full mb-4"></div>
        <div class="text-slate-800 whitespace-pre-wrap pl-1">${fmtInline(cleanApp)}</div>
      </div>

      <hr class="border-[#e5e3de]">

      <!-- Conclusion -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#2c3e50] font-sans font-bold mb-2">CONCLUSION</h4>
        <div class="h-[1px] bg-[#dcdad5] w-full mb-4"></div>
        <div class="text-slate-800 whitespace-pre-wrap pl-1">${fmtInline(cleanConclusion)}</div>
      </div>
      
    </div>

    <!-- Legal Page Footer -->
    <div class="border-t border-[#ecebe7] bg-[#f9f8f4] py-3 px-6 flex justify-between items-center text-[10px] text-slate-500 font-sans">
      <span>Appellate Drafting Studio · MootCoach AI</span>
      <span>PAGE 1</span>
    </div>
  </div>
  `;
}

function renderOralNotes(iracData, currentStance, currentIssue) {
  storedOralNotes = getUpgradedOralNotes(iracData, currentStance, currentIssue);
}

function renderRebuttals(iracData, currentStance) {
  storedRebuttals = getUpgradedRebuttals(iracData, currentStance);
}

function renderCitations(notes) {
  storedCitations = getUpgradedCitations(notes);
}

function renderFallbackState(error) {
  const outputState = document.getElementById('builder-output-state');
  if (!outputState) return;

  const errorMsg = error ? (error.message || String(error)) : 'Unknown render error';

  outputState.innerHTML = `
    <div class="p-8 bg-red-950/10 border border-red-900/20 rounded-xl flex flex-col items-center text-center gap-4 mt-2 shadow-xl font-sans">
      <div class="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 text-xl font-bold">✕</div>
      <div>
        <h3 class="text-lg font-sans font-semibold text-white">Workspace Rendering Error</h3>
        <p class="text-xs text-white-muted mt-1 max-w-sm">An error occurred while compiling the moot round prep workspace. The generated payload remains preserved in memory.</p>
        <p class="text-[10px] text-red-400 mt-2 font-mono">${esc(errorMsg)}</p>
      </div>
    </div>
  `;
}

export function populateIssuesFromAnalysis() {
  const select = document.getElementById('builder-issue-select');
  if (!select) return;

  try {
    const analysisStr = window.lastAnalysis || lastAnalysis;
    if (analysisStr) {
      const data = JSON.parse(analysisStr);
      const issues = data.legalIssues || [];
      if (issues.length > 0) {
        select.innerHTML = '';
        issues.forEach((issue, index) => {
          const opt = document.createElement('option');
          opt.value = issue;
          opt.textContent = `Issue ${index + 1}: ${issue}`;
          select.appendChild(opt);
        });
        console.log("Loaded issues dynamically from analysis into Argument Builder.");
        return;
      }
    }
  } catch (e) {
    console.error("Failed to parse lastAnalysis for issues in Argument Builder:", e);
  }

  // Fallback defaults
  select.innerHTML = `
    <option value="Issue 1: Jurisdiction & Maintainability">Issue 1: Jurisdiction & Maintainability</option>
    <option value="Issue 2: Constitutional Validity of the Act/Provision">Issue 2: Constitutional Validity of the Act/Provision</option>
    <option value="Issue 3: Substantive Merits & Breach of Rights">Issue 3: Substantive Merits & Breach of Rights</option>
    <option value="Issue 4: Appropriate Remedies & Relief Sought">Issue 4: Appropriate Remedies & Relief Sought</option>
  `;
}

export function copyBuilderArgument() {
  if (!lastBuiltArgument) return;

  const formattedText = `=== ISSUE ===\n${lastBuiltArgument.issue || ''}\n\n=== RULE ===\n${lastBuiltArgument.rule || ''}\n\n=== APPLICATION ===\n${lastBuiltArgument.application || ''}\n\n=== CONCLUSION ===\n${lastBuiltArgument.conclusion || ''}`;

  navigator.clipboard.writeText(formattedText).then(() => {
    const btn = document.getElementById('btn-builder-copy');
    if (btn) {
      btn.textContent = '✓ Copied';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = '📋 Copy Draft';
        btn.classList.remove('copied');
      }, 2000);
    }
    showToast("IRAC argument copied to clipboard!", "ok");
  }).catch(err => {
    showToast("Failed to copy argument: " + err.message, "err");
  });
}

export function exportDraftPDF(containerId = "legal-memorial-canvas") {
  console.log(`[DEBUG AUDIT] Exporting ${containerId} as PDF...`);
  let contentEl = document.getElementById(containerId);
  let printContent = "";
  
  if (contentEl) {
    printContent = contentEl.innerHTML;
  } else if (containerId === "memorial-viewer-canvas" && storedMemorialHTML) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = storedMemorialHTML;
    const canvas = tempDiv.querySelector('#memorial-viewer-canvas');
    printContent = canvas ? canvas.innerHTML : storedMemorialHTML;
  } else if (containerId === "aux-panel-content") {
    if (storedOralNotes || storedRebuttals || storedCitations) {
      printContent = storedOralNotes || storedRebuttals || storedCitations;
    }
  } else {
    const fallbackEl = document.getElementById("memorial-viewer-canvas");
    if (fallbackEl) {
      printContent = fallbackEl.innerHTML;
    } else if (storedMemorialHTML) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = storedMemorialHTML;
      const canvas = tempDiv.querySelector('#memorial-viewer-canvas');
      printContent = canvas ? canvas.innerHTML : storedMemorialHTML;
    } else {
      showToast("No content found to export.", "err");
      return;
    }
  }
  
  const isAux = containerId === "aux-panel-content";
  const headerText = isAux ? "APPELLATE DRAFTING STUDIO · AUXILIARY GUIDELINES" : "BEFORE THE SUPREME COURT OF APPRENTICE ADVOCACY · MEMORIAL SUBMISSION";
  const titleText = isAux ? "Appellate Auxiliary Guidelines" : "Appellate Memorial - MootCoach AI";

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(`
    <html>
      <head>
        <title>${titleText}</title>
        <link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&display=swap" rel="stylesheet">
        <style>
          @page {
            size: letter;
            margin: 1in;
          }
          body {
            font-family: 'Merriweather', Georgia, serif;
            line-height: 1.8;
            color: #1a1a1a;
            margin: 0;
            padding: 0;
            font-size: 12pt;
            word-wrap: break-word;
          }
          p, li, blockquote, hr, div {
            page-break-inside: avoid;
          }
          h1, h2, h3, h4, h5, h6 {
            page-break-inside: avoid;
            page-break-after: avoid;
          }
          h4 {
            font-family: Arial, sans-serif;
            font-size: 11pt;
            letter-spacing: 0.12em;
            color: #333;
            margin-top: 24px;
            margin-bottom: 8px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 4px;
            text-transform: uppercase;
          }
          hr {
            border: none;
            border-top: 1px solid #eee;
            margin: 20px 0;
          }
          .header {
            text-align: center;
            font-family: Arial, sans-serif;
            font-size: 8pt;
            color: #888;
            letter-spacing: 0.15em;
            border-bottom: 2px double #ddd;
            padding-bottom: 10px;
            margin-bottom: 30px;
            text-transform: uppercase;
            page-break-inside: avoid;
          }
          .footer {
            text-align: center;
            font-family: Arial, sans-serif;
            font-size: 8pt;
            color: #888;
            letter-spacing: 0.1em;
            margin-top: 40px;
            border-top: 1px solid #eee;
            padding-top: 10px;
            text-transform: uppercase;
            page-break-inside: avoid;
          }
          .pl-4 {
            padding-left: 15px;
            border-left: 3px solid #ccc;
            font-style: italic;
            color: #444;
          }
          .whitespace-pre-wrap {
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <div class="header">${headerText}</div>
        ${printContent}
        <div class="footer">Appellate Drafting Studio · MootCoach AI</div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 600);
}

export function openAuxPanel(type, triggerElement) {
  if (!lastBuiltArgument) {
    showToast("Generate a submission first to unlock this workspace.", "info");
    return;
  }

  activeTriggerElement = triggerElement || document.activeElement;

  const overlay = document.getElementById('aux-panel-overlay');
  const panel = document.getElementById('aux-panel');
  const title = document.getElementById('aux-panel-title');
  const content = document.getElementById('aux-panel-content');

  if (!overlay || !panel || !title || !content) return;

  // Set title and content based on type
  if (type === 'oral') {
    title.textContent = 'Oral Advocacy Notes';
    content.innerHTML = storedOralNotes;
  } else if (type === 'rebuttal') {
    title.textContent = 'Rebuttal Strategy';
    rebuttalViewed = true;
    content.innerHTML = storedRebuttals;
    setTimeout(() => { renderIRAC(lastBuiltArgument); }, 50);
  } else if (type === 'citations') {
    title.textContent = 'Citation Strengthener';
    citationsStrengthened = true;
    content.innerHTML = storedCitations;
    setTimeout(() => { renderIRAC(lastBuiltArgument); }, 50);
  } else if (type === 'pack') {
    title.textContent = 'Oral Advocacy Suite';
    renderOralAdvocacySuite(content);
  }

  // Open the panel
  overlay.classList.remove('hidden');
  panel.classList.remove('hidden');
  
  // force reflow
  overlay.offsetHeight;
  overlay.classList.add('active');
  panel.classList.add('active');

  // Trapping focus & Keyboard accessibility
  document.addEventListener('keydown', handlePanelKeyDown);
  
  // Set focus to the first focusable element inside the panel
  setTimeout(() => {
    const focusables = panel.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
    if (focusables.length > 0) {
      focusables[0].focus();
    }
  }, 100);
}

export function closeAuxPanel() {
  const overlay = document.getElementById('aux-panel-overlay');
  const panel = document.getElementById('aux-panel');

  if (!overlay || !panel) return;

  overlay.classList.remove('active');
  panel.classList.remove('active');

  document.removeEventListener('keydown', handlePanelKeyDown);

  // Hide overlay after transition completes
  setTimeout(() => {
    if (!panel.classList.contains('active')) {
      overlay.classList.add('hidden');
      panel.classList.add('hidden');
    }
  }, 450);

  // Restore focus
  if (activeTriggerElement && typeof activeTriggerElement.focus === 'function') {
    activeTriggerElement.focus();
  }
  activeTriggerElement = null;
}

export function openMemorialViewer() {
  if (!storedMemorialHTML) {
    showToast("Generate a submission first to unlock the memorial.", "info");
    return;
  }

  // TODO [Architectural Scaffolding]:
  // In the future, this should open in a dedicated standalone modal with enhanced canvas,
  // zooming capabilities, and native-grade double-page layouts.
  // Currently utilizing the fallback side-overlay view.

  const overlay = document.getElementById('aux-panel-overlay');
  const panel = document.getElementById('memorial-panel');
  const content = document.getElementById('memorial-panel-content');

  if (!overlay || !panel || !content) return;

  content.innerHTML = storedMemorialHTML;

  // Open the panel
  overlay.classList.remove('hidden');
  panel.classList.remove('hidden');
  
  // force reflow
  overlay.offsetHeight;
  
  overlay.classList.add('active');
  panel.classList.add('active');

  // Trapping focus & Keyboard accessibility
  document.addEventListener('keydown', handlePanelKeyDown);
}

export function closeMemorialViewer() {
  const overlay = document.getElementById('aux-panel-overlay');
  const panel = document.getElementById('memorial-panel');

  if (!overlay || !panel) return;

  overlay.classList.remove('active');
  panel.classList.remove('active');

  document.removeEventListener('keydown', handlePanelKeyDown);

  // Hide overlay after transition completes
  setTimeout(() => {
    if (!panel.classList.contains('active')) {
      overlay.classList.add('hidden');
      panel.classList.add('hidden');
    }
  }, 450);
}

export function copyMemorial() {
  const content = document.getElementById('memorial-viewer-canvas');
  if (!content) return;

  const textToCopy = content.innerText;
  navigator.clipboard.writeText(textToCopy).then(() => {
    const btn = document.getElementById('btn-memorial-copy');
    if (btn) {
      btn.textContent = '✓ Copied';
      setTimeout(() => {
        btn.textContent = '📋 Copy Memorial';
      }, 2000);
    }
    showToast("Memorial copied to clipboard!", "ok");
  }).catch(err => {
    showToast("Failed to copy: " + err.message, "err");
  });
}

export function renderOralAdvocacySuite(container) {
  if (!container) return;

  activePackTab = activePackTab || 'speech';
  if (activePackTab === 'qa' || activePackTab === 'traps') {
    activePackTab = 'qa';
  }

  // Construct tab bar and contents
  const tabs = [
    { id: 'speech', label: '🎙️ Speech' },
    { id: 'submissions', label: '⚖️ Submissions' },
    { id: 'qa', label: '❓ Q&A & Traps' },
    { id: 'rebuttals', label: '🛡️ Rebuttals' },
    { id: 'precedents', label: '📖 Precedents' }
  ];

  const tabHeadersHTML = tabs.map(t => {
    const isActive = t.id === activePackTab;
    const borderCls = isActive ? 'border-b-2 border-moot-accent text-moot-accent' : 'border-b border-white/5 text-[#f5f3ef]/45 hover:text-white';
    return `<button class="px-3 py-2 text-[10px] font-sans font-semibold uppercase tracking-wider bg-transparent border-0 cursor-pointer transition-all ${borderCls}" onclick="switchPackTab('${t.id}')">${t.label}</button>`;
  }).join('');

  // Access current state
  const currentStance = getCurrentSelectedSide() || selectedSide || 'Petitioner';
  const isPetitioner = currentStance.toLowerCase().includes('petitioner') || currentStance.toLowerCase().includes('appellant');
  const iracData = lastBuiltArgument || {};
  const currentIssue = document.getElementById('builder-issue-select')?.value || 'General Issue';

  // Section 1 & 7: Opening Speeches and Closing Prayers
  const openingLine = isPetitioner 
    ? `May it please this Honorable Court. My name is Counsel representing the Petitioner. We stand before this Court to challenge the validity of the impugned action concerning the key issue of law, namely ${esc(iracData.issue || currentIssue)}.`
    : `May it please this Honorable Court. My name is Counsel representing the Respondent. We stand before this Court to oppose the petition in its entirety and defend the constitutionality of the impugned action.`;

  const opening30s = isPetitioner
    ? "My Lords, the violation here is not merely technical, but goes to the root of Part III rights. If this court does not intervene, the petitioner faces irreparable injury for which damages are no remedy. The state cannot bypass the rule of law under the banner of convenience."
    : "My Lords, the State's action was necessitated by public welfare. It enjoys the presumption of constitutionality and fits strictly within the legislative competence. The restriction is reasonable, proportional, and leaves alternative remedies open.";

  const opening60s = isPetitioner
    ? "My Lords, the petition raises a vital question of constitutional fair play. First, the impugned regulation bypasses natural justice. Second, it violates the proportionality test by imposing an absolute bar where narrower means were practicable. Under Maneka Gandhi, any procedure must be fair, just, and reasonable. We pray that this Court strikes down the provision."
    : "My Lords, the Respondent submits that the petition is both procedurally barred and substantively meritless. The petitioner failed to exhaust the statutory appeal mechanism. Furthermore, the restriction is reasonable under Article 19(6) to protect public safety. A regulatory vacuum would cause public harm. We pray that the petition be dismissed.";

  const closing15s = isPetitioner
    ? "In conclusion, My Lords, because the impugned regulation violates the tests of proportionality and natural justice, we pray that this petition be allowed. We thank this Court."
    : "In conclusion, My Lords, because the regulation is a reasonable and necessary restriction in public interest, we pray that the petition be dismissed. We thank this Court.";

  const closing30s = isPetitioner
    ? "My Lords, a constitutional democracy cannot permit administrative convenience to override fundamental rights. Since the regulation bypasses notice, lacks guidelines, and is disproportionate, we pray that this Court strike it down. We thank this Court."
    : "My Lords, the state acted in good faith to protect public welfare. To strike down this rule would create a regulatory vacuum. Since the restriction is proportional and constitutional, we pray that the petition be dismissed. We thank this Court.";

  const closingFull = isPetitioner
    ? "May it please this Court. For the reasons submitted, the Petitioner prays that this Court: First, declare the impugned regulation unconstitutional and void under Articles 14, 19, and 21. Second, direct the State to reinstate the Petitioner's status. And pass any other order that this Court deems fit in the interest of justice. We thank this Court."
    : "May it please this Court. For the reasons submitted, the Respondent prays that this Court: First, uphold the validity of the impugned regulation. Second, dismiss the petition with costs as a meritless challenge to policy discretion. And pass any other order that this Court deems fit. We thank this Court.";

  // Section 3: likely bench questions
  const qaList = isPetitioner ? [
    {
      q: "Counsel, isn't the regulation of this domain purely within the policy discretion of the Executive?",
      a: "Most Respectfully, My Lords, while policy discretion lies with the Executive, its exercise is bounded by constitutional limits. Once an action exceeds those limits or is manifestly arbitrary, this Court is fully empowered—indeed required—to intervene under Article 14, as established in Royappa."
    },
    {
      q: "Why should we bypass the statutory alternative remedies available to your client?",
      a: "It is well-settled by this Court in Whirlpool Corporation v. Registrar of Trade Marks that the existence of an alternative remedy is a rule of discretion and not a bar to jurisdiction, particularly where there is a violation of fundamental rights or principles of natural justice."
    },
    {
      q: "Where is the specific, documented prejudice caused to the Petitioner?",
      a: "The prejudice is immediate and absolute. The state action directly impairs the Petitioner's livelihood and personal liberty without notice or hearing, which is a per se violation of Article 19(1)(g) and Article 21, causing irreparable harm."
    },
    {
      q: "Aren't you asking this Court to act as a court of appeal over administrative policy decisions?",
      a: "Not at all, My Lords. Counsel does not ask this Court to substitute its wisdom for that of the executive, but to review the legality, procedural propriety, and proportionality of the decision-making process under the Wednesbury principle."
    },
    {
      q: "Is there any direct precedent holding this precise rule unconstitutional?",
      a: "While there may not be a factual mirror-image case, the core legal principle is firmly governed by the Constitutional Bench holding in Puttaswamy, which established that any state encroachment on individual rights must pass the strict four-pronged test of proportionality."
    },
    {
      q: "Isn't the state regulation a reasonable restriction under Article 19(6) in public interest?",
      a: "My Lords, a restriction cannot be 'reasonable' if it lacks procedural safeguards. The absence of notice or any appeal mechanism makes the restriction disproportionate and excessive."
    },
    {
      q: "What if striking down this provision causes regulatory chaos?",
      a: "My Lords, constitutional rights cannot be sacrificed for administrative convenience. The state remains free to draft a new, constitutionally compliant rule that incorporates natural justice."
    },
    {
      q: "Can the state not claim a public safety emergency to justify immediate action?",
      a: "Even in emergencies, the state must adopt the least restrictive means. Here, no threat was shown to justify bypassing a post-decisional hearing."
    },
    {
      q: "Does your client have a clean record of compliance under the prior rules?",
      a: "Yes, My Lords, the Petitioner has operated in full compliance. The sudden enforcement actions were taken without any prior citation or warning."
    },
    {
      q: "If we find the provision valid, what alternative relief do you seek?",
      a: "In the alternative, we pray that this Court reads down the provision to exclude its application where prior notice is practicable, or directs a post-decisional hearing within a strict timeline."
    }
  ] : [
    {
      q: "Counsel, how do you justify the apparent lack of notice or hearing before this action was taken?",
      a: "My Lords, the urgency of the situation and the protection of public interest necessitated immediate action. The statute implicitly permits post-decisional hearings, which completely satisfies the requirements of natural justice under these exceptional circumstances."
    },
    {
      q: "Does this action not violate the basic principles of proportionality laid down in Puttaswamy?",
      a: "No, My Lords. The restriction passes the proportionality test: it has a legitimate goal (public welfare), a rational nexus (preventing harm), is necessary as no less restrictive means exist, and the public benefit far outweighs any private inconvenience."
    },
    {
      q: "Is the presumption of constitutionality sufficient to save a provision that is prima facie arbitrary?",
      a: "The provision is not arbitrary. It is a carefully crafted legislative response to a complex socioeconomic issue. The legislature has broad latitude, and the burden remains strictly on the Petitioner to prove unconstitutionality beyond reasonable doubt."
    },
    {
      q: "How can the State argue that this doesn't encroach upon the Petitioner's Article 19(1)(g) rights?",
      a: "Article 19(1)(g) is not absolute. Under Article 19(6), the State is competent to impose reasonable restrictions in the interest of the general public. The restrictions here are fully reasonable and public-interest oriented."
    },
    {
      q: "If this Court strikes down this provision, what is the State's fallback plan?",
      a: "We submit that the provision is constitutional. Striking it down would create a regulatory vacuum, endangering public safety. If the Court finds any ambiguity, we pray that it read down the provision rather than strike it down."
    },
    {
      q: "How does a post-decisional hearing cure the initial lack of natural justice?",
      a: "My Lords, as held in Charan Lal Sahu, in cases of administrative urgency, a post-decisional hearing cures any prior procedural defect, providing a full opportunity to present their case."
    },
    {
      q: "Isn't the Wednesbury unreasonableness standard satisfied here by the sheer lack of guidelines?",
      a: "No, My Lords. The guidelines are found in the statutory purpose and context. The executive has applied this power in a targeted manner to address specific harms."
    },
    {
      q: "Why should we not follow the precedent of Maneka Gandhi and strike this down?",
      a: "Maneka Gandhi held that procedure must be fair. A post-decisional hearing framework in a public welfare context is fair, just, and reasonable, fitting the Maneka Gandhi standard."
    },
    {
      q: "Can public interest completely override fundamental rights?",
      a: "No, My Lords. Fundamental rights are not overridden; they are balanced. Article 19(6) explicitly allows this balance in the interest of the general public."
    },
    {
      q: "If we find in favor of the Petitioner, will the state provide compensation?",
      a: "My Lords, the state acted in good faith for public safety. No malice is alleged. Therefore, public interest precludes any liability for damages."
    }
  ];

  // Section 5: Rebuttal War Room
  const rebuttalsList = isPetitioner ? [
    {
      opponent: "The state regulation is a policy decision and is not reviewable by the Court.",
      rebuttal: "Policy discretion is bounded by the Constitution. Under Royappa, arbitrary policy is ultra vires Article 14."
    },
    {
      opponent: "The petitioner failed to exhaust the alternative remedy of administrative appeal.",
      rebuttal: "Alternate remedies do not bar writ jurisdiction when fundamental rights are violated, as held in Whirlpool."
    },
    {
      opponent: "No hearing is required because the state is acting in an emergency public safety role.",
      rebuttal: "Emergency claims do not suspend Article 14 or 21. Natural justice (at least post-decisional) must be provided."
    }
  ] : [
    {
      opponent: "The state regulation violates Article 14 because it was issued without prior notice.",
      rebuttal: "Urgency and public welfare justify post-decisional hearing, satisfying natural justice."
    },
    {
      opponent: "The regulation is disproportionate and violates Article 19(1)(g).",
      rebuttal: "Under Article 19(6), the state is competent to impose reasonable restrictions for public safety."
    },
    {
      opponent: "The guidelines are unguided and therefore arbitrary.",
      rebuttal: "Guidelines are implicitly defined by the statutory framework and target public welfare objectives."
    }
  ];

  // Section 6: Authorities Snapshot
  const precedentsList = [
    {
      name: "K.S. Puttaswamy v. Union of India (2017)",
      bench: "9-Judge Bench",
      benchStrength: "9-Judge Constitutional Bench",
      constitutionalImportance: "★★★★★ (Critical Article 21 Privacy Foundation)",
      courtroomUsage: "My Lords, the constitutional proportionality test laid down in Puttaswamy requires the state to choose the least restrictive measure, which it has failed to do here.",
      strategicValue: "Serves as the foundation to challenge the proportionality of the state restrictions under Article 21.",
      authorityWeight: "★★★★★ (Highest Binding Authority)",
      ratio: "Right to privacy and personal liberty are fundamental under Article 21, and state limitation of these rights must satisfy the three-fold test of legality, necessity, and proportionality.",
      why: "Serves as the foundation to challenge the proportionality of the state restrictions under Article 21.",
      usage: "My Lords, the constitutional proportionality test laid down in Puttaswamy requires the state to choose the least restrictive measure, which it has failed to do here."
    },
    {
      name: "Maneka Gandhi v. Union of India (1978)",
      bench: "7-Judge Bench",
      benchStrength: "7-Judge Constitutional Bench",
      constitutionalImportance: "★★★★★ (Due Process & Natural Justice Landmark)",
      courtroomUsage: "Under the authority of Maneka Gandhi, any administrative procedure that lacks notice and hearing violates natural justice per se.",
      strategicValue: "Key precedent to argue that bypassing prior notice and hearing constitutes absolute procedural invalidity.",
      authorityWeight: "★★★★★ (Highest Binding Authority)",
      ratio: "Any procedure affecting Article 21 rights must be 'fair, just, and reasonable' and cannot be arbitrary, fanciful, or oppressive. Natural justice is a mandatory requirement.",
      why: "Key precedent to argue that bypassing prior notice and hearing constitutes absolute procedural invalidity.",
      usage: "Under the authority of Maneka Gandhi, any administrative procedure that lacks notice and hearing violates natural justice per se."
    },
    {
      name: "E.P. Royappa v. State of Tamil Nadu (1974)",
      bench: "5-Judge Bench",
      benchStrength: "5-Judge Constitutional Bench",
      constitutionalImportance: "★★★★☆ (Article 14 Anti-Arbitrariness Standard)",
      courtroomUsage: "Royappa establishes that state action lacking reasoned guidelines is manifestly arbitrary and violates Article 14.",
      strategicValue: "Provides the legal basis to strike down executive policy decisions that are taken without guidelines or reasons.",
      authorityWeight: "★★★★☆ (Binding Constitutional Bench)",
      ratio: "Equality is a dynamic concept. Manifest arbitrariness in state action is the absolute antithesis of the rule of law under Article 14.",
      why: "Provides the legal basis to strike down executive policy decisions that are taken without guidelines or reasons.",
      usage: "Royappa establishes that state action lacking reasoned guidelines is manifestly arbitrary and violates Article 14."
    }
  ];

  let tabContentHTML = '';
  if (activePackTab === 'speech') {
    tabContentHTML = `
      <div class="flex flex-col gap-4 font-sans">
        <!-- Card 1: Bench Opening -->
        <div class="p-5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md flex flex-col gap-4">
          <div class="flex items-center gap-2 border-b border-white/5 pb-2">
            <span class="text-lg">🎙️</span>
            <h4 class="text-xs uppercase tracking-wider text-moot-accent font-bold">1. Bench Opening (Ready to Speak)</h4>
          </div>
          
          <div class="space-y-3">
            <div class="p-3 bg-black/20 rounded-lg border-l-2 border-indigo-500/30">
              <span class="text-[9px] uppercase tracking-widest text-indigo-400 block font-semibold mb-1">Exact Opening Line</span>
              <p class="text-xs text-white/90 italic font-serif leading-relaxed">"${esc(openingLine)}"</p>
            </div>
            <div class="p-3 bg-black/20 rounded-lg border-l-2 border-indigo-500/30">
              <span class="text-[9px] uppercase tracking-widest text-indigo-400 block font-semibold mb-1">30-Second Opening</span>
              <p class="text-xs text-white/90 italic font-serif leading-relaxed">"${esc(opening30s)}"</p>
            </div>
            <div class="p-3 bg-black/20 rounded-lg border-l-2 border-indigo-500/30">
              <span class="text-[9px] uppercase tracking-widest text-indigo-400 block font-semibold mb-1">60-Second Opening</span>
              <p class="text-xs text-white/90 italic font-serif leading-relaxed">"${esc(opening60s)}"</p>
            </div>
          </div>
        </div>

        <!-- Card 2: Closing Prayer -->
        <div class="p-5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md flex flex-col gap-4">
          <div class="flex items-center gap-2 border-b border-white/5 pb-2">
            <span class="text-lg">🎯</span>
            <h4 class="text-xs uppercase tracking-wider text-moot-accent font-bold">2. Closing Prayer (Relief sought)</h4>
          </div>
          
          <div class="space-y-3">
            <div class="p-3 bg-black/20 rounded-lg border-l-2 border-amber-500/30">
              <span class="text-[9px] uppercase tracking-widest text-amber-400 block font-semibold mb-1">15-Second Closing</span>
              <p class="text-xs text-white/90 italic font-serif leading-relaxed">"${esc(closing15s)}"</p>
            </div>
            <div class="p-3 bg-black/20 rounded-lg border-l-2 border-amber-500/30">
              <span class="text-[9px] uppercase tracking-widest text-amber-400 block font-semibold mb-1">30-Second Closing</span>
              <p class="text-xs text-white/90 italic font-serif leading-relaxed">"${esc(closing30s)}"</p>
            </div>
            <div class="p-3 bg-black/20 rounded-lg border-l-2 border-amber-500/30">
              <span class="text-[9px] uppercase tracking-widest text-amber-400 block font-semibold mb-1">Full Court Room Prayer</span>
              <p class="text-xs text-white/90 italic font-serif leading-relaxed">"${esc(closingFull)}"</p>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (activePackTab === 'submissions') {
    tabContentHTML = `
      <div class="flex flex-col gap-5 font-sans">
        <!-- Submission 1 Card -->
        <div class="p-5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md flex flex-col gap-3">
          <div class="flex justify-between items-center border-b border-white/5 pb-2 mb-1">
            <div class="flex items-center gap-2">
              <span class="text-lg">⚖️</span>
              <h4 class="text-xs uppercase tracking-wider text-moot-accent font-bold">Submission I: Substantive Legality</h4>
            </div>
            <span class="px-2 py-0.5 text-[8px] font-sans font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded uppercase tracking-wider">Primary Ground</span>
          </div>
          
          <div class="space-y-2 text-xs text-white/80">
            <div>
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Issue</span>
              <p class="mt-0.5 text-white/95">${esc(cleanSectionText(iracData.issue || currentIssue, 'issue'))}</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Governing Precedent / Authority</span>
              <p class="mt-0.5 text-white/95 italic font-serif">${isPetitioner ? 'K.S. Puttaswamy v. Union of India (2017)' : 'E.P. Royappa v. State of Tamil Nadu (1974) (State Defense)'}</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Constitutional Rule</span>
              <p class="mt-0.5 text-white/95">${esc(cleanSectionText(iracData.rule || 'Equal protection under Article 14 requires state actions to be free from manifest arbitrariness.', 'rule'))}</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Application to Facts</span>
              <p class="mt-0.5 text-white/95">${esc(cleanSectionText(iracData.application || 'The state action was taken without notice or guidelines, violating Article 14.', 'application'))}</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Relief Prayed</span>
              <p class="mt-0.5 text-white/95">${esc(cleanSectionText(iracData.conclusion || 'Strike down the arbitrary regulatory rule.', 'conclusion'))}</p>
            </div>
          </div>
        </div>

        <!-- Submission 2 Card -->
        <div class="p-5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md flex flex-col gap-3">
          <div class="flex justify-between items-center border-b border-white/5 pb-2 mb-1">
            <div class="flex items-center gap-2">
              <span class="text-lg">🛡️</span>
              <h4 class="text-xs uppercase tracking-wider text-moot-accent font-bold">Submission II: Procedural Fairness</h4>
            </div>
            <span class="px-2 py-0.5 text-[8px] font-sans font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded uppercase tracking-wider">Natural Justice</span>
          </div>
          
          <div class="space-y-2 text-xs text-white/80">
            <div>
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Issue</span>
              <p class="mt-0.5 text-white/95">Whether the procedure adopted by the State violates Article 21 and the principles of natural justice.</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Governing Precedent / Authority</span>
              <p class="mt-0.5 text-white/95 italic font-serif">Maneka Gandhi v. Union of India (1978)</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Constitutional Rule</span>
              <p class="mt-0.5 text-white/95">Any procedure affecting fundamental rights under Article 21 must be fair, just, and reasonable, incorporating prior notice and hearing.</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Application to Facts</span>
              <p class="mt-0.5 text-white/95">${isPetitioner ? 'The State completely bypassed both pre-decisional and post-decisional hearings, causing absolute procedural failure.' : 'Urgent regulatory conditions required immediate public interest measures, which are cured by post-decisional hearings.'}</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Relief Prayed</span>
              <p class="mt-0.5 text-white/95">${isPetitioner ? 'Read down the unilateral power to require prior hearings, or set aside the order.' : 'Uphold the validity of the procedure, directing a post-decisional hearing if deemed necessary.'}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (activePackTab === 'qa') {
    tabContentHTML = `
      <div class="flex flex-col gap-5 font-sans">
        
        <!-- Section 1: Collapsible Questions -->
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2 border-b border-white/5 pb-2">
            <span class="text-lg">❓</span>
            <h4 class="text-xs uppercase tracking-wider text-moot-accent font-bold">1. Top 10 likely judicial questions</h4>
          </div>
          
          <div class="space-y-2 font-sans">
            ${qaList.map((qa, idx) => `
              <details class="group bg-white/5 border border-white/10 rounded-lg transition-all duration-300 overflow-hidden">
                <summary class="flex justify-between items-center p-3 cursor-pointer select-none text-xs font-semibold text-white/90 hover:bg-white/[0.03] font-sans">
                  <span>Q${idx + 1}: ${esc(qa.q)}</span>
                  <span class="text-xs transition-transform duration-300 group-open:rotate-180 text-moot-accent font-sans">▼</span>
                </summary>
                <div class="p-3 bg-black/25 text-xs text-gray-300 leading-relaxed font-serif italic border-t border-white/5">
                  "${esc(qa.a)}"
                </div>
              </details>
            `).join('')}
          </div>
        </div>

        <!-- Section 2: Judicial Traps Warning Cards -->
        <div class="flex flex-col gap-3 mt-2">
          <div class="flex items-center gap-2 border-b border-white/5 pb-2">
            <span class="text-lg">🔥</span>
            <h4 class="text-xs uppercase tracking-wider text-red-400 font-bold">2. Judicial Traps & Escape Routes</h4>
          </div>

          <div class="space-y-3">
            <!-- Trap 1 -->
            <div class="p-4 bg-red-950/10 border border-red-900/30 rounded-xl flex flex-col gap-2">
              <div class="flex justify-between items-center">
                <strong class="text-xs text-red-400 uppercase tracking-wider font-sans">Trap 1: The 'Policy Exception' Trap</strong>
                <span class="px-2 py-0.5 text-[8px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 rounded uppercase tracking-wider font-sans">Danger Level: High</span>
              </div>
              <p class="text-xs text-gray-300 leading-relaxed font-sans">
                <strong class="text-white">Why it is dangerous:</strong> Judges will try to make you agree that policy decisions are completely immune from judicial review, locking you out of your core argument.
              </p>
              <div class="p-2.5 bg-black/35 rounded border-l-2 border-red-500 text-xs italic text-gray-300 font-serif mt-1">
                "With respect, My Lords, this ruling will not affect legitimate policy discretion. It merely reinforces that policy must remain within Part III boundaries. Public trust is enhanced when policy is constitutional."
              </div>
            </div>

            <!-- Trap 2 -->
            <div class="p-4 bg-red-950/10 border border-red-900/30 rounded-xl flex flex-col gap-2">
              <div class="flex justify-between items-center">
                <strong class="text-xs text-red-400 uppercase tracking-wider font-sans">Trap 2: The 'Literal Statutory Wording' Trap</strong>
                <span class="px-2 py-0.5 text-[8px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 rounded uppercase tracking-wider font-sans">Danger Level: Critical</span>
              </div>
              <p class="text-xs text-gray-300 leading-relaxed font-sans">
                <strong class="text-white">Why it is dangerous:</strong> If you agree that statutory wording has absolute supremacy regardless of constitutional rights, you lose your Article 21/14 ground.
              </p>
              <div class="p-2.5 bg-black/35 rounded border-l-2 border-red-500 text-xs italic text-gray-300 font-serif mt-1">
                "My Lords, when a statutory power affects fundamental rights of citizens, the word 'may' is construed as 'shall' to preserve its validity, as held in the landmark case of Delhi Administration v. I.K. Nangia."
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (activePackTab === 'rebuttals') {
    tabContentHTML = `
      <div class="flex flex-col gap-5 font-sans">
        <div class="flex items-center gap-2 border-b border-white/5 pb-2">
          <span class="text-lg">🛡️</span>
          <h4 class="text-xs uppercase tracking-wider text-moot-accent font-bold">Rebuttal War Room</h4>
        </div>

        <div class="space-y-4">
          ${rebuttalsList.map((item, idx) => `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-white/5 border border-white/10 rounded-xl">
              <!-- Opponent Argument Card -->
              <div class="flex flex-col gap-2 border-r border-white/5 pr-3 font-sans">
                <div class="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-red-400 font-bold font-sans">
                  <span>❌</span> Opponent Argument ${idx + 1}
                </div>
                <p class="text-xs text-gray-300 leading-relaxed font-serif italic font-sans">
                  "${esc(item.opponent)}"
                </p>
              </div>
              
              <!-- Your Rebuttal Card -->
              <div class="flex flex-col gap-2 pl-2">
                <div class="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-emerald-400 font-bold font-sans">
                  <span>✔</span> Demolition Rebuttal Strategy
                </div>
                <p class="text-xs text-white/95 leading-relaxed font-sans">
                  ${esc(item.rebuttal)}
                </p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (activePackTab === 'precedents') {
    tabContentHTML = `
      <div class="flex flex-col gap-5 font-sans">
        <div class="flex items-center gap-2 border-b border-white/5 pb-2">
          <span class="text-lg">📖</span>
          <h4 class="text-xs uppercase tracking-wider text-moot-accent font-bold font-sans">Authorities Snapshot</h4>
        </div>

        <div class="flex flex-col gap-3 font-sans">
          <p class="text-xs text-white-muted mb-2 font-sans">Click any precedent chip to expand its Ratio Decidendi, strategic alignment, and courtroom usage.</p>
          
          <div class="flex flex-wrap gap-2 mb-3">
            ${precedentsList.map((p, idx) => `
              <button 
                id="precedent-chip-${idx}" 
                class="px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 hover:border-moot-accent hover:text-white bg-white/5 text-gray-300 transition-all cursor-pointer font-sans"
                onclick="togglePrecedentCard(${idx})"
              >
                ⚖️ ${esc(p.name)}
              </button>
            `).join('')}
          </div>

          <div class="space-y-3">
            ${precedentsList.map((p, idx) => `
              <div 
                id="precedent-card-${idx}" 
                class="precedent-card-detail hidden p-4 bg-white/5 border border-white/10 rounded-xl transition-all duration-300"
              >
                <div class="flex justify-between items-center border-b border-white/5 pb-2 mb-2 font-sans">
                  <strong class="text-xs text-white font-sans">${esc(p.name)}</strong>
                  <span class="text-[9px] font-semibold text-moot-accent uppercase tracking-widest font-sans">${esc(p.bench)}</span>
                </div>

                <!-- Authority Details Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-black/30 border border-white/5 rounded-lg mb-3 text-xs font-sans">
                  <div>
                    <span class="text-white-muted uppercase tracking-wider text-[8px] block font-semibold">Bench Strength</span>
                    <span class="text-white font-medium font-sans">${esc(p.benchStrength || p.bench)}</span>
                  </div>
                  <div>
                    <span class="text-white-muted uppercase tracking-wider text-[8px] block font-semibold">Authority Weight</span>
                    <span class="text-moot-accent font-medium font-sans">${esc(p.authorityWeight || '★★★★★')}</span>
                  </div>
                  <div class="md:col-span-2">
                    <span class="text-white-muted uppercase tracking-wider text-[8px] block font-semibold">Constitutional Importance</span>
                    <span class="text-white font-medium font-sans">${esc(p.constitutionalImportance || 'Critical Landmark')}</span>
                  </div>
                </div>
                
                <div class="space-y-2 text-xs leading-relaxed font-sans">
                  <div>
                    <span class="text-[9px] uppercase tracking-widest text-gray-400 block font-semibold">Ratio Decidendi</span>
                    <p class="text-gray-300 mt-0.5">${esc(p.ratio)}</p>
                  </div>
                  <div class="pt-1">
                    <span class="text-[9px] uppercase tracking-widest text-[#4caf82] block font-semibold">Strategic Value</span>
                    <p class="text-gray-300 mt-0.5">${esc(p.why)}</p>
                  </div>
                  <div class="pt-1">
                    <span class="text-[9px] uppercase tracking-widest text-[#c9a84c] block font-semibold">Courtroom Usage (One-Liner)</span>
                    <p class="text-white italic font-serif mt-0.5">"${esc(p.usage)}"</p>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="flex flex-col gap-4 font-sans">
      <div class="flex border-b border-white/10 overflow-x-auto scrollbar-none mb-2 font-sans">
        ${tabHeadersHTML}
      </div>
      <div class="space-y-4 font-sans">
        ${tabContentHTML}
      </div>
    </div>
  `;

  // Expose switchPackTab to window
  window.switchPackTab = (tabId) => {
    activePackTab = tabId;
    renderOralAdvocacySuite(container);
  };

  // Expose togglePrecedentCard to window
  window.togglePrecedentCard = (idx) => {
    const cards = document.querySelectorAll('.precedent-card-detail');
    const chips = document.querySelectorAll('[id^="precedent-chip-"]');
    
    cards.forEach((card, i) => {
      if (i === idx) {
        card.classList.toggle('hidden');
      } else {
        card.classList.add('hidden');
      }
    });

    chips.forEach((chip, i) => {
      if (i === idx) {
        const isHidden = document.getElementById(`precedent-card-${idx}`).classList.contains('hidden');
        if (isHidden) {
          chip.classList.remove('bg-indigo-500/20', 'border-indigo-500', 'text-white');
          chip.classList.add('bg-white/5', 'border-white/10', 'text-gray-300');
        } else {
          chip.classList.add('bg-indigo-500/20', 'border-indigo-500', 'text-white');
          chip.classList.remove('bg-white/5', 'border-white/10', 'text-gray-300');
        }
      } else {
        chip.classList.remove('bg-indigo-500/20', 'border-indigo-500', 'text-white');
        chip.classList.add('bg-white/5', 'border-white/10', 'text-gray-300');
      }
    });
  };
}

function handlePanelKeyDown(e) {
  if (e.key === 'Escape') {
    closeAuxPanel();
    closeMemorialViewer();
    return;
  }

  if (e.key === 'Tab') {
    const auxPanel = document.getElementById('aux-panel');
    const memPanel = document.getElementById('memorial-panel');
    const panel = (auxPanel && auxPanel.classList.contains('active')) ? auxPanel : memPanel;
    if (!panel) return;

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = panel.querySelectorAll(focusableSelector);
    if (focusables.length === 0) return;

    const firstFocusable = focusables[0];
    const lastFocusable = focusables[focusables.length - 1];

    if (e.shiftKey) { // Shift + Tab
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else { // Tab
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
  }
}

function copyPanelContent() {
  const content = document.getElementById('aux-panel-content');
  if (!content) return;

  const textToCopy = content.innerText;
  navigator.clipboard.writeText(textToCopy).then(() => {
    const btn = document.getElementById('btn-aux-copy');
    if (btn) {
      btn.textContent = '✓ Copied';
      setTimeout(() => {
        btn.textContent = '📋 Copy Content';
      }, 2000);
    }
    showToast("Content copied to clipboard!", "ok");
  }).catch(err => {
    showToast("Failed to copy: " + err.message, "err");
  });
}

function getUpgradedOralNotes(iracData, stance, issue) {
  const isPetitioner = stance.toLowerCase().includes('petitioner') || stance.toLowerCase().includes('appellant');
  const borderCls = isPetitioner ? 'border-indigo-500/30' : 'border-rose-500/30';

  const openingSpeech = isPetitioner 
    ? `"May it please this Honorable Court. My name is Counsel representing the Petitioner in this matter. We stand before this Court to challenge the validity of the impugned state actions concerning <strong>${esc(iracData.issue || issue)}</strong>. We submit two primary submissions: First, that the governing rules and statutory bindings fail the tests of reasonableness and equality under Part III of the Constitution. Second, that the factual application to the Petitioner demonstrates a disproportionate and arbitrary exercise of state power. We pray accordingly."`
    : `"May it please this Honorable Court. My name is Counsel representing the Respondent in this matter. We stand before this Court to oppose the petition in its entirety. The Respondent submits two key contentions: First, that the impugned action/statute enjoys the presumption of constitutionality and falls strictly within the legislative competence of the state. Second, that the restriction imposed is reasonable, proportional, and tailored to meet a legitimate state interest. We pray that this Honorable Court dismiss the petition."`;

  return `
    <div class="flex flex-col gap-5">
      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-2 flex items-center gap-1.5 font-sans">
          <span>🎙️</span> 1. Bench Opening (Ready to Speak)
        </h4>
        <p class="text-xs text-white-muted italic font-serif leading-relaxed bg-black/20 p-3 rounded-lg border-l-2 ${borderCls}">
          ${openingSpeech}
        </p>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>⚖️</span> 2. Core Submissions (Oral Flow)
        </h4>
        <div class="space-y-3 text-xs leading-relaxed text-gray-300 font-sans">
          <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
            <strong class="text-white block mb-1">Contention I: The Legal Foundation (Rule)</strong>
            <span>${fmtInline(iracData.rule || '')}</span>
          </div>
          <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg">
            <strong class="text-white block mb-1">Contention II: Application to Facts</strong>
            <span>${fmtInline(iracData.application || '')}</span>
          </div>
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>❓</span> 3. Likely Bench Questions & Answers
        </h4>
        <div class="space-y-4 text-xs font-sans">
          ${getLikelyBenchQuestionsHTML(isPetitioner)}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>📖</span> 4. Key Precedent Ratios (Memorizer)
        </h4>
        <div class="space-y-3">
          ${getMemorizeAuthoritiesHTML()}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>🔥</span> 5. Judicial Traps & 30-Second Rescue
        </h4>
        <div class="space-y-3 text-xs leading-relaxed text-gray-300 font-sans">
          <div class="p-3 bg-red-950/10 border border-red-900/20 rounded-lg">
            <strong class="text-red-400 block mb-1">⚠️ Potential Trap Alert</strong>
            <span>Judges may query the direct presence of a constitutional breach versus a simple statutory claim. Always steer the bench back to Part III rights: "With respect, My Lords, the statutory breach here is the vehicle through which a fundamental violation of Article 14/21 is manifested."</span>
          </div>
          <div class="p-3 bg-indigo-950/10 border border-indigo-900/20 rounded-lg">
            <strong class="text-indigo-400 block mb-1">⏱️ 30-Second Emergency Rebuttal</strong>
            <span>"In the remaining thirty seconds, Counsel directs this Court's attention to the core question: Can the State run roughshod over procedural fairness under the guise of policy discretion? Maneka Gandhi dictates that any procedure must be fair, just, and reasonable. The current case fails this entirely."</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getLikelyBenchQuestionsHTML(isPetitioner) {
  const qaPairs = isPetitioner ? [
    {
      q: "Counsel, isn't the regulation of this domain purely within the policy discretion of the Executive?",
      a: "Most Respectfully, My Lords, while policy discretion lies with the Executive, its exercise is bounded by constitutional limits. Once an action exceeds those limits or is manifestly arbitrary, this Court is fully empowered—indeed required—to intervene under Article 14, as established in Royappa."
    },
    {
      q: "Why should we bypass the statutory alternative remedies available to your client?",
      a: "It is well-settled by this Court in Whirlpool Corporation v. Registrar of Trade Marks that the existence of an alternative remedy is a rule of discretion and not a bar to jurisdiction, particularly where there is a violation of fundamental rights or principles of natural justice."
    },
    {
      q: "Where is the specific, documented prejudice caused to the Petitioner?",
      a: "The prejudice is immediate and absolute. The state action directly impairs the Petitioner's livelihood and personal liberty without notice or hearing, which is a per se violation of Article 19(1)(g) and Article 21, causing irreparable harm."
    },
    {
      q: "Aren't you asking this Court to act as a court of appeal over administrative policy decisions?",
      a: "Not at all, My Lords. Counsel does not ask this Court to substitute its wisdom for that of the executive, but to review the legality, procedural propriety, and proportionality of the decision-making process under the Wednesbury principle."
    },
    {
      q: "Is there any direct precedent holding this precise rule unconstitutional?",
      a: "While there may not be a factual mirror-image case, the core legal principle is firmly governed by the Constitutional Bench holding in Puttaswamy, which established that any state encroachment on individual rights must pass the strict four-pronged test of proportionality."
    }
  ] : [
    {
      q: "Counsel, how do you justify the apparent lack of notice or hearing before this action was taken?",
      a: "My Lords, the urgency of the situation and the protection of public interest necessitated immediate action. The statute implicitly permits post-decisional hearings, which completely satisfies the requirements of natural justice under these exceptional circumstances."
    },
    {
      q: "Does this action not violate the basic principles of proportionality laid down in Puttaswamy?",
      a: "No, My Lords. The restriction passes the proportionality test: it has a legitimate goal (public welfare), a rational nexus (preventing harm), is necessary as no less restrictive means exist, and the public benefit far outweighs any private inconvenience."
    },
    {
      q: "Is the presumption of constitutionality sufficient to save a provision that is prima facie arbitrary?",
      a: "The provision is not arbitrary. It is a carefully crafted legislative response to a complex socioeconomic issue. The legislature has broad latitude, and the burden remains strictly on the Petitioner to prove unconstitutionality beyond reasonable doubt."
    },
    {
      q: "How can the State argue that this doesn't encroach upon the Petitioner's Article 19(1)(g) rights?",
      a: "Article 19(1)(g) is not absolute. Under Article 19(6), the State is competent to impose reasonable restrictions in the interest of the general public. The restrictions here are fully reasonable and public-interest oriented."
    },
    {
      q: "If this Court strikes down this provision, what is the State's fallback plan?",
      a: "We submit that the provision is constitutional. Striking it down would create a regulatory vacuum, endangering public safety. If the Court finds any ambiguity, we pray that it read down the provision rather than strike it down."
    }
  ];

  return qaPairs.map((pair, idx) => `
    <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg font-sans">
      <strong class="text-[#c9a84c] block mb-1">Q${idx + 1}: ${esc(pair.q)}</strong>
      <span class="text-gray-300 italic font-serif leading-relaxed block mt-1">"${esc(pair.a)}"</span>
    </div>
  `).join('');
}

function getMemorizeAuthoritiesHTML() {
  const cases = [
    {
      name: "K.S. Puttaswamy v. Union of India (2017)",
      ratio: "Right to privacy is protected as an intrinsic part of the right to life and personal liberty under Article 21, subject to a three-fold test of legality, necessity, and proportionality.",
      app: "Apply to show that state surveillance or data collection measures fail the proportionality test and are therefore ultra vires."
    },
    {
      name: "Maneka Gandhi v. Union of India (1978)",
      ratio: "Article 21 procedural requirements must be 'fair, just, and reasonable' and not arbitrary, fanciful, or oppressive. Natural justice is a key component.",
      app: "Use to challenge state actions that bypass notice or hearing requirements as procedurally flawed."
    },
    {
      name: "E.P. Royappa v. State of Tamil Nadu (1974)",
      ratio: "Equality is a dynamic concept. Arbitrariness is the antithesis of Article 14, and administrative action must be based on reason.",
      app: "Deploy to strike down unguided administrative discretion or highly unequal state actions."
    }
  ];

  return cases.map(c => `
    <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs font-sans">
      <strong class="text-white block mb-1">⚖️ ${esc(c.name)}</strong>
      <div class="text-white-muted mt-1"><span class="text-[#c9a84c] font-semibold uppercase text-[9px] tracking-wider font-sans">Ratio Decidendi:</span> ${esc(c.ratio)}</div>
      <div class="text-white-muted mt-1"><span class="text-[#4caf82] font-semibold uppercase text-[9px] tracking-wider font-sans">Advocacy Application:</span> ${esc(c.app)}</div>
    </div>
  `).join('');
}

function getUpgradedRebuttals(iracData, stance) {
  const isPetitioner = stance.toLowerCase().includes('petitioner') || stance.toLowerCase().includes('appellant');
  const oppStance = isPetitioner ? 'Respondent' : 'Petitioner';

  return `
    <div class="flex flex-col gap-5 font-sans">
      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-red-400 font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>⚔️</span> Strongest Opposition Arguments
        </h4>
        <ul class="space-y-2 text-xs text-gray-300 leading-relaxed list-disc pl-4 font-sans">
          <li><strong>Discretionary Privilege:</strong> The State claims administrative policies enjoy a wide latitude of immunity from judicial overreach.</li>
          <li><strong>Factual Distinctions:</strong> ${oppStance} will cite alternative precedents arguing the immediate grievance is a minor, regulatory matter rather than a constitutional crisis.</li>
          <li><strong>Alternative Forum:</strong> Opposing counsel will emphasize the failure to exhaust local, statutory appeal mechanisms.</li>
        </ul>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-emerald-400 font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>🛡️</span> Response Strategy & Demolition
        </h4>
        <div class="space-y-3 text-xs leading-relaxed text-gray-300 font-sans">
          <p><strong>1. Neutralize Discretionary Claims:</strong> Submit that administrative discretion is never absolute. Cite <em>Royappa</em> and <em>Ramana Dayaram Shetty</em> to establish that state actions must conform to reason and fair play.</p>
          <p><strong>2. Counter Factual Distinctions:</strong> Argue that rights violations cannot be trivialized by categorization. Any infringement of Part III, however minor in scope, is a constitutional injury.</p>
          <p><strong>3. Dismiss Forum Objections:</strong> Emphasize that alternate remedies do not oust writ jurisdiction when fundamental rights are violated, natural justice is breached, or proceedings are without jurisdiction.</p>
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-[#c9a84c] font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>🎯</span> Bench Follow-Up Questions
        </h4>
        <div class="space-y-3 text-xs text-gray-300 font-sans">
          <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg font-sans">
            <strong class="text-white block mb-1">Follow-up 1: "Even if we agree with Counsel on the right, does it not fall within reasonable restrictions?"</strong>
            <span class="italic block mt-1 font-serif">Answer: "Most Respectfully, My Lords, it does not. Under Article 19(6) or Article 19(2), restrictions must be reasonable and proportional. A restriction that lacks guidance and operates arbitrarily fails the test of reasonableness per se."</span>
          </div>
          <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg font-sans">
            <strong class="text-white block mb-1">Follow-up 2: "Aren't you inviting this Court to rewrite administrative regulations?"</strong>
            <span class="italic block mt-1 font-serif">Answer: "No, My Lords. We only ask this Court to set aside the unconstitutional provisions, leaving it to the State to enact a new, procedurally fair framework that respects Part III rights."</span>
          </div>
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-indigo-400 font-semibold mb-2 flex items-center gap-1.5 font-sans">
          <span>⚠️</span> Fallback Position (Plan B)
        </h4>
        <p class="text-xs text-gray-300 leading-relaxed bg-black/20 p-3 rounded-lg border-l-2 border-indigo-500/30 font-serif italic">
          "If this Court is not inclined to strike down the impugned provision, Counsel requests that the Court read down the provision to exclude its application to cases where notice and prior hearings are practicable, thereby preserving its constitutionality while vindicating the Petitioner's rights."
        </p>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl bg-red-950/10 border-red-900/30 font-sans">
        <h4 class="text-xs uppercase tracking-wider text-red-400 font-semibold mb-2 flex items-center gap-1.5 font-sans">
          <span>🚨</span> Emergency Rescue Arguments
        </h4>
        <p class="text-xs text-gray-300 leading-relaxed font-serif italic">
          "My Lords, the violation here is not merely technical, but goes to the root of Part III rights. If this court does not intervene, the petitioner faces irreparable injury for which damages are no remedy. The state cannot bypass the rule of law under the banner of convenience."
        </p>
      </div>
    </div>
  `;
}

function getUpgradedCitations(notes) {
  const caseRegex = /\b([A-Z][A-Za-z0-9'\s]{2,})\s+(?:v\.?|v\/s|vs\.?)\s+([A-Z][A-Za-z0-9'\s]{2,})|Union of [A-Z][a-zA-Z\s]+/gi;
  const caseMatches = notes.match(caseRegex) || [];
  const casesCount = caseMatches.length;

  const statuteRegex = /\b(?:Article|Art\.?|Section|Sec\.?)\s+\d+(?:[A-Za-z0-9\-\(\)]*)?/gi;
  const statuteMatches = notes.match(statuteRegex) || [];
  const statutesCount = statuteMatches.length;

  const currentStrength = Math.min(95, 40 + (casesCount * 12) + (statutesCount * 8));
  const potentialStrength = Math.min(98, currentStrength + 20);

  const strengthColor = currentStrength >= 75 ? 'text-[#4caf82]' : currentStrength >= 50 ? 'text-[#c9a84c]' : 'text-red-400';
  const progressColor = currentStrength >= 75 ? 'bg-[#4caf82]' : currentStrength >= 50 ? 'bg-[#c9a84c]' : 'bg-red-500';

  return `
    <div class="flex flex-col gap-5 font-sans">
      <div class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3 font-sans">
        <div class="flex justify-between items-center font-sans">
          <span class="text-xs uppercase tracking-wider text-white-2 font-semibold">Citation Strength Assistant</span>
          <span class="text-xs font-bold ${strengthColor}">Current: ${currentStrength}% | Potential: ${potentialStrength}%</span>
        </div>
        <div class="w-full h-2 bg-navy-5 rounded-full overflow-hidden border border-white/5 font-sans">
          <div class="h-full ${progressColor} transition-all duration-500" style="width: ${currentStrength}%"></div>
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-red-400 font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>❌</span> Missing Authorities
        </h4>
        <div class="space-y-2 text-xs text-gray-300 font-sans">
          <p>• <strong>Administrative Arbitrariness:</strong> No case citing the expansion of Article 14 to procedural arbitrariness. Counsel is highly advised to reference <em>Maneka Gandhi v. Union of India</em>.</p>
          <p>• <strong>Proportionality Test:</strong> Missing reference to the modern four-prong test of proportionality established in <em>Modern Dental College</em>.</p>
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-[#c9a84c] font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>🏛️</span> Constitutional Bench Authorities
        </h4>
        <div class="space-y-2 text-xs text-gray-300 font-sans">
          <p>• <strong>K.S. Puttaswamy v. Union of India (2017) (9-Judge Bench):</strong> Established that privacy is a fundamental right and laid down the strict test of proportionality for any state limitation of Part III rights.</p>
          <p>• <strong>Kesavananda Bharati v. State of Kerala (1973) (13-Judge Bench):</strong> Grounding authority for testing constitutional validity against the basic structure of the constitution.</p>
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-indigo-400 font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>💡</span> Strategic Citations
        </h4>
        <div class="space-y-2 text-xs text-gray-300 font-sans">
          <p>• <strong>Shreya Singhal v. Union of India (2015):</strong> Excellent citation for striking down statutory provisions on grounds of overbreadth and vagueness under Article 19(1)(a).</p>
          <p>• <strong>Whirlpool Corporation v. Registrar of Trade Marks (1998):</strong> Key citation to bypass statutory alternative remedies when fundamental rights are violated.</p>
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl bg-amber-950/10 border-amber-900/30 font-sans">
        <h4 class="text-xs uppercase tracking-wider text-[#c9a84c] font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>⚠️</span> Weakly Supported Claims
        </h4>
        <div class="space-y-2 text-xs text-gray-300 font-sans">
          <p>• The claim that the state regulation lacks 'legitimate purpose' is unsupported. To strengthen, cite <em>State of Madras v. V.G. Row</em> on criteria for testing restrictions.</p>
          <div class="mt-3 text-[10px] text-[#c9a84c] uppercase tracking-widest font-bold font-sans">Authority Impact Score: 8.5 / 10</div>
        </div>
      </div>
    </div>
  `;
}

function getBenchQuestionsPackHTML() {
  const stanceRadio = document.querySelector('input[name="stance"]:checked');
  const stance = stanceRadio ? stanceRadio.value : 'Petitioner';
  const isPetitioner = stance.toLowerCase().includes('petitioner') || stance.toLowerCase().includes('appellant');
  
  return `
    <div class="space-y-4 font-sans">
      <h4 class="text-sm font-semibold text-indigo-400 uppercase tracking-wider mb-1 font-sans">⚖️ Bench Q&A Preparation</h4>
      <p class="text-xs text-white-muted mb-3">Practice these high-probability questions expected from a competitive moot bench.</p>
      ${getLikelyBenchQuestionsHTML(isPetitioner)}
    </div>
  `;
}

function getPrecedentsPackHTML() {
  return `
    <div class="space-y-4 font-sans">
      <h4 class="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-1 font-sans">📖 Key Precedents to Memorize</h4>
      <p class="text-xs text-white-muted mb-3 font-sans">Ensure you have these case citations, ratio, and exact application facts committed to memory.</p>
      ${getMemorizeAuthoritiesHTML()}
    </div>
  `;
}

function getJudicialTrapsPackHTML() {
  return `
    <div class="space-y-4 font-sans">
      <h4 class="text-sm font-semibold text-red-400 uppercase tracking-wider mb-1 font-sans">🔥 Judicial Traps & Escape Routes</h4>
      <p class="text-xs text-white-muted mb-3 font-sans">Be prepared for these typical lines of questioning designed to trigger logical fallacies.</p>
      <div class="p-3 bg-red-950/10 border border-red-900/20 rounded-lg text-xs leading-relaxed text-gray-300 font-sans">
        <strong class="text-red-400 block mb-1">Trap 1: The 'Policy Exception' Trap</strong>
        <span>Judges will ask: "If we rule in your favor, won't we open a floodgate of litigation against executive policy decisions?"</span>
        <span class="block mt-2 italic text-gray-400 font-serif">Rescue Answer: "With respect, My Lords, this ruling will not affect legitimate policy discretion. It merely reinforces that policy must remain within Part III boundaries. Public trust is enhanced when policy is constitutional."</span>
      </div>
      <div class="p-3 bg-red-950/10 border border-red-900/20 rounded-lg text-xs leading-relaxed text-gray-300 mt-3 font-sans">
        <strong class="text-red-400 block mb-1 font-sans">Trap 2: The 'Literal Statutory Wording' Trap</strong>
        <span>Judges will argue: "The statute reads 'may' or 'has discretion'—why are you arguing that it imposes a mandatory duty of notice?"</span>
        <span class="block mt-2 italic text-gray-400 font-serif">Rescue Answer: "My Lords, when a statutory power affects fundamental rights of citizens, the word 'may' is construed as 'shall' to preserve its validity, as held in the landmark case of Delhi Administration v. I.K. Nangia."</span>
      </div>
    </div>
  `;
}
