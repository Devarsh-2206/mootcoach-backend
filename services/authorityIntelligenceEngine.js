const AUTHORITY_INTELLIGENCE_PROMPT = require('../prompts/authorityIntelligencePrompt');
const { getChatCompletion } = require("./geminiService");

async function extractAuthorityIntelligence(propositionIntelligenceJSON, proceduralHierarchyJSON, forumIntelligenceJSON, issueIntelligenceJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Authority Intelligence Engine] Starting request...");
    
    const userMessage = `Here is the extracted Intelligence stack up to this point.
    Iterate through the issues and construct the Authority Roadmaps.
    
    === PROPOSITION INTELLIGENCE ===
    ${propositionIntelligenceJSON}
    
    === PROCEDURAL HIERARCHY ===
    ${proceduralHierarchyJSON}
    
    === FORUM INTELLIGENCE ===
    ${forumIntelligenceJSON}
    
    === ISSUE INTELLIGENCE ===
    ${issueIntelligenceJSON}
    `;

    const chatCompletion = await getChatCompletion({
      messages: [
        { role: 'system', content: AUTHORITY_INTELLIGENCE_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      requestLabel: "Authority Intelligence Engine"
    });

    const content = chatCompletion.text || "";
    console.log(`[AI TRACE] [Authority Intelligence Engine] Request completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Authority Intelligence Engine] Extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractAuthorityIntelligence
};
