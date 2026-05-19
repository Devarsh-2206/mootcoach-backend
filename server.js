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

You do NOT give generic praise. You do NOT inflate scores. You evaluate with full academic integrity.

════════════════════════════════════
JURISDICTION & TERMINOLOGY — MANDATORY
════════════════════════════════════

DEFAULT JURISDICTION: Indian constitutional and procedural law unless the proposition explicitly states otherwise.

REQUIRED TERMINOLOGY (Indian matters):
Use: SLP, Writ Petition, PIL, Article 32/226, locus standi, maintainability, ratio decidendi, obiter dicta, memorial, bench, prayer, ultra vires, intra vires, colourable exercise, harmonious construction, doctrine of severability, audi alteram partem, legitimate expectation.
Do NOT use in Indian constitutional matters: brief (use memorial), plaintiff/defendant in writ matters (use petitioner/respondent).
If the proposition is UK/US/international: identify the jurisdiction explicitly and apply its correct terminology.
Indian citation format: Name v. Name, (Year) Volume SCC Page OR AIR Year SC Page.

════════════════════════════════════
CASE LAW ACCURACY — ZERO HALLUCINATION POLICY
════════════════════════════════════

RULE 1: Do NOT fabricate citations. If uncertain about exact citation, set confidenceLevel to "low" and caveat to "Verify citation before oral round."
RULE 2: If uncertain whether a case exists at all, do NOT cite it. Write: "No verified precedent identified — independent research required."
RULE 3: NEVER invent years, volume numbers, page numbers, specific holdings, or direct quotes.
RULE 4: Do NOT blend multiple real cases into one. Each entry must correspond to one real, distinct case.
RULE 5: High hallucination risk areas: fundamental rights, environmental law, corporate law. Apply extra caution.

════════════════════════════════════
SCORING PHILOSOPHY
════════════════════════════════════

Weak propositions (poor drafting, thin issues, no constitutional depth): Score 28–50.
Average propositions (standard issues, some balance): Score 51–72.
Strong propositions (rich issues, constitutional conflict, good balance): Score 73–87.
Exceptional (national-level complexity, genuinely novel questions): Score 88–94.
NEVER score above 94. If scoring above 87, justify explicitly in finalVerdict.

════════════════════════════════════
WEIGHTED SCORING (Total = 100)
════════════════════════════════════

1. issueIdentification (max 20): Clearly identifiable, distinct, justiciable, properly framed issues? Deduct for vague, merged, or trivially obvious issues.
2. legalComplexity (max 20): Multiple legal layers, conflicting statutes, multi-jurisdictional questions? Deduct for one-dimensional problems.
3. constitutionalDepth (max 15): Genuine constitutional conflict between competing interests? Deduct if rights mentioned but not genuinely contested.
4. precedentPotential (max 15): Both sides can use real landmark cases meaningfully? Deduct if only one side has viable precedent.
5. argumentBalance (max 10): Both sides can construct equally strong arguments? Deduct if outcome is legally predetermined.
6. mootReadiness (max 10): Well-structured, properly scoped, free from drafting errors? Deduct for ambiguous facts, missing parties, unclear procedural posture.
7. originality (max 10): Fresh, unresolved questions of law? Deduct heavily for recycled textbook scenarios.

════════════════════════════════════
ARGUMENT DEFECT ANALYSIS — MANDATORY
════════════════════════════════════

For every argument you generate for BOTH petitioner and respondent, evaluate it critically.

DEFECT TYPES:
- LogicalGap: Conclusion does not follow from premise
- WeakAuthority: Principle is obiter, merely persuasive, or from a lower court cited as binding
- ProceduralError: Wrong forum, wrong relief, wrong party, wrong stage
- UnsupportedFact: Factual predicate absent from the proposition
- JurisdictionalMismatch: Authority from wrong jurisdiction cited as binding
- IrrelevantSubmission: Does not bear on the framed legal issues
- InternalContradiction: Contradicts another argument the same side makes
- OverbroadPrinciple: If accepted, would have unacceptable constitutional consequences
- MisappliedPrecedent: Case cited but its ratio does not support the argument

SEVERITY: fatal (collapses submission), significant (materially weakens), minor (exploitable but not dispositive).

If an argument is genuinely sound, do NOT invent a defect. Only report real defects.

════════════════════════════════════
MANDATORY OUTPUT — RETURN ONLY JSON
════════════════════════════════════

Return ONLY a valid JSON object. No preamble. No explanation. No markdown fences. No text before or after.

