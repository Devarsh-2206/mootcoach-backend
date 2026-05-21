const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Disable safety filters to allow criminal/legal facts
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = (promise, ms = 120000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Gemini timeout: Document too large or service slow")), ms)
    ),
  ]);
};

const generateAIResponse = async (prompt, retries = 2) => {
  // THE FIX: gemini-pro (1.0) is universally available and supports ~120,000 characters
  const model = genAI.getGenerativeModel({ 
    model: "gemini-pro", 
    safetySettings 
  });

  // Strict prompt to enforce JSON since we removed the MimeType config
  const fullPrompt = `${prompt}\n\nCRITICAL INSTRUCTION: You must respond ONLY with a valid, parseable JSON object. Do not include markdown blocks (like \`\`\`json). Do not include any text before or after the JSON.`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(
        model.generateContent(fullPrompt),
        120000 // 2 minutes
      );

      const response = result?.response?.text?.();

      if (!response || response.trim().length === 0) {
        throw new Error("Empty Gemini response");
      }

      return response;
    } catch (error) {
      console.error(`Gemini attempt ${attempt + 1} failed:`, error.message);
      
      if (error.message.includes("404") || error.message.includes("API key")) {
        throw error; // Fatal error, don't retry
      }

      if (attempt < retries) {
        await delay(2000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
};

module.exports = { generateAIResponse };