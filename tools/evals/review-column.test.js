// Offline test: review-table answers are only "supported" when their quote is in the moot's text.
// node tools/evals/review-column.test.js
const assert = require('assert');
const { quoteSupported, checkAnswers } = require('../../services/reviewColumn');
const text = 'Issues: Whether the suspension order violates Article 19(1)(a) of the Constitution | Whether compensation is payable. Hardest issue: proportionality of a 74-day district-wide shutdown.';
assert.ok(quoteSupported('violates Article 19(1)(a) of the Constitution', text));
assert.ok(quoteSupported('VIOLATES ARTICLE 19(1)(A) OF THE CONSTITUTION.', text), 'case and punctuation tolerated');
assert.ok(quoteSupported('Whether the suspension order violates … proportionality of a 74-day district-wide', text), 'ellipsis pieces');
assert.ok(!quoteSupported('violates Article 21 right to life', text), 'invented quote rejected');
assert.ok(!quoteSupported('Article', text), 'too short to count');
const rows = [{ id: 'a', text }, { id: 'b', text: 'Arbitration under SIAC rules about force majeure.' }, { id: 'c', text: 'Nothing relevant.' }];
const out = checkAnswers({ answers: [
  { id: 'a', answer: 'Yes, Article 19(1)(a).', quote: 'violates Article 19(1)(a) of the Constitution' },
  { id: 'b', answer: 'Yes, Article 21.', quote: 'the right to life under Article 21' },
  { id: 'c', answer: "Not addressed in this moot's analysis", quote: '' },
] }, rows);
assert.deepEqual(out.map(o => o.supported), [true, false, true]);
assert.equal(checkAnswers(null, rows)[0].answer, 'No answer');
console.log('ALL PASS');
