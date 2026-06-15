# MootCoach V3 — Product Design (Revised per directives · for approval)

*Revised after "APPROVED WITH MODIFICATIONS." No code changed. Implementation begins only on your green light.*

---

## 0. Revised thesis

> **The selected issue is the atom of MootCoach.** Forum is detected first and colours everything; then every downstream asset — authorities, arguments, defects, vulnerabilities, bench questions, advocacy, the simulator — is *inherited from the issue the user is working on*, never generated independently. Continuity is the plumbing, not a feature the user manages. Intelligence quality comes before UI polish.

Success metric (yours): the user finishes feeling *"I understand the case, I know my authorities, I know my vulnerabilities, and I can survive the bench."*

---

## 1. Directive 1 — Issue Intelligence is the engine

Everything is a **projection of the selected issue.** The model:

```
FORUM (detected first; jurisdiction, governing law, adjudicator)
   └─ ISSUE (the unit the user selects)
        ├─ Petitioner theory / Respondent theory
        ├─ Authorities (from the single analysis pool, mapped to THIS issue)
        ├─ Vulnerabilities + argument defects (for the chosen side)
        ├─ Fatal bench attacks (the questions the bench will ask on THIS issue)
        ├─ Advocacy (opening, structured args, rebuttals — generated for THIS issue)
        └─ Simulator (attacks THIS issue, this side, these authorities, this draft)
```

Your backend already chains this way (`issueIntelligence` → `authorityIntelligence` → `advocacyIntelligence`, each fed the previous). V3's job is to make the **frontend key every panel off the selected issue's slice** and stop any screen from showing generic, un-inherited content. No asset is ever produced free-floating; it always traces back to an issue + side + forum.

---

## 2. Directive 2 — the Case File is invisible

I'm removing the visible "Case File panel + readiness management strip" from the earlier proposal. MootCoach is **not** a project-management tool.

- Internally there is one state object (the existing `window.mootState`) that records the user's selections and carries them forward. It is **plumbing the user never sees or manages.**
- The user only ever touches four concrete things: **Issues, Authorities, Arguments, Bench preparation.**
- The only outward signal of progress is lightweight and contextual (e.g. an issue quietly marked "ready" once it has a side + pinned authorities + a draft) — never a dashboard to maintain.

Elegant workflow over data structures.

---

## 3. Directive 8 (P0) — Forum detection must run *before* analysis

**This is the most important backend finding, and it's the root of the "Indian cases for an international problem" complaint.**

Today the pipeline runs the **main analysis first** (`analysisSystemPrompt`, whose default jurisdiction is hardcoded to *Indian* law) and only detects forum **several steps later**. So issues, arguments and cases are generated *before* the system knows it's an arbitration — they default to Indian constitutional law.

**Fix (P0):** detect Forum + Jurisdiction + Governing Law + Adjudicator type in a fast first pass, then **inject that context into the main analysis prompt and every downstream engine.** Everything is forum-aware from the first token. This single reordering fixes jurisdiction-wrong authorities at the source — not with a frontend patch.

---

## 4. The four stages, reframed

### Stage 1 — Case Intelligence
- **Gain:** forum/jurisdiction/governing law (detected first), then a *filtered* set of genuinely contestable issues (trivial ones demoted, not listed flat), difficulty, and the authority pool.
- **Action:** upload; review.
- **Inherited output:** forum context + the issue set + the single authority pool — the spine for everything after.

### Stage 2 — Issue Workspace (the center of MootCoach · Directive 3)
The heart. For **every issue**, the user sees, in one focused view:
**Issue · Ranking · Why it matters · Petitioner theory · Respondent theory · Key authorities · Vulnerabilities · Fatal bench attacks.**
- **Action:** pick side; accept/reject the AI's argument lines; pin the authorities that matter; mark which fatal attacks to prepare.
- **Goal feeling:** *"I understand this issue completely."*
- **Inherited output:** a committed per-issue strategy that Stages 3 and 4 read directly.

