# MootCoach AI — architecture

Written 11 October 2026, against the code as it stands. Where a figure is
measured rather than assumed, it says so.

This replaces an earlier review that was accurate about the voice pipeline and
the route structure, and wrong in four places that mattered. Those corrections
are listed at the end, because the mistakes are instructive: each one would
send someone looking in the wrong place.

---

## 1. What it is

A moot court preparation tool. An advocate uploads a proposition (PDF), gets a
structured analysis of it, builds arguments issue by issue, drafts a memorial,
and argues against a simulated bench — by text or by voice.

**Stack.** Node + Express 5, vanilla-JS single-page frontend with no build
step, Firebase for auth and Firestore, `multer` + `pdf-parse` for ingestion,
`ws` for the live voice socket.

**Deployed** to Render. Credentials live in `.env`:
`FIREBASE_SERVICE_ACCOUNT`, `GROQ_API_KEY`, `GEMINI_API_KEY`.

---

## 2. The providers, and which is actually load-bearing

This is the part most worth getting right, because the shape of the whole
system follows from it.

| | Groq (`openai/gpt-oss-120b`) | Google Gemini |
|---|---|---|
| Role | small, frequent calls | **primary for every heavy call** |
| Requests/day | 1,000 | ~20–50 **per model** |
| Tokens/day | **200,000** | no published daily token cap |
| Per-call ceiling | **8,000 total, input + reserved output** | large |

**Gemini is not a fallback.** It is the primary provider for Full Legal
Analysis, Build Argument, Memorial Review, the memorial drafting passes and
Oral Evaluation. For most of those the Groq fallback is *structurally dead*:
the token reservation alone exceeds Groq's per-minute budget, so the
pre-flight guard in `services/geminiService.js` skips it every time. Those
routes are Gemini-or-nothing by measurement, not by preference.

**The model chain.** `GEMINI_MODELS` lists six models walked in order
(`gemini-2.5-flash`, `gemini-3.6-flash`, `gemini-3.8-flash`,
`gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`).
The daily allowance is per model, so the chain is also the capacity.

How far it walks depends on *why* a model refused, because the reasons cost
very different amounts:

- **quota** → the whole chain. The next model has its own allowance and a
  rejected request costs nothing.
- **overload** → three models. Transient, usually clears.
- **filter** (RECITATION, SAFETY, empty response) → two models. These are
  responses the model *produced*, so each one spends a request. Walking all
  six to be told the same thing six times was the most expensive thing this
  service could do — and a tool whose job is quoting case law trips recitation
  filters often.
- **timeout** → does not advance at all. The next model would be just as slow.

**Output ceilings.** Gemini is sent an explicit `maxOutputTokens` per route.
Left unset it applies the model default (8,192 on 2.5-flash, shared with its
thinking tokens) and silently truncates a long structured answer mid-JSON —
measured at 28,166 characters with the closing braces missing. Note the
asymmetry: on Groq `max_tokens` is a *reservation* charged against the minute,
so asking for more costs capacity; on Gemini it is only a ceiling, so being
generous costs nothing and hitting it costs the whole request.

**Live voice** uses `gemini-3.1-flash-live-preview` through
`handleLiveVoiceConnection`, which is a separate path from all of the above.

---

## 3. The upload pipeline (`POST /analyze`)

In order, with what each step costs:

1. **Cache lookup.** The key is the extracted text plus a fingerprint of every
   prompt that shapes the output, so editing a prompt invalidates entries by
   itself. A hit returns in about a second having called nothing.
   `?probe=1` reports cache state without analysing; `?fresh=1` forces a real
   run.
2. **Validation** and **forum detection** run concurrently (Groq, small).
   Forum detection is P0 because jurisdiction changes every downstream prompt —
   an Indian court and a treaty tribunal need different law, terminology and
   forms of address.
3. **Core analysis** (Gemini, 150s, whole-chain budget 135s).
4. **Reduced analysis**, only if step 3 produced nothing usable. Asks for four
   things instead of twenty-one so it fits inside Groq's window, is labelled as
   reduced in the response and on the page, and is **never cached** — it exists
   because something was briefly wrong, and caching it would make a bad five
   minutes permanent for that document.
5. **Integrity guard** on `additionalIssues` — pure JavaScript, no model call.
   Drops ungrounded suggestions and de-duplicates against the framed issues.
6. **Enrichment chain** — **off by default.** `ENRICH_BUDGET_MS` defaults to
   `0`, so the cascade (Procedural Hierarchy → Forum → Issue → Authority →
   Advocacy) does not run. It was made opt-in to cut upload latency from ~97s
   to ~39s. Set `ENRICH_BUDGET_MS=70000` to restore it, at roughly +35s per
   upload. Anything written about this chain's behaviour describes a
   subsystem that is currently dormant.

Everything fits inside `server.requestTimeout = 180000`, which is the hard
ceiling every route is sized against.

---

## 4. Other routes

- `POST /evaluate-oral` — Gemini.
- `POST /simulate-bench` — one Groq call per judge turn; transcript capped at
  the last 10 turns.
- `POST /simulate-bench/extract-claims` — Groq, small.
- `POST /simulate-bench/oral-review` — the post-round scorecard, Groq.
- `POST /api/build-argument` — despite the name, generates a full memorial
  (cover page, index of authorities, numbered paragraphs, prayer). Gemini.
