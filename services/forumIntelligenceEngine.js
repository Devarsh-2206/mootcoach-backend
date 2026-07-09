const FORUM_INTELLIGENCE_PROMPT = require('../prompts/forumIntelligencePrompt');
const { getChatCompletion } = require("./geminiService");

async function extractForumIntelligence(propositionIntelligenceJSON, proceduralHierarchyJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Forum Intelligence Engine] Starting request...");
    
    const userMessage = `Here is the extracted Proposition Intelligence and Procedural Hierarchy.
    Based strictly on this data, construct the deep Forum Intelligence schema.
    
    === PROPOSITION INTELLIGENCE ===
    ${propositionIntelligenceJSON}
    
    === PROCEDURAL HIERARCHY ===
    ${proceduralHierarchyJSON}
    `;

    const chatCompletion = await getChatCompletion({
      messages: [
        { role: 'system', content: FORUM_INTELLIGENCE_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      requestLabel: "Forum Intelligence Engine"
    });

    const content = chatCompletion.text || "";
    console.log(`[AI TRACE] [Forum Intelligence Engine] Request completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Forum Intelligence Engine] Extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractForumIntelligence
};
