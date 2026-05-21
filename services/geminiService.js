const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Completely disable safety filters so it doesn't block criminal/legal facts
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-pro", // Switching to Pro for maximum legal reasoning depth
  safetySettings,
  generationConfig: {
    responseMimeType: "application/json",
  }
});

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
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(
        model.generateContent(prompt),
        120000 // Extended to 2 full minutes
      );

      const response = result?.response?.text?.();

      if (!response || response.trim().length === 0) {
        throw new Error("Empty Gemini response - likely blocked by an internal filter.");
      }

      return response;
    } catch (error) {
      console.error(`Gemini attempt ${attempt + 1} failed:`, error.message);
      
      // If it's a 404 or authentication error, do not retry, fail immediately
      if (error.message.includes("404") || error.message.includes("API key")) {
        throw error;
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