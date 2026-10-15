/**
 * The judge the student picked, as the voice round needs it.
 *
 * Reads the same file the website renders the judge cards from
 * (frontend/js/config/judges.json), so a selected judge is always spoken by
 * their own voice, in their roster's accent, with their own manner. The text
 * round builds the same persona in frontend/js/config/benchProfiles.js
 * (personaDirective / fullBenchDirective); keep the two in step.
 */
const DATA = require('../frontend/js/config/judges.json');

const FALLBACK_VOICE = { male: 'Charon', female: 'Kore' };

function findJudge(id) {
  if (!id) return null;
  for (const [rosterKey, roster] of Object.entries(DATA.rosters)) {
    const judge = roster.members.find(j => j.id === id);
    if (judge) return { judge, rosterKey, roster };
  }
  return null;
}

function accentOf(roster) {
  return (roster && DATA.accents[roster.accent]) || DATA.accents.neutral;
}

function personaBlock(j, roster) {
  const accent = accentOf(roster);
  const lines = [
    `[Presiding: ${j.name} (${j.archetype}). ${j.directive}`,
    j.temperament && `Temperament: ${j.temperament}`,
    j.style && `How you speak: ${j.style} You address counsel like this: ${j.address}`,
    j.habits && `Your habit: ${j.habits}`,
    j.temper && `Your temper: ${j.temper}`,
    j.interrupts && `When you interrupt: ${j.interrupts}.`,
    j.samples && j.samples.length && `Questions in your style (examples of tone only; never read them out verbatim): ${j.samples.map(q => `"${q}"`).join(' ')}`,
    accent.instruction && `Voice and accent: ${accent.instruction}`,
  ].filter(Boolean);
  return lines.join('\n') + ']';
}

function fullBenchBlock(roster) {
  const accent = accentOf(roster);
  const who = roster.members.map(j =>
    `- ${j.name} (${j.archetype}${j.presiding ? ', presiding' : ''}): questions only on ${j.focus}. ${j.style || ''} ${j.habits || ''}`.trim());
  return `[${DATA.fullBench.directive}\nThe panel:\n${who.join('\n')}` +
    (accent.instruction ? `\nVoice and accent: ${accent.instruction}` : '') + ']';
}

/**
 * What the voice session should be for this judge (or Full Bench of this
 * roster). Unknown ids fall back to the old gender-only behaviour, so an older
 * cached page still gets a working round.
 */
function resolveVoiceJudge({ judgeId, rosterKey, gender }) {
  if (judgeId === DATA.fullBench.id) {
    const roster = DATA.rosters[rosterKey] || DATA.rosters.generic;
    const presiding = roster.members.find(j => j.presiding) || roster.members[0];
    return {
      name: DATA.fullBench.name,
      voiceName: (presiding && presiding.voice) || FALLBACK_VOICE.male,
      languageCode: accentOf(roster).languageCode || null,
      persona: fullBenchBlock(roster),
    };
  }
  const found = findJudge(judgeId);
  if (found) {
    const { judge, roster } = found;
    return {
      name: judge.name,
      voiceName: judge.voice || FALLBACK_VOICE[judge.gender] || FALLBACK_VOICE.male,
      languageCode: accentOf(roster).languageCode || null,
      persona: personaBlock(judge, roster),
    };
  }
  return {
    name: null,
    voiceName: String(gender).toLowerCase() === 'female' ? FALLBACK_VOICE.female : FALLBACK_VOICE.male,
    languageCode: null,
    persona: '',
  };
}

module.exports = { resolveVoiceJudge, findJudge, JUDGES: DATA };