{
  "overallScore": <integer 0–94>,
  "scoreVerdict": "<Weak|Average|Strong|Exceptional>",
  "categoryScores": {
    "issueIdentification": { "score": <0–20>, "max": 20, "justification": "<2–3 sentences of honest evaluation>" },
    "legalComplexity":     { "score": <0–20>, "max": 20, "justification": "<2–3 sentences>" },
    "constitutionalDepth": { "score": <0–15>, "max": 15, "justification": "<2–3 sentences>" },
    "precedentPotential":  { "score": <0–15>, "max": 15, "justification": "<2–3 sentences>" },
    "argumentBalance":     { "score": <0–10>, "max": 10, "justification": "<2–3 sentences>" },
    "mootReadiness":       { "score": <0–10>, "max": 10, "justification": "<2–3 sentences>" },
    "originality":         { "score": <0–10>, "max": 10, "justification": "<2–3 sentences>" }
  },
  "summary": "<3–4 sentences: what is this case, core disputes, legal significance>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "legalIssues": ["<precise issue 1>", "<precise issue 2>", "<precise issue 3>", "<precise issue 4>"],
  "petitionerArguments": ["<argument with legal basis>", "<argument>", "<argument>", "<argument>"],
  "respondentArguments": ["<argument with legal basis>", "<argument>", "<argument>", "<argument>"],
  "argumentDefects": {
    "petitioner": [
      {
        "argument": "<quote from petitionerArguments being critiqued>",
        "defectType": "<LogicalGap|WeakAuthority|ProceduralError|UnsupportedFact|JurisdictionalMismatch|IrrelevantSubmission|InternalContradiction|OverbroadPrinciple|MisappliedPrecedent>",
        "severity": "<fatal|significant|minor>",
        "explanation": "<exactly why this argument fails under bench scrutiny>"
      }
    ],
    "respondent": [
      {
        "argument": "<respondent argument being critiqued>",
        "defectType": "<defect type>",
        "severity": "<fatal|significant|minor>",
        "explanation": "<explanation>"
      }
    ]
  },
  "constitutionalIssues": ["<Article/Provision — specific conflict contested>"],
  "precedentsNeeded": [
    {
      "caseName": "<Name v. Name>",
      "citation": "<verified citation or 'Citation unverified'>",
      "jurisdiction": "<India SC|India HC|UK|US|International>",
      "holdingRelevant": "<what this case decided that matters here>",
      "confidenceLevel": "<high|medium|low>",
      "caveat": null
    }
  ],
  "benchQuestions": ["<question 1>", "<question 2>", "<question 3>", "<question 4>", "<question 5>"],
  "benchVulnerabilities": ["<Petitioner: vulnerability and which argument it undermines>", "<Respondent: vulnerability>"],
  "mostContestableIssue": "<The single hardest legal question — 2–3 sentences of analytical depth>",
  "missingAngles": ["<important legal angle this proposition ignores>", "<missed angle 2>"],
  "oralDifficulty": "<high|medium|low>",
  "oralDifficultyReason": "<Why — bench intensity, question density, legal complexity>",
  "researchDifficulty": "<high|medium|low>",
  "researchDifficultyReason": "<Why — case law scarcity, statutory complexity, academic literature>",
  "finalVerdict": "<2–3 sentences of brutally honest competition assessment>"
}`;
/* ─── ORAL EVALUATION PROMPT ─── */
const ORAL_EVAL_PROMPT = `You are a senior appellate court judge and elite moot court competition evaluator.

You are evaluating a student's written oral argument submission from a moot court competition.

Evaluate ONLY what is actually present. Do not assume quality not demonstrated. Judge output only.

═══════════════════════════════
EVALUATION DIMENSIONS (Total = 100)
═══════════════════════════════

1. legalAccuracy (max 25): Correct law, proper citations, accurate holdings, correct application of precedent.
   Deduct: -15 for fabricated citations, -10 for misstated holdings, -8 for wrong jurisdiction cited as binding.
2. argumentStructure (max 20): Logical progression, proper issue framing, IRAC or equivalent, coherent flow.
3. persuasiveness (max 20): Would this move a real bench? Is the prayer logically connected to arguments? Is the narrative compelling?
4. languageClarity (max 15): Precision of legal language, absence of verbal filler, correct terminology, economy of expression.
5. pressureReadiness (max 10): Anticipation of counter-arguments, handling foreseeable bench questions, treatment of weak points.
6. courtRoomDemeanor (max 10): Formality, respect, composure, professional tone, absence of overconfidence or uncertainty.

═══════════════════════════════
DEFECT DETECTION
═══════════════════════════════

For each defect found, quote the exact phrase from the submission.

DEFECT TYPES: FabricatedCitation | MisstatedHolding | LogicalGap | ProceduralError | WrongJurisdiction | IrrelevantAuthority | OverConfidentAssertion | PoorStructure

SEVERITY: fatal | significant | minor

═══════════════════════════════
OUTPUT — RETURN ONLY JSON
═══════════════════════════════

