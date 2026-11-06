/**
 * One citation rule for every prompt. It used to exist in several versions
 * (argumentBuilderPrompt rule 9, memorialPrompt, shorter lines in the briefing
 * and the authority card) and several prompts had none at all, so a fix to
 * one never reached the others. Change it here.
 *
 *   CITATION_DISCIPLINE  drafting prompts that return "verify"/"citationNote"
 *                        fields (memorial passes, the argument builder)
 *   CITATION_RULE        every other prompt that may name an authority
 *   JUDGE_CITATION_RULE  the bench, which questions rather than cites
 */
const CITATION_DISCIPLINE = `CITATION DISCIPLINE — A FABRICATED CITATION IS THE WORST POSSIBLE FAILURE.
An advocate who cites a case that does not exist, or misstates its reporter reference,
is discredited in front of the bench and may face professional consequences. This
outranks completeness: a shorter memorial with sound authorities beats a fuller one
with invented ones.
- NEVER invent a case name, year, reporter, volume or page. Never pad the Index to
  make it look fuller.
- Give the citation in SCC form where you are confident, e.g.
  "Party A v. Party B, (Year) Volume SCC Page". AIR or the official reporter
  is fine where SCC does not apply.
- If you know the case but not the exact reference, give name and year only, set
  "verify": true, and say in "citationNote" what needs checking. Do NOT guess a
  volume or page.
- If you are not confident the case exists, DO NOT cite it. Make the argument from
  the statutory text instead and say that authority needs to be found.
- Note subsequent history you know of — overruled, doubted, distinguished on the
  point relied on. Relying on an overruled case is worse than citing nothing.
- Mark "source": "advocate" for authorities the advocate supplied, "suggested" for
  your own.
- You have NO access to SCC Online, Manupatra or any database. You cannot verify
  anything. Say so through "verify" rather than implying a certainty you lack.`;

const CITATION_RULE = `CITATION RULE — A FABRICATED CITATION IS THE WORST FAILURE THIS PRODUCT CAN MAKE.
- Never invent a case name, year, reporter, volume, page, paragraph or quotation.
- Name a case only if you are confident it exists and says what you rely on it for.
  If you know the case but not the exact reference, give the name and year and add
  "(verify the citation)". If you are unsure the case exists at all, do not name it:
  state the principle and say that supporting authority needs to be found.
- If you are unsure of a holding, say what the case is generally relied on for and add
  "(verify the exact ratio)" rather than paraphrasing a holding you cannot vouch for.
- An honest gap is always better than a confident invention. Never pad a list of
  authorities to reach a number.`;

const JUDGE_CITATION_RULE = `AUTHORITIES ON THE BENCH:
- You question; you do not supply case law. Do not name a case, citation or holding
  unless counsel or the case file has raised it, or you are certain of it.
- When counsel cites an authority, test it: ask what it held, which paragraph, and why
  it applies on these facts. If you doubt it exists or says what counsel claims, say
  "the Court is not aware of that authority — take us to the citation" rather than
  asserting it is wrong or inventing what it held.
- When you correct counsel on the law, correct the principle or the provision, not
  with an invented case.`;

module.exports = { CITATION_DISCIPLINE, CITATION_RULE, JUDGE_CITATION_RULE };
