require("dotenv").config();

if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const express = require("express");
const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MootCoach AI running on port ${PORT} (loading dependencies...)`);
});

const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ server });
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const { Worker } = require("worker_threads");
const path = require("path");
const admin = require("firebase-admin");
const rateLimit = require("express-rate-limit");

// Initialize Firebase Admin SDK securely
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 Firebase Admin SDK initialized successfully.");
  } else {
    console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT env var is missing.");
  }
} catch (error) {
  console.error("❌ Failed to initialize Firebase Admin SDK:", error.message);
}



// Rate limiter for heavy AI and logging routes
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  message: {
    success: false,
    error: "Too many requests from this IP. Please try again after 15 minutes."
  }
});

function extractAndParseJSON_legacy(text) {
  if (!text) throw new Error("Empty text provided");
  let cleanText = text.trim();
  
  // Try direct parse first
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // Continue
  }

  // Attempt markdown block extraction
  const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch (e) {
      // Continue
    }
  }

  // Attempt extraction between first { and last }
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
    } catch (e) {
      // Continue
    }
  }

  throw new Error("Invalid JSON structure returned by AI");
}

function extractAndParseJSON(rawResponse, isIrac = false) {
  console.log(
    '[RAW AI RESPONSE START]\n',
    rawResponse,
    '\n[RAW AI RESPONSE END]'
  );
  console.log('[RAW RESPONSE LENGTH]', rawResponse?.length);

  // Stage A: Normalize input.
  let cleaned = String(rawResponse || '').trim();

  // Remove markdown fences:
  cleaned = cleaned
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // Stage B: Locate first opening brace and last closing brace.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    console.error('[JSON PARSE FAILURE]');
    console.error(cleaned);
    console.error(new Error('No JSON object found'));
    // Fallback to legacy parser
    return extractAndParseJSON_legacy(rawResponse);
  }

  // Extract only the JSON region:
  cleaned = cleaned.slice(start, end + 1);

  let parsed = null;
  let parseError = null;

  // Stage C: Attempt parse.
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn('[PRIMARY PARSE FAILED]', err);
    parseError = err;

    // Stage D: Recovery pass.
    // Normalize rogue control characters:
    const repaired = cleaned
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');

    try {
      parsed = JSON.parse(repaired);
    } catch (recoveryErr) {
      console.error('[RECOVERY PARSE FAILED]', recoveryErr);
      parseError = recoveryErr;
    }
  }

  // If primary and recovery failed, fallback to legacy
  if (!parsed) {
    console.error('[JSON PARSE FAILURE]');
    console.error(cleaned);
    if (parseError) console.error(parseError);

    try {
      parsed = extractAndParseJSON_legacy(rawResponse);
    } catch (legacyErr) {
      throw new Error("Invalid JSON structure returned by AI");
    }
  }

  // STEP 4 — Validation
  if (isIrac) {
    try {
      const required = [
        'issue',
        'rule',
        'application',
        'conclusion'
      ];

      for (const key of required) {
        if (
          !parsed[key] ||
          typeof parsed[key] !== 'string' ||
          !parsed[key].trim()
        ) {
          throw new Error(
            `Missing required field: ${key}`
          );
        }
      }
    } catch (valErr) {
      console.error('[VALIDATION FAILURE]');
      console.error(parsed);
      throw valErr;
    }
  }

  console.log('[JSON PARSE SUCCESS]');
  return parsed;
}

function parsePdfAsync(buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "pdf-worker.js"), {
      workerData: { buffer: buffer }
    });
    worker.on("message", (msg) => {
      if (msg.success) resolve(msg.text);
      else reject(new Error(msg.error));
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`PDF Worker stopped with exit code ${code}`));
    });
  });
}

// Routes
const extractIssuesRoute = require("./routes/extractIssues");
const authorityIntelligenceRoute = require("./routes/authorityIntelligence");
const benchForecastRoute = require("./routes/benchForecast");

// Services
const { handleLiveVoiceConnection, getChatCompletion } = require("./services/geminiService");
const { createEmptyMemory, evaluateExchange } = require("./services/memoryEngine");
const textBenchMemories = new Map();

// Prompts
const LEGAL_VALIDATION_PROMPT = require("./prompts/legalValidationPrompt");
const ANALYSIS_SYSTEM_PROMPT = require("./prompts/analysisSystemPrompt");
const ORAL_EVAL_PROMPT = require("./prompts/oralEvalPrompt");
const { buildJudgePrompt } = require("./prompts/benchJudgePrompt");
const buildEvaluationPrompt = require("./prompts/benchEvaluationPrompt");
const ARGUMENT_BUILDER_PROMPT = require("./prompts/argumentBuilderPrompt");
const buildClaimExtractionPrompt = require("./prompts/claimExtractionPrompt");

// const app = express();
// app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static("frontend"));

app.use("/extract-issues", extractIssuesRoute);
app.use("/api/authority-intelligence", authorityIntelligenceRoute);
app.use("/api/bench-forecast", benchForecastRoute);

app.post("/api/client-log", (req, res) => {
  console.log(`[FRONTEND METRIC] ${req.body.message}`);
  res.sendStatus(200);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const upload = multer({ dest: "uploads/" });



/* ─── /analyze (Now fully powered by Groq & Native JSON Mode) ─── */
app.post("/analyze", aiLimiter, upload.single("file"), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);

    let extractedText = "";
    try {
      extractedText = await parsePdfAsync(dataBuffer);
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

    // THE FIX: Increased to 45,000 characters (12-15 pages). 
    // This handles large moot propositions while staying safely inside Groq's Free Tier limits.
    const fullPropositionText = extractedText.slice(0, 45000);

    /* ── PHASE 1: Legal Domain Validation ── */
    let validationResult = { isLegal: true, confidence: 60, documentType: "Unknown" };

    try {
      const validationCall = await getChatCompletion({
        messages: [
          { role: "system", content: LEGAL_VALIDATION_PROMPT },
          { role: "user",   content: `Classify this document. Return ONLY valid JSON:\n\n${fullPropositionText.slice(0, 3000)}` }
        ],
        temperature: 0.05,
        max_tokens: 150,
        requestLabel: "Legal Domain Validation"
      });

      validationResult = extractAndParseJSON(validationCall.text);
    } catch (valErr) {
      console.error("Validation error (proceeding):", valErr.message);
      if (valErr.message.includes("Timeout")) {
        throw valErr; // Propagate timeout up to the main catch block
      }
    }

    if (validationResult.isLegal === false && validationResult.confidence >= 75) {
      return res.status(422).json({
        success: false,
        isRejection: true,
        documentType: validationResult.documentType || "Non-legal document",
        error: `This document does not appear to be a legal proposition. Detected: "${validationResult.documentType}".`
      });
    }

    /* ── PHASE 2: Full Legal Analysis ── */
    const analysisCall = await getChatCompletion({
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this legal proposition. Return ONLY a valid JSON object. No markdown:\n\n${fullPropositionText}`
        }
      ],
      temperature: 0.1,
      max_tokens: 4000,
      requestLabel: "Full Legal Analysis"
    });

    const rawAnalysis = analysisCall.text;

    /* ── PHASE 3: Parse JSON ── */
    let analysisData;
    try {
      analysisData = extractAndParseJSON(rawAnalysis);
    } catch (parseErr) {
      console.error("FATAL JSON PARSE ERROR. Raw text:", rawAnalysis.substring(0, 200));
      return res.status(500).json({ success: false, error: "AI failed to format response correctly." });
    }

    /* ── PHASE 4: Score Normalization ── */
    const catScores = analysisData.categoryScores || {};
    const computedSum = Object.values(catScores).reduce((sum, c) => sum + (Number(c.score) || 0), 0);
    const aiScore = Number(analysisData.overallScore) || 0;

    if (computedSum > 0 && aiScore !== computedSum) {
      analysisData.overallScore = computedSum;
    }

    // THE FIX: Allow scores to go all the way down to 0 (removed the Math.max(10) safety net)
    analysisData.overallScore = Math.min(94, Math.max(0, analysisData.overallScore));

    const s = analysisData.overallScore;
    if      (s >= 88) analysisData.scoreVerdict = "Exceptional";
    else if (s >= 73) analysisData.scoreVerdict = "Strong";
    else if (s >= 51) analysisData.scoreVerdict = "Average";
    else if (s >= 28) analysisData.scoreVerdict = "Weak";
    else              analysisData.scoreVerdict = "Critically Flawed";

    return res.json({
      success: true,
      isStructured: true,
      modelUsed: analysisCall.model,
      documentType: validationResult.documentType,
      response: analysisData
    });

  } catch (error) {
    console.error("Analyze route error:", error);
    if (filePath) { try { fs.unlinkSync(filePath); } catch (e) {} }
    const isTimeout = error.message && error.message.includes("Timeout");
    return res.status(isTimeout ? 504 : 500).json({
      success: false,
      error: isTimeout
        ? "AI analysis request timed out. Please try again."
        : "Analysis failed. Please try again. If the problem persists, the AI service may be temporarily unavailable."
    });
  }
});

