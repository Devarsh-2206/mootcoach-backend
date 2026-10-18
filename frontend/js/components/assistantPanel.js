/**
 * Ask MootCoach — a side panel chat with the tool-using assistant
 * (POST /api/assistant). Under every answer it says what MootCoach looked at,
 * in plain words, so the advocate can tell an answer drawn from their own
 * analysis or a checked source from a general one.
 */
import { requestJson } from '../services/api.js';
import { showToast, esc } from './ui.js';

const history = [];   // {role:'user'|'model', text}
const SUGGEST = [
  'Which of my authorities are risky?',
  'What did the bench catch last time, and what should I fix first?',
  'Which issue should I lead with, and why?',
];
const TOOL_WORDS = {
  read_moot: a => `Read your analysis${a.section ? ` (${a.section})` : ''}`,
  read_progress: () => 'Read your rounds and scores',
  list_moots: () => 'Looked through your saved moots',
  verify_authorities: a => `Checked ${(a.authorities || []).length || 'some'} case${(a.authorities || []).length === 1 ? '' : 's'} on the web`,
};

function bubble(role, html) {
  const log = document.getElementById('ask-log');
  const d = document.createElement('div');
  d.className = 'ask-msg ' + role;
  d.innerHTML = html;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}
// Light formatting for the answer: paragraphs, bullets, bold. Escaped first.
const fmt = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/\n{2,}/).map(p =>
  /^\s*[-•*] /m.test(p) ? `<ul>${p.split('\n').filter(Boolean).map(l => `<li>${l.replace(/^\s*[-•*]\s*/, '')}</li>`).join('')}</ul>` : `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

async function ask(q) {
  q = String(q || '').trim();
  if (!q) return;
  const input = document.getElementById('ask-input');
  const send = document.getElementById('ask-send');
  input.value = ''; send.disabled = true;
  document.getElementById('ask-suggest')?.remove();
  bubble('user', esc(q));
  const wait = bubble('model pending', '<span class="ask-dots"><i></i><i></i><i></i></span> Looking at your moot…');
  try {
    const data = await requestJson('/api/assistant', { body: { question: q, history, mootId: window.currentMootDocId || '' }, timeoutMs: 120000 });
    history.push({ role: 'user', text: q }, { role: 'model', text: data.answer || '' });
    const used = (data.toolsUsed || []).filter(t => t.ok).map(t => (TOOL_WORDS[t.name] || (() => t.name))(t.args || {}));
    wait.className = 'ask-msg model';
    wait.innerHTML = fmt(data.answer || '') + (used.length
      ? `<div class="ask-used">${[...new Set(used)].map(u => `<span>${esc(u)}</span>`).join('')}</div>`
      : `<div class="ask-used none">Answered from general knowledge, not from your moot.</div>`);
  } catch (e) {
    wait.remove();
    showToast(e.message || 'MootCoach could not answer just now.', 'err');
    input.value = q;
  } finally {
    send.disabled = false; input.focus();
  }
}

function close() {
  document.getElementById('ask-panel')?.remove();
  document.removeEventListener('keydown', onKey);
}
function onKey(e) { if (e.key === 'Escape') close(); }

export function openAssistant() {
  if (document.getElementById('ask-panel')) { document.getElementById('ask-input').focus(); return; }
  const p = document.createElement('aside');
  p.id = 'ask-panel';
  p.className = 'ask-panel';
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-label', 'Ask MootCoach');
  p.innerHTML = `
    <header class="ask-head">
      <div><div class="ask-eyebrow">Ask MootCoach</div><div class="ask-sub">Answers from your own moots and checked sources</div></div>
      <button type="button" class="ask-x" aria-label="Close">&times;</button>
    </header>
    <div class="ask-log" id="ask-log" aria-live="polite"></div>
    <div class="ask-suggest" id="ask-suggest">${SUGGEST.map(s => `<button type="button">${esc(s)}</button>`).join('')}</div>
    <form class="ask-form" id="ask-form">
      <textarea id="ask-input" rows="2" maxlength="2000" placeholder="Ask about your moot…" aria-label="Your question"></textarea>
      <button type="submit" class="btn-sm btn-sm-gold" id="ask-send">Ask</button>
    </form>`;
  document.body.appendChild(p);
  history.forEach(h => bubble(h.role === 'user' ? 'user' : 'model', h.role === 'user' ? esc(h.text) : fmt(h.text)));
  if (history.length) document.getElementById('ask-suggest')?.remove();
  p.querySelector('.ask-x').addEventListener('click', close);
  p.querySelector('#ask-suggest')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
  p.querySelector('#ask-form').addEventListener('submit', e => { e.preventDefault(); ask(p.querySelector('#ask-input').value); });
  p.querySelector('#ask-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(e.target.value); } });
  document.addEventListener('keydown', onKey);
  p.querySelector('#ask-input').focus();
}
window.openAssistant = openAssistant;
