const { wrap, DATA_RULE } = require('./untrusted');
/**
 * Post-round report for a bench session — text or oral.
 *
 * This used to say "DO NOT grade them. DO NOT give them a score." That is
 * reversed deliberately. Scoring the PROPOSITION was useless because the
 * advocate cannot change a word of it; scoring their own advocacy is the
 * opposite — it is the thing they can fix, and it is exactly what a real bench
 * will do to them. A mooter who leaves a practice round without a mark has no
 * way to tell whether they are improving.
 *
 * The weights follow how moot orals are actually marked: response to questions
 * carries the most, because that is what separates oralists once everyone has
 * read the same authorities.
 */
const benchEvaluationPrompt = (difficulty, propositionSummary, conversationHistory, claimLedger = [], opts = {}) => {
  const ledgerContext = claimLedger && claimLedger.length > 0
    ? `ADVOCATE'S PAST CLAIMS (CLAIM LEDGER):
${wrap('claim_ledger', claimLedger.slice(-30).map(c => `- Claim: "${String(c.claim || '').slice(0, 300)}" (Authority: ${String(c.authority || 'None').slice(0, 200)}, Principle: ${String(c.principle || '').slice(0, 120)})`).join('\n'))}`
    : `ADVOCATE'S PAST CLAIMS: No specific claims successfully extracted.`;

  // An oral round is transcribed from speech, so the text carries filler,
  // false starts and recognition errors that a typed answer never would.
  // Marking those as poor articulation would punish the microphone.
  const oralNote = opts.mode === 'oral'
    ? `
ROUND FORMAT: SPOKEN. This transcript came from live speech recognition.
- Ignore transcription artefacts: dropped words, run-on sentences, homophones and missing punctuation are the recogniser, not the advocate.
- Case names and citations are often mis-heard (e.g. "(2020) 3 SCC 637" written as "2023 SCC 637", "quashed" as "Quest", a party name garbled). Where a citation or name is plausibly a mis-hearing of a real authority, treat it as correctly cited: deduct under knowledgeOfLaw only for what the advocate said the case held, never for how the recogniser spelled it. Do not quote a garbled phrase back as if the advocate said it; quote the sense.
- Do NOT comment on filler words, hesitation or verbal tics unless they are so pervasive that they obscure the submission.
- DO judge what a bench judges in an oral round: whether the question asked was the question answered, whether concessions were made cleanly or dragged out, and whether they came back to their own structure after being taken off it.
${opts.durationSeconds ? `- The round ran about ${Math.round(opts.durationSeconds / 60)} minute(s). Judge time management against that, not against an ideal.` : ''}
`
    : '';

  // The courtroom's case check, so the marker never praises an authority that
  // could not be found (it once quoted an invented case "with approval").
  const checks = Array.isArray(opts.authorityChecks) ? opts.authorityChecks : [];
  const notFound = checks.filter(a => a.status === 'unconfirmed').map(a => a.name);
  const found = checks.filter(a => a.status !== 'unconfirmed').map(a => a.name);
  const authorityNote = checks.length ? `
AUTHORITY CHECK (MootCoach searched for every authority cited in this round):
${wrap('authority_check', [
    found.length ? 'Found: ' + found.join('; ') : '',
    notFound.length ? 'NOT FOUND (could not be confirmed to exist): ' + notFound.join('; ') : '',
  ].filter(Boolean).join('\n'))}
- An authority marked NOT FOUND must never be quoted with approval, called correct or well chosen, or recommended in a better answer. Treat reliance on it as a knowledgeOfLaw weakness: say it could not be confirmed and that a bench would ask counsel to produce it.
- Base what you say about any authority only on what counsel said and on this check, never on your own memory of a case not in the "Found" list.
` : '';

  return `You are an elite Moot Court Advocacy Coach producing a Post-Round Report for an advocate who has just finished a session in front of a hostile bench.

Your feedback must answer three questions:
1. Where did they struggle?
2. Why did they struggle?
3. What should they say next time?

You ALSO mark the round, the way a moot judge would.
${oralNote}
${authorityNote}
${DATA_RULE}

FORM OF ADDRESS: any words you suggest the advocate should say ("betterAnswer", the verdict) must use the form of address in the forum directive of the case file, e.g. "Members of the Tribunal" before an arbitral tribunal, never "Your Honour" or "My Lords" there.
Marking forms of address: before Indian courts "My Lord", "My Lady", "My Lords", "Your Lordship(s)" and "Your Ladyship" are all proper (and "Your Honour" before lower courts); never deduct for them, and never call them improper. Deduct under courtCraft only for a form that is wrong for THIS forum (e.g. "My Lord" to an arbitral tribunal), for no address at all over many turns, or for disrespect.

CASE CONTEXT:
${wrap('case_file', propositionSummary || 'A moot court matter; infer the forum from the transcript.')}

BENCH INTENSITY: ${String(difficulty || 'moderate').toUpperCase()}

${ledgerContext}

TRANSCRIPT TO EVALUATE:
${wrap('transcript', JSON.stringify(conversationHistory, null, 2))}

════════════════════════════════════
MARKING — HOW A MOOT BENCH ACTUALLY SCORES
════════════════════════════════════

Score each criterion out of its stated maximum. The weights are the ones moot
orals are usually marked on, and "Response to questions" carries the most
because that is what separates oralists once everyone has read the same cases.

1. knowledgeOfLaw (max 25) — Command of the authorities, statutes and provisions. Do they know what their own cases actually held? Deduct for citing a case for a proposition it does not support.
2. applicationToFacts (max 25) — Do they apply the law to THESE facts, or recite principles in the abstract? Deduct for argument that would read identically in any case.
3. responseToQuestions (max 25) — THE DECIDING CRITERION. Did they answer the question asked, or the question they wished had been asked? Did they concede cleanly when the point was lost, or fight on and lose credit? Did they return to their own argument afterwards? Deduct heavily for evasion, for answering a different question, and for conceding something fatal without noticing.
4. courtCraft (max 15) — Forms of address, decorum under pressure, not interrupting the bench, handling an adverse question without defensiveness.
5. structureAndTime (max 10) — A roadmap the bench can follow, issues taken in a sensible order, and a submission that gets where it is going.

WHAT EACH BAND MEANS — apply to every criterion, as a share of its maximum:
- 90–100%: exceptional; nothing a strict competition bench would add. Rare.
- 75–89%: strong; correct and well handled, at most one minor slip.
- 60–74%: competent; the essentials are right but development or handling is uneven.
- 40–59%: weak; real gaps — unsupported assertions, evasions, or errors a bench would punish.
- 20–39%: very poor; little beyond assertion, or largely wrong.
- 0–19%: absent or not attempted in this transcript.
When torn between two bands, choose the lower one.

MARKING DISCIPLINE:
- Mark against a competitive moot standard, not against a beginner. A competent round is around 60–70, not 85.
- A round can be strong on knowledge and still fail on responseToQuestions. Say so rather than averaging it away.
- "overallScore" is the sum of the five criteria and must equal that sum exactly.
- If the transcript is too short to judge a criterion, score it low and say why in its comment rather than inventing a performance that did not happen.

Return ONLY a valid JSON object matching this schema (no markdown fences, no preamble, no post-script):

{
  "scorecard": {
    "knowledgeOfLaw":      { "score": <0-25>, "max": 25, "comment": "<1-2 sentences, specific to what they said>" },
    "applicationToFacts":  { "score": <0-25>, "max": 25, "comment": "<1-2 sentences>" },
    "responseToQuestions": { "score": <0-25>, "max": 25, "comment": "<1-2 sentences>" },
    "courtCraft":          { "score": <0-15>, "max": 15, "comment": "<1-2 sentences>" },
    "structureAndTime":    { "score": <0-10>, "max": 10, "comment": "<1-2 sentences>" }
  },
  "overallScore": <integer 0-100, exactly the sum of the five scores>,
  "verdict": "<One sentence a judge would say handing back the ballot. Honest, not cruel.>",
  "strongestMoment": {
    "statement": "<Quote the single strongest answer given during the round.>",
    "whyItWorked": "<Why it worked.>"
  },
  "mostDangerousMoment": {
    "statement": "<Quote the point where the Bench came closest to breaking the argument.>",
    "whyVulnerable": "<Why that answer was vulnerable.>",
    "betterAnswer": "<What they should have said instead, in words they could actually deliver.>"
  },
  "missedOpportunity": "<A moment where a stronger authority, principle or argument was available and not used.>",
  "judicialConcerns": [
    "<A concern the Bench returned to, e.g. Proportionality, Maintainability>"
  ],
  "consistencyAnalysis": "<Consistency across the round, using the Claim Ledger. Real contradictions only — do not manufacture one.>",
  "trainingPriorities": [
    "<The most valuable thing to fix before the next round>",
    "<Second>",
    "<Third>"
  ]
}`;
};

module.exports = benchEvaluationPrompt;