### Stage 3 — Advocacy Builder (Directive 4 — NOT a document editor)
We are not competing with Word. The user should **not type for hours.** The AI generates, the user curates.
- **AI generates, per issue + side:** opening submission, structured arguments (main + sub-arguments), rebuttals, authority integration, and **draft answers to the fatal bench questions.**
- **Per authority:** Insert into opening / Insert into argument / Distinguish / Opponent's likely use / Courtroom application.
- **Action:** accept, tweak, regenerate blocks — not author from a blank page.
- **Inherited output:** generated advocacy + prepared bench answers attached to the issue.

### Stage 4 — The Bench (the hero · Directive 5)
Preserve entirely: voice, live questioning, adversarial pressure, post-round report, scoring. Everything else funnels here, and the test for every other feature is literally *"does this improve simulator performance?"*
- **Add:** judge selection (§5).
- **Inherited input:** the selected issue, side, pinned authorities, generated draft, and the fatal questions — so the bench attacks **the user's actual case**, and the post-round report points back to the weak issue.

---

## 5. Directive 6 — Judge selection (behavioural, not cosmetic)

Ten archetypes, each defined by real parameters passed into `/simulate-bench` (same mechanism as the forum directive already shipped — no route change). Each differs in **pressure, interruption frequency, question focus, and register:**

| Archetype | Behaviour that must change |
|---|---|
| Friendly | Low pressure, clarifying/encouraging, lets you finish |
| Neutral | Balanced, tests reasoning evenly |
| Aggressive | High pressure, frequent interruption, demands direct yes/no |
| Technical | Drills doctrinal precision — tests, elements, statutory text |
| Procedural | Jurisdiction, maintainability, standing, limitation, forum |
| Skeptical | Distrusts your authorities; "why should I accept that?", forces distinguishing |
| Constitutional Purist | Structure, rights balancing, proportionality, first principles |
| International Arbitrator | Treaty interpretation, VCLT, jurisdiction *ratione materiae/personae*; arbitration register |
| Hostile Tribunal | Maximum pressure, rapid-fire, traps, dismissive |
| Mixed Bench | Rotates 2–3 archetypes with different focuses (engine already supports multiple judges + `speakingJudge`) |

**Forum-gated:** arbitration forums offer Arbitrator/Tribunal personas + language; courts offer Judge personas. Difficulty (easy/moderate/hard) still scales intensity on top.

---

## 6. Directive 7 — Authority continuity (single source of truth)

One pool, generated once in Analysis (`precedentsNeeded` + `authorityIntelligence.authorityRoadmap`, keyed by `targetIssueId`). Stage 2 shows each issue's mapped authorities **from that pool**; Stage 3 inserts from it; Stage 4 cites from it. **No regeneration, no unrelated cases, anywhere.** (Already implemented in the last session; V3 confirms and extends it to the per-issue mapping.)

---

## 7. Directive 9 — Implementation order (backend intelligence first)

Polishing UI while intelligence is weak would be malpractice. Revised order:

1. **Forum Detection (P0)** — detect first, inject into the main analysis + all engines (§3).
2. **Issue Intelligence** — relevance-filter to contestable issues; deepen; establish as the inheritance spine.
3. **Authority** — forum/jurisdiction constraint; 8–10 cases with full ratio; clean per-issue mapping.
4. **Argument depth** — main + 2–3 sub-arguments, minimum substance, citations (`analysisSystemPrompt`, `argumentBuilderPrompt`).
5. **Simulator** — judge personas with real behavioural differences; consume issue-specific fatal questions + the user's draft.
6. **Stage continuity layer** — the invisible inheritance wiring (extends existing `mootState`).
7. **UI refinements** — Stage 2 as the center; Stage 3 generation-first; remove dead-ends; fold strengths/weaknesses into issue cards.

**Honest constraint:** steps 1–5 are prompt/orchestration edits in `prompts/*.js` and `server.js`. I can implement and structurally validate them here, but *quality* (depth, relevance, correct authorities) can only be truly judged by running them against real propositions with your live Groq key. I'll build them to be testable and give you a checklist to validate each on your machine.

---

## 8. What stays protected (unchanged)
Simulator workflow, voice, post-round report, scoring; Cases & Precedents; Why selected / Application / Opponent / Distinguish; bench vulnerabilities. We improve around these; we do not touch them.