/* ─── /evaluate-oral ─── */
app.post("/evaluate-oral", aiLimiter, express.json(), async (req, res) => {
  const { argument, propositionContext, difficulty } = req.body;

  if (!argument || argument.trim().length < 30) {
    return res.status(400).json({ success: false, error: "Please provide your oral argument text." });
  }

  const contextBlock = propositionContext ? `PROPOSITION CONTEXT:\n${propositionContext.slice(0, 800)}\n\n` : '';
  const validDifficulty = ['easy', 'moderate', 'hard'].includes(difficulty) ? difficulty : 'moderate';
  
  const difficultyRules = {
    easy: "This is an EASY BENCH. The judges are lenient. Standard, well-structured arguments will score high (80-90). Minor gaps are excused. However, extremely short or legally incoherent submissions must still be graded low (<50).",
    moderate: "This is a MODERATE BENCH. The judges look for clear statutory construction and application of law to facts. Scores should be strictly balanced: only exceptional arguments get 85+, solid submissions score 70-80, and weak/shallow arguments score 50-65. Incoherent/very short scripts must receive <40.",
    hard: "This is a HARD BENCH. The judges are hostile rights-purists and procedural hawks. They look for Socratic rigor, deep constitutional reasoning, precision in case law ratios, and preemptive rebuttal coverage. Scoring is extremely strict: a score of 80+ requires master-class elite mooting. Average submissions score 55-65. Shallow, unconvincing, or brief submissions must be graded failing (<50)."
  };

  const currentSystemPrompt = `${ORAL_EVAL_PROMPT}\n\n[DIFFICULTY STANDARD]\n${difficultyRules[validDifficulty]}`;

  try {
    const evalCall = await getChatCompletion({
      messages: [
        { role: "system", content: currentSystemPrompt },
        { role: "user", content: `${contextBlock}ORAL SUBMISSION TO EVALUATE:\n\n${argument.trim().slice(0, 4000)}\n\nReturn ONLY a valid JSON object.` }
      ],
      temperature: 0.2,
      max_tokens: 2000,
      requestLabel: "Oral Evaluation"
    });

    const evalData = extractAndParseJSON(evalCall.text);
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
    const isTimeout = error.message && error.message.includes("Timeout");
    return res.status(isTimeout ? 504 : 500).json({
      success: false,
      error: isTimeout
        ? "AI evaluation timed out. Please try again."
        : "Evaluation failed. Please try again."
    });
  }
});

