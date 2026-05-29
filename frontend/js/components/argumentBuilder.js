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
let activeTriggerElement = null;

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

  // Bind close panel listeners
  const closeBtn = document.getElementById('aux-panel-close-btn');
  const overlay = document.getElementById('aux-panel-overlay');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAuxPanel);
  }
  if (overlay) {
    overlay.addEventListener('click', closeAuxPanel);
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

  const notes = document.getElementById('builder-notes-input')?.value || '';
  
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

  // Extract and store formatted HTML for the side panel suggestions
  storedOralNotes = `
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-indigo-400 uppercase tracking-wider font-sans mb-2">🎙️ Oral Advocacy Notes</h4>
      <div class="text-xs text-gray-300 whitespace-pre-wrap font-sans bg-white/[0.02] p-4 border border-white/5 rounded-lg leading-relaxed">${getOralNotesContent()}</div>
    </div>
  `;
  storedRebuttals = `
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-red-400 uppercase tracking-wider font-sans mb-2">🛡️ Rebuttal Notes</h4>
      <div class="text-xs text-gray-300 whitespace-pre-wrap font-sans bg-white/[0.02] p-4 border border-white/5 rounded-lg leading-relaxed">${getRebuttalNotesContent()}</div>
    </div>
  `;
  storedCitations = `
    <div class="space-y-4">
      <h4 class="text-sm font-semibold text-amber-400 uppercase tracking-wider font-sans mb-2">📖 Citation Strengthener</h4>
      <div class="text-xs text-gray-300 whitespace-pre-wrap font-sans bg-white/[0.02] p-4 border border-white/5 rounded-lg leading-relaxed">${getCitationStrengthenerContent()}</div>
    </div>
  `;

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
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="exportDraftPDF()">
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

  <!-- Premium Legal Document Canvas -->
  <div class="flex-1 bg-[#fcfbfa] border border-[#dcdad5] rounded-xl shadow-xl overflow-hidden min-h-[400px] flex flex-col text-slate-800">
    <!-- Legal Page Header -->
    <div class="border-b border-[#ecebe7] bg-[#f9f8f4] py-3 px-6 flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-500 font-sans font-medium">
      <span>BEFORE THE SUPREME COURT OF APPRENTICE ADVOCACY</span>
      <span>MEMORIAL SUBMISSION</span>
    </div>
    
    <!-- Legal Document Content Area -->
    <div class="p-8 md:p-12 flex-1 flex flex-col gap-6 font-serif text-[14px] leading-relaxed text-slate-800" id="legal-memorial-canvas">
      
      <!-- Issue -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#a88220] font-sans font-bold mb-2">I. ISSUE OF LAW</h4>
        <div class="pl-4 border-l-2 border-[#a88220]/30 italic text-slate-700 font-serif" id="builder-irac-issue">${fmtInline(iracData.issue || '')}</div>
      </div>
      
      <hr class="border-[#e5e3de]">

      <!-- Rule -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#2c3e50] font-sans font-bold mb-2">II. GOVERNING PRECEDENTS & LAW (RULE)</h4>
        <div class="text-slate-800 whitespace-pre-wrap pl-1" id="builder-irac-rule">${fmtInline(iracData.rule || '')}</div>
      </div>

      <hr class="border-[#e5e3de]">

      <!-- Application -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#2c3e50] font-sans font-bold mb-2">III. SUBMISSIONS & APPLICATION OF LAW TO FACTS</h4>
        <div class="text-slate-800 whitespace-pre-wrap pl-1" id="builder-irac-application">${fmtInline(iracData.application || '')}</div>
      </div>

      <hr class="border-[#e5e3de]">

      <!-- Conclusion -->
      <div>
        <h4 class="text-xs uppercase tracking-widest text-[#2c3e50] font-sans font-bold mb-2">IV. CONCLUSION & PRAYER FOR RELIEF</h4>
        <div class="text-slate-800 whitespace-pre-wrap pl-1" id="builder-irac-conclusion">${fmtInline(iracData.conclusion || '')}</div>
      </div>
      
    </div>

    <!-- Legal Page Footer -->
    <div class="border-t border-[#ecebe7] bg-[#f9f8f4] py-3 px-6 flex justify-between items-center text-[10px] text-slate-500 font-sans">
      <span>Appellate Drafting Studio · MootCoach AI</span>
      <span>PAGE 1</span>
    </div>
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
    showToast(export function exportDraftPDF(containerId = "legal-memorial-canvas") {
  console.log(`[DEBUG AUDIT] Exporting ${containerId} as PDF...`);
  const contentEl = document.getElementById(containerId);
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
  }

  // Open the panel
  overlay.classList.remove('hidden');
  // force reflow
  overlay.offsetHeight;
  overlay.classList.add('opacity-100');
  panel.classList.remove('translate-x-full');
  panel.classList.add('translate-x-0');

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

  overlay.classList.remove('opacity-100');
  panel.classList.remove('translate-x-0');
  panel.classList.add('translate-x-full');

  document.removeEventListener('keydown', handlePanelKeyDown);

  // Hide overlay after transition
  setTimeout(() => {
    if (!panel.classList.contains('translate-x-0')) {
      overlay.classList.add('hidden');
    }
  }, 300);

  // Restore focus
  if (activeTriggerElement && typeof activeTriggerElement.focus === 'function') {
    activeTriggerElement.focus();
  }
  activeTriggerElement = null;
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

function getOralNotesContent() {
  return `=== SUGGESTED ORAL ROUND OUTLINE ===

1. FORMAL OPENING (0:00 - 1:30):
   "May it please this Court. My name is Counsel for the Petitioner. We raise one core constitutional issue today..."

2. STATEMENT OF THE ISSUE (1:30 - 3:00):
   Direct the Bench's attention to the conflict between the impugned provision and fundamental rights under Article 14/19/21.

3. ARGUMENT SUBMISSION (3:00 - 12:00):
   • Premise I: Focus heavily on the rule of law syllogism.
   • Premise II: Apply the test of proportionality to demonstrate the overbreadth of the state restriction.

4. CONCLUSION & PRAYER (12:00 - 15:00):
   Request that this Court strike down the provision and grant appropriate consequential relief.`;
}

function getRebuttalNotesContent() {
  return `=== DRAFT REBUTTAL ARGUMENTS ===

1. REBUTTING STANDING CHALLENGES:
   "The opposition asserts a lack of locus standi. However, under the doctrine of representative standing established in S.P. Gupta v. Union of India, public interest litigation is maintainable when fundamental rights of marginalized classes are systematically abridged."

2. REBUTTING THE PRESUMPTION OF CONSTITUTIONALITY:
   "While the State claims a presumption of constitutionality, that presumption is rebutted once a prima facie violation of a fundamental right is established. The burden then shifts to the State to justify the restriction under Article 19(2)-(6)."

3. REBUTTING LEGISLATIVE COMPETENCE ARGS:
   "The competence of the legislature cannot shield a statute from judicial review if its application violates Part III rights. Procedural correctness does not cure substantive unconstitutionality."`;
}

function getCitationStrengthenerContent() {
  return `=== SUGGESTED PRECEDENT ENHANCEMENTS ===

• TO STRENGTHEN RULE OF LAW CLAIMS:
  Cite 'E.P. Royappa v. State of Tamil Nadu' (1974) to argue against arbitrariness as the antithesis of Article 14.

• TO STRENGTHEN PROPORTIONALITY CLAIMS:
  Cite 'Modern Dental College v. State of M.P.' (2016) or 'K.S. Puttaswamy v. Union of India' (2017) to ground the four-pronged test of proportionality.

• TO STRENGTHEN DUAL-CLASSIFICATION CLAIMS:
  Cite 'State of West Bengal v. Anwar Ali Sarkar' (1952) to reinforce the requirements of intelligible differentia and rational nexus.`;
}
