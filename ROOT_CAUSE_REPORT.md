# ROOT CAUSE REPORT — Bench Simulator Voice Incident

Scope: Evidence-only forensic investigation of Bench Simulator **voice** path.  
Constraint followed: no code changes, no fixes, no refactors.

---

## 1) End-to-End Lifecycle Trace (Evidence)

### 1. User speech -> frontend capture

- `frontend/js/components/benchSimulator.js`
  - `startOralRound()` starts local speech recognition (`startSpeechRecognition()`) at `L771-L773`.
  - `recognition.onresult` captures final user speech at `L1207-L1221`.
  - Final transcript is produced at `L1225-L1231`.

### 2. Frontend event -> websocket event

- `frontend/js/components/benchSimulator.js`
  - If socket not open, fallback send path `sendSpeechText(finalTranscript)` at `L1244-L1247`.
- `frontend/js/services/audioEngine.js`
  - `sendSpeechText()` reconnects if needed (`await reconnectWebSocketPromise`) at `L370-L374`.
  - Sends websocket text payload `{ type: "text", text }` at `L376-L381`.
  - Primary mic audio streaming path sends `{ type: "audio", data }` via worklet at `L514-L521`.

### 3. Backend processing

- `server.js`
  - `/ws/voice` routes to `handleLiveVoiceConnection(ws)` at `L615-L617`.
- `services/geminiService.js`
  - Creates Gemini Live session via `ai.live.connect(...)` at `L74-L141`.
  - Forwards client text/audio to Gemini via `session.sendRealtimeInput(...)` at `L150-L173`.

### 4. Gemini response -> frontend websocket receive

- `services/geminiService.js`
  - Sends `audio` parts to client at `L111-L115`.
  - Sends `text` parts to client at `L117-L121`.
  - Sends `interrupted` at `L104-L107`.
  - Sends `turnComplete` at `L126-L127`.
- `frontend/js/services/audioEngine.js`
  - `voiceWebSocket.onmessage` handler at `L228`.
  - `audio` branch at `L235-L242`.
  - `text` branch at `L243-L246`.
  - `interrupted` branch at `L247-L254`.
  - `turnComplete` branch at `L254-L269`.

### 5. Transcript generation

- `frontend/js/components/benchSimulator.js`
  - Streaming text accumulation in `onText` at `L815-L820`.
  - Final transcript append on turn complete via `appendTranscript('judge', cleanResponse)` at `L831-L836`.
  - Interrupted partial transcript append at `L867-L875`.
  - Transcript rendering function `appendTranscript(...)` at `L964+`.

### 6. TTS generation and audio playback

- Local TTS path:
  - `playJudgeAudio(...)` uses browser `speechSynthesis` at `L543-L583`.
  - Sentence-chunk TTS trigger in `onText` at `L821-L827`.
  - Trailing TTS trigger in `onTurnComplete` at `L841-L848`.
- Gemini audio playback path:
  - `scheduleVoicePlayback(...)` exists in `audioEngine.js` at `L132-L177`.
  - It is only invoked from `turnComplete` flush loop at `L261-L263` (fed by `audioChunksBuffer`).

---

## 2) Evidence Inventory: Buffers, Queues, Awaits, Locks/Flags

### A) Response buffering / transcript accumulation

- `benchSimulator.js`
  - `fullJudgeResponse` (per-turn text accumulator) declared/used at `L721`, `L818`, `L832`, reset `L864`.
  - `sentenceBuffer` global used for sentence chunking (`L36`, `L819`, reset `L828`, `L865`, `L880`, `L908`).

### B) Audio buffering / queueing

- `audioEngine.js`
  - `audioChunksBuffer` declared `L18`.
  - `voicePlaybackSources` playback queue list declared `L12`, appended `L162`, drained `L165-L170`.
  - `voiceNextPlayTime` scheduling cursor declared `L11`, advanced `L160`.
  - `isAudioBuffering` declared `L19`, toggled `L95`, `L250`, `L260`, `L399`.
  - `isTurnCompleteReceived` declared `L16`, toggled `L94`, `L171`, `L256`, `L396`.

### C) Await points

- `benchSimulator.js`
  - `await engineStartOralRound(...)` at `L776`.
- `audioEngine.js`
  - `await reconnectWebSocketPromise(...)` in send path at `L373`.
  - startup awaits:
    - `await logAudioDevices()` at `L403`
    - `await voiceAudioContext.resume()` at `L410-L414`
    - `await getUserMedia(...)` at `L423-L429`
    - `await audioWorklet.addModule(...)` at `L434`
- `geminiService.js`
  - `await ai.live.connect(...)` at `L74`
  - `await session.sendRealtimeInput(...)` at `L154`, `L163`, `L167`

### D) Locks/state flags/session guards

