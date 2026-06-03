# Bench Simulator Voice Pipeline Audit

## 1) Complete Data Flow

1. User clicks `Start Oral Round (Voice)` in `frontend/index.html`.
2. Frontend entrypoint `startOralRound()` in `frontend/js/components/benchSimulator.js`:
   - Resets voice/session UI state.
   - Starts browser speech recognition (`startSpeechRecognition()`).
   - Calls engine `engineStartOralRound(...)` from `frontend/js/services/audioEngine.js`.
3. Engine boot in `audioEngine.startOralRound()`:
   - Opens WebSocket to `${BASE_URL}/ws/voice`.
   - Creates `AudioContext`.
   - Requests microphone via `navigator.mediaDevices.getUserMedia(...)`.
   - Loads `frontend/pcm-processor.js` audio worklet.
   - Streams PCM mic frames to backend as WebSocket JSON `{ type: "audio", data: <base64 PCM16@16k> }`.
4. Backend socket ingress in `server.js`:
   - `WebSocketServer` accepts connection.
   - Routes `/ws/voice` to `handleLiveVoiceConnection(ws)` in `services/geminiService.js`.
5. Gemini Live session in `geminiService.handleLiveVoiceConnection()`:
   - Opens `ai.live.connect(...)` with model `gemini-3.1-flash-live-preview`.
   - Forwards incoming client audio/text to `session.sendRealtimeInput(...)`.
   - Receives Gemini streaming server content (`modelTurn`, `interrupted`, `turnComplete`).
   - Emits downstream events to client:
     - `audio` chunks
     - `text` chunks
     - `interrupted`
     - `turnComplete`
6. Frontend receive path in `audioEngine.setupWebSocketHandlers()`:
   - `audio`: decode base64 PCM16 to Float32, schedule buffered playback via Web Audio.
   - `text`: pass token/chunk to bench layer callback.
   - `interrupted`: stop scheduled playback + reset buffers.
   - `turnComplete`: flush buffered audio, finalize turn lifecycle.
7. Judge response rendering + speech in `benchSimulator` callbacks:
   - `onText`: accumulate judge text chunks and chunk by sentence boundaries.
   - `playJudgeAudio(...)` uses browser `speechSynthesis` (local TTS) for each sentence/trailing text.
   - `appendTranscript('judge', ...)` writes judge output to courtroom transcript panel.
8. Playback completion:
   - After local TTS completion, state returns to `listening`.
   - Frontend restarts speech recognition (`safeStartRecognition()`).
9. Interruption handling:
   - If Gemini flags interruption, frontend cancels browser TTS and truncates transcript with ellipsis.
   - If frontend enters speaking/processing states, local recognition is aborted/stopped to reduce self-capture.


## 2) Frontend Files Involved

- `frontend/index.html`
  - Bench stage UI, controls, transcript panel, waveform/mic meter, voice status badge.
  - Voice action controls: `startOralRound()` and `stopOralRound()`.
- `frontend/js/components/benchSimulator.js`
  - Primary voice session orchestration.
  - Web Speech API capture pipeline (`SpeechRecognition` / `webkitSpeechRecognition`).
  - Transcript update logic.
  - Local TTS synthesis (`speechSynthesis` + `SpeechSynthesisUtterance`).
  - State machine (`connecting`, `mic_ready`, `listening`, `processing`, `speaking`, `ended`).
- `frontend/js/services/audioEngine.js`
  - Realtime transport and audio stream plumbing.
  - WebSocket client (`/ws/voice`) lifecycle, reconnect, heartbeat.
  - Mic stream capture via `getUserMedia`.
  - Audio worklet wiring and PCM transport.
  - Incoming Gemini audio decoding + scheduling.
- `frontend/pcm-processor.js`
  - AudioWorklet processor converting mic Float32 to PCM16.
  - Downsamples to 16kHz for Gemini Live input format.
- `frontend/js/config.js`
  - `BASE_URL` source that determines ws/wss endpoint derivation.
- `frontend/js/app.js`
  - Exposes `startOralRound`/`stopOralRound` to `window` for inline button handlers.


## 3) Backend Files Involved

- `server.js`
  - Creates `WebSocketServer` bound to Express HTTP server.
  - Routes `/ws/voice*` connections to `handleLiveVoiceConnection`.
  - Adds socket heartbeat ping/pong liveness checks.
- `services/geminiService.js`
  - `handleLiveVoiceConnection(ws)`:
    - Establishes Gemini Live session.
    - Bridges client realtime input (audio/text) to Gemini.
    - Bridges Gemini realtime output (audio/text/interruption/turn completion) back to client.

Note: Text bench route `POST /simulate-bench` is separate and not used by the voice path.


## 4) Socket / WebSocket Events

### Client -> Backend (`/ws/voice`)

- `{ "type": "ping" }`
  - Sent every 5s from frontend heartbeat.
- `{ "type": "text", "text": "..." }`
  - Priming and transcript fallback sends.
- `{ "type": "audio", "data": "<base64 PCM16@16k>" }`
  - Realtime mic frame stream from AudioWorklet.

### Backend -> Client

