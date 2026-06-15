const Groq = require('groq-sdk');
const FORUM_INTELLIGENCE_PROMPT = require('../prompts/forumIntelligencePrompt');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function extractForumIntelligence(propositionIntelligenceJSON, proceduralHierarchyJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Forum Intelligence Engine] Starting Groq request...");
    
    const userMessage = `Here is the extracted Proposition Intelligence and Procedural Hierarchy.
    Determine the exact adjudicatory body, applicable procedural rules, burden of proof, and terminology overrides for this forum:
    
    === PROPOSITION INTELLIGENCE ===
    ${propositionIntelligenceJSON}
    
    === PROCEDURAL HIERARCHY ===
    ${proceduralHierarchyJSON}
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: FORUM_INTELLIGENCE_PROMPT },
        { role: 'user', content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = chatCompletion.choices[0]?.message?.content || "";
    console.log(`[AI TRACE] [Forum Intelligence Engine] Groq completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Forum Intelligence Engine] Groq extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractForumIntelligence
};
