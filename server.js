require("dotenv").config();

if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const express = require("express");
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

// Services
const { handleLiveVoiceConnection, getChatCompletion } = require("./services/geminiService");

// Prompts
const LEGAL_VALIDATION_PROMPT = require("./prompts/legalValidationPrompt");
const ANALYSIS_SYSTEM_PROMPT = require("./prompts/analysisSystemPrompt");
const ORAL_EVAL_PROMPT = require("./prompts/oralEvalPrompt");
const buildJudgePrompt = require("./prompts/benchJudgePrompt");
const buildEvaluationPrompt = require("./prompts/benchEvaluationPrompt");

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static("frontend"));

app.use("/extract-issues", extractIssuesRoute);

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

      validationResult = JSON.parse(validationCall.text);
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
      analysisData = JSON.parse(rawAnalysis);
    } catch (parseErr) {
      console.error("JSON parse failed. Error:", parseErr.message, "Raw:", rawAnalysis.substring(0, 200));
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

  try {
    const evalCall = await getChatCompletion({
      messages: [
        { role: "system", content: ORAL_EVAL_PROMPT },
        { role: "user", content: `${contextBlock}ORAL SUBMISSION TO EVALUATE:\n\n${argument.trim().slice(0, 4000)}\n\nReturn ONLY a valid JSON object.` }
      ],
      temperature: 0.2,
      max_tokens: 2000,
      requestLabel: "Oral Evaluation"
    });

    const evalData = JSON.parse(evalCall.text);
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

/* ─── /simulate-bench ─── */
app.post("/simulate-bench", express.json(), async (req, res) => {
  const { conversationHistory, propositionSummary, difficulty, studentStatement } = req.body;

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
      const evalPrompt = buildEvaluationPrompt(validDifficulty, propositionSummary || '', conversationHistoryWithNewTurn);
      const evalCall = await getChatCompletion({
        messages: [{ role: "user", content: evalPrompt }],
        temperature: 0.2,
        max_tokens: 1500,
        requestLabel: "Bench Simulation Performance Review"
      });

      const reviewData = JSON.parse(evalCall.text);
      
      // Ensure grade and score properties are normalized
      reviewData.overallScore = Math.min(100, Math.max(0, Number(reviewData.overallScore) || 0));
      const s = reviewData.overallScore;
      if      (s >= 85) reviewData.grade = 'A';
      else if (s >= 70) reviewData.grade = 'B';
      else if (s >= 55) reviewData.grade = 'C';
      else if (s >= 40) reviewData.grade = 'D';
      else              reviewData.grade = 'F';

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
  const judgeSystemPrompt = buildJudgePrompt(validDifficulty, propositionSummary || '');
  const messages = [{ role: "system", content: judgeSystemPrompt }];
  const recentHistory = history.slice(-12);
  
  for (const turn of recentHistory) {
    messages.push({ role: turn.role === 'judge' ? 'assistant' : 'user', content: turn.content });
  }
  messages.push({ role: "user", content: `${studentStatement.trim().slice(0, 1000)}\n\nReturn ONLY a valid JSON object.` });

  try {
    const judgeCall = await getChatCompletion({
      messages,
      temperature: validDifficulty === 'hard' ? 0.7 : validDifficulty === 'easy' ? 0.3 : 0.5,
      max_tokens: 250,
      requestLabel: "Bench Simulation Next Question"
    });

    const judgeData = JSON.parse(judgeCall.text);
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
  const { stance, issue, notes } = req.body;

  if (!stance || !issue || !notes || notes.trim().length < 5) {
    return res.status(400).json({ success: false, error: "Please provide stance, issue, and notes." });
  }

  try {
    const responseCall = await getChatCompletion({
      messages: [
        {
          role: "system",
          content: "You are an elite appellate litigator. Transform the user's raw notes into a strict IRAC format (Issue, Rule, Application, Conclusion) based on the provided stance and issue. Output strictly as a JSON object with keys: 'issue', 'rule', 'application', 'conclusion'."
        },
        {
          role: "user",
          content: `STANCE: ${stance}\nISSUE: ${issue}\nRAW NOTES: ${notes.trim()}\n\nGenerate the IRAC argument.`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      requestLabel: "Build Argument IRAC"
    });

    const data = JSON.parse(responseCall.text);
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
    const userDocRef = db.collection('artifacts').doc('mootcoach').collection('users').doc(uid);

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

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 MootCoach AI running on port ${PORT}`);
});

// Set up WebSocket server for real-time voice engine
const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  if (req.url === "/ws/voice" || req.url.startsWith("/ws/voice")) {
    handleLiveVoiceConnection(ws);
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