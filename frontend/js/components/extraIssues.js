/**
 * "Consider Extra Issues" — the step between reading the analysis and building
 * arguments.
 *
 * Suggested issues used to be merged straight into the issue workspace, the
 * Argument Builder and the memorial. That decided for the advocate: four or
 * five extra issues simply appeared among the ones the proposition actually
 * framed. Raising an issue the facts cannot carry is how counsel gets shut
 * down, so adopting one has to be a deliberate act.
 *
 * Nothing here reaches the rest of the product until it is added. Each
 * suggestion carries a status on the analysis object itself:
 *
 *   undefined / 'pending'  still deciding   - shown here, nowhere else
 *   'added'                adopted          - flows downstream as a real issue
 *   'dismissed'            rejected         - collapsed, but recoverable
 *
 * Dismissed is recoverable on purpose. A mooter often rejects a ground early
 * and reconsiders it after research, and the alternative would be re-running
 * the whole analysis to get it back.
 */

import { lastAnalysis, setLastAnalysis } from './ui.js';
import { currentUser, db } from '../services/firebase.js';

const STATUS = { PENDING: 'pending', ADDED: 'added', DISMISSED: 'dismissed' };

const RISK = {
  Safe:       { cls: 'badge-green', dot: '#4caf82', note: 'a bench would expect this to be raised' },
  Arguable:   { cls: 'badge-gold',  dot: '#c9a227', note: 'genuinely open — needs a clean authority' },
  Aggressive: { cls: 'badge-red',   dot: '#B0392E', note: 'a stretch the bench may reject' },
};

let showDismissed = false;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* The analysis JSON is the single source of truth, so a decision made here is
   visible to every consumer without a second store to keep in sync.

   It lives in ui.js as an exported binding, NOT on window. An earlier version
   of this file read window.lastAnalysis alone, which nothing in the app ever
   assigns - so every suggestion silently vanished and this step showed its
   empty state even with an analysis open. Read it the way the rest of the app
   does, and write it through the setter so the live binding updates for
   everyone holding it. */
function readAnalysis() {
  try {
    const raw = window.lastAnalysis || lastAnalysis;
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('[EXTRA ISSUES] Could not parse the analysis:', e);
    return null;
  }
}

/**
 * Save the adopt/dismiss decisions onto the stored analysis.
 *
 * Without this the choices live only in memory, so reopening the moot from the
 * sidebar - which an advocate does constantly, one per moot - would silently
 * put every decision back to undecided and reinstate suggestions they had
 * already rejected.
 *
 * Fire and forget. A failed write must never block the click or lose the
 * in-memory state, and the advocate can still work the whole session; they
 * would only lose the decisions on a reload, which is the old behaviour.
 */
function persistDecisions(additionalIssues) {
  const docId = window.currentMootDocId;
  if (!docId || docId === 'default' || !currentUser || !db) return;
  try {
    db.collection('artifacts').doc('moot.coach')
      .collection('users').doc(currentUser.uid)
      .collection('analyses').doc(docId)
      .update({ 'analysisData.additionalIssues': additionalIssues })
      .catch(err => console.warn('[EXTRA ISSUES] Could not save the decision:', err && err.message));
  } catch (e) {
    console.warn('[EXTRA ISSUES] Could not save the decision:', e && e.message);
  }
}

function writeAnalysis(data) {
  // Pretty-printed to match what showStructuredResults stores, since Copy All
  // hands this same string to the clipboard.
  const json = JSON.stringify(data, null, 2);
  setLastAnalysis(json);
  persistDecisions(data.additionalIssues || []);
  // Only mirror onto window if something had already put it there. Making
  // window the primary store would outlive the next upload and serve the
  // previous moot's analysis to every consumer that prefers it.
  if (window.lastAnalysis) window.lastAnalysis = json;
}

export function getSuggestions() {
  const d = readAnalysis();
  return (d && Array.isArray(d.additionalIssues)) ? d.additionalIssues.filter(a => a && a.issue) : [];
}

export function statusOf(a) {
  return a && a.status === STATUS.ADDED ? STATUS.ADDED
       : a && a.status === STATUS.DISMISSED ? STATUS.DISMISSED
       : STATUS.PENDING;
}

/** The only issues allowed downstream. */
export function getAdoptedIssues() {
  return getSuggestions().filter(a => statusOf(a) === STATUS.ADDED);
}

