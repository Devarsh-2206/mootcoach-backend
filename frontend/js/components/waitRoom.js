/**
 * The wait while a proposition is analysed (30-90 seconds).
 *
 * What makes a wait annoying is not knowing how long, and being stuck. So:
 *   - an honest clock: "usually 40-70 seconds, 41s so far", and a plain
 *     "taking longer than usual" past 90s;
 *   - moot tips, rotating, which ask nothing of the student;
 *   - an optional quick quiz, opened only on request;
 *   - "Keep working while I analyse": the overlay shrinks to a pill in the
 *     corner and the rest of the app stays usable. When the analysis is
 *     done the pill turns into "Analysis ready → Open" (and the tab title
 *     says so), instead of yanking the student out of whatever they opened.
 *
 * The quiz bank is written by hand, not generated: a wrong "correct answer"
 * in a legal quiz is worse than no quiz. Every item is a settled, textbook
 * point; review them before adding more.
 */
import { esc } from './ui.js';

const TIPS = [
  'Benches often test maintainability before the merits. Keep a two-line answer ready on why the petition lies in this court.',
  'Open with a roadmap: the issues, in order, and the relief you seek. Judges relax once they know where you are going.',
  'Answer the question asked, then return to your submission. Never say "I will come to that later" to a direct question.',
  'Know the exact paragraph of the proposition for every fact you rely on. "Paragraph 7 of the record, My Lords" ends arguments.',
  'Read the ratio of each key authority aloud before the round. If you cannot say it in one sentence, you will fumble it under pressure.',
  'Concede a weak point early and gracefully; it buys credibility for the points you actually need.',
  'Your prayer must match your issues. A relief you never argued for invites an awkward question.',
  'When distinguishing a case, distinguish on facts the bench can see in the record, not on adjectives.',
  'Time yourself with two-thirds of the allotted time. Questions from the bench will eat the rest.',
  'Pause before answering a hard question. A two-second pause reads as composure, not hesitation.',
  'Keep one fallback position per issue: if the bench rejects your main submission, where do you stand?',
  'Cite the full case name the first time, then a short form. Consistency in your memorial is marked.',
  'Every authority in your Index should be cited in the body, and every citation in the body should be in the Index.',
  'Number your memorial paragraphs continuously; advocates and judges cite them in the oral round.',
  'For a statute, quote the operative words. Paraphrasing a provision invites "That is not what it says, counsel".',
  'Anticipate your opponent\'s best authority and address it in your own submission before they raise it.',
  'If you do not know an answer, say so and offer to address it in rebuttal. Inventing one is far worse.',
  'Use "it is humbly submitted" for your propositions, never "I believe" or "I think".',
  'Rebuttal is for answering what the other side said, not for repeating your opening.',
  'Practise the first thirty seconds until they are automatic. Nerves fade once you are underway.',
  'A proportionality argument needs each limb: legitimate aim, suitability, necessity and balancing. Benches notice a missing limb.',
  'Check whether the forum binds itself: a Supreme Court bench is bound by larger benches, not by smaller ones.',
  'Look for the jurisdiction clause in the proposition first; many moots plant a maintainability trap there.',
  'Write your issues as questions the court can answer yes or no. Vague issues get vague answers.',
  'Signpost transitions: "That concludes my first submission. I now turn to the second."',
  'Keep water within reach and a clean, tabbed compendium of authorities. Fumbling for a page costs time and confidence.',
  'Watch the presiding judge, not your notes. Their face tells you when to move on.',
  'Do not read your speech. Bullet points and the record are enough.',
  'Find the strongest fact against you in the proposition and prepare your answer to it first.',
  'End with the specific relief you seek, stated plainly. Do not let the round simply run out.',
];

