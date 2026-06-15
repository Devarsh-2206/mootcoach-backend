const Groq = require('groq-sdk');
const ISSUE_INTELLIGENCE_PROMPT = require('../prompts/issueIntelligencePrompt');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function extractIssueIntelligence(propositionIntelligenceJSON, proceduralHierarchyJSON, forumIntelligenceJSON) {
  try {
    const startTime = Date.now();
    console.log("[AI TRACE] [Issue Intelligence Engine] Starting Groq request...");
    
    const userMessage = `Here is the extracted Proposition Intelligence, Procedural Hierarchy, and Forum Intelligence.
    Iterate through the identified issues and construct the deep Issue Intelligence matrix.
    
    === PROPOSITION INTELLIGENCE ===
    ${propositionIntelligenceJSON}
    
    === PROCEDURAL HIERARCHY ===
    ${proceduralHierarchyJSON}
    
    === FORUM INTELLIGENCE ===
    ${forumIntelligenceJSON}
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: ISSUE_INTELLIGENCE_PROMPT },
        { role: 'user', content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = chatCompletion.choices[0]?.message?.content || "";
    console.log(`[AI TRACE] [Issue Intelligence Engine] Groq completed successfully in ${Date.now() - startTime}ms.`);
    return content;

  } catch (error) {
    console.error("[AI TRACE] [Issue Intelligence Engine] Groq extraction failed:", error.message);
    throw error;
  }
}

module.exports = {
  extractIssueIntelligence
};
