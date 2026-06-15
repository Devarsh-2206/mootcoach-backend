const Groq = require('groq-sdk');
const AUTHORITY_INTELLIGENCE_PROMPT = require('../prompts/authorityIntelligencePrompt');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function extractAuthorityIntelligence(propositionIntelligenceJSON, proceduralHierarchyJSON, forumIntelligenceJSON, issueIntelligenceJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Authority Intelligence Engine] Starting Groq request...");
    
    const userMessage = `Here is the extracted Proposition Intelligence, Procedural Hierarchy, Forum Intelligence, and Issue Intelligence.
    Iterate through the arguments and construct the Authority Roadmap.
    
    === PROPOSITION INTELLIGENCE ===
    ${propositionIntelligenceJSON}
    
    === PROCEDURAL HIERARCHY ===
    ${proceduralHierarchyJSON}
    
    === FORUM INTELLIGENCE ===
    ${forumIntelligenceJSON}
    
    === ISSUE INTELLIGENCE ===
    ${issueIntelligenceJSON}
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: AUTHORITY_INTELLIGENCE_PROMPT },
        { role: 'user', content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = chatCompletion.choices[0]?.message?.content || "";
    console.log(`[AI TRACE] [Authority Intelligence Engine] Groq completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Authority Intelligence Engine] Groq extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractAuthorityIntelligence
};
