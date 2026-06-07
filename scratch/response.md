The transcript rendering issue is caused by a missing function call in the real-time chunking logic, compounded by how the AI streams its text. 

Here is the diagnosis based on your trace questions:

1. **Is Gemini text being received?** Yes.
2. **Is onText firing?** Yes.
3. **Is judge-name parsing removing the entire text payload?** No. The parsing logic is perfectly sound, but it is not being fed the text at the right time.
4. **Is currentJudgeSpeech being updated?** No, not during the speaking turn.
5. **Is currentJudgeBubble being created?** No, not during the speaking turn.
6. **Where exactly does transcript rendering stop?** It stops inside the `onText` callback. The callback accumulates the chunk into `fullJudgeResponse`, but **never calls** `appendTranscript` to update the UI. The transcript only appears at the very end when `onTurnComplete` fires. 

*(Note: Your trace mentioned `appendBenchMessage`, but that function is strictly for the non-voice text mode. Voice mode uses `appendTranscript`.)*

### Root Cause
The `onText` handler successfully accumulates chunks into `fullJudgeResponse`, but fails to pass them to the UI renderer. Furthermore, because Gemini streams text in arbitrary fragments (e.g., Chunk 1: `[Justi`, Chunk 2: `ce Menon]`), appending raw chunks directly to the UI would cause the unparsed brackets to flash on screen before the regex can catch them.

### Exact Location
- **File**: `frontend/js/components/benchSimulator.js`
- **Line**: ~641 (inside the `onText` callback)

### Smallest Safe Fix
We need to pass the *fully accumulated* string to the renderer on every tick, and instruct the renderer to overwrite the bubble rather than append to it. This allows the regex to seamlessly catch and strip the judge name the moment the closing bracket `]` arrives in the stream.

**1. Update `onText` (Line ~641)**
```javascript
      onText: (text) => {
        console.log("[DEBUG AUDIT] AI response chunk received:", text);
        fullJudgeResponse += text;
        appendTranscript('judge', fullJudgeResponse, true); // ADD THIS LINE
      },
```

**2. Update `appendTranscript` (Line ~755)**
Add a `cr-msg-name` class to the judge's name span so we can update it dynamically, and change the `isChunk` logic to overwrite instead of append:

```diff
-    if (isChunk && currentJudgeBubble) {
-      currentJudgeSpeech += cleanText; // use cleanText in case the first chunk has the prefix
-      const textEl = currentJudgeBubble.querySelector('.cr-msg-text');
-      if (textEl) {
-        textEl.innerHTML = fmtInline(currentJudgeSpeech);
-      }
-      panel.scrollTop = panel.scrollHeight;
-      return;
-    }
+    if (isChunk && currentJudgeBubble) {
+      currentJudgeSpeech = cleanText; // OVERWRITE with fully parsed accumulated string
+      const textEl = currentJudgeBubble.querySelector('.cr-msg-text');
+      if (textEl) textEl.innerHTML = fmtInline(currentJudgeSpeech);
+      
+      const nameEl = currentJudgeBubble.querySelector('.cr-msg-name');
+      if (nameEl) nameEl.textContent = finalJudgeName;
+      
+      panel.scrollTop = panel.scrollHeight;
+      return;
+    }

    currentJudgeSpeech = cleanText;
    const div = document.createElement('div');
    div.className = 'flex flex-col max-w-[80%] self-start items-start animate-[secReveal_0.3s_ease_both]';

    div.innerHTML = `
      <div class="text-[10px] font-semibold tracking-wider text-red-400 mb-1 flex items-center gap-1">
-        <span>⚖️</span> ${finalJudgeName}
+        <span>⚖️</span> <span class="cr-msg-name">${finalJudgeName}</span>
      </div>
```

Let me know if you approve of this safe fix, and I will implement it immediately!
