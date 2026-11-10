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

  // Account deletion: the pilot place is freed and the record removed.
  {
    const p = require(R + '/services/pilot');
    const pl = p.createPilot(p.memoryStore(), { config: p.readConfig({ PILOT_MODE: 'on', PILOT_CAP: '2' }) });
    const u = { uid: 'del1', email: 'del1@nalsar.ac.in', emailVerified: true, name: 'D' };
    await pl.join(u); assert.ok((await pl.claimPlace(u)).ok);
    assert.strictEqual((await pl.overview()).counts.active, 1);
    await pl.forget('del1');
    const o = await pl.overview();
    assert.strictEqual(o.counts.active, 0, 'place freed');
    assert.ok(!o.members.some(m => m.uid === 'del1'), 'record removed');
    assert.match(server, /app\.post\("\/api\/account\/delete", signedIn,/);
    assert.match(server, /confirm !== 'DELETE'/);
  }
  // Usage statistics are admins only; links only http(s).
  assert.match(server, /app\.get\("\/api\/usage", signedIn, logLimiter, pilotAdminOnly,/);
  assert.match(fs.readFileSync(R + '/frontend/js/components/ui.js', 'utf8'), /export function safeUrl/);

  console.log('PASS security: daily caps (burst-proof), Indian Kanoon ceiling, voice size limit, pilot fails closed, dev switch ignored on Render, account deletion frees the place, admin-only usage');
})().catch(e => { console.error(e); process.exit(1); });
