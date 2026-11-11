/**
 * Cases cited INSIDE the analysis's text — the arguments for both sides, the
 * additional issues, the defect explanations, the bench questions — are
 * checked the same way as the case list (services/confirmCases.js).
 *
 * WHY: the case list was checked, but a Sahyadri test showed ~15 more cases
 * named inside the arguments that nothing checked (some with doubtful
 * citations). The owner's rule is that MootCoach shows only cases it has
 * confirmed. So:
 *   - a confirmed case stays; a corrected citation replaces the wrong one;
 *   - a case that cannot be confirmed is taken out: a citation in brackets is
 *     dropped with its brackets, an inline one becomes "[unconfirmed authority
 *     removed]" so the sentence does not silently change meaning.
 *
 * Cost control: at most MAX_CHECK cases per analysis, in ONE verifier call
 * (so at most 6 paid Indian Kanoon searches, see services/indianKanoon.js);
 * cases already confirmed in the case list are not checked again; the
 * verifier remembers every answer for 30 days.
 */
const { verifyAuthorities } = require('./authorityVerifier');

const MAX_CHECK = Number(process.env.CITED_CASES_MAX || 12);
const REMOVED = '[unconfirmed authority removed]';

// A party name: capitalised words, with the small joining words inside names.
const TOK = "(?:[A-Z][A-Za-z0-9.'’&\\-]*|of|and|for|the|de|da|du|von|&)";
const NAME = `[A-Z][A-Za-z0-9.'’&\\-]*(?:\\s+${TOK}){0,12}`;
// Common report citations: (2017) 10 SCC 1 · 1992 Supp (1) SCC 335 ·
// AIR 1955 SC 549 · 1962 Supp (2) SCR 769 · 2023 SCC OnLine SC 123 ·
// [2017] UKSC 42 · (1993) 2 SCC 746 · 2024 INSC 123.
const CITE = [
  '\\(\\d{4}\\)\\s*\\d{1,3}\\s*SCC\\s*\\d+',
  '\\d{4}\\s+Supp\\s*(?:\\(\\d\\)\\s*)?(?:SCC|SCR)\\s*\\d+',
  '\\(\\d{4}\\)\\s*Supp\\s*\\(?\\d?\\)?\\s*(?:SCC|SCR)\\s*\\d+',
  'AIR\\s+\\d{4}\\s+[A-Z][A-Za-z]*\\s+\\d+',
  '\\d{4}\\s+SCC\\s+OnLine\\s+[A-Za-z]+\\s+\\d+',
  '\\d{4}\\s+INSC\\s+\\d+',
  '\\(\\d{4}\\)\\s*\\d{1,3}\\s*SCR\\s*\\d+',
  '\\[\\d{4}\\]\\s*\\d*\\s*[A-Z][A-Za-z]{1,6}\\s*\\d+',
].join('|');
const CASE_RE = new RegExp(`(${NAME})\\s+(?:v\\.|vs\\.?|v/s|versus)\\s+(${NAME})(?:,?\\s*(${CITE}))?`, 'g');

// Words that begin a sentence, not a party name.
const LEAD = /^(?:(?:In|As|See|Under|Following|Per|Also|Cf\.?|Further|Similarly|Applying|Relying|Unlike|Like|Moreover|However|Thus|Hence|Accordingly|Notably|Crucially|Both|Whereas|While|Since|Because|And|But|Following|Citing|Distinguishing|Invoking|Per|Vide|Ibid)\s+)+/;
const TRAIL = /(?:\s+(?:of|and|for|the|&))+$/;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// A word ending in "." that is NOT an abbreviation ends a sentence, so it ends
// a party name too ("…v. State of Bihar. Next…"). Initials ("K.S.", "U.P.")
// and common abbreviations ("Ltd.", "Pvt.", "Anr.") do not.
const ABBR = /^(?:(?:[A-Za-z]\.)+|(?:Ltd|Pvt|Anr|Ors|Co|Inc|Corpn|Govt|Bros|Assn|Commr|Supdt|Secy|Mohd|Dr|Mr|Mrs|Ms|Smt|Shri|Sri|St|Jr|Sr|Retd|Addl|Dy|Asstt?|Distt?|Deptt?|Etc)\.)$/i;
const endsSentence = (tok) => /\.$/.test(tok) && !ABBR.test(tok);

