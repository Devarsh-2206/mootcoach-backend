const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function runTest() {
  console.log("Connecting to Gemini Live...");
  try {
    let session;
    session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: ["AUDIO"],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
      },
      callbacks: {
        onmessage: (data) => {
          console.log("\n[FULL RAW MESSAGE DUMP]:", JSON.stringify(data, null, 2));
          if (data.serverContent) {
            console.log("\n[SERVER CONTENT DUMP]:", JSON.stringify(data.serverContent, null, 2));
            if (data.serverContent.outputTranscription) {
               console.log("[!!! FOUND OUTPUT TRANSCRIPTION !!!]:", data.serverContent.outputTranscription);
            }
          }
        },
        onerror: (err) => console.log("WS Error:", err),
        onclose: (event) => console.log("WS Closed. Code:", event?.code, "Reason:", event?.reason),
      }
    });

    console.log("Connected. Sending a prompt...");
    // Just send a proper realtime payload format
    await session.sendRealtimeInput({ text: "Learned Counsel for the petitioner is present. Please begin the proceedings." });

    setTimeout(() => {
      console.log("Test finished.");
      process.exit(0);
    }, 15000);

  } catch (err) {
    console.error("Test error:", err);
  }
}

runTest();
