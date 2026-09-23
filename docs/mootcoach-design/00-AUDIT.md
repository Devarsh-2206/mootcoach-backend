# MOOTCOACH: PRE-REDESIGN AUDIT

Audit date: 2026-09-24 · Branch `main` · Commit baseline `ade2f79`
Method: full source inspection + live Playwright run against `localhost:3000` (Chromium 1440×900 and 390×844), 13 screenshots captured.

---

## 0. THE DECISION THAT BLOCKS EVERYTHING

**The brief asks for a dark cinematic product. The app that exists is a light "legal-pad" product — and it is good.**

`MASTER-BRIEF.md §3` specifies *"Dark Cinematic (deep blacks, near-black charcoal)"* with base `#0A0A0A`. The shipped app's default theme is cream paper `#F6F1E4` with ink `#1C1710` and a red `#B0392E` accent — a legal-pad / cause-list aesthetic, built deliberately over an extended reskin effort, down to margin rules, line numbers, a "LISTED TODAY" rubber stamp and a handwriting accent face.

This is not a gap to be "fixed". It is a fork:

| Option | What it means | Cost | Risk |
|---|---|---|---|
| **A — Dark replaces light** | Cream theme retired; brief implemented literally | Highest | Discards the most distinctive asset the product currently has |
| **B — Dark becomes the default, light stays as an alternate** | Retune the *existing* dark theme to the cinematic palette; flip the default; keep the toggle | **Lowest** | Two themes to maintain (already true today) |
| **C — Light stays default; cinematic applies to simulation surfaces only** | Landing/workspace stay paper; Practice + intro go dark cinematic | Medium | Brief only partially satisfied; two visual languages in one product |

**Recommendation: B.** Reasons, all verified below: a dark theme already exists and is wired site-wide; its token values are *already* 60–70% of the brief's target (two of the brief's colors are byte-identical to values already in the stylesheet); and it is reversible with a toggle the user already has. Option B converts "rebuild the product's look" into "retune ~25 CSS custom properties", which is the difference between a multi-week risk and a one-session change.

Nothing else in this audit should be actioned until this is settled, because the colour decision determines whether Phase 1 is a token retune or a re-skin.

---

## 1. CURRENT ARCHITECTURE

**Stack:** Node 24 / Express 5 backend, vanilla-JS ES-module frontend, no build step, no framework, no bundler.

**Backend** (`server.js`, 39 KB, ~980 lines)
- Boots Express, then `app.listen()` *before* requiring heavy deps; `requestTimeout` 180 s / `headersTimeout` 185 s / `keepAliveTimeout` 65 s (tuned for long AI calls).
- `app.use(express.static("frontend"))` — serves the SPA. **No compression middleware, no cache options.**
- Firebase Admin SDK (server-side, bypasses rules); `express-rate-limit` at 15 req / 15 min on AI routes.
- WebSocket server on the same HTTP server; `/ws/voice` is the live oral-round channel.

**Routes:** `/analyze`, `/evaluate-oral`, `/simulate-bench`, `/simulate-bench/extract-claims`, `/api/build-argument`, `/api/log-session`, `/api/judge-profiles`, `/extract-issues`, `/api/authority-intelligence`, `/api/bench-forecast`, `/health`, `/api/client-log`, WS `/ws/voice`.

**AI layer:** 14 distinct call sites funnel through one shared `getChatCompletion()` in `services/geminiService.js` (Groq primary / Gemini fallback, per-call timeouts). Six intelligence engines in `services/`, 20 prompt builders in `prompts/`. The `/analyze` pipeline is a 9-call fan-out; the two calls that carry the full document are Gemini-primary because Groq's 8 k TPM ceiling makes them deterministically fail there.

**Frontend:** one 4,166-line `index.html` (199 KB) containing a **2,702-line inline `<style>` block** (lines 64–2765) and a 176-line inline landing script, plus 12 ES modules totalling 13,391 lines / 636 KB.

| Module | Lines | Bytes | Role |
|---|---|---|---|
| `components/argumentBuilder.js` | 3,437 | 178 K | BUILD stage |
| `components/ui.js` | 1,678 | 83 K | navigation, panels, Firestore session I/O |
| `components/benchSimulator.js` | 1,462 | 62 K | PRACTICE stage |
| `app.js` | 768 | 26 K | bootstrap, auth wiring |
| `services/audioEngine.js` | 614 | 22 K | mic → WS → PCM playback |
| `components/issueWorkspace.js` | 517 | 28 K | issue selection |
| `components/dashboard.js` | 272 | 9 K | dashboard helpers |
| `components/oralEvaluation.js` | 195 | 10 K | REVIEW output |

