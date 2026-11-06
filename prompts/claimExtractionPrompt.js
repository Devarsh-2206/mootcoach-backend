const { wrap, DATA_RULE } = require('./untrusted');

const buildClaimExtractionPrompt = (studentStatement) => {
  return `You are a sophisticated legal intelligence AI. Your task is to extract substantive legal claims and arguments from a moot court advocate's statement.

${DATA_RULE}

ADVOCATE'S STATEMENT:
${wrap('transcript', String(studentStatement || '').slice(0, 2000))}

INSTRUCTIONS:
1. Extract any clear, substantive legal claims made by the advocate. Do not extract mere pleasantries, transitions, or factual restatements unless they form a core legal argument.
2. For each claim, identify:
   - claim: A concise summary of the legal argument.
   - authority: Any case law, statute, or article cited to support it (if none, return null).
   - principle: The core legal principle underlying the claim (e.g., "Proportionality", "Natural Justice", "Separation of Powers").
   - confidence: A float between 0.0 and 1.0 representing how explicitly and confidently the advocate made this claim. (e.g., 0.9 for "We submit that this violates Article 14", 0.4 for "It might be considered unfair").
3. Return the result strictly as a JSON object matching the following schema:
{
  "claims": [
    {
      "claim": "string",
      "authority": "string | null",
      "principle": "string",
      "confidence": "number"
    }
  ]
}

EXAMPLE
Statement: "My Lords, the suspension fails the test in Anuradha Bhasin because it was never published, and in any case it ran for 74 days without review."
Output: {"claims":[{"claim":"The suspension order is invalid because it was not published","authority":"Anuradha Bhasin v. Union of India","principle":"Publication of restrictive orders","confidence":0.9},{"claim":"A 74-day suspension without periodic review is disproportionate","authority":null,"principle":"Proportionality","confidence":0.8}]}

If no substantive legal claims are found, return { "claims": [] }.
Return ONLY valid JSON. Do not include markdown formatting or extra text.`;
};

module.exports = buildClaimExtractionPrompt;
