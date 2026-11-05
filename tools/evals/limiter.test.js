// services/limiter.js: only N jobs at once, the rest wait in order; a full queue says "busy".
const assert = require('assert');
const { limiter } = require('../../services/limiter');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const L = limiter(2, { maxQueue: 3 });
  let running = 0, peak = 0; const order = [];
  const job = (i) => L.run(async () => { running++; peak = Math.max(peak, running); await wait(20); order.push(i); running--; return i; });
  const out = await Promise.all([1, 2, 3, 4, 5].map(job));
  assert.deepStrictEqual(out, [1, 2, 3, 4, 5]);
  assert.strictEqual(peak, 2, 'never more than 2 at once');
  assert.deepStrictEqual(order.slice(2), [3, 4, 5], 'waiting jobs run in arrival order');
  assert.strictEqual(L.status().active, 0); assert.strictEqual(L.status().waiting, 0);

  // A failing job still frees its slot.
  await assert.rejects(L.run(async () => { throw new Error('x'); }));
  assert.strictEqual(L.status().active, 0);

  // Queue full: 2 running + 3 waiting, the 6th is refused as busy.
  const B = limiter(2, { maxQueue: 3 });
  const held = [1, 2, 3, 4, 5].map(() => B.run(() => wait(30)));
  await assert.rejects(B.run(() => 1), e => e.busy === true);
  await Promise.all(held);

  // Middleware: slot freed on finish; 503 when busy.
  const { EventEmitter } = require('events');
  const M = limiter(1, { maxQueue: 0 });
  const mw = M.middleware('busy now');
  const res1 = new EventEmitter(); let nexted = false;
  mw({}, res1, () => { nexted = true; }); await wait(5);
  assert.ok(nexted);
  const res2 = Object.assign(new EventEmitter(), { status(c) { this.code = c; return this; }, json(b) { this.body = b; } });
  mw({}, res2, () => assert.fail('should not run')); await wait(5);
  assert.strictEqual(res2.code, 503); assert.strictEqual(res2.body.code, 'busy');
  res1.emit('finish'); res1.emit('close');   // freed once, not twice
  assert.strictEqual(M.status().active, 0);
  console.log('limiter: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
