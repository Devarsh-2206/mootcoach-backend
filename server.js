process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const Groq = require("groq-sdk");
const { generateAIResponse } = require("./services/geminiService"); // <-- ADD THIS LINE

// Routes
const extractIssuesRoute = require("./routes/extractIssues");

// Prompts
const LEGAL_VALIDATION_PROMPT = require("./prompts/legalValidationPrompt");
const ANALYSIS_SYSTEM_PROMPT = require("./prompts/analysisSystemPrompt");
const ORAL_EVAL_PROMPT = require("./prompts/oralEvalPrompt");
const buildJudgePrompt = require("./prompts/benchJudgePrompt");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/extract-issues", extractIssuesRoute);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const upload = multer({ dest: "uploads/" });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.post("/analyze", upload.single("file"), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);

    let extractedText = "";
    try {
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text || "";
    } catch (err) {
      console.error("PDF Parse Error:", err);
      extractedText = "";
    }

    try { fs.unlinkSync(filePath); filePath = null; } catch (e) {}

    if (!extractedText || extractedText.trim().length < 80) {
      return res.status(422).json({
        success: false,
        error: "The uploaded PDF appears to be empty, image-based, or unreadable. Please upload a text-based PDF."
      });
    }

    // 🔥 THE FIX: REMOVED THE 14,000 CHARACTER LIMIT
    // We now allow up to 400,000 characters (~100 pages), which Gemini can easily handle.
    const fullPropositionText = extractedText.slice(0, 400000); 

    /* ── PHASE 1: Legal Domain Validation (Still using Groq for speed) ── */
    let validationResult = { isLegal: true, confidence: 60, documentType: "Unknown" };

    try {
      const validationCall = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 80,
        temperature: 0.05,
        messages: [
          { role: "system", content: LEGAL_VALIDATION_PROMPT },
          { role: "user",   content: `Classify this document:\n\n${fullPropositionText.slice(0, 2500)}` }
        ]
      });

      const rawVal = validationCall.choices[0].message.content.trim();
      const cleanedVal = rawVal.replace(/```json|```/g, '').trim();
      const jsonStart = cleanedVal.indexOf('{');
      const jsonEnd   = cleanedVal.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        validationResult = JSON.parse(cleanedVal.slice(jsonStart, jsonEnd + 1));
      }
    } catch (valErr) {
      console.error("Validation error (proceeding):", valErr.message);
    }

    if (validationResult.isLegal === false && validationResult.confidence >= 75) {
      return res.status(422).json({
        success: false,
        isRejection: true,
        documentType: validationResult.documentType || "Non-legal document",
        error: `This document does not appear to be a legal proposition. Detected: "${validationResult.documentType}".`
      });
    }

    /* ── PHASE 2: Full Legal Analysis (🔥 ROUTED TO GEMINI 🔥) ── */
    // We combine the System Prompt and the PDF text into one massive prompt for Gemini
    const geminiPrompt = `${ANALYSIS_SYSTEM_PROMPT}\n\nAnalyze this legal proposition. Return ONLY the JSON object. No text before or after it:\n\n${fullPropositionText}`;
    
    const rawAnalysis = await generateAIResponse(geminiPrompt);

    /* ── PHASE 3: Parse + Validate JSON ── */
    let analysisData;
    try {
      const cleaned  = rawAnalysis.replace(/```json|```/g, '').trim();
      const jStart   = cleaned.indexOf('{');
      const jEnd     = cleaned.lastIndexOf('}');
      if (jStart === -1 || jEnd === -1) throw new Error("No JSON object in response");
      analysisData = JSON.parse(cleaned.slice(jStart, jEnd + 1));
    } catch (parseErr) {
      console.error("JSON parse failed, returning raw text:", parseErr.message);
      return res.json({ success: true, isStructured: false, response: rawAnalysis });
    }

    /* ── PHASE 4: Score Normalization ── */
    const catScores = analysisData.categoryScores || {};
    const computedSum = Object.values(catScores).reduce((sum, c) => sum + (Number(c.score) || 0), 0);
    const aiScore = Number(analysisData.overallScore) || 0;

    if (computedSum > 0 && Math.abs(aiScore - computedSum) > 6) {
      analysisData.overallScore = computedSum;
    }

    analysisData.overallScore = Math.min(94, Math.max(10, analysisData.overallScore));

    const s = analysisData.overallScore;
    if      (s >= 88) analysisData.scoreVerdict = "Exceptional";
    else if (s >= 73) analysisData.scoreVerdict = "Strong";
    else if (s >= 51) analysisData.scoreVerdict = "Average";
    else              analysisData.scoreVerdict = "Weak";

    return res.json({
      success: true,
      isStructured: true,
      modelUsed: "gemini-1.5-flash", // <--- Update this to show the correct AI
      documentType: validationResult.documentType,
      response: analysisData
    });

  } catch (error) {
    console.error("Analyze route error:", error);
    if (filePath) { try { fs.unlinkSync(filePath); } catch (e) {} }
    return res.status(500).json({
      success: false,
      error: "Analysis failed. Please try again. If the problem persists, the AI service may be temporarily unavailable."
    });
  }
});