export function setIssueStatus(index, status) {
  const d = readAnalysis();
  if (!d || !Array.isArray(d.additionalIssues)) return;
  const a = d.additionalIssues[index];
  if (!a) return;

  // Clicking the active choice again returns it to undecided, so a misclick
  // costs nothing.
  a.status = (a.status === status) ? STATUS.PENDING : status;
  writeAnalysis(d);

  renderExtraIssues();
  refreshDownstream();
}

/* Re-run everything that reads the adopted set, so adding an issue here shows
   up in the workspace without the advocate having to navigate away and back. */
function refreshDownstream() {
  try {
    if (typeof window.renderStage2Issues === 'function') window.renderStage2Issues();
    if (typeof window.populateIssuesFromAnalysis === 'function') window.populateIssuesFromAnalysis();
    // The analysis card counts what has been adopted, so it goes stale here too.
    if (typeof window.refreshAdditionalIssuesCard === 'function') window.refreshAdditionalIssuesCard();
  } catch (e) {
    console.error('[EXTRA ISSUES] Downstream refresh failed:', e);
  }
}

function card(a, index, framedCount, ordinal) {
  const st = statusOf(a);
  const risk = RISK[a.confidence] || RISK.Arguable;
  const added = st === STATUS.ADDED;

  const field = (label, val) => val
    ? '<div style="display:flex;gap:9px;margin-top:9px;font-size:.78rem;line-height:1.62;">'
      + '<span style="color:var(--white-muted);flex:0 0 94px;">' + label + '</span>'
      + '<span style="color:var(--white-2);flex:1;">' + esc(val) + '</span></div>'
    : '';

  const numberLabel = added
    ? 'Issue ' + (framedCount + ordinal) + '.'
    : 'Suggestion.';

  return ''
    + '<div style="border:1px solid ' + (added ? 'rgba(76,175,130,.45)' : 'var(--glass-b)') + ';'
    +   'border-radius:12px;padding:15px 17px;margin-bottom:13px;'
    +   'background:' + (added ? 'rgba(76,175,130,.07)' : 'var(--glass)') + ';">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">'
    +   '<div style="font-size:.88rem;line-height:1.6;color:var(--white);font-weight:500;flex:1;">'
    +     '<span style="color:var(--white-muted);font-weight:400;">' + numberLabel + '</span> ' + esc(a.issue)
    +   '</div>'
    +   '<span class="asc-badge ' + risk.cls + '" style="flex:0 0 auto;white-space:nowrap;">' + esc(a.confidence) + '</span>'
    + '</div>'
    + '<div style="font-size:.72rem;color:var(--white-muted);margin-top:6px;">'
    +   '<span style="color:' + risk.dot + ';">●</span> ' + risk.note
    + '</div>'
    + field('Grounded in', a.groundedIn)
    + field('Rests on', a.legalBasis)
    + field('Helps', a.favours)
    + field('Earns marks', a.whyItEarnsMarks)
    + '<div style="display:flex;gap:9px;margin-top:14px;padding-top:13px;border-top:1px solid var(--glass-b);">'
    +   '<button class="btn-sm ' + (added ? 'btn-sm-gold' : 'btn-sm-ghost') + '"'
    +     ' onclick="window.setIssueStatus(' + index + ',\'added\')">'
    +     (added ? '✓ Added to my issues' : '+ Add this issue') + '</button>'
    +   (added ? '' : '<button class="btn-sm btn-sm-ghost" onclick="window.setIssueStatus(' + index + ',\'dismissed\')">Dismiss</button>')
    + '</div>'
    + '</div>';
}

function dismissedRow(a, index) {
  return ''
    + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;'
    +   'padding:10px 14px;border:1px solid var(--glass-b);border-radius:9px;margin-bottom:8px;opacity:.72;">'
    + '<div style="font-size:.8rem;color:var(--white-muted);line-height:1.55;flex:1;">' + esc(a.issue) + '</div>'
    + '<button class="btn-sm btn-sm-ghost" onclick="window.setIssueStatus(' + index + ',\'dismissed\')">Restore</button>'
    + '</div>';
}

export function toggleDismissedIssues() {
  showDismissed = !showDismissed;
  renderExtraIssues();
}

