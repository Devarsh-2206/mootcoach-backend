import { analyzeProposition, logSessionSecurely } from '../services/api.js';
import { currentUser } from '../services/firebase.js';
import { 
  showToast, 
  showWsPanel, 
  loadRecentSessions,
  showStructuredResults,
  showResults,
  showError,
  showRejection,
  loadSavedSession
} from './ui.js';

// Controller State
export let selectedFile = null;

export function initDashboard() {
  const dz = document.getElementById('ws-dropzone');
  const removeBtn = document.getElementById('fp-remove');

  if (dz) {
    dz.addEventListener('dragenter', e => {
      e.preventDefault();
      console.log("[UPLOAD_DEBUG] Drag detected (dragenter)");
      dz.classList.add('drag-over');
    });
    dz.addEventListener('dragover', e => { 
      e.preventDefault(); 
      if (!dz.classList.contains('drag-over')) {
        console.log("[UPLOAD_DEBUG] Drag detected (dragover)");
        dz.classList.add('drag-over'); 
      }
    });
    dz.addEventListener('dragleave', e => {
      e.preventDefault();
      console.log("[UPLOAD_DEBUG] Drag left (dragleave)");
      dz.classList.remove('drag-over');
    });
    dz.addEventListener('drop', e => { 
      e.preventDefault(); 
      console.log("[UPLOAD_DEBUG] Drop detected");
      dz.classList.remove('drag-over'); 
      if (e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      } else {
        console.warn("[UPLOAD_DEBUG] Drop occurred but no file was found in dataTransfer.");
      }
    });
  }

  const uploadInput = document.getElementById('proposition-upload');
  if (uploadInput) {
    uploadInput.addEventListener('change', e => {
      console.log("[UPLOAD_DEBUG] File input change event fired");
      handleFileSelect(e);
    });
  }

  const analyzeBtn = document.getElementById('analyze-submit-btn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await runAnalysis();
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      removeFile();
    });
  }
}

export function handleFileSelect(fileOrEvent) {
  const file = (fileOrEvent instanceof Event) ? fileOrEvent.target.files[0] : fileOrEvent;
  if (!file) {
    console.warn("[UPLOAD_DEBUG] handleFileSelect called but no file was provided.");
    return;
  }
  if (file.type !== 'application/pdf') { 
    console.warn(`[UPLOAD_DEBUG] Invalid file type selected: ${file.type}. Rejects.`);
    showToast('Only PDF files are accepted.', 'err'); 
    return; 
  }
  selectedFile = file;
  const mb = (file.size / 1048576).toFixed(2);
  console.log(`[UPLOAD_DEBUG] File selected: ${file.name} (${mb} MB)`);
  
  const fpName = document.getElementById('fp-name');
  const fpSize = document.getElementById('fp-size');
  const wsibFile = document.getElementById('wsib-file');
  const resFileChip = document.getElementById('res-file-chip');
  const filePill = document.getElementById('ws-file-pill');
  const dropzone = document.getElementById('ws-dropzone');
  const analyzeBtn = document.getElementById('analyze-submit-btn');

  if (fpName) fpName.textContent = file.name;
  if (fpSize) fpSize.textContent = `${mb} MB · PDF`;
  if (wsibFile) {
    wsibFile.textContent = file.name;
    wsibFile.className = 'wsib-value';
  }
  if (resFileChip) resFileChip.textContent = `· ${file.name}`;
  if (filePill) filePill.classList.add('show');
  if (dropzone) dropzone.style.display = 'none';
  if (analyzeBtn) analyzeBtn.disabled = false;
}

export function removeFile() {
  selectedFile = null;
  const fi = document.getElementById('proposition-upload');
  if (fi) fi.value = '';
  
  const filePill = document.getElementById('ws-file-pill');
  const dropzone = document.getElementById('ws-dropzone');
  const analyzeBtn = document.getElementById('analyze-submit-btn');
  const wsibFile = document.getElementById('wsib-file');

  if (filePill) filePill.classList.remove('show');
  if (dropzone) dropzone.style.display = '';
  if (analyzeBtn) analyzeBtn.disabled = true;
  if (wsibFile) { 
    wsibFile.textContent = 'No file uploaded'; 
    wsibFile.className = 'wsib-value empty'; 
  }
}

const STEP_MSGS = ['Reading your PDF…','Extracting text content…','Sending to Groq AI…','Generating analysis…','Saving securely to Cloud…'];
let stepTimer = null, currentStep = 0;

