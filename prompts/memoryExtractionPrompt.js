const buildMemoryExtractionPrompt = (currentMemory, exchangeTranscript) => {
  return `You are a legal parsing engine operating as a "Shadow Evaluator" for a Moot Court AI.
Your job is to analyze the latest exchange between the Judge and the Advocate, and extract relevant memory states into a strict JSON format.

CURRENT MEMORY STATE:
${JSON.stringify(currentMemory, null, 2)}

LATEST EXCHANGE:
${exchangeTranscript}

INSTRUCTIONS:
1. Concessions: Identify if the advocate made a clear legal or factual concession (e.g. "I concede", "That is correct, Your Ladyship", "We accept that"). Do NOT hallucinate concessions. Only log explicit admissions against the advocate's interest.
2. Evasions: Did the advocate blatantly evade the judge's question? (e.g. topic switching, ignoring the premise, refusing to answer yes/no when asked). If yes, set evasionDetected: true, and provide the reason and severity (low/medium/blatant).
3. Unanswered Questions: Did the judge ask a specific question that the advocate completely ignored or failed to address? If so, extract the core question.
4. Contradictions: Does the advocate's new statement conflict with any previously logged advocatePositions or concessions?

Respond strictly with a JSON object matching this schema:
{
  "new_concessions": [ { "statement": "string", "issueContext": "string", "confidence": 0.0 to 1.0 } ],
  "evasion": {
    "detected": boolean,
    "reason": "string (empty if false)",
    "severity": "low|medium|blatant (empty if false)"
  },
  "unanswered_questions": [ "string" ],
  "contradictions": [ { "statement": "string", "conflictsWith": "string" } ]
}`;
}

module.exports = { buildMemoryExtractionPrompt };
