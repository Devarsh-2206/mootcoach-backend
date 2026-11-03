/**
 * services/spend.js: per-feature token totals and the estimate built on them.
 *   node tools/evals/spend.test.js
 * No network: the Firestore document is a stub.
 */
const assert = require('assert');
process.env.SPEND_PRICES = JSON.stringify({ '*': { in: 1, out: 10 }, live: { in: 2, out: 20 } });
process.env.SPEND_INR_PER_USD = '100';
const spend = require('../../services/spend');

(async () => {
  // Path -> feature
  assert.strictEqual(spend.featureForPath('/analyze'), 'upload');
  assert.strictEqual(spend.featureForPath('/extract-issues/x'), 'upload');
  assert.strictEqual(spend.featureForPath('/api/build-memorial'), 'memorial');
  assert.strictEqual(spend.featureForPath('/api/memorial-plan'), 'memorial');
  assert.strictEqual(spend.featureForPath('/api/build-argument'), 'draft');
  assert.strictEqual(spend.useForPath('/api/build-argument'), 'draft');
  assert.strictEqual(spend.featureForPath('/api/analyse-memorial'), 'memorialReview');
  assert.strictEqual(spend.featureForPath('/simulate-bench/oral-review'), 'voice');
  assert.strictEqual(spend.featureForPath('/simulate-bench'), 'bench');
  assert.strictEqual(spend.featureForPath('/api/whatever'), 'other');

  // Thinking tokens count as output.
  assert.deepStrictEqual(spend.tokensOf({ promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 }), { input: 10, output: 8 });
  assert.strictEqual(spend.tokensOf({}), null);

  // A request's calls land on its feature, through async code.
  const res = { statusCode: 200, on(ev, fn) { this.fin = fn; } };
  await new Promise(done => spend.middleware({ path: '/analyze' }, res, async () => {
    await new Promise(r => setTimeout(r, 5));
    spend.recordCall('gemini-x', 'vertex', { usageMetadata: { promptTokenCount: 1e6, candidatesTokenCount: 1e5 } });
    done();
  }));
  res.fin();   // the response finished OK: one upload
  let r = spend.report();
  let up = r.rows.find(x => x.feature === 'upload');
  // $1 in + $1 out = $2 = ₹200
  assert.strictEqual(up.calls, 1); assert.strictEqual(up.uses, 1);
  assert.ok(Math.abs(up.inr - 200) < 1e-6, up.inr);
  assert.ok(Math.abs(up.perUseInr - 200) < 1e-6);
  assert.ok(Math.abs(r.vertexInr - 200) < 1e-6 && r.studioInr === 0);

  // A failed upload is not a use.
  const bad = { statusCode: 500, on(ev, fn) { this.fin = fn; } };
  spend.middleware({ path: '/analyze' }, bad, () => {}); bad.fin();
  assert.strictEqual(spend.report().rows.find(x => x.feature === 'upload').uses, 1);

  // Voice: running totals (never decreasing) are read as the last report...
  let m = spend.liveMeter('live-x', 'vertex');
  m.note({ promptTokenCount: 100, responseTokenCount: 50 });
  m.note({ promptTokenCount: 300, responseTokenCount: 120 });
  m.note({ promptTokenCount: 500, responseTokenCount: 200 });
  m.done();
  let v = spend.report().rows.find(x => x.feature === 'voice');
  assert.strictEqual(v.input, 500); assert.strictEqual(v.output, 200); assert.strictEqual(v.uses, 1);
  // ...and per-turn reports (going up and down) are added up.
  m = spend.liveMeter('live-x', 'studio');
  m.note({ promptTokenCount: 100, responseTokenCount: 80 });
  m.note({ promptTokenCount: 150, responseTokenCount: 20 });
  m.done();
  v = spend.report().rows.find(x => x.feature === 'voice');
  assert.strictEqual(v.input, 750); assert.strictEqual(v.output, 300); assert.strictEqual(v.uses, 2);
  // live prices: 250 in * $2/M + 100 out * $20/M on studio
  assert.ok(Math.abs(v.studioInr - (250 * 2 + 100 * 20) / 1e6 * 100) < 1e-9);

  // Persistence: saved, and reloaded into a fresh process's totals.
  let saved = null;
  const doc = { get: async () => ({ exists: !!saved, data: () => saved }), set: async (d) => { saved = JSON.parse(JSON.stringify(d)); } };
  spend.attach(doc); await new Promise(r => setTimeout(r, 10));
  await spend.flush();
  assert.ok(saved && saved.totals.upload.uses === 1);
  const before = spend.report().totalInr;
  spend._resetForTests();
  spend.attach(doc); await new Promise(r => setTimeout(r, 10));
  assert.ok(Math.abs(spend.report().totalInr - before) < 1e-9);

  await spend.reset();
  assert.strictEqual(spend.report().rows.length, 0);
  assert.strictEqual(saved.totals && Object.keys(saved.totals).length, 0);
  console.log('PASS spend: features, uses, voice readings, persistence, reset');
  process.exit(0);
})().catch(e => { console.error('FAIL spend:', e); process.exit(1); });