/* ─── /simulate-bench/extract-claims ─── */
app.post("/simulate-bench/extract-claims", express.json(), async (req, res) => {
  const { studentStatement } = req.body;
  
  if (!studentStatement || studentStatement.trim().length < 3) {
    return res.status(400).json({ success: false, error: "Statement required." });
  }

  try {
    const prompt = buildClaimExtractionPrompt(studentStatement);
    const extractionCall = await getChatCompletion({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 800,
      requestLabel: "Claim Extraction"
    });

    const extractionData = extractAndParseJSON(extractionCall.text);
    return res.json({ success: true, claims: extractionData.claims || [] });
  } catch (error) {
    console.error("/simulate-bench/extract-claims error:", error);
    return res.status(500).json({ success: false, error: "Failed to extract claims" });
  }
});

/* ─── /simulate-bench ─── */
app.post("/simulate-bench", express.json(), async (req, res) => {
  const { conversationHistory, propositionSummary, difficulty, studentStatement, claimLedger } = req.body;

  if (!studentStatement || studentStatement.trim().length < 3) {
    return res.status(400).json({ success: false, error: "Statement required." });
  }

  const validDifficulty = ['easy','moderate','hard'].includes(difficulty) ? difficulty : 'moderate';
  const history = conversationHistory || [];
  
  // Count advocate turns (previous turns in history + current turn)
  const advocateTurnsCount = history.filter(t => t.role === 'advocate' || t.role === 'user').length + 1;
  const MAX_TURNS = 5; // Session ends after 5 advocate submissions

  const conversationHistoryWithNewTurn = [
    ...history,
    { role: 'advocate', content: studentStatement }
  ];

  if (advocateTurnsCount >= MAX_TURNS) {
    // End of session: Generate Performance Review
    try {
      const evalPrompt = buildEvaluationPrompt(validDifficulty, propositionSummary || '', conversationHistoryWithNewTurn, claimLedger);
      const evalCall = await getChatCompletion({
        messages: [{ role: "user", content: evalPrompt }],
        temperature: 0.2,
        max_tokens: 1500,
        requestLabel: "Bench Simulation Performance Review"
      });

      const reviewData = extractAndParseJSON(evalCall.text);

      return res.json({
        success: true,
        isSessionEnd: true,
        performanceReview: reviewData
      });
    } catch (evalErr) {
      console.error("Bench evaluation error:", evalErr);
      const isTimeout = evalErr.message && evalErr.message.includes("Timeout");
      return res.status(isTimeout ? 504 : 500).json({
        success: false,
        error: isTimeout
          ? "Bench evaluation timed out. Please try again."
          : "Failed to generate performance review."
      });
    }
  }

  // Normal turn: Generate next judge question
  const sessionKey = req.ip + "_" + validDifficulty;
  if (advocateTurnsCount === 1) textBenchMemories.set(sessionKey, createEmptyMemory());
  if (!textBenchMemories.has(sessionKey)) textBenchMemories.set(sessionKey, createEmptyMemory());
  const benchMemory = textBenchMemories.get(sessionKey);
  
  let whisperToken = null;
  if (history.length > 0) {
    const lastJudge = history[history.length - 1];
    if (lastJudge.role === 'judge') {
      const exchangeLog = `Judge: ${lastJudge.content}\nAdvocate: ${studentStatement}`;
      const evalResult = await evaluateExchange(benchMemory, exchangeLog);
      if (evalResult && evalResult.whisperToken) {
        whisperToken = evalResult.whisperToken;
        console.log("[MEMORY ENGINE] Text Mode Whisper:", whisperToken);
      }
    }
  }

  const judgeSystemPrompt = buildJudgePrompt(validDifficulty, propositionSummary || '', claimLedger);
  const messages = [{ role: "system", content: judgeSystemPrompt }];
  const recentHistory = history.slice(-12);
  
  for (const turn of recentHistory) {
    messages.push({ role: turn.role === 'judge' ? 'assistant' : 'user', content: turn.content });
  }
  
  let finalPayload = `${studentStatement.trim().slice(0, 1000)}\n\nReturn ONLY a valid JSON object.`;
  if (whisperToken) {
    finalPayload = `${whisperToken}\n\n${finalPayload}`;
  }
  messages.push({ role: "user", content: finalPayload });

  try {
    const judgeCall = await getChatCompletion({
      messages,
      temperature: validDifficulty === 'hard' ? 0.7 : validDifficulty === 'easy' ? 0.3 : 0.5,
      max_tokens: 250,
      requestLabel: "Bench Simulation Next Question"
    });

    const judgeData = extractAndParseJSON(judgeCall.text);
    return res.json({
      success: true,
      isSessionEnd: false,
      ...judgeData
    });
  } catch (error) {
    console.error("/simulate-bench error:", error);
    const isTimeout = error.message && error.message.includes("Timeout");
    return res.status(isTimeout ? 504 : 500).json({
      success: false,
      error: isTimeout
        ? "Bench simulation timed out. Please try again."
        : "Bench simulation failed. Please try again."
    });
  }
});

