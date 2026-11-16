/**
 * The student's own competition rules.
 *
 * Upload the rulebook; MootCoach reads it into a rules profile
 * (server: /api/rulebook/read, services/rulebook.js); the student checks
 * every figure against the rulebook, corrects any that are wrong, and
 * confirms. Only a confirmed profile is used, for marking a memorial
 * (memorialScoring.schemeFromProfile) and, later, for drafting and export.
 *
 * Kept per moot in the student's own area
 * (artifacts/moot.coach/users/{uid}/rulebooks/{mootId or "general"}), which
 * only they can read and which "Delete my account" removes. The rulebook PDF
 * itself is not kept.
 */
import { requestJson } from '../services/api.js';
import { db, currentUser, firebaseRef } from '../services/firebase.js';
import { CRITERIA, schemeFromProfile } from './memorialScoring.js';

const esc = v => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function ref(mootId) {
  if (!currentUser) return null;
  return db.collection('artifacts').doc('moot.coach').collection('users').doc(currentUser.uid)
    .collection('rulebooks').doc(String(mootId || 'general').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120));
}

/** The confirmed rules for this moot; null if there are none; undefined if
    they could not be read (offline, say), so a caller keeps what it knows. */
export async function loadRules(mootId) {
  const r = ref(mootId);
  if (!r) return null;
  try {
    const d = await r.get();
    if (!d.exists) return null;
    const x = d.data() || {};
    if (!x.confirmed) return null;
    const profile = JSON.parse(x.json || 'null');
    return profile && schemeFromProfile(profile) ? { profile, fileName: x.fileName || '', mootId: mootId || null } : null;
  } catch (e) { console.warn('[Rulebook] could not load:', e && e.message); return undefined; }
}

async function saveRules(mootId, profile, fileName) {
  const r = ref(mootId);
  if (!r) throw new Error('Please sign in to save your competition rules.');
  await r.set({
    confirmed: true,
    fileName: String(fileName || 'Rulebook').slice(0, 200),
    competition: String((profile.competition && profile.competition.name) || '').slice(0, 160),
    json: JSON.stringify(profile),
    confirmedAt: firebaseRef.firestore.FieldValue.serverTimestamp(),
  });
}

export async function forgetRules(mootId) {
  const r = ref(mootId);
  if (r) { try { await r.delete(); } catch (e) {} }
}

const H = t => `<div style="font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--white-muted);margin:18px 0 8px;">${t}</div>`;
const src = o => (o && (o.rule || o.quote)) ? `<div style="font-size:11.5px;color:var(--white-muted);line-height:1.5;margin-top:2px;">${o.rule ? esc(o.rule) : ''}${o.rule && o.quote ? ': ' : ''}${o.quote ? `“${esc(o.quote)}”` : ''}</div>` : '';
const numInput = (id, v, w = 64) => `<input id="${id}" type="number" min="0" step="0.25" value="${esc(v ?? '')}" style="width:${w}px;padding:5px 6px;border:1px solid var(--rule);border-radius:6px;background:var(--sheet);color:var(--white);font-size:13px;text-align:right;">`;
const BTN = 'padding:12px 14px;border-radius:10px;font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;';

