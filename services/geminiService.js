const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = (promise, ms = 25000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Gemini timeout")), ms)
    ),
  ]);
};

const generateAIResponse = async (prompt, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(
        model.generateContent(prompt),
        25000
      );

      const response = result?.response?.text?.();

      if (!response || response.trim().length === 0) {
        throw new Error("Empty Gemini response");
      }

      return response;
    } catch (error) {
      console.error(
        `Gemini attempt ${attempt + 1} failed:`,
        error.message
      );

      if (attempt < retries) {
        await delay(800 * (attempt + 1));
        continue;
      }

      return JSON.stringify({
        error: true,
        message: "AI analysis temporarily unavailable",
      });
    }
  }
};
module.exports = { generateAIResponse };