**View model:** three top-level `.view` containers (`#view-landing`, `#view-login`, `#view-workspace`) toggled by `navigate()` in `ui.js`. Inside the workspace, four `.ws-stage` containers gated by a floating "dynamic island" stepper: **1 Analysis · 2 Issues · 3 Advocacy · 4 Simulator**.

**Auth/data:** Firebase compat SDK for *both* auth and Firestore (unified recently to fix a permissions bug caused by mixing compat + modular SDKs). Rules scope everything to `artifacts/moot.coach/users/{uid}`.

**Deploy:** push to `main` → Render auto-deploy. No staging branch, no CI, no tests (`npm test` exits 1).

---

## 2. CURRENT DESIGN

The landing page is genuinely distinctive and *not* generic SaaS. It presents as a court filing: a cause-list strip ("IN THE MATTER OF MOOT COURT PREPARATION · CAUSE LIST NO. 1 OF 2026"), a case caption (`MOOTCOACH … Applicant` *versus* `THE NIGHT BEFORE SUBMISSION … Respondent`), a legal-pad margin rule with running line numbers, a 92 px Cormorant Garamond "State your case.", a skewed red "LISTED TODAY" stamp, and a Caveat handwriting sign-off. Six sections: hero → Exhibit A (typewriter demo) → The Record → The Bench → Scoresheet → CTA.

Type is serif-dominant: Cormorant Garamond display, EB Garamond body, IBM Plex Mono for metadata, Caveat for annotations.

The workspace is a three-zone layout: left sidebar (moot details, recent moots), a floating dynamic-island stepper at top centre, and a centred content column. Surfaces are flat cream cards with 1 px rules. The login is a split modal — dark left brand panel, cream right form — over a blurred backdrop.

Dark mode exists site-wide, persists to `localStorage`, and applies pre-paint to avoid flash.

**Character summary:** editorial, restrained, paper-first, flat. It reads as a beautifully typeset document. It does not read as a simulation environment.

---

## 3. CURRENT PROBLEMS

### Interaction — the largest gap
- **Zero cursor interaction anywhere in the codebase.** `mousemove` handler count across all HTML and JS: **0**. No magnetic buttons, no card tilt, no light-following hover.
- **Zero 3D.** `perspective` / `rotateX` / `rotateY` / `translateZ` occurrences: **0**. Every surface is flat.
- **Scroll motion is landing-only.** 2 `IntersectionObserver` instances, both in `index.html`. The workspace has no scroll-driven reveal at all.
- **Sequencing is timer-based, not physical.** 37 `setTimeout` vs 9 `requestAnimationFrame`.
- Transitions are competent but uniform: 94 `transition:` declarations, 39 `cubic-bezier()`.

### Visual consistency
- **~35 off-palette colours from the pre-reskin dark theme survive**, all Tailwind defaults: `#60a5fa` blue ×10, `#a78bfa` violet ×5, `#fbbf24` amber ×4, `#2dd4bf` teal ×3, `#f87171` ×2, `#fb923c`, `#c4b5fd`. They sit on visible surfaces — analysis category badges (`.badge-blue/.asc-icon-*`), difficulty pills, grade badges (`grade-B/C/D`), and the bench chat roles (`.cr-msg-role.advocate` is blue `#60a5fa`). This is the "generic AI SaaS" look the brief forbids, still live inside the product.
- **Emoji used as product iconography** (🔒 Memorial Guide, ⚖ Judicial Chambers, ⊕ ◎ ⇥ in the sidebar).
- **Token names are actively misleading:** `--navy: #F6F1E4` is cream; `--gold: #B0392E` is red; `--white: #1C1710` is near-black. Names were kept from the old dark theme so existing rules would re-theme for free. It works, but any new contributor will misread the stylesheet.

### Typography
- **No sans-serif in the system.** `--sans` resolves to `'EB Garamond', Georgia, serif` — a serif. The brief requires a grotesk (Inter/Outfit) for UI. Everything is currently serif-on-serif.
- **Metadata renders below legible size:** measured 9.92 px, 10.0 px, 10.08 px, 11.2 px. Brief floor is 12 px.
- No `clamp()`-based fluid scale; sizes are largely fixed.

