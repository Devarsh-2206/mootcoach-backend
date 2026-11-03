/**
 * Pilot welcome and feedback.
 *
 * The pilot exists to learn what testers think, so asking is part of the
 * product, but it must never get in the way of the work:
 *
 *   - welcome      once, the first time a tester opens the workspace
 *   - quick card   after a judge round's report: a corner card, never a
 *                  dialog over the report, and one click to dismiss
 *   - full form    about two minutes; from "Give feedback", once both uploads
 *                  are used and a round is done, or as a skippable "before you
 *                  go" when signing out
 *
 * Answers go to /api/pilot/feedback; the server keeps only these questions.
 */
import { requestJson } from '../services/api.js';
import { confirmDialog, showToast } from './ui.js';
import { pilotState } from './pilotGate.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

function tester() {
  const st = pilotState();
  // Limits are present only while the pilot is on (see pilotGate.checkPilot).
  return st && st.pilot && st.pilot.status === 'active' && st.pilot.limits ? st.pilot : null;
}
const usedAnything = (p) => p && p.usage && Object.values(p.usage).some(n => n > 0);

/* ───────────────────────── welcome ───────────────────────── */

export function showPilotWelcome(user) {
  const p = tester();
  if (!p || !user) return;
  const key = 'mc-pilot-welcomed-' + user.uid;
  if (store.get(key)) return;
  store.set(key, '1');
  const first = String(user.displayName || '').trim().split(/\s+/)[0];
  const L = p.limits || {};
  const overlay = document.createElement('div');
  overlay.className = 'mc-dialog-overlay';
  overlay.innerHTML = `<div class="mc-dialog fb-dialog" role="dialog" aria-modal="true" aria-labelledby="pw-title">
      <div class="pilot-eyebrow">MootCoach pilot</div>
      <h3 id="pw-title">Welcome${first ? ', ' + esc(first) : ''}</h3>
      <p>${p.placeTaken === false
        ? `MootCoach is being tested by ${esc(p.cap || 50)} students before it opens to everyone. <b>Your first upload claims your place</b>, while places last. Here is how it works:`
        : `You are one of ${esc(p.cap || 50)} students testing MootCoach before it opens to everyone. Here is how it works:`}</p>
      <ol class="pw-steps">
        <li><b>Upload your moot proposition.</b> MootCoach finds the court, the governing law and the issues.</li>
        <li><b>Choose your issue and your side.</b></li>
        <li><b>Build your arguments.</b> Draft memorial sections with checked authorities.</li>
        <li><b>Face the bench.</b> Argue before an AI judge by text or by voice and get a scored report.</li>
      </ol>
      <p class="pilot-small">Your pilot allowance: ${esc(L.uploads)} uploads, ${esc(L.memorials)} memorial drafts and ${esc(L.voiceRounds)} voice rounds of up to ${esc(p.voiceMinutes || 15)} minutes. What you have left is always in the sidebar. Upload only propositions your competition allows you to share.</p>
      <p class="pilot-small">We will ask for your feedback after your rounds. It takes two minutes and shapes what MootCoach becomes.</p>
      <div class="mc-dialog-actions"><button type="button" class="mc-dialog-primary" data-act="go">Start</button></div>
    </div>`;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-act="go"]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  overlay.querySelector('[data-act="go"]').focus();
}

/* ───────────────────────── full form ───────────────────────── */

const scale = (name, from, to, lo, hi, opt) => `<div class="fb-scale" role="radiogroup" data-name="${name}">
    ${Array.from({ length: to - from + 1 }, (_, i) => from + i).map(n => `<button type="button" role="radio" aria-checked="false" data-v="${n}">${n}</button>`).join('')}
    ${opt ? `<button type="button" role="radio" aria-checked="false" data-v="" class="fb-na">${esc(opt)}</button>` : ''}
  </div>${lo ? `<div class="fb-ends"><span>${esc(lo)}</span><span>${esc(hi)}</span></div>` : ''}`;