function confirmView(p) {
  const mk = p.marking;
  const ms = (p.penalties || []).find(x => x.kind === 'missingSection');
  const pg = (p.penalties || []).find(x => x.kind === 'pageLimitMemorial');
  const lim = p.limits && p.limits.memorialPages;
  const others = (p.penalties || []).filter(x => x !== ms && x !== pg);
  const f = p.format || {};
  const fmt = [['Font', f.font], ['Size', f.fontSize], ['Line spacing', f.lineSpacing], ['Margins', f.margins], ['Footnotes', f.footnotes],
    ['Page size', f.pageSize], ['Citation style', f.citationStyle], ['Cover colours', f.coverColours]].filter(([, v]) => v !== null && v !== undefined && v !== '');
  const covers = from => Object.entries(from || {}).map(([k, v]) => `${CRITERIA[k] || k}${v < 1 ? ` ${Math.round(v * 100)}%` : ''}`).join(', ');

  return `
  <div style="line-height:1.6;">
    <div style="font-size:18px;font-weight:700;">${esc(p.competition.name)}${p.competition.edition ? ` <span style="font-weight:400;color:var(--white-2);">${esc(p.competition.edition)}</span>` : ''}</div>
    <div style="font-size:13px;color:var(--white-2);margin-top:4px;">Check each figure against your rulebook, correct any that are wrong, then confirm.
      MootCoach uses these only after you confirm them.</div>
    ${(p.warnings || []).length ? `<div style="margin-top:12px;padding:10px 12px;border:1px solid rgba(154,110,0,.32);background:rgba(154,110,0,.08);border-radius:10px;font-size:13px;">
      ${p.warnings.map(w => `<div>⚠ ${esc(w)}</div>`).join('')}</div>` : ''}

    ${H('How the memorial is marked')}
    ${mk ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${mk.heads.map((h, i) => `<tr>
          <td style="padding:6px 0;border-bottom:1px solid var(--rule);">${esc(h.label)}
            <div style="font-size:11.5px;color:var(--white-muted);">MootCoach marks this as: ${esc(covers(h.from) || 'not mapped')}</div></td>
          <td style="padding:6px 0;border-bottom:1px solid var(--rule);text-align:right;white-space:nowrap;">${numInput('rb-h' + i, h.max)}</td></tr>`).join('')}
        <tr><td style="padding:6px 0;font-weight:700;">Out of</td><td style="padding:6px 0;text-align:right;">${numInput('rb-total', mk.total)}</td></tr>
      </table>
      ${src(mk)}
      <div id="rb-sum" style="font-size:12.5px;margin-top:6px;"></div>` : `<div style="font-size:13px;color:var(--error);">The marking scheme could not be found. MootCoach will keep using standard moot marking for this moot.</div>`}

    ${H('Penalties MootCoach can check')}
    <div style="font-size:13px;">
      <div style="padding:6px 0;border-bottom:1px solid var(--rule);">Missing section:
        ${ms ? (ms.basis === 'disqualification' ? '<b>disqualification</b>' : `${numInput('rb-ms', ms.points ?? 0)} ${ms.basis === 'oneTime' ? 'once' : 'per section'}`) : `${numInput('rb-ms', 0)} <span style="color:var(--white-muted);">(not stated in the rulebook)</span>`}
        ${src(ms)}</div>
      <div style="padding:6px 0;border-bottom:1px solid var(--rule);">Page limit for the memorial: ${numInput('rb-pages', lim ? lim.value : '')} pages
        ${lim && lim.excludes ? `<div style="font-size:12px;color:var(--white-2);">Leaving out: ${esc(lim.excludes)}</div>` : ''}
        ${src(lim)}
        <div style="margin-top:4px;">Over the limit: ${pg && pg.basis === 'disqualification' ? '<b>disqualification</b>' : `${numInput('rb-pp', pg && pg.points != null ? pg.points : 0)} per page`}</div>
        ${src(pg)}</div>
      ${p.penaltyCap ? `<div style="padding:6px 0;">Deductions capped at <b>${esc(p.penaltyCap.points)}</b>${src(p.penaltyCap)}</div>` : ''}
    </div>

    ${others.length || fmt.length || (p.sections && p.sections.required.length) || p.anonymity ? `
      ${H('Your checklist: rules MootCoach cannot check from the PDF')}
      <ul style="margin:0;padding-left:18px;font-size:13px;">
        ${others.map(x => `<li style="margin-bottom:6px;">${esc(x.violation)}: <b>${x.basis === 'disqualification' ? 'disqualification' : x.points != null ? esc(x.points) + ' ' + ({ perPage: 'per page', perViolation: 'per violation', perHour: 'per hour', perDay: 'per day', oneTime: 'once' }[x.basis] || '') : 'amount not stated'}</b>${src(x)}</li>`).join('')}
        ${fmt.map(([k, v]) => `<li style="margin-bottom:6px;">${esc(k)}: <b>${esc(v)}</b></li>`).join('')}
        ${p.sections && p.sections.required.length ? `<li style="margin-bottom:6px;">Sections${p.sections.orderRequired ? ', in this order' : ''}: ${esc(p.sections.required.join(' · '))}${src(p.sections)}</li>` : ''}
        ${p.anonymity ? `<li style="margin-bottom:6px;">Anonymity${p.anonymity.consequence ? `: ${esc(p.anonymity.consequence)}` : ''}${src(p.anonymity)}</li>` : ''}
      </ul>` : ''}
    ${(p.notStated || []).length ? `${H('Not stated in this rulebook')}<ul style="margin:0;padding-left:18px;font-size:13px;color:var(--white-2);">${p.notStated.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;">
      <button id="rb-ok" ${mk ? '' : 'disabled'} style="${BTN}flex:2;min-width:200px;border:none;background:var(--gold);color:#FCF9EF;font-weight:700;${mk ? '' : 'opacity:.5;'}">These are right: use them</button>
      <button id="rb-again" style="${BTN}flex:1;min-width:120px;border:1px solid var(--rule);background:var(--sheet);color:var(--white);">Upload again</button>
      <button id="rb-cancel" style="${BTN}flex:1;min-width:100px;border:1px solid var(--rule);background:var(--sheet);color:var(--white);">Cancel</button>
    </div>
  </div>`;
}

