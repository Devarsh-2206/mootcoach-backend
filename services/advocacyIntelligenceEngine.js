const Groq = require('groq-sdk');
const ADVOCACY_INTELLIGENCE_PROMPT = require('../prompts/advocacyIntelligencePrompt');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function extractAdvocacyIntelligence(propositionIntelligenceJSON, proceduralHierarchyJSON, forumIntelligenceJSON, issueIntelligenceJSON, authorityIntelligenceJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Advocacy Intelligence Engine] Starting Groq request...");
    
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

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: ADVOCACY_INTELLIGENCE_PROMPT },
        { role: 'user', content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = chatCompletion.choices[0]?.message?.content || "";
    console.log(`[AI TRACE] [Advocacy Intelligence Engine] Groq completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Advocacy Intelligence Engine] Groq extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractAdvocacyIntelligence
};
