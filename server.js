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
// Long-running AI pipeline requests can take well over a minute; make sure no
// implicit socket/header timeout on this end cuts them off before our own
// per-call timeouts (server.js AI routes) get a chance to respond.
server.requestTimeout = 180000;
server.headersTimeout = 185000;
server.keepAliveTimeout = 65000;

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



/**
 * Rate limiting for the heavy AI routes.
 *
 * This used to be 15 requests per 15 minutes keyed on the IP address, which
 * is the right shape for stopping a script and the wrong shape for a room.
 * A class of students testing on one wifi connection is ONE IP, a full
 * session is three or four of these calls, and so the fifth person to try was
 * told to come back in fifteen minutes. That is not abuse, and it should not
 * look like it.
 *
 * So the bucket is the person where we can tell who they are. The token is
 * read but not cryptographically verified, because this is only deciding
 * which bucket to count in - a forged subject buys you your own allowance,
 * not somebody else's, and the per-IP bucket still covers anyone unsigned.
 * The routes that actually act on identity verify the token properly.
 */
function identityKey(req) {
  const h = String(req.headers.authorization || '');
  if (h.startsWith('Bearer ')) {
    try {
      const claims = JSON.parse(Buffer.from(h.slice(7).split('.')[1], 'base64').toString('utf8'));
      if (claims && (claims.user_id || claims.sub)) return 'u:' + (claims.user_id || claims.sub);
    } catch (e) {
      // Not a readable token: fall through to the address.
    }
  }
  return 'ip:' + (req.ip || 'unknown');
}

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  keyGenerator: identityKey,
  // A signed-in advocate gets a generous allowance of their own. Everyone
  // sharing an address gets a larger pool between them, sized so a room of
  // thirty is never the thing that stops working.
  max: (req) => identityKey(req).startsWith('u:') ? 40 : 240,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
  handler: (req, res) => {
    const mine = identityKey(req).startsWith('u:');
    res.status(429).json({
      success: false,
      error: mine
        ? "You have made a lot of requests in a short time. Give it a few minutes and carry on."
        : "This network has made a lot of requests in a short time. Signing in gives you your own allowance.",
    });
  },
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
      if (msg.success) {
        // Resolves a STRING, because every existing caller treats it as one.
        // The page count rides along as a property so the memorial analyser
        // can check page limits without changing those callers.
        const out = new String(msg.text);
        out.numpages = msg.numpages || null;
        resolve(out);
      } else {
        /**
         * Retry in-process before giving up.
         *
         * Some PDFs that parse perfectly in the main thread throw "bad XRef
         * entry" in the worker — verified on a byte-identical file (same SHA-1),
         * failing in the worker and succeeding in a fresh main-thread process.
         * The cause sits inside pdf.js and I could not pin it down; what is
         * certain is that the worker failing does not mean the file is
         * unreadable, and the user otherwise sees "this PDF appears to be empty,
         * image-based or unreadable", which is simply wrong.
         *
         * This blocks the event loop, which is the whole reason the worker
         * exists — so it runs only after the worker has already failed.
         */
        console.warn(`[PDF] Worker failed (${msg.error}); retrying in-process.`);
        try {
          const pdfParse = require("pdf-parse");
          pdfParse(Buffer.from(buffer)).then(d => {
            console.log(`[PDF] In-process retry succeeded: ${(d.text || '').length} chars.`);
            const out = new String(d.text || "");
            out.numpages = d.numpages || null;
            resolve(out);
          }).catch(() => reject(new Error(msg.error)));
        } catch (e) {
          reject(new Error(msg.error));
        }
      }
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
const usageMeter = require("./services/usageMeter");
const analysisCache = require("./services/analysisCache");
const { createEmptyMemory, evaluateExchange } = require("./services/memoryEngine");
const { extractPropositionIntelligence } = require("./services/propositionEngine");
const { extractProceduralHierarchy } = require("./services/proceduralHierarchyEngine");
const { extractForumIntelligence } = require("./services/forumIntelligenceEngine");
const { extractIssueIntelligence } = require("./services/issueIntelligenceEngine");
const { extractAuthorityIntelligence } = require("./services/authorityIntelligenceEngine");
const { extractAdvocacyIntelligence } = require("./services/advocacyIntelligenceEngine");
const textBenchMemories = new Map();

// Prompts
const LEGAL_VALIDATION_PROMPT = require("./prompts/legalValidationPrompt");
// Defensive: a missing/broken optional prompt must NEVER crash the whole backend
// (which would take down CORS, the WebSocket, and every route at once).
let FORUM_DETECTION_PROMPT = null;
try {
  FORUM_DETECTION_PROMPT = require("./prompts/forumDetectionPrompt");
} catch (e) {
  console.warn("⚠️ forumDetectionPrompt not found — forum pre-detection disabled, server continues:", e.message);
}
const ANALYSIS_SYSTEM_PROMPT = require("./prompts/analysisSystemPrompt");
const ANALYSIS_LITE_PROMPT = require("./prompts/analysisLitePrompt");
const ORAL_EVAL_PROMPT = require("./prompts/oralEvalPrompt");
const { buildJudgePrompt } = require("./prompts/benchJudgePrompt");
const buildEvaluationPrompt = require("./prompts/benchEvaluationPrompt");
const { buildJudgeDirective, listJudgeProfiles, listIntensityProfiles } = require("./prompts/judgeProfiles");
const ARGUMENT_BUILDER_PROMPT = require("./prompts/argumentBuilderPrompt");
const buildClaimExtractionPrompt = require("./prompts/claimExtractionPrompt");
const { buildIndianLegalDirective } = require("./prompts/indianLegalFramework");
const { applyCitationGuard } = require("./services/citationGuard");
const { auditMemorial } = require("./services/memorialAudit");
const MEMORIAL_REVIEW_PROMPT = require("./prompts/memorialReviewPrompt");
const { buildMemorial } = require("./services/memorialBuilder");

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

/**
 * Where the day's provider allowance went.
 *
 * Both free tiers cap by the day, and until this existed nothing could say
 * how much was left or which route had spent it - a quota wall simply
 * arrived. Signed-in only: it is not user data, but it is not public either.
 *
 *   GET /api/usage            today, Pacific (the day Google resets on)
 *   GET /api/usage?day=YYYY-MM-DD
 */
app.get("/api/usage", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken || !admin.apps.length) {
    return res.status(401).json({ success: false, error: "Sign in to read usage." });
  }
  try {
    await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ success: false, error: "Invalid or expired auth token." });
  }
  try {
    // Checked without a regex on purpose. A YYYY-MM-DD shape, and a date
    // that actually parses; anything else falls back to today rather than
    // being handed to Firestore as a document id.
    const asked = String(req.query.day || "");
    const looksLikeADay = asked.length === 10 && asked[4] === "-" && asked[7] === "-"
      && !Number.isNaN(Date.parse(asked));
    const day = looksLikeADay ? asked : undefined;
    const snap = await usageMeter.snapshot(day);
    // The cache is the other half of the picture: calls not made are
    // the cheapest kind, and they are invisible in a usage count.
    const cache = await analysisCache.stats().catch(() => null);
    return res.json({ success: true, usage: snap, cache });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Could not read usage: " + (e && e.message) });
  }
});

const upload = multer({ dest: "uploads/" });



/**
 * PHASES 5-10 — the enrichment chain.
 *
 * These payloads enrich the Simulator. The core analysis, which is what the
 * user actually sees, is complete and independent of them, and every one of
 * these fields is null-tolerant all the way through to the client and to
 * Firestore.
 *
 * They are therefore given a fixed time budget rather than being allowed to
 * run the request out. Before this, one stage overrunning could push /analyze
 * past two minutes; with a cold start on top that exceeds the server's own
 * 180s requestTimeout, which is what a user experiences as "upload failed
 * with no output".
 *
 * Budget is spent in dependency order. A stage that cannot fit in the time
 * remaining is skipped cleanly rather than started and cut off mid-flight.
 * Reservations come from measured wall time plus headroom, not guesswork.
 */
/**
 * Default 0 = skipped, because this chain is ~35% of the upload wait and the
 * user sees none of it. It feeds the Simulator, which already falls back to
 * the lightweight forum detection from Phase 1.5 when these are absent — and
 * in production these fields have been null on every request anyway.
 *
 * Set ENRICH_BUDGET_MS=70000 to restore it, at roughly +35s on every upload.
 */