/* The student's corrections, read back into the profile. */
function readEdits(box, p) {
  const out = JSON.parse(JSON.stringify(p));
  const val = id => { const el = box.querySelector('#' + id); if (!el || el.value === '') return null; const n = Number(el.value); return Number.isFinite(n) && n >= 0 ? n : null; };
  if (out.marking) {
    out.marking.heads.forEach((h, i) => { const v = val('rb-h' + i); if (v !== null && v > 0) h.max = v; });
    const t = val('rb-total'); if (t !== null && t > 0) out.marking.total = t;
  }
  out.penalties = out.penalties || [];
  const ms = val('rb-ms');
  let msP = out.penalties.find(x => x.kind === 'missingSection');
  if (ms !== null && (!msP || msP.basis !== 'disqualification')) {
    if (!msP) { msP = { violation: 'Missing section', kind: 'missingSection', basis: 'perViolation', points: 0, rule: '', quote: '' }; if (ms > 0) out.penalties.push(msP); }
    msP.points = ms; if (msP.basis === 'unstated') msP.basis = 'perViolation';
  }
  const pages = val('rb-pages');
  out.limits = out.limits || {};
  if (pages !== null && pages > 0) out.limits.memorialPages = Object.assign({ excludes: null, rule: '', quote: '' }, out.limits.memorialPages || {}, { value: pages });
  else if (pages === null) out.limits.memorialPages = null;
  const pp = val('rb-pp');
  let pgP = out.penalties.find(x => x.kind === 'pageLimitMemorial');
  if (pp !== null && (!pgP || pgP.basis !== 'disqualification')) {
    if (!pgP) { pgP = { violation: 'Exceeding the page limit', kind: 'pageLimitMemorial', basis: 'perPage', points: 0, rule: '', quote: '' }; if (pp > 0) out.penalties.push(pgP); }
    pgP.points = pp; if (pgP.basis === 'unstated') pgP.basis = 'perPage';
  }
  out.confirmedByStudent = true;
  return out;
}

/**
 * Runs the whole flow inside `box`.
 * @param opts { mootId, onDone(rules|null), onCancel() }
 */
