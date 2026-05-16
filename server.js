process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require("dotenv").config();

const extractIssuesRoute = require("./routes/extractIssues");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");

const Groq = require("groq-sdk");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/extract-issues", extractIssuesRoute);
app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

const upload = multer({ dest: "uploads/" });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/* ─── LEGAL VALIDATION PROMPT ─── */
const LEGAL_VALIDATION_PROMPT = `You are a strict legal document classifier for MootCoach, an elite moot court preparation platform.

Determine if the uploaded text is a legal or moot-court-relevant document.

ACCEPT:
- Moot court propositions or problems
- Legal case facts, disputes, FIRs, complaints
- Constitutional law matters
- Criminal, civil, family, corporate, environmental, administrative law cases
- Statutes, Acts, Bills, legal drafts
- Legal memorials or submissions
- Judicial orders, judgments, opinions
- Legal arguments or pleadings
- PIL petitions, writ petitions

REJECT:
- HR scripts, employee handbooks, training material
- Business plans, pitch decks, marketing content
- Resumes, CVs, cover letters
- Academic essays not related to law
- General news articles, blog posts
- Medical documents, clinical reports
- Technical manuals, software documentation
- Random notes, general PDFs
- Social science, management, or economics content without legal disputes
- Fiction, creative writing

Respond ONLY with valid JSON. No text before or after it. No markdown.

Format: {"isLegal": true, "confidence": 85, "documentType": "Moot Court Proposition — Environmental Law"}`;

