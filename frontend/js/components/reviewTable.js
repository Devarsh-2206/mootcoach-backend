/**
 * Compare moots — a review table across the advocate's saved moots.
 *
 * One row per moot, one column per question, after Harvey's Vault review
 * tables. The built-in columns are read from what each moot already stores
 * (its analysis, the side and issue chosen, the latest scores), so opening the
 * table costs no AI calls. Every cell says where it came from.
 *
 * The advocate can add one column of their own: a question asked of every
 * moot at once. Each answer must quote the moot's own analysis, and the server
 * checks the quote is really there; an answer it cannot tie to the text is
 * shown as unsupported instead of as fact.
 */
import { db, currentUser } from '../services/firebase.js';
import { requestJson } from '../services/api.js';
import { showToast, deriveMootName, esc } from './ui.js';

const MAX_ROWS = 30;
let rows = [];
let sortKey = 'updated', sortDir = -1, filter = '';
let custom = null;   // { question, answers: { [id]: {answer, quote, supported} } }

const userRef = () => {
  const u = currentUser || (window.firebase && window.firebase.auth && window.firebase.auth().currentUser);
  return u ? db.collection('artifacts').doc('moot.coach').collection('users').doc(u.uid) : null;
};
const toDate = t => { try { return t && t.toDate ? t.toDate() : t ? new Date(t) : null; } catch (e) { return null; } };
const parse = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const SOURCE = { bench: 'Simulator', voice: 'Voice round', oral: 'Oral Coach', memorial: 'Memorial Review' };

async function loadRows() {
  const ref = userRef();
  if (!ref) return [];
  const snap = await ref.collection('analyses').orderBy('timestamp', 'desc').limit(MAX_ROWS).get();
  const docs = [];
  snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
  return Promise.all(docs.map(async d => {
    const a = d.analysisData || {};
    let state = null, feedback = [];
    try {
      const adv = ref.collection('analyses').doc(d.id).collection('advocacy');
      const [s, f] = await Promise.all([adv.doc('_moot_state').get(), adv.doc('_feedback').get()]);
      state = s.exists ? s.data() : null;
      feedback = (f.exists && parse(f.data().itemsJson)) || [];
    } catch (e) { /* a moot with nothing saved yet */ }
    const latest = src => feedback.find(x => x.source === src || (src === 'round' && (x.source === 'bench' || x.source === 'voice')));
    const round = latest('round'), oral = latest('oral'), mem = latest('memorial');
    const issues = (Array.isArray(a.legalIssues) ? a.legalIssues.length : 0) + (Array.isArray(a.additionalIssues) ? a.additionalIssues.length : 0);
    const forum = (d.detectedForum && (d.detectedForum.forum || d.detectedForum.specificBody)) || '';
    return {
      id: d.id,
      name: deriveMootName(d),
      updated: toDate(d.timestamp),
      forum,
      level: (d.detectedForum && d.detectedForum.courtLevel) || '',
      side: (state && state.stance) || '',
      issue: (state && state.issueText) || '',
      issues,
      hardest: String(a.mostContestableIssue || '').replace(/\*+/g, '').trim(),
      oralDifficulty: a.oralDifficulty || '',
      authorities: Array.isArray(a.precedentsNeeded) ? a.precedentsNeeded.length : 0,
      round: round ? { score: round.score, src: SOURCE[round.source] } : null,
      oral: oral ? { score: oral.score, src: SOURCE.oral } : null,
      memorial: mem ? { score: mem.score, src: SOURCE.memorial } : null,
      digest: digestOf(d, a),
    };
  }));
}

/** What the custom column is asked over: the analysis as text, bounded. */
function digestOf(d, a) {
  const list = v => (Array.isArray(v) ? v : []).map(x => typeof x === 'string' ? x : (x && (x.issue || x.caseName || x.argument)) || '').filter(Boolean);
  return [
    `Moot: ${deriveMootName(d)}`,
    d.detectedForum && d.detectedForum.forum ? `Forum: ${d.detectedForum.forum}` : '',
    a.summary ? `Summary: ${a.summary}` : '',
    `Issues: ${list(a.legalIssues).concat(list(a.additionalIssues)).join(' | ')}`,
    a.mostContestableIssue ? `Hardest issue: ${a.mostContestableIssue}` : '',
    `Authorities: ${list(a.precedentsNeeded).join(' | ')}`,
    `Petitioner: ${list(a.petitionerArguments).join(' | ')}`,
    `Respondent: ${list(a.respondentArguments).join(' | ')}`,
    `Constitutional: ${list(a.constitutionalIssues).join(' | ')}`,
  ].filter(Boolean).join('\n').slice(0, 3500);
}

