import { buildArgument } from '../services/api.js';
import { 
  currentPropositionContext,
  lastAnalysis, 
  showToast, 
  fmtInline, 
  esc 
} from './ui.js';

// Argument Builder State
export let selectedAuthorities = [];
export let lastBuiltArgument = null;
export let builtArgumentSide = 'Petitioner';

// Unified Shared Authority Registry for all workflow modules
export const SHARED_AUTHORITY_REGISTRY = {
  "Issue 1": {
    "Petitioner": [
      {
        name: "Whirlpool Corp. v. Registrar of Trade Marks (1998)",
        display: "Whirlpool Corp. (Writ Jurisdiction & Alternative Remedies)",
        ratio: "Writ petitions are maintainable under Article 226 despite alternative remedies if fundamental rights are breached, natural justice is violated, or proceedings are ultra vires.",
        section: "Article 226 maintainability",
        priority: "Tier 1",
        badge: "Mandatory",
        stars: "★★★★★",
        principles: ["Writ Maintainability", "Alternative Remedies", "Natural Justice"],
        whyItMatters: "Governing authority for bypass of statutory alternative remedies when fundamental rights are breached."
      },
      {
        name: "L. Chandra Kumar v. Union of India (1997)",
        display: "L. Chandra Kumar (Judicial Review Basic Structure)",
        ratio: "Judicial review of legislative actions by high courts and the Supreme Court is an essential and integral part of the basic structure of the Constitution.",
        section: "Article 32/226 basic structure",
        priority: "Tier 1",
        badge: "Mandatory",
        stars: "★★★★★",
        principles: ["Judicial Review", "Basic Structure", "Writ Jurisdiction"],
        whyItMatters: "Establishes that the power of judicial review under Articles 226 and 32 is part of the basic structure of the Constitution."
      }
    ],
    "Respondent": [
      {
        name: "E.P. Royappa v. State of Tamil Nadu (1974)",
        display: "E.P. Royappa (Policy Discretion Non-Interference)",
        ratio: "Writ courts must exercise self-restraint and avoid acting as a court of appeal over executive policy and administrative decisions.",
        section: "Policy latitude",
        priority: "Tier 2",
        badge: "Strongly Recommended",
        stars: "★★★★☆",
        principles: ["Article 14", "Policy Discretion", "Judicial Restraint"],
        whyItMatters: "Governs administrative discretion, arguing that courts must defer to the executive's specialized policy decisions."
      },
      {
        name: "State of U.P. v. Mohammad Nooh (1958)",
        display: "State of U.P. v. Mohammad Nooh (Writ Restraint Rule)",
        ratio: "Existence of an alternative statutory remedy is a highly persuasive rule of administrative discretion against issuing writ remedies.",
        section: "Alternative remedy bar",
        priority: "Tier 3",
        badge: "Optional",
        stars: "★★★☆☆",
        principles: ["Alternative Remedy", "Writ Restraint", "Procedural Bar"],
        whyItMatters: "Key authority for state argument that alternative statutory remedies must be exhausted first."
      }
    ]
  },
  "Issue 2": {
    "Petitioner": [
      {
        name: "E.P. Royappa v. State of Tamil Nadu (1974)",
        display: "E.P. Royappa (Manifest Arbitrariness Standard)",
        ratio: "Equality is a dynamic concept. State action that is arbitrary, irrational, or lacks a logical base violates Article 14.",
        section: "Article 14 arbitrary test",
        priority: "Tier 2",
        badge: "Strongly Recommended",
        stars: "★★★★☆",
        principles: ["Article 14", "Manifest Arbitrariness", "Equality"],
        whyItMatters: "Foundational case establishing that state action violating Article 14 must not be arbitrary."
      },
      {
        name: "Shayara Bano v. Union of India (2017)",
        display: "Shayara Bano (Legislative Arbitrariness)",
        ratio: "A legislative provision is unconstitutional under Article 14 if it is manifestly arbitrary, excessive, disproportionate, or capricious.",
        section: "Manifest arbitrariness test",
        priority: "Tier 2",
        badge: "Strongly Recommended",
        stars: "★★★★☆",
        principles: ["Article 14", "Legislative Arbitrariness", "Gender Equality"],
        whyItMatters: "Extends Royappa's standard to strike down primary and secondary legislation."
      }
    ],
    "Respondent": [
      {
        name: "State of Madras v. V.G. Row (1952)",
        display: "V.G. Row (Presumption of Legislative Validity)",
        ratio: "Statutes enjoy a strong presumption of constitutionality. Restrictions are evaluated based on the nature of the evil and public interest urgency.",
        section: "Article 19 reasonable restrictions",
        priority: "Tier 2",
        badge: "Strongly Recommended",
        stars: "★★★★☆",
        principles: ["Article 19", "Reasonable Restrictions", "Public Interest"],
        whyItMatters: "Governs evaluation of reasonable restrictions under Article 19, showing deference to state restrictions in public interest."
      },
      {
        name: "R.K. Garg v. Union of India (1981)",
        display: "R.K. Garg (Administrative Latitude in complex laws)",
        ratio: "The legislature has wide latitude and flexibility in economic, social, or administrative matters; laws must not be judged by soft standards.",
        section: "Presumption of validity",
        priority: "Tier 3",
        badge: "Optional",
        stars: "★★★☆☆",
        principles: ["Presumption of Validity", "Economic Policy", "Administrative Latitude"],
        whyItMatters: "Strong case for the state defending regulations in complex, socio-economic, or technical domains."
      }
    ]
  },
  "Issue 3": {
    "Petitioner": [
      {
        name: "Anuradha Bhasin v. Union of India (2020)",
        display: "Anuradha Bhasin (Internet Shutdown & Proportionality)",
        ratio: "Access to the internet is a fundamental right under Article 19(1)(a)/(g). Shutdown orders must satisfy strict proportionality and necessity tests.",
        section: "Article 19 internet right",
        priority: "Tier 1",
        badge: "Mandatory",
        stars: "★★★★★",
        principles: ["Article 19", "Internet Access", "Proportionality", "Freedom of Speech"],
        whyItMatters: "Applies proportionality analysis to technology shutdowns and digital censorship by the State."
      },
      {
        name: "Shreya Singhal v. Union of India (2015)",
        display: "Shreya Singhal (Speech Overbreadth & Vagueness)",
        ratio: "Restrictions on Article 19(1)(a) must be narrowly tailored and cannot be vague, overbroad, or chill legitimate speech.",
        section: "Article 19 overbreadth",
        priority: "Tier 2",
        badge: "Strongly Recommended",
        stars: "★★★★☆",
        principles: ["Article 19(1)(a)", "Overbreadth", "Vagueness", "Chilling Effect"],
        whyItMatters: "Critical for challenges targeting digital censorship, algorithmic filtration, or vague statutory restrictions."
      },
      {
        name: "K.S. Puttaswamy v. Union of India (2017)",
        display: "K.S. Puttaswamy (Right to Privacy & Proportionality)",
        ratio: "Privacy is a fundamental right under Article 21. Any state restriction on privacy must satisfy a four-fold proportionality test.",
        section: "Article 21 privacy balancing",
        priority: "Tier 1",
        badge: "Mandatory",
        stars: "★★★★★",
        principles: ["Article 21", "Privacy", "Informational Autonomy", "Proportionality"],
        whyItMatters: "Primary constitutional authority for challenges involving state collection, profiling and processing of personal data."
      },
      {
        name: "Maneka Gandhi v. Union of India (1978)",
        display: "Maneka Gandhi (Fair Procedure & Natural Justice)",
        ratio: "Any procedure affecting life or personal liberty under Article 21 must be fair, just, and reasonable, incorporating prior notice and hearing.",
        section: "Article 21 procedural due process",
        priority: "Tier 1",
        badge: "Mandatory",
        stars: "★★★★★",
        principles: ["Article 21", "Procedural Due Process", "Natural Justice", "Post-Decisional Hearing"],
        whyItMatters: "Establishes that any administrative action affecting Article 21 rights must be procedurally fair, just, and reasonable."
      }
    ],
    "Respondent": [
      {
        name: "Modern Dental College v. State of Madhya Pradesh (2016)",
        display: "Modern Dental College (Proportionality Balancing Test)",
        ratio: "Restrictions are valid under Article 19(2)-(6) if they serve a legitimate aim, are suitable, necessary, and strike a fair balance.",
        section: "Proportionality balancing",
        priority: "Tier 1",
        badge: "Mandatory",
        stars: "★★★★★",
        principles: ["Proportionality Balancing", "Reasonable Restrictions", "Public Welfare"],
        whyItMatters: "Framework for state defenses justifying restrictions on trade and privacy for public interest."
      },
      {
        name: "PUCL v. Union of India (1997)",
        display: "PUCL (Public Safety Communication Restrictions)",
        ratio: "The State can temporarily restrict or intercept communications under Article 19(2) to prevent public disorder or protect public safety.",
        section: "Article 19 public order exceptions",
        priority: "Tier 2",
        badge: "Strongly Recommended",
        stars: "★★★★☆",
        principles: ["Public Safety", "Communication Interception", "Privacy Safeguards"],
        whyItMatters: "Governs telephone tapping and communication surveillance, outlining the guidelines for security intercepts."
      },
      {
        name: "Babulal Parate v. State of Maharashtra (1961)",
        display: "Babulal Parate (Preventive Threat Discretion)",
        ratio: "Executive has discretion to take preventive measures when there is a reasonable apprehension of breach of public order.",
        section: "Public order jurisprudence",
        priority: "Tier 3",
        badge: "Optional",
        stars: "★★★☆☆",
        principles: ["Public Order", "Preventive Measures", "Executive Discretion"],
        whyItMatters: "Key precedent for executive power to restrict movement or speech preventatively based on public order threats."
      },
      {
        name: "Maneka Gandhi v. Union of India (1978)",
        display: "Maneka Gandhi (Post-Decisional Hearing Validity)",
        ratio: "Procedural fairness is flexible; a post-decisional hearing cures the lack of prior notice in situations of public safety or urgency.",
        section: "Post-decisional hearing validity",
        priority: "Tier 1",
        badge: "Mandatory",
        stars: "★★★★★",
        principles: ["Article 21", "Procedural Due Process", "Natural Justice", "Post-Decisional Hearing"],
        whyItMatters: "Establishes that in matters of public safety or urgency, post-decisional hearings satisfy Article 21 due process."
      }
    ]
  },
  "Issue 4": {
    "Petitioner": [
      {
        name: "Nilabati Behera v. State of Orissa (1993)",
        display: "Nilabati Behera (Monetary Compensation Remedy)",
        ratio: "Writ courts can award monetary compensation under public law as a remedy for breach of fundamental rights by state action.",
        section: "Public law compensation",
        priority: "Tier 2",
        badge: "Strongly Recommended",
        stars: "★★★★☆",
        principles: ["Public Law Remedy", "Sovereign Immunity Exception", "Monetary Compensation"],
        whyItMatters: "Establishes public law compensation as a constitutional remedy for state violations of fundamental rights."
      },
      {
        name: "D.K. Basu v. State of West Bengal (1997)",
        display: "D.K. Basu (Writ Court Directives & Guidelines)",
        ratio: "Writ courts have broad powers to issue binding guidelines and directions to executive authorities to protect fundamental rights.",
        section: "Custodial guidelines",
        priority: "Tier 1",
        badge: "Mandatory",
        stars: "★★★★★",
        principles: ["Writ Directives", "Custodial Violence", "Procedural Safeguards"],
        whyItMatters: "Authority for writ courts issuing detailed guidelines to restrict arbitrary police and executive arrest/detention powers."
      }
    ],
    "Respondent": [
      {
        name: "State of Gujarat v. Shantilal Mangaldas (1969)",
        display: "Shantilal Mangaldas (Writ Damages Restraint)",
        ratio: "Public law remedies should not be used to bypass civil court procedures for assessing financial damages.",
        section: "Damages jurisdiction",
        priority: "Tier 3",
        badge: "Optional",
        stars: "★★★☆☆",
        principles: ["Damages Jurisdiction", "Civil Procedure", "Writ Restraint"],
        whyItMatters: "Precedent used to argue that damages claims should be resolved in civil courts, not writ proceedings."
      },
      {
        name: "Common Cause v. Union of India (1999)",
        display: "Common Cause (Exemplary Damages Restraint)",
        ratio: "Exemplary or punitive damages against government authorities should be awarded with high restraint and only in cases of clear malice.",
        section: "Damages threshold",
        priority: "Tier 3",
        badge: "Optional",
        stars: "★★★☆☆",
        principles: ["Exemplary Damages", "Tortious Liability", "State Malice"],
        whyItMatters: "Limits punitive damages against state officials to cases showing active, proven malice."
      }
    ]
  }
};;

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
let activeAuxType = null;

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
    validateDraftForm();
    updateLiveIntelligence(notesInput.value);
    renderPreDraftAuthorities();
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
  window.renderPreDraftAuthorities = renderPreDraftAuthorities;
  window.toggleAuthority = toggleAuthority;
  window.renderStage3Workspace = renderStage3Workspace;

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
      exportAsPDF('active-aux');
    });
  }

  const memorialCopyBtn = document.getElementById('btn-memorial-copy');
  if (memorialCopyBtn) {
    memorialCopyBtn.addEventListener('click', copyMemorial);
  }
  const memorialPrintBtn = document.getElementById('btn-memorial-print');
  if (memorialPrintBtn) {
    memorialPrintBtn.addEventListener('click', () => {
      exportAsPDF('memorial');
    });
  }

  // Disable copy/print buttons initially until argument is built
  const setButtonsState = (disabled, reason = "") => {
    const btns = [
      document.getElementById('btn-aux-copy'),
      document.getElementById('btn-aux-print'),
      document.getElementById('btn-memorial-copy'),
      document.getElementById('btn-memorial-print')
    ];
    btns.forEach(btn => {
      if (btn) {
        btn.disabled = disabled;
        btn.title = disabled ? reason : "";
      }
    });
  };
  setButtonsState(true, "Generate a submission first to enable this action.");
  window.setBuilderButtonsState = setButtonsState;

  // Bind stance radio change event listener to track selectedSide and re-render pre-draft chips
  const stanceRadios = document.querySelectorAll('input[name="stance"]');
  stanceRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      selectedSide = radio.value;
      selectedAuthorities.length = 0; // Reset selected authorities when stance changes
      validateDraftForm();
      renderPreDraftAuthorities();
    });
  });

  // Bind issue select change event
  const issueSelect = document.getElementById('builder-issue-select');
  if (issueSelect) {
    issueSelect.addEventListener('change', () => {
      selectedAuthorities.length = 0; // Reset selected authorities when issue changes
      validateDraftForm();
      renderPreDraftAuthorities();
    });
  }

  // Initial render of pre-draft authorities
  setTimeout(() => {
    renderPreDraftAuthorities();
  }, 100);
}