- `benchSimulator.js`
  - `voiceSessionActive` guard at `L705-L708`.
  - `localTtsSpeaking` guard in status flow at `L784-L789`.
  - `currentBenchState` gate for recognition start at `L1132-L1135`.
- `audioEngine.js`
  - `voiceSessionActive` state at `L9`, set `L391`, unset `L543`.
  - reconnection singleton `reconnectionPromise` at `L23`, `L357-L368`.
  - `activeCallbacks` session callback reference `L21`, set `L400`, cleared `L586`.
- `server.js`
  - websocket heartbeat liveness via `ws.isAlive` at `L610-L613`, `L622-L631`.

---

## 3) Determinations Requested

### Q1. What triggers actual audio playback?

Two independent trigger paths exist:

1. **Local browser TTS (dominant audible path)**  
   - Triggered by incoming text chunks in `benchSimulator.onText` at `L821-L827`.
   - Also triggered on trailing text in `onTurnComplete` at `L841-L848`.
   - Executes `speechSynthesis.speak(...)` in `playJudgeAudio` at `L582`.

2. **Gemini streamed audio path (engine path)**
   - Audio packets decoded at `audioEngine.onmessage` `audio` branch (`L235-L241`).
   - Playback function `scheduleVoicePlayback` exists (`L132-L177`) but is only called from `turnComplete` flush (`L261-L263`) of `audioChunksBuffer`.

### Q2. Does playback wait for transcript completion?

- **Local TTS:** does **not** wait for transcript rendering completion by design.
  - TTS call in `onText` (`L826`) occurs before `onTurnComplete` transcript append (`L835`).
- **However**, local TTS can wait on punctuation/turn completion:
  - Sentence trigger checks punctuation in incoming chunk (`/[.?!]/`) at `L821-L823`.
  - If punctuation not seen in chunk, playback deferred until `onTurnComplete` trailing handling (`L841-L848`).

### Q3. Does transcript rendering block audio generation?

- No direct hard dependency/await between transcript rendering and audio generation.
- `appendTranscript(...)` is synchronous DOM work (`L964+`), but not awaited anywhere.
- Therefore transcript rendering can add main-thread cost but is not a gating condition for TTS start.

### Q4. Are websocket listeners duplicated?

- Evidence indicates explicit listener replacement/cleanup:
  - `setupWebSocketHandlers(...)` assigns `voiceWebSocket.onopen/onmessage/...` directly (`L182`, `L228`, `L279`, `L286`).
  - Reconnect path nulls old handlers before close (`L322-L326`).
  - Stop path also nulls handlers (`L554-L558`).
- Conclusion: no direct evidence of cumulative duplicate `onmessage` handlers on a single socket object.

### Q5. Are multiple judge sessions active simultaneously?

- Frontend guard exists:
  - `benchSimulator.startOralRound` stops existing session if `voiceSessionActive` true (`L705-L707`).
  - `audioEngine.startOralRound` sets one module-level `voiceSessionActive` (`L391`), stop resets (`L543`).
  - Reconnect reuses singleton `voiceWebSocket` variable (`L4`) and closes old socket (`L320-L329`).
- No direct evidence of parallel active client judge sessions from code path.

---

## 4) Root-Cause Findings (Evidence-backed)

## Finding F1 — **Primary latency / no-speech source: broken Gemini audio playback pipeline**

- **Files / functions / lines**
  - `frontend/js/services/audioEngine.js`
    - `voiceWebSocket.onmessage` audio branch decodes and calls `onAudio(float32Data)` at `L235-L242`.
    - `scheduleVoicePlayback(...)` exists at `L132-L177`.
    - Playback scheduler is only invoked from turnComplete flush loop `audioChunksBuffer.forEach(...)` at `L261-L263`.
    - `audioChunksBuffer` declared at `L18` and cleared/reset in multiple places (`L96`, `L251`, `L264`, `L398`) but **no push into this buffer is present in onmessage audio branch**.
- **Exact latency source**
  - Incoming Gemini audio is received but not directly scheduled, and buffering/flush path has no feed point.
- **Operational symptom alignment**
  - Explains "sometimes judge never speaks" when relying on Gemini audio path.
  - UI can still show "Judge Speaking" and bars animate from status events (`onStatusChange('speaking')` at `L238`) even if no audible output.
- **Transcript involvement**
  - Indirect. This defect is in audio path wiring, not transcript rendering.
- **Would removing transcript rendering alone solve?**
  - **No.** The missing/unused audio scheduling path remains.
- **Confidence**
  - **0.98 (Very High)**

## Finding F2 — **5–10s+ delay source: local TTS is chunk-punctuation/turnComplete gated**

- **Files / functions / lines**
  - `frontend/js/components/benchSimulator.js`
    - `onText` appends to `sentenceBuffer` at `L819`.
    - TTS only starts when current chunk matches punctuation at `L821-L827`.
    - Otherwise speech deferred to `onTurnComplete` trailing branch `L841-L848`.
    - `playJudgeAudio` invokes `speechSynthesis.speak` at `L582`.