/* ─── /api/build-argument ─── */
app.post("/api/build-argument", aiLimiter, express.json(), async (req, res) => {
  const { stance, issue, notes, propositionContext } = req.body;

  if (!stance || !issue || !notes || notes.trim().length < 5) {
    return res.status(400).json({ success: false, error: "Please provide stance, issue, and notes." });
  }

  // Grounding validation check
  if (!propositionContext || propositionContext.trim().length < 20 || propositionContext.toLowerCase().includes("not set") || propositionContext.toLowerCase().includes("no file uploaded")) {
    return res.status(400).json({ success: false, error: "Insufficient factual material detected" });
  }

  try {
    const responseCall = await getChatCompletion({
      messages: [
        {
          role: "system",
          content: ARGUMENT_BUILDER_PROMPT
        },
        {
          role: "user",
          content: `PROPOSITION FACTS / CONTEXT:
${propositionContext.trim()}

STANCE / SIDE: ${stance}
ISSUE SELECTED: ${issue}
RAW NOTES & AUTHORITIES PROVIDED: ${notes.trim()}

Generate the full side-aware appellate package strictly based on the proposition facts.`
        }
      ],
      temperature: 0.3,
      max_tokens: 4000,
      requestLabel: "Build Side-Aware Argument Package"
    });

    const data = extractAndParseJSON(responseCall.text, false);
    return res.json({ success: true, response: data });
  } catch (error) {
    console.error("/api/build-argument error:", error);
    const isTimeout = error.message && error.message.includes("Timeout");
    return res.status(isTimeout ? 504 : 500).json({
      success: false,
      error: isTimeout
        ? "Argument builder timed out. Please try again."
        : "Failed to build argument. Please try again."
    });
  }
});

