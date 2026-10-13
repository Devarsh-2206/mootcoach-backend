/**
 * What a moot has reached, kept with the moot.
 *
 * The plain-text drafts per issue were saved, but three things were not, and
 * reopening a moot lost them:
 *   - the structured Stage 3 draft, which the typeset memorial export and the
 *     Chambers Briefing are built from;
 *   - the issue and side chosen, so a Respondent's moot reopened as
 *     Petitioner and could be drafted or scored for the wrong side;
 *   - a prepared Chambers Briefing.
 *
 * One document per moot: analyses/{id}/advocacy/_moot_state. It sits under
 * the user's own analysis, so the existing rules cover it and deleting the
 * moot deletes it. Objects are stored as JSON strings: Firestore rejects
 * nested arrays and undefined values, both of which a draft can contain.
 */
import { db, currentUser } from './firebase.js';

const DOC = '_moot_state';
const MAX_BYTES = 900 * 1024;   // a Firestore document is capped at 1 MiB

let timer = null;
/* Nothing is saved for a moot until its saved state has been read back:
   otherwise opening a moot writes its empty, just-reset state over the
   draft before the draft has been restored. */
let restoredFor = null;

function refFor(mootId, docName = DOC) {
  const user = currentUser || (window.firebase && window.firebase.auth && window.firebase.auth().currentUser);
  if (!user || !mootId || mootId === 'default') return null;
  return db.collection('artifacts').doc('moot.coach').collection('users').doc(user.uid)
    .collection('analyses').doc(mootId).collection('advocacy').doc(docName);
}

function snapshot() {
  const ms = window.mootState || {};
  const built = window.getBuiltArgument ? window.getBuiltArgument() : {};
  const out = {
    // Only a chosen issue is restored as chosen.
    issueIndex: ms.issueChosen && Number.isInteger(ms.issueIndex) ? ms.issueIndex : null,
    issueText: ms.issueText || '',
    stance: ms.stanceChosen ? (ms.stance || '') : '',
    builtSide: built.side || '',
    builtArgumentJson: built.arg ? JSON.stringify(built.arg) : '',
    briefingJson: window.getChambersBriefing && window.getChambersBriefing() ? JSON.stringify(window.getChambersBriefing()) : '',
    updatedAt: Date.now(),
  };
  const bytes = str => new TextEncoder().encode(str).length;
  if (bytes(out.builtArgumentJson) + bytes(out.briefingJson) > MAX_BYTES) {
    // Too large to keep in one document: keep the selection, drop the briefing first.
    console.warn('[MOOT PROGRESS] Draft too large to save in full; keeping the selection.');
    out.briefingJson = '';
    if (bytes(out.builtArgumentJson) > MAX_BYTES) out.builtArgumentJson = '';
  }
  return out;
}

/** Save shortly after the last change; cheap to call on every change. */
export function saveMootProgress() {
  const mootId = window.currentMootDocId;
  if (!mootId || restoredFor !== mootId) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const ref = refFor(mootId);
    if (!ref || window.currentMootDocId !== mootId) return;
    ref.set(snapshot()).catch(e => console.warn('[MOOT PROGRESS] save failed:', e && e.message));
  }, 800);
}

/** Read the moot's saved state back and put every stage where it was left. */
export async function restoreMootProgress(mootId) {
  restoredFor = null;
  loadMootFeedback(mootId);
  try {
    const ref = refFor(mootId);
    const snap = ref ? await ref.get() : null;
    if (window.currentMootDocId !== mootId) return;   // another moot opened meanwhile
    const d = snap && snap.exists ? snap.data() : null;
    if (d) {
      if (Number.isInteger(d.issueIndex) && window.restoreIssueSelection) {
        window.restoreIssueSelection(d.issueIndex, d.stance);
      } else if (d.stance && window.setIwStance) {
        window.setIwStance(/respondent/i.test(d.stance) ? 'respondent' : 'petitioner');
      }
      if (d.builtArgumentJson && window.restoreBuiltArgument) {
        try { window.restoreBuiltArgument(JSON.parse(d.builtArgumentJson), d.builtSide || d.stance); } catch (e) { /* unreadable draft: start without it */ }
      }
      if (d.briefingJson && window.restoreChambersBriefing) {
        try { window.restoreChambersBriefing(JSON.parse(d.briefingJson)); } catch (e) { /* as above */ }
      }
    }
  } catch (e) {
    console.warn('[MOOT PROGRESS] restore failed:', e && e.message);
  } finally {
    if (window.currentMootDocId === mootId) restoredFor = mootId;
  }
}

/** A moot is opening: hold every save until its state has been read back. */
export function pauseMootProgress() {
  restoredFor = null;
  clearTimeout(timer);
}