const pills = (name, opts) => `<div class="fb-pills" role="radiogroup" data-name="${name}">
    ${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="false" data-v="${v}">${esc(l)}</button>`).join('')}
  </div>`;
const text = (name, ph, rows = 2) => `<textarea data-name="${name}" rows="${rows}" maxlength="1000" placeholder="${esc(ph)}"></textarea>`;
const q = (n, label, body, req) => `<div class="fb-q"><label>${n}. ${esc(label)}${req ? ' <span class="fb-req" aria-label="required">*</span>' : ''}</label>${body}</div>`;

const FULL_FORM = [
  q(1, 'Overall, how useful was MootCoach for your moot preparation?', scale('overall', 1, 5, 'Not useful', 'Very useful'), true),
  q(2, 'Which part helped you most?', pills('favourite', [['analysis', 'Proposition analysis'], ['issues', 'Issues'], ['memorial', 'Memorial drafting'], ['textJudge', 'Text judge'], ['voiceJudge', 'Voice judge'], ['briefing', 'Chambers Briefing'], ['calendar', 'Moot Calendar']])),
  q(3, 'How accurate was the analysis for your court and issues?', scale('accuracy', 1, 5, 'Way off', 'Spot on', "Didn't use it")),
  q(4, 'Did you notice any cases that looked invented or wrong?', pills('wrongCases', [['no', 'No'], ['yes', 'Yes'], ['unsure', 'Not sure']]) + `<div class="fb-follow" hidden>${text('wrongCasesDetail', 'Which ones? Any detail helps us fix it.')}</div>`),
  q(5, 'How realistic did the judge feel?', scale('judge', 1, 5, 'Not at all', 'Like a real bench', "Didn't try it")),
  q(6, 'Did anything break, confuse you or feel slow?', text('problems', 'Tell us what happened and where.')),
  q(7, 'Would you use MootCoach to prepare for a real moot?', pills('realMoot', [['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']]), true),
  q(8, 'Would you pay for MootCoach?', pills('pay', [['no', 'No'], ['upto199', 'Up to ₹199 a month'], ['200to499', '₹200–499 a month'], ['500plus', '₹500+ a month']])),
  q(9, 'How likely are you to recommend MootCoach to a friend?', scale('recommend', 0, 10, 'Not likely', 'Very likely'), true),
  q(10, 'Anything else you would like to tell us?', text('comments', 'Ideas, wishes, anything.', 3)),
].join('');

let formOpen = false;

/** Resolves 'sent' or 'skipped'. */
export function openFeedbackForm({ trigger = 'button' } = {}) {
  if (formOpen) return Promise.resolve('skipped');
  formOpen = true;
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'mc-dialog-overlay';
    overlay.innerHTML = `<div class="mc-dialog fb-dialog fb-full" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <div class="fb-head"><div><div class="pilot-eyebrow">Pilot feedback · about 2 minutes</div><h3 id="fb-title">How was MootCoach?</h3></div>
          <button type="button" class="pilot-x" data-act="skip" aria-label="Close">×</button></div>
        <form class="fb-body" novalidate>${FULL_FORM}
          <p class="fb-error" role="alert" hidden></p>
          <div class="fb-actions"><button type="submit" class="mc-dialog-primary">Send feedback</button>
            <button type="button" class="mc-dialog-secondary" data-act="skip">Not now</button></div>
        </form></div>`;
    const answers = {};
    const done = (v) => { overlay.remove(); document.removeEventListener('keydown', onKey); formOpen = false; resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done('skipped'); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-act="skip"]')) { done('skipped'); return; }
      const opt = e.target.closest('[role="radio"]');
      if (!opt) return;
      const group = opt.closest('[data-name]');
      group.querySelectorAll('[role="radio"]').forEach(b => b.setAttribute('aria-checked', String(b === opt)));
      answers[group.dataset.name] = opt.dataset.v === '' ? null : (/^\d+$/.test(opt.dataset.v) && group.classList.contains('fb-scale') ? Number(opt.dataset.v) : opt.dataset.v);
      if (group.dataset.name === 'wrongCases') overlay.querySelector('.fb-follow').hidden = opt.dataset.v !== 'yes';
    });
    overlay.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      overlay.querySelectorAll('textarea[data-name]').forEach(t => { if (t.value.trim()) answers[t.dataset.name] = t.value.trim(); });
      const missing = ['overall', 'realMoot', 'recommend'].filter(k => answers[k] == null);
      const err = overlay.querySelector('.fb-error');
      if (missing.length) {
        err.textContent = 'Please answer questions 1, 7 and 9 (marked *). Everything else is optional.';
        err.hidden = false;
        overlay.querySelector(`[data-name="${missing[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const btn = overlay.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await requestJson('/api/pilot/feedback', { body: { kind: 'full', answers, context: { trigger } }, timeoutMs: 30000 });
        markLocal('full');
        showToast('Thank you! This really helps.', 'ok');
        done('sent');
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false;
        btn.disabled = false; btn.textContent = 'Send feedback';
      }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('.fb-scale [role="radio"]')?.focus();
  });
}