### Accessibility
- **Empty-state text at 16 % alpha** (`.wsib-value` = `rgba(28,23,16,.16)` on cream) — "Not set", "No file uploaded" are effectively invisible.
- Two `<h1>` elements coexist in the DOM (landing + login).
- 4 buttons have neither text nor `aria-label`.
- Reduced-motion support is partial: 3 CSS blocks, scoped to `.panel-transition`, `#view-landing` and `#intro` — the entire workspace is uncovered.
- *Good:* `:focus-visible` is already defined (2 rules) with a 2 px brand-red outline, not the browser default.

### Performance
- **Tailwind Play CDN in production.** Console emits: *"cdn.tailwindcss.com should not be used in production."* It is a render-blocking script that compiles CSS in the browser on every load.
- **No compression.** No `compression` dependency, no middleware; `express.static("frontend")` is called with no options. The 199 KB HTML and 178 KB `argumentBuilder.js` ship uncompressed.
- **No cache policy** — app assets return `cache-control: public, max-age=0`.
- `Caveat` webfont costs 75 KB for a handful of decorative lines.
- Measured locally (warm, no network latency): load 1,122 ms, FCP 812 ms, 26 requests, ~1.03 MB. On Render's free tier with cold starts and real latency this will be materially worse.

### Concrete defects observed
- **Scoresheet count-up desyncs**: captured mid-animation showing rows at 6.7 / 4.9 / 3.4 / 0.3 while **TOTAL still read 0.0**. The total lags the rows badly enough to look broken.
- **"REVIEWED" stamp collides with "SPEAKER NO. 1"** on the scoresheet — overlapping text.
- **Stale model names shown to users**: `index.html:3307` says *"Analysis powered by Groq · llama3-70b-8192"* and `:3332` says *"· Groq · llama-3.3-70b"*. Both models are wrong — the pipeline now runs `openai/gpt-oss-120b` and Gemini.
- **Mobile navigation is missing.** At 390 px the four nav links disappear with no hamburger and no bottom bar; only "FILE APPEARANCE" remains.
- **Theme toggle floats over content on mobile**, vertically centred on the right edge, overlapping the case caption.
- **"LISTED TODAY" stamp clips** off the right edge at 390 px.
- **Workspace sidebar is clipped at the top**, scrolling under the dynamic island.
- Large dead horizontal space in the workspace at 1440 px.

### The intro
Currently a **bright cream screen with a small red §**, ~3.25 s, `z-index: 2147483647`. The brief asks for black → atmosphere → courtroom → camera push → logotype. The current intro is the exact inverse: a light flash. (It does respect `prefers-reduced-motion` by hiding entirely, and it does follow the dark theme when dark is active.)

---

## 4. DESIGN GAP

| Brief requirement | Status | Distance |
|---|---|---|
| Dark cinematic base `#0A0A0A` | Light default; dark theme exists at `#16120D` | **Decision, then small** |
| Burgundy `#7A1B1F` brand | Red `#B0392E` / dark `#C4453A` | Small — token retune |
| Body text `#EFE6D3` | Dark theme `--white: #EFE6D3` | ✅ **byte-identical** |
| Success `#2F7D52` / Error `#A8362A` | Both present | ✅ **byte-identical** |
| Champagne `#D4AF37` | Absent | Small — add token |
| Serif display (Cormorant) | Cormorant Garamond in use | ✅ |
| Mono metadata (IBM Plex) | IBM Plex Mono in use | ✅ |
| Sans UI (Inter/Outfit) | **Missing — `--sans` is a serif** | Medium |
| `clamp()` fluid type | Absent | Small |
| Easing `cubic-bezier(.22,1,.36,1)` | 20 uses | ✅ |
| Easing `cubic-bezier(.16,1,.3,1)` | 7 uses | ✅ |
| Spring / overshoot | 3 bouncy curves exist | Small |
| Magnetic cursor | **0 implementations** | **Large** |
| 3D card tilt | **0 implementations** | **Large** |
| Progressive blur | 17 `backdrop-filter` (login already blurs its backdrop) | ✅ Small |
| Staggered reveal | Landing only | Medium |
| Shared-element / morph transitions | Absent | **Large** |
| Parallax / depth layers | Absent | **Large** |
| Cinematic hero video | 0 `<video>` elements | **Large — asset-blocked** |
| Dashboard as perspective stages | Flat stepper, no lobby | **Large** |
| REVIEW as a first-class stage | Exists only as post-round output | **Structural** |
| Radial / spider charts | 0 `<canvas>`, 6 `<svg>` | Medium |
| Reduced motion (global) | Partial | Small |
| WebP/AVIF imagery | 0 `<img>` on landing | N/A yet |

