const { MEMORY_EXTRACTION_SYSTEM, buildMemoryExtractionUser } = require("../prompts/memoryExtractionPrompt");

/** Keep only the fields and types the bench uses; anything else is dropped. */
function normaliseMemoryResult(r) {
  const o = r && typeof r === "object" ? r : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v, n = 400) => String(v == null ? "" : v).slice(0, n);
  const ev = o.evasion && typeof o.evasion === "object" ? o.evasion : {};
  return {
    new_concessions: arr(o.new_concessions).slice(0, 5).map(c => ({
      statement: str(c && c.statement), issueContext: str(c && c.issueContext, 200),
      confidence: Math.max(0, Math.min(1, Number(c && c.confidence) || 0)) })).filter(c => c.statement),
    evasion: { detected: ev.detected === true, reason: str(ev.reason, 300),
      severity: ["low", "medium", "blatant"].includes(ev.severity) ? ev.severity : "" },
    unanswered_questions: arr(o.unanswered_questions).slice(0, 5).map(q => str(q, 300)).filter(Boolean),
    contradictions: arr(o.contradictions).slice(0, 5).map(c => ({
      statement: str(c && c.statement), conflictsWith: str(c && c.conflictsWith) })).filter(c => c.statement),
  };
}

function createEmptyMemory() {
  return {
    concessions: [],
    evasions: {
      count: 0,
      lastEvadedQuestion: "",
      severity: ""
    },
    pendingQuestions: [],
    advocatePositions: []
  };
}

/**
 * The bench's reading of one exchange, for the courtroom's temper line and
 * bench notes in the voice round (whose judge sends speech only).
 * pressureLevel 1-5 as in the text bench; note is one short line.
 */
function benchReadOf(r) {
  let level = 2, note = '';
  const cut = (t, n = 140) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  if (r.contradictions.length) { level = 4; note = 'Contradiction: ' + cut(r.contradictions[0].statement, 120); }
  if (r.evasion.detected) {
    level = r.evasion.severity === 'blatant' ? 5 : r.evasion.severity === 'medium' ? 4 : 3;
    note = 'Evasion: ' + cut(r.evasion.reason || 'the question was not answered', 130);
  } else if (r.unanswered_questions.length && level < 3) {
    level = 3; note = 'Unanswered: ' + cut(r.unanswered_questions[0], 125);
  }
  const conceded = r.new_concessions.filter(c => c.confidence >= 0.7);
  if (conceded.length && !note) { level = Math.max(level, 3); note = 'Conceded: ' + cut(conceded[0].statement, 125); }
  return { pressureLevel: level, note };
}

async function evaluateExchange(currentMemory, exchangeTranscript, opts = {}) {
  if (!exchangeTranscript || exchangeTranscript.trim() === "") return null;

  try {
    // Through the shared client (lazily: geminiService requires this file), so
    // the call gets the Gemini fallback, the usage meter and the spend meter.
    const { getChatCompletion } = require("./geminiService");
    const call = await getChatCompletion({
      messages: [
        { role: "system", content: MEMORY_EXTRACTION_SYSTEM },
        { role: "user", content: buildMemoryExtractionUser(currentMemory, exchangeTranscript) }
      ],
      temperature: 0.1,
      max_tokens: 1500,
      primaryProvider: "groq",
      geminiMaxAttempts: 1,
      groqMaxAttempts: 1,
      requestLabel: "Bench memory (shadow evaluator)"
    });

    const result = normaliseMemoryResult(JSON.parse(String(call.text || "").replace(/```json|```/g, "").trim()));
    // Counts only: the result quotes the student's own words.
    console.log(`[MEMORY ENGINE] concessions ${result.new_concessions.length}, evasion ${result.evasion.detected ? result.evasion.severity || 'yes' : 'no'}, unanswered ${result.unanswered_questions.length}, contradictions ${result.contradictions.length}`);

    const applied = applyMemoryUpdates(currentMemory, result);
    if (opts.withRead) applied.read = benchReadOf(result);
    return applied;
  } catch (error) {
    console.error("[MEMORY ENGINE] Error in Shadow Evaluator:", error.message);
    return null; // Return null on failure to not interrupt the main session
  }
}

function applyMemoryUpdates(currentMemory, updates) {
  let whisperUpdates = [];

  // Handle Concessions
  if (updates.new_concessions && updates.new_concessions.length > 0) {
    for (const c of updates.new_concessions) {
      if (c.confidence >= 0.7) {
        c.timestamp = Date.now();
        currentMemory.concessions.push(c);
        whisperUpdates.push(`The advocate just conceded: "${c.statement}". Log this and use it to pressure them later.`);
      }
    }
  }

  // Handle Evasions
  if (updates.evasion && updates.evasion.detected) {
    currentMemory.evasions.count += 1;
    currentMemory.evasions.lastEvadedQuestion = updates.evasion.reason;
    currentMemory.evasions.severity = updates.evasion.severity;

    if (currentMemory.evasions.count === 1) {
      whisperUpdates.push(`The advocate evaded your question. Severity: ${updates.evasion.severity}. Call them out on it.`);
    } else {
      whisperUpdates.push(`The advocate is repeatedly evading. They have evaded ${currentMemory.evasions.count} times. Aggressively demand a direct answer.`);
    }
  }

  // Handle Unanswered Questions
  if (updates.unanswered_questions && updates.unanswered_questions.length > 0) {
    for (const q of updates.unanswered_questions) {
      currentMemory.pendingQuestions.push({ question: q, timestamp: Date.now() });
      whisperUpdates.push(`The advocate failed to answer: "${q}". You may want to repeat it.`);
    }
  }

  // Handle Contradictions
  if (updates.contradictions && updates.contradictions.length > 0) {
    for (const contra of updates.contradictions) {
      whisperUpdates.push(`CONTRADICTION DETECTED: The advocate just said "${contra.statement}", which contradicts "${contra.conflictsWith}". Cross-examine them on this immediately!`);
    }
  }

  // Generate the System Whisper
  let whisperToken = null;
  if (whisperUpdates.length > 0) {
    whisperToken = `[SYSTEM MEMORY UPDATE]: ${whisperUpdates.join(" ")}`;
  }

  return { updatedMemory: currentMemory, whisperToken };
}

module.exports = {
  _normaliseMemoryResult: normaliseMemoryResult,
  _benchReadOf: benchReadOf,
  createEmptyMemory,
  evaluateExchange
};