export function openRulebook(box, { mootId = null, onDone = () => {}, onCancel = () => {} } = {}) {
  box.innerHTML = `
    <div style="line-height:1.6;">
      <div style="font-size:18px;font-weight:700;">Mark against your competition's rules</div>
      <div style="font-size:13.5px;color:var(--white-2);margin:6px 0 14px;">Upload your competition's rulebook (PDF). MootCoach reads how the memorial
        is marked and penalised, shows you every figure with the rule it comes from, and uses it only after you confirm.
        The rulebook file is not kept.</div>
      <input id="rb-file" type="file" accept="application/pdf,.pdf" style="display:block;margin-bottom:12px;font-size:13px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="rb-read" style="${BTN}flex:2;min-width:180px;border:none;background:var(--gold);color:#FCF9EF;font-weight:700;">Read the rulebook</button>
        <button id="rb-cancel" style="${BTN}flex:1;min-width:100px;border:1px solid var(--rule);background:var(--sheet);color:var(--white);">Cancel</button>
      </div>
      <div id="rb-status" style="margin-top:12px;font-size:13px;color:var(--white-muted);min-height:20px;"></div>
    </div>`;
  box.querySelector('#rb-cancel').addEventListener('click', () => onCancel());
  const go = box.querySelector('#rb-read');
  go.addEventListener('click', async () => {
    const f = box.querySelector('#rb-file').files[0];
    const status = box.querySelector('#rb-status');
    if (!f) { status.innerHTML = '<span style="color:var(--error);">Please choose the rulebook PDF first.</span>'; return; }
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { status.innerHTML = '<span style="color:var(--error);">Please choose a PDF.</span>'; return; }
    go.disabled = true; go.style.opacity = '.6';
    status.textContent = 'Reading the rulebook. This can take up to a minute for a long one…';
    const fd = new FormData();
    fd.append('file', f);
    try {
      const data = await requestJson('/api/rulebook/read', { formData: fd, timeoutMs: 170000 });
      showConfirm(box, data.profile, f.name, { mootId, onDone, onCancel });
    } catch (err) {
      status.innerHTML = `<span style="color:var(--error);">${esc(err.message)}</span>`;
      go.disabled = false; go.style.opacity = '1';
    }
  });
}

function showConfirm(box, profile, fileName, opts) {
  box.innerHTML = confirmView(profile);
  const sum = () => {
    const el = box.querySelector('#rb-sum');
    if (!el || !profile.marking) return;
    const heads = profile.marking.heads.map((h, i) => Number(box.querySelector('#rb-h' + i).value) || 0);
    const s = Math.round(heads.reduce((a, b) => a + b, 0) * 100) / 100;
    const t = Number(box.querySelector('#rb-total').value) || 0;
    el.innerHTML = Math.abs(s - t) < 0.01
      ? `<span style="color:var(--success);">✓ The heads add up to ${esc(t)}.</span>`
      : `<span style="color:var(--error);">The heads add up to ${esc(s)}, not ${esc(t)}. Correct one before confirming.</span>`;
    const ok = box.querySelector('#rb-ok');
    if (ok) { ok.disabled = Math.abs(s - t) >= 0.01; ok.style.opacity = ok.disabled ? '.5' : '1'; }
  };
  box.querySelectorAll('input[id^="rb-h"], #rb-total').forEach(i => i.addEventListener('input', sum));
  sum();
  box.querySelector('#rb-again').addEventListener('click', () => openRulebook(box, opts));
  box.querySelector('#rb-cancel').addEventListener('click', () => opts.onCancel());
  const ok = box.querySelector('#rb-ok');
  if (ok) ok.addEventListener('click', async () => {
    const final = readEdits(box, profile);
    if (!schemeFromProfile(final)) { window.alert('MootCoach could not build a marking scheme from these figures. Check the marking heads.'); return; }
    ok.disabled = true; ok.textContent = 'Saving…';
    try {
      await saveRules(opts.mootId, final, fileName);
      opts.onDone({ profile: final, fileName, mootId: opts.mootId || null });
    } catch (e) {
      ok.disabled = false; ok.textContent = 'These are right: use them';
      window.alert(e.message || 'Your rules could not be saved. Please try again.');
    }
  });
}