/* ─── /api/log-session (Secure Backend Logging) ─── */
app.post("/api/log-session", aiLimiter, express.json(), async (req, res) => {
  const { uid, type, mootName, fileName, score, analysisData, durationSeconds } = req.body;

  if (!uid) {
    return res.status(400).json({ success: false, error: "uid is required." });
  }

  if (admin.apps.length === 0) {
    console.error("❌ Firebase Admin has not been initialized. Check FIREBASE_SERVICE_ACCOUNT env var.");
    return res.status(503).json({ success: false, error: "Database service is unconfigured." });
  }

  try {
    const db = admin.firestore();
    const userDocRef = db.collection('artifacts').doc('moot.coach').collection('users').doc(uid);

    let result;
    if (type === 'analysis') {
      result = await userDocRef.collection('analyses').add({
        mootName: mootName || 'Untitled Moot',
        fileName: fileName || '',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        score: score || 0,
        analysisData: analysisData || {}
      });
    } else if (type === 'voice_session') {
      result = await userDocRef.collection('voice_sessions').add({
        mootName: mootName || 'Untitled Moot',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        durationSeconds: durationSeconds || 0
      });
    } else {
      return res.status(400).json({ success: false, error: "Invalid log type." });
    }

    return res.json({ success: true, id: result.id });
  } catch (err) {
    console.error("Firestore secure log error:", err);
    return res.status(500).json({ success: false, error: "Failed to save data securely to Cloud Firestore." });
  }
});

// Port binding and WSS initialization moved to the top of the file to pass Render health checks
// const PORT = process.env.PORT || 10000;
// const server = app.listen(PORT, '0.0.0.0', ...
// const { WebSocketServer } = require("ws");
// const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  if (req.url === "/ws/voice" || req.url.startsWith("/ws/voice")) {
    let benchLevel = 'moderate';
    let propositionSummary = '';
    
    try {
      // The req.url might look like /ws/voice?bench=hard&mootId=...
      // Node's req.url starts with / so we can construct a placeholder URL to parse searchParams
      const url = new URL(req.url, `ws://${req.headers.host || 'localhost'}`);
      benchLevel = url.searchParams.get('bench') || 'moderate';
      propositionSummary = url.searchParams.get('summary') || '';
    } catch (e) {
      console.error("Error parsing WebSocket URL:", e);
    }

    handleLiveVoiceConnection(ws, benchLevel, propositionSummary);
  } else {
    ws.close();
  }
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("🔌 Terminating inactive WebSocket connection (missed pong).");
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
});