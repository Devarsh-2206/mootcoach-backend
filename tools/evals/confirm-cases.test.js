/**
 * services/confirmCases.js: only confirmed cases reach the student.
 *   node tools/evals/confirm-cases.test.js
 */
const assert = require('assert');
const { confirmPrecedents } = require('../../services/confirmCases');
const fake = (map) => async (items) => items.map(i => map[i.name] || { status: 'unverified', sources: [] });

(async () => {
  const a = { precedentsNeeded: [
    { caseName: 'Anuradha Bhasin v. Union of India', citation: '(2020) 3 SCC 637' },
    { caseName: 'Minerva Mills Ltd. v. Union of India', citation: '(1981) 3 SCC 625' },
    { caseName: 'Quora Only v. Union', citation: '(2019) 1 SCC 1' },
    { caseName: 'Imaginary v. Nonexistent', citation: '(2031) 9 SCC 9' },
    'Shreya Singhal v. Union of India',
  ] };
  const verify = fake({
    'Anuradha Bhasin v. Union of India': { status: 'verified', sources: [{ title: 'indiankanoon.org', url: 'u' }] },
    'Minerva Mills Ltd. v. Union of India': { status: 'corrected', foundCitation: '(1980) 3 SCC 625', sources: [{ title: 'scconline.com', url: 'u' }] },
    'Quora Only v. Union': { status: 'unverified', weakOnly: true, sources: [{ title: 'quora.com', url: 'u' }] },
    'Shreya Singhal v. Union of India': { status: 'verified', sources: [{ title: 'sci.gov.in', url: 'u' }] },
  });
  const r = await confirmPrecedents(a, { verify });
  assert.deepStrictEqual([r.suggested, r.kept, r.removed], [5, 3, 2]);
  assert.deepStrictEqual(a.precedentsNeeded.map(c => c.caseName), ['Anuradha Bhasin v. Union of India', 'Minerva Mills Ltd. v. Union of India', 'Shreya Singhal v. Union of India']);
  assert.strictEqual(a.precedentsNeeded[1].citation, '(1980) 3 SCC 625', 'wrong citation replaced by the confirmed one');
  assert.strictEqual(a.precedentsNeeded[1].citationGiven, '(1981) 3 SCC 625');
  assert.strictEqual(a.precedentsNeeded[0].verification.sources[0].title, 'indiankanoon.org');
  // Already checked: not checked again.
  let calls = 0;
  await confirmPrecedents(a, { verify: async (x) => { calls++; return []; } });
  assert.strictEqual(calls, 0);

  // Check fails: nothing unconfirmed is shown; cases held back for a retry.
  const b = { precedentsNeeded: [{ caseName: 'Anuradha Bhasin v. Union of India', citation: '(2020) 3 SCC 637' }] };
  const r2 = await confirmPrecedents(b, { verify: async () => { throw new Error('429 quota'); } });
  assert.ok(r2.failed); assert.strictEqual(b.precedentsNeeded.length, 0); assert.strictEqual(b.precedentsPending.length, 1);
  // ...and the retry confirms them.
  const r3 = await confirmPrecedents(b, { verify });
  assert.ok(!r3.failed); assert.strictEqual(b.precedentsNeeded.length, 1); assert.ok(!b.precedentsPending);

  // Timeout counts as a failure, never as approval.
  const c = { precedentsNeeded: [{ caseName: 'Slow v. Check' }] };
  const r4 = await confirmPrecedents(c, { verify: () => new Promise(() => {}), timeoutMs: 50 });
  assert.ok(r4.failed); assert.strictEqual(c.precedentsNeeded.length, 0);
  // Deferred check: the analysis goes out with its cases held back, none shown.
  {
    const { markPending, confirmPrecedents: cp } = require('../../services/confirmCases');
    const a = { precedentsNeeded: [{ caseName: 'A v. B', citation: '(2017) 10 SCC 1' }, 'C v. D'] };
    const c = markPending(a);
    assert.deepStrictEqual(a.precedentsNeeded, []);
    assert.strictEqual(a.precedentsPending.length, 2);
    assert.ok(c.pending && c.suggested === 2);
    // The later check runs on the held-back cases.
    await cp(a, { verify: async (items) => items.map(it => ({ status: /A v\. B/.test(it.name) ? 'verified' : 'unverified', sources: [] })) });
    assert.strictEqual(a.precedentsNeeded.length, 1); assert.ok(!a.precedentsPending); assert.ok(!a.casesCheck.pending);
    assert.strictEqual(a.casesCheck.removed, 1);
  }
  console.log('PASS confirm cases: keeps confirmed, corrects citations, leaves out the rest, holds back on failure');
})().catch(e => { console.error('FAIL confirm cases:', e); process.exit(1); });
