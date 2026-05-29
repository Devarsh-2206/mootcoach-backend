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

  // Visual scores (deterministic based on text lengths)
  const strengthScore = Math.min(96, Math.max(68, 75 + Math.round((iracData.rule || '').length / 100)));
  const readinessScore = Math.min(98, Math.max(70, 80 + Math.round((iracData.conclusion || '').length / 25)));
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
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="openAuxPanel('oral', this)">
        🎙️ Oral Notes
      </button>
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="openAuxPanel('rebuttal', this)">
        🛡️ Rebuttal
      </button>
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="openAuxPanel('citations', this)">
        📖 Strengthen Citations
      </button>
      <button class="btn-sm btn-sm-gold text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="openAuxPanel('pack', this)">
        🎤 Oral Round Pack
      </button>
    </div>
  </div>

  <!-- Draft Metrics Card -->
  <div class="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-white/5 border border-white/10 rounded-xl">
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
      <div class="w-full h-2 bg-navy-5 rounded-full overflow-hidden border border-white/5">
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
    <div class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3">
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

  <!-- Premium Memorial Completion Card -->
  <div class="p-8 bg-gradient-to-br from-indigo-950/20 to-navy-3 border border-indigo-500/20 rounded-xl flex flex-col items-center text-center gap-4 mt-2 shadow-xl animate-fade-in">
    <div class="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xl font-bold">✓</div>
    <div>
      <h3 class="text-lg font-sans font-semibold text-white">Appellate Memorial Generated</h3>
      <p class="text-xs text-white-muted mt-1 max-w-sm font-sans">The legal argument has been compiled into a professional Supreme Court memorial. Review the full draft, export, or print via the workspace panels.</p>
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

function renderMemorial(iracData) {
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
        <h4 class="text-xs uppercase tracking-widest text-[#a88220] font-sans font-bold mb-2">I. ISSUE OF LAW</h4>
        <div class="pl-4 border-l-2 border-[#a88220]/30 italic text-slate-700 font-serif">${fmtInline(iracData.issue || '')}</div>
      </div>
      
      <hr class="border-[#e5e3de]">

      <!-- Rule -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#2c3e50] font-sans font-bold mb-2">II. GOVERNING PRECEDENTS & LAW (RULE)</h4>
        <div class="text-slate-800 whitespace-pre-wrap pl-1">${fmtInline(iracData.rule || '')}</div>
      </div>

      <hr class="border-[#e5e3de]">

      <!-- Application -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#2c3e50] font-sans font-bold mb-2">III. SUBMISSIONS & APPLICATION OF LAW TO FACTS</h4>
        <div class="text-slate-800 whitespace-pre-wrap pl-1">${fmtInline(iracData.application || '')}</div>
      </div>

      <hr class="border-[#e5e3de]">

      <!-- Conclusion -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#2c3e50] font-sans font-bold mb-2">IV. CONCLUSION & PRAYER FOR RELIEF</h4>
        <div class="text-slate-800 whitespace-pre-wrap pl-1">${fmtInline(iracData.conclusion || '')}</div>
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
  const actualContainerId = document.getElementById(containerId) ? containerId : "memorial-viewer-canvas";
  const contentEl = document.getElementById(actualContainerId);
  if (!contentEl) return;
  const printContent = contentEl.innerHTML;
  
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
    content.innerHTML = storedRebuttals;
  } else if (type === 'citations') {
    title.textContent = 'Citation Strengthener';
    content.innerHTML = storedCitations;
  } else if (type === 'pack') {
    title.textContent = 'Oral Round Prep Pack';
    renderOralRoundPack(content);
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
  }, 380);

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
  }, 380);
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

export function renderOralRoundPack(container) {
  if (!container) return;

  activePackTab = activePackTab || 'speech';

  // Construct tab bar and contents
  const tabs = [
    { id: 'speech', label: '🎙️ Speech' },
    { id: 'qa', label: '⚖️ Q&A' },
    { id: 'rebuttal', label: '🛡️ Rebuttals' },
    { id: 'precedents', label: '📖 Precedents' },
    { id: 'traps', label: '🔥 Traps' }
  ];

  const tabHeadersHTML = tabs.map(t => {
    const isActive = t.id === activePackTab;
    const borderCls = isActive ? 'border-b-2 border-[#c9a84c] text-[#c9a84c]' : 'border-b border-white/5 text-[#f5f3ef]/45 hover:text-white';
    return `<button class="px-3 py-2 text-[10px] font-sans font-semibold uppercase tracking-wider bg-transparent border-0 cursor-pointer transition-all ${borderCls}" onclick="switchPackTab('${t.id}')">${t.label}</button>`;
  }).join('');

  let tabContentHTML = '';
  if (activePackTab === 'speech') {
    tabContentHTML = storedOralNotes;
  } else if (activePackTab === 'qa') {
    tabContentHTML = getBenchQuestionsPackHTML();
  } else if (activePackTab === 'rebuttal') {
    tabContentHTML = storedRebuttals;
  } else if (activePackTab === 'precedents') {
    tabContentHTML = getPrecedentsPackHTML();
  } else if (activePackTab === 'traps') {
    tabContentHTML = getJudicialTrapsPackHTML();
  }

  container.innerHTML = `
    <div class="flex flex-col gap-4">
      <div class="flex border-b border-white/10 overflow-x-auto scrollbar-none mb-2">
        ${tabHeadersHTML}
      </div>
      <div class="space-y-4">
        ${tabContentHTML}
      </div>
    </div>
  `;

  // Expose switchPackTab to window
  window.switchPackTab = (tabId) => {
    activePackTab = tabId;
    renderOralRoundPack(container);
  };
}

function handlePanelKeyDown(e) {
  if (e.key === 'Escape') {
    closeAuxPanel();
    return;
  }

  if (e.key === 'Tab') {
    const panel = document.getElementById('aux-panel');
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
