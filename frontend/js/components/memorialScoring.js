/**
 * How Memorial Review turns marks into a score, in the open.
 *
 * The reviewer (the AI) marks seven criteria, each with the paragraphs that
 * justify the mark. The overall score is NOT the AI's: it is computed here
 * from a published competition's own marking scheme, and the competition's
 * own penalties are applied for what MootCoach can measure.
 *
 * Every figure below was checked against the competition's rulebook PDF
 * (rule or clause given). Each competition's scheme maps onto MootCoach's
 * seven criteria; the mapping ("from") is MootCoach's judgement and is shown
 * to the student with the result.
 */

export const CRITERIA = {
  knowledgeOfLaw: 'Knowledge of law',
  useOfFacts: 'Use of facts',
  analysis: 'Analysis',
  research: 'Research',
  structure: 'Structure',
  languageAndStyle: 'Language & style',
  compliance: 'Citation & format',
};

/* Core sections every one of these rulebooks requires. Cover, contents and
   abbreviations are not required by all, so their absence is not penalised. */
const CORE = ['authorities', 'jurisdiction', 'facts', 'issues', 'summary', 'arguments', 'prayer'];

export const SCHEMES = {
  hdmc2026: {
    name: 'Henry Dunant Memorial Moot 2026 (ISIL–ICRC)',
    source: 'Rules cl. 4.3 (marking), cl. 4.1 (page limit)',
    total: 100,
    heads: [
      { label: 'Knowledge of law and facts', max: 30, from: { knowledgeOfLaw: 0.5, useOfFacts: 0.5 } },
      { label: 'Proper and articulate analysis', max: 30, from: { analysis: 1 } },
      { label: 'Extent of research', max: 20, from: { research: 1 } },
      { label: 'Clarity and organization', max: 10, from: { structure: 1 } },
      { label: 'Style, grammar and citation', max: 10, from: { languageAndStyle: 0.5, compliance: 0.5 } },
    ],
    // Cl. 4.1: 25 typed pages, excluding contents, index and title; no
    // deduction is stated, so it is flagged, not deducted.
    pageLimit: { pages: 25, excludes: 3, perPage: 0, note: 'Over 25 pages (cl. 4.1). The rules state no deduction, but the limit is mandatory.' },
    missingSection: 0,
  },
  nalsarPil2024: {
    name: 'NALSAR Public International Law Moot 2024',
    source: 'Rule Book Sec. IV r. 5.a (marking), r. 4 (penalties)',
    total: 200,
    heads: [
      { label: 'Knowledge of Law and Facts', max: 50, from: { knowledgeOfLaw: 0.5, useOfFacts: 0.5 } },
      { label: 'Proper and Articulate Analysis', max: 50, from: { analysis: 1 } },
      { label: 'Extent and Use of Research', max: 40, from: { research: 1 } },
      { label: 'Clarity and Organization', max: 40, from: { structure: 1 } },
      { label: 'Grammar and Style', max: 20, from: { languageAndStyle: 1 } },
    ],
    pageLimit: { pages: 50, excludes: 0, perPage: 2, note: '2 points per page over 50 (r. 4).' },
    missingSection: 2,      // "2 points for every violation" (r. 4)
  },
  kkLuthra2026: {
    name: 'K.K. Luthra Memorial Moot 2026',
    source: 'Rules r. 18 (marking), r. 17(iv), (vi) (penalties)',
    total: 20,
    heads: [
      { label: 'Application of Facts', max: 5, from: { useOfFacts: 1 } },
      { label: 'Reasoning', max: 5, from: { analysis: 1 } },
      { label: 'Use of Authorities and Precedent', max: 5, from: { research: 1 } },
      { label: 'Understanding Law and Procedure', max: 3, from: { knowledgeOfLaw: 1 } },
      { label: 'Presentation', max: 2, from: { structure: 0.5, languageAndStyle: 0.5 } },
    ],
    pageLimit: { pages: 25, excludes: 1, perPage: 1, note: '1 mark per page over 25, cover excluded (r. 17(vi)).' },
    missingSection: 0.25,   // an "objective error" (r. 17(vi))
  },
  nalsarCci2025: {
    name: "Trilegal's NALSAR–CCI Antitrust Moot 2025",
    source: 'Rules r. 15.1 (marking), r. 15.2 (penalties, capped at 50)',
    total: 100,
    heads: [
      { label: 'Knowledge & Use of Facts', max: 25, from: { useOfFacts: 1 } },
      { label: 'Quality and Extent of Legal Analysis & Research', max: 25, from: { knowledgeOfLaw: 0.4, research: 0.6 } },
      { label: 'Recognition of Issues & Structure of Arguments', max: 20, from: { analysis: 0.5, structure: 0.5 } },
      { label: 'Logical Structure & Clarity of Thoughts', max: 20, from: { analysis: 0.5, structure: 0.5 } },
      { label: 'Overall Presentation', max: 10, from: { languageAndStyle: 0.5, compliance: 0.5 } },
    ],
    // r. 13.2: exceeding the memorial page limit is disqualification.
    pageLimit: { pages: 45, excludes: 0, perPage: 0, disqualify: true, note: 'Over 45 pages: disqualification (r. 13.2).' },
    missingSection: 5,      // "5 points per Violation" (r. 13.1)
    penaltyCap: 50,
  },
};
export const DEFAULT_SCHEME = 'hdmc2026';

