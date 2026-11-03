/**
 * Only cases MootCoach has confirmed reach the student.
 *
 * WHY: a student uses MootCoach to save research time and to cite with
 * confidence. A case shown as "found only on unofficial sites, check it
 * yourself" hands the work back, and if the student then cannot find it on
 * Indian Kanoon, every other case on the page loses their trust too. So the
 * analysis checks each suggested case (services/authorityVerifier.js: only
 * court and government sites, law databases and national newspapers count)
 * and keeps only those confirmed, with the corrected citation where the
 * suggested one was wrong. What could not be confirmed is left out and only
 * counted, so the page can say so honestly.
 *
 * Everything downstream (the Advocacy authority list, drafts, memorials, the
 * bench) reads precedentsNeeded, so this one filter covers them all.
 *
 * If the check itself fails (quota, timeout), nothing unconfirmed is shown
 * either: the cases wait in precedentsPending and the page offers to check
 * them again.
 */
const { verifyAuthorities, MAX_ITEMS } = require('./authorityVerifier');

const nameOf = c => String((c && (c.caseName || c.name)) || (typeof c === 'string' ? c : '')).trim();

async function confirmPrecedents(analysis, { forum, timeoutMs = 45000, verify = verifyAuthorities } = {}) {
  if (!analysis || typeof analysis !== 'object') return null;
  if (analysis.casesCheck && !analysis.casesCheck.failed) return analysis.casesCheck;
  // A check that failed earlier is retried on the cases it held back.
  if (analysis.casesCheck && analysis.casesCheck.failed) {
    analysis.precedentsNeeded = analysis.precedentsPending || [];
    delete analysis.casesCheck;
  }
  const list = (Array.isArray(analysis.precedentsNeeded) ? analysis.precedentsNeeded : [])
    .map(c => (typeof c === 'string' ? { caseName: c } : c))
    .filter(c => c && nameOf(c));
  if (!list.length) { analysis.casesCheck = { suggested: 0, kept: 0, removed: 0 }; return analysis.casesCheck; }

  const batches = [];
  for (let i = 0; i < list.length; i += MAX_ITEMS) batches.push(list.slice(i, i + MAX_ITEMS));
  let results;
  try {
    const all = await Promise.race([
      Promise.all(batches.map(b => verify(b.map(c => ({ name: nameOf(c), citation: String(c.citation || '').replace(/^citation unverified$/i, '') })), { forum }))),
      new Promise((_, rej) => setTimeout(() => rej(new Error('case check timed out')), timeoutMs)),
    ]);
    results = all.flat();
  } catch (err) {
    console.warn('[CASES] check failed, holding cases back:', err && err.message);
    analysis.precedentsPending = list;
    analysis.precedentsNeeded = [];
    analysis.casesCheck = { failed: true, suggested: list.length, kept: 0, removed: 0 };
    return analysis.casesCheck;
  }

  const kept = [];
  list.forEach((c, i) => {
    const r = results[i];
    if (!r || (r.status !== 'verified' && r.status !== 'corrected')) return;
    const out = { ...c };
    if (r.status === 'corrected' && r.foundCitation) { out.citationGiven = c.citation; out.citation = r.foundCitation; }
    // Indian Kanoon confirmed the case but the suggested reporter citation does
    // not fit its decision date: show the court and date instead of a guess.
    if (r.citationDropped) { out.citationGiven = c.citation; out.citation = ''; }
    if (r.court) out.court = r.court;
    if (r.date) out.decided = r.date;
    if (r.url) out.judgmentUrl = r.url;
    if (r.foundName && r.foundName.length > 3 && !out.caseName) out.caseName = r.foundName;
    out.verification = { status: r.status, source: r.source || 'web', foundCitation: r.foundCitation, court: r.court, date: r.date, url: r.url, sources: (r.sources || []).slice(0, 2) };
    kept.push(out);
  });
  analysis.precedentsNeeded = kept;
  delete analysis.precedentsPending;
  analysis.casesCheck = { suggested: list.length, kept: kept.length, removed: list.length - kept.length, checkedAt: new Date().toISOString() };
  console.log(`[CASES] ${kept.length} of ${list.length} suggested cases confirmed; ${list.length - kept.length} left out.`);
  return analysis.casesCheck;
}

module.exports = { confirmPrecedents };
