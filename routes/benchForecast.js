const express = require("express");
const router = express.Router();
const { getChatCompletion } = require("../services/geminiService");
const BENCH_FORECAST_PROMPT = require("../prompts/benchForecastPrompt");

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
  const { propositionContext, issue, stance, notes } = req.body;

  if (!issue) {
    return res.status(400).json({ success: false, error: "Issue is required." });
  }

  const userPrompt = `
PROPOSITION FACTS / CONTEXT:
${propositionContext || 'None provided.'}

SELECTED LEGAL ISSUE:
${issue}

ADVOCATE'S STANCE (SIDE):
${stance || 'Unknown'}

ADVOCATE'S PREPARED NOTES:
${notes || 'None'}
`;

  try {
    const aiCall = await getChatCompletion({
      messages: [
        { role: "system", content: BENCH_FORECAST_PROMPT },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 3000,
      primaryProvider: "gemini", // using gemini for heavier reasoning
      requestLabel: "Bench Attack Forecast"
    });

    const parsedData = extractAndParseJSON(aiCall.text);
    return res.json({ success: true, response: parsedData });
  } catch (error) {
    console.error("Bench Forecast route error:", error);
    return res.status(500).json({ success: false, error: "Failed to generate bench forecast." });
  }
});

module.exports = router;