/** A brand-new analysis has nothing to restore; start saving straight away. */
export function startFreshMootProgress(mootId) {
  restoredFor = mootId || null;
}

window.saveMootProgress = saveMootProgress;
window.restoreMootProgress = restoreMootProgress;
window.startFreshMootProgress = startFreshMootProgress;
window.pauseMootProgress = pauseMootProgress;

/* ── What the bench caught ──
   Simulator rounds and Oral Coach evaluations used to end where they were
   shown: a scorecard saying the bench broke the advocate on necessity never
   reached the drafting stage or the briefing. The last few results are kept
   with the moot (analyses/{id}/advocacy/_feedback) and shown where the
   advocate redrafts and prepares. */
const FEEDBACK_DOC = '_feedback';
const FEEDBACK_KEEP = 8;
let feedback = [];
let feedbackFor = null;

function feedbackRef(mootId) {
  return refFor(mootId, FEEDBACK_DOC);
}

const clean = arr => (Array.isArray(arr) ? arr : []).map(x => String(x || '').trim()).filter(x => x.length > 3).slice(0, 6);

export async function loadMootFeedback(mootId) {
  feedback = []; feedbackFor = mootId;
  try {
    const ref = feedbackRef(mootId);
    const snap = ref ? await ref.get() : null;
    if (feedbackFor !== mootId) return;
    const d = snap && snap.exists ? snap.data() : null;
    feedback = d && d.itemsJson ? JSON.parse(d.itemsJson) : [];
  } catch (e) { feedback = []; }
  refreshFeedbackViews();
}

/** source: 'bench' | 'voice' | 'oral'. points: what to fix, most important first. */
export function recordMootFeedback({ source, score, mode, points, concerns }) {
  const mootId = window.currentMootDocId;
  const entry = { source, score: Number.isFinite(Number(score)) ? Number(score) : null, mode: mode || '', points: clean(points), concerns: clean(concerns), at: Date.now() };
  if (!entry.points.length && !entry.concerns.length) return;
  const last = feedback[0];
  if (last && last.source === entry.source && JSON.stringify(last.points) === JSON.stringify(entry.points)) return;  // same result shown again
  feedback = [entry].concat(feedback).slice(0, FEEDBACK_KEEP);
  refreshFeedbackViews();
  const ref = mootId && feedbackFor === mootId ? feedbackRef(mootId) : null;
  if (ref) ref.set({ itemsJson: JSON.stringify(feedback), updatedAt: Date.now() }).catch(e => console.warn('[FEEDBACK] save failed:', e && e.message));
}

export function getMootFeedback() { return feedback.slice(); }

/** The recurring points, for prompts: what came up, most recent first, no repeats. */
export function feedbackPoints(limit = 6) {
  const seen = new Set(), out = [];
  for (const f of feedback) for (const p of f.points.concat(f.concerns)) {
    const k = p.toLowerCase().slice(0, 60);
    if (!seen.has(k)) { seen.add(k); out.push(p); }
    if (out.length >= limit) return out;
  }
  return out;
}

const SOURCE_NAME = { bench: 'Simulator round', voice: 'Voice round', oral: 'Oral Coach' };
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A short card: the latest result's score and the points to work on. */
export function feedbackNoteHTML() {
  if (!feedback.length) return '';
  const latest = feedback[0];
  const points = feedbackPoints(4);
  const when = new Date(latest.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `<div class="mc-feedback-note" style="padding:12px 14px;border:1px solid var(--glass-b);border-left:3px solid var(--acc-red, #c0392b);border-radius:0 10px 10px 0;margin-bottom:12px;">
    <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--white-muted);margin-bottom:6px;">What the bench caught last time · ${escHtml(SOURCE_NAME[latest.source] || 'Practice')}${latest.score != null ? ` · ${latest.score}/100` : ''} · ${when}</div>
    <ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.55;color:var(--white-2);">${points.map(p => `<li>${escHtml(p)}</li>`).join('')}</ul>
  </div>`;
}

function refreshFeedbackViews() {
  // Stage 3: above the drafting notes.
  const notes = document.getElementById('builder-notes-input');
  if (notes) {
    let box = document.getElementById('mc-feedback-stage3');
    if (!box) {
      box = document.createElement('div');
      box.id = 'mc-feedback-stage3';
      const anchor = notes.closest('.ws-field') || notes;
      anchor.parentNode.insertBefore(box, anchor);
    }
    box.innerHTML = feedbackNoteHTML();
  }
  // The Chambers Briefing renders the note itself.
  if (typeof window.renderStage4OralNotes === 'function') window.renderStage4OralNotes();
}

window.recordMootFeedback = recordMootFeedback;
window.getMootFeedbackPoints = feedbackPoints;
window.mootFeedbackHTML = feedbackNoteHTML;
window.loadMootFeedback = loadMootFeedback;
