const express = require("express");

const issueExtractionPrompt = require("../prompts/issueExtractionPrompt");

const { getChatCompletion } = require("../services/geminiService");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { proposition } = req.body;

    if (!proposition) {
      return res.status(400).json({
        error: "Proposition is required"
      });
    }

    const prompt = issueExtractionPrompt(proposition);

    // Was on generateAIResponse, which pins gemini-2.5-flash and retries it
    // 3 x 120s. Two problems: 360s of retries against a 180s request timeout,
    // and no fallback, so the route died the moment that one model used up its
    // 20 requests for the day while five other models still had capacity.
    const completion = await getChatCompletion({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 4000,
      geminiTimeoutMs: 120000,
      geminiMaxAttempts: 1,
      requestLabel: "Issue Extraction"
    });
    const aiResponse = completion.text;

    let parsed;

    try {
      parsed = JSON.parse(aiResponse);
    } catch (err) {
      return res.status(500).json({
        error: "Invalid AI JSON response",
        raw: aiResponse
      });
    }

    return res.json(parsed);

  } catch (error) {
    console.error("Extraction Error:", error);

    return res.status(500).json({
      error: "AI analysis failed"
    });
  }
});

module.exports = router;