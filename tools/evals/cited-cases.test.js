// services/citedCases.js: cases cited inside the analysis text are found,
// confirmed ones kept (citations corrected), unconfirmed ones taken out.
const assert = require('assert');
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'x';
const c = require('../../services/citedCases');

(async () => {
  // Finding: sentence openers, initials, abbreviations, sentence ends, Supp citations.
  const t = 'In Ram Jawaya Kapur v. State of Punjab, AIR 1955 SC 549, it was settled. See K.S. Puttaswamy v. Union of India, (2017) 10 SCC 1; and State of U.P. v. Raj Narain, (1975) 4 SCC 428. '
    + 'Under S.P. Gupta v. Union of India, 1981 Supp SCC 87, and Arnesh Kumar v. State of Bihar. Next, Tata Steel v. ABC Pvt. Ltd. was cited.';
  const names = c.findCited(t).map(x => x.name);
  assert.deepStrictEqual(names, ['Ram Jawaya Kapur v. State of Punjab', 'K.S. Puttaswamy v. Union of India', 'State of U.P. v. Raj Narain',
    'S.P. Gupta v. Union of India', 'Arnesh Kumar v. State of Bihar', 'Tata Steel v. ABC Pvt. Ltd.']);
  assert.strictEqual(c.findCited(t)[3].citation, '1981 Supp SCC 87');

  // Cleaning: in brackets → dropped with brackets; inline → marked; corrected citation swapped.
  const s = 'Compensation follows (D.K. Basu v. State of West Bengal, (1999) 1 SCC 416) and (Fake v. Nobody, (2019) 4 SCC 912). Also Invented Ltd. v. State, (2020) 1 SCC 1, settled it.';
  const r = c.cleanText(s, f => /Basu/.test(f.name) ? { keep: true, citation: '(1997) 1 SCC 416' } : { keep: false });
  assert.strictEqual(r.text, 'Compensation follows (D.K. Basu v. State of West Bengal, (1997) 1 SCC 416). Also ' + c.REMOVED + ', settled it.');
  assert.strictEqual(r.removed, 2); assert.strictEqual(r.corrected, 1);

  // Whole check: known (already confirmed) cases are not re-checked; cap respected; additional issues and defects covered.
  let asked = [];
  const verify = async (items) => { asked = items.map(i => i.name); return items.map(i => ({ status: /Basu/.test(i.name) ? 'corrected' : 'unverified', foundCitation: '(1997) 1 SCC 416', sources: [] })); };
  const texts = {
    petitionerArguments: ['Per Real Case v. State, (2017) 10 SCC 1, and D.K. Basu v. State of West Bengal, (1999) 1 SCC 416.'],
    respondentArguments: ['Mootness under Fake Mootness v. Nobody, (2002) 7 SCC 368.'],
    additionalIssues: [{ issue: 'x', legalBasis: 'Doctrine in Fake Mootness v. Nobody, (2002) 7 SCC 368.', whyItEarnsMarks: 'w' }],
    argumentDefects: { petitioner: [{ explanation: 'Misreads Other Fake v. State, (2010) 1 SCC 1.' }], respondent: [] },
    benchQuestions: [], benchVulnerabilities: [],
  };
  const out = await c.checkCitedCases(texts, { confirmed: [{ caseName: 'Real Case v. State', citation: '(2017) 10 SCC 1' }], verify });
  assert.ok(!asked.some(n => /Real Case/.test(n)), 'a confirmed case is not checked again');
  assert.strictEqual(asked.length, 3);
  assert.ok(/Real Case v\. State, \(2017\) 10 SCC 1/.test(out.texts.petitionerArguments[0]));
  assert.ok(/\(1997\) 1 SCC 416/.test(out.texts.petitionerArguments[0]));
  assert.ok(!/Fake Mootness/.test(out.texts.respondentArguments[0]) && !/Fake Mootness/.test(out.texts.additionalIssues[0].legalBasis));
  assert.ok(!/Other Fake/.test(out.texts.argumentDefects.petitioner[0].explanation));
  assert.strictEqual(out.citedCheck.checked, 3); assert.strictEqual(out.citedCheck.kept, 1);
  assert.strictEqual(texts.respondentArguments[0].includes('Fake Mootness'), true, 'input is not mutated');

  console.log('PASS cited cases: found in text, confirmed kept and corrected, unconfirmed taken out, no re-checks');
})().catch(e => { console.error(e); process.exit(1); });
