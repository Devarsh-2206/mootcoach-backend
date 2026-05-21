const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Disable safety filters so it doesn't block legal/criminal facts
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
  // THE FIX: Using the universally available gemini-1.5-flash
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash", 
    safetySettings,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1 // Low temp for stable JSON formatting
    }
  });

  // Force AI to return pure JSON without markdown wrappers
  const fullPrompt = `${prompt}\n\nIMPORTANT: Return ONLY the JSON object. Do not include markdown or conversational text.`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(
        model.generateContent(fullPrompt),
        120000 // 2 minute timeout for massive PDFs
      );

      const response = result?.response?.text?.();

      if (!response || response.trim().length === 0) {
        throw new Error("Empty Gemini response");
      }

      return response;
    } catch (error) {
      console.error(`Gemini attempt ${attempt + 1} failed:`, error.message);
      
      // If it's a 404 or auth error, stop retrying
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