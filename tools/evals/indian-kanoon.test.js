/**
 * services/indianKanoon.js with a fake Indian Kanoon API.
 *   node tools/evals/indian-kanoon.test.js
 */
const assert = require('assert');
process.env.INDIANKANOON_API_TOKEN = 'test-token';
const ik = require('../../services/indianKanoon');

const DB = [
  { tid: 91938676, title: 'Justice K.S.Puttaswamy(Retd) vs Union Of India on 24 August, 2017', docsource: 'Supreme Court of India', publishdate: '2017-08-24' },
  { tid: 1939993, title: 'Minerva Mills Ltd. & Ors vs Union Of India & Ors on 31 July, 1980', docsource: 'Supreme Court of India', publishdate: '1980-07-31' },
  { tid: 82461587, title: 'Anuradha Bhasin vs Union Of India on 10 January, 2020', docsource: 'Supreme Court of India', publishdate: '2020-01-10' },
  { tid: 5, title: 'Union Of India vs Some Other Party on 1 March, 2015', docsource: 'Supreme Court of India', publishdate: '2015-03-01' },
];
let calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url, init });
  const q = decodeURIComponent(url.split('formInput=')[1].split('&')[0]).toLowerCase();
  const docs = DB.filter(d => q.split(/\W+/).filter(w => w.length > 3).some(w => d.title.toLowerCase().includes(w)));
  return { ok: true, status: 200, json: async () => ({ docs }), text: async () => JSON.stringify({ docs }) };
};

(async () => {
  // Matching: both sides must be in the title; "Union of India" alone is not enough.
  assert.ok(ik.titleMatches('K.S. Puttaswamy v. Union of India', DB[0].title));
  assert.ok(ik.titleMatches('Minerva Mills Ltd. v. Union of India', DB[1].title));
  assert.ok(!ik.titleMatches('Imaginary Traders v. Union of India', DB[3].title), 'shared party alone is not a match');
  assert.ok(!ik.titleMatches('Puttaswamy v. State of Kerala', DB[0].title));

  // Found: link to the judgment, court and date from Indian Kanoon.
  let r = await ik.confirmCase({ name: 'K.S. Puttaswamy v. Union of India', citation: '(2017) 10 SCC 1' }, { fetchImpl });
  assert.strictEqual(r.status, 'verified');
  assert.strictEqual(r.url, 'https://indiankanoon.org/doc/91938676/');
  assert.strictEqual(r.court, 'Supreme Court of India'); assert.strictEqual(r.date, '2017-08-24');
  assert.strictEqual(r.foundCitation, '(2017) 10 SCC 1'); assert.ok(!r.citationDropped);
  assert.strictEqual(calls[0].init.method, 'POST');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Token test-token');

  // Real case, wrong year in the citation: the citation is dropped, not shown.
  r = await ik.confirmCase({ name: 'Minerva Mills Ltd. v. Union of India', citation: '(1985) 3 SCC 625' }, { fetchImpl });
  assert.strictEqual(r.status, 'verified'); assert.ok(r.citationDropped); assert.strictEqual(r.foundCitation, '');

  // Invented case: not found.
  r = await ik.confirmCase({ name: 'Imaginary Traders v. Union of India', citation: '(2031) 9 SCC 9' }, { fetchImpl });
  assert.strictEqual(r.status, 'unverified');

  // API refusal surfaces as an error (the verifier then falls back to the web check).
  await assert.rejects(ik.confirmCase({ name: 'X v. Y' }, { fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => 'Invalid token' }) }), /403/);

  // Which cases are sent to Indian Kanoon.
  assert.ok(ik.looksIndian({ name: 'A v. B', citation: '(2017) 10 SCC 1' }));
  assert.ok(ik.looksIndian({ name: 'Anuradha Bhasin v. Union of India' }));
  assert.ok(ik.looksIndian({ name: 'A v. B' }, 'Supreme Court of India'));
  assert.ok(!ik.looksIndian({ name: 'Donoghue v. Stevenson', citation: '[1932] AC 562' }, 'UK Supreme Court'));
  const st = ik.status();
  assert.ok(st.configured && st.found >= 2 && st.notFound >= 1 && st.errors >= 1 && /403: Invalid token/.test(st.lastError) && /doc keys/.test(st.lastSample), JSON.stringify(st));
  // Safeguard 1: five searches in a row that confirm nothing pause Indian Kanoon.
  assert.ok(ik.active());
  for (let i = 0; i < 5; i++) await ik.confirmCase({ name: `Invented Party ${i} v. Union of India` }, { fetchImpl });
  assert.ok(!ik.active(), 'paused after 5 misses in a row');
  const ps = ik.status();
  assert.ok(ps.paused && ps.missStreak >= 5 && ps.maxPerUpload === 6, JSON.stringify(ps));
  // Safeguard 2 is the cap applied in authorityVerifier.js (MAX_PER_CHECK).
  assert.strictEqual(ik.MAX_PER_CHECK, 6);
  console.log('PASS indian kanoon: title matching, judgment link, wrong citation dropped, invented case refused, routing');
})().catch(e => { console.error('FAIL indian kanoon:', e); process.exit(1); });
