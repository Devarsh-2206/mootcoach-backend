const { GoogleGenAI } = require("@google/genai");
const { buildLiveJudgePrompt } = require("../prompts/benchJudgePrompt");
const { createEmptyMemory, evaluateExchange } = require("./memoryEngine");

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

const handleLiveVoiceConnection = async (ws, benchLevel = 'moderate', propositionSummary = '', voiceGender = 'male') => {
  console.log(`🎙️ New voice connection requested by client. Bench: ${benchLevel} | Voice: ${voiceGender}`);

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is not defined in environment variables.");
    ws.send(JSON.stringify({ type: "error", message: "Server configuration error: Gemini API key missing." }));
    ws.close();
    return;
  }

  // Match the spoken voice to the presiding judge's gender (a "Lady Justice"
  // must sound female; a "Lord Justice"/male judge must sound male).
  const voiceName = (String(voiceGender).toLowerCase() === 'female') ? 'Kore' : 'Charon';

  let session;
  const liveSystemInstruction = buildLiveJudgePrompt(benchLevel, propositionSummary);
  
  // Initialize Judicial Memory Engine state for this session
  let benchMemory = createEmptyMemory();
  let currentExchange = "";
  
  console.log("=========================================");
  console.log(`[DEBUG AUDIT] Generating Live Prompt for Bench Level: ${benchLevel}`);
  console.log("=========================================");
  console.log(liveSystemInstruction);
  console.log("=========================================");

  try {
    session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        },
        systemInstruction: {
          parts: [
            {
              text: liveSystemInstruction
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
          try {
            if (message.serverContent) {
              console.log("[DEBUG TRACE] Raw serverContent:", JSON.stringify(message.serverContent, null, 2));
              const { modelTurn, turnComplete, interrupted, outputTranscription } = message.serverContent;
  
              if (outputTranscription?.text) {
                console.log("[TRANSCRIPT DEBUG] outputTranscription:", outputTranscription.text);
                currentExchange += `Judge: ${outputTranscription.text}\n`;
                ws.send(JSON.stringify({
                  type: "text",
                  text: outputTranscription.text
                }));
              }
  
              if (interrupted) {
                console.log("⚡ Gemini was interrupted by user speech.");
                ws.send(JSON.stringify({ type: "interrupted" }));
              }
  
              if (modelTurn && modelTurn.parts) {
                for (const part of modelTurn.parts) {
                  console.log("[DEBUG TRACE] Full Gemini part object:", JSON.stringify(part, null, 2));
                  if (part.inlineData) {
                    ws.send(JSON.stringify({
                      type: "audio",
                      data: part.inlineData.data
                    }));
                  }
                  if (part.text) {
                    console.log("[DEBUG TRACE] Backend forwarding text packet:", part.text.substring(0, 50));
                    ws.send(JSON.stringify({
                      type: "text",
                      text: part.text
                    }));
                  }
                }
              }
  
              if (turnComplete) {
                ws.send(JSON.stringify({ type: "turnComplete" }));
                
                // Trigger Shadow Evaluator asynchronous check
                if (currentExchange.includes("Advocate:")) {
                  const evalBuffer = currentExchange;
                  currentExchange = ""; // Reset for next turn
                  
                  evaluateExchange(benchMemory, evalBuffer).then((result) => {
                    if (result && result.whisperToken) {
                      console.log("[MEMORY ENGINE] Injecting Whisper:", result.whisperToken);
                      // Send the whisper directly into the active voice stream
                      session.sendRealtimeInput({
                        text: result.whisperToken
                      }).catch(e => console.error("Whisper injection failed", e));
                    }
                  });
                }
              }
            }
          } catch (e) {
            console.error("Error in onmessage handler:", e.stack);
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
          currentExchange += `Advocate: ${data.text}\n`;
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
  requestLabel = "AI request",
  groqModel = "openai/gpt-oss-120b",
  // Lets a caller fit Groq's tighter budget without shrinking Gemini's output.
  // Gemini is never sent max_tokens at all, so the two ceilings are unrelated.
  groqMaxTokens = null,
  groqTimeoutMs = 25000,
  groqMaxAttempts = 3,
  geminiTimeoutMs = 90000,
  geminiMaxAttempts = 3,
  geminiBackoffMs = 1500,
  // Ceiling for the WHOLE Gemini chain, not one model.
  //
  // geminiTimeoutMs is per attempt and the chain walks up to six models, but a
  // timeout deliberately does not advance it (see worthSwitching below), so the
  // exposure is not six full timeouts. It is this: several models refuse in a
  // few seconds each, the chain lands on a slow one, and THAT one still gets
  // the full geminiTimeoutMs no matter how much of the request has already
  // gone. Measured on production, two uploads reached 173.8s and 174.1s against
  // a 180s server.requestTimeout - six seconds from being cut mid-flight with
  // nothing to show the advocate.
  //
  // With a budget, the time spent on refusals comes out of the slow model's
  // allowance instead of being added to it.
  //
  // 0 keeps the old uncapped behaviour for the short calls that cannot get
  // anywhere near the limit. The long routes set it explicitly.
  totalBudgetMs = 0
}) {
  const startTime = Date.now();
  console.log(`[AI TRACE] [${requestLabel}] Starting request. Primary provider: ${primaryProvider}`);

  // Groq's free tier caps TOKENS PER MINUTE and counts reserved output
  // (max_tokens) against it. Gemini's free tier caps REQUESTS PER DAY. That
  // asymmetry matters: a Groq limit clears itself in under a minute, a Gemini
  // limit does not clear until the next day. So it is always worth waiting
  // for Groq rather than spending one of 20 daily Gemini calls.
  const groqBudget = Number(process.env.GROQ_TPM_BUDGET || 8000);
  const groqMax = Number(groqMaxTokens || max_tokens || 0);
  const inputTokens = () => Math.ceil(JSON.stringify(messages).length / 4);
  const estimatedTokens = () => inputTokens() + groqMax;

  const runGroq = async () => {
    // Pre-flight: Groq charges input + the FULL max_tokens reservation, and
    // rejects a single request over the per-minute budget outright, whatever
    // the window looks like. Its own error states the arithmetic:
    //
    //   "Limit 8000, Requested 9248"   for a 3,248-token prompt + max_tokens 6000
    //   (returned with x-ratelimit-remaining-tokens: 8000, i.e. an idle window)
    //
    // So a request over budget can never succeed and waiting cannot help.
    // Skip to the fallback rather than burn attempts discovering that.
    const est = estimatedTokens();
    if (est > groqBudget) {
      throw new Error(
        `Groq skipped: request needs ~${est} tokens (input ~${inputTokens()} + max_tokens ${groqMax}) ` +
        `but the per-minute budget is ${groqBudget}.`
      );
    }

    let lastError = null;
    for (let attempt = 0; attempt < groqMaxAttempts; attempt++) {
      try {
        console.log(`[AI TRACE] [${requestLabel}] Attempting Groq (${groqModel}), attempt ${attempt + 1} (~${est} tok)...`);
        const response = await Promise.race([
          groq.chat.completions.create({ model: groqModel, messages, temperature, max_tokens: groqMax, response_format }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Groq API Timeout")), groqTimeoutMs)
          )
        ]);
        const duration = Date.now() - startTime;
        console.log(`[AI TRACE] [${requestLabel}] Groq completed successfully in ${duration}ms.`);
        return {
          provider: "groq",
          model: groqModel,
          text: response.choices[0].message.content.trim(),
          duration
        };
      } catch (err) {
        lastError = err;
        const msg = String((err && err.message) || '');
        const rateLimited = /rate_limit_exceeded|tokens per minute|\bTPM\b|\b429\b/i.test(msg);
        if (!rateLimited || attempt === groqMaxAttempts - 1) throw err;

        // Groq states the exact wait in the error: "Please try again in 12.6075s".
        // Honour it — the budget genuinely refills, so this converts a hard
        // failure into a short pause.
        const stated = msg.match(/try again in ([\d.]+)\s*s/i);
        const waitMs = Math.min(Math.ceil((stated ? parseFloat(stated[1]) : 10) * 1000) + 750, 35000);
        console.warn(`[AI TRACE] [${requestLabel}] Groq rate-limited; waiting ${waitMs}ms then retrying (attempt ${attempt + 2}/${groqMaxAttempts}).`);
        await delay(waitMs);
      }
    }
    throw lastError;
  };

  /**
   * Gemini model fallback.
   *
   * Two separate failures made a single hardcoded model untenable, and both are
   * per-model rather than account-wide:
   *
   *   - Overload. gemini-2.5-flash answered a trivial prompt in 2.5s while
   *     returning 503 "high demand" on the memorial request six times across
   *     three production runs. gemini-3.6-flash served the same request in 29.7s
   *     with all seven sections.
   *   - Daily quota. The free tier's 20 requests/day is counted per model — the
   *     error says so: "limit: 20, model: gemini-2.5-flash". A second model is a
   *     second allowance, which is the difference between the product working in
   *     the afternoon and not.
   *
   * So the primary is unchanged and known-good, and the fallback is tried only
   * when the primary is overloaded or out of quota. A timeout does NOT fall
   * through: that means the work itself is slow, and a second model would be just
   * as slow while spending the caller's remaining budget.
   */
  /**
   * The free tier allows 20 requests per day PER MODEL, so the chain is the
   * day's capacity. Two models was 40 — and a single memorial costs 3 to 7 calls
   * because it is built in passes, so two people trying the product would
   * exhaust it in minutes and everything after would fail with a quota error.
   *
   * Each of these was verified to return valid JSON on a realistic request
   * (3,000 output tokens; a smaller probe wrongly failed the reasoning models,
   * which spend their budget thinking before they emit anything).
   *
   * 2.5-flash stays first because its output is the known quantity the prompts
   * were tuned against; the rest are capacity behind it.
   */
  const GEMINI_MODELS = (process.env.GEMINI_MODELS ||
    'gemini-2.5-flash,gemini-3.6-flash,gemini-3.8-flash,gemini-3-flash-preview,gemini-3.1-flash-lite,gemini-3.5-flash-lite')
    .split(',').map(s => s.trim()).filter(Boolean);

  const runGeminiOn = async (model, attemptTimeoutMs) => {
    let lastError = null;
    const timeoutMs = attemptTimeoutMs || geminiTimeoutMs;

    for (let attempt = 0; attempt < geminiMaxAttempts; attempt++) {
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
            setTimeout(() => reject(new Error(`Gemini Timeout`)), timeoutMs)
          )
        ]);

        const duration = Date.now() - startTime;

        /**
         * An empty body is a FAILURE, even though the SDK did not throw.
         *
         * Observed: a long memorial request came back after 53s logged as
         * "completed successfully" with `Raw text length: undefined`, and the
         * route then failed downstream with "Empty text provided" — which tells
         * nobody anything. Gemini returns a candidate with no text when it stops
         * on MAX_TOKENS, a safety filter or a recitation check, and the finish
         * reason is the only thing that says which.
         *
         * Throwing here puts it on the normal failure path, so it retries and
         * then falls through to the next model instead of surfacing as a 500.
         */
        if (!response || !response.text || !String(response.text).trim()) {
          const cand = (response && response.candidates && response.candidates[0]) || {};
          const why = cand.finishReason || (response && response.promptFeedback && response.promptFeedback.blockReason) || 'no finishReason given';
          throw new Error(`Gemini returned an empty response (${why})`);
        }

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

        if (attempt < geminiMaxAttempts - 1) {
          await new Promise(r => setTimeout(r, geminiBackoffMs * (attempt + 1)));
        }
      }
    }
    throw lastError || new Error("Gemini call failed after all attempts");
  };

  const runGemini = async () => {
    let lastError = null;
    const chainStart = Date.now();
    // Below this there is no point starting another model: it cannot finish,
    // and the time is better spent failing cleanly than being cut mid-flight.
    const MIN_USEFUL_MS = 8000;

    for (let i = 0; i < GEMINI_MODELS.length; i++) {
      const model = GEMINI_MODELS[i];

      let attemptMs = geminiTimeoutMs;
      if (totalBudgetMs > 0) {
        const remaining = totalBudgetMs - (Date.now() - chainStart);
        // The floor only governs whether to start ANOTHER model. The first one
        // always runs, clamped to the budget - a caller who sets a small budget
        // wants a short call, not no call at all.
        if (i > 0 && remaining < MIN_USEFUL_MS) {
          console.warn(`[AI TRACE] [${requestLabel}] Chain budget spent after ${i} model(s); not starting ${model}.`);
          // Always a timeout, never the previous model's refusal. The route
          // classifies on this text: rethrowing a stale 503 would tell the
          // advocate the provider is "briefly overloaded, try again" when
          // what actually happened is that the request ran out of time.
          const why = lastError ? ` (last: ${String(lastError.message).slice(0, 60)})` : '';
          throw new Error(`Gemini Timeout: the model chain used its ${Math.round(totalBudgetMs / 1000)}s budget${why}`);
        }
        // Never let one model borrow time the chain does not have.
        attemptMs = Math.min(geminiTimeoutMs, remaining);
      }

      try {
        return await runGeminiOn(model, attemptMs);
      } catch (err) {
        lastError = err;
        const msg = String((err && err.message) || '');
        /**
         * Worth trying another model when THIS model refused or could not serve
         * it — not when the work is simply slow, because the next model would be
         * just as slow and would spend the caller's remaining budget.
         *
         * RECITATION and SAFETY matter here. Observed drafting a memorial:
         * gemini-2.5-flash returned an empty response with finishReason
         * RECITATION — it judged its own output too close to memorised text,
         * which is a live risk when the task is to quote well-known case law.
         * That is a property of one model's filter, so another model is a real
         * answer to it; before this it fell straight through to Groq, which
         * cannot take a request this size, and the whole issue was lost.
         */
        const worthSwitching = /UNAVAILABLE|\b503\b|high demand|overloaded|RESOURCE_EXHAUSTED|quota|\b429\b|RECITATION|SAFETY|BLOCKLIST|PROHIBITED|empty response/i.test(msg);
        const more = i < GEMINI_MODELS.length - 1;
        if (!worthSwitching || !more) throw err;
        console.warn(`[AI TRACE] [${requestLabel}] ${model} unavailable (${msg.slice(0, 80)}). Trying ${GEMINI_MODELS[i + 1]}...`);
      }
    }
    throw lastError || new Error("Gemini call failed on every model");
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