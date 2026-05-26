import { analyzeProposition, logSessionSecurely } from '../services/api.js';
import { currentUser } from '../services/firebase.js';
import { 
  showToast, 
  showWsPanel, 
  loadRecentSessions,
  showStructuredResults,
  showResults,
  showError,
  showRejection
} from './ui.js';

// Controller State
export let selectedFile = null;

export function initDashboard() {
  const dz = document.getElementById('ws-dropzone');
  const fileInput = document.getElementById('ws-file-input');
  const analyzeBtn = document.getElementById('btn-analyze');
  const removeBtn = document.querySelector('.fp-remove');

  if (dz) {
    dz.addEventListener('dragover', e => { 
      e.preventDefault(); 
      dz.classList.add('drag-over'); 
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => { 
      e.preventDefault(); 
      dz.classList.remove('drag-over'); 
      if (e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
      await runAnalysis();
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      removeFile();
    });
  }
}

export function handleFileSelect(file) {
  if (!file) return;
  if (file.type !== 'application/pdf') { 
    showToast('Only PDF files are accepted.', 'err'); 
    return; 
  }
  selectedFile = file;
  const mb = (file.size / 1048576).toFixed(2);
  
  const fpName = document.getElementById('fp-name');
  const fpSize = document.getElementById('fp-size');
  const wsibFile = document.getElementById('wsib-file');
  const resFileChip = document.getElementById('res-file-chip');
  const filePill = document.getElementById('ws-file-pill');
  const dropzone = document.getElementById('ws-dropzone');
  const analyzeBtn = document.getElementById('btn-analyze');

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
  const fi = document.getElementById('ws-file-input');
  if (fi) fi.value = '';
  
  const filePill = document.getElementById('ws-file-pill');
  const dropzone = document.getElementById('ws-dropzone');
  const analyzeBtn = document.getElementById('btn-analyze');
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
  if (!selectedFile) return;

  const analyzeBtn = document.getElementById('btn-analyze');
  const loadingOverlay = document.getElementById('loading-overlay');

  if (loadingOverlay) loadingOverlay.classList.add('show');
  startSteps();
  if (analyzeBtn) analyzeBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const data = await analyzeProposition(formData);

    if (data.isRejection) {
      stopSteps();
      await sleep(400);
      hideLoading();
      showRejection(data.error, data.documentType);
      return;
    }

    if (data.isStructured && data.response && typeof data.response === 'object') {
      if (currentUser) {
        try {
          const mootName = document.getElementById('ws-moot-name')?.value?.trim() || 'Untitled Moot';
          await logSessionSecurely({
            uid: currentUser.uid,
            type: 'analysis',
            mootName: mootName,
            fileName: selectedFile.name,
            score: data.response.overallScore || 0,
            analysisData: data.response
          });
          loadRecentSessions(); 
        } catch (fbError) {
          console.error("Failed to save to cloud:", fbError);
          showToast("Failed to save to cloud: " + fbError.message, "err");
        }
      }

      stopSteps();
      await sleep(400);
      hideLoading();
      showStructuredResults(data.response);
      return;
    }

    const raw = data.response || data.analysis || data.result || data.text ||
                (typeof data === 'string' ? data : JSON.stringify(data));
    const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (!rawStr || rawStr.length < 20) throw new Error('AI analysis returned an empty response. Please try again.');
    
    stopSteps();
    await sleep(400);
    hideLoading();
    showResults(rawStr);

  } catch(err) {
    stopSteps();
    await sleep(400);
    hideLoading();
    showError(err.message);
  } finally {
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}