const ENRICH_BUDGET_MS = Number(process.env.ENRICH_BUDGET_MS ?? 0);

/**
 * The analysis of last resort.
 *
 * Runs on Groq, which means it has to fit inside 8,000 tokens of input plus
 * reserved output in a single request. The full analysis cannot; this can,
 * because it asks for four things instead of twenty-one.
 *
 * The proposition is sampled head and tail rather than simply truncated.
 * Moot propositions put the facts at the front and very often list the issues
 * at the very end, so cutting the tail throws away the part an advocate most
 * needs. Taking both ends keeps the shape of the document.
 */
const LITE_HEAD_CHARS = 9000;
const LITE_TAIL_CHARS = 4000;

function sampleForLite(text) {
  if (text.length <= LITE_HEAD_CHARS + LITE_TAIL_CHARS) return text;
  return text.slice(0, LITE_HEAD_CHARS)
    + '\n\n[... middle of the proposition omitted for a reduced analysis ...]\n\n'
    + text.slice(-LITE_TAIL_CHARS);
}

async function runLiteAnalysis(fullPropositionText, forumDirective) {
  const sampled = sampleForLite(fullPropositionText);
  const call = await getChatCompletion({
    messages: [
      { role: "system", content: ANALYSIS_LITE_PROMPT },
      { role: "user", content: `Analyse this proposition. Return ONLY the JSON object.${forumDirective || ''}\n\n${sampled}` },
    ],
    temperature: 0.1,
    // Sized to fit: ~700 prompt + ~3,300 proposition + 3,000 reserved is
    // comfortably inside the 8,000 Groq charges against the minute.
    max_tokens: 3000,
    primaryProvider: "groq",
    groqTimeoutMs: 45000,
    groqMaxAttempts: 2,
    // Gemini is the thing that just failed, so there is no point asking it
    // again here. One attempt, only in case the failure was specific to the
    // full request rather than the provider.
    geminiMaxAttempts: 1,
    geminiTimeoutMs: 40000,
    geminiMaxOutputTokens: 6000,
    totalBudgetMs: 45000,
    requestLabel: "Reduced Analysis (fallback)",
  });
  return extractAndParseJSON(call.text);
}

