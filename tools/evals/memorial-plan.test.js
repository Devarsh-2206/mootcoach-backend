// Offline test: plan-then-draft (model stubbed). node tools/evals/memorial-plan.test.js
const assert = require('assert');
const path = require('path');
const svc = p => path.join(__dirname, '../../services', p);
const calls = [];
require.cache[require.resolve(svc('geminiService.js'))] = { exports: { getChatCompletion: async ({ requestLabel, messages }) => {
  calls.push({ label: requestLabel, user: messages[1].content });
  if (/Pass A/.test(requestLabel)) return { text: JSON.stringify({ coverPage: { court: 'X' }, statementOfIssues: ['ISSUE I: OLD'], summaryOfArguments: [{ issue: 'OLD', summary: 's1' }],
    argumentPlan: [{ numeral: 'I', heading: 'OLD HEADING', roadmap: 'r', subGrounds: [{ label: 'A', heading: 'G1', thrust: 't' }] }, { numeral: 'II', heading: 'SECOND', subGrounds: [] }], prayer: {} }) };
  return { text: JSON.stringify({ heading: 'H', subArguments: [{ heading: 'S', paragraphs: ['p1 [1]'] }], footnotes: [], authorities: {} }) };
} } };
const { buildMemorial, planMemorial, sanitizeSkeleton } = require(svc('memorialBuilder.js'));
(async () => {
  const base = { stance: 'Petitioner', propositionContext: 'Facts of the case are long enough here.', authorities: [] };
  const plan = await planMemorial({ ...base, maxIssues: 4 });
  assert.equal(calls.length, 1); assert.equal(plan.argumentPlan.length, 2);
  // the advocate edits: renames issue I, drops issue II, adds a sub-ground, and tries to smuggle a key
  plan.argumentPlan[0].heading = 'NEW HEADING'; plan.argumentPlan[0].subGrounds.push({ heading: 'G2', thrust: 'mine' });
  plan.argumentPlan.splice(1, 1); plan.evil = 'x'.repeat(10);
  calls.length = 0;
  const { memorial, stats } = await buildMemorial({ ...base, approvedSkeleton: plan, maxIssues: 4 });
  assert.ok(!calls.some(c => /Pass A/.test(c.label)), 'no structure pass when a plan is approved');
  assert.equal(stats.issues, 1); assert.equal(stats.fromApprovedPlan, true);
  assert.deepEqual(memorial.statementOfIssues, ['ISSUE I: NEW HEADING']);
  assert.ok(calls[0].user.includes('NEW HEADING') && calls[0].user.includes('G2'), 'drafting follows the edited plan');
  assert.equal(memorial.coverPage.court, 'X');
  const s = sanitizeSkeleton({ argumentPlan: Array(9).fill({ heading: 'h'.repeat(5000), subGrounds: Array(20).fill({ heading: 'g' }) }) });
  assert.equal(s.argumentPlan.length, 5); assert.equal(s.argumentPlan[0].heading.length, 600); assert.equal(s.argumentPlan[0].subGrounds.length, 6);
  assert.equal(sanitizeSkeleton(null).argumentPlan.length, 0);
  console.log('ALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
