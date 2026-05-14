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

    res.json({
      success: true,
      data: aiResponse
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message
    });

  }
});

module.exports = router;