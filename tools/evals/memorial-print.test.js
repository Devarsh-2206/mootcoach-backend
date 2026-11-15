// The memorial export (frontend/js/components/memorialPrint.js). Three faults
// found by laying out a full memorial:
//  - an issue heading without its numeral printed as "WHETHER ..." with no
//    "I." in the body or the contents (the plan editor saves them apart);
//  - the Prayer printed the counsel line twice;
//  - the Index of Authorities matched "Union of India v. X" by "Union of
//    India", so it was credited with every page citing any case against it.
// The module is a browser ES module; it is loaded here from its source.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/js/components/memorialPrint.js'), 'utf8')
    .replace(/^function lookupKey/m, 'export function lookupKey');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const { labelArguments, splitSignature, lookupKey, buildMemorialDocument } = mod;

  // Numerals and letters put back only where missing.
  const out = labelArguments([
    { numeral: 'I', heading: 'WHETHER THE PETITION IS MAINTAINABLE', subArguments: [{ heading: 'THE LIMB' }, { heading: 'B. ALREADY' }, { heading: '(c) already' }, { heading: 'B.THE LIMB' }] },
    { numeral: 'Issue II', heading: 'IS THE ORDER VALID?' },
    { numeral: 'III', heading: 'III. ALREADY NUMBERED' },
    { numeral: '', heading: 'ISSUE IV: ALREADY' },
    { heading: 'VIOLATION OF ARTICLE 14' },
  ]);
  assert.deepStrictEqual(out.map(a => a.heading), [
    'I. WHETHER THE PETITION IS MAINTAINABLE', 'II. IS THE ORDER VALID?', 'III. ALREADY NUMBERED',
    'ISSUE IV: ALREADY', 'V. VIOLATION OF ARTICLE 14']);
  assert.deepStrictEqual(out[0].subArguments.map(s => s.heading), ['A. THE LIMB', 'B. ALREADY', '(c) already', 'B.THE LIMB']);
  assert.deepStrictEqual(labelArguments(null), []);

  // Signature split, counsel once.
  assert.deepStrictEqual(splitSignature('All of which is respectfully submitted, COUNSELS for PETITIONERS'),
    { lead: 'All of which is respectfully submitted', counsel: 'COUNSELS for PETITIONERS' });
  assert.deepStrictEqual(splitSignature('All of which is respectfully submitted.'), { lead: 'All of which is respectfully submitted.', counsel: '' });
  const html = buildMemorialDocument({
    coverPage: { court: 'BEFORE THE SUPREME COURT', memorialFor: 'MEMORIAL FOR PETITIONER' },
    argumentsAdvanced: [{ numeral: 'I', heading: 'WHETHER X', subArguments: [{ heading: 'ONE', paragraphs: [{ number: 1, text: 'x' }] }] }],
    prayer: { declarations: ['x'], signature: 'All of which is respectfully submitted, COUNSELS for PETITIONERS' },
  }, {});
  assert.strictEqual((html.match(/counsel/gi) || []).length, 1, 'counsel line printed once');
  assert.ok(html.includes('I. WHETHER X') && html.includes('A. ONE'), 'labels in body and contents');

  // Index keys: never a government party shared by many cases.
  const k = n => lookupKey({ name: n });
  assert.strictEqual(k('Maneka Gandhi v. Union of India'), 'maneka gandhi');
  assert.strictEqual(k('Union of India v. Association for Democratic Reforms'), 'association for democratic reforms');
  assert.strictEqual(k('State of Punjab v. Davinder Pal Singh Bhullar'), 'davinder pal singh bhullar');
  assert.strictEqual(k('Union of India v. Rajesh Kumar & Ors.'), 'rajesh kumar');
  assert.strictEqual(k('State (NCT of Delhi) v. Navjot Sandhu'), 'navjot sandhu');
  assert.strictEqual(k('Statesman Ltd. v. X'), 'statesman ltd.');
  assert.strictEqual(k('State of Punjab v. Union of India'), 'state of punjab v. union of india');
  assert.strictEqual(k('Information Technology Act, 2000'), 'information technology act');

  // Footnote numbers come from the assembled memorial, not the drafter.
  const { resolveFootnotes } = mod;
  const notes = ['Ravindra Kumar Verma v. BPTP Ltd., (2014) 145 DRJ 337.', '', 'Ravindra Kumar Verma v. BPTP Ltd., (2014) 145 DRJ 337, ¶ 11.',
    '*Maneka Gandhi v. Union of India*, (1978) 1 SCC 248.', 'Ibid.', 'Ravindra Kumar Verma, supra, ¶ 14.', 'Supra, Maneka Gandhi, ¶ 7.',
    'Supra Note 6.', 'Maneka Gandhi, supra; Ravindra Kumar Verma, supra.', 'Navtej Johar, supra.',
    'Union of India v. State of Maharashtra, (1990) 4 SCC 1.', 'Union of India v. State of Maharashtra, (2005) 2 SCC 9.'];
  const got = resolveFootnotes([{ subArguments: [{ paragraphs: notes.map(c => ({ text: 't', footnotes: [{ citation: c }] })) }] }])[0]
    .subArguments[0].paragraphs.flatMap(p => p.footnotes.map(f => f.citation));
  assert.deepStrictEqual(got, [
    'Ravindra Kumar Verma v. BPTP Ltd., (2014) 145 DRJ 337.',   // 1 (the empty note is dropped)
    'Ibid., ¶ 11.',                                              // 2
    '*Maneka Gandhi v. Union of India*, (1978) 1 SCC 248.',     // 3
    'Ibid.',                                                     // 4
    'Ravindra Kumar Verma, Supra Note 1, ¶ 14.',                 // 5
    'Maneka Gandhi, Supra Note 3, ¶ 7.',                         // 6
    'Supra Note 6.',                                             // 7: an old bare number, left alone
    'Maneka Gandhi, Supra Note 3; Ravindra Kumar Verma, Supra Note 1.',
    'Navtej Johar, supra.',                                      // never cited: left as written
    'Union of India v. State of Maharashtra, (1990) 4 SCC 1.',
    'Union of India v. State of Maharashtra, (2005) 2 SCC 9.',   // another year, another case
  ]);

  console.log('PASS memorial print: issue numerals and sub-ground letters, counsel line once, Index keys not shared by government parties, footnote back-references numbered');
})().catch(e => { console.error('FAIL memorial print:', e.message); process.exit(1); });