const QUIZ = [
  ['Which Article lets a person move the Supreme Court directly to enforce a fundamental right?', ['Article 226', 'Article 32', 'Article 136', 'Article 21'], 1, 'Article 32. Article 226 gives High Courts writ power, which is wider: it also covers "any other purpose".'],
  ['Which writ literally means "you may have the body"?', ['Mandamus', 'Certiorari', 'Habeas corpus', 'Quo warranto'], 2, 'Habeas corpus: the detained person must be produced before the court and the detention justified.'],
  ['Which writ commands a public authority to perform a public duty it has failed to perform?', ['Mandamus', 'Prohibition', 'Certiorari', 'Habeas corpus'], 0, 'Mandamus, "we command".'],
  ['Which writ asks a person by what authority they hold a public office?', ['Prohibition', 'Quo warranto', 'Mandamus', 'Certiorari'], 1, 'Quo warranto, "by what warrant".'],
  ['Which writ quashes an order already made by an inferior court or tribunal acting without or in excess of jurisdiction?', ['Prohibition', 'Mandamus', 'Certiorari', 'Quo warranto'], 2, 'Certiorari quashes a decision already made; prohibition stops proceedings that are still pending.'],
  ['Which writ stops an inferior court from continuing proceedings beyond its jurisdiction?', ['Prohibition', 'Certiorari', 'Habeas corpus', 'Mandamus'], 0, 'Prohibition is issued while the proceedings are still pending.'],
  ['Article 14 of the Constitution of India guarantees…', ['Freedom of speech', 'Equality before the law and equal protection of the laws', 'Protection of life and personal liberty', 'Right to constitutional remedies'], 1, 'Article 14: equality before the law and equal protection of the laws.'],
  ['Which Article protects life and personal liberty?', ['Article 19', 'Article 20', 'Article 21', 'Article 22'], 2, 'Article 21: no person shall be deprived of life or personal liberty except according to procedure established by law.'],
  ['Freedom of speech and expression is in…', ['Article 19(1)(a)', 'Article 19(1)(b)', 'Article 21', 'Article 25'], 0, 'Article 19(1)(a); reasonable restrictions are permitted under Article 19(2).'],
  ['Which Article allows the Supreme Court to grant special leave to appeal?', ['Article 32', 'Article 132', 'Article 136', 'Article 141'], 2, 'Article 136: special leave to appeal from any judgment or order of any court or tribunal in India.'],
  ['Which Article makes the law declared by the Supreme Court binding on all courts in India?', ['Article 141', 'Article 142', 'Article 144', 'Article 32'], 0, 'Article 141.'],
  ['Which Article empowers the Supreme Court to pass orders for "complete justice"?', ['Article 141', 'Article 142', 'Article 136', 'Article 226'], 1, 'Article 142.'],
  ['Which Article defines "the State" for the purposes of Part III?', ['Article 12', 'Article 13', 'Article 36', 'Article 14'], 0, 'Article 12. Whether a body is "State" decides whether a writ for a fundamental right lies against it.'],
  ['Which Article declares void any law inconsistent with fundamental rights?', ['Article 12', 'Article 13', 'Article 32', 'Article 368'], 1, 'Article 13.'],
  ['Protection against self-incrimination is in…', ['Article 20(1)', 'Article 20(2)', 'Article 20(3)', 'Article 22(1)'], 2, 'Article 20(3): no person accused of an offence shall be compelled to be a witness against himself.'],
  ['The right to property today is…', ['A fundamental right under Article 31', 'A constitutional right under Article 300A', 'A directive principle', 'Not protected at all'], 1, 'Article 300A, after the Forty-fourth Amendment (1978) removed it from the fundamental rights.'],
  ['The right to free and compulsory education for children aged 6 to 14 is in…', ['Article 21A', 'Article 45', 'Article 41', 'Article 29'], 0, 'Article 21A, inserted by the Eighty-sixth Amendment.'],
  ['Which case laid down the basic structure doctrine?', ['Golaknath v. State of Punjab', 'Kesavananda Bharati v. State of Kerala', 'Minerva Mills v. Union of India', 'A.K. Gopalan v. State of Madras'], 1, 'Kesavananda Bharati (1973): Parliament may amend the Constitution but not its basic structure.'],
  ['Which case held that "procedure established by law" must be just, fair and reasonable?', ['A.K. Gopalan v. State of Madras', 'Maneka Gandhi v. Union of India', 'Kharak Singh v. State of U.P.', 'ADM Jabalpur v. Shivkant Shukla'], 1, 'Maneka Gandhi v. Union of India (1978).'],
  ['Which case recognised privacy as a fundamental right?', ['Kharak Singh v. State of U.P.', 'M.P. Sharma v. Satish Chandra', 'K.S. Puttaswamy v. Union of India', 'Shreya Singhal v. Union of India'], 2, 'K.S. Puttaswamy v. Union of India (2017), a nine-judge bench.'],
  ['Which case struck down Section 66A of the Information Technology Act?', ['Shreya Singhal v. Union of India', 'Anuradha Bhasin v. Union of India', 'Romesh Thappar v. State of Madras', 'Sakal Papers v. Union of India'], 0, 'Shreya Singhal v. Union of India (2015).'],
  ['Which case laid down guidelines on sexual harassment at the workplace before legislation existed?', ['Vishaka v. State of Rajasthan', 'Navtej Singh Johar v. Union of India', 'Joseph Shine v. Union of India', 'Olga Tellis v. BMC'], 0, 'Vishaka v. State of Rajasthan (1997).'],
  ['"Audi alteram partem" means…', ['No one should be a judge in their own cause', 'Hear the other side', 'Let the decision stand', 'The thing speaks for itself'], 1, 'Hear the other side: a party must have a fair chance to answer the case against it.'],
  ['"Nemo judex in causa sua" means…', ['Hear the other side', 'No one should be a judge in their own cause', 'Let the buyer beware', 'The law does not concern itself with trifles'], 1, 'The rule against bias.'],
  ['The "ratio decidendi" of a judgment is…', ['Everything the judge said', 'The reason for the decision, which binds later courts', 'A remark made in passing', 'The final order'], 1, 'The ratio binds. Remarks made in passing (obiter dicta) are only persuasive.'],
  ['An "obiter dictum" is…', ['Binding on lower courts', 'A remark made in passing, persuasive but not binding', 'The operative order', 'A dissenting judgment'], 1, 'Obiter dicta are persuasive, though an obiter of the Supreme Court is given great weight.'],
  ['"Res judicata" means…', ['A matter finally decided between the same parties cannot be reopened', 'The matter is under consideration', 'Stand by decided cases', 'Beyond the powers'], 0, 'Res judicata; Section 11 of the Code of Civil Procedure states the rule for civil suits.'],
  ['"Stare decisis" means…', ['Stand by what has been decided', 'The thing speaks for itself', 'Under consideration by the court', 'Let it be done'], 0, 'The doctrine of precedent.'],
  ['"Sub judice" means…', ['Already decided', 'Under judicial consideration', 'Beyond jurisdiction', 'Without a hearing'], 1, 'A matter pending before a court.'],
  ['A decision given "per incuriam" is one given…', ['By a larger bench', 'In ignorance of a binding authority or statute', 'With the consent of parties', 'Ex parte'], 1, 'Per incuriam decisions lose their binding force on the point overlooked.'],
  ['"Locus standi" is…', ['The place of the trial', 'The right to bring an action before a court', 'The burden of proof', 'The standard of review'], 1, 'Public interest litigation relaxed the traditional rule of standing in India.'],
  ['"Ultra vires" means…', ['Within the powers', 'Beyond the powers', 'In good faith', 'From the beginning'], 1, 'An act beyond the powers conferred is ultra vires and void.'],
  ['The rule of interpretation that general words following specific ones take their meaning from them is…', ['Noscitur a sociis', 'Ejusdem generis', 'Expressio unius', 'Contemporanea expositio'], 1, 'Ejusdem generis, "of the same kind".'],
  ['"Noscitur a sociis" means a word is known by…', ['Its dictionary meaning', 'The company it keeps', 'Its legislative history', 'Its first use in the Act'], 1, 'Read a word in the light of the words around it.'],
  ['Which rule of interpretation asks what mischief the statute was meant to remedy?', ['Literal rule', 'Golden rule', 'Mischief rule', 'Rule of lenity'], 2, 'The mischief rule, from Heydon\'s Case (1584).'],
  ['The doctrine that a pre-Constitution law inconsistent with fundamental rights is dormant, not dead, is the doctrine of…', ['Severability', 'Eclipse', 'Pith and substance', 'Colourable legislation'], 1, 'The doctrine of eclipse.'],
  ['"What cannot be done directly cannot be done indirectly" describes the doctrine of…', ['Colourable legislation', 'Eclipse', 'Waiver', 'Harmonious construction'], 0, 'Colourable legislation.'],
  ['To decide which legislative List a law falls under, courts look at its true nature under the doctrine of…', ['Pith and substance', 'Severability', 'Eclipse', 'Repugnancy'], 0, 'Pith and substance.'],
  ['Which Article allows the President to suspend the enforcement of fundamental rights during an Emergency?', ['Article 352', 'Article 356', 'Article 359', 'Article 360'], 2, 'Article 359. Since the Forty-fourth Amendment, Articles 20 and 21 cannot be suspended.'],
  ['Equal justice and free legal aid is a Directive Principle in…', ['Article 39A', 'Article 41', 'Article 45', 'Article 51A'], 0, 'Article 39A.'],
  ['In a memorial, which section tells the court what you want it to order?', ['Statement of Facts', 'Summary of Arguments', 'Prayer', 'Statement of Jurisdiction'], 2, 'The Prayer. Every relief in it should follow from an issue you argued.'],
  ['In a memorial, which section shows why the court can hear the matter?', ['Statement of Jurisdiction', 'Issues Raised', 'Index of Authorities', 'Prayer'], 0, 'The Statement of Jurisdiction, citing the provision under which the court is approached.'],
  ['In footnotes, "Ibid." refers to…', ['Any earlier citation', 'The source cited immediately before', 'The moot proposition', 'A case to be verified'], 1, '"Ibid." repeats the immediately preceding citation; "Supra" points back to an earlier one.'],
  ['The Index of Authorities in a memorial lists…', ['The issues raised', 'The cases, statutes and other sources cited', 'The parties', 'The abbreviations used'], 1, 'With the pages where each authority is cited.'],
  ['In most moots, who usually gets the right of rebuttal?', ['The Respondent', 'The Petitioner / Applicant', 'Neither', 'Whoever spoke last'], 1, 'Usually the Petitioner; some competitions also allow the Respondent a sur-rebuttal. Check your rules.'],
];

