/**
 * A competition's rules profile, as read from its rulebook by the model
 * (prompts/rulebookPrompt.js), made safe and checkable.
 *
 * The model's reading is untrusted twice over: it is model output, and the
 * rulebook was uploaded by a student. So every field is bounded, every number
 * checked for range, unknown keys dropped, and arithmetic the model claims is
 * checked here (marking heads must add up to the total). Problems become
 * warnings the student sees on the confirmation screen; the student confirms
 * every figure before MootCoach uses it.
 */
const CRITERIA = ['knowledgeOfLaw', 'useOfFacts', 'analysis', 'research', 'structure', 'languageAndStyle', 'compliance'];
const KINDS = ['lateSubmission', 'pageLimitMemorial', 'pageLimitArguments', 'pageLimitFacts', 'pageLimitSummary',
  'wordLimit', 'missingSection', 'sectionOrder', 'anonymity', 'citation', 'formatting', 'coverPage', 'index', 'other'];
const BASES = ['perPage', 'perViolation', 'perHour', 'perDay', 'oneTime', 'disqualification', 'unstated'];

const str = (v, n = 200) => (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '')).replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, n);
const numIn = (v, lo, hi) => {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null;
};
const ref = o => ({ rule: str(o && o.rule, 60), quote: str(o && o.quote, 240) });

/** A head's share of MootCoach's criteria, cleaned and made to add up to 1. */
function cleanFrom(from) {
  const out = {};
  if (from && typeof from === 'object') {
    for (const k of CRITERIA) {
      const v = numIn(from[k], 0, 100);
      if (v) out[k] = v;
    }
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (!sum) return null;
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] / sum * 1000) / 1000;
  return out;
}

function limit(o, extra = {}) {
  if (!o || typeof o !== 'object') return null;
  const value = numIn(o.value, 1, 500);
  if (value === null) return null;
  const out = { value, ...ref(o) };
  for (const [k, n] of Object.entries(extra)) out[k] = str(o[k], n) || null;
  return out;
}

/**
 * @param raw  the model's JSON
 * @returns { ok, profile } or { ok:false, reason }
 */
function sanitizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'The rulebook could not be read.' };
  if (raw.isRulebook === false) {
    return { ok: false, reason: `This does not look like a moot rulebook${raw.reason ? ` (${str(raw.reason, 160)})` : ''}.` };
  }
  const warnings = (Array.isArray(raw.warnings) ? raw.warnings : []).slice(0, 8).map(w => str(w, 300)).filter(Boolean);

  const c = raw.competition || {};
  const competition = { name: str(c.name, 160) || 'Your competition', edition: str(c.edition, 40) || null, organiser: str(c.organiser, 160) || null };

  // Marking.
  const m = raw.marking || {};
  const total = numIn(m.total, 1, 1000);
  const heads = (Array.isArray(m.heads) ? m.heads : []).slice(0, 12).map(h => ({
    label: str(h && h.label, 120),
    max: numIn(h && h.max, 0.1, 1000),
    from: cleanFrom(h && h.from),
  })).filter(h => h.label && h.max !== null);
  let marking = null;
  if (total !== null && heads.length) {
    const sum = Math.round(heads.reduce((t, h) => t + h.max, 0) * 100) / 100;
    if (Math.abs(sum - total) > 0.01) warnings.unshift(`The marking heads add up to ${sum}, not the stated total of ${total}. Check the marks against the rulebook.`);
    const unmapped = heads.filter(h => !h.from).map(h => h.label);
    if (unmapped.length) warnings.push(`MootCoach could not tell which of its criteria these heads cover: ${unmapped.join(', ')}.`);
    marking = { total, heads, ...ref(m), addsUp: Math.abs(sum - total) <= 0.01, mapped: !unmapped.length };
  } else {
    warnings.unshift('The memorial marking scheme could not be found in this rulebook.');
  }

  // Penalties.
  const penalties = (Array.isArray(raw.penalties) ? raw.penalties : []).slice(0, 30).map(p => ({
    violation: str(p && p.violation, 160),
    kind: KINDS.includes(p && p.kind) ? p.kind : 'other',
    basis: BASES.includes(p && p.basis) ? p.basis : 'unstated',
    points: numIn(p && p.points, 0, 1000),
    ...ref(p),
  })).filter(p => p.violation);
  const cap = raw.penaltyCap && numIn(raw.penaltyCap.points, 0.1, 1000);
  const penaltyCap = cap ? { points: cap, ...ref(raw.penaltyCap) } : null;

  // Limits and format.
  const l = raw.limits || {};
  const limits = {
    memorialPages: limit(l.memorialPages, { excludes: 160 }),
    argumentsPages: limit(l.argumentsPages),
    factsPages: limit(l.factsPages),
    summaryPages: limit(l.summaryPages),
    words: (() => { const w = l.words && numIn(l.words.value, 50, 100000); return w ? { value: w, applies: str(l.words.applies, 120) || null, ...ref(l.words) } : null; })(),
  };
  const f = raw.format || {};
  const format = {
    font: str(f.font, 60) || null, fontSize: numIn(f.fontSize, 6, 24), lineSpacing: str(f.lineSpacing, 40) || null,
    margins: str(f.margins, 80) || null, footnotes: str(f.footnotes, 120) || null, pageSize: str(f.pageSize, 40) || null,
    citationStyle: str(f.citationStyle, 80) || null, coverColours: str(f.coverColours, 160) || null, rule: str(f.rule, 60),
  };
  const s = raw.sections || {};
  const sections = {
    required: (Array.isArray(s.required) ? s.required : []).slice(0, 20).map(x => str(x, 80)).filter(Boolean),
    orderRequired: typeof s.orderRequired === 'boolean' ? s.orderRequired : null,
    rule: str(s.rule, 60),
  };
  const anonymity = raw.anonymity && typeof raw.anonymity === 'object'
    ? { rule: str(raw.anonymity.rule, 60), consequence: str(raw.anonymity.consequence, 200) || null } : null;
  const notStated = (Array.isArray(raw.notStated) ? raw.notStated : []).slice(0, 10).map(x => str(x, 200)).filter(Boolean);

  return {
    ok: true,
    profile: { version: 1, competition, marking, penalties, penaltyCap, limits, format, sections, anonymity, notStated, warnings },
  };
}

module.exports = { sanitizeProfile, CRITERIA, KINDS, BASES };
