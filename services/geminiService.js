const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
  ];

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(
        ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            safetySettings
          }
        }),
        120000 // 2 minutes
      );

      const response = result?.text;

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

const handleLiveVoiceConnection = async (ws) => {
  console.log("🎙️ New voice connection requested by client.");

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is not defined in environment variables.");
    ws.send(JSON.stringify({ type: "error", message: "Server configuration error: Gemini API key missing." }));
    ws.close();
    return;
  }

  let session;

  try {
    session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: ["AUDIO"],
        systemInstruction: {
          parts: [
            {
              text: `You are a strict, intimidating, and hostile Appellate Court Judge presiding over a high-stakes moot court competition. You have no patience for fluff, rhetorical gestures without legal substance, or assertions lacking citations to governing precedents or statutes.

Actively listen to the advocate. If they make an assertion of law or fact, demand the case name or section citation immediately. You are authorized to verbally cross-examine and cut across the advocate mid-sentence (interrupted speech) if their assertions lack precision, grounding, or clear legal backing.

Keep your responses short, sharp, and interrogative. Challenge their locus standi, jurisdictional claims, and interpretation of precedents. Never break character. Speak as a judge during a hearing.`
            }
          ]
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false
          }
        }
      },
      callbacks: {
        onopen: () => {
          console.log("🔗 Live connection established with Gemini API.");
          ws.send(JSON.stringify({ type: "status", status: "connected" }));
        },
        onmessage: (message) => {
          if (message.serverContent) {
            const { modelTurn, turnComplete, interrupted } = message.serverContent;

            if (interrupted) {
              console.log("⚡ Gemini was interrupted by user speech.");
              ws.send(JSON.stringify({ type: "interrupted" }));
            }

            if (modelTurn && modelTurn.parts) {
              for (const part of modelTurn.parts) {
                if (part.inlineData) {
                  ws.send(JSON.stringify({
                    type: "audio",
                    data: part.inlineData.data
                  }));
                }
                if (part.text) {
                  ws.send(JSON.stringify({
                    type: "text",
                    text: part.text
                  }));
                }
              }
            }

            if (turnComplete) {
              ws.send(JSON.stringify({ type: "turnComplete" }));
            }
          }
        },
        onerror: (error) => {
          console.error("❌ Gemini Live Session Error:", error);
          ws.send(JSON.stringify({ type: "error", message: "Gemini voice session error." }));
        },
        onclose: (event) => {
          console.log("🔌 Gemini Live Session Closed:", event.reason || "No reason given");
          ws.send(JSON.stringify({ type: "status", status: "disconnected" }));
          ws.close();
        }
      }
    });

  } catch (err) {
    console.error("❌ Failed to establish Gemini Live Session:", err);
    ws.send(JSON.stringify({ type: "error", message: "Failed to connect to the AI Judge. Please check your API key." }));
    ws.close();
    return;
  }

  ws.on("message", async (message, isBinary) => {
    try {
      if (isBinary) {
        const base64Audio = message.toString("base64");
        await session.sendRealtimeInput({
          audio: {
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000"
          }
        });
      } else {
        const data = JSON.parse(message.toString());
        if (data.type === "text") {
          await session.sendRealtimeInput({
            text: data.text
          });
        } else if (data.type === "audio" && data.data) {
          await session.sendRealtimeInput({
            audio: {
              data: data.data,
              mimeType: "audio/pcm;rate=16000"
            }
          });
        }
      }
    } catch (sendErr) {
      console.error("Error processing message from client:", sendErr);
    }
  });

  ws.on("close", () => {
    console.log("🔌 Client disconnected, closing Gemini Live Session.");
    try {
      session.close();
    } catch (e) {
      // Ignore if already closed
    }
  });

  ws.on("error", (err) => {
    console.error("❌ Client socket error:", err);
  });
};

module.exports = { generateAIResponse, handleLiveVoiceConnection };