const LS_SEEN = 'mc-quiz-seen';
const USUAL_MIN = 40, USUAL_MAX = 70, SLOW_AFTER = 90;

let t0 = 0, clock = null, tipTimer = null, tipIdx = 0, minimized = false, running = false;
let quiz = null;   // { items, i, correct, answered }
let readyFn = null;
const originalTitle = document.title;

const $ = (id) => document.getElementById(id);

function seen() { try { return JSON.parse(localStorage.getItem(LS_SEEN) || '[]'); } catch (e) { return []; } }
function markSeen(i) { try { const s = new Set(seen()); s.add(i); localStorage.setItem(LS_SEEN, JSON.stringify([...s])); } catch (e) {} }

function pickQuestions(n) {
  let pool = QUIZ.map((_, i) => i).filter(i => !seen().includes(i));
  if (pool.length < n) { try { localStorage.removeItem(LS_SEEN); } catch (e) {} pool = QUIZ.map((_, i) => i); }
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}

function elapsed() { return Math.round((Date.now() - t0) / 1000); }

function renderClock() {
  const s = elapsed();
  const slow = s > SLOW_AFTER;
  const pct = Math.min(96, Math.round((s / USUAL_MAX) * 80));
  const el = $('wr-time');
  if (el) {
    el.classList.toggle('slow', slow);
    el.innerHTML = slow
      ? `<span>Taking longer than usual · <b>${s}s</b> — still working. Long propositions can take up to 2 minutes.</span><span class="wr-bar"><b style="width:${pct}%"></b></span>`
      : `<span>Usually ${USUAL_MIN}–${USUAL_MAX} seconds · <b>${s}s so far</b></span><span class="wr-bar"><b style="width:${pct}%"></b></span>`;
  }
  const pt = $('wr-pill-time');
  if (pt) pt.textContent = slow ? `${s}s · taking longer than usual` : `${s}s · usually ${USUAL_MIN}–${USUAL_MAX}s`;
}

