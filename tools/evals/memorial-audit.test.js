// Memorial Review's measured checks on a memorial laid out as MootCoach exports
// it: a Table of Contents listing every heading with its page, then the real
// sections. The contents lines once matched as the headings themselves, so the
// Index read as empty and every cited case was reported "missing from the Index".
const assert = require('assert');
const { auditMemorial } = require('../../services/memorialAudit');

const text = [
  'MEMORIAL FOR CLAIMANT',
  'TABLE OF CONTENTS',
  'LIST OF ABBREVIATIONS II',
  'INDEX OF AUTHORITIES ........ III',
  'STATEMENT OF JURISDICTION IV',
  'STATEMENT OF FACTS V',
  'ISSUES RAISED VI',
  'SUMMARY OF ARGUMENTS VII',
  'ARGUMENTS ADVANCED 1',
  'PRAYER 5',
  'LIST OF ABBREVIATIONS',
  'ICA Indian Contract Act, 1872',
  'INDEX OF AUTHORITIES',
  'Cases',
  '1. Ravindra Kumar Verma v. BPTP Ltd., 2014 SCC OnLine Del 6602 1',
  '2. Swiss Timing Ltd. v. Commonwealth Games 2010 Organising Committee, (2014) 6 SCC 677 2',
  'STATEMENT OF JURISDICTION',
  'The Claimant invokes the jurisdiction of this Tribunal.',
  'STATEMENT OF FACTS',
  'The Respondent deducted Rs 35.1 crore.',
  'ISSUES RAISED',
  'I. Whether the Tribunal has jurisdiction.',
  'SUMMARY OF ARGUMENTS',
  'The negotiation step was futile.',
  'ARGUMENTS ADVANCED',
  '1. In Ravindra Kumar Verma v. BPTP Ltd., the Delhi High Court held the step directory.',
  '2. See also Swiss Timing Ltd. v. Commonwealth Games 2010 Organising Committee, (2014) 6 SCC 677.',
  '3. The Tribunal therefore has jurisdiction.',
  'PRAYER',
  'The Claimant prays that the objection be dismissed.',
].join('\n');

const a = auditMemorial(text);
assert.strictEqual(a.metrics.indexCases, 2, 'the real Index is read, not the contents line');
assert.strictEqual(a.metrics.authoritiesNotIndexed, 0, '"In X v. Y" and "See also X v. Y" match the Index entries');
assert.strictEqual(a.metrics.numberedParagraphs, 3, 'numbering starts at the real Arguments Advanced');
assert.strictEqual(a.metrics.numbering.continuous, true);
assert.ok(!a.findings.some(f => /missing from the Index/i.test(f.finding)), 'no false "missing from the Index"');

// A PDF whose shaded heading boxes come out AFTER their page's text (as a
// real NUALS memorial did): Index entries before the "INDEX OF AUTHORITIES"
// heading, a Facts sub-heading "Issues Raised by the ...", a numbered Prayer,
// and a party name split over two lines in the body.
const boxed = [
  'MEMORIAL FOR RESPONDENT',
  'INDEX OF AUTHORITIES.............................4',
  'STATEMENT OF FACTS ..............................8',
  'Cases',
  'Mancheri Puthusseri Ahmed v. Kuthiravattam Estate Receiver (1996) 6 SCC 185........16',
  'Union of India v. Azadi Bachao Andolan, (2004) 10 SCC 1 (India).........13',
  'INDEX OF AUTHORITIES',
  'With regard to circumstances, the Petitioners approached this Court.',
  'STATEMENT OF JURISDICTION',
  'Olympus executed a Share Purchase Agreement.',
  'Issues Raised by the Income Tax Department',
  'A show cause notice was issued.',
  'STATEMENT OF FACTS',
  '1. Whether the Authority has jurisdiction?',
  'ISSUES RAISED',
  'The Revenue may tax the transfer.',
  'SUMMARY OF ARGUMENTS',
  '1. The SPVs lack substance, as Union of India v. Azadi Bachao Andolan shows.',
  '2. As held in C.I.T. v. Shakuntala and Mancheri',
  'Puthusseri Ahmed v. Kuthiravattam Estate Receiver, a fiction is not extended.',
  '3. The levy is valid.',
  'ARGUMENTS ADVANCED',
  'In light of the above submissions, the Respondents humbly pray the Hon\'ble Court to declare:',
  '1. That the levy is valid.',
  '2. That the veil may be lifted.',
  'AND/OR Pass any other order this Hon\'ble Court may deem fit.',
  'PRAYER',
].join('\n');
const b = auditMemorial(boxed);
assert.strictEqual(b.metrics.indexCases, 2, 'Index read from the front matter, not from below a late heading');
assert.strictEqual(b.metrics.authoritiesNotIndexed, 0, 'a name split over two lines still matches the Index');
assert.ok(!b.findings.some(f => /out of the conventional order/i.test(f.finding)), 'a Facts sub-heading is not the Issues heading');
assert.ok(!b.findings.some(f => /restarts/i.test(f.finding)), 'the Prayer\'s numbered list is not a numbering restart');
assert.ok(!b.findings.some(f => /residuary/i.test(f.finding)), 'the residuary clause before a late Prayer heading is found');
console.log('PASS memorial audit: contents lines not read as headings, introducing words not read as party names, late heading boxes');
