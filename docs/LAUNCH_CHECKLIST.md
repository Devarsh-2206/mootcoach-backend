# MootCoach — pilot launch checklist

Last updated 10 November 2026 (build 2026-11-10.2). ✅ done · ⬜ owner to do · ⚠️ known and accepted for the pilot.

## 1. Owner actions before the announcement

| | What | Where |
|---|---|---|
| ⬜ | **Rotate the Indian Kanoon token** (it appeared in a PDF shared in a chat) | api.indiankanoon.org → Set API-Key → Render `INDIANKANOON_API_TOKEN` |
| ⬜ | **Upgrade the backend to the $25 plan** (1 CPU, 2 GB; the free plan sleeps and is slow) | Render → mootcoach-backend-1 → Settings → Compute |
| ⬜ | Check these Render variables: `PILOT_MODE=on`, `PILOT_ADMINS` = your email(s), `SENTRY_DSN` set; **absent**: `EMAIL_FROM`, `ALLOW_UNAUTHENTICATED`, `AI_PAUSED`; `PILOT_LIMITS` must not raise voice rounds above 2 | Render → Environment |
| ⬜ | First wave: `PILOT_CAP=15`; raise to 50 after 1–2 smooth days | Render → Environment |
| ⬜ | Uptime alert: add `https://mootcoach-backend-1.onrender.com/health` and `https://mootcoach.in` (free, 5 min interval) | uptimerobot.com |
| ⬜ | Clarity masking set to **Strict** | clarity.microsoft.com → Settings → Masking |
| ⬜ | Srushti's review, then fix what she finds | — |
| ⬜ | Decide: tester reward (e.g. 12 months free after launch)? If yes, add one line to the announcement | — |
| ⬜ | Legal question for a lawyer/CA: the DPDP Act 2023 treats under-18s as children (parental consent). Some first-year students may be 17. Decide whether to state "18 or over, or with a parent's consent" in the Terms | — |
| ⬜ | Backups: Firestore has no scheduled backup. Firestore backups / point-in-time recovery need the paid (Blaze) Firebase plan — decide whether the pilot data is worth it (cost is small for a pilot; verify current pricing) | Firebase console → Firestore → Backups |

## 2. Security (review of 10 Nov 2026)

- ✅ Firestore rules: each user reads/writes only their own data; pilot, feedback, spend, email logs and caches are server-only.
- ✅ Every AI route verifies the Firebase login on the server; admin = verified email on `PILOT_ADMINS`.
- ✅ AI output and student text are escaped before display; links are http(s) only.
- ✅ Per-tester limits (uploads 2, drafts 2, reviews 2, voice 2, bench turns 60, extras 40); case checks 10/day (counted before running); Indian Kanoon 200 searches/day site-wide.
- ✅ Overload queue (PDFs 2, analyses 8, voice rounds 10); voice messages ≤ 2 MB.
- ✅ Fails closed: missing/mistyped `PILOT_MODE` on Render = on; `ALLOW_UNAUTHENTICATED` ignored on Render.
- ✅ TLS certificate checks always on; CORS limited to mootcoach.in; security headers on the API.
- ✅ Student text fenced from the AI (prompt injection), judge persona set by the server, client-listed "known authorities" not trusted.
- ✅ Dependencies: high-severity advisories fixed (body-parser, multer).
- ✅ Error reports (Sentry, EU) carry no student content; `/api/usage` admins only.
- ⚠️ 8 moderate advisories in `uuid` inside firebase-admin (not reachable from our code); fix with the firebase-admin major upgrade after the pilot.
- ⚠️ A removed account keeps a valid login token for up to an hour (the pilot gate still blocks the AI).
- ⚠️ No Content-Security-Policy on the website itself (defence in depth; escaping covers it). After the pilot.

## 3. Privacy and data

- ✅ Privacy policy lists every service (Google/Vertex, Groq, Indian Kanoon, Firebase, Render, Resend, Zoho, Sentry, Clarity) and the 30-day shared caches.
- ✅ **Delete my account** (sidebar): removes moots, analyses, drafts, sessions, pilot record and feedback, email log and the sign-in account; frees the pilot place.
- ✅ Clarity masks the workspace and gets no name/email; consent line on sign-in.

## 4. Product checks

- ✅ Upload → analysis in ~60–65 s; cases confirmed in the background (Indian Kanoon + trusted web), including cases cited inside the arguments.
- ✅ Public pages load on desktop and phone with no horizontal scroll (landing, privacy, terms, about, account).
- ✅ 19 offline test suites + bench evals on the production judge model (incl. injection checks).
- ⚠️ Not yet exercised by a real tester since the latest changes: the "Checking cases…" step, a full voice round, argument builder/memorial. Known weakness: the judge sometimes re-asks after "I don't know" (1 of 2 runs).

## 5. Launch day

1. Fix anything from Srushti's review; push.
2. `PILOT_CAP=15`.
3. Announcement (draft in the session; via moot court society / batch groups, 8–9 pm) + LinkedIn the same day.
4. Watch: Pilot panel (load line, Spend, Indian Kanoon line), Sentry email, Render metrics.
5. After 1–2 smooth days: `PILOT_CAP=50`.
