/**
 * Oral argument scoring that gives the same answer twice.
 *
 * WHY THE MODEL NO LONGER PICKS THE NUMBERS
 * The model used to return the score itself, at temperature 0.2, with a
 * different "standard" pasted in per bench mode. Measured by a tester on one
 * strong argument, run twice per mode: Moderate 70 then 56, Hard 63 then 46,
 * and Legal Accuracy 24/25 on Easy against 10/25 on Moderate. A real cited
 * case (Khan Chand) was "incorrect" on one run and "fabricated" on the next.
 * A student cannot learn anything from a score that moves 17 points when
 * nothing they wrote changed.
 *
 * So the work is split:
 *   - the model reads the argument ONCE, at temperature 0, without being told
 *     the bench mode, and places each dimension on a described level (0-5)
 *     and lists every authority cited with its verdict;
 *   - this file turns that into points, deterministically: level -> points,
 *     a fixed deduction per bad citation, then the bench mode as a fixed
 *     multiplier, then the caps.
 *
 * Levels are coarse on purpose. "Is this a 3 or a 4" is a far more stable
 * judgement than "is this 68 or 61", and the band descriptors say what each
 * level means.
 *
 * The bench mode changes how hard the bench marks everything EXCEPT the law:
 * Legal Accuracy is the same in every mode, because a case is not more or
 * less correct in front of a gentler bench.
 *
 * The same text is cached (memory, then Firestore when available), so a
 * repeat - or a switch of bench mode - returns the identical assessment.
 */

const crypto = require('crypto');
const admin = require('firebase-admin');

const DIMENSIONS = [
  { key: 'legalAccuracy', max: 25, label: 'Legal Accuracy' },
  { key: 'argumentStructure', max: 20, label: 'Argument Structure' },
  { key: 'persuasiveness', max: 20, label: 'Persuasiveness' },
  { key: 'languageClarity', max: 15, label: 'Language Clarity' },
  { key: 'pressureReadiness', max: 10, label: 'Pressure Readiness' },
  { key: 'courtRoomDemeanor', max: 10, label: 'Courtroom Demeanor' },
];

/* Applied to everything but Legal Accuracy. Small and fixed: the same
   argument lands within about ten points across the three benches, and the
   order is always Easy >= Moderate >= Hard. Easy used to give 94 to an outline
   Hard called superficial; this cannot. */
const MODE_FACTOR = { easy: 1.08, moderate: 1.0, hard: 0.9 };

/* Deducted from Legal Accuracy in code, per citation, after the moot's own
   authority list has had its say. */
const DEDUCT = { fabricated: 8, misstated: 5, wrongJurisdiction: 5 };