/* ─── /evaluate-oral ─── */
app.post("/evaluate-oral", express.json(), async (req, res) => {
  const { argument, propositionContext, difficulty } = req.body;

  if (!argument || argument.trim().length < 30) {
    return res.status(400).json({
      success: false,
      error: "Please provide your oral argument text (minimum 30 characters)."
    });
  }

  const contextBlock = propositionContext
    ? `PROPOSITION CONTEXT:\n${propositionContext.slice(0, 800)}\n\n`
    : '';

  try {
    const evalCall = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2000,
      temperature: 0.2,
      messages: [
        { role: "system", content: ORAL_EVAL_PROMPT },
        {
          role: "user",
          content: `${contextBlock}ORAL SUBMISSION TO EVALUATE:\n\n${argument.trim().slice(0, 4000)}\n\nReturn ONLY the JSON object.`
        }
      ]
    });

    const rawEval = evalCall.choices[0].message.content.trim();

    let evalData;
    try {
      const cleaned = rawEval.replace(/```json|```/g, '').trim();
      const jStart  = cleaned.indexOf('{');
      const jEnd    = cleaned.lastIndexOf('}');
      if (jStart === -1 || jEnd === -1) throw new Error("No JSON found");
      evalData = JSON.parse(cleaned.slice(jStart, jEnd + 1));
    } catch (parseErr) {
      return res.json({ success: true, isStructured: false, response: rawEval });
    }

    evalData.overallScore = Math.min(100, Math.max(0, Number(evalData.overallScore) || 0));
    const s = evalData.overallScore;
    if      (s >= 85) evalData.grade = 'A';
    else if (s >= 70) evalData.grade = 'B';
    else if (s >= 55) evalData.grade = 'C';
    else if (s >= 40) evalData.grade = 'D';
    else              evalData.grade = 'F';

    return res.json({ success: true, isStructured: true, response: evalData });

  } catch (error) {
    console.error("/evaluate-oral error:", error);
    return res.status(500).json({ success: false, error: "Evaluation failed. Please try again." });
  }
});

/* ─── /simulate-bench ─── */
app.post("/simulate-bench", express.json(), async (req, res) => {
  const { conversationHistory, propositionSummary, difficulty, studentStatement } = req.body;

  if (!studentStatement || studentStatement.trim().length < 3) {
    return res.status(400).json({ success: false, error: "Statement required." });
  }

  const validDifficulty = ['easy','moderate','hard'].includes(difficulty) ? difficulty : 'moderate';
  const judgeSystemPrompt = buildJudgePrompt(validDifficulty, propositionSummary || '');

  const messages = [{ role: "system", content: judgeSystemPrompt }];

  const recentHistory = (conversationHistory || []).slice(-12);
  for (const turn of recentHistory) {
    messages.push({
      role: turn.role === 'judge' ? 'assistant' : 'user',
      content: turn.content
    });
  }
  messages.push({ role: "user", content: studentStatement.trim().slice(0, 1000) });

  try {
    const judgeCall = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 250,
      temperature: validDifficulty === 'hard' ? 0.7 : validDifficulty === 'easy' ? 0.3 : 0.5,
      messages
    });

    const rawJudge = judgeCall.choices[0].message.content.trim();

    let judgeData;
    try {
      const cleaned = rawJudge.replace(/```json|```/g, '').trim();
      const jStart  = cleaned.indexOf('{');
      const jEnd    = cleaned.lastIndexOf('}');
      if (jStart === -1 || jEnd === -1) throw new Error("No JSON");
      judgeData = JSON.parse(cleaned.slice(jStart, jEnd + 1));
    } catch (e) {
      judgeData = {
        judgeResponse: rawJudge.replace(/[{}"]/g,'').slice(0, 350),
        targetWeakness: "General submission",
        pressureLevel: 3
      };
    }

    return res.json({ success: true, ...judgeData });

  } catch (error) {
    console.error("/simulate-bench error:", error);
    return res.status(500).json({ success: false, error: "Bench simulation failed. Please try again." });
  }
});

app.listen(3000, () => {
  console.log("🚀 MootCoach AI running on port 3000");
});