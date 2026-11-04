# MootCoach — handoff notes

For the next working session (human or Claude). Last updated **4 November 2026**, build **2026-11-03.30** (`0778ffc`).
Read this first, then `docs/ARCHITECTURE.md`. Never put keys or passwords in this file.

---

## 1. Where things stand

- **Live:** mootcoach.in (Render static site `mootcoach-frontend`) + API `mootcoach-backend-1.onrender.com` (Render web service). DNS at GoDaddy.
- **Stage:** closed **50-student pilot**, NALSAR first. Not yet announced. Next: 5-friend soft launch → NALSAR student-body email + LinkedIn post → pilot → work on feedback → public launch late Dec 2026 / Jan 2027.
- **Owner:** Devarsh Boga (founder; not a law student — never claim otherwise).

## 2. How to work on it

- Branch `claude/nifty-knuth-l5swkq`; the owner approves pushing to `main` (Render deploys main automatically).
- Before every push: `npm run -s test:offline` (15 suites, all must pass), `node tools/bump-build.js` (updates `frontend/version.json` + `frontend/js/config.js` BUILD), then `git push origin HEAD:main HEAD:claude/nifty-knuth-l5swkq`.
- Commit trailer used in this repo:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: …`
- Local run: `PORT=3000 GROQ_API_KEY=x GEMINI_API_KEY=x ALLOW_UNAUTHENTICATED=1 node server.js` (uid `dev`, admin, bypasses the pilot). Browser harness lived in the session scratchpad (`ui/h.js`, Playwright at `/opt/node-tools/node_modules/playwright`); the fake Firebase stub needs base64url tokens.
- The cloud environment's network blocks organiser sites, mootcoach.in, Render and api.indiankanoon.org unless added to Allowed domains. The Gemini API key and Groq are reachable (injected by the proxy); Gemini **voice** is not.

## 3. Accounts (which login owns what)

| Thing | Account |
|---|---|
| Google Cloud free trial (₹28,569, ends **2 Feb 2027**), Vertex AI, billing account `011487-49D838-A4096B`, project `project-cb6bba88-a482-4a10-929` | **devarsh@mootcoach.in** |
| Firebase project `mootcoach-acbae` (auth, Firestore) | devarshboga@gmail.com |
| Resend (sending domain mootcoach.in verified, region Tokyo) | owner |
| Indian Kanoon API (commercial; ₹500 signup credit; balance alert ₹100) | devarshboga@gmail.com |
| Zoho Mail (devarsh@, aliases support@, hello@) | owner |
| Microsoft Clarity | owner (set masking to **Strict** — pending check) |

Budget alert in Google Cloud: **₹5,000/month**, "MootCoach pilot", alerts only (no spend cap), credits unticked → measures gross usage; emails devarsh@mootcoach.in. **Never click Upgrade** on the trial.

## 4. Render environment (backend) — names only

`GEMINI_BACKEND=vertex`, `VERTEX_SERVICE_ACCOUNT` (JSON), `GEMINI_API_KEY` (AI Studio fallback), `GROQ_API_KEY`, `PILOT_MODE=on`, `PILOT_ADMINS`, `PILOT_CAP=50`, `PILOT_AUTO_DOMAINS=nalsar.ac.in`, `PILOT_RELEASE_HOURS=72`, `PILOT_VOICE_MINUTES=15`, `RESEND_API_KEY`, `INDIANKANOON_API_TOKEN`, `ALLOWED_ORIGINS` (mootcoach.in + www).
Optional switches: `AI_PAUSED=1` (emergency brake for all AI), `PILOT_LIMITS` (overrides defaults — check it does not still say voiceRounds=3), `EMAILS=off`, `EMAIL_FROM` (**should be absent**; default sender is `MootCoach <hello@mootcoach.in>`), `SPEND_PRICES`, `AI_DEBUG=1` (verbose logs), `INDIANKANOON_PAUSE_AFTER` (5), `INDIANKANOON_MAX_PER_UPLOAD` (6), `FEATURE_ASSISTANT` / `FEATURE_REVIEW_COLUMN` (both deliberately off).

## 5. Pilot rules (services/pilot.js, server.js pilotGate)

- **Signing in takes no place.** A verified @nalsar.ac.in student may look around (`placeTaken:false`); their **first upload claims** one of the 50 spots. When full, new sign-ins see the waitlist. Every other AI feature needs a claimed spot. Members from before this keep their spot.
- NALSAR email+password sign-ups wait as reason `verify` until they confirm their email (MootCoach's own confirmation mail via Resend); then they are in.
- Non-NALSAR → waitlist (`approval`), approved by the admin in the Pilot panel.
- Admin "**Move to waitlist**" removes anyone (reason `admin`, cannot come back on their own). The owner plans to remove MBA/IPM students who upload.
- Unused claimed spots are released after 72 h.
- Limits per tester: **2 uploads, 2 memorial drafts** (a "Generate structured draft" counts as one), **2 memorial reviews, 2 voice rounds** (≤15 min), 60 text-bench turns, 40 other AI helps. Owner may raise memorial drafts to 4 (undecided).

## 6. Emails (services/emails.js, mailer.js, passwordReset.js, welcomeEmail.js)

- Sent through **Resend** from `MootCoach <hello@mootcoach.in>`, replies to support@mootcoach.in.
- Pilot emails are in **Devarsh's own voice** (he approved the drafts): short, casual, "Hi Asha," … signed **"Cheers, Devarsh / Founder, MootCoach"**. Do not make them formal or "too polite" — he rejected that. No logo in emails (the § seal was removed).
- Sequence (max 3 per person, never two a day): welcome / waitlisted / spot ready → reminder (day 1, no upload) → voice round (day 2, if none) → feedback (day 4, if none). Follow-ups have unsubscribe. Only people who joined after emails were switched on are mailed.
- Password reset and email confirmation are sent by MootCoach (not Firebase) and open `frontend/account.html`; signed "The MootCoach team".
- Pilot panel → Emails tab → "Send me a preview of every email".

## 7. Cases: only confirmed ones are shown (services/confirmCases.js, authorityVerifier.js, indianKanoon.js)

- **Decision (owner):** a case MootCoach cannot confirm is **left out, never shown with a "check it yourself" warning.** The analysis checks every suggested case alongside its enrichment, keeps confirmed ones (corrected citation if needed), counts the rest ("N were left out"). Failed check → cases held back with "Check the cases now". Memorials: an unconfirmed authority is removed from index and text.
- Trusted sources only: court/government sites, law databases (Indian Kanoon, SCC Online, Manupatra, CaseMine, LiveLaw…), national newspapers. Quora/blogs/student notes never count.
- **Indian Kanoon API** for Indian cases (₹0.50 per search): link to the judgment, court and date. **Open problem:** the first live upload made 10 searches (₹5) and matched none — every case fell back to the web check. Suspect `titleMatches` or the reply format. Next step: upload a fresh proposition and read the Pilot panel line "Indian Kanoon since the last restart: … reply keys: …", then fix. Safeguards: pause after 5 misses in a row (until restart), max 6 searches per upload.

## 8. Costs (Pilot panel → Spend tab, services/spend.js)

- One row per student action (upload, draft, full memorial, review, forecast, Oral Coach, authority cards, briefing, voice round, scoresheet, text turn); Indian Kanoon shown under "By model".
- Measured so far: upload ≈ ₹4.6 (Gemini) + up to ₹3 Indian Kanoon; voice round ≈ ₹13.8; whole trial used ≈ ₹16 by 4 Nov. Estimate for 50 testers ≈ ₹2,000–3,000. Still to do: compare a day's Spend with Google Billing grouped by SKU and correct `SPEND_PRICES`.
- The owner was doing a full "maximum tester" test with `Eastvale-proposition.pdf`, `Valdoria-proposition.pdf` and the 15-minute oral-round script (made in the session scratchpad).

## 9. Other things built recently

Vertex AI for text and voice (judge transcript fixed for Vertex's message order); Moot Calendar synced from `services/competitions.js` on every start (finished moots hidden; the `moot-calendar` agent owns the list, needs organiser sites allowed in the network); landing page claims match the app (5 criteria /100 scoresheet, closed-pilot note); privacy policy lists every service; Clarity masks everything but the landing page and gets no name/email; consent line on sign-in; favicon = cream serif **M on MootCoach red** (placeholder until the real logo); link preview = "MootCoach / State your case." with no icon.

## 10. Owner's preferences

- Honest: flag uncertainty, never invent sources, numbers or quotes.
- Wants to see drafts before tone/branding changes; decides logo later (before public launch).
- Often asks "prompt" = write a Claude-in-Chrome prompt for a browser task.
- Never paste keys or passwords in chat; secrets go in Render or the environment's secrets.
- Explain in plain words; he is not a developer.

## 11. Pending, in order

1. Indian Kanoon matching fix (needs one fresh upload + the Pilot panel line).
2. Checks: Render `EMAIL_FROM` absent; `PILOT_LIMITS` not overriding voice; Clarity masking Strict; Google Billing by SKU vs Spend tab.
3. Decide memorial drafts limit (2 or 4).
4. Update and send the 5-friend soft-launch message (mention: first upload gets a spot; NALSAR friends use Continue with Google or confirm their email).
5. Draft the NALSAR email and LinkedIn post.
6. Optional: allow organiser sites in the network → run the `moot-calendar` agent to refresh dates and add competitions.
7. Before public launch: real logo (favicon, preview, emails), robots.txt/sitemap, BIMI only if worth it.
8. Startup credits (status 4 Nov 2026):
   - Google for Startups: applied, confirmation 3 Nov; watch devarsh@mootcoach.in for reply / identity check; follow up ~10 Nov.
   - Together AI accelerator: submitted 4 Nov (no reference number); reply expected by email.
   - Microsoft for Startups: signed up without investor code; only $200 Azure via "Verify with LinkedIn" (owner, optional).
   - Anthropic startup programme: cohort full, not accepting applications.
   - AWS Activate Founders: not started — needs a paid-tier AWS account (card). Skipped for now; MootCoach does not run on AWS.
