const Groq = require("groq-sdk");
const { buildMemoryExtractionPrompt } = require("../prompts/memoryExtractionPrompt");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

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

async function evaluateExchange(currentMemory, exchangeTranscript) {
  if (!exchangeTranscript || exchangeTranscript.trim() === "") return null;

  const prompt = buildMemoryExtractionPrompt(currentMemory, exchangeTranscript);

  try {
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Extract memory states strictly following the JSON schema." }
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log("[MEMORY ENGINE] Shadow Evaluator Result:", JSON.stringify(result, null, 2));

    return applyMemoryUpdates(currentMemory, result);
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
  createEmptyMemory,
  evaluateExchange
};