function markLocal(kind) {
  const p = tester();
  if (p) p.feedback = { ...(p.feedback || {}), [kind]: Date.now() };
}

/* ───────────────────────── quick card ───────────────────────── */

function showCard(html, wire) {
  document.getElementById('fb-card')?.remove();
  const card = document.createElement('div');
  card.id = 'fb-card';
  card.className = 'fb-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Feedback');
  card.innerHTML = `<button type="button" class="pilot-x fb-card-x" aria-label="Dismiss">×</button>${html}`;
  card.querySelector('.fb-card-x').onclick = () => card.remove();
  document.body.appendChild(card);
  wire(card);
}

function showQuickCard(source) {
  showCard(`<p class="fb-card-title">How was that round?</p>
      <div class="fb-stars" role="radiogroup" aria-label="Rate the round from 1 to 5">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="false" data-v="${n}" aria-label="${n} of 5">★</button>`).join('')}
      </div>
      <div class="fb-card-more" hidden>
        <input type="text" maxlength="500" placeholder="Is there one thing we could do better? (optional)">
        <button type="button" class="mc-dialog-primary fb-send">Send</button>
      </div>`, (card) => {
    let rating = 0;
    card.querySelectorAll('.fb-stars button').forEach(b => b.addEventListener('click', () => {
      rating = Number(b.dataset.v);
      card.querySelectorAll('.fb-stars button').forEach(x => {
        x.classList.toggle('on', Number(x.dataset.v) <= rating);
        x.setAttribute('aria-checked', String(x === b));
      });
      card.querySelector('.fb-card-more').hidden = false;
      card.querySelector('input').focus();
    }));
    card.querySelector('.fb-send').addEventListener('click', async () => {
      const improve = card.querySelector('input').value.trim();
      try {
        await requestJson('/api/pilot/feedback', { body: { kind: 'quick', answers: { rating, improve, source: source === 'voice' ? 'voice' : 'bench' }, context: { trigger: 'round' } }, timeoutMs: 30000 });
        markLocal('quick');
        card.innerHTML = '<p class="fb-card-title">Thank you!</p>';
        setTimeout(() => card.remove(), 1800);
      } catch (e) {
        showToast(e.message, 'err');
      }
    });
  });
}

function showFullInvite() {
  showCard(`<p class="fb-card-title">You've finished your pilot uploads</p>
      <p class="fb-card-text">Two minutes to tell us what worked and what didn't?</p>
      <div class="fb-card-actions"><button type="button" class="mc-dialog-primary" data-act="go">Give feedback</button>
        <button type="button" class="mc-dialog-secondary" data-act="later">Later</button></div>`, (card) => {
    card.querySelector('[data-act="go"]').onclick = () => { card.remove(); openFeedbackForm({ trigger: 'uploads-done' }); };
    card.querySelector('[data-act="later"]').onclick = () => card.remove();
  });
}

let quickShown = false, inviteShown = false;
/** After a round's report: the right prompt, at most once per page load. */
function afterRound(source) {
  const p = tester();
  if (!p || (p.feedback && p.feedback.full)) return;
  const uploadsDone = p.limits && (p.usage || {}).uploads >= p.limits.uploads;
  if (uploadsDone && !inviteShown) { inviteShown = true; showFullInvite(); return; }
  if (!quickShown && !(p.feedback && p.feedback.quick)) { quickShown = true; showQuickCard(source); }
}
window.addEventListener('mc:round-done', (e) => setTimeout(() => afterRound((e.detail || {}).source), 2500));

/* ───────────────────────── sign out ───────────────────────── */

let askedOnSignOut = false;
/** Called by handleLogout. Resolves true to carry on signing out. */
export async function pilotBeforeSignOut() {
  const p = tester();
  if (!p || askedOnSignOut || (p.feedback && p.feedback.full) || !usedAnything(p)) return true;
  askedOnSignOut = true;
  const choice = await confirmDialog({
    title: 'Before you go',
    body: 'Before you go, could you spare two minutes to tell us how MootCoach worked for you? It really helps shape what we build next.',
    actions: [
      { label: 'Give feedback', value: 'give', primary: true },
      { label: 'No thanks, sign out', value: 'out' },
    ],
  });
  if (choice === null) return false;
  if (choice === 'give') await openFeedbackForm({ trigger: 'signout' });
  return true;
}

window.openFeedbackForm = openFeedbackForm;
window.showPilotWelcome = showPilotWelcome;
window.pilotBeforeSignOut = pilotBeforeSignOut;