async function runEnrichment(rawPropIntel, propIntelError, forumContext) {
  const out = {
    propositionIntelligence: null, proceduralHierarchy: null, forumIntelligence: null,
    issueIntelligence: null, authorityIntelligence: null, advocacyIntelligence: null,
  };

  if (ENRICH_BUDGET_MS <= 0) {
    console.log('[ENRICH] Chain disabled (ENRICH_BUDGET_MS=0) — responding with the core analysis.');
    return out;
  }

  // Past this point the chain is on, so Proposition Intelligence was actually
  // requested and every later stage is built from it.
  if (propIntelError || !rawPropIntel) {
    console.error('[ENRICH] Proposition Intelligence unavailable, skipping chain:',
      propIntelError && propIntelError.message);
    return out;
  }
  try {
    out.propositionIntelligence = extractAndParseJSON(rawPropIntel);
  } catch (e) {
    console.error('[ENRICH] Proposition Intelligence unparseable, skipping chain:', e.message);
    return out;
  }

  const deadline = Date.now() + ENRICH_BUDGET_MS;
  const left = () => deadline - Date.now();
  const stage = async (label, needMs, fn) => {
    const remaining = left();
    if (remaining < needMs) {
      console.warn(`[ENRICH] Skipping ${label}: ${Math.round(remaining / 1000)}s left, needs ~${Math.round(needMs / 1000)}s`);
      return null;
    }
    const t = Date.now();
    try {
      const v = await fn();
      console.log(`[ENRICH] ${label} ok in ${Date.now() - t}ms (${Math.round(left() / 1000)}s budget left)`);
      return v;
    } catch (e) {
      console.error(`[ENRICH] ${label} failed after ${Date.now() - t}ms, proceeding:`, e.message);
      return null;
    }
  };

  out.proceduralHierarchy = await stage('Procedural Hierarchy', 12000, async () =>
    extractAndParseJSON(await extractProceduralHierarchy(JSON.stringify(out.propositionIntelligence))));
  if (!out.proceduralHierarchy) return out;

  out.forumIntelligence = await stage('Forum Intelligence', 30000, async () =>
    extractAndParseJSON(await extractForumIntelligence(
      JSON.stringify(out.propositionIntelligence), JSON.stringify(out.proceduralHierarchy))));
  if (!out.forumIntelligence) return out;

  out.issueIntelligence = await stage('Issue Intelligence', 45000, async () =>
    extractAndParseJSON(await extractIssueIntelligence(
      JSON.stringify(out.propositionIntelligence),
      JSON.stringify(out.proceduralHierarchy),
      JSON.stringify(out.forumIntelligence))));
  if (!out.issueIntelligence) return out;

  out.authorityIntelligence = await stage('Authority Intelligence', 45000, async () => {
    const authorityInputProp = { factualMatrix: out.propositionIntelligence?.factualMatrix };
    const authorityInputIssue = {
      issues: (out.issueIntelligence?.issues || []).map(i => ({
        exactLegalQuestion: i.issueDefinition?.exactLegalQuestion,
        petitionerTheory: i.petitionerFramework?.coreTheory,
        respondentTheory: i.respondentFramework?.coreTheory,
        authorityRequirements: i.authorityRequirements
      }))
    };
    return extractAndParseJSON(await extractAuthorityIntelligence(
      JSON.stringify(authorityInputProp), "{}",
      JSON.stringify(forumContext || out.forumIntelligence),
      JSON.stringify(authorityInputIssue)));
  });
  if (!out.authorityIntelligence) return out;

  out.advocacyIntelligence = await stage('Advocacy Intelligence', 45000, async () =>
    extractAndParseJSON(await extractAdvocacyIntelligence(
      JSON.stringify(out.propositionIntelligence),
      JSON.stringify(out.proceduralHierarchy),
      JSON.stringify(out.forumIntelligence),
      JSON.stringify(out.issueIntelligence),
      JSON.stringify(out.authorityIntelligence))));

  return out;
}

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

    /**
     * The old cap was 45,000 chars "to stay safely inside Groq's Free Tier
     * limits". That reasoning no longer applies: at this size the request is
     * ~11k input tokens against Groq's 8,000/min budget, so the pre-flight
     * guard sends it to Gemini regardless. The cap was protecting a path that
     * cannot run, and charging real documents for it.
     *
     * Measured on gemini-2.5-flash with a simulated 25-page record:
     *
     *   45,000 chars (31% of it discarded)  ->  33.7s, 22,664-char analysis
     *   65,278 chars (the whole record)     ->  37.4s, 24,533-char analysis
     *
     * So the truncation was costing a third of the document to save 3.7s, and
     * the fuller input produced the better analysis. 120,000 chars is ~46
     * pages; Gemini's context is 1M tokens, so the real ceiling here is our
     * 60s per-attempt timeout, which had 22.6s spare at 25 pages.
     */
    const PROPOSITION_CHAR_CAP = Number(process.env.PROPOSITION_CHAR_CAP || 120000);
    const fullPropositionText = extractedText.slice(0, PROPOSITION_CHAR_CAP);

    /* ── The same document twice should not cost twice ──────────────────────
       This route spends a Gemini request from an allowance of roughly 20-50
       per model per day, and testing means uploading the same proposition
       over and over. The key includes a fingerprint of the prompts, so an
       edited prompt invalidates every entry on its own.

       ?fresh=1 forces a real run, for when you want to see the model roll the
       answer again rather than read the one it already gave. */
    const cacheKey = analysisCache.keyFor(fullPropositionText, [
      ANALYSIS_SYSTEM_PROMPT, LEGAL_VALIDATION_PROMPT, FORUM_DETECTION_PROMPT,
    ]);
    const wantsFresh = String(req.query.fresh || req.body.fresh || '') === '1';

    // ?probe=1 asks only whether this document is already analysed. It must
    // never start one: the whole point of checking what is ready before a
    // session is that checking is free.
    if (String(req.query.probe || '') === '1') {
      const hit = await analysisCache.get(cacheKey);
      return res.json({ success: true, probe: true, cached: !!hit,
        ageMs: hit ? hit.ageMs : null, chars: fullPropositionText.length });
    }

    if (!wantsFresh) {
      const hit = await analysisCache.get(cacheKey);
      if (hit) {
        const days = Math.round(hit.ageMs / 86400000);
        console.log('[CACHE] hit for this proposition (' +
          (days >= 1 ? days + 'd old' : Math.round(hit.ageMs / 60000) + 'm old') +
          ', seen ' + (hit.hits + 1) + ' times). No provider call made.');
        return res.json(Object.assign({ success: true, cached: true }, hit.payload));
      }
    }

    // Anything still over the cap is reported rather than dropped in silence.
    // A truncated analysis looks exactly as authoritative as a complete one,
    // so the user has to be told which one they are reading.
    const truncated = extractedText.length > PROPOSITION_CHAR_CAP
      ? {
          originalChars: extractedText.length,
          analysedChars: fullPropositionText.length,
          approxPagesDropped: Math.round((extractedText.length - PROPOSITION_CHAR_CAP) / 2600),
        }
      : null;
    if (truncated) {
      console.warn('[ANALYZE] Proposition truncated:', JSON.stringify(truncated));
    }

    /* ── PHASE 1 + PHASE 1.5 (run concurrently — mutually independent, both only need raw text) ──
       Legal Domain Validation and Forum Detection neither depend on nor feed each other,
       so they're fired together instead of paying two sequential round-trips. */
    let validationResult = { isLegal: true, confidence: 60, documentType: "Unknown" };
    let forumContext = null;

    const validationPromise = (async () => {
      try {
        const validationCall = await getChatCompletion({
          messages: [
            { role: "system", content: LEGAL_VALIDATION_PROMPT },
            { role: "user",   content: `Classify this document. Return ONLY valid JSON:\n\n${fullPropositionText.slice(0, 3000)}` }
          ],
          temperature: 0.05,
          max_tokens: 150,
          primaryProvider: "groq",
          groqTimeoutMs: 15000,
          geminiTimeoutMs: 30000,
          geminiMaxAttempts: 1,
          requestLabel: "Legal Domain Validation"
        });

        validationResult = extractAndParseJSON(validationCall.text);
      } catch (valErr) {
        console.error("Validation error (proceeding):", valErr.message);
        if (valErr.message.includes("Timeout")) {
          throw valErr; // Propagate timeout up to the main catch block
        }
      }
    })();

    /* Detect forum/jurisdiction/governing law BEFORE the main analysis so issues,
       arguments and authorities are generated under the correct law from the start.
       Fault-tolerant: on failure we proceed neutrally. */
    const forumPromise = (async () => {
      try {
        if (!FORUM_DETECTION_PROMPT) throw new Error("Forum detection prompt unavailable");
        const forumDetectCall = await getChatCompletion({
          messages: [
            { role: "system", content: FORUM_DETECTION_PROMPT },
            { role: "user", content: `Detect the forum for this proposition. Return ONLY valid JSON:\n\n${fullPropositionText.slice(0, 4000)}` }
          ],
          temperature: 0.0,
          // 350 was sized for the old four-field schema. The classifier now also
          // returns courtLevel, proceedingType, state and isConstitutionalMatter,
          // and a criminal matter measured 699 completion tokens — at 350 it
          // truncated mid-JSON and failed validation outright. 1200 leaves room.
          max_tokens: 1200,
          primaryProvider: "groq",
          groqTimeoutMs: 15000,
          geminiTimeoutMs: 30000,
          geminiMaxAttempts: 1,
          requestLabel: "Forum Detection (P0)"
        });
        forumContext = extractAndParseJSON(forumDetectCall.text);
        console.log("[FORUM P0] Detected:", forumContext && forumContext.forum, "|", forumContext && forumContext.jurisdiction);
      } catch (forumErr) {
        console.error("Forum pre-detection skipped/failed (proceeding neutral):", forumErr.message);
      }
    })();

    await Promise.all([validationPromise, forumPromise]);

    if (validationResult.isLegal === false && validationResult.confidence >= 75) {
      return res.status(422).json({
        success: false,
        isRejection: true,
        documentType: validationResult.documentType || "Non-legal document",
        error: `This document does not appear to be a legal proposition. Detected: "${validationResult.documentType}".`
      });
    }

    const forumDirective = (forumContext && forumContext.forum)
      ? `\nDETECTED FORUM CONTEXT (AUTHORITATIVE — this overrides any default jurisdiction assumption):\n` +
        `- Forum: ${forumContext.forum}\n` +
        `- Court level: ${forumContext.courtLevel || 'Unspecified'}\n` +
        `- Proceeding type: ${forumContext.proceedingType || 'Unspecified'}\n` +
        `- Jurisdiction: ${forumContext.jurisdiction || 'Unspecified'}\n` +
        `- State: ${forumContext.state || 'Unspecified'}\n` +
        `- Governing Law: ${forumContext.governingLaw || 'Unspecified'}\n` +
        `- Adjudicator: ${forumContext.adjudicatorType || 'Unspecified'}\n` +
        `- Constitutional matter: ${forumContext.isConstitutionalMatter === true ? 'YES' : 'NO'}\n` +
        `- Party labels: ${(forumContext.terminology && forumContext.terminology.parties) || 'Unspecified'}\n` +
        `You MUST conduct the entire analysis under THIS forum, level and jurisdiction. Identify issues, frame arguments, and (critically) cite ONLY case law and authorities appropriate to it. Do NOT default to Indian constitutional law unless the detected jurisdiction is India AND the matter is genuinely constitutional. A trial-court civil suit is governed by the CPC and the relevant substantive Act — not by Article 14/19/21 or writ doctrine. Use this forum's own terminology and party labels throughout.\n` +
        // Grounds an Indian matter in the law that actually governs it, and keeps
        // constitutional doctrine out of ordinary civil and criminal work. Returns
        // '' for non-Indian matters, so nothing Indian leaks into an English or
        // arbitral case.
        `${buildIndianLegalDirective(forumContext)}\n`
      : '';

    /* ── PHASE 2 + start of PHASE 5 (run concurrently — mutually independent) ──
       Full Legal Analysis only needs forumDirective + raw text; Proposition
       Intelligence needs the same inputs, not each other's output.

       The enrichment chain deliberately does NOT start here. Running it
       concurrently was tried and reverted: the extra in-flight calls on the
       same provider keys slowed the critical path enough to tip Full Legal
       Analysis past its timeout and 504 the entire request. Roughly 20s of
       overlap is not worth failing the upload. */
    let propIntelError = null;

    const [analysisOutcome, rawPropIntel] = await Promise.all([
      getChatCompletion({
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze this legal proposition. Return ONLY a valid JSON object. No markdown:${forumDirective}\n\n${fullPropositionText}`
          }
        ],
        temperature: 0.1,
        // Output for this call is genuinely large — measured at 5,240 tokens
        // (20,960 chars) on a short proposition. Cutting the reservation to
        // 2,200 made Groq truncate mid-JSON and fail with
        // json_validate_failed, so it must stay generous. Note max_tokens is
        // only enforced by Groq; the Gemini path does not pass it.
        max_tokens: 6000,
        // Gemini-primary, and measurement says it has to stay that way.
        //
        // Groq was tried as primary and does not hold up. At the max_tokens the
        // output genuinely needs (5,396 measured) the request is 9,248 tokens
        // against an 8,000/min cap, and Groq rejects it with a 413 even on an
        // idle window. Lowered to a max_tokens that does fit, gpt-oss-120b
        // returns valid JSON with 3 of the 21 schema keys — a complete-looking
        // but hollow analysis, which is worse than a clear failure.
        //
        // There is deliberately no Groq fallback tuning here. To fit Groq's
        // budget the reservation would have to drop to ~4,000 tokens, and at
        // that size the model returns the hollow 3-key object described above.
        // The client renders whatever comes back, so a hollow analysis would
        // look like a broken results page. When Gemini's quota is spent the
        // route returns an explicit 429 saying so, which is more useful.
        primaryProvider: "gemini",
        groqMaxAttempts: 1,
        groqTimeoutMs: 30000,
        // Two attempts, because Gemini 503s are transient and were observed on
        // production: the first upload of the day failed on "high demand" and
        // the identical retry succeeded in 38s. One attempt turned a blip into
        // a dead upload. Timeout trimmed 75s -> 60s so two attempts still fit
        // well inside server.requestTimeout (180s); Gemini measures ~37s, so
        // 60s keeps ~60% headroom.
        // 70s, not 60s: a run measured live took ~57s for the Gemini call
        // alone, which left almost nothing in hand. Two attempts at 70s plus
        // backoff and Phase 1 still land near 155s, inside the 180s
        // server.requestTimeout.
        // ONE long attempt, not two short ones.
        //
        // 70s x 2 failed in live user testing on a large proposition: input
        // ~10,983 tokens (~44k chars), both attempts hit "Gemini Timeout", and
        // Groq cannot take a request that size so the upload died. The 70s came
        // from a ~57s measurement on a SHORT proposition; a full-length one on
        // Render's free tier needs far more than that.
        //
        // Two attempts can never both fit anyway: 2 x 70s is 140s, and anything
        // longer breaks the 180s server.requestTimeout. So spend the budget on
        // one attempt that can actually finish. 150s + Phase 1 (~15s) = ~165s.
        geminiTimeoutMs: 150000,
        geminiMaxAttempts: 1,
        // One model may take the full 150s; the CHAIN may not take six times
        // that. Measured on production, two uploads reached 174s because a
        // model refused and the fallthrough landed on a slow one. 135s leaves
        // the Groq fallback behind it and Phase 1 ahead of it inside the 180s
        // request ceiling, so a bad run ends in a clear 504 rather than the
        // socket being cut with nothing to show.
        totalBudgetMs: 135000,
        geminiMaxOutputTokens: 16000,
      requestLabel: "Full Legal Analysis"
      })
        // Captured rather than thrown, so a failure here can be answered
        // instead of ending the upload. The original error is kept: if the
        // reduced analysis cannot run either, this is what the advocate is
        // told, because it is the real reason.
        .then(call => ({ ok: true, call }))
        .catch(err => ({ ok: false, err })),
      // Proposition Intelligence exists to feed the enrichment chain, and the
      // client only ever writes it to Firestore — no view reads it back. With
      // the chain off it is pure latency, and worse, it competes with Full
      // Legal Analysis for the same 8,000/min Groq window.
      ENRICH_BUDGET_MS > 0
        ? extractPropositionIntelligence(forumDirective ? `${forumDirective}\n\n${fullPropositionText}` : fullPropositionText)
            .catch(err => { propIntelError = err; return null; })
        : Promise.resolve(null)
    ]);

    /* ── PHASE 3: Parse, and if that is not possible, answer anyway ────────
       Everything above this point can fail for reasons that have nothing to
       do with the advocate's document: the day's Gemini requests are gone,
       the model is overloaded, the answer came back truncated. Until now any
       of those ended the upload, which is the worst possible moment for it -
       somebody is trying this for the first time.

       So a failure here drops to a reduced analysis that fits inside Groq,
       whose daily allowance is large enough to effectively always answer.
       It is smaller, and it says so. A shorter analysis that arrives beats a
       complete one that does not. */
    let analysisCall = analysisOutcome.ok ? analysisOutcome.call : null;
    let analysisData = null;
    let reduced = false;
    let failure = analysisOutcome.ok ? null : analysisOutcome.err;

    if (analysisCall) {
      try {
        analysisData = extractAndParseJSON(analysisCall.text);
      } catch (parseErr) {
        console.error("[ANALYSIS] Unparseable response, falling back. First 200 chars:",
          String(analysisCall.text || '').substring(0, 200));
        failure = parseErr;
        analysisCall = null;
      }
    }

    if (!analysisData) {
      console.warn('[ANALYSIS] Full analysis unavailable (' +
        String((failure && failure.message) || 'unknown').slice(0, 140) + '). Trying the reduced analysis.');
      try {
        analysisData = await runLiteAnalysis(fullPropositionText, forumDirective);
        reduced = true;
        // Carried inside the analysis itself, because that is the object the
        // client renders and saves. The advocate should be told their
        // analysis is the short one wherever they next look at it, including
        // when they reopen the saved session.
        analysisData._notice = 'This is a shorter analysis. The full one could not run just now, '
          + 'so MootCoach produced the core of it rather than leaving you with nothing. '
          + 'Upload the same proposition again later for the complete version.';
        console.log('[ANALYSIS] Reduced analysis served. The upload did not fail.');
      } catch (liteErr) {
        console.error('[ANALYSIS] The reduced analysis failed too:', liteErr && liteErr.message);
        // Both are gone. Report the ORIGINAL reason, not this one: the outer
        // handler knows how to explain a quota wall or an overload, and that
        // is what actually happened.
        throw failure || liteErr;
      }
    }

    /* ── PHASE 4: Additional-issue integrity guard ──
       Score normalisation used to live here. It is gone with the grading: the
       proposition is fixed by the competition, so rating its drafting gave the
       advocate nothing to act on.

       What replaces it matters more. "additionalIssues" are suggestions the
       advocate may take into a real bench, so the model is not trusted to
       police its own grounding — same reason the citation guard overrides the
       model's verify flag. An issue with no anchor in the record is exactly
       the kind that gets counsel shut down, so it is dropped here rather than
       shown with a caveat. */
    const normIssue = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/s+/g, " ").trim();
    const framed = (analysisData.legalIssues || []).map(normIssue).filter(Boolean);
    const framedTokens = framed.map(f => new Set(f.split(" ")));
    const CONFIDENCES = ["Safe", "Arguable", "Aggressive"];
    let droppedIssues = 0;

    analysisData.additionalIssues = (Array.isArray(analysisData.additionalIssues) ? analysisData.additionalIssues : [])
      .filter(a => a && typeof a === "object")
      // No anchor in the record, no suggestion. groundedIn is the whole
      // defence against suggesting an issue the facts cannot carry.
      .filter(a => {
        const ok = String(a.issue || "").trim().length > 12 && String(a.groundedIn || "").trim().length > 8;
        if (!ok) droppedIssues++;
        return ok;
      })
      // A rephrased framed issue is not an extra issue. Exact match after
      // normalising, plus heavy token overlap to catch the rewordings.
      .filter(a => {
        const n = normIssue(a.issue);
        if (framed.includes(n)) { droppedIssues++; return false; }
        const t = new Set(n.split(" "));
        const dup = framedTokens.some(f => {
          let shared = 0;
          t.forEach(w => { if (f.has(w)) shared++; });
          const union = new Set([...t, ...f]).size;
          return union > 0 && shared / union >= 0.72;
        });
        if (dup) droppedIssues++;
        return !dup;
      })
      // Drop duplicates among the suggestions themselves.
      .filter((a, i, arr) => arr.findIndex(b => normIssue(b.issue) === normIssue(a.issue)) === i)
      .map(a => ({
        ...a,
        // An unlabelled or invented risk level defaults to the honest middle,
        // never to "Safe" — the advocate is deciding whether to risk oral time.
        confidence: CONFIDENCES.find(c => c.toLowerCase() === String(a.confidence || "").trim().toLowerCase()) || "Arguable",
        favours: ["Petitioner", "Respondent", "Both"].find(f => f.toLowerCase() === String(a.favours || "").trim().toLowerCase()) || "Both"
      }));

    if (droppedIssues) {
      console.log(`[ANALYSIS] Dropped ${droppedIssues} suggested issue(s): ungrounded or a restatement of a framed issue.`);
    }

    /* ── PHASES 5-10: enrichment ──
       Runs after the core analysis so it never competes with it for provider
       capacity. Bounded by ENRICH_BUDGET_MS; every field is null-tolerant
       downstream, so a stage that does not fit is simply absent. */
    const {
      propositionIntelligence, proceduralHierarchy, forumIntelligence,
      issueIntelligence, authorityIntelligence, advocacyIntelligence
    } = await runEnrichment(rawPropIntel, propIntelError, forumContext);

    const payload = {
      isStructured: true,
      modelUsed: analysisCall ? analysisCall.model : 'reduced',
      reduced,
      reducedNotice: reduced
        ? 'This is a shorter analysis. The full one could not run just now, so MootCoach produced the core of it \u2014 the summary, the issues, and both sides\u2019 arguments \u2014 rather than leaving you with nothing. Upload again later for the complete version.'
        : null,
      documentType: validationResult.documentType,
      truncated,
      detectedForum: forumContext,
      response: analysisData,
      propositionIntelligence: propositionIntelligence,
      proceduralHierarchy: proceduralHierarchy,
      forumIntelligence: forumIntelligence,
      issueIntelligence: issueIntelligence,
      authorityIntelligence: authorityIntelligence,
      advocacyIntelligence: advocacyIntelligence
    };

    // Stored, not awaited: the advocate should not wait on a write that only
    // benefits the next upload. A failure here costs nothing but a cache miss.
    //
    // A reduced analysis is never stored. It exists because something was
    // temporarily wrong, and caching it would make a bad few minutes
    // permanent for that document - every later upload would be served the
    // short version even once the full one could run again.
    if (!reduced) analysisCache.put(cacheKey, payload, {
      documentType: validationResult.documentType,
      chars: fullPropositionText.length,
    }).catch(() => {});

    return res.json(Object.assign({ success: true, cached: false }, payload));

  } catch (error) {
    console.error("Analyze route error:", error);
    if (filePath) { try { fs.unlinkSync(filePath); } catch (e) {} }

    // Say what actually went wrong. A provider quota or rate limit is not a
    // transient glitch and "please try again" is actively misleading advice
    // for it — retrying makes it worse. These are distinguishable from the
    // provider error text, so distinguish them.
    const msg = String((error && error.message) || '');
    const quotaExhausted = /RESOURCE_EXHAUSTED|free_tier|quota|exceeded your current quota|PerDay/i.test(msg);
    const rateLimited = /rate.?limit|tokens per minute|TPM|\b429\b/i.test(msg);
    const isTimeout = /Timeout/i.test(msg);
    // Gemini 503: {"code":503,"message":"This model is currently experiencing
    // high demand...","status":"UNAVAILABLE"}. Carries no quota or rate-limit
    // wording, so without this it reads as a generic failure — and unlike a
    // quota wall, retrying genuinely does work.
    const overloaded = /UNAVAILABLE|\b503\b|high demand|overloaded/i.test(msg);

    let status = 500;
    let userError = "Analysis failed. Please try again. If the problem persists, the AI service may be temporarily unavailable.";

    if (quotaExhausted) {
      status = 429;
      userError = "The AI provider's daily quota has been used up, so the analysis could not run. "
        + "This is an account limit, not a problem with your document — retrying now will fail the same way. "
        + "It resets on the provider's daily cycle.";
    } else if (rateLimited) {
      status = 429;
      userError = "The AI provider is rate-limiting this account right now. "
        + "Wait about a minute and upload again — this is a per-minute cap, not a problem with your document.";
    } else if (isTimeout) {
      status = 504;
      userError = "The AI provider did not respond in time. This is usually temporary — please try again.";
    } else if (overloaded) {
      status = 503;
      userError = "The AI provider is briefly overloaded and turned the request away. "
        + "Nothing is wrong with your document — wait a few seconds and upload again.";
    }

    return res.status(status).json({ success: false, error: userError, reason: msg.slice(0, 400) });
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
      // Was inheriting the defaults: 3 attempts x 90s = 270s against a 180s
      // server.requestTimeout, so a slow first attempt could never recover —
      // the request died before the retries finished. Same trap that broke
      // upload on a large proposition. One attempt that fits the budget.
      primaryProvider: "gemini",
      geminiTimeoutMs: 120000,
      geminiMaxAttempts: 1,
      totalBudgetMs: 120000,
      geminiMaxOutputTokens: 6000,
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

/* ─── /simulate-bench/oral-review ───
   The spoken round had no report at all. It ended, said "Oral round saved to
   account", and left the advocate with nothing to work from — which is the one
   thing a practice round exists to produce.

   Separate from /simulate-bench because that route ends a session on a turn
   count; a live round ends when the advocate stops talking, and the transcript
   arrives in one piece at the end rather than a turn at a time. */
app.post("/simulate-bench/oral-review", express.json(), async (req, res) => {
  const { transcript, propositionSummary, difficulty, intensity, claimLedger, durationSeconds } = req.body;

  const turns = (Array.isArray(transcript) ? transcript : [])
    .filter(t => t && typeof t.content === 'string' && t.content.trim())
    .map(t => ({ role: t.role === 'judge' ? 'judge' : 'advocate', content: t.content.trim() }));

  const advocateTurns = turns.filter(t => t.role === 'advocate');
  const spoken = advocateTurns.reduce((n, t) => n + t.content.length, 0);

  // Below this there is nothing to mark, and a confident-looking scorecard off
  // two sentences would be worse than saying so.
  if (advocateTurns.length < 2 || spoken < 200) {
    return res.status(422).json({
      success: false,
      tooShort: true,
      error: "That round was too short to mark. Argue for a few exchanges and the bench will have something to assess."
    });
  }

  const level = ['easy', 'moderate', 'hard'].includes(intensity) ? intensity
    : (['easy', 'moderate', 'hard'].includes(difficulty) ? difficulty : 'moderate');

  try {
    const prompt = buildEvaluationPrompt(
      level,
      propositionSummary || '',
      turns,
      Array.isArray(claimLedger) ? claimLedger : [],
      { mode: 'oral', durationSeconds: Number(durationSeconds) || 0 }
    );

    const call = await getChatCompletion({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 2500,
      // Same reasoning as the text bench review: it fits Groq comfortably and
      // should not spend one of the scarce daily Gemini requests.
      primaryProvider: "groq",
      groqTimeoutMs: 40000,
      geminiTimeoutMs: 45000,
      geminiMaxAttempts: 1,
      totalBudgetMs: 45000,
      requestLabel: "Oral Round Review"
    });

    const review = normaliseScorecard(extractAndParseJSON(call.text));
    return res.json({ success: true, performanceReview: review });
  } catch (err) {
    console.error("/simulate-bench/oral-review error:", err);
    const msg = String((err && err.message) || '');
    const isTimeout = /Timeout/i.test(msg);
    return res.status(isTimeout ? 504 : 500).json({
      success: false,
      error: isTimeout
        ? "The review did not come back in time. Your transcript is still on screen — try again."
        : "Could not produce a report for that round."
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
      // Fire-and-forget from the bench, but it was inheriting 3 x 90s. A small
      // extraction does not need 270s, and holding a slot that long competes
      // with the bench turn the advocate is waiting on.
      primaryProvider: "groq",
      groqTimeoutMs: 20000,
      geminiTimeoutMs: 40000,
      geminiMaxAttempts: 1,
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
/**
 * Make the scorecard add up, and keep it inside its own bounds.
 *
 * The model is asked for an overallScore equal to the sum of the five
 * criteria. It will not always oblige, and a report whose parts do not add to
 * its total is the fastest way to lose an advocate's trust in the mark. The
 * arithmetic is done here rather than hoped for.
 */
const SCORE_MAXES = {
  knowledgeOfLaw: 25, applicationToFacts: 25, responseToQuestions: 25,
  courtCraft: 15, structureAndTime: 10,
};

function normaliseScorecard(review) {
  if (!review || typeof review !== 'object') return review;
  const card = review.scorecard;
  if (!card || typeof card !== 'object') return review;

  let sum = 0, counted = 0;
  Object.keys(SCORE_MAXES).forEach(k => {
    const max = SCORE_MAXES[k];
    const row = card[k];
    if (!row || typeof row !== 'object') { delete card[k]; return; }
    // Clamp into range: a model that returns 30/25 is reporting a number the
    // advocate cannot compare against anything.
    const n = Math.round(Number(row.score));
    row.score = Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
    row.max = max;
    sum += row.score;
    counted++;
  });

  if (!counted) { delete review.scorecard; return review; }

  const claimed = Math.round(Number(review.overallScore));
  if (!Number.isFinite(claimed) || claimed !== sum) {
    if (Number.isFinite(claimed)) {
      console.log(`[BENCH REVIEW] overallScore was ${claimed}, criteria sum to ${sum}. Using the sum.`);
    }
    review.overallScore = sum;
  }
  return review;
}

app.post("/simulate-bench", express.json(), async (req, res) => {
  const { conversationHistory, propositionSummary, difficulty, intensity, judgeType, studentStatement, claimLedger } = req.body;

  if (!studentStatement || studentStatement.trim().length < 3) {
    return res.status(400).json({ success: false, error: "Statement required." });
  }

  // `intensity` is the new name for the same easy/moderate/hard scale
  // (matches the "Constitution of the Bench" intensity selector); `difficulty`
  // stays supported for old clients. Either can set the level.
  const validDifficulty = ['easy','moderate','hard'].includes(intensity)
    ? intensity
    : (['easy','moderate','hard'].includes(difficulty) ? difficulty : 'moderate');
  const history = conversationHistory || [];

  // Backend-authoritative judge persona + intensity layer — opt-in. Only
  // engages when the client sends `judgeType` and/or `intensity`; a client
  // that only ever sent `difficulty` (the existing frontend) gets an
  // identical propositionSummary to before, so nothing about its behavior
  // changes. When engaged, this directive is prepended ahead of whatever
  // forum/judge/depth directives the client already embedded in
  // propositionSummary — the prompt builders already read every bracketed
  // directive in that string, so the two layers simply stack.
  const judgeDirective = (judgeType || intensity) ? buildJudgeDirective(judgeType, validDifficulty) : '';

  // Ground an Indian bench in the law that actually governs the matter. The
  // client embeds [Forum: ...] style directives in propositionSummary; forumHint
  // lets it also say which level/proceeding/state, so a civil judge asks about
  // the CPC and the Specific Relief Act rather than about Article 19.
  const indianDirective = buildIndianLegalDirective(req.body.forumHint || null);

  const contextualPropositionSummary = [judgeDirective, indianDirective, propositionSummary || '']
    .filter(Boolean).join('\n\n');
  
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
      const evalPrompt = buildEvaluationPrompt(validDifficulty, contextualPropositionSummary, conversationHistoryWithNewTurn, claimLedger);
      const evalCall = await getChatCompletion({
        messages: [{ role: "user", content: evalPrompt }],
        temperature: 0.2,
        // Same reasoning-token headroom as the per-turn call.
        max_tokens: 2500,
        // Same reasoning as the per-turn call: small enough for Groq, and it
        // should not cost a scarce Gemini request.
        primaryProvider: "groq",
        groqTimeoutMs: 40000,
        geminiTimeoutMs: 45000,
        geminiMaxAttempts: 1,
        requestLabel: "Bench Simulation Performance Review"
      });

      const reviewData = normaliseScorecard(extractAndParseJSON(evalCall.text));

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

  // Feed back what the bench has already asked. Without this the model had no
  // record of its own questions beyond the raw transcript, and would circle the
  // same point indefinitely — the failure a practising advocate hit in a live
  // session. `targetWeakness` was already being returned every turn and thrown
  // away; the client now echoes it back in the history.
  const askedQuestions = history
    .filter(t => t.role === 'judge')
    .map(t => t.content)
    .filter(Boolean);
  const coveredWeaknesses = history
    .filter(t => t.role === 'judge')
    .map(t => t.targetWeakness)
    .filter(Boolean);

  const judgeSystemPrompt = buildJudgePrompt(
    validDifficulty, contextualPropositionSummary, claimLedger,
    askedQuestions, coveredWeaknesses
  );
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
      // 250 was enough when the system prompt was small, but gpt-oss-120b is a
      // reasoning model and its reasoning tokens count against max_tokens. With
      // the Indian framework in the prompt, 250 was consumed before any JSON was
      // emitted, and Groq returned json_validate_failed with an empty generation.
      // The visible answer is still capped at 80 words by the prompt itself.
      max_tokens: 1200,
      // Groq-primary. This call is ~3.4k tokens against an 8,000/min budget, so
      // it fits easily, and the bench is interactive — Groq answers in ~1s where
      // Gemini takes far longer. It also stops the simulator eating the daily
      // Gemini allowance: a 5-turn session was spending 5 of the 20 free
      // requests per day, so four sessions exhausted the whole product.
      primaryProvider: "groq",
      groqTimeoutMs: 30000,
      geminiTimeoutMs: 45000,
      geminiMaxAttempts: 1,
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

/* ─── /api/judge-profiles — metadata for the "Constitution of the Bench" ──
   selector (the 10 judge personas + 3 intensity levels). Returns display
   metadata only (id/code/name/label/archetype/temperament/focus) — the
   prompt-engineering `directive` text stays server-side. Send the chosen
   `id` back as `judgeType` (and the intensity `id` as `intensity`) to
   /simulate-bench or the /ws/voice query string to activate it. ─── */
app.get("/api/judge-profiles", (req, res) => {
  res.json({
    success: true,
    judges: listJudgeProfiles(),
    intensities: listIntensityProfiles()
  });
});

/* ─── /api/build-argument ─── */
app.post("/api/build-argument", aiLimiter, express.json(), async (req, res) => {
  const { stance, issue, notes, propositionContext, forum, instructions, authorities, memorialFocus } = req.body;

  /**
   * The "Generate Structured Draft" button uses only the memorial and discards the
   * oral-advocacy, rebuttal and citation blocks — but those were taking 56% of the
   * output on a measured request, which is why memorials came back at eleven
   * numbered paragraphs when a filed one runs to sixty-five. Adding depth targets
   * to the prompt barely moved it, because the budget is shared. This hands the
   * whole budget to the memorial for that caller only; the main Build button sends
   * no flag and still gets the full package.
   */
  const focusLine = memorialFocus
    ? '\nMEMORIAL FOCUS: this caller renders ONLY the memorial. Spend the entire output budget '
      + 'on it and meet the depth in rule 7d. Emit the other blocks minimally so the response '
      + 'shape is unchanged, but do not develop them.\n'
    : '';

  /**
   * The advocate's drafting instructions used to be concatenated into `notes` and
   * handed over under the heading "RAW NOTES & AUTHORITIES PROVIDED", so a request
   * like "put an index of authorities at the start" read as material to summarise
   * rather than a direction to follow — and was ignored. They are now a separate,
   * explicitly binding block.
   */
  const instructionBlock = (instructions && String(instructions).trim())
    ? `\nADVOCATE'S DRAFTING INSTRUCTIONS (BINDING — these are directives, not material to summarise.
Follow them. Keep the fixed section order; everything else bends to what is asked here.
If any instruction cannot be carried out, do the part you can and record the rest in
memorial.instructionsNotFollowed):
${String(instructions).trim().slice(0, 4000)}\n`
    : '';

  // Authorities the advocate picked in the Authority Armory. These are THEIR chosen
  // cases and must appear in the memorial, marked source:"advocate".
  const authorityBlock = (Array.isArray(authorities) && authorities.length)
    ? `\nAUTHORITIES SELECTED BY THE ADVOCATE (must be used and marked source:"advocate"):\n` +
      authorities.slice(0, 40).map(a =>
        `- ${a.name || a.case || 'Unnamed'}${a.citation ? ', ' + a.citation : ''}${a.ratio ? ' — ' + String(a.ratio).slice(0, 300) : ''}`
      ).join('\n') + '\n'
    : '';

  // Optional forum directive so the builder adapts law + terminology to the
  // actual forum instead of defaulting to Indian constitutional doctrine.
  const forumLine = (forum && (forum.forum || forum.benchType || forum.broadType))
    ? `\nFORUM CONTEXT (authoritative): ${forum.forum || forum.benchType || forum.broadType}` +
      `${forum.jurisdiction ? ' | Jurisdiction: ' + forum.jurisdiction : ''}` +
      `${forum.governingLaw ? ' | Governing law: ' + forum.governingLaw : ''}` +
      `\nUse ONLY authorities and terminology appropriate to this forum. If it is not Indian constitutional law, do NOT use the Indian constitutional registry.\n`
    : '';

  if (!stance || !issue || !notes || notes.trim().length < 5) {
    return res.status(400).json({ success: false, error: "Please provide stance, issue, and notes." });
  }

  // Grounding validation check
  if (!propositionContext || propositionContext.trim().length < 20 || propositionContext.toLowerCase().includes("not set") || propositionContext.toLowerCase().includes("no file uploaded")) {
    return res.status(400).json({ success: false, error: "Insufficient factual material detected" });
  }

  try {
    const callBuilder = (timeoutMs) => getChatCompletion({
      messages: [
        {
          role: "system",
          content: ARGUMENT_BUILDER_PROMPT
        },
        {
          role: "user",
          content: `PROPOSITION FACTS / CONTEXT:
${propositionContext.trim()}
${forumLine}${focusLine}${instructionBlock}${authorityBlock}
STANCE / SIDE: ${stance}
ISSUE SELECTED: ${issue}
RAW NOTES & AUTHORITIES PROVIDED: ${notes.trim()}

Generate the full side-aware appellate package strictly based on the proposition facts.
The memorial must carry every section in the fixed order, beginning with the Index of
Authorities. Cite nothing you cannot stand behind: mark anything uncertain with
"verify": true rather than inventing a reporter reference.`
        }
      ],
      temperature: 0.3,
      // The memorial carries a cover page, List of Abbreviations, an Index of
      // Authorities in nine groups, Jurisdiction, Facts, Issues, Summary,
      // Arguments Advanced in numbered paragraphs with footnotes, and a Prayer —
      // on top of the oral-advocacy and citations blocks. 4,000 truncated it
      // mid-JSON; 9,000 did so again once numbered paragraphs and footnotes
      // arrived, since a real memorial runs to 30 pages.
      max_tokens: 14000,
      // Gemini-primary: the request is well past Groq's 8,000/min budget, so the
      // pre-flight guard would skip it anyway.
      primaryProvider: "gemini",
      // One attempt per call; whether to make a second is decided below, because
      // the two failure modes cost very different shares of the 180s budget.
      //
      // Two attempts at 90s is 180s against a 180s server.requestTimeout, so the
      // retry could never finish — production returned 504 after 181.9s. The
      // generation is also slow and variable: 45s, 59s and 81s measured locally on
      // the same input, and slower on Render, because the schema carries the
      // memorial plus the oral-advocacy and citations blocks in one response.
      geminiTimeoutMs: timeoutMs,
      geminiMaxAttempts: 1,
      // This route already decides whether a second call fits; the chain
      // inside each call must respect the same figure rather than spending it
      // six times over.
      totalBudgetMs: timeoutMs,
      geminiMaxOutputTokens: 24000,
      requestLabel: "Build Side-Aware Argument Package"
    });

    /**
     * Retry a provider overload, but never a timeout.
     *
     * Measured on production: a Gemini 503 surfaces in 33-40s, and two landed back
     * to back, so this is not the rare blip an earlier version of this comment
     * claimed — it said "about a second", which was simply wrong. The user was
     * waiting 40s for a failure and then clicking Generate again by hand.
     *
     * A fast failure leaves room for another go: 40s + 100s is 140s, inside the
     * 180s budget. A timeout does not, because it has already spent that budget,
     * so it is surfaced rather than retried.
     */
    let responseCall;
    const startedAt = Date.now();
    try {
      responseCall = await callBuilder(150000);
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      const overloaded = /UNAVAILABLE|\b503\b|high demand|overloaded/i.test(String((err && err.message) || ''));
      if (!overloaded || elapsed > 60000) throw err;
      console.warn(`[MEMORIAL] Provider overloaded after ${elapsed}ms; one more attempt inside the remaining budget.`);
      await new Promise(r => setTimeout(r, 2000));
      responseCall = await callBuilder(100000);
    }

    const data = extractAndParseJSON(responseCall.text, false);

    // Shared with /api/build-memorial. See services/citationGuard.js for why the
    // model's own verify flag is not trusted.
    applyCitationGuard(data && data.memorial && data.memorial.indexOfAuthorities, authorities);

    return res.json({ success: true, response: data });
  } catch (error) {
    console.error("/api/build-argument error:", error);
    // Same classification the upload route uses. A transient provider 503 was
    // surfacing here as a flat "Failed to build argument", which reads like the
    // draft was rejected rather than like something worth retrying in a moment.
    const msg = String((error && error.message) || '');
    const quotaExhausted = /RESOURCE_EXHAUSTED|free_tier|quota|exceeded your current quota|PerDay/i.test(msg);
    const rateLimited = /rate.?limit|tokens per minute|\bTPM\b|\b429\b/i.test(msg);
    const isTimeout = /Timeout/i.test(msg);
    const overloaded = /UNAVAILABLE|\b503\b|high demand|overloaded/i.test(msg);

    let status = 500;
    let userError = "Failed to build argument. Please try again.";
    if (quotaExhausted) {
      status = 429;
      userError = "The AI provider's daily quota has been used up, so the memorial could not be drafted. "
        + "This is an account limit, not a problem with your notes — it resets on the provider's daily cycle.";
    } else if (rateLimited) {
      status = 429;
      userError = "The AI provider is rate-limiting this account. Wait about a minute and try again.";
    } else if (isTimeout) {
      status = 504;
      userError = "The AI provider did not respond in time. This is usually temporary — please try again.";
    } else if (overloaded) {
      status = 503;
      userError = "The AI provider is briefly overloaded and turned the request away. "
        + "Nothing is wrong with your notes — wait a few seconds and generate again.";
    }
    return res.status(status).json({ success: false, error: userError, reason: msg.slice(0, 400) });
  }
});

/* ─── /api/build-memorial ───
   Builds a competition-length memorial in passes: one call fixes the structure,
   one call per issue argues it out, then services/memorialBuilder stitches them
   together. /api/build-argument stays as it is, because the oral-advocacy,
   rebuttal and citation panels still read its combined response. */
app.post("/api/build-memorial", aiLimiter, express.json(), async (req, res) => {
  const { stance, propositionContext, notes, instructions, authorities, forum, maxIssues, depth } = req.body;

  if (!stance) {
    return res.status(400).json({ success: false, error: "Pick a side first." });
  }
  if (!propositionContext || propositionContext.trim().length < 20 ||
      /not set|no file uploaded/i.test(propositionContext)) {
    return res.status(400).json({ success: false, error: "Upload and analyse a proposition first — a memorial has to be drafted from the record." });
  }

  const forumLine = (forum && (forum.forum || forum.benchType || forum.broadType))
    ? `\nFORUM CONTEXT (authoritative): ${forum.forum || forum.benchType || forum.broadType}`
      + `${forum.jurisdiction ? ' | Jurisdiction: ' + forum.jurisdiction : ''}`
      + `${forum.governingLaw ? ' | Governing law: ' + forum.governingLaw : ''}`
      + `\nUse ONLY authorities and terminology appropriate to this forum.\n`
    : '';

  try {
    const started = Date.now();
    const { memorial, stats } = await buildMemorial({
      stance,
      propositionContext,
      notes: notes || '',
      instructions: instructions || '',
      authorities: Array.isArray(authorities) ? authorities : [],
      forumLine,
      indianDirective: buildIndianLegalDirective(forum || null),
      maxIssues: Math.min(Math.max(Number(maxIssues) || 3, 1), 5),
      // 'standard' = one call per issue (~100s). 'full' = one per sub-ground,
      // which roughly doubles the body but takes several minutes.
      depth: depth === 'full' ? 'full' : 'standard',
      onProgress: p => console.log('[MEMORIAL] ' + JSON.stringify(p)),
    });

    applyCitationGuard(memorial.indexOfAuthorities, authorities);

    stats.seconds = Math.round((Date.now() - started) / 1000);
    console.log('[MEMORIAL] built: ' + JSON.stringify(stats));
    return res.json({ success: true, memorial, stats });
  } catch (error) {
    console.error("/api/build-memorial error:", error);
    const msg = String((error && error.message) || '');
    const quota = /RESOURCE_EXHAUSTED|free_tier|quota|exceeded your current quota|PerDay/i.test(msg);
    const rate = /rate.?limit|tokens per minute|\bTPM\b|\b429\b/i.test(msg);
    const timeout = /Timeout/i.test(msg);
    const overloaded = /UNAVAILABLE|\b503\b|high demand|overloaded/i.test(msg);

    let status = 500;
    let userError = "The memorial could not be drafted. Please try again.";
    if (quota) {
      status = 429;
      userError = "The AI provider's daily quota has been used up. This is an account limit, not a problem with your notes — it resets on the provider's daily cycle.";
    } else if (rate) {
      status = 429;
      userError = "The AI provider is rate-limiting this account. Wait about a minute and try again.";
    } else if (timeout) {
      status = 504;
      userError = "The provider did not respond in time. A full memorial takes several passes — please try again.";
    } else if (overloaded) {
      status = 503;
      userError = "The AI provider is briefly overloaded. Nothing is wrong with your notes — wait a few seconds and draft again.";
    }
    return res.status(status).json({ success: false, error: userError, reason: msg.slice(0, 400) });
  }
});

/* ─── /api/analyse-memorial ───
   Upload a memorial, get it marked. The structural half runs in code
   (services/memorialAudit.js) because sections, index-vs-body consistency,
   numbering and limits are countable; asking a model to count them gets an
   estimate. The model is spent on what code cannot judge — whether the argument
   works and whether the law is right. */
app.post("/api/analyse-memorial", aiLimiter, upload.single("file"), async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No memorial uploaded." });
    }
    filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);

    let parsed = null;
    try {
      parsed = await parsePdfAsync(dataBuffer);
    } catch (err) {
      console.error("Memorial PDF parse error:", err);
    }
    try { fs.unlinkSync(filePath); filePath = null; } catch (e) {}

    const text = String(parsed || "");
    if (text.trim().length < 400) {
      return res.status(422).json({
        success: false,
        error: "That PDF appears to be empty, image-based or unreadable. Export your memorial as a text-based PDF rather than a scan."
      });
    }

    // ── Structural audit, in code ──
    const audit = auditMemorial(text, {
      pageCount: (parsed && parsed.numpages) || null,
      wordLimit: Number(req.body.wordLimit) || null,
      pageLimit: Number(req.body.pageLimit) || null,
      side: req.body.side || '',
    });

    // ── Content review, by the model ──
    const auditSummary =
      `STRUCTURAL AUDIT (measured in code — these are facts):\n` +
      `- Words: ${audit.metrics.words}${audit.metrics.pages ? `, pages: ${audit.metrics.pages}` : ''}\n` +
      `- Sections present: ${audit.metrics.sectionsPresent}/${audit.metrics.sectionsExpected}` +
      ` (missing: ${audit.sections.filter(s => !s.present).map(s => s.label).join(', ') || 'none'})\n` +
      `- Cases in the Index: ${audit.metrics.indexCases}; cases cited in the body: ${audit.metrics.bodyCases}\n` +
      `- Listed but never cited: ${audit.metrics.authoritiesNotCited}; cited but not indexed: ${audit.metrics.authoritiesNotIndexed}\n` +
      `- Numbered paragraphs: ${audit.metrics.numberedParagraphs}` +
      ` (continuous: ${audit.metrics.numbering.continuous ? 'yes' : 'no'})\n` +
      `- Structural findings already reported to the advocate:\n` +
      (audit.findings.map(f => `   [${f.severity}] ${f.area}: ${f.finding}`).join('\n') || '   none') +
      `\nDo not repeat these. Assess the substance.\n`;

    const call = await getChatCompletion({
      messages: [
        { role: "system", content: MEMORIAL_REVIEW_PROMPT },
        {
          role: "user",
          content: `${auditSummary}\n` +
            (req.body.side ? `SIDE: ${req.body.side}\n` : '') +
            (req.body.propositionContext ? `THE RECORD (use this to check whether facts are invented):\n${String(req.body.propositionContext).slice(0, 8000)}\n\n` : '') +
            `MEMORIAL TEXT:\n${text.slice(0, 90000)}\n\nMark this memorial now.`
        }
      ],
      temperature: 0.2,
      max_tokens: 9000,
      primaryProvider: "gemini",
      geminiTimeoutMs: 120000,
      geminiMaxAttempts: 1,
      totalBudgetMs: 120000,
      geminiMaxOutputTokens: 16000,
      requestLabel: "Memorial Review"
    });

    const review = extractAndParseJSON(call.text);

    // The audit's findings are measured, so they lead. The model's follow.
    const corrections = [].concat(
      audit.findings.map(f => ({ severity: f.severity, area: f.area, where: '', problem: f.finding, fix: f.fix, source: 'audit' })),
      (Array.isArray(review.corrections) ? review.corrections : []).map(c => Object.assign({ source: 'review' }, c)),
    );

    return res.json({
      success: true,
      metrics: audit.metrics,
      sections: audit.sections,
      review: Object.assign({}, review, { corrections }),
    });
  } catch (error) {
    console.error("/api/analyse-memorial error:", error);
    try { if (filePath) fs.unlinkSync(filePath); } catch (e) {}
    const msg = String((error && error.message) || '');
    const quota = /RESOURCE_EXHAUSTED|free_tier|quota|exceeded your current quota|PerDay/i.test(msg);
    const rate = /rate.?limit|tokens per minute|\bTPM\b|\b429\b/i.test(msg);
    const timeout = /Timeout/i.test(msg);
    const overloaded = /UNAVAILABLE|\b503\b|high demand|overloaded/i.test(msg);
    let status = 500;
    let userError = "The memorial could not be analysed. Please try again.";
    if (quota) { status = 429; userError = "The AI provider's daily quota has been used up. This is an account limit, not a problem with your memorial — it resets on the provider's daily cycle."; }
    else if (rate) { status = 429; userError = "The AI provider is rate-limiting this account. Wait about a minute and try again."; }
    else if (timeout) { status = 504; userError = "The provider did not respond in time. Please try again."; }
    else if (overloaded) { status = 503; userError = "The AI provider is briefly overloaded. Wait a few seconds and try again."; }
    return res.status(status).json({ success: false, error: userError, reason: msg.slice(0, 400) });
  }
});

/* ─── /api/log-session (Secure Backend Logging) ─── */
app.post("/api/log-session", aiLimiter, express.json(), async (req, res) => {
  const { type, mootName, fileName, score, analysisData, durationSeconds, detectedForum, propositionIntelligence, proceduralHierarchy, forumIntelligence, issueIntelligence, authorityIntelligence, advocacyIntelligence } = req.body;

  if (admin.apps.length === 0) {
    console.error("❌ Firebase Admin has not been initialized. Check FIREBASE_SERVICE_ACCOUNT env var.");
    return res.status(503).json({ success: false, error: "Database service is unconfigured." });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ success: false, error: "Missing Authorization bearer token." });
  }

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (authErr) {
    console.error("Failed to verify ID token:", authErr);
    return res.status(401).json({ success: false, error: "Invalid or expired auth token." });
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
        analysisData: analysisData || {},
        detectedForum: detectedForum || null
      });

      if (propositionIntelligence || proceduralHierarchy || forumIntelligence || issueIntelligence || authorityIntelligence || advocacyIntelligence) {
        try {
          await userDocRef.collection('propositions').doc(result.id).set({
            mootName: mootName || 'Untitled Moot',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            intelligence: propositionIntelligence || null,
            proceduralHierarchy: proceduralHierarchy || null,
            forumIntelligence: forumIntelligence || null,
            issueIntelligence: issueIntelligence || null,
            authorityIntelligence: authorityIntelligence || null,
            advocacyIntelligence: advocacyIntelligence || null
          });
          console.log("🔥 Proposition, Hierarchy, Forum, Issue, Authority, and Advocacy Intelligence saved to Firestore under ID:", result.id);
        } catch (propErr) {
          console.error("Failed to save proposition intelligence to Firestore:", propErr);
        }
      }
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
    let benchContext = '';
    let voiceGender = 'male';
    let judgeType = '';
    let intensity = '';

    try {
      // The req.url might look like /ws/voice?bench=hard&summary=...&ctx=...&judgeType=...&intensity=...
      const url = new URL(req.url, `ws://${req.headers.host || 'localhost'}`);
      benchLevel = url.searchParams.get('bench') || 'moderate';
      propositionSummary = url.searchParams.get('summary') || '';
      benchContext = url.searchParams.get('ctx') || '';
      voiceGender = url.searchParams.get('voice') || 'male';
      judgeType = url.searchParams.get('judgeType') || '';
      intensity = url.searchParams.get('intensity') || '';
    } catch (e) {
      console.error("Error parsing WebSocket URL:", e);
    }

    // Backend-authoritative judge persona + intensity layer — opt-in, same
    // as /simulate-bench. Only engages when the client sends judgeType/
    // intensity query params; old clients (bench/summary/ctx/voice only)
    // get an identical voiceSummary to before.
    const resolvedIntensity = ['easy','moderate','hard'].includes(intensity) ? intensity : benchLevel;
    const backendJudgeDirective = (judgeType || intensity) ? buildJudgeDirective(judgeType, resolvedIntensity) : '';

    // Prepend the backend judge/intensity directive, then the forum/judge/depth
    // directives the client already embedded, so the voice judge adapts to the forum.
    const voiceSummary = [backendJudgeDirective, benchContext, propositionSummary].filter(Boolean).join('\n\n');
    handleLiveVoiceConnection(ws, benchLevel, voiceSummary, voiceGender);
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