/* ── columns: key, label, cell renderer, sort value, source note ── */
const fmtDate = d => d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const score = s => s && Number.isFinite(Number(s.score)) ? `<b>${Number(s.score)}</b>` : '<span class="rt-none">—</span>';
const COLS = [
  { key: 'name', label: 'Moot', src: 'Saved moot', cell: r => `<button type="button" class="rt-open" data-open="${esc(r.id)}">${esc(r.name)}</button><div class="rt-sub">${esc(fmtDate(r.updated))}</div>`, sort: r => r.name.toLowerCase() },
  { key: 'forum', label: 'Forum', src: 'Forum detection', cell: r => r.forum ? `${esc(r.forum)}${r.level ? `<div class="rt-sub">${esc(r.level)}</div>` : ''}` : '<span class="rt-none">Not detected</span>', sort: r => r.forum.toLowerCase() },
  { key: 'side', label: 'Your side and issue', src: 'Your selection (Issues stage)', cell: r => r.side ? `<b>${esc(r.side)}</b>${r.issue ? `<div class="rt-sub rt-clip">${esc(r.issue)}</div>` : ''}` : '<span class="rt-none">Not chosen</span>', sort: r => r.side },
  { key: 'issues', label: 'Issues', src: 'Analysis: framed + additional issues', cell: r => String(r.issues), sort: r => r.issues, num: true },
  { key: 'hardest', label: 'Hardest issue', src: 'Analysis: most contestable issue', cell: r => r.hardest ? `<div class="rt-clip">${esc(r.hardest)}</div>` : '<span class="rt-none">—</span>', sort: r => r.hardest },
  { key: 'oralDifficulty', label: 'Oral difficulty', src: 'Analysis', cell: r => esc(r.oralDifficulty || '—'), sort: r => ({ high: 3, medium: 2, low: 1 })[String(r.oralDifficulty).toLowerCase()] || 0 },
  { key: 'authorities', label: 'Authorities', src: 'Analysis: cases & precedents', cell: r => String(r.authorities), sort: r => r.authorities, num: true },
  { key: 'round', label: 'Last round', src: 'Latest Simulator or voice round', cell: r => score(r.round), sort: r => r.round ? Number(r.round.score) || 0 : -1, num: true },
  { key: 'oral', label: 'Oral Coach', src: 'Latest Oral Coach evaluation', cell: r => score(r.oral), sort: r => r.oral ? Number(r.oral.score) || 0 : -1, num: true },
  { key: 'memorial', label: 'Memorial', src: 'Latest Memorial Review', cell: r => score(r.memorial), sort: r => r.memorial ? Number(r.memorial.score) || 0 : -1, num: true },
];

function customCell(r) {
  if (!custom) return '';
  const a = custom.answers[r.id];
  if (custom.pending && !a) return '<span class="rt-none">Asking…</span>';
  if (!a) return '<span class="rt-none">—</span>';
  if (!a.supported) return `<div>${esc(a.answer || '')}</div><div class="rt-unsupported">Not supported by this moot's analysis</div>`;
  return `<div>${esc(a.answer || '')}</div>${a.quote ? `<div class="rt-quote" title="Quoted from this moot's analysis">“${esc(a.quote)}”</div>` : ''}`;
}

function visibleRows() {
  const col = COLS.find(c => c.key === sortKey);
  const f = filter.trim().toLowerCase();
  return rows
    .filter(r => !f || [r.name, r.forum, r.side, r.issue, r.hardest].join(' ').toLowerCase().includes(f))
    .sort((a, b) => {
      const va = col ? col.sort(a) : (a.updated || 0), vb = col ? col.sort(b) : (b.updated || 0);
      return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
    });
}

