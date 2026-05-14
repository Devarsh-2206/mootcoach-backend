const express = require("express");

const issueExtractionPrompt = require("../prompts/issueExtractionPrompt");

const { generateAIResponse } = require("../services/geminiService");

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

    const aiResponse = await generateAIResponse(prompt);

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