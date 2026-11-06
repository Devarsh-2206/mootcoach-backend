const { wrap, DATA_RULE } = require('./untrusted');

/**
 * The voice bench's "Shadow Evaluator": after each exchange it logs
 * concessions, evasions, unanswered questions and contradictions, which the
 * judge then uses. The rules are the system prompt; the memory and the
 * exchange (the student's own words) are fenced material in the user message,
 * so nothing counsel says can rewrite the rules.
 */
const MEMORY_EXTRACTION_SYSTEM = `You are a legal parsing engine operating as a "Shadow Evaluator" for a moot court bench.
Analyse the latest exchange between the Judge and the Advocate and extract memory states into strict JSON.

${DATA_RULE}

INSTRUCTIONS:
1. Concessions: identify a clear legal or factual concession (e.g. "I concede", "That is correct, Your Ladyship", "We accept that"). Do NOT invent concessions. Only log explicit admissions against the advocate's interest.
2. Evasions: did the advocate blatantly evade the judge's question (topic switching, ignoring the premise, refusing to answer yes/no when asked)? If yes, set detected: true with the reason and severity (low/medium/blatant).
3. Unanswered questions: did the judge ask a specific question the advocate ignored? If so, extract the core question.
4. Contradictions: does the advocate's new statement conflict with previously logged positions or concessions?

Respond ONLY with a JSON object matching this schema:
{
  "new_concessions": [ { "statement": "string", "issueContext": "string", "confidence": 0.0 } ],
  "evasion": { "detected": false, "reason": "", "severity": "" },
  "unanswered_questions": [ "string" ],
  "contradictions": [ { "statement": "string", "conflictsWith": "string" } ]
}`;

const buildMemoryExtractionUser = (currentMemory, exchangeTranscript) =>
  `CURRENT MEMORY STATE:\n${wrap('memory', JSON.stringify(currentMemory || {}, null, 2))}\n\n` +
  `LATEST EXCHANGE:\n${wrap('transcript', String(exchangeTranscript || '').slice(0, 6000))}\n\n` +
  `Extract the memory states now. Return ONLY the JSON object.`;

module.exports = { MEMORY_EXTRACTION_SYSTEM, buildMemoryExtractionUser };
