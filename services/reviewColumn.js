/**
 * The custom column of the review table: one question asked of several moots
 * in a single call. Each answer must carry a short verbatim quote from that
 * moot's own analysis; the quote is checked here, and an answer whose quote is
 * not in the text is returned with supported:false so the table shows it as
 * unsupported. Same rule as the citation check: the model's word alone is not
 * evidence.
 */
const norm = s => String(s || '').toLowerCase().replace(/[“”"'‘’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Pure: is `quote` really in `text`? Tolerates case, punctuation and ellipses. */
function quoteSupported(quote, text) {
  const q = norm(quote);
  if (q.length < 8) return false;
  const t = norm(text);
  if (t.includes(q)) return true;
  // "first part … second part": every piece of at least four words must be there.
  const pieces = String(quote).split(/\.\.\.|…/).map(norm).filter(p => p.split(' ').length >= 4);
  return pieces.length > 1 && pieces.every(p => t.includes(p));
}

const PROMPT = `You answer one question about several moot court propositions, each given as its analysis text with an id.
For EACH id, answer from that text only. Return ONLY JSON:
{"answers":[{"id":"<id>","answer":"<at most 25 words>","quote":"<a short passage copied word for word from that text which supports the answer, or empty>"}]}
Rules: copy the quote exactly; never paraphrase it. If the text does not answer the question, say "Not addressed in this moot's analysis" and leave the quote empty. Never use outside knowledge.`;

function buildUser(question, rows) {
  return `QUESTION: ${question}\n\n` + rows.map(r => `=== id: ${r.id} ===\n${r.text}`).join('\n\n');
}

/** Pure: model JSON + rows → checked answers, one per row, in row order. */
function checkAnswers(parsed, rows) {
  const list = Array.isArray(parsed && parsed.answers) ? parsed.answers : [];
  return rows.map(r => {
    const a = list.find(x => x && String(x.id) === String(r.id)) || {};
    const answer = String(a.answer || '').slice(0, 300);
    const quote = String(a.quote || '').slice(0, 400);
    const notAddressed = /not addressed/i.test(answer) && !quote;
    return { id: r.id, answer: answer || 'No answer', quote, supported: notAddressed || (!!quote && quoteSupported(quote, r.text)) };
  });
}

module.exports = { quoteSupported, checkAnswers, buildUser, PROMPT };
