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

  // Same name, citation year far from the judgment's: NOT confirmed here (it may
  // be a different judgment between the same parties); the web check decides.
  r = await ik.confirmCase({ name: 'Minerva Mills Ltd. v. Union of India', citation: '(1985) 3 SCC 625' }, { fetchImpl });
  assert.strictEqual(r.status, 'unverified'); assert.match(r.note, /none from the year cited/);

  // Many judgments, one name: the one from the cited year is chosen.
  const PUCL = [
    { tid: 2009, title: 'People\'S Union For Civil Liberties vs Union Of India on 23 February, 2009', docsource: 'Supreme Court of India', publishdate: '2009-02-23' },
    { tid: 2022, title: 'People\'S Union For Civil Liberties vs Union Of India on 12 October, 2022', docsource: 'Supreme Court of India', publishdate: '2022-10-12' },
  ];
  const pucl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ docs: PUCL }) });
  r = await ik.confirmCase({ name: 'Peoples Union for Civil Liberties v. Union of India', citation: '(2023) 14 SCC 535' }, { fetchImpl: pucl });
  assert.strictEqual(r.status, 'verified'); assert.strictEqual(r.url, 'https://indiankanoon.org/doc/2022/');
  r = await ik.confirmCase({ name: 'Peoples Union for Civil Liberties v. Union of India', citation: '(2015) 5 SCC 1' }, { fetchImpl: pucl });
  assert.strictEqual(r.status, 'unverified', 'no same-name judgment near 2015: not confirmed');
  // No citation: the first judgment with the name is accepted.
  r = await ik.confirmCase({ name: 'Peoples Union for Civil Liberties v. Union of India' }, { fetchImpl: pucl });
  assert.strictEqual(r.status, 'verified');

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
  // Abbreviated parties in Indian Kanoon titles still match.
  assert.ok(ik.titleMatches('Shreya Singhal v. Union of India', 'Shreya Singhal vs U.O.I on 24 March, 2015'));
  assert.ok(!ik.titleMatches('Imaginary Traders v. Union of India', 'Shreya Singhal vs U.O.I on 24 March, 2015'));

  // Realistic Indian Kanoon titles: abbreviations, initials, truncation — and
  // near-misses that must NOT match.
  const PAIRS = [
    ['State of Uttar Pradesh v. Raj Narain', 'State Of U.P. vs Raj Narain & Ors on 24 January, 1975', true],
    ['Additional District Magistrate, Jabalpur v. Shivkant Shukla', 'ADM Jabalpur vs Shivkant Shukla on 28 April, 1976', true],
    ['Commissioner of Income Tax v. Vatika Township', 'CIT vs M/S Vatika Township P.Ltd on 15 September, 2014', true],
    ['PUCL v. Union of India', "People'S Union For Civil Liberties vs Union Of India on 13 September, 2013", true],
    ['Government of NCT of Delhi v. Union of India', 'Govt Of Nct Of Delhi vs Union Of India on 4 July, 2018', true],
    ['Indian Medical Association v. Union of India', 'Indian Medical Assn. vs U.O.I on 7 May, 2024', true],
    ['State of Tamil Nadu v. K. Balu', 'State Of T.N. & Anr vs K. Balu & Anr on 15 December, 2016', true],
    ['Kesavananda Bharati v. State of Kerala', 'Kesavananda Bharati Sripadagalvaru ... vs State Of Kerala And Anr on 24 April, 1973', true],
    ['K.S. Puttaswamy v. Union of India', 'Justice K.S.Puttaswamy(Retd) vs Union Of India on 26 September, 2018', true],
    ['Modern Dental College and Research Centre v. State of Madhya Pradesh', 'Modern Dental College & Research Cen vs State Of Madhya Pradesh & Ors on 2 May, 2016', true],
    ['A.P. Shah v. Union of India', 'State Of Andhra Pradesh vs Shah on 1 May, 2000', false],
    ['State of Uttar Pradesh v. Raj Narain', 'State Of M.P. vs Raj Narain on 1 May, 1980', false],
    ['CIT v. Vatika Township', 'Central Bureau Of Investigation vs Vatika Township on 1 Jan, 2014', false],
  ];
  for (const [n, t, want] of PAIRS) assert.strictEqual(ik.titleMatches(n, t), want, `${n} <> ${t}`);
  assert.strictEqual(ik.buildQuery('CIT v. Vatika Township', '(2015) 1 SCC 1'), 'title: vatika township doctypes: supremecourt');
  assert.strictEqual(ik.buildQuery('ADM Jabalpur v. Shivkant Shukla', '(1976) 2 SCC 521'), 'title: shivkant shukla doctypes: supremecourt');

  // Searches aim at titles and the Supreme Court, by the most distinctive party.
  assert.strictEqual(ik.buildQuery('Shreya Singhal v. Union of India', '(2015) 5 SCC 1'), 'title: shreya singhal doctypes: supremecourt');
  assert.strictEqual(ik.buildQuery('K.S. Puttaswamy v. Union of India', '(2017) 10 SCC 1'), 'title: puttaswamy doctypes: supremecourt');
  assert.strictEqual(ik.buildQuery('State of Punjab v. Gurmit Singh', 'AIR 1996 SC 1393'), 'title: gurmit singh doctypes: supremecourt');
  assert.strictEqual(ik.buildQuery('Romesh Thappar v. State of Madras', ''), 'title: romesh thappar');
  process.env.INDIANKANOON_QUERY = 'plain';
  assert.strictEqual(ik.buildQuery('Shreya Singhal v. Union of India', '(2015) 5 SCC 1'), 'Shreya Singhal v. Union of India');
  delete process.env.INDIANKANOON_QUERY;

  console.log('PASS indian kanoon: title matching, judgment link, same-name judgments by year, invented case refused, routing');
})().catch(e => { console.error('FAIL indian kanoon:', e); process.exit(1); });
