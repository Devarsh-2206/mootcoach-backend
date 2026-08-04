const PROCEDURAL_HIERARCHY_PROMPT = require('../prompts/proceduralHierarchyPrompt');
const { getChatCompletion } = require("./geminiService");

async function extractProceduralHierarchy(propositionIntelligenceJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Procedural Hierarchy Engine] Starting request...");
    
    const userMessage = `Here is the extracted Proposition Intelligence. Analyze the issues and forum, and map them into the required Procedural Hierarchy schema:
    
    ${propositionIntelligenceJSON}
    `;

    const chatCompletion = await getChatCompletion({
      messages: [
        { role: 'system', content: PROCEDURAL_HIERARCHY_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      primaryProvider: "groq",
      groqTimeoutMs: 15000,
      geminiTimeoutMs: 30000,
      geminiMaxAttempts: 1,
      requestLabel: "Procedural Hierarchy Engine"
    });

    const content = chatCompletion.text || "";
    console.log(`[AI TRACE] [Procedural Hierarchy Engine] Request completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Procedural Hierarchy Engine] Extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractProceduralHierarchy
};