**Two structural gaps beyond styling:**
1. **Stage taxonomy mismatch.** The brief's four stages are ANALYSE / PRACTICE / BUILD / REVIEW. The app's are Analysis / Issues / Advocacy / Simulator. Mapping: Analyse = stages 1+2, Build = stage 3, Practice = stage 4, **Review = not a stage at all**. Implementing the brief's dashboard means re-labelling the stepper and promoting Review.
2. **No dashboard "lobby" exists.** Login lands straight in the Analysis upload panel. The brief's spatial stage-selection screen has no counterpart to restyle — it must be built.

---

## 5. EXISTING DEPENDENCIES

**Animation / UI libraries installed: none.**

Runtime deps are backend-only: `@google/genai`, `groq-sdk`, `express`, `express-rate-limit`, `cors`, `dotenv`, `firebase`, `firebase-admin`, `multer`, `pdf-parse`, `pdfjs-dist`, `ws`.

Browser-side, loaded from CDN: **Tailwind Play CDN** (runtime compiler, dev-only tool), Firebase compat SDKs v10.8.0 (app + auth + firestore, 101 KB for firestore alone), Google Fonts (Cormorant Garamond, EB Garamond, IBM Plex Mono, Caveat).

`playwright@1.62.1` is present in `node_modules` but not in `package.json` (installed `--no-save` for verification work).

Every animation in the product today is hand-written CSS or vanilla JS.

---

## 6. REQUIRED DEPENDENCIES

**For the motion and interaction work: none.** Tested against the brief's own list:

| Requirement | Existing stack sufficient? |
|---|---|
| Magnetic buttons | Yes — `mousemove` + `transform`, ~40 lines |
| 3D card tilt + glare | Yes — `perspective` + `rotateX/Y` + a radial-gradient overlay |
| Staggered reveals | Yes — `IntersectionObserver` + `transition-delay`, already proven on the landing page |
| Animated numbers | Yes — `requestAnimationFrame`; one already ships on the scoresheet |
| Progressive blur | Yes — `backdrop-filter`, 17 uses already |
| Clip-path scroll reveals | Yes — CSS `clip-path` + IO |
| Spring physics | Yes — a ~30-line critically-damped spring helper, or the three overshoot beziers already in the sheet |
| Scroll-driven animation | Yes — native `animation-timeline: view()` in Chromium/Edge, IO fallback elsewhere |
| Radar / radial charts | Yes — inline SVG with `stroke-dasharray`; no chart library needed for thin-line radar |

The brief names GSAP in Phase 4. I do not recommend it: ~70 KB for behaviours the platform now does natively, against an explicit instruction not to add unnecessary libraries. **If** hand-rolled springs prove unwieldy during Phase 4, `motion` (Motion One, ~4 KB gzip, WAAPI-based) is the proportionate escalation — decide then, with evidence, not now.

**Genuinely warranted additions, all infrastructure rather than visual:**

| Package | Why | Priority |
|---|---|---|
| `compression` | Gzip/Brotli for a 199 KB HTML + 178 KB JS currently shipping raw | **High** |
| `tailwindcss` (+ CLI, devDependency) | Replace the Play CDN with a built stylesheet, or drop Tailwind entirely | **High** |
| `playwright` (devDependency) | Already used for verification; currently unpinned in the manifest | Medium |

One optional call: `lenis` (~3 KB) for momentum scrolling, which the brief asks for under "Inertia & Momentum" and which is the single hardest item to hand-roll well. It also hijacks native scroll, which carries real accessibility cost. My recommendation is to defer it and revisit in Phase 4.

---

## 7. IMPLEMENTATION ROADMAP

`18-IMPLEMENTATION-ROADMAP.md` defines five phases. Translated into engineering work against this codebase, with a Phase 0 the brief does not account for:

### Phase 0 — Decide & de-risk (no visual change)
1. Settle the light/dark fork in §0.
2. Replace the Tailwind Play CDN with a built stylesheet — **carefully**: `.hidden{display:none!important}` is load-bearing for view switching, and has caused a production outage before.
3. Add `compression`; set `maxAge`/`immutable` on static assets.
4. Fix the stale model strings (`index.html:3307`, `:3332`).
5. Create a `redesign` branch. `main` auto-deploys to Render; all subsequent phases must land there first.

