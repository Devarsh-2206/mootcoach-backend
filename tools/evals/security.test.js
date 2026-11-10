// Security guards that must never quietly regress (security review, 10 Nov 2026).
const assert = require('assert');
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..');

(async () => {
  // 1. Per-user daily cap: counted before the work, so a burst cannot overshoot.
  const { createDailyCap } = require(R + '/services/dailyCap');
  const cap = createDailyCap(10);
  const burst = await Promise.all(Array.from({ length: 50 }, () => Promise.resolve().then(() => cap.take('u1'))));
  assert.strictEqual(burst.filter(Boolean).length, 10, 'a burst of 50 gets exactly 10');
  assert.strictEqual(cap.take('u2'), true, 'another user has their own allowance');
  cap.refund('u1'); assert.strictEqual(cap.take('u1'), true);

  // 1b. Indian Kanoon whole-site daily ceiling, counted before sending.
  process.env.INDIANKANOON_API_TOKEN = 't'; process.env.INDIANKANOON_DAILY_MAX = '3';
  delete require.cache[require.resolve(R + '/services/indianKanoon')];
  const ik = require(R + '/services/indianKanoon');
  let sent = 0;
  const f = async () => { sent++; return { ok: true, text: async () => JSON.stringify({ docs: [] }) }; };
  await Promise.allSettled(Array.from({ length: 8 }, () => ik.search('x', { fetchImpl: f })));
  assert.strictEqual(sent, 3, 'never more than the daily maximum, even in parallel');
  assert.strictEqual(ik.active(), false);

  // 1c. The case-check route carries the allowance.
  const server = fs.readFileSync(R + '/server.js', 'utf8');
  assert.match(server, /app\.post\("\/api\/confirm-cases", signedIn, requirePilot, aiLimiter, caseCheckAllowance,/);

  // 3. Voice messages are size-limited.
  assert.match(server, /maxPayload:\s*2 \* 1024 \* 1024/);

  // 4. Pilot mode fails closed on Render.
  const { readConfig } = require(R + '/services/pilot');
  assert.strictEqual(readConfig({ RENDER: 'true' }).mode, 'on');
  assert.strictEqual(readConfig({ RENDER: 'true', PILOT_MODE: 'of' }).mode, 'on');
  assert.strictEqual(readConfig({ RENDER: 'true', PILOT_MODE: 'off' }).mode, 'off');
  assert.strictEqual(readConfig({ RENDER: 'true', PILOT_MODE: 'closed' }).mode, 'closed');

  // 5. The development switch is ignored on Render.
  assert.match(server, /ALLOW_UNAUTHENTICATED === '1' && !ON_RENDER/);

  // Certificate checks only off on purpose.
  assert.ok(!/NODE_ENV !== "production"\)\s*\{\s*process\.env\.NODE_TLS_REJECT_UNAUTHORIZED/.test(server));

  console.log('PASS security: daily caps (burst-proof), Indian Kanoon ceiling, voice size limit, pilot fails closed, dev switch ignored on Render');
})().catch(e => { console.error(e); process.exit(1); });
