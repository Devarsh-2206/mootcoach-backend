// The memorial as a Word file (services/memorialDocx.js): it opens as a valid
// .docx, carries real footnotes, numbers the preliminary pages in Roman and
// the arguments from 1, keeps hostile text as text, and survives junk input.
const assert = require('assert');
const { buildMemorialDocx } = require('../../services/memorialDocx');

(async () => {
  const { unzipSync, strFromU8 } = require('fflate');   // installed with docx
  const m = {
    coverPage: { court: 'BEFORE THE SUPREME COURT', memorialFor: 'MEMORIAL FOR RESPONDENT', petitioner: 'A & Co.', respondent: 'B' },
    statementOfIssues: ['ISSUE I: WHETHER X'],
    argumentsAdvanced: [{ heading: 'I. WHETHER X <w:p> & "y"', subArguments: [{ heading: 'A. ONE', paragraphs: [
      { number: 1, text: 'The **bold** and *italic* point.\u0001', footnotes: [{ citation: 'Maneka Gandhi v. Union of India, (1978) 1 SCC 248.' }] },
      { number: 2, text: 'Second.', footnotes: [{ citation: 'Ibid.' }, { citation: '¶2, Moot Proposition.' }] }] }] }],
    prayer: { declarations: ['x'], signature: 'All of which is respectfully submitted, COUNSELS for RESPONDENTS' },
  };
  const buf = await buildMemorialDocx(m, { colour: '#C00000', ink: '#000000' });
  assert.ok(Buffer.isBuffer(buf) && buf.slice(0, 2).toString() === 'PK', 'a .docx (zip) file');
  {
    const zip = unzipSync(new Uint8Array(buf));
    const doc = strFromU8(zip['word/document.xml']);
    const notes = strFromU8(zip['word/footnotes.xml']);
    assert.strictEqual((doc.match(/<w:footnoteReference /g) || []).length, 3, 'three footnote references');
    assert.ok(notes.includes('Maneka Gandhi v. Union of India'), 'footnote text in footnotes.xml');
    assert.ok(/w:fmt="upperRoman"/.test(doc) && /w:fmt="decimal"/.test(doc), 'Roman then Arabic page numbers');
    assert.ok(doc.includes('&lt;w:p&gt;') && !doc.includes('\u0001'), 'markup kept as text, control characters dropped');
    assert.ok(!doc.includes('**') && !/\*italic\*/.test(doc), 'bold and italic as formatting, not asterisks');
    assert.strictEqual((doc.match(/COUNSELS/gi) || []).length, 1, 'counsel line once');
    assert.ok(/C00000/.test(doc), 'cover colour');
  }
  // Junk in, a file (or a clear error) out — never a crash.
  await buildMemorialDocx({ argumentsAdvanced: 'oops', prayer: 5, statementOfFacts: { a: 1 }, coverPage: null, listOfAbbreviations: [null, 1, { short: { x: 1 } }] });
  await assert.rejects(() => buildMemorialDocx(null), /No memorial/);
  console.log('PASS memorial docx: valid file, real footnotes, Roman then Arabic pages, text escaped, junk input survived');
})().catch(e => { console.error('FAIL memorial docx:', e.message); process.exit(1); });
