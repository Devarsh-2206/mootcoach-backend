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
console.log('PASS memorial audit: contents lines not read as headings, introducing words not read as party names');