function renderTip() {
  const box = $('wr-panel');
  if (!box || quiz) return;
  const dots = [0, 1, 2, 3].map(d => `<i class="${d === tipIdx % 4 ? 'on' : ''}"></i>`).join('');
  box.innerHTML = `
    <div class="wr-head"><span>MOOT TIP</span><span class="wr-dots">${dots}</span></div>
    <div class="wr-tip">${esc(TIPS[tipIdx % TIPS.length])}</div>
    <div class="wr-actions">
      <button type="button" class="wr-link" onclick="window.mcWait.startQuiz()">Try a quick question</button>
      <button type="button" class="wr-btn wr-ghost" onclick="window.mcWait.minimize()">Keep working while I analyse ↘</button>
    </div>`;
}

function renderQuiz() {
  const box = $('wr-panel');
  if (!box || !quiz) return;
  if (quiz.i >= quiz.items.length) {
    box.innerHTML = `
      <div class="wr-head"><span>QUICK QUESTIONS</span></div>
      <div class="wr-tip">That's all ${quiz.items.length}. You got <b>${quiz.correct} of ${quiz.items.length}</b>. Your analysis is still running.</div>
      <div class="wr-actions">
        <button type="button" class="wr-link" onclick="window.mcWait.backToTips()">Back to tips</button>
        <button type="button" class="wr-btn wr-ghost" onclick="window.mcWait.minimize()">Keep working ↘</button>
      </div>`;
    return;
  }
  const [q, opts, ans, why] = QUIZ[quiz.items[quiz.i]];
  const a = quiz.answered;
  box.innerHTML = `
    <div class="wr-head"><span>QUICK QUESTION · ${quiz.i + 1} OF ${quiz.items.length}</span><span class="wr-score">${quiz.correct} correct</span></div>
    <div class="wr-q">${esc(q)}</div>
    <div class="wr-opts">${opts.map((o, k) => {
      const cls = a == null ? '' : k === ans ? ' correct' : k === a ? ' wrong' : '';
      return `<button type="button" class="wr-opt${cls}" ${a == null ? `onclick="window.mcWait.answer(${k})"` : 'disabled'}><span class="k">${'ABCD'[k]}</span>${esc(o)}</button>`;
    }).join('')}</div>
    ${a == null ? '' : `<div class="wr-expl">${esc(why)}</div>`}
    <div class="wr-actions">
      <button type="button" class="wr-link" onclick="window.mcWait.backToTips()">Back to tips</button>
      <span>
        <button type="button" class="wr-btn wr-ghost" onclick="window.mcWait.minimize()">Keep working ↘</button>
        ${a == null ? '' : `<button type="button" class="wr-btn" onclick="window.mcWait.next()">${quiz.i + 1 < quiz.items.length ? 'Next question →' : 'See score →'}</button>`}
      </span>
    </div>`;
}