function render() {
  const body = document.getElementById('rt-body');
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<div class="rt-empty">No saved moots yet. Analyse a proposition and it appears here, one row per moot.</div>`;
    return;
  }
  const vr = visibleRows();
  const head = COLS.map(c => `<th scope="col" class="${c.num ? 'num' : ''}"><button type="button" data-sort="${c.key}" title="Source: ${esc(c.src)}">${esc(c.label)}${sortKey === c.key ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')
    + (custom ? `<th scope="col" class="rt-custom-h"><span title="Your question, asked of every moot">${esc(custom.question)}</span> <button type="button" class="rt-x" data-act="drop-col" aria-label="Remove this column">&times;</button></th>` : '');
  const tr = vr.map(r => `<tr>${COLS.map(c => `<td class="${c.num ? 'num' : ''}">${c.cell(r)}</td>`).join('')}${custom ? `<td class="rt-custom">${customCell(r)}</td>` : ''}</tr>`).join('');
  body.innerHTML = `<div class="rt-scroll"><table class="rt-table"><thead><tr>${head}</tr></thead><tbody>${tr}</tbody></table></div>
    <p class="rt-foot">${vr.length} of ${rows.length} moot${rows.length === 1 ? '' : 's'}. Hover a column heading to see where its values come from.</p>`;
}

async function askColumn(question) {
  const q = question.trim();
  if (q.length < 4) { showToast('Write a question to ask of every moot.', 'err'); return; }
  const target = visibleRows().slice(0, 15);
  if (!target.length) return;
  custom = { question: q, answers: {}, pending: true };
  render();
  const btn = document.getElementById('rt-ask-btn'); if (btn) btn.disabled = true;
  try {
    const data = await requestJson('/api/review-column', { body: { question: q, rows: target.map(r => ({ id: r.id, text: r.digest })) } });
    (data.answers || []).forEach(a => { if (a && a.id) custom.answers[a.id] = a; });
    const unsupported = (data.answers || []).filter(a => !a.supported).length;
    if (unsupported) showToast(`${unsupported} answer${unsupported === 1 ? '' : 's'} could not be tied to the moot's own analysis and ${unsupported === 1 ? 'is' : 'are'} marked.`, 'warn');
  } catch (e) {
    custom = null;
    showToast(e.message || 'Could not ask that question just now.', 'err');
  } finally {
    if (custom) custom.pending = false;
    if (btn) btn.disabled = false;
    render();
  }
}

function exportCsv() {
  const vr = visibleRows();
  const cols = COLS.map(c => c.label).concat(custom ? [custom.question, 'Quote'] : []);
  const val = (r, c) => ({
    name: r.name, forum: r.forum, side: [r.side, r.issue].filter(Boolean).join(' — '), issues: r.issues, hardest: r.hardest,
    oralDifficulty: r.oralDifficulty, authorities: r.authorities,
    round: r.round ? r.round.score : '', oral: r.oral ? r.oral.score : '', memorial: r.memorial ? r.memorial.score : '',
  })[c.key];
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [cols.map(q).join(',')].concat(vr.map(r => COLS.map(c => q(val(r, c)))
    .concat(custom ? [q((custom.answers[r.id] || {}).answer), q((custom.answers[r.id] || {}).quote)] : []).join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'mootcoach-moots.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function close() {
  const o = document.getElementById('rt-overlay');
  if (o) o.remove();
  document.removeEventListener('keydown', onKey);
}
function onKey(e) { if (e.key === 'Escape') close(); }

export async function openReviewTable() {
  if (!userRef()) { showToast('Sign in to compare your moots.', 'err'); return; }
  close();
  const o = document.createElement('div');
  o.id = 'rt-overlay';
  o.className = 'rt-overlay';
  o.innerHTML = `
    <div class="rt-dialog" role="dialog" aria-modal="true" aria-labelledby="rt-title">
      <header class="rt-head">
        <div><div class="rt-eyebrow">Review table</div><h2 id="rt-title">Compare your moots</h2></div>
        <button type="button" class="rt-x" data-act="close" aria-label="Close">&times;</button>
      </header>
      <div class="rt-tools">
        <input type="search" id="rt-filter" placeholder="Filter by name, forum or issue" aria-label="Filter moots">
        <form id="rt-ask" class="rt-ask"${window.__features && window.__features.reviewColumn ? '' : ' hidden'}>
          <input type="text" id="rt-question" maxlength="200" placeholder="Ask every moot, e.g. Does it turn on Article 21?" aria-label="Question to ask of every moot">
          <button type="submit" class="btn-sm" id="rt-ask-btn">Add column</button>
        </form>
        <button type="button" class="btn-sm" data-act="csv">Export CSV</button>
      </div>
      <div id="rt-body" class="rt-body"><div class="rt-empty">Loading your moots…</div></div>
    </div>`;
  document.body.appendChild(o);
  document.addEventListener('keydown', onKey);
  o.addEventListener('click', e => {
    if (e.target === o) return close();
    const b = e.target.closest('[data-act],[data-sort],[data-open]');
    if (!b) return;
    if (b.dataset.act === 'close') close();
    else if (b.dataset.act === 'csv') exportCsv();
    else if (b.dataset.act === 'drop-col') { custom = null; render(); }
    else if (b.dataset.sort) { sortDir = sortKey === b.dataset.sort ? -sortDir : (COLS.find(c => c.key === b.dataset.sort).num ? -1 : 1); sortKey = b.dataset.sort; render(); }
    else if (b.dataset.open) { close(); if (window.loadSavedSession) window.loadSavedSession(b.dataset.open); }
  });
  o.querySelector('#rt-filter').addEventListener('input', e => { filter = e.target.value; render(); });
  o.querySelector('#rt-ask').addEventListener('submit', e => { e.preventDefault(); askColumn(o.querySelector('#rt-question').value); });
  o.querySelector('#rt-filter').focus();
  try { rows = await loadRows(); }
  catch (e) { rows = []; showToast('Could not load your moots: ' + e.message, 'err'); }
  sortKey = 'updated';
  render();
}
window.openReviewTable = openReviewTable;
