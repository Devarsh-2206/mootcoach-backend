# Testing MootCoach on your own computer

This runs the website and the backend on your computer, using the real AI (Vertex/Gemini, Groq) and the real Firebase project. Nothing you do here changes the live site.

**Good to know before you start**
- It uses your real AI allowance and your real Firestore data (the same account you sign in with on mootcoach.in).
- Pilot limits are off locally (`PILOT_MODE` is not set), so rounds here do not use up your pilot allowance.
- Your keys go in a `.env` file on your computer only. `.env` is in `.gitignore`, so it is never committed. Never paste keys into a chat.

## 1. One-time setup

You need Node.js 20 or newer (`node -v` to check).

```bash
git clone https://github.com/Devarsh-2206/mootcoach-backend.git
cd mootcoach-backend
git checkout claude/nifty-knuth-l5swkq      # the branch with the new courtroom
npm install
```

## 2. The `.env` file

Create a file called `.env` in the `mootcoach-backend` folder. Copy each value from **Render → mootcoach-backend-1 → Environment** (same names):

```
PORT=3000
FIREBASE_SERVICE_ACCOUNT=...      # the whole JSON on one line, as on Render
VERTEX_SERVICE_ACCOUNT=...        # the whole JSON on one line, as on Render
GEMINI_API_KEY=...                # if set on Render
GROQ_API_KEY=...
INDIANKANOON_API_TOKEN=...        # optional; without it cases are checked on the web only
```

Leave out `PILOT_MODE`, `SENTRY_DSN` and the email settings, so local errors and emails do not mix with the live ones.

## 3. Start it

```bash
cd mootcoach-backend
npm start
```
Wait for `MootCoach AI running on port 3000`, then open **http://localhost:3000** in Chrome.

The backend serves the website too, so this one window is all you need. (Use `localhost`, not `127.0.0.1`, so Google sign-in is allowed.)

## 4. What to test in the new courtroom

1. Sign in, open a moot (or upload a proposition), choose an issue and side, and go to the **Simulator** step.
2. In the lobby, check that **Text round view** shows **Courtroom** selected.
3. **Text round:** press **Start Text Session**, then **Enter the courtroom**.
   - The judge opens on your issue. Type answers (Enter sends).
   - Cite a real case (for example *Anuradha Bhasin v. Union of India*) and a made-up one. Watch the **Authorities** panel: checking → verified (with a link) / unconfirmed.
   - The judge's face and the "temper" line change as the questions get harder; **Bench notes** show what the judge is probing.
   - Press **✕** (top right) → **End round and get my scoresheet**. You should get the stamped scoresheet.
4. **Voice round:** press **Start Oral Round (Voice)** and allow the microphone.
   - **Lip-sync:** the judge's mouth should move with the voice and stop when the voice stops.
   - The question appears on the slip as it is spoken; your words appear in the record as you speak.
   - The clock counts down from 15:00.
   - Cases you cite are checked in the Authorities panel after each answer.
   - **✕** → **End round** gives the scoresheet.
5. **Classic chat:** switch **Text round view** to **Classic chat** and start a text session. The old chat should open as before.
6. On a phone (same Wi-Fi): this setup only works on the computer itself, so check the phone layout after deploying, or in Chrome DevTools' device mode (F12 → phone icon).

Things to report back: anything that looks wrong, a judge that does not speak or whose mouth does not move, a case marked wrongly, or a scoresheet that does not appear.

## 5. Stop

Press `Ctrl+C` in the terminal.