export function renderExtraIssues() {
  const host = document.getElementById('extra-issues-body');
  if (!host) return;

  const d = readAnalysis();
  const framedCount = (d && d.legalIssues || []).length;
  const all = getSuggestions();

  if (!all.length) {
    // Two different situations here, and telling an advocate to "upload a
    // proposition" when one is plainly open and analysed is the wrong answer
    // to both. Say which it actually is.
    const hasAnalysis = !!d && (framedCount > 0 || !!d.summary);
    const shell = (icon, title, body) => ''
      + '<div style="text-align:center;padding:48px 24px;border:1px dashed var(--glass-b);border-radius:14px;">'
      + '<div style="font-size:1.6rem;margin-bottom:10px;opacity:.5;">' + icon + '</div>'
      + '<div style="font-size:.92rem;color:var(--white);margin-bottom:9px;">' + title + '</div>'
      + '<div style="font-size:.82rem;color:var(--white-muted);line-height:1.72;max-width:470px;margin:0 auto;">'
      + body + '</div>'
      + '<button class="btn-sm btn-sm-ghost" style="margin-top:18px;" onclick="window.goToStage(1)">'
      + '← Back to Analysis</button>'
      + '</div>';

    host.innerHTML = hasAnalysis
      ? shell('○', 'No extra issues for this analysis',
          'The analysis is loaded, but it did not come with any suggested issues. That is '
          + 'usually because it was run before this step existed — re-upload the proposition '
          + 'in the Analysis step and the extra issues will be offered here.')
      : shell('✛', 'Nothing to consider yet',
          'Upload and analyse a proposition in the Analysis step, and any issues its facts '
          + 'will carry but it never states will be offered here.');
    return;
  }

  const pending = [], added = [], dismissed = [];
  all.forEach((a, i) => {
    const entry = { a, i };
    const st = statusOf(a);
    if (st === STATUS.ADDED) added.push(entry);
    else if (st === STATUS.DISMISSED) dismissed.push(entry);
    else pending.push(entry);
  });

  const section = (title, sub) => ''
    + '<div style="margin:26px 0 13px;">'
    + '<div style="font-size:.7rem;letter-spacing:.09em;text-transform:uppercase;color:var(--white-muted);">' + title + '</div>'
    + (sub ? '<div style="font-size:.76rem;color:var(--white-muted);opacity:.8;margin-top:4px;">' + sub + '</div>' : '')
    + '</div>';

  let html = ''
    + '<div style="font-size:.82rem;color:var(--white-2);line-height:1.72;margin-bottom:6px;">'
    +   'The proposition frames <strong>' + framedCount + '</strong> issue' + (framedCount === 1 ? '' : 's') + '. '
    +   'These <strong>' + all.length + '</strong> are further issues its facts will carry but it never states — '
    +   'the kind a bench credits counsel for spotting.'
    + '</div>'
    + '<div style="font-size:.78rem;color:var(--white-muted);line-height:1.7;margin-bottom:4px;">'
    +   'Nothing here is added to your memorial or your oral prep until you add it. '
    +   'Take only the ones you can anchor in the record — an issue the facts will not carry costs you more than it wins.'
    + '</div>';

  if (added.length) {
    html += section('Added to my issues · ' + added.length,
      'These now sit alongside the framed issues in the Issue Workspace, the Argument Builder and the memorial.');
    html += added.map((e, n) => card(e.a, e.i, framedCount, n + 1)).join('');
  }

  if (pending.length) {
    html += section('Still deciding · ' + pending.length, '');
    html += pending.map(e => card(e.a, e.i, framedCount, 0)).join('');
  }

  if (dismissed.length) {
    html += '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--glass-b);">'
      + '<button class="btn-sm btn-sm-ghost" onclick="window.toggleDismissedIssues()">'
      + (showDismissed ? '▾' : '▸') + ' Dismissed · ' + dismissed.length
      + (showDismissed ? '' : ' — show') + '</button>'
      + (showDismissed
          ? '<div style="margin-top:13px;">'
            + '<div style="font-size:.76rem;color:var(--white-muted);margin-bottom:10px;line-height:1.65;">'
            + 'Kept in case research changes your mind.</div>'
            + dismissed.map(e => dismissedRow(e.a, e.i)).join('')
            + '</div>'
          : '')
      + '</div>';
  }

  host.innerHTML = html;

  const countEl = document.getElementById('extra-issues-count');
  if (countEl) {
    countEl.textContent = added.length
      ? added.length + ' of ' + all.length + ' added'
      : all.length + ' to consider';
  }
}
