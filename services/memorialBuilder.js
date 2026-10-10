const { getChatCompletion } = require("./geminiService");
const { buildMemorialSkeletonPrompt, buildIssueArgumentPrompt } = require("../prompts/memorialPrompt");

/**
 * Builds a memorial in passes and assembles the result.
 *
 * One generation will not produce a competition-length memorial. Measured on the
 * NUALS proposition, a single call gave 13-23 numbered paragraphs and 12-14
 * authorities against the 65 paragraphs and ~60 authorities of a memorial
 * actually filed in that moot — and giving the memorial a larger share of the
 * budget made its paragraphs longer rather than more numerous.
 *
 * So: one pass fixes the structure, one pass per issue argues it out, and this
 * module stitches them together — allocating paragraph numbers so they run
 * continuously, and folding every issue's authorities into one Index.
 */

/** Pulls the first JSON object out of a model response. */
function parseJson(text, what) {
  const s = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error(`${what}: no JSON object in the response`);
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch (e) {
    throw new Error(`${what}: ${e.message}`);
  }
}

const AUTHORITY_GROUPS = [
  'cases', 'internationalCases', 'statutes', 'constitutionalProvisions',
  'treatiesAndConventions', 'rulesAndRegulations', 'booksAndCommentaries',
  'articlesAndReports', 'mootProposition',
];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Case names come back from different passes in different forms, and merging on
 * the raw name leaves duplicates in the Index. Observed in one build:
 *
 *   "Vodafone International Holdings v. Union of India"      (the advocate's)
 *   "Vodafone International Holdings B.V. v. Union of India" (a pass's)
 *   "Union of India v. Azadi Bachao Andolan"                 (the advocate's)
 *   "Union of India v. Azadi Bachao Anodolan"                (a pass's typo)
 *
 * — four entries for two cases, and the advocate's own citations sitting beside
 * near-identical "suggested" ones. Keying on the first party stripped of
 * corporate noise, plus the year, collapses the first pair; the similarity check
 * on the second party catches the typo without merging two genuinely different
 * cases that happen to share a first party.
 */
const CORPORATE_NOISE = /\b(b\s?v|bv|ltd|limited|pvt|private|co|inc|plc|pte|llp|corp|corporation|holdings?|international|company)\b/g;

function splitParties(name) {
  const parts = String(name || '').split(/\s+v\.?s?\.?\s+/i);
  return { first: parts[0] || '', second: parts.slice(1).join(' ') || '' };
}

function partyCore(s) {
  return norm(s).replace(CORPORATE_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

/** Crude character-bigram overlap; enough to tell a typo from a different case. */
function similar(a, b) {
  const A = norm(a), B = norm(b);
  if (!A || !B) return 0;
  if (A === B || A.includes(B) || B.includes(A)) return 1;
  const grams = s => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const ga = grams(A), gb = grams(B);
  let hit = 0; for (const g of ga) if (gb.has(g)) hit++;
  return hit / Math.max(1, Math.min(ga.size, gb.size));
}

function sameCase(a, b) {
  const pa = splitParties(a.name), pb = splitParties(b.name);
  const ca = partyCore(pa.first), cb = partyCore(pb.first);
  if (!ca || !cb) return norm(a.name) === norm(b.name);
  const firstMatch = ca === cb || ca.includes(cb) || cb.includes(ca);
  if (!firstMatch) return false;
  const ya = (String(a.citation || '').match(/\b(19|20)\d{2}\b/) || [])[0];
  const yb = (String(b.citation || '').match(/\b(19|20)\d{2}\b/) || [])[0];
  if (ya && yb && ya !== yb) return false;          // same claimant, different year = different case
  if (!pa.second || !pb.second) return true;
  return similar(pa.second, pb.second) >= 0.6;      // tolerates "Andolan" / "Anodolan"
}

/**
 * Folds the per-issue authority lists into one Index.
 *
 * Each pass only knows its own issue, so the same case comes back from several
 * of them. Merging on a normalised name keeps one entry and accumulates the
 * propositions it was cited for, which is what the Index is supposed to show.
 */
function mergeAuthorities(target, incoming) {
  for (const group of AUTHORITY_GROUPS) {
    const list = Array.isArray(incoming && incoming[group]) ? incoming[group] : [];
    if (!target[group]) target[group] = [];
    for (const entry of list) {
      if (!entry || !entry.name || !String(entry.name).trim()) continue;
      const isCase = group === 'cases' || group === 'internationalCases';
      const existing = isCase
        ? target[group].find(e => sameCase(e, entry))
        : target[group].find(e => norm(e.name) === norm(entry.name));
      if (!existing) { target[group].push(Object.assign({}, entry)); continue; }
      // Prefer the fuller, better-punctuated name — "Vodafone International
      // Holdings B.V." over "Vodafone International Holdings" — unless the
      // advocate supplied theirs, in which case theirs is authoritative.
      if (existing.source !== 'advocate' && entry.source !== 'advocate' &&
          String(entry.name || '').length > String(existing.name || '').length) {
        existing.name = entry.name;
      }
      // Keep the fuller citation and accumulate what it is cited for.
      if (!existing.citation && entry.citation) existing.citation = entry.citation;
      if (entry.source === 'advocate') existing.source = 'advocate';
      if (entry.proposition && existing.proposition &&
          norm(entry.proposition) !== norm(existing.proposition) &&
          !norm(existing.proposition).includes(norm(entry.proposition))) {
        existing.proposition += '; ' + entry.proposition;
      } else if (entry.proposition && !existing.proposition) {
        existing.proposition = entry.proposition;
      }
      if (entry.citationNote && !existing.citationNote) existing.citationNote = entry.citationNote;
    }
  }
  return target;
}

/**
 * Anything cited in a footnote must appear in the Index — that is the rule the
 * prompt states, and the passes still break it. Measured on one build: the body
 * cited 13 distinct sources while the Index listed 5, because each pass reports
 * only what it remembers to put in "authoritiesUsed".
 *
 * Rather than ask the model again, harvest the footnotes and fold anything
 * missing into the Index. Classification is by shape, which is reliable enough:
 * "X v. Y" is a case, something with a section or an Act is a statute, a
 * paragraph reference is the record.
 *
 * "Advocate's Notes" and similar are dropped outright — a memorial cannot cite
 * its own author, and one pass did exactly that.
 */
const NOT_AN_AUTHORITY = /^(advocate'?s?\s+notes?|notes?|supra|ibid|id\.?|above|see\s+above)\b/i;

function harvestFootnotes(argumentsAdvanced, index) {
  let added = 0;
  const seen = [];
  for (const issue of argumentsAdvanced) {
    const paras = []
      .concat(...(issue.subArguments || []).map(sa => sa.paragraphs || []))
      .concat(issue.paragraphs || []);
    for (const p of paras) {
      for (const f of (p.footnotes || [])) {
        const raw = String(f && f.citation || '').trim().replace(/\.$/, '');
        if (!raw || NOT_AN_AUTHORITY.test(raw)) continue;
        if (/^(supra|ibid)/i.test(raw)) continue;              // back-references, not new sources
        if (seen.some(s => similar(s, raw) >= 0.9)) continue;
        seen.push(raw);

        let group, entry;
        if (/moot proposition|¶\s*\d|\bpara(graph)?\s*\d/i.test(raw) && !/\sv\.?\s/i.test(raw)) {
          group = 'mootProposition';
          entry = { name: raw, proposition: '', verify: false };
        } else if (/\sv\.?s?\.?\s/i.test(raw)) {
          // Split the trailing reporter reference off the name.
          const m = raw.match(/^(.*?),\s*((?:\[|\()?(?:19|20)\d{2}.*)$/);
          group = /ICSID|PCA|UNCITRAL|All E\.?R|UKHL|HL\)|US\b|SEC\b/i.test(raw) ? 'internationalCases' : 'cases';
          entry = { name: (m ? m[1] : raw).trim(), citation: m ? m[2].trim() : '', proposition: '', source: 'suggested', verify: true, citationNote: '' };
        } else if (/\bact\b|\bsection\b|\bs\.\s*\d|§/i.test(raw)) {
          group = 'statutes';
          entry = { name: raw, provisions: '', proposition: '', verify: true };
        } else if (/\bconstitution\b|\bart(icle)?\.?\s*\d/i.test(raw)) {
          group = 'constitutionalProvisions';
          entry = { name: raw, proposition: '', verify: true };
        } else if (/treaty|convention|DTAA|agreement/i.test(raw)) {
          group = 'treatiesAndConventions';
          entry = { name: raw, proposition: '', verify: true };
        } else {
          group = 'articlesAndReports';
          entry = { name: raw, proposition: '', verify: true };
        }

        if (!index[group]) index[group] = [];
        const isCase = group === 'cases' || group === 'internationalCases';
        const dup = isCase
          ? index[group].find(e => sameCase(e, entry))
          : index[group].find(e => similar(e.name, entry.name) >= 0.85);
        if (dup) {
          if (!dup.citation && entry.citation) dup.citation = entry.citation;
          continue;
        }
        index[group].push(entry);
        added++;
      }
    }
  }
  if (added) console.log(`[MEMORIAL] Harvested ${added} authorities cited in footnotes but missing from the Index.`);
  return added;
}

/** Cases sort by first party name, everything else alphabetically. */
function sortIndex(ioa) {
  for (const group of AUTHORITY_GROUPS) {
    if (Array.isArray(ioa[group])) {
      ioa[group].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }
  }
  return ioa;
}

/**
 * Renumbers every paragraph so the count runs straight through the memorial,
 * whatever each pass decided for itself. The passes are told where to start, but
 * they drift, and a memorial whose numbering restarts or skips cannot be cited
 * from in an oral round.
 */
function renumber(argumentsAdvanced) {
  let n = 1;
  for (const issue of argumentsAdvanced) {
    for (const sub of (issue.subArguments || [])) {
      for (const p of (sub.paragraphs || [])) p.number = n++;
    }
    for (const p of (issue.paragraphs || [])) p.number = n++;
  }
  return n - 1;
}

/**
 * @param {object} opts
 * @param {string} opts.stance        Petitioner / Respondent / ...
 * @param {string} opts.propositionContext  The record.
 * @param {string} opts.notes         The advocate's raw notes.
 * @param {string} opts.instructions  The advocate's binding directives.
 * @param {Array}  opts.authorities   Their Authority Armory picks.
 * @param {string} opts.forumLine     Forum directive, already formatted.
 * @param {string} opts.indianDirective  Indian-law grounding, already formatted.
 * @param {number} opts.maxIssues     Cap on argued issues (each costs a call).
 * @param {function} opts.onProgress  Called with ({stage, issue, of}) as it goes.
 */
async function buildMemorial(opts) {
  const {
    stance, propositionContext, notes = '', instructions = '', authorities = [],
    forumLine = '', indianDirective = '', maxIssues = 4, depth = 'standard', onProgress = () => {},
  } = opts;

  const instructionBlock = String(instructions).trim()
    ? `\nADVOCATE'S DRAFTING INSTRUCTIONS (BINDING — directives, not material to summarise.\n`
      + `Follow them. Keep the fixed section order; everything else bends to what is asked.\n`
      + `Anything you cannot carry out goes in instructionsNotFollowed):\n${String(instructions).trim().slice(0, 4000)}\n`
    : '';

  const authorityBlock = (Array.isArray(authorities) && authorities.length)
    ? `\nAUTHORITIES SELECTED BY THE ADVOCATE (must be used, marked source:"advocate"):\n`
      + authorities.slice(0, 40).map(a =>
          `- ${a.name || a.case || 'Unnamed'}${a.citation ? ', ' + a.citation : ''}`
          + `${a.ratio ? ' — ' + String(a.ratio).slice(0, 300) : ''}`).join('\n') + '\n'
    : '';

  const context = `PROPOSITION FACTS / RECORD:\n${String(propositionContext).trim()}\n`
    + `${forumLine}${indianDirective}${instructionBlock}${authorityBlock}\n`
    + `STANCE / SIDE: ${stance}\n`
    + `ADVOCATE'S NOTES: ${String(notes).trim().slice(0, 4000)}\n`;

  // ── PASS A: structure ──
  onProgress({ stage: 'skeleton' });
  const skeletonCall = await getChatCompletion({
    messages: [
      { role: 'system', content: buildMemorialSkeletonPrompt() },
      { role: 'user', content: context + '\nProduce the structure and front matter now.' },
    ],
    temperature: 0.3,
    max_tokens: 8000,
    geminiMaxOutputTokens: 16000,
    primaryProvider: 'gemini',
    geminiTimeoutMs: 110000,
    geminiMaxAttempts: 1,
    requestLabel: 'Memorial Pass A (structure)',
  });
  const skeleton = parseJson(skeletonCall.text, 'Memorial structure pass');

  const plan = Array.isArray(skeleton.argumentPlan) ? skeleton.argumentPlan.slice(0, maxIssues) : [];
  if (!plan.length) throw new Error('Memorial structure pass returned no issues to argue');

  // ── PASS B: one call per issue, sequential ──
  // Sequential on purpose. These are large Gemini calls on a free tier that
  // returns 503 under load; firing them together makes every one of them
  // likelier to fail, and a half-built memorial is worth nothing.
  const argumentsAdvanced = [];
  const index = {};
  let next = 1;

  for (let i = 0; i < plan.length; i++) {
    const issue = plan[i];
    onProgress({ stage: 'issue', issue: i + 1, of: plan.length });

    const brief = `ISSUE TO ARGUE:\n`
      + `Numeral: ${issue.numeral || String(i + 1)}\n`
      + `Heading: ${issue.heading || ''}\n`
      + `Roadmap: ${issue.roadmap || ''}\n`
      + `Sub-grounds you must develop, in this order:\n`
      + (issue.subGrounds || []).map(sg =>
          `  ${sg.label || ''}. ${sg.heading || ''} — ${sg.thrust || ''}`).join('\n')
      + `\n\nIssues already argued (do not repeat them, but you may cross-refer):\n`
      + (plan.slice(0, i).map(p => `  ${p.numeral}. ${p.heading}`).join('\n') || '  none');

    let parsed;
    try {
      if (depth === 'full' && (issue.subGrounds || []).length > 1) {
        /**
         * One call per sub-ground.
         *
         * Each Gemini response caps around 15-16k characters however large
         * max_tokens is — measured at ~15,800 against a 12,000-token ceiling,
         * so the ceiling was never the binding constraint. More depth therefore
         * means more calls, not bigger ones. Splitting by sub-ground gives each
         * limb its own response budget.
         */
        const subs = issue.subGrounds;
        const built = [];
        let n = next;
        for (let k = 0; k < subs.length; k++) {
          const sg = subs[k];
          onProgress({ stage: 'subground', issue: i + 1, of: plan.length, sub: k + 1, subOf: subs.length });
          try {
          const sgBrief = brief
            + `\n\nWRITE ONLY THIS SUB-GROUND:\n  ${sg.label || ''}. ${sg.heading || ''}\n  Thrust: ${sg.thrust || ''}`
            + `\n\nThe other sub-grounds of this issue are being written separately. Do not write them.`;
          const call = await getChatCompletion({
            messages: [
              { role: 'system', content: buildIssueArgumentPrompt(n, 'subground') },
              { role: 'user', content: context + '\n' + sgBrief + '\n\nArgue this sub-ground in full now.' },
            ],
            temperature: 0.3,
            max_tokens: 12000,
            geminiMaxOutputTokens: 24000,
            primaryProvider: 'gemini',
            geminiTimeoutMs: 110000,
            geminiMaxAttempts: 1,
            requestLabel: `Memorial Pass B (issue ${i + 1}, sub-ground ${k + 1}/${subs.length})`,
          });
          const got = parseJson(call.text, `Memorial issue ${i + 1} sub-ground ${k + 1}`);
          const sa = (got.subArguments || [])[0] || { heading: `${sg.label || ''}. ${sg.heading || ''}`.trim(), paragraphs: [] };
          if (!sa.heading) sa.heading = `${sg.label || ''}. ${sg.heading || ''}`.trim();
          built.push(sa);
          mergeAuthorities(index, got.authoritiesUsed);
          n += Math.max((sa.paragraphs || []).length, 1);
          if (k === subs.length - 1 && got.conclusion) issue._conclusion = got.conclusion;
          } catch (sgErr) {
            /**
             * A failed sub-ground must not discard the ones already written.
             * Observed: one sub-ground hit a RECITATION block and the issue-level
             * catch threw away two limbs that had generated perfectly well.
             * Mark the gap so it is visible in the draft and carry on.
             */
            console.error(`[MEMORIAL] Issue ${i + 1} sub-ground ${k + 1} failed: ${sgErr.message}`);
            built.push({
              heading: `${sg.label || ''}. ${sg.heading || ''}`.trim(),
              paragraphs: [{ number: n++, text: `[NOT DRAFTED — this limb could not be generated: ${sgErr.message}. The plan for it was: ${sg.thrust || ''}]`, footnotes: [] }],
              failed: true,
            });
          }
        }
        parsed = { numeral: issue.numeral, heading: issue.heading, roadmap: issue.roadmap,
                   subArguments: built, conclusion: issue._conclusion || '' };
      } else {
        const call = await getChatCompletion({
          messages: [
            { role: 'system', content: buildIssueArgumentPrompt(next, 'issue') },
            { role: 'user', content: context + '\n' + brief + '\n\nArgue this issue in full now.' },
          ],
          temperature: 0.3,
          max_tokens: 12000,
          geminiMaxOutputTokens: 24000,
          primaryProvider: 'gemini',
          geminiTimeoutMs: 110000,
          geminiMaxAttempts: 1,
          requestLabel: `Memorial Pass B (issue ${i + 1}/${plan.length})`,
        });
        parsed = parseJson(call.text, `Memorial issue ${i + 1}`);
        mergeAuthorities(index, parsed.authoritiesUsed);
      }
    } catch (err) {
      // One failed issue must not lose the whole memorial. Keep the heading and
      // roadmap so the gap is visible in the draft rather than silent.
      console.error(`[MEMORIAL] Issue ${i + 1} failed: ${err.message}`);
      argumentsAdvanced.push({
        numeral: issue.numeral, heading: issue.heading, roadmap: issue.roadmap,
        subArguments: (issue.subGrounds || []).map(sg => ({
          heading: `${sg.label || ''}. ${sg.heading || ''}`.trim(),
          paragraphs: [{ number: next++, text: `[NOT DRAFTED — this limb could not be generated: ${err.message}. The plan for it was: ${sg.thrust || ''}]`, footnotes: [] }],
        })),
        conclusion: '',
        failed: true,
      });
      continue;
    }

    argumentsAdvanced.push({
      numeral: parsed.numeral || issue.numeral,
      heading: parsed.heading || issue.heading,
      roadmap: parsed.roadmap || issue.roadmap,
      subArguments: Array.isArray(parsed.subArguments) ? parsed.subArguments : [],
      conclusion: parsed.conclusion || '',
    });

    const used = (parsed.subArguments || [])
      .reduce((t, sa) => t + ((sa.paragraphs || []).length), 0);
    next += Math.max(used, 1);
  }

  // Enforce the Index/body rule in code: anything footnoted must be listed.
  harvestFootnotes(argumentsAdvanced, index);

  const paragraphCount = renumber(argumentsAdvanced);

  const memorial = {
    coverPage: skeleton.coverPage || {},
    listOfAbbreviations: skeleton.listOfAbbreviations || [],
    indexOfAuthorities: sortIndex(index),
    statementOfJurisdiction: skeleton.statementOfJurisdiction || '',
    statementOfFacts: skeleton.statementOfFacts || [],
    statementOfIssues: skeleton.statementOfIssues || [],
    summaryOfArguments: skeleton.summaryOfArguments || [],
    argumentsAdvanced,
    prayer: skeleton.prayer || {},
    instructionsNotFollowed: skeleton.instructionsNotFollowed || [],
  };

  const authorityCount = AUTHORITY_GROUPS
    .reduce((t, g) => t + ((index[g] || []).length), 0);

  return {
    memorial,
    stats: {
      issues: argumentsAdvanced.length,
      issuesFailed: argumentsAdvanced.filter(a => a.failed).length,
      paragraphs: paragraphCount,
      authorities: authorityCount,
      passes: 1 + plan.length,
      depth,
    },
  };
}

module.exports = { buildMemorial, mergeAuthorities, renumber, sortIndex, parseJson, harvestFootnotes, sameCase, similar };
