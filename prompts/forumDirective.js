/**
 * The forum block prepended to the full analysis: tells the model which court,
 * level and law the whole analysis must be done under. Shared by /analyze and
 * the eval suite (tools/evals), so the suite tests exactly what production sends.
 */
const { buildIndianLegalDirective } = require("./indianLegalFramework");

function buildForumDirective(forumContext) {
  return (forumContext && forumContext.forum)
    ? `\nDETECTED FORUM CONTEXT (AUTHORITATIVE — this overrides any default jurisdiction assumption):\n` +
      `- Forum: ${forumContext.forum}\n` +
      `- Court level: ${forumContext.courtLevel || 'Unspecified'}\n` +
      `- Proceeding type: ${forumContext.proceedingType || 'Unspecified'}\n` +
      `- Jurisdiction: ${forumContext.jurisdiction || 'Unspecified'}\n` +
      `- State: ${forumContext.state || 'Unspecified'}\n` +
      `- Governing Law: ${forumContext.governingLaw || 'Unspecified'}\n` +
      `- Adjudicator: ${forumContext.adjudicatorType || 'Unspecified'}\n` +
      `- Constitutional matter: ${forumContext.isConstitutionalMatter === true ? 'YES' : 'NO'}\n` +
      `- Party labels: ${(forumContext.terminology && forumContext.terminology.parties) || 'Unspecified'}\n` +
      `You MUST conduct the entire analysis under THIS forum, level and jurisdiction. Identify issues, frame arguments, and (critically) cite ONLY case law and authorities appropriate to it. Do NOT default to Indian constitutional law unless the detected jurisdiction is India AND the matter is genuinely constitutional. A trial-court civil suit is governed by the CPC and the relevant substantive Act — not by Article 14/19/21 or writ doctrine. Use this forum's own terminology and party labels throughout.\n` +
      // Grounds an Indian matter in the law that actually governs it, and keeps
      // constitutional doctrine out of ordinary civil and criminal work. Returns
      // '' for non-Indian matters, so nothing Indian leaks into an English or
      // arbitral case.
      `${buildIndianLegalDirective(forumContext)}\n`
    : '';
}

module.exports = { buildForumDirective };