function extractAuthorities(text) {
  if (!text) return { cases: [], statutes: [], casesCount: 0, statutesCount: 0 };
  
  const caseRegex = /\b([A-Z][A-Za-z0-9'\s]{2,})\s+(?:v\.?|v\/s|vs\.?)\s+([A-Z][A-Za-z0-9'\s]{2,})|Union of [A-Z][a-zA-Z\s]+/gi;
  const statuteRegex = /\b(?:Article|Art\.?|Section|Sec\.?)\s+\d+(?:[A-Za-z0-9\-\(\)]*)?/gi;
  
  let caseMatches = text.match(caseRegex) || [];
  const statuteMatches = text.match(statuteRegex) || [];
  
  // Dynamically extract landmark names from SHARED_AUTHORITY_REGISTRY to unify scanners
  const landmarkCases = ["puttaswamy", "maneka gandhi", "royappa", "shreya singhal", "anuradha bhasin", "pucl", "kesavananda", "whirlpool", "modern dental", "l. chandra kumar", "r.k. garg", "babulal parate", "nilabati behera", "d.k. basu", "shantilal mangaldas", "common cause"];
  for (const issue in SHARED_AUTHORITY_REGISTRY) {
    for (const stance in SHARED_AUTHORITY_REGISTRY[issue]) {
      SHARED_AUTHORITY_REGISTRY[issue][stance].forEach(auth => {
        const namePart = auth.name.split(' v. ')[0].split(' vs. ')[0].split(' v/s ')[0].trim().toLowerCase();
        landmarkCases.push(namePart);
        landmarkCases.push(auth.name.toLowerCase());
        const firstWord = namePart.split(' ')[0].replace(/[^a-zA-Z]/g, '');
        if (firstWord.length > 3) {
          landmarkCases.push(firstWord);
        }
      });
    }
  }

  const uniqueLandmarks = Array.from(new Set(landmarkCases));
  uniqueLandmarks.forEach(name => {
    const regex = new RegExp(`\\b${name}\\b`, 'gi');
    if (regex.test(text)) {
      const alreadyMatched = caseMatches.some(m => m.toLowerCase().includes(name));
      if (!alreadyMatched) {
        caseMatches.push(name);
      }
    }
  });
  
  const uniqueCases = Array.from(new Set(caseMatches.map(c => c.trim().toLowerCase()))).map(c => {
    return c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  });
  
  const uniqueStatutes = Array.from(new Set(statuteMatches.map(s => {
    let val = s.trim();
    if (val.toLowerCase().startsWith('art.') || val.toLowerCase().startsWith('art ')) {
      val = 'Article ' + val.substring(val.indexOf(' ') + 1);
    } else if (val.toLowerCase().startsWith('sec.') || val.toLowerCase().startsWith('sec ')) {
      val = 'Section ' + val.substring(val.indexOf(' ') + 1);
    }
    return val;
  })));
  
  return {
    cases: uniqueCases,
    statutes: uniqueStatutes,
    casesCount: uniqueCases.length,
    statutesCount: uniqueStatutes.length
  };
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
    
    // Reset dashboard elements too
    const metricAuthEl = document.getElementById('metric-authorities');
    const metricArtEl = document.getElementById('metric-articles');
    const strengthScoreValEl = document.getElementById('strength-score-val');
    const strengthProgressBarEl = document.getElementById('strength-progress-bar');
    if (metricAuthEl) metricAuthEl.textContent = '0';
    if (metricArtEl) metricArtEl.textContent = '0';
    if (strengthScoreValEl) strengthScoreValEl.textContent = '0%';
    if (strengthProgressBarEl) strengthProgressBarEl.style.width = '0%';
    return;
  }

  const { cases, statutes, casesCount, statutesCount } = extractAuthorities(text);

  // Update counts in live intelligence panel
  casesCountEl.textContent = casesCount.toString();
  statutesCountEl.textContent = statutesCount.toString();

  // Deduplicate and render pills
  const uniquePills = [...cases, ...statutes];

  if (uniquePills.length > 0) {
    hintEl.style.display = 'none';
    pillsContainer.innerHTML = uniquePills.slice(0, 12).map(pill => {
      const isCase = cases.includes(pill) || pill.toLowerCase().includes('v.') || pill.toLowerCase().includes('union') || pill.toLowerCase().includes('state');
      const bgCls = isCase ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20';
      return `<span class="px-2 py-0.5 rounded text-[10px] font-sans font-medium tracking-wide uppercase ${bgCls}">${esc(pill)}</span>`;
    }).join('');
  } else {
    pillsContainer.innerHTML = '';
    hintEl.style.display = 'block';
  }

  // Update counts in main workspace dashboard if they exist
  const metricAuthEl = document.getElementById('metric-authorities');
  const metricArtEl = document.getElementById('metric-articles');
  const strengthScoreValEl = document.getElementById('strength-score-val');
  const strengthProgressBarEl = document.getElementById('strength-progress-bar');
  
  if (metricAuthEl) metricAuthEl.textContent = casesCount.toString();
  if (metricArtEl) metricArtEl.textContent = statutesCount.toString();
  
  // Live calculation of Authority Strength
  const authoritySupport = Math.min(20, (casesCount * 4) + (statutesCount * 2));
  
  // Quick honest estimation of the remaining 4 components
  const lowerText = text.toLowerCase();
  const reasoningQuality = Math.min(25, 5 + Math.round(text.length / 80));
  const constitutionalDepth = Math.min(25, 5 + statutesCount * 3);
  const strategicDepth = Math.min(15, 3 + (lowerText.includes("counter") ? 4 : 0) + (lowerText.includes("proportional") ? 4 : 0));
  const structure = Math.min(15, 5 + (lowerText.includes("issue") ? 3 : 0) + (lowerText.includes("rule") ? 3 : 0) + (lowerText.includes("conclusion") ? 4 : 0));
  
  // Apply Moderate concept boost
  const hasNationalSecurity = lowerText.includes("security") || lowerText.includes("national security");
  const hasPublicOrder = lowerText.includes("public order") || lowerText.includes("order");
  const hasOversight = lowerText.includes("oversight") || lowerText.includes("human oversight");
  const hasSafeguards = lowerText.includes("safeguard");
  const hasProportionality = lowerText.includes("proportion");
  const hasModerateConcepts = hasNationalSecurity && hasPublicOrder && hasOversight && hasSafeguards && hasProportionality;
  
  let liveScore = authoritySupport + constitutionalDepth + reasoningQuality + strategicDepth + structure;
  if (hasModerateConcepts) {
    liveScore = Math.max(60, liveScore);
  }

  if (strengthScoreValEl) strengthScoreValEl.textContent = liveScore.toString() + '%';
  if (strengthProgressBarEl) {
    strengthProgressBarEl.style.width = liveScore + '%';
  }

  // Also update metadata grid in completion card if it exists
  const metaAuthCountEl = document.getElementById('meta-authorities-count');
  const metaArtCountEl = document.getElementById('meta-articles-count');
  if (metaAuthCountEl) metaAuthCountEl.textContent = `${casesCount} case(s)`;
  if (metaArtCountEl) metaArtCountEl.textContent = `${statutesCount} article(s)`;
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
  let notesToSend = notes;
  if (selectedAuthorities.length > 0) {
    const authText = selectedAuthorities.map(a => `Supporting Precedent: ${a.name}. Ratio: ${a.ratio}`).join('\n');
    notesToSend = notesToSend ? `${notesToSend}\n\n${authText}` : authText;
  }

  if (notesToSend.trim().length < 5) return;

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
    const data = await buildArgument(stance, issue, notesToSend, currentPropositionContext);
    
    if (data.success && data.response) {
      lastBuiltArgument = data.response;
      builtArgumentSide = stance;
      if (window.setBuilderButtonsState) {
        window.setBuilderButtonsState(false);
      }
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

  const currentStance = builtArgumentSide || getCurrentSelectedSide() || selectedSide || 'Petitioner';
  const currentIssue = document.getElementById('builder-issue-select')?.value || 'General Issue';
  const notes = document.getElementById('builder-notes-input')?.value || '';

  try {
    renderMemorial(iracData.memorial || iracData);
    renderOralNotes(iracData.oralAdvocacy, currentStance, currentIssue);
    renderRebuttals(iracData.rebuttals, currentStance);
    renderCitations(iracData.citations, notes);
  } catch (e) {
    console.error('[RENDER ERROR]', e);
    renderFallbackState(e);
    return;
  }

  // Scans for cases and statutes using unified helper
  const { cases, statutes, casesCount, statutesCount } = extractAuthorities(notes);

  // Extract side-aware weighted scores from AI package
  let authoritySupport = 10;
  let constitutionalDepth = 12;
  let reasoningQuality = 15;
  let strategicDepth = 10;
  let structure = 10;
  let benchResistance = 50;

  const lowerNotes = notes.toLowerCase();
  const hasNationalSecurity = lowerNotes.includes("security") || lowerNotes.includes("national security");
  const hasPublicOrder = lowerNotes.includes("public order") || lowerNotes.includes("order");
  const hasOversight = lowerNotes.includes("oversight") || lowerNotes.includes("human oversight");
  const hasSafeguards = lowerNotes.includes("safeguard");
  const hasProportionality = lowerNotes.includes("proportion");
  const hasModerateConcepts = hasNationalSecurity && hasPublicOrder && hasOversight && hasSafeguards && hasProportionality;

  if (iracData.scoring) {
    authoritySupport = Number(iracData.scoring.authoritySupport) || 0;
    constitutionalDepth = Number(iracData.scoring.constitutionalDepth) || 0;
    reasoningQuality = Number(iracData.scoring.reasoningQuality) || 0;
    strategicDepth = Number(iracData.scoring.strategicDepth) || 0;
    structure = Number(iracData.scoring.structure) || 0;
    benchResistance = Number(iracData.scoring.benchResistance) || 0;

    // Apply moderate concept boost if notes contain national security, public order, safeguards, human oversight, proportionality
    if (hasModerateConcepts) {
      authoritySupport = Math.max(authoritySupport, 10);
      constitutionalDepth = Math.max(constitutionalDepth, 15);
      reasoningQuality = Math.max(reasoningQuality, 15);
      strategicDepth = Math.max(strategicDepth, 10);
      structure = Math.max(structure, 10);
    }
  } else {
    // Legacy fallback with honest scoring bands and key concepts support
    const hasAllIRAC = iracData.issue && iracData.rule && iracData.application && iracData.conclusion;
    structure = hasAllIRAC ? 15 : 7;
    
    const hasPrivacy = lowerNotes.includes("puttaswamy") || lowerNotes.includes("privacy");
    const conceptCount = [hasPrivacy, hasNationalSecurity, hasPublicOrder, hasOversight, hasSafeguards, hasProportionality].filter(Boolean).length;
    
    authoritySupport = Math.min(20, Math.max(2, casesCount * 4 + statutesCount * 2));
    constitutionalDepth = Math.min(25, Math.max(5, statutesCount * 4 + conceptCount * 2.5));
    reasoningQuality = Math.min(25, Math.max(5, 5 + Math.round(notes.length / 100) + conceptCount * 2));
    strategicDepth = Math.min(15, Math.max(3, conceptCount * 2));
    
    if (hasModerateConcepts) {
      authoritySupport = Math.max(authoritySupport, 10);
      constitutionalDepth = Math.max(constitutionalDepth, 15);
      reasoningQuality = Math.max(reasoningQuality, 15);
      strategicDepth = Math.max(strategicDepth, 10);
      structure = Math.max(structure, 10);
    }
    
    // Bench resistance evaluation
    let resistanceComponents = 20; // base score
    if (/counterargument|anticipate|opposing|respondent submits|petitioner argues|defense|challenge/gi.test(notes)) resistanceComponents += 15;
    if (/balancing|balance|competing|rights vs/gi.test(notes)) resistanceComponents += 15;
    if (/proportionality|proportional|least restrictive|nexus|legitimate/gi.test(notes)) resistanceComponents += 15;
    if (/precedent|precedents|landmark|ruling|holding|v\./gi.test(notes)) resistanceComponents += 15;
    if (/policy|discretion|interest|objective|compelling/gi.test(notes)) resistanceComponents += 20;
    
    benchResistance = Math.min(100, Math.max(10, resistanceComponents));
  }

  const synthesisScore = authoritySupport + constitutionalDepth + reasoningQuality + strategicDepth + structure;
  const finalReadinessScore = Math.min(100, synthesisScore + (citationsStrengthened ? 8 : 0) + (rebuttalViewed ? 7 : 0));

  const strengthScore = Math.round(authoritySupport * 5); // scale 20 to 100
  const readinessScore = finalReadinessScore;
  const persuasivenessScore = Math.round((reasoningQuality + strategicDepth) * 2.5); // scale 40 to 100

  // Generate dynamic strengths and weaknesses from weakly supported claims
  let dynamicStrength = "Strict adherence to the structural IRAC syllogism ensures logical clarity.";
  let dynamicWeakness = "Could be strengthened with additional citations to constitutional benches.";

  if (iracData.citations && iracData.citations.weaklySupportedClaims && iracData.citations.weaklySupportedClaims.length > 0) {
    const weakClaim = iracData.citations.weaklySupportedClaims[0];
    dynamicStrength = "Structured legal contentions aligned with constitutional requirements.";
    dynamicWeakness = `${weakClaim.claim}: ${weakClaim.suggestion}`;
  } else if (casesCount === 0) {
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

  if (benchResistance < 50) {
    riskLevel = "High Risk";
    riskBadgeCls = "bg-red-500/20 text-red-300 border border-red-500/30";
  } else if (benchResistance >= 75) {
    riskLevel = "Low Risk";
    riskBadgeCls = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
  }

  if (iracData.rebuttals && iracData.rebuttals.opponentArguments && iracData.rebuttals.opponentArguments.length > 0) {
    vulnerabilityText = iracData.rebuttals.opponentArguments[0];
    rebuttalText = iracData.rebuttals.demolitionStrategy ? iracData.rebuttals.demolitionStrategy[0] : rebuttalText;
  } else if (casesCount === 0) {
    vulnerabilityText = "Lack of binding precedent leaves the legal rules open to major judicial skepticism.";
    rebuttalText = "If challenged on lack of specific precedent, submit that the case raises a novel question of law that this Bench is invited to resolve based on first-principles reasoning.";
  }

  // Quality Indicators
  const authLabel = authoritySupport < 8 ? "Weak" : (authoritySupport <= 15 ? "Moderate" : "Strong");
  const authClass = authoritySupport < 8 ? "text-red-400" : (authoritySupport <= 15 ? "text-amber-400" : "text-emerald-400");
  
  const riskLabelText = benchResistance < 50 ? "High" : (benchResistance <= 75 ? "Medium" : "Low");
  const riskClass = benchResistance < 50 ? "text-red-400" : (benchResistance <= 75 ? "text-amber-400" : "text-emerald-400");

  const coverageLabel = (statutesCount === 0 && casesCount === 0) ? "Poor" : ((statutesCount <= 2 || casesCount <= 2) ? "Fair" : "Excellent");
  const coverageClass = (statutesCount === 0 && casesCount === 0) ? "text-red-400" : ((statutesCount <= 2 || casesCount <= 2) ? "text-amber-400" : "text-emerald-400");

  const confidenceLabel = finalReadinessScore < 50 ? "Low" : (finalReadinessScore < 75 ? "Medium" : "High");
  const confidenceClass = finalReadinessScore < 50 ? "text-red-400" : (finalReadinessScore < 75 ? "text-amber-400" : "text-emerald-400");

  const initialNotesScore = Math.max(15, Math.min(60, (casesCount * 10) + (statutesCount * 8) + Math.round(notes.length / 15)));

  outputState.innerHTML = `
<div class="flex flex-col gap-5 w-full h-full font-sans">
  
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
      <button id="btn-builder-copy" class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="copyBuilderArgument()">
        📋 Copy Draft
      </button>
      <button class="btn-sm btn-sm-ghost text-xs tracking-wider flex items-center gap-1.5 font-sans cursor-pointer" onclick="exportAsPDF('memorial')">
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
    <div class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3 font-sans">
      <div class="flex justify-between items-center">
        <span class="text-xs uppercase tracking-wider text-white-2 font-semibold font-sans">⚖️ Readiness Transparency Audit</span>
        <span class="text-[10px] font-bold text-moot-accent uppercase tracking-widest font-sans">Honest Breakdown</span>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans">Authority Support</span>
          <span class="text-xs font-semibold text-white mt-1 font-mono">${authoritySupport} / 20</span>
        </div>
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans">Constitutional Depth</span>
          <span class="text-xs font-semibold text-white mt-1 font-mono">${constitutionalDepth} / 25</span>
        </div>
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans">Reasoning Quality</span>
          <span class="text-xs font-semibold text-white mt-1 font-mono">${reasoningQuality} / 25</span>
        </div>
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans">Strategic Depth</span>
          <span class="text-xs font-semibold text-white mt-1 font-mono">${strategicDepth} / 15</span>
        </div>
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans">Structure</span>
          <span class="text-xs font-semibold text-white mt-1 font-mono">${structure} / 15</span>
        </div>
        <div class="p-2.5 bg-black/20 rounded border border-white/5 flex flex-col">
          <span class="text-[8px] text-white-muted uppercase tracking-widest font-sans font-semibold">Synthesis Score</span>
          <span class="text-xs font-semibold text-moot-accent mt-1 font-mono">${synthesisScore} / 100</span>
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
    
    <!-- Appellate Improvement Pathway Card -->
    ${getImprovementPathwayHTML(notes, casesCount, statutesCount, { authoritySupport, constitutionalDepth, reasoningQuality, strategicDepth, structure }, finalReadinessScore)}
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
        <span class="text-xs font-semibold ${riskClass} mt-1 font-sans">${riskLabelText}</span>
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
      <div><strong>Authorities Used:</strong> <span id="meta-authorities-count" class="text-white font-sans">${casesCount} case(s)</span></div>
      <div><strong>Articles Used:</strong> <span id="meta-articles-count" class="text-white font-sans">${statutesCount} article(s)</span></div>
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
      <button class="flex-1 py-3 bg-white/5 border border-white/10 text-white font-semibold text-xs uppercase tracking-wider rounded-md hover:bg-white/10 transition-all cursor-pointer font-sans" onclick="exportAsPDF('memorial')">
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
  const generalRegex = /^\s*(\*\*)*(issue|rule|application|conclusion|issue of law|governing precedents|submissions|prayer for relief)(\*\*)*\s*[:\-–—]*\\s*/i;
  cleaned = cleaned.replace(generalRegex, '');
  
  return cleaned.trim();
}

function renderMemorial(memorialData) {
  const cleanIssue = cleanSectionText(memorialData.issue || '', 'issue');
  const cleanRule = cleanSectionText(memorialData.rule || '', 'rule');
  const cleanApp = cleanSectionText(memorialData.application || '', 'application');
  const cleanConclusion = cleanSectionText(memorialData.conclusion || '', 'conclusion');

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

function renderOralNotes(oralAdvocacyData, currentStance, currentIssue) {
  storedOralNotes = getUpgradedOralNotes(oralAdvocacyData, currentStance, currentIssue);
}

function renderRebuttals(rebuttalsData, currentStance) {
  storedRebuttals = getUpgradedRebuttals(rebuttalsData, currentStance);
}

function renderCitations(citationsData, notes) {
  storedCitations = getUpgradedCitations(citationsData, notes);
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
        renderPreDraftAuthorities();
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

export function exportDraftPDF() {
  console.log("[CENTRALIZED EXPORT] Invoking legacy exportDraftPDF wrapper.");
  exportAsPDF('memorial');
}

export function exportAsPDF(type) {
  console.log(`[CENTRALIZED EXPORT] Exporting type: ${type}`);
  
  if (!lastBuiltArgument) {
    showToast("No generated content available to export.", "err");
    return;
  }
  
  let printContent = "";
  let headerText = "";
  let titleText = "";
  
  if (type === 'memorial') {
    if (!storedMemorialHTML) {
      showToast("Memorial content is not generated.", "err");
      return;
    }
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = storedMemorialHTML;
    const canvas = tempDiv.querySelector('#memorial-viewer-canvas');
    printContent = canvas ? canvas.innerHTML : storedMemorialHTML;
    headerText = "BEFORE THE SUPREME COURT OF APPRENTICE ADVOCACY · MEMORIAL SUBMISSION";
    titleText = "Appellate Memorial - MootCoach AI";
  } else if (type === 'oral' || (type === 'active-aux' && activeAuxType === 'oral')) {
    if (!storedOralNotes) {
      showToast("Oral notes content is not generated.", "err");
      return;
    }
    printContent = storedOralNotes;
    headerText = "APPELLATE DRAFTING STUDIO · ORAL ADVOCACY NOTES";
    titleText = "Oral Advocacy Notes - MootCoach AI";
  } else if (type === 'rebuttal' || (type === 'active-aux' && activeAuxType === 'rebuttal')) {
    if (!storedRebuttals) {
      showToast("Rebuttal content is not generated.", "err");
      return;
    }
    printContent = storedRebuttals;
    headerText = "APPELLATE DRAFTING STUDIO · REBUTTAL STRATEGY";
    titleText = "Rebuttal Strategy - MootCoach AI";
  } else if (type === 'citations' || (type === 'active-aux' && activeAuxType === 'citations')) {
    if (!storedCitations) {
      showToast("Citations content is not generated.", "err");
      return;
    }
    printContent = storedCitations;
    headerText = "APPELLATE DRAFTING STUDIO · CITATION STRENGTHENER";
    titleText = "Citation Strengthener - MootCoach AI";
  } else if (type === 'pack' || (type === 'active-aux' && activeAuxType === 'pack')) {
    const tempDiv = document.createElement('div');
    renderOralAdvocacySuite(tempDiv);
    const headers = tempDiv.querySelector('.flex.border-b');
    if (headers) headers.remove();
    printContent = tempDiv.innerHTML;
    headerText = "APPELLATE DRAFTING STUDIO · ORAL ADVOCACY SUITE";
    titleText = "Oral Advocacy Suite - MootCoach AI";
  } else {
    if (storedMemorialHTML) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = storedMemorialHTML;
      const canvas = tempDiv.querySelector('#memorial-viewer-canvas');
      printContent = canvas ? canvas.innerHTML : storedMemorialHTML;
    }
    headerText = "BEFORE THE SUPREME COURT OF APPRENTICE ADVOCACY · MEMORIAL SUBMISSION";
    titleText = "Appellate Memorial - MootCoach AI";
  }
  
  if (!printContent || printContent.trim() === "") {
    showToast("Content is empty or could not be loaded for export.", "err");
    return;
  }
  
  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(`
    <html>
      <head>
        <title>${titleText}</title>
        <link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
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
            font-size: 11pt;
            word-wrap: break-word;
          }
          h4, strong, span, button {
            font-family: 'Inter', sans-serif;
          }
          p, li, blockquote, hr, div {
            page-break-inside: avoid;
          }
          h1, h2, h3, h4, h5, h6 {
            page-break-inside: avoid;
            page-break-after: avoid;
          }
          h4 {
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
            font-family: 'Inter', sans-serif;
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
            font-family: 'Inter', sans-serif;
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
          .bg-white\\/5, .bg-white\\/\\[0\\.02\\], .bg-black\\/20, .bg-red-950\\/10 {
            background: #f9f9f9 !important;
            border: 1px solid #eee !important;
            padding: 12px !important;
            border-radius: 6px !important;
            margin-bottom: 12px !important;
          }
          .border-l-2 {
            border-left: 3px solid #666 !important;
          }
          .text-moot-accent {
            color: #bfa15f !important;
          }
          .text-red-400 {
            color: #c0392b !important;
          }
          .text-emerald-400 {
            color: #27ae60 !important;
          }
          .text-white-muted, .text-gray-400, .text-slate-500 {
            color: #666 !important;
          }
          .text-white, .text-gray-300, .text-slate-800 {
            color: #222 !important;
          }
          details summary {
            font-weight: bold;
            margin-top: 8px;
          }
          details[open] summary {
            margin-bottom: 4px;
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
window.exportAsPDF = exportAsPDF;

export function openAuxPanel(type, triggerElement) {
  if (!lastBuiltArgument) {
    showToast("Generate a submission first to unlock this workspace.", "info");
    return;
  }

  activeTriggerElement = triggerElement || document.activeElement;
  activeAuxType = type;

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
  const currentStance = builtArgumentSide || getCurrentSelectedSide() || selectedSide || 'Petitioner';
  const isPetitioner = currentStance.toLowerCase().includes('petitioner') || currentStance.toLowerCase().includes('appellant');
  const iracData = lastBuiltArgument || {};
  const currentIssue = document.getElementById('builder-issue-select')?.value || 'General Issue';
  
  const oral = iracData.oralAdvocacy || {};
  const rebuttalsObj = iracData.rebuttals || {};

  // Section 1 & 7: Opening Speeches and Closing Prayers
  const openingLine = oral.openingSpeech || (isPetitioner 
    ? `May it please this Honorable Court. My name is Counsel representing the Petitioner. We stand before this Court to challenge the validity of the impugned action concerning the key issue of law, namely ${esc(iracData.issue || currentIssue)}.`
    : `May it please this Honorable Court. My name is Counsel representing the Respondent. We stand before this Court to oppose the petition in its entirety and defend the constitutionality of the impugned action.`);

  const opening30s = oral.opening30s || (isPetitioner
    ? "My Lords, the violation here is not merely technical, but goes to the root of Part III rights. If this court does not intervene, the petitioner faces irreparable injury for which damages are no remedy. The state cannot bypass the rule of law under the banner of convenience."
    : "My Lords, the State's action was necessitated by public welfare. It enjoys the presumption of constitutionality and fits strictly within the legislative competence. The restriction is reasonable, proportional, and leaves alternative remedies open.");

  const opening60s = oral.opening60s || (isPetitioner
    ? "My Lords, the petition raises a vital question of constitutional fair play. First, the impugned regulation bypasses natural justice. Second, it violates the proportionality test by imposing an absolute bar where narrower means were practicable. Under Maneka Gandhi, any procedure must be fair, just, and reasonable. We pray that this Court strikes down the provision."
    : "My Lords, the Respondent submits that the petition is both procedurally barred and substantively meritless. The petitioner failed to exhaust the statutory appeal mechanism. Furthermore, the restriction is reasonable under Article 19(6) to protect public safety. A regulatory vacuum would cause public harm. We pray that the petition be dismissed.");

  const closing15s = oral.closing15s || (isPetitioner
    ? "In conclusion, My Lords, because the impugned regulation violates the tests of proportionality and natural justice, we pray that this petition be allowed. We thank this Court."
    : "In conclusion, My Lords, because the regulation is a reasonable and necessary restriction in public interest, we pray that the petition be dismissed. We thank this Court.");

  const closing30s = oral.closing30s || (isPetitioner
    ? "My Lords, a constitutional democracy cannot permit administrative convenience to override fundamental rights. Since the regulation bypasses notice, lacks guidelines, and is disproportionate, we pray that this Court strike it down. We thank this Court."
    : "My Lords, the state acted in good faith to protect public welfare. To strike down this rule would create a regulatory vacuum. Since the restriction is proportional and constitutional, we pray that the petition be dismissed. We thank this Court.");

  const closingFull = oral.closingPrayer || (isPetitioner
    ? "May it please this Court. For the reasons submitted, the Petitioner prays that this Court: First, declare the impugned regulation unconstitutional and void under Articles 14, 19, and 21. Second, direct the State to reinstate the Petitioner's status. And pass any other order that this Court deems fit in the interest of justice. We thank this Court."
    : "May it please this Court. For the reasons submitted, the Respondent prays that this Court: First, uphold the validity of the impugned regulation. Second, dismiss the petition with costs as a meritless challenge to policy discretion. And pass any other order that this Court deems fit. We thank this Court.");

  // Section 2: Submissions
  const submissions = (oral.submissions && oral.submissions.length > 0) ? oral.submissions : [
    {
      title: "Submission I: Substantive Legality",
      issue: cleanSectionText(iracData.issue || currentIssue, 'issue'),
      precedent: isPetitioner ? 'K.S. Puttaswamy v. Union of India (2017)' : 'E.P. Royappa v. State of Tamil Nadu (1974) (State Defense)',
      rule: cleanSectionText(iracData.rule || 'Equal protection under Article 14 requires state actions to be free from manifest arbitrariness.', 'rule'),
      application: cleanSectionText(iracData.application || 'The state action was taken without notice or guidelines, violating Article 14.', 'application'),
      conclusion: cleanSectionText(iracData.conclusion || 'Strike down the arbitrary regulatory rule.', 'conclusion')
    },
    {
      title: "Submission II: Procedural Fairness",
      issue: "Whether the procedure adopted by the State violates Article 21 and the principles of natural justice.",
      precedent: "Maneka Gandhi v. Union of India (1978)",
      rule: "Any procedure affecting fundamental rights under Article 21 must be fair, just, and reasonable, incorporating prior notice and hearing.",
      application: isPetitioner ? 'The State completely bypassed both pre-decisional and post-decisional hearings, causing absolute procedural failure.' : 'Urgent regulatory conditions required immediate public interest measures, which are cured by post-decisional hearings.',
      conclusion: isPetitioner ? 'Read down the unilateral power to require prior hearings, or set aside the order.' : 'Uphold the validity of the procedure, directing a post-decisional hearing if deemed necessary.'
    }
  ];

  // Section 3: likely bench questions
  const qaList = (oral.qa && oral.qa.length > 0) ? oral.qa : (isPetitioner ? [
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
  ]);

  // Section 2: traps
  const trapsList = (oral.traps && oral.traps.length > 0) ? oral.traps : [
    {
      title: "The 'Policy Exception' Trap",
      description: "Judges will try to make you agree that policy decisions are completely immune from judicial review, locking you out of your core argument.",
      escapeResponse: "With respect, My Lords, this ruling will not affect legitimate policy discretion. It merely reinforces that policy must remain within Part III boundaries. Public trust is enhanced when policy is constitutional."
    },
    {
      title: "The 'Literal Statutory Wording' Trap",
      description: "If you agree that statutory wording has absolute supremacy regardless of constitutional rights, you lose your Article 21/14 ground.",
      escapeResponse: "My Lords, when a statutory power affects fundamental rights of citizens, the word 'may' is construed as 'shall' to preserve its validity, as held in the landmark case of Delhi Administration v. I.K. Nangia."
    }
  ];

  // Section 3: Judge Attack Mode (Interventions)
  const attackList = (oral.judgeAttackMode && oral.judgeAttackMode.length > 0) ? oral.judgeAttackMode : (isPetitioner ? [
    {
      intervention: "Counsel, you are asking this Court to micro-manage security protocols. If we accept your argument, the government won't be able to disable communication channels during security situations. How do you respond to that?",
      trapType: "Policy Exception",
      advocateEscape: "My Lords, with respect, Counsel does not invite this Court to govern. We simply ask this Court to enforce the clear limits set by Anuradha Bhasin, which mandate that any shutdown must be temporary, necessary, and subject to regular oversight. Administrative convenience cannot override Part III rights."
    },
    {
      intervention: "Counsel, the statute explicitly says the Director 'may authorize interception.' There is no provision for a prior hearing in the text. Are we supposed to rewrite the legislation?",
      trapType: "Literal Statutory Wording",
      advocateEscape: "My Lords, it is a cardinal principle of constitutional interpretation that when a statutory power infringes on fundamental liberties under Article 21, the procedural requirements of natural justice must be read into the silent statute to preserve its constitutionality, as established in Maneka Gandhi."
    }
  ] : [
    {
      intervention: "Counsel, how can the state argue that bypassing prior notice and hearing completely satisfies due process? Is natural justice optional when the government is in a hurry?",
      trapType: "Manifest Arbitrariness",
      advocateEscape: "My Lords, natural justice is not optional, but its application is flexible. In situations of public order threat, post-decisional hearings satisfy due process under Charan Lal Sahu. The State has provided a post-decisional review process, curing any initial procedural grievance."
    },
    {
      intervention: "Counsel, the restriction in this case has shut down normal business operations for three weeks. How can this satisfy the proportionality test when the threat was localized and resolved in two days?",
      trapType: "Proportionality Balancing",
      advocateEscape: "My Lords, the assessment of when a threat is resolved lies in the unique domain of executive intelligence, not judicial assessment. The localized threat had a clear threat profile that justified continued restrictions to prevent flare-ups, satisfying the public order necessity standard under Article 19(6)."
    }
  ]);

  // Section 5: Rebuttal War Room
  let rebuttalsList = [];
  const oppArgs = rebuttalsObj.opponentArguments || [];
  const demoStrats = rebuttalsObj.demolitionStrategy || [];
  for (let i = 0; i < Math.max(oppArgs.length, demoStrats.length); i++) {
    rebuttalsList.push({
      opponent: oppArgs[i] || "Opponent argument",
      rebuttal: demoStrats[i] || "Response strategy"
    });
  }
  if (rebuttalsList.length === 0) {
    rebuttalsList = isPetitioner ? [
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
  }

  // Section 6: Authorities Snapshot
  let precedentsList = oral.precedents || (iracData.citations && iracData.citations.constitutionalBenchAuthorities) || [];
  if (!precedentsList || precedentsList.length === 0) {
    precedentsList = [
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
  }

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
        ${submissions.map((sub, idx) => `
        <!-- Submission ${idx + 1} Card -->
        <div class="p-5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md flex flex-col gap-3">
          <div class="flex justify-between items-center border-b border-white/5 pb-2 mb-1">
            <div class="flex items-center gap-2">
              <span class="text-lg">⚖️</span>
              <h4 class="text-xs uppercase tracking-wider text-moot-accent font-bold">${esc(sub.title || `Submission ${idx + 1}`)}</h4>
            </div>
            <span class="px-2 py-0.5 text-[8px] font-sans font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded uppercase tracking-wider">${idx === 0 ? 'Primary Ground' : 'Procedural Ground'}</span>
          </div>
          
          <div class="space-y-2 text-xs text-white/80">
            <div>
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Issue</span>
              <p class="mt-0.5 text-white/95">${esc(sub.issue)}</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Governing Precedent / Authority</span>
              <p class="mt-0.5 text-white/95 italic font-serif">${esc(sub.precedent)}</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Constitutional Rule</span>
              <p class="mt-0.5 text-white/95">${esc(sub.rule)}</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Application to Facts</span>
              <p class="mt-0.5 text-white/95">${esc(sub.application)}</p>
            </div>
            <div class="pt-2">
              <span class="font-sans font-bold text-gray-400 block text-[10px] uppercase tracking-wider">Relief Prayed</span>
              <p class="mt-0.5 text-white/95">${esc(sub.conclusion)}</p>
            </div>
          </div>
        </div>
        `).join('')}
      </div>
    `;
  } else if (activePackTab === 'qa') {
    tabContentHTML = `
      <div class="flex flex-col gap-5 font-sans">
        
        <!-- Section 1: Collapsible Questions -->
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2 border-b border-white/5 pb-2">
            <span class="text-lg">❓</span>
            <h4 class="text-xs uppercase tracking-wider text-moot-accent font-bold">1. Top likely judicial questions</h4>
          </div>
          
          <div class="space-y-2 font-sans">
            ${qaList.map((qa, idx) => `
              <details class="group bg-white/5 border border-white/10 rounded-lg transition-all duration-300 overflow-hidden">
                <summary class="flex justify-between items-center p-3 cursor-pointer select-none text-xs font-semibold text-white/90 hover:bg-white/[0.03] font-sans">
                  <span>Q${idx + 1}: ${esc(qa.q || qa.question)}</span>
                  <span class="text-xs transition-transform duration-300 group-open:rotate-180 text-moot-accent font-sans">▼</span>
                </summary>
                <div class="p-3 bg-black/25 text-xs text-gray-300 leading-relaxed font-serif italic border-t border-white/5">
                  "${esc(qa.a || qa.answer)}"
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
            ${trapsList.map((trap, idx) => `
            <!-- Trap ${idx + 1} -->
            <div class="p-4 bg-red-950/10 border border-red-900/30 rounded-xl flex flex-col gap-2">
              <div class="flex justify-between items-center">
                <strong class="text-xs text-red-400 uppercase tracking-wider font-sans">Trap ${idx + 1}: ${esc(trap.title || 'Judicial Trap')}</strong>
                <span class="px-2 py-0.5 text-[8px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 rounded uppercase tracking-wider font-sans">Danger Level: Critical</span>
              </div>
              <p class="text-xs text-gray-300 leading-relaxed font-sans font-medium">
                <strong class="text-white">Why it is dangerous:</strong> ${esc(trap.description)}
              </p>
              <div class="p-2.5 bg-black/35 rounded border-l-2 border-red-500 text-xs italic text-gray-300 font-serif mt-1">
                "${esc(trap.escapeResponse || trap.response)}"
              </div>
            </div>
            `).join('')}
          </div>
        </div>

        <!-- Section 3: Judge Attack Mode (Hostile Interventions) -->
        <div class="flex flex-col gap-3 mt-2">
          <div class="flex items-center gap-2 border-b border-white/5 pb-2">
            <span class="text-lg">🚨</span>
            <h4 class="text-xs uppercase tracking-wider text-red-400 font-bold font-sans">3. Judge Attack Mode (Hostile Interventions)</h4>
          </div>
          
          <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-3 flex flex-col gap-1 font-sans">
            <span class="text-[10px] font-bold text-red-400 uppercase tracking-widest font-sans">⚡ WARNING: Hostile Bench Simulation Active</span>
            <span class="text-[9px] text-white-muted leading-tight font-sans">Prepare for immediate interruption on the following prongs during oral arguments.</span>
          </div>

          <div class="space-y-3 font-sans">
            ${attackList.map((attack, idx) => `
            <!-- Attack ${idx + 1} -->
            <div class="p-4 bg-red-950/15 border border-red-900/40 rounded-xl flex flex-col gap-2 font-sans">
              <div class="flex justify-between items-center">
                <strong class="text-xs text-red-400 uppercase tracking-wider font-sans">Intervention ${idx + 1}: ${esc(attack.trapType || 'Hostile Interruption')}</strong>
                <span class="px-2 py-0.5 text-[8px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 rounded uppercase tracking-wider font-sans">Interruption Risk</span>
              </div>
              <p class="text-xs text-gray-300 leading-relaxed font-sans font-medium italic">
                <span class="text-red-400 font-bold font-sans">Judge:</span> "${esc(attack.intervention)}"
              </p>
              <div class="p-2.5 bg-black/35 rounded border-l-2 border-emerald-500 text-xs italic text-gray-300 font-serif mt-1">
                <strong class="text-emerald-400 block mb-1 font-sans not-italic text-[9px] uppercase tracking-wider">Advocate Escape Route:</strong>
                "${esc(attack.advocateEscape || attack.escapeResponse)}"
              </div>
            </div>
            `).join('')}
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
                <p class="text-xs text-gray-300 leading-relaxed font-serif italic">
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
                  <span class="text-[9px] font-semibold text-moot-accent uppercase tracking-widest font-sans">${esc(p.bench || 'Constitutional Bench')}</span>
                </div>

                <!-- Authority Details Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-black/30 border border-white/5 rounded-lg mb-3 text-xs font-sans">
                  <div>
                    <span class="text-white-muted uppercase tracking-wider text-[8px] block font-semibold">Bench Strength</span>
                    <span class="text-white font-medium font-sans">${esc(p.benchStrength || p.bench || 'Constitutional Bench')}</span>
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
                    <p class="text-gray-300 mt-0.5">${esc(p.strategicValue || p.why)}</p>
                  </div>
                  <div class="pt-1">
                    <span class="text-[9px] uppercase tracking-widest text-[#c9a84c] block font-semibold">Courtroom Usage (One-Liner)</span>
                    <p class="text-white italic font-serif mt-0.5">"${esc(p.usage || p.courtroomUsage)}"</p>
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

function getUpgradedOralNotes(oralAdvocacy, stance, issue) {
  const isPetitioner = stance.toLowerCase().includes('petitioner') || stance.toLowerCase().includes('appellant');
  const borderCls = isPetitioner ? 'border-indigo-500/30' : 'border-rose-500/30';

  if (!oralAdvocacy) {
    const openingSpeech = isPetitioner 
      ? `"May it please this Honorable Court. My name is Counsel representing the Petitioner in this matter. We stand before this Court to challenge the validity of the impugned state actions concerning <strong>${esc(issue)}</strong>. We pray accordingly."`
      : `"May it please this Honorable Court. My name is Counsel representing the Respondent in this matter. We stand before this Court to oppose the petition in its entirety. We pray that this Honorable Court dismiss the petition."`;

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
      </div>
    `;
  }

  const openingSpeech = oralAdvocacy.openingSpeech || "May it please this Honorable Court...";
  const closingPrayer = oralAdvocacy.closingPrayer || "We thank this Court.";

  const submissionsHTML = (oralAdvocacy.submissions || []).map((sub, idx) => `
    <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg mb-2">
      <strong class="text-white block mb-1">${esc(sub.title || `Contention ${idx + 1}`)}</strong>
      <div class="mb-1"><span class="text-indigo-400 font-semibold uppercase text-[9px]">Precedent:</span> <span class="italic font-serif">${esc(sub.precedent || 'None')}</span></div>
      <div class="mb-1"><span class="text-gray-400 font-semibold uppercase text-[9px]">Rule:</span> ${esc(sub.rule || '')}</div>
      <div class="mb-1"><span class="text-gray-400 font-semibold uppercase text-[9px]">Application:</span> ${esc(sub.application || '')}</div>
      <div><span class="text-emerald-400 font-semibold uppercase text-[9px]">Conclusion:</span> ${esc(sub.conclusion || '')}</div>
    </div>
  `).join('');

  const qaHTML = (oralAdvocacy.qa || []).map((pair, idx) => `
    <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg mb-2 font-sans">
      <strong class="text-[#c9a84c] block mb-1">Q${idx + 1}: ${esc(pair.q)}</strong>
      <span class="text-gray-300 italic font-serif leading-relaxed block mt-1">"${esc(pair.a)}"</span>
    </div>
  `).join('');

  const precedentsHTML = (oralAdvocacy.precedents || []).map(p => `
    <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg text-xs font-sans mb-2">
      <strong class="text-white block mb-1">⚖️ ${esc(p.name)} (${esc(p.bench || 'Constitutional Bench')})</strong>
      <div class="text-white-muted mt-1"><span class="text-[#c9a84c] font-semibold uppercase text-[9px] tracking-wider font-sans">Ratio:</span> ${esc(p.ratio)}</div>
      <div class="text-white-muted mt-1"><span class="text-[#4caf82] font-semibold uppercase text-[9px] tracking-wider font-sans">Application:</span> ${esc(p.strategicValue || p.why)}</div>
      <div class="text-white-muted mt-1"><span class="text-[#c9a84c] font-semibold uppercase text-[9px] tracking-wider font-sans">Usage:</span> <span class="italic font-serif">"${esc(p.usage)}"</span></div>
    </div>
  `).join('');

  const trapsHTML = (oralAdvocacy.traps || []).map(trap => `
    <div class="p-3 bg-red-950/10 border border-red-900/20 rounded-lg text-xs leading-relaxed text-gray-300 font-sans mb-2">
      <strong class="text-red-400 block mb-1">⚠️ ${esc(trap.title || 'Judicial Trap')}</strong>
      <span class="block text-gray-400 mb-1"><strong>Danger:</strong> ${esc(trap.description)}</span>
      <span class="block mt-2 italic text-gray-300 font-serif">Escape Route: "${esc(trap.escapeResponse)}"</span>
    </div>
  `).join('');

  return `
    <div class="flex flex-col gap-5">
      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-2 flex items-center gap-1.5 font-sans">
          <span>🎙️</span> 1. Bench Opening (Ready to Speak)
        </h4>
        <p class="text-xs text-white-muted italic font-serif leading-relaxed bg-black/20 p-3 rounded-lg border-l-2 ${borderCls}">
          "${esc(openingSpeech)}"
        </p>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>⚖️</span> 2. Core Submissions (Oral Flow)
        </h4>
        <div class="space-y-3 text-xs leading-relaxed text-gray-300 font-sans">
          ${submissionsHTML}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>❓</span> 3. Likely Bench Questions & Answers
        </h4>
        <div class="space-y-2 text-xs font-sans">
          ${qaHTML}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>📖</span> 4. Key Precedent Ratios (Memorizer)
        </h4>
        <div class="space-y-3">
          ${precedentsHTML}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl">
        <h4 class="text-xs uppercase tracking-wider text-moot-accent font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>🔥</span> 5. Judicial Traps & 30-Second Rescue
        </h4>
        <div class="space-y-3 text-xs leading-relaxed text-gray-300 font-sans">
          ${trapsHTML}
          <div class="p-3 bg-indigo-950/10 border border-indigo-900/20 rounded-lg">
            <strong class="text-indigo-400 block mb-1">⏱️ Closing Prayer</strong>
            <span>${esc(closingPrayer)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getUpgradedRebuttals(rebuttalsData, stance) {
  const isPetitioner = stance.toLowerCase().includes('petitioner') || stance.toLowerCase().includes('appellant');
  const oppStance = isPetitioner ? 'Respondent' : 'Petitioner';

  if (!rebuttalsData) {
    return `
      <div class="flex flex-col gap-5 font-sans">
        <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
          <h4 class="text-xs uppercase tracking-wider text-red-400 font-semibold mb-3 flex items-center gap-1.5 font-sans">
            <span>⚔️</span> Strongest Opposition Arguments
          </h4>
          <ul class="space-y-2 text-xs text-gray-300 leading-relaxed list-disc pl-4 font-sans">
            <li><strong>Discretionary Privilege:</strong> The State claims administrative policies enjoy a wide latitude of immunity.</li>
          </ul>
        </div>
      </div>
    `;
  }

  const oppHTML = (rebuttalsData.opponentArguments || []).map(arg => `<li>${esc(arg)}</li>`).join('');

  const demoHTML = (rebuttalsData.demolitionStrategy || []).map((strat, idx) => `
     <p><strong>${idx + 1}. Counter-Strategy:</strong> ${esc(strat)}</p>
  `).join('');

  const followHTML = (rebuttalsData.followUpQuestions || []).map((pair, idx) => `
    <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg font-sans mb-2">
      <strong class="text-white block mb-1">Follow-up ${idx + 1}: "${esc(pair.q)}"</strong>
      <span class="italic block mt-1 font-serif">Answer: "${esc(pair.a)}"</span>
    </div>
  `).join('');

  const planB = rebuttalsData.planB || "Read down the provision to preserve its validity while addressing client rights.";
  const emergencyRescue = rebuttalsData.emergencyRescue || "Submit that fundamental rights are absolute bounds on executive action.";

  return `
    <div class="flex flex-col gap-5 font-sans">
      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-red-400 font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>⚔️</span> Strongest Opposition Arguments
        </h4>
        <ul class="space-y-2 text-xs text-gray-300 leading-relaxed list-disc pl-4 font-sans">
          ${oppHTML || '<li class="italic text-gray-500">No opposition arguments identified.</li>'}
        </ul>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-emerald-400 font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>🛡️</span> Response Strategy & Demolition
        </h4>
        <div class="space-y-3 text-xs leading-relaxed text-gray-300 font-sans">
          ${demoHTML || '<p class="italic text-gray-500">No demolition strategy prepared.</p>'}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-[#c9a84c] font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>🎯</span> Bench Follow-Up Questions
        </h4>
        <div class="space-y-3 text-xs text-gray-300 font-sans">
          ${followHTML || '<p class="italic text-gray-500">No follow-up questions prepared.</p>'}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-indigo-400 font-semibold mb-2 flex items-center gap-1.5 font-sans">
          <span>⚠️</span> Fallback Position (Plan B)
        </h4>
        <p class="text-xs text-gray-300 leading-relaxed bg-black/20 p-3 rounded-lg border-l-2 border-indigo-500/30 font-serif italic">
          "${esc(planB)}"
        </p>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl bg-red-950/10 border-red-900/30 font-sans">
        <h4 class="text-xs uppercase tracking-wider text-red-400 font-semibold mb-2 flex items-center gap-1.5 font-sans">
          <span>🚨</span> Emergency Rescue Arguments
        </h4>
        <p class="text-xs text-gray-300 leading-relaxed font-serif italic">
          "${esc(emergencyRescue)}"
        </p>
      </div>
    </div>
  `;
}

function getUpgradedCitations(citationsData, notes) {
  if (!citationsData) {
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
      </div>
    `;
  }

  const currentStrength = citationsData.currentCitationsStrength ?? 50;
  const potentialStrength = citationsData.potentialCitationsStrength ?? 85;
  const strengthColor = currentStrength >= 75 ? 'text-[#4caf82]' : currentStrength >= 50 ? 'text-[#c9a84c]' : 'text-red-400';
  const progressColor = currentStrength >= 75 ? 'bg-[#4caf82]' : currentStrength >= 50 ? 'bg-[#c9a84c]' : 'bg-red-500';

  const missingHTML = (citationsData.missingAuthorities || []).map(auth => {
    const sg = auth.scoreGains || {};
    const scoreGainText = `+${sg.authorityStrength || 0} Authority Strength, +${sg.constitutionalDepth || 0} Constitutional Depth, +${sg.benchResistance || 0} Bench Resistance | Potential Gain: +${sg.potentialScoreGain || 0}`;
    return `
      <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg mb-2 text-left">
        <strong class="text-red-400 block mb-1">⚖️ ${esc(auth.name)}</strong>
        <div class="text-xs text-gray-300"><strong>Why Needed:</strong> ${esc(auth.whyNeeded)}</div>
        <div class="text-xs text-gray-300 mt-1"><strong>Strategic Impact:</strong> ${esc(auth.expectedStrategicImpact)}</div>
        <div class="text-[10px] text-moot-accent mt-1 uppercase font-semibold">${esc(scoreGainText)}</div>
      </div>
    `;
  }).join('');

  const constBenchHTML = (citationsData.constitutionalBenchAuthorities || []).map(p => `
    <div class="p-3 bg-white/[0.02] border border-white/5 rounded-lg mb-2 text-left">
      <strong class="text-white block mb-1">⚖️ ${esc(p.name)} (${esc(p.bench || 'Constitutional Bench')})</strong>
      <div class="text-xs text-gray-300"><strong>Ratio Decidendi:</strong> ${esc(p.ratio)}</div>
      <div class="text-xs text-gray-300 mt-1"><strong>Strategic Value:</strong> ${esc(p.strategicValue)}</div>
      <div class="text-xs text-white italic mt-1">Usage: "${esc(p.usage)}"</div>
    </div>
  `).join('');

  const strategicHTML = (citationsData.strategicCitations || []).map(p => `
    <p>• <strong>${esc(p.name)}:</strong> ${esc(p.strategicValue)}</p>
  `).join('');

  const weaklyHTML = (citationsData.weaklySupportedClaims || []).map(p => `
    <p>• <strong>Claim:</strong> ${esc(p.claim)}<br/><strong>Suggestion:</strong> ${esc(p.suggestion)}</p>
  `).join('');

  return `
    <div class="flex flex-col gap-5 font-sans text-left">
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
          ${missingHTML || '<p class="italic text-gray-500">No missing authorities identified.</p>'}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-[#c9a84c] font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>🏛️</span> Constitutional Bench Authorities
        </h4>
        <div class="space-y-2 text-xs text-gray-300 font-sans">
          ${constBenchHTML || '<p class="italic text-gray-500">No constitutional bench authorities suggested.</p>'}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl font-sans">
        <h4 class="text-xs uppercase tracking-wider text-indigo-400 font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>💡</span> Strategic Citations
        </h4>
        <div class="space-y-2 text-xs text-gray-300 font-sans">
          ${strategicHTML || '<p class="italic text-gray-500">No strategic citations suggested.</p>'}
        </div>
      </div>

      <div class="p-4 bg-white/5 border border-white/10 rounded-xl bg-amber-950/10 border-amber-900/30 font-sans">
        <h4 class="text-xs uppercase tracking-wider text-[#c9a84c] font-semibold mb-3 flex items-center gap-1.5 font-sans">
          <span>⚠️</span> Weakly Supported Claims
        </h4>
        <div class="space-y-2 text-xs text-gray-300 font-sans text-left">
          ${weaklyHTML || '<p class="italic text-gray-500">No weakly supported claims identified.</p>'}
        </div>
      </div>
    </div>
  `;
}

// ==========================================
//   SHARED PRE-DRAFTING & TRANSITIONAL HELPERS
// ==========================================

function resolveIssueKey(selectValue) {
  if (!selectValue) return "Issue 3";
  const selectStr = selectValue.toLowerCase();
  
  if (selectStr.includes("issue 1")) return "Issue 1";
  if (selectStr.includes("issue 2")) return "Issue 2";
  if (selectStr.includes("issue 3")) return "Issue 3";
  if (selectStr.includes("issue 4")) return "Issue 4";
  
  // Keyword fallback mappings
  if (selectStr.includes("jurisdiction") || selectStr.includes("maintainability")) return "Issue 1";
  if (selectStr.includes("validity") || selectStr.includes("constitutionality") || selectStr.includes("ultra vires")) return "Issue 2";
  if (selectStr.includes("merits") || selectStr.includes("shutdown") || selectStr.includes("breach") || selectStr.includes("privacy") || selectStr.includes("speech") || selectStr.includes("rights")) return "Issue 3";
  if (selectStr.includes("remedy") || selectStr.includes("relief") || selectStr.includes("compensation") || selectStr.includes("damages") || selectStr.includes("prayer")) return "Issue 4";
  
  return "Issue 3";
}

function getAuthoritiesForIssueAndStance(issueVal, stance) {
  let matchedAuthorities = [];
  const selectStr = (issueVal || "").toLowerCase();
  
  // Define matched registry keys
  let matchedKeys = new Set();
  
  // 1. Maintainability / Jurisdiction
  if (selectStr.includes("jurisdiction") || selectStr.includes("maintainability") || selectStr.includes("alternative remedy") || selectStr.includes("art. 226") || selectStr.includes("article 226") || selectStr.includes("art. 32") || selectStr.includes("article 32") || selectStr.includes("bar")) {
    matchedKeys.add("Issue 1");
  }
  
  // 2. Arbitrariness / Equality / Article 14
  if (selectStr.includes("validity") || selectStr.includes("constitutionality") || selectStr.includes("ultra vires") || selectStr.includes("arbitrary") || selectStr.includes("arbitrariness") || selectStr.includes("article 14") || selectStr.includes("art. 14") || selectStr.includes("equality") || selectStr.includes("bias")) {
    matchedKeys.add("Issue 2");
  }
  
  // 3. Privacy / Article 21 / Speech / Article 19 / Merits / AI profiling
  if (selectStr.includes("merits") || selectStr.includes("shutdown") || selectStr.includes("breach") || selectStr.includes("privacy") || selectStr.includes("speech") || selectStr.includes("rights") || selectStr.includes("article 19") || selectStr.includes("art. 19") || selectStr.includes("article 21") || selectStr.includes("art. 21") || selectStr.includes("liberty") || selectStr.includes("profiling") || selectStr.includes("algorithm") || selectStr.includes("security") || selectStr.includes("natural justice") || selectStr.includes("process") || selectStr.includes("procedure")) {
    matchedKeys.add("Issue 3");
  }
  
  // 4. Remedy / Relief / Damages
  if (selectStr.includes("remedy") || selectStr.includes("relief") || selectStr.includes("compensation") || selectStr.includes("damages") || selectStr.includes("prayer") || selectStr.includes("direct")) {
    matchedKeys.add("Issue 4");
  }
  
  // Fallback to option index if no keywords matched
  if (matchedKeys.size === 0) {
    const issueKey = resolveIssueKey(issueVal);
    matchedKeys.add(issueKey);
  }
  
  // Collect all registry authorities from matched keys
  const seenNames = new Set();
  matchedKeys.forEach(key => {
    const authList = (SHARED_AUTHORITY_REGISTRY[key] && SHARED_AUTHORITY_REGISTRY[key][stance]) || [];
    authList.forEach(auth => {
      if (!seenNames.has(auth.name.toLowerCase())) {
        seenNames.add(auth.name.toLowerCase());
        matchedAuthorities.push({ ...auth });
      }
    });
  });
  
  // Merge dynamic precedents from lastAnalysis if available
  try {
    const analysisStr = window.lastAnalysis || lastAnalysis;
    if (analysisStr) {
      const data = JSON.parse(analysisStr);
      const dynamicPrecedents = data.precedentsNeeded || [];
      dynamicPrecedents.forEach(dp => {
        const caseName = dp.caseName || dp.name || "";
        if (!caseName) return;
        
        const lowerCaseName = caseName.toLowerCase();
        let alreadyAdded = false;
        seenNames.forEach(name => {
          if (name.includes(lowerCaseName) || lowerCaseName.includes(name)) {
            alreadyAdded = true;
          }
        });
        if (alreadyAdded) return;
        
        const dpText = `${caseName} ${dp.holdingRelevant || ""} ${dp.citation || ""}`.toLowerCase();
        let relevant = false;
        
        if (matchedKeys.has("Issue 3") && (dpText.includes("privacy") || dpText.includes("article 21") || dpText.includes("personal liberty") || dpText.includes("speech") || dpText.includes("article 19") || dpText.includes("hearing") || dpText.includes("natural justice") || dpText.includes("procedure"))) {
          relevant = true;
        }
        if (matchedKeys.has("Issue 2") && (dpText.includes("arbitrary") || dpText.includes("article 14") || dpText.includes("equality") || dpText.includes("classification"))) {
          relevant = true;
        }
        if (matchedKeys.has("Issue 1") && (dpText.includes("jurisdiction") || dpText.includes("maintainability") || dpText.includes("writ") || dpText.includes("article 226") || dpText.includes("article 32") || dpText.includes("alternative remedy"))) {
          relevant = true;
        }
        if (matchedKeys.has("Issue 4") && (dpText.includes("remedy") || dpText.includes("relief") || dpText.includes("compensation") || dpText.includes("damages"))) {
          relevant = true;
        }
        
        if (relevant || matchedKeys.size === 0) {
          seenNames.add(lowerCaseName);
          matchedAuthorities.push({
            name: caseName,
            display: caseName,
            ratio: dp.holdingRelevant || "Relevant constitutional holding for this dispute.",
            section: dp.citation || "Citation unverified"
          });
        }
      });
    }
  } catch (e) {
    console.error("Error merging dynamic precedents in getAuthoritiesForIssueAndStance:", e);
  }
  
  return matchedAuthorities;
}

export function validateDraftForm() {
  const notesInput = document.getElementById('builder-notes-input');
  const submitBtn = document.getElementById('btn-builder-submit');
  if (!notesInput || !submitBtn) return;
  
  const hasValidNotes = notesInput.value.trim().length >= 5;
  const hasAuthorities = selectedAuthorities.length > 0;
  
  submitBtn.disabled = !(hasValidNotes || hasAuthorities);
}

export function toggleAuthority(caseName, ratio) {
  const index = selectedAuthorities.findIndex(a => a.name === caseName);
  if (index >= 0) {
    selectedAuthorities.splice(index, 1);
    showToast(`Deselected: ${caseName}`, "info");
  } else {
    selectedAuthorities.push({ name: caseName, ratio: ratio });
    showToast(`Selected: ${caseName}`, "ok");
  }
  validateDraftForm();
  renderPreDraftAuthorities();
}

export function renderPreDraftAuthorities() {
  const container = document.getElementById('pre-draft-chips');
  if (!container) return;

  let stance = getCurrentSelectedSide() || selectedSide || 'Petitioner';
  if (stance.toLowerCase().includes('petitioner') || stance.toLowerCase().includes('appellant') || stance.toLowerCase().includes('challenger')) {
    stance = 'Petitioner';
  } else if (stance.toLowerCase().includes('respondent') || stance.toLowerCase().includes('defense') || stance.toLowerCase().includes('opposition')) {
    stance = 'Respondent';
  }

  const issueSelect = document.getElementById('builder-issue-select');
  const issueVal = issueSelect ? issueSelect.value : '';

  const authorities = getAuthoritiesForIssueAndStance(issueVal, stance);

  if (authorities.length === 0) {
    container.innerHTML = `<div class="text-[11px] text-white-muted italic py-1 font-sans">No key recommendations for this issue.</div>`;
    return;
  }

  container.innerHTML = authorities.map((auth) => {
    const isSelected = selectedAuthorities.some(a => a.name === auth.name);

    if (isSelected) {
      return `
        <div onclick="window.toggleAuthority('${auth.name.replace(/'/g, "\\'")}', '${auth.ratio.replace(/'/g, "\\'")}')" class="flex items-center justify-between p-2.5 bg-emerald-500/5 border border-emerald-500/35 rounded-lg gap-2 cursor-pointer transition-all hover:bg-emerald-500/10">
          <div class="flex flex-col gap-0.5">
            <div class="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 font-sans">
              <span>✓</span> ${esc(auth.display || auth.name)}
            </div>
            <div class="text-[10px] text-emerald-300/70 leading-tight font-sans">${esc(auth.ratio)}</div>
          </div>
          <span class="px-2.5 py-1 text-[9px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 rounded shrink-0 font-sans">Selected</span>
        </div>
      `;
    } else {
      return `
        <div onclick="window.toggleAuthority('${auth.name.replace(/'/g, "\\'")}', '${auth.ratio.replace(/'/g, "\\'")}')" class="flex items-center justify-between p-2.5 bg-white/[0.03] border border-white/10 rounded-lg hover:border-moot-accent/50 transition-all gap-2 cursor-pointer hover:bg-white/[0.06]">
          <div class="flex flex-col gap-0.5">
            <div class="text-xs font-semibold text-white flex items-center gap-1.5 font-sans">
              <span>⚖️</span> ${esc(auth.display || auth.name)}
            </div>
            <div class="text-[10px] text-white-muted leading-tight font-sans">${esc(auth.ratio)}</div>
          </div>
          <button type="button" class="btn-sm px-3 py-1.5 bg-white/5 border border-white/10 text-white-muted font-semibold rounded text-[10px] uppercase tracking-wider hover:bg-white/10 hover:text-white transition-all shrink-0 font-sans border-none">
            Select
          </button>
        </div>
      `;
    }
  }).join('');
}

export function renderStage3Workspace() {
  const stance = getCurrentSelectedSide() || selectedSide || 'Petitioner';
  const sideBadge = document.getElementById('stage3-side-badge');
  if (sideBadge) {
    sideBadge.textContent = stance.toUpperCase();
    if (stance.toLowerCase().includes('petitioner')) {
      sideBadge.className = 'text-xs font-semibold tracking-widest text-center py-2 px-3 rounded-md border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-sans';
    } else {
      sideBadge.className = 'text-xs font-semibold tracking-widest text-center py-2 px-3 rounded-md border bg-rose-500/10 border-rose-500/20 text-rose-400 font-sans';
    }
  }

  const issueSelect = document.getElementById('builder-issue-select');
  const selectedIssueText = document.getElementById('stage3-selected-issue-text');
  if (selectedIssueText && issueSelect) {
    selectedIssueText.textContent = issueSelect.value || 'No issue selected yet.';
  }

  const caseContext = document.getElementById('stage3-case-context');
  if (caseContext) {
    if (currentPropositionContext) {
      caseContext.innerHTML = fmtInline(currentPropositionContext);
    } else {
      caseContext.textContent = 'Upload and analyze a proposition to see summary context here.';
    }
  }

  validateDraftForm();

  const notesInput = document.getElementById('builder-notes-input');
  if (notesInput) {
    updateLiveIntelligence(notesInput.value);
  }

  renderPreDraftAuthorities();
}

function getImprovementPathwayHTML(notes, casesCount, statutesCount, scoring, finalReadinessScore) {
  const lowerNotes = notes.toLowerCase();
  
  const hasCases = casesCount > 0;
  const hasStatutes = statutesCount > 0;
  const hasCounter = /counterargument|anticipate|opposing|respondent submits|petitioner argues|defense|challenge/gi.test(notes);
  const hasRelief = /prayer|relief|conclusion|declare|compensation|damages/gi.test(notes);
  const hasDepth = notes.length >= 150;

  const rawNotesScore = Math.max(15, Math.min(60, (casesCount * 10) + (statutesCount * 8) + Math.round(notes.length / 15)));
  
  const checklist = [
    { label: "Landmark Case Precedents", met: hasCases, hint: "Insert relevant case law from registry below." },
    { label: "Constitutional & Statutory Articles", met: hasStatutes, hint: "Cite explicit articles (e.g. Article 14, 19, 21)." },
    { label: "Anticipated Counterarguments", met: hasCounter, hint: "Address the other side's core defenses or claims." },
    { label: "Explicit Relief & Prayer", met: hasRelief, hint: "Outline the specific declarations and directions sought." },
    { label: "Factual Narrative Depth", met: hasDepth, hint: "Expand on the specific proposition facts." }
  ];

  const metCount = checklist.filter(item => item.met).length;

  return `
    <div class="p-4 bg-white/5 border border-white/10 rounded-xl flex flex-col gap-3 font-sans md:col-span-2">
      <div class="flex justify-between items-center border-b border-white/5 pb-2">
        <span class="text-xs uppercase tracking-wider text-white-2 font-semibold font-sans">📈 Appellate Improvement Pathway</span>
        <span class="text-[10px] font-bold text-moot-accent uppercase tracking-widest font-sans">Progress to Elite Status</span>
      </div>

      <!-- Progression Pathway Progress Bar -->
      <div class="flex items-center justify-between gap-4 mt-1 font-sans">
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-[9px] uppercase text-white-muted tracking-wider">1. Initial Notes</span>
          <div class="w-6 h-6 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center text-[10px] font-bold">${rawNotesScore}%</div>
        </div>
        <div class="flex-1 h-[2px] bg-white/10 relative">
          <div class="absolute top-[-3px] left-0 w-2 h-2 rounded-full bg-indigo-500"></div>
        </div>
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-[9px] uppercase text-white-muted tracking-wider">2. Current Draft</span>
          <div class="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold">${finalReadinessScore}%</div>
        </div>
        <div class="flex-1 h-[2px] bg-white/10 relative">
          <div class="absolute top-[-3px] left-0 w-2 h-2 rounded-full bg-moot-accent"></div>
        </div>
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-[9px] uppercase text-white-muted tracking-wider">3. Target (Elite)</span>
          <div class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold">95%+</div>
        </div>
      </div>

      <!-- Deficiency Diagnostics -->
      <div class="flex flex-col gap-2 mt-2">
        <span class="text-[9px] uppercase text-white-muted tracking-widest font-sans font-semibold">Deficiency Diagnostics (${metCount}/5 Passed)</span>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          ${checklist.map(item => {
            const badgeCls = item.met 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : 'bg-red-500/10 text-red-400 border border-red-500/20';
            const icon = item.met ? '✔' : '⚠';
            return `
              <div class="p-2.5 rounded border ${badgeCls} flex flex-col gap-0.5 font-sans">
                <span class="text-[10px] font-semibold flex items-center gap-1 font-sans">
                  <span>${icon}</span> ${esc(item.label)}
                </span>
                <span class="text-[9px] text-white-muted leading-tight mt-0.5 font-sans">${esc(item.hint)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}