function ensurePill() {
  let pill = $('wr-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'wr-pill';
    pill.className = 'wr-pill';
    pill.setAttribute('role', 'status');
    document.body.appendChild(pill);
  }
  return pill;
}

function renderPillRunning() {
  const scales = document.querySelector('#loading-overlay .mc-scales');
  const pill = ensurePill();
  pill.className = 'wr-pill';
  pill.innerHTML = `
    <button type="button" class="wr-pill-body" onclick="window.mcWait.restore()" title="Show progress">
      <span class="wr-mini" aria-hidden="true">${scales ? scales.outerHTML.replace(/<text[\s\S]*?<\/text>/g, '') : ''}</span>
      <span class="wr-pill-t"><b>Analysing your proposition…</b><span id="wr-pill-time"></span></span>
    </button>`;
  renderClock();
}

export const mcWait = {
  /** Called when an upload starts. */
  start() {
    running = true; minimized = false; readyFn = null; quiz = null;
    t0 = Date.now();
    tipIdx = Math.floor(Math.random() * TIPS.length);
    $('loading-overlay')?.classList.add('wr-on');
    $('wr-room')?.removeAttribute('hidden');
    renderTip();
    renderClock();
    clearInterval(clock); clock = setInterval(renderClock, 1000);
    clearInterval(tipTimer); tipTimer = setInterval(() => { if (!quiz) { tipIdx++; renderTip(); } }, 8000);
  },
  isRunning() { return running; },
  isMinimized() { return minimized; },
  startQuiz() { quiz = { items: pickQuestions(5), i: 0, correct: 0, answered: null }; renderQuiz(); },
  answer(k) {
    if (!quiz || quiz.answered != null) return;
    quiz.answered = k;
    const idx = quiz.items[quiz.i];
    if (k === QUIZ[idx][2]) quiz.correct++;
    markSeen(idx);
    renderQuiz();
  },
  next() { if (!quiz) return; quiz.i++; quiz.answered = null; renderQuiz(); },
  backToTips() { quiz = null; renderTip(); },
  /** Shrink to the corner pill; the analysis keeps running. */
  minimize() {
    if (!running) return;
    minimized = true;
    $('loading-overlay')?.classList.remove('show');
    renderPillRunning();
  },
  /** Bring the full progress card back. */
  restore() {
    if (!running) return;
    minimized = false;
    $('wr-pill')?.remove();
    $('loading-overlay')?.classList.add('show');
    if (quiz) renderQuiz(); else renderTip();
  },
  /**
   * The analysis has finished. `open` shows the result. If the student is
   * watching the card, open it now; if they went off to work elsewhere,
   * wait for them to click Open.
   */
  finish(open, { failed = false, message = '' } = {}) {
    this.stop();
    if (!minimized) return open();
    readyFn = open;
    const pill = ensurePill();
    pill.className = 'wr-pill ' + (failed ? 'wr-failed' : 'wr-ready');
    pill.innerHTML = `
      <span class="wr-mini" aria-hidden="true">${failed ? '!' : '✓'}</span>
      <span class="wr-pill-t"><b>${failed ? 'Analysis did not finish' : 'Analysis ready'}</b><span>${esc(message || (failed ? 'See what went wrong' : 'Your proposition has been analysed'))}</span></span>
      <button type="button" class="wr-btn" onclick="window.mcWait.openReady()">${failed ? 'See why' : 'Open →'}</button>`;
    document.title = (failed ? '! Analysis did not finish · ' : '✓ Analysis ready · ') + originalTitle;
  },
  openReady() {
    const fn = readyFn; readyFn = null;
    // Whatever the student opened meanwhile (Moot Calendar, Memorial Review)
    // closes on Escape; close it so the analysis is not opened behind it.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    $('wr-pill')?.remove();
    document.title = originalTitle;
    minimized = false;
    if (fn) fn();
  },
  /** Timers off; the card's wait-room content hidden (the overlay is reused for other loads). */
  stop() {
    running = false;
    clearInterval(clock); clearInterval(tipTimer);
    $('loading-overlay')?.classList.remove('wr-on');
    $('wr-room')?.setAttribute('hidden', '');
  },
  /** Abandon a run (sign-out): no pill, no result. */
  cancel() {
    this.stop();
    readyFn = null; minimized = false;
    $('wr-pill')?.remove();
    document.title = originalTitle;
  },
};
window.mcWait = mcWait;

// Closing the tab mid-analysis loses it; the browser asks first.
window.addEventListener('beforeunload', (e) => {
  if (running) { e.preventDefault(); e.returnValue = ''; }
});

export const _forReview = { TIPS, QUIZ };
