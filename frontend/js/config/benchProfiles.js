// ── DIFFICULTY = DEPTH OF QUESTIONING (not quantity / interruption) ──
export const DEPTH_PROFILES = {
  easy: {
    label: 'Foundational',
    summary: 'Foundational questions — tests that you understand the issue and can frame it cleanly.',
    directive: 'QUESTIONING DEPTH = FOUNDATIONAL. Ask surface-level, foundational questions that check the advocate understands the issue and its basic framing. Take one concept at a time. Do NOT drill into deep doctrinal sub-layers or set traps. Keep it shallow and clear.'
  },
  moderate: {
    label: 'Applied',
    summary: 'Applied questioning — probes your reasoning and how you apply authority to the facts.',
    directive: 'QUESTIONING DEPTH = APPLIED. Ask questions of moderate depth that probe the advocate\'s reasoning and how they apply authority to the facts. Follow up once or twice on weak points, but do not exhaustively dissect every sub-layer.'
  },
  hard: {
    label: 'Deep',
    summary: 'Deep, detailed interrogation — drills every sub-layer, distinguishes your cases, exposes gaps.',
    directive: 'QUESTIONING DEPTH = DEEP & EXHAUSTIVE. Ask deep, detailed, layered questions. Drill every sub-layer of the issue, force the advocate to distinguish adverse authority, expose gaps and inconsistencies, and pursue relentless, precise follow-ups until the point is fully tested.'
  }
};

// ── JUDGES: one file, frontend/js/config/judges.json ──
// The server reads the same file (prompts/judgePersona.js), so the judge a
// student picks here is the judge the voice round speaks as: same voice,
// accent, style and habits. Nothing about a judge is defined anywhere else.
//
// Each judge questions ONLY within their own remit (strict persona scoping),
// and the names match the jurisdiction (Indian benches for India, English for the UK).
import { BUILD } from '../config.js';

async function loadJudges() {
  const url = new URL('./judges.json', import.meta.url);
  url.searchParams.set('v', BUILD);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: attempt ? 'reload' : 'default' });
      if (res.ok) return await res.json();
    } catch (e) { /* retried once below */ }
  }
  console.error('[judges] judges.json could not be loaded; the bench falls back to one generic judge.');
  return null;
}
const DATA = (await loadJudges()) || {
  accents: { neutral: { languageCode: null, instruction: '' } },
  rosters: { generic: { label: 'Bench', accent: 'neutral', members: [
    { id: 'gen-marlowe', name: 'Presiding Judge Marlowe', gender: 'male', archetype: 'The Mentor', temperament: 'Encouraging and clear.', focus: 'Issue framing · Clarity', directive: 'You are Presiding Judge Marlowe. Question on clarity of issue framing and fundamentals.' }
  ] } },
  fullBench: { id: 'full', name: 'Full Bench', gender: 'male', archetype: 'Multi-Judge Panel (advanced)', temperament: 'The entire panel questions you in turn.', focus: 'All angles', directive: 'This is a FULL BENCH. Rotate between the panel members in turn, each identifying themselves before they speak.' }
};

const members = key => (DATA.rosters[key] ? DATA.rosters[key].members : []);
export const COURT_ROSTERS = {
  india: members('india'),
  indiaCivil: members('indiaCivil'),
  uk: members('uk'),
  generic: members('generic'),
};
export const JUDGE_ROSTERS = { tribunal: members('tribunal') };
export const FULL_BENCH = DATA.fullBench;

/** Which roster a judge belongs to ('india', 'uk', 'tribunal', …), or null. */
export function rosterKeyOf(judgeId) {
  for (const [key, r] of Object.entries(DATA.rosters)) if (r.members.some(j => j.id === judgeId)) return key;
  return null;
}
export function rosterMembers(key) { return members(key); }

/**
 * Everything the bench needs to BE this judge: remit, temperament, how they
 * speak, their habits, when they interrupt, and the accent of their roster.
 * prompts/judgePersona.js builds the same text on the server for the voice
 * round; keep the two in step.
 */
export function personaDirective(j) {
  if (!j) return '';
  if (j.id === FULL_BENCH.id) return `[${FULL_BENCH.directive}]`;
  const roster = DATA.rosters[rosterKeyOf(j.id)];
  const accent = roster && DATA.accents[roster.accent];
  const lines = [
    `[Presiding: ${j.name} (${j.archetype}). ${j.directive}`,
    j.temperament && `Temperament: ${j.temperament}`,
    j.style && `How you speak: ${j.style} You address counsel like this: ${j.address}`,
    j.habits && `Your habit: ${j.habits}`,
    j.interrupts && `When you interrupt: ${j.interrupts}.`,
    j.samples && j.samples.length && `Questions in your style (examples of tone only; never read them out verbatim): ${j.samples.map(q => `"${q}"`).join(' ')}`,
    accent && accent.instruction && `Register: ${accent.instruction}`,
  ].filter(Boolean);
  return lines.join('\n') + ']';
}

/** The Full Bench: every member of the roster, each in their own manner. */
export function fullBenchDirective(rosterKey) {
  const roster = DATA.rosters[rosterKey] || DATA.rosters.generic;
  const accent = roster && DATA.accents[roster.accent];
  const who = (roster ? roster.members : []).map(j =>
    `- ${j.name} (${j.archetype}${j.presiding ? ', presiding' : ''}): questions only on ${j.focus}. ${j.style || ''} ${j.habits || ''}`.trim());
  return `[${FULL_BENCH.directive}\nThe panel:\n${who.join('\n')}` +
    (accent && accent.instruction ? `\nRegister: ${accent.instruction}` : '') + ']';
}
