// Offline test of how grounded answers become verification results (no network).
// node tools/evals/verifier.test.js
const assert = require('assert');
const { interpret } = require('../../services/authorityVerifier');
const items = [
  { name: 'Suryadev Rai v. Ram Chander Rai', citation: '(2008) 12 SCC 1' },
  { name: 'K.S. Puttaswamy v. Union of India', citation: '(2017) 10 SCC 1' },
  { name: 'Ravindra Kesharwani v. State of Bihar', citation: '(2019) 4 SCC 912' },
  { name: 'Anuradha Bhasin v. Union of India', citation: '(2020) 3 SCC 637' },
];
const text = [
  '[1] FOUND | Surya Dev Rai v. Ram Chander Rai | (2003) 6 SCC 675 | Supreme Court of India, 2003',
  '[2] FOUND | K.S. Puttaswamy v. Union of India | (2017) 10 SCC 1 | Supreme Court of India, 2017',
  '[3] NOT FOUND | Ravindra Kesharwani Bihar | - | -',
  '[4] FOUND | Anuradha Bhasin v. Union of India | (2020) 3 SCC 637 | Supreme Court — 2020',   // non-ASCII dash, no grounding
].join('\n');
const b = s => Buffer.byteLength(s, 'utf8');
const L = text.split('\n'); const off = i => b(L.slice(0, i).join('\n') + (i ? '\n' : ''));
const gm = {
  groundingChunks: [{ web: { uri: 'https://x/1', title: 'indiankanoon.org' } }, { web: { uri: 'https://x/2', title: 'scobserver.in' } }, { web: { uri: 'https://x/3', title: 'main.sci.gov.in' } }],
  groundingSupports: [
    { segment: { startIndex: off(0), endIndex: off(0) + b(L[0]) }, groundingChunkIndices: [0] },
    { segment: { startIndex: off(1) + 4, endIndex: off(1) + b(L[1]) }, groundingChunkIndices: [1, 2] },
  ],
};
const r = interpret(items, text, gm);

assert.equal(r[0].status, 'corrected'); assert.equal(r[0].foundCitation, '(2003) 6 SCC 675'); assert.equal(r[0].sources[0].title, 'indiankanoon.org');
assert.equal(r[1].status, 'verified'); assert.equal(r[1].sources.length, 2);
assert.equal(r[2].status, 'unverified');
assert.equal(r[3].status, 'unverified', 'FOUND without a source must not count'); 
assert.equal(interpret(items, '', {})[0].status, 'unverified');
console.log('ALL PASS');
