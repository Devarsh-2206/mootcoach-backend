const ISSUE_INTELLIGENCE_PROMPT = require('../prompts/issueIntelligencePrompt');
const { getChatCompletion } = require("./geminiService");

async function extractIssueIntelligence(propositionIntelligenceJSON, proceduralHierarchyJSON, forumIntelligenceJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Issue Intelligence Engine] Starting request...");
    
    const userMessage = `Here is the extracted Proposition Intelligence, Procedural Hierarchy, and Forum Intelligence.
    Iterate through the identified issues and construct the deep Issue Intelligence matrix.
    
    === PROPOSITION INTELLIGENCE ===
    ${propositionIntelligenceJSON}
    
    === PROCEDURAL HIERARCHY ===
    ${proceduralHierarchyJSON}
    
    === FORUM INTELLIGENCE ===
    ${forumIntelligenceJSON}
    `;

    const chatCompletion = await getChatCompletion({
      messages: [
        { role: 'system', content: ISSUE_INTELLIGENCE_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      primaryProvider: "groq",
      // Measured cost of this stage on Groq is ~32s (see the pipeline
      // measurement in the G-series work). The previous 15s cap was below
      // what the call needs, so it timed out on every single request, then
      // fell through to Gemini and timed out there too — burning ~60s and
      // silently dropping this payload and every stage nested under it.
      groqTimeoutMs: 45000,
      geminiTimeoutMs: 45000,
      geminiMaxAttempts: 1,
      requestLabel: "Issue Intelligence Engine"
    });

    const content = chatCompletion.text || "";
    console.log(`[AI TRACE] [Issue Intelligence Engine] Request completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Issue Intelligence Engine] Extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractIssueIntelligence
};