*Exit:* identical pixels, materially faster, safe to iterate on.

### Phase 1 — Token foundation
Introduce a `--mc-*` layer (colour, type scale with `clamp()`, spacing, easing, elevation) defined **alongside** the legacy names, with the legacy names aliased to it (`--navy: var(--mc-surface-base)`). Retune the dark theme to the cinematic palette. Add the missing sans face and `--mc-accent-champagne`. Migrate the ~35 off-palette Tailwind colours onto semantic tokens.

*Exit:* one coherent palette; no rule reads a raw hex. *Aliasing is what makes this non-breaking — no existing selector needs editing.*

### Phase 2 — Component layer
Buttons, cards, inputs, modals, panels as documented patterns. Lighting-based hover, elevation on hover, consistent focus rings. Retire emoji iconography for a small inline-SVG set. Raise metadata to ≥12 px; fix the 16 %-alpha empty states.

*Exit:* premium static components, no motion yet.

### Phase 3 — Layout & environments
Build the dashboard lobby (the brief's four perspective stages). Re-label the stepper to ANALYSE / PRACTICE / BUILD / REVIEW and promote Review to a first-class stage. Apply the dark courtroom environment to Practice. Fix the sidebar clipping, the 1440 px dead space, and mobile navigation.

*Exit:* four distinct environments; brief-aligned information architecture.

### Phase 4 — Motion & interaction
A shared motion utility module: spring helper, magnetic-hover binder, tilt binder, stagger-on-enter observer, count-up. Apply to CTAs, cards, lists, modals, stage transitions. Global `prefers-reduced-motion`. Fix the scoresheet count-up desync here.

*Exit:* physical, responsive feel; reduced-motion parity.

### Phase 5 — Cinematic assets & polish
Re-author the intro to the brief's black → courtroom → logotype sequence. Integrate Higgsfield assets (3 identified in §13: courtroom hero, judge ambient loop, document-scan) as WebM + MP4 + WebP posters, lazy-loaded, skippable. Final performance and accessibility pass.

*Exit:* the full experience.

**Sequencing note:** Phases 1–4 need no external assets. Higgsfield generation blocks only Phase 5, so it can be commissioned in parallel from Phase 3 onward — but per instruction, **no assets are to be generated yet.**

---

## 8. RISK ANALYSIS

**Critical**
- **`.hidden` is load-bearing.** `#view-workspace` ships as `class="view hidden"`; Tailwind's `.hidden{display:none!important}` beats `.view.active{display:flex}`, and `navigate()` must explicitly remove it. This exact interaction has already broken the workspace once. Any change to Tailwind delivery, or to `navigate()`, can blank the entire app.
- **Intro z-index and ordering are hard-won.** `#intro` sits at `z-index: 2147483647` after a long bug history of the intro bleeding into the landing page and swallowing nav clicks. The required flow is intro → home → workspace-on-click. New overlays, page transitions or a re-authored intro must preserve this exactly.
- **Live voice pipeline is fragile and untestable in CI.** `audioEngine.js` → WS `/ws/voice` → Gemini Live, 24 kHz PCM through an AudioWorklet. Restyling the Practice stage must not touch its DOM contracts or lifecycle.
- **Firebase compat unification is recent.** `services/firebase.js` deliberately uses compat for *both* auth and Firestore; reintroducing any modular import resurrects the "Missing or insufficient permissions" bug.

**High**
- **`argumentBuilder.js` is 3,437 lines** and renders BUILD entirely in JS-authored markup. Restyling it means editing template strings across the largest file in the project.
- **2,702 lines of inline CSS in one file** with overloaded token names (`--navy` = cream). High chance of cascade regressions during migration.
- **No tests, no CI, no staging.** `npm test` exits 1. `main` auto-deploys. Every regression reaches production directly.
- **53 inline `onclick` handlers** couple markup to globals; moving DOM around breaks them silently.

**Medium**
- Rate limiting (15 req / 15 min on AI routes) will throttle repeated visual QA of the analysis flow.
- Render free-tier cold starts will distort any performance measurement taken against production.
- Dark mode has never been visually QA'd across the full workspace — the off-palette Tailwind colours were authored for the *old* dark theme and may read as broken in either direction.
- Two `index.html` backups exist (`.bak`, `.redesign-backup`), both months stale — useful as reference, **not** as a rollback path. Git is the rollback path.

**Note on uncommitted state:** `prompts/judgeProfiles.js` (10 judge personas + intensity layer) and the corresponding `server.js` changes are staged but uncommitted, alongside the 19 design docs. These should be committed before the redesign branch is cut, so the redesign starts from a clean baseline.

---

## 9. BROWSER FINDINGS

Live run, `localhost:3000`, Chromium, 1440×900 and 390×844.

**Console:** exactly one message — the Tailwind production warning. **Zero page errors. Zero failed requests.** The application is functionally healthy.

**Timings (local, warm):** load 1,122 ms · DOMContentLoaded 1,116 ms · FCP 812 ms · 26 responses · ~1.03 MB · 884 DOM elements on the landing view.

**Heaviest payloads:** `index.html` 199 KB (uncompressed) · `argumentBuilder.js` 178 KB (uncompressed) · `firebase-firestore-compat.js` 101 KB (gzipped by Google) · `ui.js` 83 KB (uncompressed) · `Caveat.woff2` 75 KB.

**Confirmed working:** intro renders and clears cleanly (`display:flex` → hidden, `body.intro-hold` removed); landing renders all six sections; theme toggle flips `data-theme` and repaints (`#F6F1E4` → `#16120D`) with no flash; login modal opens over a blurred backdrop; `navigate('workspace')` while signed out correctly redirects to login (verified: identical screenshot bytes); mobile has **no horizontal overflow** (scrollWidth 390 = innerWidth 390); focus ring is brand red, not browser blue.

**Confirmed broken / substandard:** scoresheet count-up desync (TOTAL 0.0 against populated rows); "REVIEWED" stamp overlapping "SPEAKER NO. 1"; mobile nav links absent with no replacement; theme toggle overlapping mobile content; "LISTED TODAY" clipped at 390 px; workspace sidebar clipped under the dynamic island; metadata at 9.92–11.2 px; empty-state text at 16 % alpha; stale model names in two places.

**Not observable without credentials:** the authenticated workspace was inspected by force-revealing `#view-workspace` in the DOM. Layout and styling findings are valid; live analysis, bench and argument-builder *behaviour* was not exercised. A signed-in pass is worth doing before Phase 3.

---

## 10. FIRST IMPLEMENTATION PHASE

**Recommended first: Phase 0 + Phase 1 — decision, build hygiene, and the token foundation.** Concretely:

1. Settle §0 (recommendation: Option B).
2. Cut a `redesign` branch off `main`.
3. Commit the pending judge-profiles work so the baseline is clean.
4. Replace the Tailwind CDN with a built stylesheet, verifying `.hidden` behaviour explicitly in Playwright before and after.
5. Add `compression` and static cache headers.
6. Introduce the `--mc-*` token layer, aliasing the legacy names to it.
7. Retune the dark theme to the cinematic palette; add the sans face, the champagne accent, and the `clamp()` type scale.
8. Migrate the ~35 off-palette colours to semantic tokens.
9. Fix the stale model strings.

**Why this first:**

- **It is the brief's own Phase 1**, and every later phase reads these tokens. Building components or motion before the tokens exist guarantees rework.
- **It touches no functional JavaScript.** Auth, Firestore, the AI pipeline, the voice WebSocket and the bench simulator are all untouched — which directly satisfies the "do not break existing functionality" constraint at the moment of highest uncertainty.
- **It is reversible.** Token values are one block of CSS; the alias layer means no selector is rewritten.
- **It resolves the fork empirically.** Once the dark theme is retuned, the existing toggle becomes a live A/B between the current light identity and the brief's cinematic one — the decision gets made by looking at the real product, not at a spec.
- **It removes the two things actively undermining "premium"** — a dev-only CSS compiler on the critical path, and uncompressed 200 KB assets. A brief that opens with *"A futuristic website that takes 8 seconds to load is not premium"* is not served by starting with animation.

**Explicitly deferred:** all cursor physics, all 3D, the dashboard lobby, the re-authored intro, and every Higgsfield asset.

---

## APPENDIX — measurement provenance

All numbers above are measured, not estimated. Source counts come from `grep -c` over `frontend/`; runtime values from `performance.getEntriesByType()` and `getComputedStyle()` inside a live Chromium page; screenshots in the session scratchpad under `shots/`. Production headers could not be verified — `mootcoach-backend-1.onrender.com` was unreachable from this environment (immediate connection failure, not a timeout). The compression and cache findings are therefore derived from source (`package.json` has no `compression`; `server.js:253` calls `express.static("frontend")` with no options), which applies identically in production since it is the same server.
