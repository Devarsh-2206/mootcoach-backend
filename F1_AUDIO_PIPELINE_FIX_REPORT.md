# F1 Audio Pipeline Investigation Report

Scope: **Finding F1 only** (Gemini audio packets received but not audible).  
Mode: evidence-only, no code modifications applied.

---

## 1) Verification: Is `audioChunksBuffer` populated?

### Result

`audioChunksBuffer` is **never populated** in current code.

### Evidence (all writes/reads found)

File: `frontend/js/services/audioEngine.js`

- Declaration:
  - `L18`: `let audioChunksBuffer = [];`

- Resets / clears (writes):
  - `L96`: `audioChunksBuffer = [];` (inside `triggerTurnComplete`)
  - `L251`: `audioChunksBuffer = [];` (inside `msg.type === 'interrupted'`)
  - `L264`: `audioChunksBuffer = [];` (after turnComplete flush)
  - `L398`: `audioChunksBuffer = [];` (session start init)

- Reads:
  - `L261`: `audioChunksBuffer.forEach(chunk => { scheduleVoicePlayback(chunk); })`

- Missing:
  - No `audioChunksBuffer.push(...)` (or equivalent insertion) exists anywhere in file.

---

## 2) Trace: Every write and read of `audioChunksBuffer`

### Write paths

1. `triggerTurnComplete()`  
   - `audioEngine.js` `L92-L101`  
   - Clears buffer (`L96`) after playback cycle.

2. WebSocket `interrupted` branch  
   - `audioEngine.js` `L247-L254`  
   - Clears buffer (`L251`) on interruption.

3. WebSocket `turnComplete` branch  
   - `audioEngine.js` `L254-L269`  
   - Attempts flush via `.forEach` (`L261-L263`), then clears (`L264`).

4. Session initialization  
   - `audioEngine.js` `L387-L400`  
   - Initializes empty buffer (`L398`).

### Read path

- Only read is during turn-complete flush:
  - `audioEngine.js` `L261-L263`

### Conclusion

Buffer lifecycle is **reset + flush-only** with no producer. It remains empty.

---

## 3) Exact line where received audio should enter playback

### Current receive point

File: `frontend/js/services/audioEngine.js`  
Function: `setupWebSocketHandlers(...)`  
Branch: `voiceWebSocket.onmessage` -> `msg.type === 'audio'`

Relevant lines:
- `L240`: `const float32Data = base64ToFloat32Array(msg.data);`
- `L241`: `if (onAudio) onAudio(float32Data);`

### Required handoff point (evidence-based)

The handoff to playback should occur **immediately after `float32Data` is created** in this branch (`around L240-L241`), either by:
- enqueuing into `audioChunksBuffer` for later `turnComplete` flush, or
- directly invoking `scheduleVoicePlayback(float32Data)` according to intended buffering policy.

At present, neither happens in this branch.

---

## 4) Why judge audio can arrive while no sound is produced

Evidence chain:

1. Incoming Gemini audio packets are received and decoded:
   - `audioEngine.js` `L235-L241`
2. Playback function exists and is functional entrypoint:
   - `audioEngine.js` `L132-L177` (`scheduleVoicePlayback`)
3. Playback invocation path depends on `audioChunksBuffer` contents:
   - `audioEngine.js` `L261-L263`
4. `audioChunksBuffer` is never populated (only reset/read):
   - declaration/resets/reads at `L18`, `L96`, `L251`, `L261`, `L264`, `L398`

Therefore:

- Audio packets can arrive (`msg.type === 'audio'`) and UI can show speaking state (`L238`),
- but no actual playback is scheduled from those packets through the Gemini audio path,
- causing “judge speaking but silent” behavior.

---

## 5) Root cause

**Root cause:** Broken producer-consumer link in Gemini audio playback path.

- Producer side (WebSocket audio receive) decodes `float32Data` but does not feed playback queue/scheduler.
- Consumer side (`turnComplete` flush) consumes `audioChunksBuffer`, but buffer has no producer.

---

## 6) Exact file / function / line numbers

- File: `frontend/js/services/audioEngine.js`
- Function: `setupWebSocketHandlers(callbacks, onOpenCallback = null)`
- Problem branch: `voiceWebSocket.onmessage` -> `msg.type === 'audio'`
- Critical lines:
  - decode at `L240`
  - current no-op for playback feed at `L241` (only callback call)
  - downstream empty flush at `L261-L263`

---

## 7) Minimal fix required (no implementation done)

Minimal corrective change required:

1. In `audioEngine.js` at the `msg.type === 'audio'` branch (`around L240-L241`), feed `float32Data` into the same path consumed at turn completion:
   - add producer write to `audioChunksBuffer` (or immediate `scheduleVoicePlayback` based on existing buffering flag policy).

2. Preserve existing architecture (no transcript/opening changes), i.e., only restore missing audio handoff between receive and playback.

---

## Final F1 Determination

F1 is confirmed by direct code evidence: **received Gemini audio never enters the playback queue/scheduler path** in `audioEngine.js`, resulting in silent judge output despite active websocket/audio events.

