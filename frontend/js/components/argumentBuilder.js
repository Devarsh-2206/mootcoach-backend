import { buildArgument } from '../services/api.js';
import { 
  lastAnalysis, 
  showToast, 
  fmtInline, 
  esc 
} from './ui.js';

// Argument Builder State
export let lastBuiltArgument = null;

export function initArgumentBuilder() {
  const form = document.getElementById('builder-form');
  const notesInput = document.getElementById('builder-notes-input');
  const submitBtn = document.getElementById('btn-builder-submit');

  if (!form || !notesInput || !submitBtn) {
    console.error("Argument Builder DOM elements not found.");
    return;
  }

  // Validate notes input to enable/disable submit button
  notesInput.addEventListener('input', () => {
    submitBtn.disabled = notesInput.value.trim().length < 5;
  });

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await generateArgument();
  });

  submitBtn.addEventListener('click', async () => {
    await generateArgument();
  });
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
  submitBtn.innerHTML = '<span class="spinner"></span>Weaving…';
  
  if (emptyState) emptyState.style.display = 'none';
  if (outputState) outputState.style.display = 'none';
  if (loadingState) loadingState.style.display = 'flex';

  try {
    const data = await buildArgument(stance, issue, notes);
    
    if (data.success && data.response) {
      lastBuiltArgument = data.response;
      renderIRAC(data.response);
      
      if (loadingState) loadingState.style.display = 'none';
      if (outputState) outputState.style.display = 'flex';
      
      showToast("Argument built successfully!", "ok");
    } else {
      throw new Error(data.error || "Failed to generate argument.");
    }
  } catch (err) {
    console.error("Failed to build argument:", err);
    showToast(err.message, "err");
    
    if (loadingState) loadingState.style.display = 'none';
    if (lastBuiltArgument) {
      if (outputState) outputState.style.display = 'flex';
    } else {
      if (emptyState) emptyState.style.display = 'flex';
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Build Argument →';
  }
}

function renderIRAC(iracData) {
  const issueBox = document.getElementById('builder-irac-issue');
  const ruleBox = document.getElementById('builder-irac-rule');
  const appBox = document.getElementById('builder-irac-application');
  const concBox = document.getElementById('builder-irac-conclusion');

  if (issueBox) issueBox.innerHTML = fmtInline(iracData.issue || '');
  if (ruleBox) ruleBox.innerHTML = fmtInline(iracData.rule || '');
  if (appBox) appBox.innerHTML = fmtInline(iracData.application || '');
  if (concBox) concBox.innerHTML = fmtInline(iracData.conclusion || '');
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
        btn.textContent = 'Copy Argument';
        btn.classList.remove('copied');
      }, 2000);
    }
    showToast("IRAC argument copied to clipboard!", "ok");
  }).catch(err => {
    showToast("Failed to copy argument: " + err.message, "err");
  });
}
