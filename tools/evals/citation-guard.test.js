// Offline test: memorial citations are settled from verification results (verifier stubbed).
// node tools/evals/citation-guard.test.js
const assert = require('assert');
const path = require('path');
const R = p => path.join(path.join(__dirname, '../../services'), p);
require.cache[require.resolve(R('authorityVerifier.js'))] = { exports: { MAX_ITEMS: 12, verifyAuthorities: async (items) => items.map(a =>
  /Suryadev/.test(a.name) ? { status: 'corrected', foundCitation: '(2003) 6 SCC 675', sources: [{ title: 'indiankanoon.org', url: 'u' }] }
  : /Puttaswamy/.test(a.name) ? { status: 'verified', foundCitation: a.citation, sources: [{ title: 'sci.gov.in', url: 'u' }] }
  : { status: 'unverified', sources: [], note: 'No reliable source found. Check this before citing it.' }) } };
const { applyCitationGuard, verifyFlaggedAuthorities } = require(R('citationGuard.js'));
(async () => {
  const memorial = {
    body: ['As held in Suryadev Rai v. Ram Chander Rai, (2008) 12 SCC 1, the court…', 'See Puttaswamy, (2017) 10 SCC 1.'],
    indexOfAuthorities: { cases: [
      { name: 'Suryadev Rai v. Ram Chander Rai', citation: '(2008) 12 SCC 1' },
      { name: 'K.S. Puttaswamy v. Union of India', citation: '(2017) 10 SCC 1' },
      { name: 'Imaginary v. Nonexistent', citation: '(2031) 99 SCC 1' },
      { name: 'Advocate Own v. Case', citation: '(2010) 1 SCC 1' },
    ] },
  };
  applyCitationGuard(memorial.indexOfAuthorities, [{ name: 'Advocate Own v. Case', citation: '(2010) 1 SCC 1' }]);
  const st = await verifyFlaggedAuthorities(memorial, {});
  const c = memorial.indexOfAuthorities.cases;
  assert.deepEqual({ v: st.verified, c: st.corrected, u: st.unverified }, { v: 1, c: 1, u: 1 });
  assert.equal(c[0].citation, '(2003) 6 SCC 675'); assert.equal(c[0].verify, false);
  assert.ok(memorial.body[0].includes('(2003) 6 SCC 675') && !memorial.body[0].includes('(2008) 12 SCC 1'), 'body citation corrected');
  assert.equal(c[1].verify, false); assert.equal(c[1].source, 'verified');
  assert.equal(c[2].verify, true); assert.ok(/Check this before citing/.test(c[2].citationNote));
  assert.equal(c[3].source, 'advocate'); assert.ok(!c[3].verify, 'advocate authority untouched');
  // failure path: never throws, leaves marks
  require.cache[require.resolve(R('authorityVerifier.js'))].exports.verifyAuthorities = async () => { throw new Error('429 quota'); };
  const m2 = { indexOfAuthorities: { cases: [{ name: 'X v. Y', citation: '(2001) 1 SCC 1', verify: true }] } };
  const st2 = await verifyFlaggedAuthorities(m2, {});
  assert.ok(st2.skipped && m2.indexOfAuthorities.cases[0].verify === true);
  console.log('ALL PASS', JSON.stringify(st));
})().catch(e => { console.error(e); process.exit(1); });