- `{ "type": "status", "status": "connected" | "disconnected" }`
- `{ "type": "audio", "data": "<base64 PCM>" }`
  - Gemini-generated audio stream chunks.
- `{ "type": "text", "text": "..." }`
  - Gemini text stream chunks.
- `{ "type": "interrupted" }`
  - Gemini interrupted by user speech.
- `{ "type": "turnComplete" }`
  - Gemini completed current response turn.
- `{ "type": "error", "message": "..." }`

### Transport-level keepalive

- Server websocket ping/pong every 30s (`server.js`).
- Client app-level heartbeat ping every 5s (`audioEngine.js`).


## 5) Audio Generation Pipeline

### Input capture path

1. Browser mic captured in `audioEngine.startOralRound()` via `getUserMedia`.
2. Stream enters `AudioContext` -> `MediaStreamSource`.
3. Source connected to `AudioWorkletNode('pcm-processor')`.
4. `pcm-processor.js`:
   - Converts channel float samples to Int16 PCM.
   - Decimates to 16k when hardware sample rate differs.
5. Worklet `port.onmessage` sends base64 PCM frames over WebSocket as `{ type: "audio" }`.

### Model generation path

1. Backend receives client audio/text and forwards to Gemini Live (`session.sendRealtimeInput`).
2. Gemini Live emits `modelTurn.parts` with:
   - `inlineData` (audio),
   - `text` (token/chunk text).

### Output playback path (hybrid)

- **Engine audio path present**:
  - Incoming `audio` chunks are decoded in frontend (`base64ToFloat32Array`) and scheduled in Web Audio (`scheduleVoicePlayback`).
- **Primary audible path in current UI logic**:
  - Bench layer uses local browser TTS (`speechSynthesis`) on received text chunks/sentences via `playJudgeAudio`.
  - Code comment explicitly notes Gemini playback callback is ignored in favor of local SpeechSynthesis callback.

Result: system processes Gemini audio stream and also performs local TTS from Gemini text.


## 6) State Management Flow

Primary state holders:

- `benchSimulator.js`
  - `voiceSessionActive`
  - `currentBenchState`
  - `localTtsSpeaking`
  - `recognition` lifecycle
  - `sentenceBuffer`, `fullJudgeResponse`
- `audioEngine.js`
  - `voiceSessionActive`
  - socket handles (`voiceWebSocket`)
  - playback queues (`voicePlaybackSources`, `voiceNextPlayTime`)
  - turn flags (`isTurnCompleteReceived`, `isAudioBuffering`, `audioChunksBuffer`)

Observed state transitions:

1. `connecting` -> `mic_ready` during start.
2. Engine status `ready` triggers judge opening TTS.
3. Post-opening returns to `listening`; recognition starts/restarts.
4. User speech final transcript -> `processing`; payload sent to backend.
5. Model response -> `speaking`; recognition is stopped/aborted.
6. On TTS completion -> `listening`; recognition resumed.
7. On errors/disconnect/stop -> `ended`.

Session stop path:

- `benchSimulator.stopOralRound()` resets UI and recognition/TTS.
- Delegates to `audioEngine.stopOralRound()` to close socket, stop media tracks, close audio context, clear playback queues.


## 7) Potential Latency Bottlenecks

- Dual speech stack overhead:
  - Simultaneous handling of Gemini audio stream and local browser TTS adds redundant processing.
- Browser speech recognition finalization delay:
  - `SpeechRecognition` final transcripts can lag user speech completion.
- Audio conversion cost:
  - Worklet PCM conversion + base64 encode on send, plus base64 decode on receive.
- Network and TLS overhead:
  - Continuous small-frame websocket transport can amplify RTT/jitter effects.
- Reconnect path delay:
  - Socket reconnect waits and retries can add turn startup lag after drop.
- Turn-complete gating behavior:
  - Audio buffering/flush around `turnComplete` introduces synchronization delays.
- Browser TTS voice resolution:
  - `speechSynthesis.getVoices()` and platform voice engine scheduling can vary by browser/OS.
- Third-party realtime inference variability:
  - Gemini Live server-side generation/stream timing is an external latency component.


## 8) Potential Duplicate-Response Sources

- **Parallel audio outputs (highest risk)**:
  - Incoming Gemini `audio` chunks are scheduled for playback (`audioEngine`).
  - Same response text is also spoken via local `speechSynthesis` (`benchSimulator`).
  - This can produce overlapping/doubled judge speech.

- **Potential duplicate opening behavior**:
  - `audioEngine` sends a priming `type: "text"` message on socket open.
  - `benchSimulator` separately triggers local opening statement TTS on `ready`.
  - Can create two opening prompts/content streams.

- **Race around reconnect + transcript send**:
  - On final transcript when socket not open, `sendSpeechText()` reconnects then transmits.
  - If websocket state flips during this window, replay risk exists without request IDs.

- **Mixed turn-completion signaling paths**:
  - `onTurnComplete` + local utterance `onend` adjustments both drive listening restart.
  - If callbacks interleave unexpectedly, response boundaries may duplicate or be replayed.

- **No explicit dedupe tokening**:
  - Messages/turns do not carry unique IDs or ack tracking for idempotency.
  - Retries/reconnects can resend logically identical input.

