// Offline test of the assistant's tool loop (model and data stubbed).
// node tools/evals/assistant.test.js
const assert = require('assert');
const path = require('path');
const svc = p => path.join(__dirname, '../../services', p);
require.cache[require.resolve(svc('authorityVerifier.js'))] = { exports: { verifyAuthorities: async list => list.map(a => ({ name: a.name, status: /Bhasin/.test(a.name) ? 'verified' : 'unverified', citation: a.citation, foundCitation: a.citation, sources: /Bhasin/.test(a.name) ? [{ title: 'indiankanoon.org' }] : [], note: '' })) } };
const { runAssistant, TOOLS } = require(svc('assistant.js'));
(async () => {
  // a scripted model: first asks for two tools, then answers using what came back
  const seen = [];
  const step = async contents => {
    const last = contents[contents.length - 1];
    if (last.parts[0].text) return { content: { role: 'model', parts: [{ functionCall: { name: 'verify_authorities' } }] }, calls: [
      { name: 'verify_authorities', args: { authorities: [{ name: 'Anuradha Bhasin v. Union of India', citation: '(2020) 3 SCC 637' }, { name: 'Made Up v. Nobody' }] } },
      { name: 'read_moot', args: { section: 'issues' } }, { name: 'no_such_tool', args: {} }], text: '' };
    seen.push(last.parts.map(p => p.functionResponse));
    return { content: { role: 'model', parts: [{ text: 'done' }] }, calls: [], text: 'Bhasin is verified; Made Up v. Nobody could not be found.' };
  };
  const r = await runAssistant({ question: 'Which of my cases are safe?', ctx: { uid: 'u1' }, step });
  assert.equal(r.answer, 'Bhasin is verified; Made Up v. Nobody could not be found.');
  assert.deepEqual(r.toolsUsed.map(t => [t.name, t.ok]), [['verify_authorities', true], ['read_moot', false], ['no_such_tool', false]]);
  const resp = seen[0];
  assert.equal(resp[0].response.result.results[0].status, 'verified');
  assert.equal(resp[0].response.result.results[1].status, 'unverified');
  assert.ok(/No moot is open/.test(resp[1].response.result.error), 'read_moot without an open moot explains itself');
  assert.ok(/Unknown tool/.test(resp[2].response.result.error));
  // a model that never stops calling tools is cut off
  const loop = async () => ({ content: { role: 'model', parts: [] }, calls: [{ name: 'list_moots', args: {} }], text: '' });
  const r2 = await runAssistant({ question: 'x', ctx: {}, step: loop });
  assert.ok(/more steps/.test(r2.answer)); assert.equal(r2.toolsUsed.length, 5);
  assert.ok(TOOLS.every(t => t.name && t.description && t.parameters && typeof t.run === 'function'));
  console.log('ALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
