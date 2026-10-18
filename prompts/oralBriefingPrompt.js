/**
 * The Chambers Briefing: what an advocate reads in the ten minutes before
 * standing up.
 *
 * It used to come as a by-product of the Stage 3 draft. The "Generate
 * Structured Draft" button asks for the memorial alone and tells the model to
 * cut these blocks to a single entry each, so every module opened onto one
 * question, one case, one trap — and the modules that came back empty fell
 * back to generic sentences written into the page. This asks for the briefing
 * on its own, from the advocate's actual draft, for the bench they chose.
 */

const BENCH = {
  easy: 'EASY BENCH: patient judges. Questions are clarifying — "take us to the provision", "what is your best authority". Still include the hard question they are bound to ask.',
  moderate: 'MODERATE BENCH: questions test the application of law to these facts and the weakest link in the chain of reasoning.',
  hard: 'HARD BENCH: hostile, interrupting judges. Questions are hypotheticals, concessions extracted, authorities distinguished on their facts, and "isn\'t your own case against you".',
};

function buildOralBriefingPrompt({ stance, benchMode }) {
  const side = /respondent/i.test(stance || '') ? 'Respondent' : 'Petitioner';
  const other = side === 'Petitioner' ? 'Respondent' : 'Petitioner';
  return `You are a senior advocate preparing a junior to argue for the ${side} before an appellate bench.
Prepare their Chambers Briefing. Everything must come from THIS case: the proposition, the
issue, and the advocate's own draft supplied below. Nothing generic — a line that would fit
any case is a failed line.

${BENCH[benchMode] || BENCH.moderate}

QUANTITIES — exact minimums, every one of them is checked:
- "qa": 6 bench questions with answers, hardest first. Each answer opens "My Lords," and
  returns to the ${side}'s strongest point.
- "precedents": 4 authorities. Prefer the KNOWN AUTHORITIES listed in the input. For each:
  the ratio stated precisely, why it helps the ${side} on these facts, and one line to say in court.
- "traps": 4 vulnerable points in THIS draft, each with a 30-second escape.
- "followUpQuestions": 5 follow-ups a judge asks after the first answer, with answers.
- "opponentArguments": 4 arguments the ${other} will run; "demolitionStrategy": a matching
  response to each, in the same order.
- "emergencyRescue": 3-4 sentences to recover when the bench has rejected the main
  submission, built on the single strongest point in this draft — name it.
- "planB": the alternative legal ground, specific to this case.
- "closingPrayer": the formal prayer: the principal relief, then "In the alternative," a
  lesser relief the bench could grant even if it rejects the principal one, then "and pass
  any other order this Hon'ble Court deems fit". Name the specific declarations or orders.

LEGAL PRECISION:
- State a test by its components exactly as the judgment does. Do not relabel a
  multi-part test as one of its own parts. For example, where a judgment requires legality,
  a legitimate aim and proportionality, proportionality is one limb of that test, not the
  name of the whole.
- If you are not sure of a holding, describe what the case is generally relied on for and
  say "verify the exact ratio" rather than inventing one. Never invent a case or citation.

Return ONLY JSON:
{
  "oralAdvocacy": {
    "qa": [ { "q": "", "a": "" } ],
    "precedents": [ { "name": "", "bench": "", "ratio": "", "strategicValue": "", "usage": "" } ],
    "traps": [ { "title": "", "description": "", "escapeResponse": "" } ],
    "closingPrayer": ""
  },
  "rebuttals": {
    "opponentArguments": [ "" ],
    "demolitionStrategy": [ "" ],
    "followUpQuestions": [ { "q": "", "a": "" } ],
    "planB": "",
    "emergencyRescue": ""
  }
}`;
}

module.exports = { buildOralBriefingPrompt };