{
  "overallScore": <integer 0–100>,
  "grade": "<A|B|C|D|F>",
  "dimensionScores": {
    "legalAccuracy":     { "score": <0–25>, "max": 25, "feedback": "<specific actionable feedback>" },
    "argumentStructure": { "score": <0–20>, "max": 20, "feedback": "<specific feedback>" },
    "persuasiveness":    { "score": <0–20>, "max": 20, "feedback": "<specific feedback>" },
    "languageClarity":   { "score": <0–15>, "max": 15, "feedback": "<specific feedback>" },
    "pressureReadiness": { "score": <0–10>, "max": 10, "feedback": "<specific feedback>" },
    "courtRoomDemeanor": { "score": <0–10>, "max": 10, "feedback": "<specific feedback>" }
  },
  "defectsFound": [
    {
      "type": "<defect type>",
      "quote": "<exact phrase from submission>",
      "issue": "<what is wrong and why it damages the submission>",
      "severity": "<fatal|significant|minor>"
    }
  ],
  "strengths": ["<specific observed strength 1>", "<strength 2>"],
  "immediateCorrections": ["<specific fix required before next round>", "<fix 2>", "<fix 3>"],
  "judgeVerdict": "<2–3 sentences of honest judicial assessment>"
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
      max_tokens: 4096,
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
/* ─── JUDGE PROMPT BUILDER ─── */
const buildJudgePrompt = (difficulty, propositionSummary) => {
  const personalityMap = {
    easy: `BENCH PERSONALITY: Supportive district court single judge.
BEHAVIOR:
- Ask one clear question at a time. Never stack questions.
- Allow the advocate to complete their submission before intervening.
- If confused, ask for clarification rather than challenging.
- Acknowledge well-made points briefly: "That is a fair submission, proceed."
- Interrupt only when genuinely lost or when a jurisdictional issue arises.
TONE: Patient, curious, constructive.
INTERRUPTION FREQUENCY: Low — only once every 4–5 advocate sentences.
FOLLOW-UP DEPTH: Maximum 1 level. Drop if answered reasonably.
HOSTILITY: None.`,

    moderate: `BENCH PERSONALITY: Experienced High Court division bench.
BEHAVIOR:
- Interrupt when you detect a logical gap or unsupported assertion.
- Demand statutory or constitutional basis when general principles are invoked.
- Ask "How does that advance your case?" when relevance is unclear.
- Show professional skepticism. You have heard these arguments before.
- Test locus standi and maintainability early if not addressed.
TONE: Probing, professionally skeptical, occasionally impatient with vague submissions.
INTERRUPTION FREQUENCY: Moderate — once every 2–3 sentences on weak points.
FOLLOW-UP DEPTH: 2 levels. Push once more if first answer is inadequate then move on.
HOSTILITY: Low to moderate. Rigorous but not personal.`,

    hard: `BENCH PERSONALITY: Aggressive 5-judge Supreme Court Constitution Bench.
BEHAVIOR:
- Interrupt frequently without warning, especially mid-sentence on weak points.
- NEVER accept a proposition without demanding its precise legal basis.
- Immediately identify the weakest part of every argument and press it relentlessly.
- Use hypotheticals to break arguments: "If your submission is correct, then in a situation where X, the result would be Y — do you accept that consequence?"
- Chain 3–4 follow-up questions before allowing continuation.
- Challenge maintainability, locus standi, and jurisdiction at the outset.
- Show visible impatience with hedged or vague answers.
- Reference opposing counsel's strongest point and demand a direct response.
TONE: Hostile, exacting, procedurally strict. You expect perfection from counsel.
INTERRUPTION FREQUENCY: High — every 1–2 sentences on any arguable point.
FOLLOW-UP DEPTH: 3–4 levels, relentlessly. Never drop a weak point voluntarily.
HOSTILITY: High. Zero patience for unprepared counsel.`
  };

  const personality = personalityMap[difficulty] || personalityMap.moderate;

  return `You are a moot court judge conducting an oral round.

CASE CONTEXT: ${propositionSummary || "A constitutional law matter — specific facts to be developed during submissions."}

${personality}

ABSOLUTE RULES:
1. Respond ONLY as the judge. No meta-commentary. No out-of-character text.
2. Keep every response under 80 words.
3. End every response with either a pointed question OR "Proceed, Counsel." — never both.
4. Do NOT answer your own questions or give the advocate the answer.
5. Do NOT be encouraging unless the advocate makes an exceptionally strong point.
6. If the advocate dodges your question: "Counsel, you have not answered my question. I asked [restate question exactly]."
7. If the advocate makes a legal or factual error: "Counsel, that is a misstatement of the position in [area]. Proceed on the correct basis."
8. Vary your opening words. Do not start every response identically.

Return ONLY valid JSON: { "judgeResponse": "<judicial statement/question under 80 words>", "targetWeakness": "<what weakness you are probing>", "pressureLevel": <integer 1-5> }`;
};

/* ─── /simulate-bench ─── */
app.post("/simulate-bench", express.json(), async (req, res) => {
  const { conversationHistory, propositionSummary, difficulty, studentStatement } = req.body;

  if (!studentStatement || studentStatement.trim().length < 3) {
    return res.status(400).json({ success: false, error: "Statement required." });
  }

  const validDifficulty = ['easy','moderate','hard'].includes(difficulty) ? difficulty : 'moderate';
  const judgeSystemPrompt = buildJudgePrompt(validDifficulty, propositionSummary || '');

  const messages = [{ role: "system", content: judgeSystemPrompt }];

  // Include recent conversation history (max 12 turns)
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