# MootCoach AI — Project Structure

AI-powered moot court preparation platform. Students upload legal propositions (PDF), receive structured analysis, practice oral arguments, and simulate bench questioning.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, Express 5 |
| Primary AI | Groq (`llama-3.3-70b-versatile`) — analysis, oral eval, bench simulation |
| Secondary AI | Google Gemini (`gemini-pro`) — issue extraction route |
| Frontend | Single-page app in vanilla HTML/CSS/JS |
| Auth & data | Firebase (Auth + Firestore) |
| PDF parsing | `pdf-parse`, `multer` |

## Directory Tree

```
mootcoach-ai/
├── server.js                 # Express app entry point & main API routes
├── package.json
├── package-lock.json
├── .gitignore
├── PROJECT_STRUCTURE.md      # This file
│
├── frontend/
│   └── index.html            # Full SPA: UI, styles, Firebase, API client
│
├── routes/
│   └── extractIssues.js      # POST /extract-issues — Gemini issue extraction
│
├── services/
│   └── geminiService.js      # Gemini client with retries & timeout
│
├── prompts/
│   ├── analysisSystemPrompt.js    # Full proposition analysis (Groq)
│   ├── legalValidationPrompt.js   # Legal vs non-legal document check (Groq)
│   ├── oralEvalPrompt.js          # Oral argument grading (Groq)
│   ├── benchJudgePrompt.js        # Bench simulator personality builder (Groq)
│   └── issueExtractionPrompt.js   # Structured issue extraction (Gemini)
│
└── uploads/                  # Ephemeral PDF uploads (gitignored)
```

Runtime-only / local (not committed): `node_modules/`, `.env`, `uploads/`.

## Backend (`server.js`)

Express server on **port 3000**. Loads environment via `dotenv`. Uses CORS and JSON body parsing.

### API Endpoints

| Method | Path | Handler | AI Provider | Purpose |
|--------|------|---------|-------------|---------|
| `GET` | `/health` | `server.js` | — | Health check |
| `POST` | `/analyze` | `server.js` | Groq | Upload PDF → validate → analyze proposition |
| `POST` | `/evaluate-oral` | `server.js` | Groq | Grade written oral argument text |
| `POST` | `/simulate-bench` | `server.js` | Groq | Interactive judge Q&A simulation |
| `POST` | `/extract-issues` | `routes/extractIssues.js` | Gemini | Extract legal issues from proposition text |

### `/analyze` flow

1. **Upload** — `multer` saves PDF to `uploads/`, then deletes after parse.
2. **Extract text** — `pdf-parse`; rejects if &lt; 80 characters (image/empty PDF).
3. **Phase 1 — Validation** — `legalValidationPrompt.js`; rejects non-legal docs (confidence ≥ 75).
4. **Phase 2 — Analysis** — `analysisSystemPrompt.js`; JSON response via Groq `response_format: json_object`.
5. **Phase 3–4** — Parse JSON, normalize `overallScore` and assign `scoreVerdict`.

Text is capped at ~45,000 characters for Groq free-tier limits.

### `/evaluate-oral` flow

Accepts `{ argument, propositionContext?, difficulty? }`. Returns structured scores and letter grade (A–F).

### `/simulate-bench` flow

Accepts `{ studentStatement, conversationHistory?, propositionSummary?, difficulty? }`. Uses `buildJudgePrompt(difficulty, summary)` for easy / moderate / hard bench personalities. Maintains last 12 turns of history.

## Routes

### `routes/extractIssues.js`

- **POST** `/extract-issues/` (mounted at `/extract-issues`)
- Body: `{ proposition: string }`
- Builds prompt from `issueExtractionPrompt.js`, calls `generateAIResponse` from `services/geminiService.js`
- Returns parsed JSON or 400/500 errors

> Note: This route is wired on the server but not currently called from `frontend/index.html`.

## Services

### `services/geminiService.js`

- Wraps `@google/generative-ai` with `GEMINI_API_KEY`
- Safety filters disabled for legal/criminal content
- `generateAIResponse(prompt)` — retries, 120s timeout, enforces JSON-only output

## Prompts

| File | Export | Used by |
|------|--------|---------|
| `analysisSystemPrompt.js` | string | `/analyze` (Groq system prompt) |
| `legalValidationPrompt.js` | string | `/analyze` phase 1 |
| `oralEvalPrompt.js` | string | `/evaluate-oral` |
| `benchJudgePrompt.js` | `buildJudgePrompt(difficulty, summary)` | `/simulate-bench` |
| `issueExtractionPrompt.js` | `(propositionText) => string` | `/extract-issues` |

Prompts encode evaluator persona, JSON schema expectations, and scoring rigor for moot court context.

## Frontend (`frontend/index.html`)

Single ~3,200-line file: markup, CSS design tokens, and JavaScript. No build step.

### Views

| ID | Purpose |
|----|---------|
| `view-landing` | Marketing / hero |
| `view-login` | Firebase email auth (login & register) |
| `view-workspace` | Main app after sign-in |

### Workspace panels (`showWsPanel`)

| Panel | Feature |
|-------|---------|
| `upload` | PDF drag-and-drop → `POST /analyze` |
| `results` | Structured analysis display, score hero, category bars |
| `oral` | Oral argument submission → `POST /evaluate-oral` |
| `bench` | Chat-style bench simulation → `POST /simulate-bench` |

### Key client config

- `BASE_URL` — production backend (`https://mootcoach-backend-1.onrender.com`)
- Firebase Auth + Firestore for user sessions and saved analyses
- Renders both legacy text sections and structured JSON (`showStructuredResults`)

### Main JS areas (approximate line ranges)

| Area | Responsibility |
|------|----------------|
| Auth & navigation | `navigate`, `handleLogout`, Firebase listeners |
| File upload & analyze | `handleFileSelect`, `runAnalysis`, step progress UI |
| Results rendering | `showStructuredResults`, `renderCategoryScores`, section parsers |
| Oral practice | `setOralDifficulty`, `renderOralResults` |
| Bench simulator | `startBenchSession`, `appendBenchMessage`, conversation state |

## Environment Variables

Create a `.env` in the project root:

```env
GROQ_API_KEY=...      # Required for /analyze, /evaluate-oral, /simulate-bench
GEMINI_API_KEY=...    # Required for /extract-issues
```

## Running Locally

```bash
npm install
npm start          # node server.js → http://localhost:3000
```

Open `frontend/index.html` in a browser (or serve statically). Point `BASE_URL` to `http://localhost:3000` for local API testing.

## Data Flow (high level)

```
User PDF
    → frontend (FormData)
    → POST /analyze
    → pdf-parse → Groq (validate + analyze)
    → JSON analysis
    → frontend render + optional Firestore save

Oral text → POST /evaluate-oral → Groq → grades

Bench chat → POST /simulate-bench → Groq (judge persona) → judge reply JSON
```

## Dependencies (summary)

- **express**, **cors** — HTTP API
- **multer** — file uploads
- **pdf-parse**, **pdfjs-dist** — PDF text extraction
- **groq-sdk** — primary LLM
- **@google/generative-ai** — issue extraction
- **dotenv** — configuration

## Extension Points

- Add new routes under `routes/` and mount in `server.js`
- Add prompts under `prompts/` and require in route handlers
- New AI providers → new files under `services/`
- Frontend features → new workspace panels or views in `frontend/index.html`