/** Pure: the cases cited in one string, with their positions. */
function findCited(text) {
  const s = String(text || '');
  const out = [];
  const re = new RegExp(CASE_RE.source, 'g');
  let m;
  while ((m = re.exec(s))) {
    // Left party: drop words before a sentence end, then sentence openers.
    let left = m[1], start = m.index;
    const lt = left.split(/(\s+)/);
    for (let k = lt.length - 1; k >= 0; k -= 1) {
      if (k % 2 === 0 && endsSentence(lt[k]) && k < lt.length - 1) {
        const cut = lt.slice(0, k + 1).join('') + (lt[k + 1] || '');
        start += cut.length; left = left.slice(cut.length); break;
      }
    }
    const lead = left.match(LEAD);
    if (lead) { start += lead[0].length; left = left.slice(lead[0].length); }

    // Right party: stop at a sentence end; then drop trailing joining words.
    const rightStart = m.index + m[0].indexOf(m[2], m[1].length);
    let right = m[2], cutRight = false;
    const rt = right.split(/(\s+)/);
    for (let k = 0; k < rt.length; k += 2) {
      if (endsSentence(rt[k])) {
        right = rt.slice(0, k + 1).join('').replace(/\.$/, '');
        cutRight = true; break;
      }
    }
    right = right.replace(TRAIL, '');
    if (!left || !right) continue;
    const citation = cutRight ? '' : (m[3] || '').trim();
    const end = citation ? m.index + m[0].length : rightStart + right.length;
    out.push({ name: `${left} v. ${right}`, citation, start, end });
    re.lastIndex = Math.max(end, m.index + 1);
  }
  return out;
}

