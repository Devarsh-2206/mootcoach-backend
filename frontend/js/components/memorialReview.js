/**
 * Memorial Review — upload a memorial and have it marked.
 *
 * Deliberately self-contained: it builds its own overlay, owns its own markup,
 * and touches nothing else in the app. If it fails it fails inside the modal,
 * which matters because it is being added shortly before live user testing and
 * must not be able to take any existing flow down with it.
 *
 * The backend does the work in two halves — a structural audit measured in code
 * (sections, Index-versus-body consistency, numbering, limits, register) and a
 * content review by the model. Audit findings are shown first because they are
 * measured rather than judged.
 */
import { BASE_URL } from '../config.js';

const SEVERITY = {
  critical: { label: 'Critical', bg: '#fdecea', border: '#f5c6c0', ink: '#8a1c12' },
  major:    { label: 'Major',    bg: '#fff5e6', border: '#f3d9a8', ink: '#8a5a00' },
  minor:    { label: 'Minor',    bg: '#f3f4f6', border: '#dcdee2', ink: '#4b5563' },
};

const esc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

function scoreColour(n) {
  if (n >= 75) return '#1d7a4c';
  if (n >= 60) return '#8a5a00';
  if (n >= 45) return '#a0522d';
  return '#8a1c12';
}

function buildOverlay() {
  const o = el(`
    <div id="mr-overlay" style="position:fixed;inset:0;z-index:12000;background:rgba(20,16,12,.55);
         backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;
         overflow-y:auto;padding:32px 16px;">
      <div id="mr-panel" style="background:#fcfbfa;color:#2b2622;max-width:880px;width:100%;
           border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.4);overflow:hidden;
           font-family:Georgia,'Times New Roman',serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;
             padding:16px 22px;background:#f4f2ee;border-bottom:1px solid #e3e0d9;">
          <div>
            <div style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:.18em;
                 text-transform:uppercase;color:#8a7f70;">MootCoach</div>
            <div style="font-size:19px;font-weight:700;">Memorial Review</div>
          </div>
          <button id="mr-close" aria-label="Close"
                  style="background:none;border:none;font-size:26px;line-height:1;cursor:pointer;color:#6b6257;">&times;</button>
        </div>
        <div id="mr-body" style="padding:22px;"></div>
      </div>
    </div>`);
  o.addEventListener('click', e => { if (e.target === o) close(); });
  o.querySelector('#mr-close').addEventListener('click', close);
  return o;
}

function close() {
  const o = document.getElementById('mr-overlay');
  if (o) o.remove();
  document.removeEventListener('keydown', onEsc);
}
function onEsc(e) { if (e.key === 'Escape') close(); }

const FORM = `
  <p style="margin:0 0 16px;line-height:1.6;color:#4a4238;">
    Upload a memorial as a text-based PDF. MootCoach checks its structure against what
    competitions expect, then marks the substance — the law, the use of the record, and
    the argument.
  </p>
  <label style="display:block;font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.12em;
         text-transform:uppercase;color:#6b6257;margin-bottom:6px;">Memorial (PDF)</label>
  <input id="mr-file" type="file" accept="application/pdf,.pdf"
         style="width:100%;padding:12px;border:1px dashed #cfc9bd;border-radius:10px;background:#f7f5f1;margin-bottom:16px;">
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
    <div style="flex:1;min-width:150px;">
      <label style="display:block;font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.12em;
             text-transform:uppercase;color:#6b6257;margin-bottom:6px;">Side</label>
      <select id="mr-side" style="width:100%;padding:10px;border:1px solid #d8d3c9;border-radius:8px;background:#fff;">
        <option value="">Not specified</option>
        <option value="Petitioner">Petitioner / Appellant</option>
        <option value="Respondent">Respondent</option>
      </select>
    </div>
    <div style="flex:1;min-width:130px;">
      <label style="display:block;font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.12em;
             text-transform:uppercase;color:#6b6257;margin-bottom:6px;">Word limit</label>
      <input id="mr-words" type="number" min="0" placeholder="e.g. 12000"
             style="width:100%;padding:10px;border:1px solid #d8d3c9;border-radius:8px;background:#fff;">
    </div>
    <div style="flex:1;min-width:130px;">
      <label style="display:block;font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.12em;
             text-transform:uppercase;color:#6b6257;margin-bottom:6px;">Page limit</label>
      <input id="mr-pages" type="number" min="0" placeholder="e.g. 35"
             style="width:100%;padding:10px;border:1px solid #d8d3c9;border-radius:8px;background:#fff;">
    </div>
  </div>
  <button id="mr-go" style="width:100%;padding:14px;border:none;border-radius:10px;background:#B0392E;
          color:#fff;font-family:system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:.14em;
          text-transform:uppercase;cursor:pointer;">Review this memorial</button>
  <div id="mr-status" style="margin-top:14px;font-size:13px;color:#6b6257;min-height:20px;"></div>`;

