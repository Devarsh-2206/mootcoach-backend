const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// FIX: Define the model! Using Gemini 1.5 Flash for fast, massive document processing.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Bumped timeout to 60 seconds (60000ms) because reading full PDFs takes time
const withTimeout = (promise, ms = 60000) => {
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
        60000
      );

      const response = result?.response?.text?.();

      if (!response || response.trim().length === 0) {
        throw new Error("Empty Gemini response");
      }

      return response;
    } catch (error) {
      console.error(`Gemini attempt ${attempt + 1} failed:`, error.message);

      if (attempt < retries) {
        await delay(1000 * (attempt + 1));
        continue;
      }

      throw error; // Throw to server.js so it can return a 500 error to the frontend
    }
  }
};

module.exports = { generateAIResponse };