/** Pure: apply the verdicts to one string. verdict(key) → {keep, citation?}. */
function cleanText(text, verdictFor) {
  const s = String(text || '');
  const found = findCited(s);
  if (!found.length) return { text: s, removed: 0, corrected: 0 };
  let outText = '', at = 0, removed = 0, corrected = 0;
  for (const f of found) {
    const v = verdictFor(f);
    if (!v) continue;                     // not checked: leave as written
    outText += s.slice(at, f.start);
    if (v.keep) {
      const original = s.slice(f.start, f.end);
      if (v.citation && f.citation && norm(v.citation) !== norm(f.citation)) {
        outText += original.replace(f.citation, v.citation); corrected++;
      } else outText += original;
      at = f.end;
      continue;
    }
    removed++;
    // In brackets: drop the brackets too, and a "see"/"cf." just before them.
    const before = outText.match(/\s*\(\s*(?:see|cf\.?|e\.g\.,?)?\s*$/i);
    const after = s.slice(f.end).match(/^\s*\)/);
    if (before && after) {
      outText = outText.slice(0, outText.length - before[0].length);
      at = f.end + after[0].length;
    } else {
      outText += REMOVED;
      at = f.end;
    }
  }
  outText += s.slice(at);
  // In a list of authorities ("relying on A; B") the marker read as clutter
  // ("relying on [unconfirmed authority removed]; Dhanrajamal…"): drop it
  // from the list, and drop a list it empties. In running prose it stays, so
  // a sentence does not lose its subject silently.
  const R = REMOVED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tidy = outText
    .replace(new RegExp(`\\s*\\((?:relying on|see|cf\\.?|e\\.g\\.,?)?\\s*${R}(?:\\s*;\\s*${R})*\\s*\\)`, 'gi'), '')
    .replace(new RegExp(`${R}\\s*;\\s*`, 'g'), '')
    .replace(new RegExp(`\\s*;\\s*${R}`, 'g'), '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+(?:and|or)\s*([.,;:])/g, '$1')     // "…) and." left by a dropped bracket
    .replace(/\s+([,.;:])/g, '$1');
  return { text: tidy, removed, corrected };
}

/** Which text fields are checked, in priority order (the cap keeps the first). */
function textFields(texts) {
  const t = texts || {};
  const fields = [];
  const arr = (k) => (Array.isArray(t[k]) ? t[k] : []);
  arr('petitionerArguments').forEach((x, i) => fields.push({ path: ['petitionerArguments', i], text: x }));
  arr('respondentArguments').forEach((x, i) => fields.push({ path: ['respondentArguments', i], text: x }));
  arr('additionalIssues').forEach((x, i) => {
    if (x && typeof x === 'object') for (const k of ['legalBasis', 'issue', 'whyItEarnsMarks']) fields.push({ path: ['additionalIssues', i, k], text: x[k] });
  });
  for (const side of ['petitioner', 'respondent']) {
    const d = t.argumentDefects && Array.isArray(t.argumentDefects[side]) ? t.argumentDefects[side] : [];
    d.forEach((x, i) => { if (x && typeof x === 'object') fields.push({ path: ['argumentDefects', side, i, 'explanation'], text: x.explanation }); });
  }
  arr('benchQuestions').forEach((x, i) => fields.push({ path: ['benchQuestions', i], text: x }));
  arr('benchVulnerabilities').forEach((x, i) => fields.push({ path: ['benchVulnerabilities', i], text: x }));
  return fields.filter(f => typeof f.text === 'string' && f.text);
}

/**
 * Check the cases cited in the analysis's text, and return the cleaned text.
 * @param {object} texts     { petitionerArguments, respondentArguments, additionalIssues, argumentDefects, benchQuestions, benchVulnerabilities }
 * @param {Array}  confirmed precedents already confirmed (their names count as confirmed here)
 * @returns {{ texts, citedCheck: {found, checked, kept, removed, corrected, unchecked} }}
 */
async function checkCitedCases(texts, { forum, confirmed = [], verify = verifyAuthorities, timeoutMs = 60000 } = {}) {
  const out = JSON.parse(JSON.stringify(texts || {}));
  const fields = textFields(out);
  const known = new Map();   // norm(name) -> verdict
  for (const c of confirmed || []) {
    const n = norm(c && (c.caseName || c.name));
    if (n) known.set(n, { keep: true, citation: c.citation || '' });
  }
  const isKnown = (name) => {
    const n = norm(name);
    for (const [k, v] of known) if (k && (n.includes(k) || k.includes(n))) return v;
    return null;
  };
  // Distinct cases still to check, in field order.
  const todo = [];
  const seen = new Set();
  for (const f of fields) for (const c of findCited(f.text)) {
    const n = norm(c.name);
    if (!n || seen.has(n) || isKnown(c.name)) continue;
    seen.add(n); todo.push(c);
  }
  const checking = todo.slice(0, MAX_CHECK);
  const verdicts = new Map();
  if (checking.length) {
    const res = await Promise.race([
      verify(checking.map(c => ({ name: c.name, citation: c.citation })), { forum }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('cited-case check timed out')), timeoutMs)),
    ]);
    checking.forEach((c, i) => {
      const r = res[i];
      const ok = r && (r.status === 'verified' || r.status === 'corrected');
      verdicts.set(norm(c.name), ok ? { keep: true, citation: r.status === 'corrected' ? r.foundCitation : '' } : { keep: false });
    });
  }
  const verdictFor = (c) => isKnown(c.name) || verdicts.get(norm(c.name)) || null;

  let removed = 0, corrected = 0;
  for (const f of fields) {
    const r = cleanText(f.text, verdictFor);
    if (r.text !== f.text) {
      let o = out; for (let k = 0; k < f.path.length - 1; k++) o = o[f.path[k]];
      o[f.path[f.path.length - 1]] = r.text;
    }
    removed += r.removed; corrected += r.corrected;
  }
  const kept = [...verdicts.values()].filter(v => v.keep).length;
  const citedCheck = { found: seen.size + 0, checked: checking.length, kept, removed, corrected, unchecked: todo.length - checking.length };
  if (citedCheck.unchecked) console.warn(`[CITED CASES] ${citedCheck.unchecked} cited cases over the cap of ${MAX_CHECK} were not checked.`);
  console.log(`[CITED CASES] checked ${checking.length}, kept ${kept}, removed ${removed} mention(s), corrected ${corrected}.`);
  return { texts: out, citedCheck };
}

module.exports = { checkCitedCases, findCited, cleanText, textFields, REMOVED };