function renderResult(data) {
  const m = data.metrics || {};
  const r = data.review || {};
  const sections = data.sections || [];
  const missing = sections.filter(s => !s.present).map(s => s.label);
  const corr = Array.isArray(r.corrections) ? r.corrections : [];
  const order = { critical: 0, major: 1, minor: 2 };
  corr.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

  const scoreRow = (k, v) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:5px;">
      <div style="width:150px;font-family:system-ui,sans-serif;font-size:11px;color:#6b6257;">${esc(k)}</div>
      <div style="flex:1;height:7px;background:#eceae5;border-radius:4px;overflow:hidden;">
        <div style="width:${Math.max(0, Math.min(100, Number(v) || 0))}%;height:100%;background:${scoreColour(v)};"></div>
      </div>
      <div style="width:34px;text-align:right;font-weight:700;font-size:13px;">${esc(v)}</div>
    </div>`;

  const LABELS = {
    knowledgeOfLaw: 'Knowledge of law', useOfFacts: 'Use of facts', analysis: 'Analysis',
    structure: 'Structure', research: 'Research', languageAndStyle: 'Language & style',
    compliance: 'Compliance',
  };

  return `
    <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;
         padding:18px;background:#f7f5f1;border:1px solid #e3e0d9;border-radius:12px;margin-bottom:20px;">
      <div style="text-align:center;min-width:110px;">
        <div style="font-size:46px;font-weight:700;line-height:1;color:${scoreColour(r.overallScore)};">${esc(r.overallScore ?? '—')}</div>
        <div style="font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.14em;
             text-transform:uppercase;color:#6b6257;margin-top:4px;">${esc(r.grade || '')}</div>
      </div>
      <div style="flex:1;min-width:240px;line-height:1.6;">${esc(r.verdict || '')}</div>
    </div>

    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:22px;">
      <div style="flex:1;min-width:260px;">
        <div style="font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.14em;
             text-transform:uppercase;color:#6b6257;margin-bottom:10px;">Marks</div>
        ${Object.entries(LABELS).map(([k, label]) =>
          (r.scores && r.scores[k] !== undefined) ? scoreRow(label, r.scores[k]) : '').join('')}
      </div>
      <div style="flex:1;min-width:230px;">
        <div style="font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.14em;
             text-transform:uppercase;color:#6b6257;margin-bottom:10px;">Measured</div>
        <div style="font-size:13px;line-height:1.9;color:#4a4238;">
          ${m.words != null ? `Words: <b>${esc(m.words.toLocaleString())}</b>${m.limits && m.limits.words && m.limits.words.over ? ` <span style="color:#8a1c12;">over the ${esc(m.limits.words.limit)} limit</span>` : ''}<br>` : ''}
          ${m.pages != null ? `Pages: <b>${esc(m.pages)}</b>${m.limits && m.limits.pages && m.limits.pages.over ? ` <span style="color:#8a1c12;">over the ${esc(m.limits.pages.limit)} limit</span>` : ''}<br>` : ''}
          Sections: <b>${esc(m.sectionsPresent)}/${esc(m.sectionsExpected)}</b><br>
          Numbered paragraphs: <b>${esc(m.numberedParagraphs)}</b>${m.numbering && m.numberedParagraphs && !m.numbering.continuous ? ` <span style="color:#8a5a00;">(not continuous)</span>` : ''}<br>
          Authorities in the Index: <b>${esc(m.indexCases)}</b>, cited in the body: <b>${esc(m.bodyCases)}</b>
          ${m.authoritiesNotIndexed ? `<br><span style="color:#8a1c12;">${esc(m.authoritiesNotIndexed)} cited but not indexed</span>` : ''}
          ${m.authoritiesNotCited ? `<br><span style="color:#8a5a00;">${esc(m.authoritiesNotCited)} indexed but never cited</span>` : ''}
          ${missing.length ? `<br><span style="color:#8a1c12;">Missing: ${esc(missing.join(', '))}</span>` : ''}
        </div>
      </div>
    </div>

    ${Array.isArray(r.topPriorities) && r.topPriorities.length ? `
      <div style="padding:16px 18px;background:#fff9ec;border:1px solid #f0dfb5;border-radius:12px;margin-bottom:22px;">
        <div style="font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.14em;
             text-transform:uppercase;color:#8a5a00;margin-bottom:8px;">Fix these first</div>
        <ol style="margin:0;padding-left:20px;line-height:1.75;">${r.topPriorities.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
      </div>` : ''}

    ${corr.length ? `
      <div style="font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.14em;
           text-transform:uppercase;color:#6b6257;margin-bottom:10px;">Corrections (${corr.length})</div>
      ${corr.map(c => {
        const s = SEVERITY[c.severity] || SEVERITY.minor;
        return `<div style="border:1px solid ${s.border};background:${s.bg};border-radius:10px;padding:12px 14px;margin-bottom:10px;">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:5px;">
            <span style="font-family:system-ui,sans-serif;font-size:9.5px;font-weight:700;letter-spacing:.12em;
                  text-transform:uppercase;color:${s.ink};">${s.label}</span>
            ${c.area ? `<span style="font-family:system-ui,sans-serif;font-size:9.5px;color:#6b6257;">${esc(c.area)}</span>` : ''}
            ${c.where ? `<span style="font-family:system-ui,sans-serif;font-size:9.5px;color:#6b6257;">· ${esc(c.where)}</span>` : ''}
            ${c.source === 'audit' ? `<span style="font-family:system-ui,sans-serif;font-size:9px;color:#8a7f70;margin-left:auto;">measured</span>` : ''}
          </div>
          <div style="line-height:1.6;margin-bottom:4px;">${esc(c.problem)}</div>
          ${c.fix ? `<div style="line-height:1.6;color:#4a4238;"><b>Fix:</b> ${esc(c.fix)}</div>` : ''}
        </div>`;
      }).join('')}` : ''}

    ${Array.isArray(r.lawConcerns) && r.lawConcerns.length ? `
      <div style="font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;
           color:#6b6257;margin:20px 0 10px;">Authorities to check</div>
      ${r.lawConcerns.map(l => `<div style="border-left:3px solid #d8d3c9;padding:4px 0 4px 12px;margin-bottom:10px;line-height:1.6;">
        <b>${esc(l.authority)}</b> <span style="font-family:system-ui,sans-serif;font-size:10px;color:#8a7f70;">(${esc(l.confidence || '')} confidence)</span><br>
        ${esc(l.concern)}${l.action ? `<br><span style="color:#4a4238;"><b>Do:</b> ${esc(l.action)}</span>` : ''}
      </div>`).join('')}` : ''}

    ${Array.isArray(r.factConcerns) && r.factConcerns.length ? `
      <div style="font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;
           color:#6b6257;margin:20px 0 10px;">Assertions that may not be in the record</div>
      ${r.factConcerns.map(f => `<div style="border-left:3px solid #f3d9a8;padding:4px 0 4px 12px;margin-bottom:10px;line-height:1.6;">
        ${esc(f.assertion)}<br><span style="color:#4a4238;">${esc(f.concern)}</span>
      </div>`).join('')}` : ''}

    ${Array.isArray(r.strengths) && r.strengths.length ? `
      <div style="font-family:system-ui,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;
           color:#6b6257;margin:20px 0 10px;">What works</div>
      <ul style="margin:0;padding-left:20px;line-height:1.75;">${r.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}

    <div style="margin-top:22px;padding-top:14px;border-top:1px solid #e3e0d9;
         font-family:system-ui,sans-serif;font-size:11px;color:#8a7f70;line-height:1.6;">
      MootCoach has no access to SCC Online, Manupatra or any law database. Anything it says about
      an authority needs checking against the reporter before you rely on it.
    </div>
    <button id="mr-again" style="margin-top:16px;width:100%;padding:12px;border:1px solid #d8d3c9;
            border-radius:10px;background:#fff;font-family:system-ui,sans-serif;font-size:11px;
            letter-spacing:.14em;text-transform:uppercase;cursor:pointer;">Review another memorial</button>`;
}

function attachForm(body) {
  body.innerHTML = FORM;
  const go = body.querySelector('#mr-go');
  const status = body.querySelector('#mr-status');

  go.addEventListener('click', async () => {
    const f = body.querySelector('#mr-file').files[0];
    if (!f) { status.textContent = 'Choose a PDF first.'; return; }
    if (f.size > 25 * 1024 * 1024) { status.textContent = 'That file is over 25MB. Export a smaller PDF.'; return; }

    go.disabled = true;
    go.style.opacity = '.6';
    go.textContent = 'Reviewing…';
    status.textContent = 'Reading the memorial and marking it. This usually takes under a minute.';

    const fd = new FormData();
    fd.append('file', f);
    const side = body.querySelector('#mr-side').value;
    const words = body.querySelector('#mr-words').value;
    const pages = body.querySelector('#mr-pages').value;
    if (side) fd.append('side', side);
    if (words) fd.append('wordLimit', words);
    if (pages) fd.append('pageLimit', pages);

    try {
      const res = await fetch(`${BASE_URL}/api/analyse-memorial`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Failed with status ${res.status}`);
      body.innerHTML = renderResult(data);
      const again = body.querySelector('#mr-again');
      if (again) again.addEventListener('click', () => attachForm(body));
      body.scrollIntoView({ block: 'start' });
    } catch (err) {
      status.innerHTML = `<span style="color:#8a1c12;">${esc(err.message)}</span>`;
      go.disabled = false;
      go.style.opacity = '1';
      go.textContent = 'Review this memorial';
    }
  });
}

export function openMemorialReview() {
  close();
  const o = buildOverlay();
  document.body.appendChild(o);
  attachForm(o.querySelector('#mr-body'));
  document.addEventListener('keydown', onEsc);
}

// The sidebar button is plain HTML with an onclick, like the rest of the app.
window.openMemorialReview = openMemorialReview;
