const Groq = require('groq-sdk');
const PROCEDURAL_HIERARCHY_PROMPT = require('../prompts/proceduralHierarchyPrompt');
// Actually, server.js exports extractAndParseJSON ? Let's check or just replicate the call structure.
// I will not import from server to avoid circular dependency, I'll pass the intelligence object to a function.

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function extractProceduralHierarchy(propositionIntelligenceJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Procedural Hierarchy Engine] Starting Groq request...");
    
    const userMessage = `Here is the extracted Proposition Intelligence. Analyze the issues and forum, and map them into the required Procedural Hierarchy schema:
    
    ${propositionIntelligenceJSON}
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: PROCEDURAL_HIERARCHY_PROMPT },
        { role: 'user', content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = chatCompletion.choices[0]?.message?.content || "";
    console.log(`[AI TRACE] [Procedural Hierarchy Engine] Groq completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Procedural Hierarchy Engine] Groq extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractProceduralHierarchy
};
