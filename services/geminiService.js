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
              text: `You are a sitting Justice on a 5-Judge Constitutional Bench of the Supreme Court of India hearing a complex writ petition. You are evaluating profound questions of public law, fundamental rights (Articles 14, 19, 21), and constitutional validity.

ROLE & TONE:
- You are a Supreme Court Justice: intellectually rigorous, exacting, and procedurally strict.
- You are heavily focused on constitutional doctrine, Indian jurisprudence, statutory interpretation, and binding precedents (e.g., Kesavananda Bharati, Puttaswamy).
- Your tone is sharp, probing, and distinctly formal in the Indian legal tradition.
- Address the user as "Mr. Counsel" or "Learned Counsel".

BEHAVIOUR & ENGAGEMENT:
- Challenge unsupported assertions instantly. Do not allow counsel to gloss over weak points.
- Demand exact authorities: "Where is your authority for that proposition?" or "Which paragraph of that judgment are you relying upon?"
- Use hypotheticals to test the limits of their argument: "Assume we disagree with you. What follows?"
- Keep your interventions short and piercing. Ask only one question at a time.
- Frequently interrupt if counsel is evasive.

RESTRICTIONS (CRITICAL):
- NEVER act like a trial court judge. There are no witnesses, no juries, and no evidence taking.
- NEVER use American or British trial-court terminology.
- NEVER say: "Step down", "You are dismissed", "Next appeal", "Court is in recess", "Overruled", or "Sustained".
- NEVER break character. You are not judging a moot court; you are hearing a live constitutional matter.
- Avoid long speeches or motivational language. Do not praise the counsel.`
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

const Groq = require("groq-sdk");
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

function convertMessagesToGemini(messages) {
  let systemInstruction = "";
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction += (systemInstruction ? "\n" : "") + msg.content;
    } else {
      const role = msg.role === "assistant" ? "model" : "user";
      contents.push({
        role: role,
        parts: [{ text: msg.content }]
      });
    }
  }

  // Gemini requires at least one content block if there is a request.
  // If the contents array is empty, we must inject a placeholder or handle it safely.
  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [{ text: "Process the system instructions." }]
    });
  }

  return { systemInstruction, contents };
}

async function getChatCompletion({
  messages,
  temperature = 0.1,
  max_tokens = 4000,
  response_format = { type: "json_object" },
  primaryProvider = "gemini",
  requestLabel = "AI request"
}) {
  const startTime = Date.now();
  console.log(`[AI TRACE] [${requestLabel}] Starting request. Primary provider: ${primaryProvider}`);

  const runGroq = async () => {
    console.log(`[AI TRACE] [${requestLabel}] Attempting Groq (llama-3.3-70b-versatile)...`);
    const response = await Promise.race([
      groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature,
        max_tokens,
        response_format
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Groq API Timeout")), 25000)
      )
    ]);
    const duration = Date.now() - startTime;
    console.log(`[AI TRACE] [${requestLabel}] Groq completed successfully in ${duration}ms.`);
    return {
      provider: "groq",
      model: "llama-3.3-70b",
      text: response.choices[0].message.content.trim(),
      duration
    };
  };

  const runGemini = async () => {
    const model = "gemini-2.5-flash";
    let lastError = null;

    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        console.log(`[AI TRACE] [${requestLabel}] Attempting Gemini (${model}), attempt ${attempt + 1}...`);
        const { systemInstruction, contents } = convertMessagesToGemini(messages);
        
        const response = await Promise.race([
          ai.models.generateContent({
            model: model,
            contents,
            config: {
              responseMimeType: response_format?.type === "json_object" ? "application/json" : "text/plain",
              systemInstruction,
              temperature
            }
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini Timeout`)), 90000)
          )
        ]);
        
        const duration = Date.now() - startTime;
        console.log(`[AI TRACE] [${requestLabel}] Gemini (${model}) completed successfully in ${duration}ms. Raw text length: ${response.text?.length}`);
        console.log(`[AI TRACE] [${requestLabel}] Raw response:`, response.text);
        return {
          provider: "gemini",
          model: model,
          text: response.text?.trim(),
          duration
        };
      } catch (err) {
        console.warn(`[AI TRACE] [${requestLabel}] Gemini (${model}) attempt ${attempt + 1} failed: ${err.message}`);
        lastError = err;
        
        // Fatal error (like auth error/API key error), don't retry
        if (err.message.includes("API key") || err.message.includes("403") || err.message.includes("404")) {
          throw err;
        }
        
        if (attempt < 2) {
          // Wait 1.5 seconds, then 3 seconds
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error("Gemini call failed after all attempts");
  };

  if (primaryProvider === "gemini") {
    try {
      return await runGemini();
    } catch (geminiError) {
      console.warn(`[AI TRACE] [${requestLabel}] Gemini failed: ${geminiError.message}. Falling back to Groq...`);
      try {
        return await runGroq();
      } catch (groqError) {
        console.error(`[AI TRACE] [${requestLabel}] Both providers failed. Groq error: ${groqError.message}`);
        throw new Error(`AI providers exhausted. Gemini: ${geminiError.message}. Groq: ${groqError.message}`);
      }
    }
  } else {
    try {
      return await runGroq();
    } catch (groqError) {
      console.warn(`[AI TRACE] [${requestLabel}] Groq failed: ${groqError.message}. Falling back to Gemini...`);
      try {
        return await runGemini();
      } catch (geminiError) {
        console.error(`[AI TRACE] [${requestLabel}] Both providers failed. Gemini error: ${geminiError.message}`);
        throw new Error(`AI providers exhausted. Groq: ${groqError.message}. Gemini: ${geminiError.message}`);
      }
    }
  }
}

module.exports = { generateAIResponse, handleLiveVoiceConnection, getChatCompletion };