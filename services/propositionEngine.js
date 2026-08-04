const PROPOSITION_INTELLIGENCE_PROMPT = require("../prompts/propositionIntelligencePrompt");
const { getChatCompletion } = require("./geminiService");

/**
 * Executes the Proposition Intelligence extraction layer.
 * Carries the full document (up to 45k chars, ~11k tokens), which reliably
 * exceeds Groq's per-model TPM cap on this account (confirmed via live test:
 * openai/gpt-oss-120b caps at 8k TPM and rejects this with a 413 every time).
 * Gemini has no such ceiling, so it runs primary here with a generous timeout.
 * @param {string} fullText - The raw extracted text from the PDF.
 * @returns {Promise<string>} The raw text response from the model (to be parsed by extractAndParseJSON).
 */
async function extractPropositionIntelligence(fullText) {
  try {
    const call = await getChatCompletion({
      messages: [
        { role: "system", content: PROPOSITION_INTELLIGENCE_PROMPT },
        {
          role: "user",
          content: `Extract the intelligence from this proposition. Return ONLY valid JSON matching the schema.\n\n${fullText.slice(0, 45000)}`
        }
      ],
      temperature: 0.1, // Very low temperature for highly structured schema adherence
      max_tokens: 4000,
      primaryProvider: "gemini",
      groqTimeoutMs: 15000,
      geminiTimeoutMs: 45000,
      geminiMaxAttempts: 1,
      requestLabel: "Proposition Intelligence Extraction"
    });

    return call.text;
  } catch (err) {
    console.error("[PROPOSITION ENGINE] Extraction Failed:", err);
    throw err;
  }
}

module.exports = { extractPropositionIntelligence };
