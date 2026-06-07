const express = require("express");
const router = express.Router();
const { getChatCompletion } = require("../services/geminiService");
const AUTHORITY_INTELLIGENCE_PROMPT = require("../prompts/authorityIntelligencePrompt");

// We need the extractAndParseJSON utility. It's currently in server.js.
// Since it's in server.js and not exported, we should probably just duplicate the robust logic or require a util file.
// For now, let's implement a robust JSON extractor here, or just let getChatCompletion return the text and parse it.
function extractAndParseJSON(rawResponse) {
  let cleaned = String(rawResponse || '').trim();
  cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found');
  }
  
  cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const repaired = cleaned.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    return JSON.parse(repaired);
  }
}

router.post("/", async (req, res) => {
  const { authorityName, propositionContext, stance, notes } = req.body;

  if (!authorityName) {
    return res.status(400).json({ success: false, error: "Authority name is required." });
  }

  const userPrompt = `
PROPOSITION FACTS / CONTEXT:
${propositionContext || 'None provided.'}

ADVOCATE'S STANCE (SIDE):
${stance || 'Unknown'}

AUTHORITY TO ANALYZE:
${authorityName}

ADVOCATE'S NOTES:
${notes || 'None'}
`;

  try {
    const aiCall = await getChatCompletion({
      messages: [
        { role: "system", content: AUTHORITY_INTELLIGENCE_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 3000,
      primaryProvider: "gemini",
      requestLabel: "Authority Intelligence"
    });

    const parsedData = extractAndParseJSON(aiCall.text);
    return res.json({ success: true, response: parsedData });
  } catch (error) {
    console.error("Authority Intelligence route error:", error);
    return res.status(500).json({ success: false, error: "Failed to generate advocacy card." });
  }
});

module.exports = router;
