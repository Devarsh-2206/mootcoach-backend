const PROPOSITION_INTELLIGENCE_PROMPT = require("../prompts/propositionIntelligencePrompt");
const { getChatCompletion } = require("./geminiService");

/**
 * Executes the Proposition Intelligence extraction layer.
 * Relies on getChatCompletion which defaults to Groq's llama-3.3-70b-versatile for fast structured JSON.
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
      requestLabel: "Proposition Intelligence Extraction"
    });

    return call.text;
  } catch (err) {
    console.error("[PROPOSITION ENGINE] Extraction Failed:", err);
    throw err;
  }
}

module.exports = { extractPropositionIntelligence };