- `POST /api/build-memorial`, `POST /api/analyse-memorial` — Gemini.
- `GET /api/usage` — what the day's allowance went on, by model, route and
  outcome, on the Pacific day Google resets on. Signed-in only.
- `WS /ws/voice` — the live voice bridge.
- `routes/` holds `extractIssues.js`, `authorityIntelligence.js`,
  `benchForecast.js`.

**Rate limiting** is keyed on the *person*, not the address. It was 15 per 15
minutes per IP, which is the right shape for stopping a script and the wrong
shape for a room: a class on one wifi connection is one IP, a full session is
three or four of these calls, so the fifth person was locked out. A signed-in
advocate now gets 40 per 15 minutes; anyone unsigned shares a pool of 240.
The token is read but not verified for this purpose — it only picks a bucket,
and a forged subject buys you your own allowance, not somebody else's.

---

## 5. Frontend

`frontend/index.html` carries the markup, the view states and the CSS token
system. **A token that does not exist fails silently** — a background vanishes,
a border falls back to the text colour — so verify any token before using it.
Dark mode redefines the same names under `data-theme="dark"`.

**State.** There are two stores and it is worth knowing which is which:

- `lastAnalysis` in `components/ui.js`, with `setLastAnalysis()`, holds the
  analysis. `window.lastAnalysis` is **never assigned by the app**; consumers
  read `window.lastAnalysis || lastAnalysis` only to tolerate test seeding.
  Reading the window property alone finds nothing.
- `window.mootState`, created in `components/issueWorkspace.js`, carries the
  advocate's working choices across stages: `issueIndex`, `issueText`,
  `stance`, `authorities`, `strategicNotes`, `oralSubmission`,
  `memorialDraft`. It does **not** hold the proposition or the forum context.
  It is filled in rather than replaced on creation, because another stage may
  have recorded a choice before that module loads.

The side the advocate is arguing is written by two stages — the Issue
Workspace's stance switch and the Advocacy stage's radio — and each now writes
through to the other. They used to drift, which is how a memorial for the
respondent once printed a cover headed "MEMORIAL FOR PETITIONER".

**Stage wizard:** 1 Analysis, 2 Issues, 3 Advocacy, 4 Simulator, driven by
`goToStage` / `wizardNext` / `wizardPrev`.

---

## 6. Voice

1. Mic via `getUserMedia` into an `AudioWorkletNode`
   (`frontend/pcm-processor.js`), decoded to 16 kHz PCM.
2. Frames sent base64 over `wss://.../ws/voice`.
3. `server.js` hands off to `geminiService.handleLiveVoiceConnection`, which
   streams natively to the Gemini live model.
4. Replies arrive as `audio` and `text` packets plus `turnComplete` and
   `interrupted` metadata.

**There is one audio path, not two.** `audio` packets go to
`audioEngine.scheduleVoicePlayback`. `text` packets accumulate into
`fullJudgeResponse` and are written to the **transcript** on `turnComplete` —
they are never spoken. The bench's only use of `speechSynthesis` is
`.cancel()` during teardown.

---

## 7. Firestore

```
artifacts/moot.coach/users/{uid}/...        per user, isolated by rules
artifacts/moot.coach/competitions/{id}      the Moot Calendar; any signed-in
                                            user may read, no client may write
artifacts/moot.coach/analysisCache/{hash}   shared analysis cache
artifacts/moot.coach/telemetry/usage-{day}  provider usage, Pacific day
```

The cache is shared across users and that is safe, because the key *is* the
document: an entry cannot be read without already holding the exact text that
produced it.

Writes to `competitions` go through `tools/seed-competitions.js` using the
Admin SDK, which bypasses rules. **The seeder merges, and a merged array is
replaced wholesale rather than element by element** — an entry written without
its complete `milestones` list silently loses the rest.

---

## 8. Known gaps

- `POST /api/build-memorial` is not wired to any button.
- The `redesign/mootcoach-futuristic` branch is behind `main`.
- `frontend/js/engine/` and `frontend/js/components/ui_cleaned.js` are
  untracked work in progress and are **not loaded** by the live entry points.
  `frontend/js/services/api.js` is the live API module.
- Jessup is absent from the calendar because `ilsa.org` returns 403 behind bot
  protection — an unreachable source, not an unannounced competition.

---

## 9. What the earlier review got wrong

Kept here because each mistake points somewhere misleading.

1. **"Primary AI: Groq (`llama-3.3-70b-versatile` / `gpt-oss-120b`)"** —
   `llama-3.3-70b` appears nowhere in the codebase.
2. **"Secondary/Fallback AI: Google Gemini"** — backwards. Gemini is primary
   for every heavy route, and the Groq fallback beneath most of them cannot
   fire. This inversion is why the quota problem stayed invisible until usage
   was actually measured.
3. **"Phase 5-10 (Enrichment Chain): Runs a series of cascaded LLM calls"** —
   written in the present tense about a chain that is off by default, and then
   listed as a live bottleneck.
4. **"Dual Audio Output Risk"** — described `benchSimulator.playJudgeAudio`
   racing the Gemini audio stream. That function does not exist, and the text
   path writes to the transcript rather than to speech.

It also recommended moving to RAG. The constraint is not context window —
Gemini's is large. It is Groq's 8,000 tokens per minute and Gemini's requests
per day, and RAG addresses neither. Issue-spotting also needs the whole
proposition in view; chunking it is how a cross-cutting issue gets missed.