function startSteps() {
  currentStep = 0;
  for(let i=1;i<=5;i++) {
    const s = document.getElementById(`ls-${i}`);
    if (s) s.className='lo-step';
  }
  activateStep(1);
  stepTimer = setInterval(() => { 
    if(currentStep<4){ 
      doneStep(currentStep); 
      activateStep(currentStep+1); 
    } 
  }, 900);
}

function activateStep(n) {
  currentStep = n;
  document.getElementById(`ls-${n}`)?.classList.add('active');
  const label = document.getElementById('lo-label');
  if (label) label.textContent = STEP_MSGS[n-1];
}

function doneStep(n) {
  const el = document.getElementById(`ls-${n}`);
  if(el){ el.classList.remove('active'); el.classList.add('done'); }
}

function stopSteps() {
  clearInterval(stepTimer);
  for(let i=1;i<=5;i++) doneStep(i);
  const label = document.getElementById('lo-label');
  if (label) label.textContent = 'Saved!';
}

function hideLoading() { 
  document.getElementById('loading-overlay')?.classList.remove('show'); 
}

function sleep(ms) { 
  return new Promise(r=>setTimeout(r,ms)); 
}

export async function runAnalysis() {
  if (!selectedFile) {
    console.warn("[UPLOAD_DEBUG] runAnalysis triggered but selectedFile is null.");
    return;
  }

  const analyzeBtn = document.getElementById('analyze-submit-btn');
  const loadingOverlay = document.getElementById('loading-overlay');

  if (loadingOverlay) loadingOverlay.classList.add('show');
  startSteps();
  if (analyzeBtn) analyzeBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', selectedFile);

  console.log(`[UPLOAD_DEBUG] Upload started for file: ${selectedFile.name}`);

  try {
    const data = await analyzeProposition(formData);
    console.log("[UPLOAD_DEBUG] Upload completed.");
    console.log("[UPLOAD_DEBUG] Parsing started.");

    if (data.isRejection) {
      console.log(`[UPLOAD_DEBUG] Parsing completed with rejection: ${data.error}`);
      stopSteps();
      await sleep(400);
      hideLoading();
      showRejection(data.error, data.documentType);
      return;
    }

    let newMootId = null;
    if (data.isStructured && data.response && typeof data.response === 'object') {
      console.log("[UPLOAD_DEBUG] Parsing completed successfully (Structured JSON response).");
      // Stash forum intelligence immediately so the Simulator adapts even before save/reload.
      if (data.forumIntelligence) window.forumIntelligence = data.forumIntelligence;
      // Also stash the lightweight P0 forum detection as a reliable fallback.
      if (data.detectedForum) window.detectedForum = data.detectedForum;
      if (currentUser) {
        try {
          const mootName = document.getElementById('ws-moot-name')?.value?.trim() || 'Untitled Moot';
          const logRes = await logSessionSecurely({
            uid: currentUser.uid,
            type: 'analysis',
            mootName: mootName,
            fileName: selectedFile.name,
            score: data.response.overallScore || 0,
            analysisData: data.response,
            propositionIntelligence: data.propositionIntelligence || null,
            proceduralHierarchy: data.proceduralHierarchy || null,
            forumIntelligence: data.forumIntelligence || null,
            issueIntelligence: data.issueIntelligence || null,
            authorityIntelligence: data.authorityIntelligence || null,
            advocacyIntelligence: data.advocacyIntelligence || null
          });
          newMootId = logRes.id;
          await loadRecentSessions(); 
        } catch (fbError) {
          console.error("Failed to save to cloud:", fbError);
          showToast("Failed to save to cloud: " + fbError.message, "err");
        }
      }

      stopSteps();
      await sleep(400);
      hideLoading();
      
      if (newMootId) {
        await loadSavedSession(newMootId);
      } else {
        showStructuredResults(data.response);
      }
      return;
    }

    const raw = data.response || data.analysis || data.result || data.text ||
                (typeof data === 'string' ? data : JSON.stringify(data));
    const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (!rawStr || rawStr.length < 20) {
      throw new Error('AI analysis returned an empty response. Please try again.');
    }
    
    console.log("[UPLOAD_DEBUG] Parsing completed successfully (Raw text response).");
    stopSteps();
    await sleep(400);
    hideLoading();
    showResults(rawStr);

  } catch(err) {
    console.error(`[UPLOAD_DEBUG] Parsing completed with error: ${err.message}`);
    stopSteps();
    await sleep(400);
    hideLoading();
    showError(err.message);
  } finally {
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}