/* ─── ANALYSIS SYSTEM PROMPT ─── */
const ANALYSIS_SYSTEM_PROMPT = `You are MootCoach AI — an elite moot court evaluator combining the rigor of a constitutional law professor, the precision of a Supreme Court judge, and the critical eye of a national moot court competition director.

You do NOT give generic praise. You do NOT inflate scores. You do NOT compliment bad drafting. You evaluate with full academic integrity.

═══════════════════════════════
SCORING PHILOSOPHY — READ CAREFULLY
═══════════════════════════════

Weak propositions (poor drafting, thin issues, no constitutional depth): Score 28–50
Average propositions (standard issues, some balance): Score 51–72
Strong propositions (rich issues, constitutional conflict, good balance): Score 73–87
Exceptional propositions (national-level complexity, genuinely novel legal questions): Score 88–94
Perfect propositions DO NOT EXIST. NEVER score above 94. If you score above 87, justify it explicitly.

═══════════════════════════════
WEIGHTED SCORING CATEGORIES (Total = 100)
═══════════════════════════════

1. issueIdentification (max 20)
   - Are the legal issues clearly identifiable, distinct, justiciable, and properly framed?
   - Deduct heavily if issues are merged, vague, or unstated
   - Deduct if issues are so obvious they require no real research

2. legalComplexity (max 20)
   - Does the problem involve multiple legal layers, conflicting statutes, or multi-jurisdictional questions?
   - Deduct if the problem is one-dimensional or solvable with one statute

3. constitutionalDepth (max 15)
   - Is there genuine constitutional conflict — not just surface-level citation of rights?
   - Deduct if rights are mentioned but not genuinely contested between competing interests
   - Deduct if no constitutional tension exists

4. precedentPotential (max 15)
   - Can real, named landmark cases be meaningfully argued by both sides?
   - Deduct if no significant case law applies
   - Deduct if only one side can use precedent

5. argumentBalance (max 10)
   - Can BOTH petitioner AND respondent construct equally strong, defensible arguments?
   - Deduct if one side clearly dominates
   - Deduct if the outcome is legally predetermined

6. mootReadiness (max 10)
   - Is the problem well-structured, properly scoped, and free from drafting errors?
   - Deduct for ambiguous facts, unclear parties, unrealistic scenarios, or missing procedural posture

7. originality (max 10)
   - Does the problem raise fresh, unresolved questions of law?
   - Deduct heavily if this is a recycled textbook scenario
   - Deduct if the legal question has a well-settled answer

═══════════════════════════════
MANDATORY OUTPUT — RETURN ONLY JSON
═══════════════════════════════

You MUST return ONLY a valid JSON object. No preamble. No explanation outside the JSON. No markdown code fences. No text before or after the JSON object.

{
  "overallScore": <integer 0-94>,
  "scoreVerdict": "<Weak|Average|Strong|Exceptional>",
  "categoryScores": {
    "issueIdentification": { "score": <0-20>, "max": 20, "justification": "<2-3 sentences of honest evaluation>" },
    "legalComplexity": { "score": <0-20>, "max": 20, "justification": "<2-3 sentences>" },
    "constitutionalDepth": { "score": <0-15>, "max": 15, "justification": "<2-3 sentences>" },
    "precedentPotential": { "score": <0-15>, "max": 15, "justification": "<2-3 sentences>" },
    "argumentBalance": { "score": <0-10>, "max": 10, "justification": "<2-3 sentences>" },
    "mootReadiness": { "score": <0-10>, "max": 10, "justification": "<2-3 sentences>" },
    "originality": { "score": <0-10>, "max": 10, "justification": "<2-3 sentences>" }
  },
  "summary": "<3-4 sentences: what is this case about, core disputes, legal significance>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "legalIssues": ["<precise issue 1>", "<precise issue 2>", "<precise issue 3>", "<precise issue 4>"],
  "petitionerArguments": ["<argument with legal basis>", "<argument>", "<argument>", "<argument>"],
  "respondentArguments": ["<argument with legal basis>", "<argument>", "<argument>", "<argument>"],
  "constitutionalIssues": ["<Article/Provision — specific conflict being contested>", "..."],
  "precedentsNeeded": ["<Case Name v. Case Name — why relevant>", "..."],
  "benchQuestions": ["<aggressive judicial question 1>", "<question 2>", "<question 3>", "<question 4>", "<question 5>"],
  "benchVulnerabilities": ["<Petitioner: vulnerability and which argument it undermines>", "<Respondent: vulnerability>", "..."],
  "mostContestableIssue": "<The single hardest legal question — 2-3 sentences of analytical depth>",
  "missingAngles": ["<important legal angle this proposition ignores>", "<missed angle 2>"],
  "oralDifficulty": "<high|medium|low>",
  "oralDifficultyReason": "<Why this oral difficulty — bench intensity, question density, legal complexity>",
  "researchDifficulty": "<high|medium|low>",
  "researchDifficultyReason": "<Why — case law scarcity/abundance, statutory complexity, academic literature>",
  "finalVerdict": "<2-3 sentences of brutally honest competition assessment and what teams must prioritize to succeed>"
}`;
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

    // Clean up file immediately
    try { fs.unlinkSync(filePath); filePath = null; } catch (e) {}

    if (!extractedText || extractedText.trim().length < 80) {
      return res.status(422).json({
        success: false,
        error: "The uploaded PDF appears to be empty, image-based, or unreadable. Please upload a text-based PDF."
      });
    }

    const truncatedText = extractedText.slice(0, 14000);

    /* ── PHASE 1: Legal Domain Validation ── */
    let validationResult = { isLegal: true, confidence: 60, documentType: "Unknown" };

    try {
      const validationCall = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 80,
        temperature: 0.05,
        messages: [
          { role: "system", content: LEGAL_VALIDATION_PROMPT },
          { role: "user",   content: `Classify this document:\n\n${truncatedText.slice(0, 2500)}` }
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
      // On validation failure, proceed — don't block the user
    }

    // Hard reject with high confidence non-legal
    if (validationResult.isLegal === false && validationResult.confidence >= 75) {
      return res.status(422).json({
        success: false,
        isRejection: true,
        documentType: validationResult.documentType || "Non-legal document",
        error: `This document does not appear to be a legal proposition, moot problem, case file, memorial, statute-based dispute, or judicial/legal text. MootCoach currently supports only legal and moot-court-related analysis. Detected content type: "${validationResult.documentType}".`
      });
    }

    /* ── PHASE 2: Full Legal Analysis ── */
    const analysisCall = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 3500,
      temperature: 0.25,
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this legal proposition. Return ONLY the JSON object. No text before or after it:\n\n${truncatedText}`
        }
      ]
    });

    const rawAnalysis = analysisCall.choices[0].message.content.trim();

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

    // Use computed category sum if it differs materially from stated overall
    if (computedSum > 0 && Math.abs(aiScore - computedSum) > 6) {
      analysisData.overallScore = computedSum;
    }

    // Enforce hard bounds
    analysisData.overallScore = Math.min(94, Math.max(10, analysisData.overallScore));

    // Enforce verdict consistency
    const s = analysisData.overallScore;
    if      (s >= 88) analysisData.scoreVerdict = "Exceptional";
    else if (s >= 73) analysisData.scoreVerdict = "Strong";
    else if (s >= 51) analysisData.scoreVerdict = "Average";
    else              analysisData.scoreVerdict = "Weak";

    return res.json({
      success: true,
      isStructured: true,
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
app.listen(3000, () => {
  console.log("🚀 MootCoach AI running on port 3000");
});