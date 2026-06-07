const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listModels() {
  try {
    const response = await ai.models.list();
    const models = response.pageInternal || response.models || response.data || response;
    
    // just print all model names that contain 'live'
    if (Array.isArray(models)) {
       for (const model of models) {
         if (model.name.includes("live") || model.name.includes("flash")) {
           console.log(model.name, "live_api:", JSON.stringify(model).includes("live"));
         }
       }
    }
  } catch (err) {
    console.error(err);
  }
}
listModels();