- **Exact latency source**
  - If streamed text chunks arrive without punctuation boundaries (or punctuation arrives late), local TTS is delayed until later chunks or `turnComplete`.
- **Operational symptom alignment**
  - Explains delayed judge voice despite visible "Judge Speaking"/animated bars/transcript events.
- **Transcript involvement**
  - Same text accumulator (`fullJudgeResponse`/`sentenceBuffer`) is used for transcript and TTS timing, so transcript-related text-flow changes can impact TTS timing.
- **Would removing transcript rendering alone solve?**
  - **No.** Delay is tied to chunk punctuation and turnComplete gating, not DOM transcript append.
- **Confidence**
  - **0.93 (High)**

## Finding F3 — **Duplicate opening statements source: dual opening generators**

- **Files / functions / lines**
  - `frontend/js/components/benchSimulator.js`
    - Local opening statement generated and spoken in `triggerJudgeOpeningStatement()` at `L585-L600`.
    - Triggered on engine status `ready` at `L781-L783`.
  - `frontend/js/services/audioEngine.js`
    - On socket open, sends priming prompt text to backend at `L213-L224`.
- **Exact duplicate-response source**
  - One local opening is spoken directly in frontend, while another opening/question is requested from backend model via priming prompt immediately on WS open.
- **Operational symptom alignment**
  - Directly explains "sometimes duplicate opening statements occur."
- **Transcript involvement**
  - Not required for duplication; duplication exists at orchestration level.
- **Would removing transcript rendering alone solve?**
  - **No.** Dual-opening trigger remains.
- **Confidence**
  - **0.97 (Very High)**

## Finding F4 — **Potential no-speech case when text stream absent/incomplete**

- **Files / functions / lines**
  - `benchSimulator` local TTS path depends on text events: `onText` `L815-L829`, `onTurnComplete` trailing text `L841-L848`.
  - `geminiService` emits both `audio` and `text` parts conditionally (`L111-L121`), no guarantee every response has text part.
- **Exact latency/no-audio source**
  - If model emits audio but little/no text, local TTS path may not trigger.
  - Combined with F1 (audio scheduling gap), this can produce silence.
- **Transcript involvement**
  - Yes, because local speech path is text-driven and tied to transcript accumulator.
- **Would removing transcript rendering alone solve?**
  - **No.**
- **Confidence**
  - **0.86 (High)**

## Finding F5 — **No direct evidence of duplicated websocket listeners or concurrent sessions**

- **Files / functions / lines**
  - Listener assignment and cleanup:
    - `setupWebSocketHandlers` assignments `L182-L310`
    - reconnect cleanup `L322-L326`
    - stop cleanup `L554-L558`
  - Session guards:
    - `benchSimulator.startOralRound` guard `L705-L707`
    - `audioEngine.voiceSessionActive` lifecycle `L391`, `L543`
- **Conclusion**
  - Current code evidence does not show listener accumulation or parallel active client sessions as primary causes.
- **Confidence**
  - **0.79 (Moderate-High)** (runtime race conditions can still occur, but no static evidence of direct duplication).

---

## 5) Direct Answers to Requested Items

### A. Exact file names

- `frontend/js/components/benchSimulator.js`
- `frontend/js/services/audioEngine.js`
- `services/geminiService.js`
- `server.js`
- `frontend/pcm-processor.js` (capture transform path context)

### B. Exact functions

- `startOralRound`, `triggerJudgeOpeningStatement`, `playJudgeAudio`, `appendTranscript`, `safeStartRecognition`, speech recognition callbacks (`onresult`, `onend`)
- `setupWebSocketHandlers`, `scheduleVoicePlayback`, `sendSpeechText`, `reconnectWebSocket`, `startOralRound` (engine), `stopOralRound` (engine)
- `handleLiveVoiceConnection`

### C. Exact line numbers

Included inline in each finding and lifecycle section above.

### D. Exact latency source

- Punctuation/turn-complete-gated local TTS in `benchSimulator.js` `L821-L827`, `L841-L848`.
- Additional latency from reconnect-await send path `audioEngine.js` `L370-L374` when socket not open.

### E. Exact duplicate-response source

- Dual opening generators:
  - local opening TTS `benchSimulator.js` `L585-L600`
  - backend priming prompt send `audioEngine.js` `L213-L224`

### F. Whether transcript logic is involved

- **Yes, partially.**  
  Transcript/text accumulation (`fullJudgeResponse`, `sentenceBuffer`) is shared with local TTS timing logic.

### G. Whether removing transcript rendering alone would solve

- **No.**  
  Core issues remain: broken Gemini audio playback path and dual opening orchestration.

### H. Confidence score for each finding

- F1: 0.98  
- F2: 0.93  
- F3: 0.97  
- F4: 0.86  
- F5: 0.79

