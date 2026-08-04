const ADVOCACY_INTELLIGENCE_PROMPT = require('../prompts/advocacyIntelligencePrompt');
const { getChatCompletion } = require("./geminiService");

async function extractAdvocacyIntelligence(propositionIntelligenceJSON, proceduralHierarchyJSON, forumIntelligenceJSON, issueIntelligenceJSON, authorityIntelligenceJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Advocacy Intelligence Engine] Starting request...");
    
    const userMessage = `Here is the extracted Intelligence stack.
    Iterate through the issues and construct the Advocacy Roadmap.
    
    === PROPOSITION INTELLIGENCE ===
    ${propositionIntelligenceJSON}
    
    === PROCEDURAL HIERARCHY ===
    ${proceduralHierarchyJSON}
    
    === FORUM INTELLIGENCE ===
    ${forumIntelligenceJSON}
    
    === ISSUE INTELLIGENCE ===
    ${issueIntelligenceJSON}
    
    === AUTHORITY INTELLIGENCE ===
    ${authorityIntelligenceJSON}
    `;

    const chatCompletion = await getChatCompletion({
      messages: [
        { role: 'system', content: ADVOCACY_INTELLIGENCE_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      primaryProvider: "groq",
      groqTimeoutMs: 15000,
      geminiTimeoutMs: 30000,
      geminiMaxAttempts: 1,
      requestLabel: "Advocacy Intelligence Engine"
    });

    const content = chatCompletion.text || "";
    console.log(`[AI TRACE] [Advocacy Intelligence Engine] Request completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Advocacy Intelligence Engine] Extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractAdvocacyIntelligence
};