/* A criterion marked without any paragraph to show for it cannot be in the
   upper bands: capped at the top of "weak". */
export const NO_EVIDENCE_CAP = 59;

const num = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : null);
// Two decimals: K.K. Luthra deducts 0.25 a time.
const round2 = n => Math.round(n * 100) / 100;

/** The seven criterion marks, with the evidence cap applied. */
export function criterionMarks(review) {
  const scores = (review && review.scores) || {};
  const ev = (review && review.evidence) || {};
  const out = {};
  for (const k of Object.keys(CRITERIA)) {
    const raw = num(scores[k]);
    if (raw === null) continue;
    const proof = Array.isArray(ev[k]) ? ev[k].filter(x => String(x || '').trim()) : [];
    // Evidence is required only of reviews that were asked for it.
    const capped = review && review.evidence && !proof.length && raw > NO_EVIDENCE_CAP;
    out[k] = { mark: capped ? NO_EVIDENCE_CAP : raw, raw, capped, evidence: proof };
  }
  return out;
}

/**
 * The score under one competition's scheme.
 * @param review   the reviewer's output ({ scores, evidence })
 * @param audit    { metrics, sections } from the structural audit
 * @returns { scheme, heads, subtotal, penalties, total, outOf, percent }
 */
export function scoreMemorial(review, audit, schemeKey = DEFAULT_SCHEME) {
  const scheme = SCHEMES[schemeKey] || SCHEMES[DEFAULT_SCHEME];
  const marks = criterionMarks(review);
  const heads = scheme.heads.map(h => {
    let got = 0, weight = 0;
    for (const [k, share] of Object.entries(h.from)) {
      if (marks[k]) { got += marks[k].mark * share; weight += share; }
    }
    const pct = weight ? got / weight : null;          // 0–100 for this head
    return { label: h.label, max: h.max, from: h.from, mark: pct === null ? null : round2(pct / 100 * h.max) };
  });
  if (heads.some(h => h.mark === null)) return null;   // not every criterion was marked
  const subtotal = round2(heads.reduce((t, h) => t + h.mark, 0));

  // Penalties for what can be measured from the PDF.
  const penalties = [];
  const sections = Array.isArray(audit && audit.sections) ? audit.sections : [];
  const missing = sections.filter(s => CORE.includes(s.key) && s.present === false);
  if (missing.length) {
    const each = scheme.missingSection || 0;
    penalties.push({
      what: `Missing section${missing.length > 1 ? 's' : ''}: ${missing.map(s => s.label).join(', ')}`,
      points: round2(each * missing.length),
      note: each ? `${each} per missing section under these rules.` : 'These rules state no deduction, but the section is expected.',
    });
  }
  const pages = audit && audit.metrics && Number(audit.metrics.pages);
  const pl = scheme.pageLimit;
  if (pl && Number.isFinite(pages) && pages > 0) {
    const counted = Math.max(0, pages - (pl.excludes || 0));
    const over = counted - pl.pages;
    if (over > 0) {
      penalties.push({
        what: `About ${over} page${over > 1 ? 's' : ''} over the ${pl.pages}-page limit`,
        points: round2((pl.perPage || 0) * over),
        disqualify: !!pl.disqualify,
        note: `${pl.note} Counted from the PDF's ${pages} pages${pl.excludes ? `, less ${pl.excludes} excluded` : ''}; check against the rules.`,
      });
    }
  }
  let deducted = round2(penalties.reduce((t, p) => t + p.points, 0));
  if (scheme.penaltyCap) deducted = Math.min(deducted, scheme.penaltyCap);
  const total = round2(Math.max(0, subtotal - deducted));
  return {
    schemeKey: SCHEMES[schemeKey] ? schemeKey : DEFAULT_SCHEME,
    scheme: { name: scheme.name, source: scheme.source, total: scheme.total },
    heads, subtotal, penalties, deducted, total, outOf: scheme.total,
    // Through two decimals first: 11.3/20 is 56.4999… in floating point, and is 57%.
    percent: Math.round(round2(total / scheme.total * 100)),
    capped: Object.entries(marks).filter(([, v]) => v.capped).map(([k]) => CRITERIA[k]),
  };
}