/* Most of a sentence's words must match for it to count as a repeat. */
function repetitionShare(text) {
  const sentences = String(text).split(/(?<=[.!?])\s+/)
    .map(s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(s => s.split(' ').length >= 4);
  if (sentences.length < 3) return 0;
  const seen = new Set();
  let repeats = 0;
  for (const s of sentences) { if (seen.has(s)) repeats++; else seen.add(s); }
  return repeats / sentences.length;
}

const normName = s => String(s || '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/* Words that say nothing about WHICH authority: parties every second case
   shares ("State of Gujarat", "Union of India"), corporate suffixes,
   connectors and the reporter. Indian states and UTs are generic because
   "State of Gujarat" is a party in hundreds of cases. */
const GENERIC = new Set(('the of and v vs versus in re ex parte state union india government govt ' +
  'commissioner cit ltd limited pvt private co company corporation corp inc and others ors anr another ' +
  'municipal council board authority secretary ministry director general registrar republic ' +
  'scc air scr scale supp sc hc all bom cal del mad ker guj kar mp raj pat ori ap ' +
  'andhra pradesh arunachal assam bihar chhattisgarh goa gujarat haryana himachal jharkhand karnataka ' +
  'kerala madhya maharashtra manipur meghalaya mizoram nagaland odisha orissa punjab rajasthan sikkim ' +
  'tamil nadu telangana tripura uttar uttarakhand bengal west delhi jammu kashmir ladakh madras bombay ' +
  'calcutta mysore travancore cochin puducherry pondicherry chandigarh').split(' '));

/* The words that identify an authority: names and numbers, not the generic
   parties, not one-letter initials, not years. "Article 14" keeps its number,
   so it can never be confused with "Article 141". */
function distinctive(name) {
  return normName(name).split(' ').filter(t =>
    t && !GENERIC.has(t) && !/^(19|20)\d{2}$/.test(t) && (t.length >= 3 || /^\d+$/.test(t)));
}

/**
 * Is this citation one of the moot's own authorities? Every distinctive word
 * of the citation must appear in a single known authority, and at least one
 * of them must be a real name (four letters or more). So "Khan Chand" finds
 * "Khan Chand v. State of Punjab", but "State of Gujarat v. Ramesh Fakename"
 * does not find "State of Gujarat v. Shantilal Mangaldas", and
 * "Puttaswamy v. Fake Person" does not find Puttaswamy.
 */
function isKnownAuthority(name, known) {
  const want = distinctive(name);
  if (!want.some(t => t.length >= 4 && !/^\d+$/.test(t))) {
    // A provision ("Article 14"): its words must match a known one exactly.
    const n = normName(name);
    return !!n && (known || []).some(k => normName(k) === n);
  }
  return (known || []).some(k => {
    const have = new Set(normName(k).split(' '));
    return want.every(t => have.has(t));
  });
}

function sideOf(s) {
  const t = String(s || '').toLowerCase();
  if (/respondent|defend|opposition/.test(t)) return 'respondent';
  if (/petitioner|appellant|applicant|claimant|plaintiff/.test(t)) return 'petitioner';
  return '';
}

function gradeFor(s) {
  return s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'F';
}

/* Bring the total down to a cap by scaling every dimension in proportion,
   so each sub-score still says something (taking the excess off a fixed
   list left Structure and Persuasiveness at 0 beside Demeanor 9/10). */
function capTotal(dims, cap) {
  const total = DIMENSIONS.reduce((n, d) => n + dims[d.key].score, 0);
  if (total <= cap) return;
  // Legal Accuracy is left alone: the law is no less correct for being
  // argued badly or for the wrong side. The rest shares what remains.
  const acc = Math.min(dims.legalAccuracy.score, cap);
  dims.legalAccuracy.score = acc;
  const others = DIMENSIONS.filter(d => d.key !== 'legalAccuracy');
  const rest = others.reduce((n, d) => n + dims[d.key].score, 0);
  const f = rest ? (cap - acc) / rest : 0;
  for (const d of others) dims[d.key].score = Math.floor(dims[d.key].score * f);
}

/**
 * Turn the model's assessment into the scorecard. Pure: same input, same
 * output, which is what makes the score repeatable.
 */
function computeScore(assessment, { difficulty = 'moderate', stance = '', knownAuthorities = [], repetition = 0 } = {}) {
  const a = assessment || {};
  const mode = MODE_FACTOR[difficulty] ? difficulty : 'moderate';
  const levels = a.levels || {};
  const notes = [];

  // ── Citations, checked against the moot's own list before anything else ──
  const citations = (Array.isArray(a.citations) ? a.citations : []).filter(c => c && c.name).map(c => {
    const known = isKnownAuthority(c.name, knownAuthorities);
    return {
      name: String(c.name),
      quote: String(c.quote || ''),
      // The model cannot look a case up; the moot's authority list can.
      exists: known ? 'yes' : (['yes', 'no', 'unsure'].includes(c.exists) ? c.exists : 'unsure'),
      inMootAuthorities: known,
      holdingMisstated: !!c.holdingMisstated,
      wrongJurisdiction: !!c.wrongJurisdiction,
      note: String(c.note || ''),
    };
  });

  // ── Points from levels ──
  const dims = {};
  for (const d of DIMENSIONS) {
    const l = levels[d.key] || {};
    const level = Math.max(0, Math.min(5, Math.round(Number(l.level) || 0)));
    dims[d.key] = { level, base: Math.round(d.max * level / 5), max: d.max, feedback: String(l.feedback || ''), evidence: String(l.evidence || '') };
  }

  // ── Legal Accuracy: citation deductions, identical in every mode ──
  let deduction = 0;
  for (const c of citations) {
    if (c.exists === 'no') deduction += DEDUCT.fabricated;
    if (c.holdingMisstated) deduction += DEDUCT.misstated;
    if (c.wrongJurisdiction) deduction += DEDUCT.wrongJurisdiction;
  }
  const acc = dims.legalAccuracy;
  acc.score = Math.max(0, acc.base - deduction);
  if (deduction) notes.push(`Legal Accuracy: ${deduction} deducted for citation problems listed below.`);

  // ── Everything else: the bench mode, as a fixed factor ──
  for (const d of DIMENSIONS) {
    if (d.key === 'legalAccuracy') continue;
    dims[d.key].score = Math.min(d.max, Math.round(dims[d.key].base * MODE_FACTOR[mode]));
  }

  // ── Caps ──
  // An argument with no sound law in it cannot be well delivered or persuasive.
  if (acc.score === 0) {
    const cap = { languageClarity: 5, courtRoomDemeanor: 3, persuasiveness: 5 };
    for (const [k, m] of Object.entries(cap)) {
      if (dims[k].score > m) { dims[k].score = m; }
    }
    notes.push('Legal Accuracy is 0, so Persuasiveness, Language Clarity and Courtroom Demeanor are capped.');
  }

  // ── Defects: a "fabricated" claim about one of the moot's own cases is
  // dropped; a fabricated citation the model listed but did not flag is added.
  // Matched on the citation's distinctive words, never on a single initial.
  const mentions = (text, c) => {
    const t = new Set(normName(text).split(' '));
    const want = distinctive(c.name);
    return want.length > 0 && want.every(w => t.has(w));
  };
  let defects = (Array.isArray(a.defectsFound) ? a.defectsFound : []).filter(d => {
    if (!d || !/fabricat/i.test(String(d.type || ''))) return true;
    const text = `${d.quote || ''} ${d.issue || ''}`;
    return !citations.some(c => c.inMootAuthorities && mentions(text, c));
  });
  for (const c of citations) {
    if (c.exists !== 'no') continue;
    const flagged = defects.some(d => /fabricat/i.test(d.type || '') && mentions(`${d.quote || ''} ${d.issue || ''}`, c));
    if (!flagged) defects.push({ type: 'FabricatedCitation', quote: c.quote || c.name, issue: c.note || `${c.name} could not be identified as a real authority.`, severity: 'fatal' });
  }

  let total = DIMENSIONS.reduce((n, d) => n + dims[d.key].score, 0);

  // ── Wrong side ──
  const want = sideOf(stance);
  const argued = sideOf(a.sideArgued);
  let wrongSide = false;
  if (want && argued && want !== argued) {
    wrongSide = true;
    const cap = 40;
    capTotal(dims, cap);
    defects.unshift({
      type: 'WrongSide', severity: 'fatal',
      quote: '',
      issue: `You are arguing for the ${want === 'petitioner' ? 'Petitioner' : 'Respondent'}, but this submission argues the ${argued === 'petitioner' ? 'Petitioner' : 'Respondent'}'s case. Scored at no more than ${cap}.`,
    });
  }

  // ── Padding ──
  if (repetition >= 0.4) {
    const cap = 30;
    capTotal(dims, cap);
    defects.unshift({ type: 'Repetition', severity: 'significant', quote: '', issue: `${Math.round(repetition * 100)}% of the sentences repeat earlier ones. Repetition is not argument; scored at no more than ${cap}.` });
  }

  total = DIMENSIONS.reduce((n, d) => n + dims[d.key].score, 0);

  const dimensionScores = {};
  for (const d of DIMENSIONS) {
    dimensionScores[d.key] = { score: dims[d.key].score, max: d.max, level: dims[d.key].level, feedback: dims[d.key].feedback };
  }

  return {
    overallScore: total,
    grade: gradeFor(total),
    difficulty: mode,
    dimensionScores,
    citations,
    defectsFound: defects,
    strengths: Array.isArray(a.strengths) ? a.strengths : [],
    immediateCorrections: Array.isArray(a.immediateCorrections) ? a.immediateCorrections : [],
    judgeVerdict: String(a.judgeVerdict || ''),
    sideArgued: argued || 'unclear',
    wrongSide,
    scoringNotes: notes,
  };
}

/* ── Cache: the assessment, not the score, so all three benches share it ── */
const memory = new Map();
const MEMORY_MAX = 300;
const TTL_MS = 30 * 24 * 3600e3;

/* Bump when the prompt or the meaning of a level changes, so old readings
   are not served under the new rules. */
const ASSESSMENT_VERSION = 'oral-v1';

function cacheKey(parts) {
  return crypto.createHash('sha256').update(JSON.stringify([ASSESSMENT_VERSION].concat(parts))).digest('hex');
}

/** Every dimension present with a level 0-5. Anything less is not cached. */
function isCompleteAssessment(a) {
  if (!a || typeof a !== 'object' || !a.levels) return false;
  return DIMENSIONS.every(d => {
    const l = a.levels[d.key];
    const v = l && typeof l === 'object' ? Number(l.level) : NaN;
    return Number.isFinite(v) && v >= 0 && v <= 5;
  });
}

function cacheDoc(key) {
  if (!admin.apps.length) return null;
  return admin.firestore().collection('artifacts').doc('moot.coach').collection('oralEvalCache').doc(key);
}

async function getCached(key) {
  if (memory.has(key)) return memory.get(key);
  try {
    const ref = cacheDoc(key);
    if (!ref) return null;
    const snap = await ref.get();
    if (!snap.exists) return null;
    const d = snap.data();
    if (!d || !d.assessment || (d.at && Date.now() - d.at > TTL_MS)) return null;
    remember(key, d.assessment);
    return d.assessment;
  } catch (e) {
    return null;
  }
}

function remember(key, assessment) {
  memory.set(key, assessment);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
}

async function putCached(key, assessment) {
  remember(key, assessment);
  try {
    const ref = cacheDoc(key);
    if (ref) await ref.set({ assessment, at: Date.now() });
  } catch (e) { /* a cache miss next time is the only cost */ }
}

module.exports = { computeScore, repetitionShare, isKnownAuthority, isCompleteAssessment, cacheKey, getCached, putCached, DIMENSIONS, MODE_FACTOR, sideOf };
