# MootCoach eval suite

Scores the real prompts against fixed test cases, so a prompt change that
breaks something shows up as a failing check instead of a bad round in front of
a student.

```
npm run eval          # everything (about 10 minutes, calls Gemini for real)
npm run eval:fast     # validation + forum detection only (about 4 minutes)
npm run test:verifier # citation-check logic, offline, no API calls
node tools/evals/run.js --only uk-jr-deportation
node tools/evals/run.js --update-baseline   # accept this run as the new baseline
```

Needs `GEMINI_API_KEY` (or a proxy that injects it, as in the cloud sandbox).

## What it checks

**Analysis** (`cases.js`): six fictional propositions covering an Indian Supreme
Court writ, an Indian civil trial, an international human-rights court, an SIAC
arbitration, an English Court of Appeal judicial review, and a recipe that must
be rejected. For each one it checks:

- the document is accepted (or the recipe rejected) by the same rule `/analyze` uses
- the forum, court level and jurisdiction are detected correctly
- the full analysis is valid JSON with every core section
- each issue a coach would insist on is framed
- no law from the wrong forum leaks in (for example Article 21 in an arbitration)
- every authority names two parties and carries a citation or says it is unverified

**Bench**: the hard text bench must refuse trivia, rebuke an improper remark,
treat "I don't know" as a concession instead of repeating itself, and keep each
turn under 90 words.

**Citations**: the live citation check (`/api/verify-authorities`, Gemini with
Google Search grounding) on four authorities: a real case cited with the wrong
year and a misspelt name, two correctly cited real cases, and an invented one.
The invented case must never come back as found. Offline unit tests for the
same logic run without any API: `npm run test:verifier`.

## Reading the result

The run is compared with `baseline.json`. A check that passed there and fails
now is a **regression** and the process exits 1. Model output varies between
runs, so re-run a single new failure before treating it as real.

Every proposition here is fictional. Add a case by writing a new entry in
`cases.js`: say what a competent analysis must contain, as regular expressions.
