#!/usr/bin/env node
/**
 * How much of today's AI allowance is left, and how many uploads that buys.
 *
 *   node tools/usage-report.js                 today (Pacific), readable
 *   node tools/usage-report.js --json          the same, as JSON
 *   node tools/usage-report.js --day 2026-10-11
 *
 * The usage meter (services/usageMeter.js) already counts every provider
 * attempt into Firestore. What it does not know is the ceiling, so it can say
 * what was spent but not what is left. This adds the ceiling and does the
 * subtraction.
 *
 * The ceilings are ESTIMATES, not read from Google or Groq — neither free tier
 * exposes a "remaining today" call. They come from the errors the providers
 * have actually returned ("limit: 20, model: gemini-2.5-flash") and are
 * overridable, because free tiers change without notice:
 *
 *   GEMINI_RPD     requests per day, per Gemini model     (default 20)
 *   GROQ_RPD       requests per day for gpt-oss-120b      (default 1000)
 *   GEMINI_MODELS  the fallback chain, same variable geminiService.js reads
 *
 * The one hard signal is a 'quota' outcome: a model that has returned a quota
 * error today is out, whatever the count says, and is reported as 0 left.
 *
 * What an upload costs: a NEW proposition spends 1 Gemini request (Full Legal
 * Analysis) plus 2 small Groq requests (validation, forum detection). A
 * proposition already in the analysis cache costs nothing. So "uploads left"
 * is the Gemini requests left across the whole chain — an upper bound, since
 * memorials (3-7 Gemini calls each) and bench reviews draw on the same pool.
 *
 * Reads Firestore with the Admin SDK (FIREBASE_SERVICE_ACCOUNT in .env). Counts
 * a live server has not flushed yet (up to ~15s worth) are not visible here.
 */

require('dotenv').config({ quiet: true });
const admin = require('firebase-admin');
const usageMeter = require('../services/usageMeter');

// Kept identical to the default in services/geminiService.js.
const DEFAULT_GEMINI_MODELS =
  'gemini-2.5-flash,gemini-3.6-flash,gemini-3.8-flash,gemini-3-flash-preview,gemini-3.1-flash-lite,gemini-3.5-flash-lite';

const GEMINI_RPD = Number(process.env.GEMINI_RPD || 20);
const GROQ_RPD = Number(process.env.GROQ_RPD || 1000);
const GEMINI_MODELS = (process.env.GEMINI_MODELS || DEFAULT_GEMINI_MODELS)
  .split(',').map(s => s.trim()).filter(Boolean);

// Requests a new upload spends. Groq is cheap in requests; Gemini is the wall.
const UPLOAD_COST = { gemini: 1, groq: 2 };

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dayIdx = args.indexOf('--day');
const askedDay = dayIdx >= 0 ? args[dayIdx + 1] : undefined;

/* Time until midnight Pacific, when Gemini resets. Found by stepping forward
   rather than doing timezone arithmetic, which DST makes easy to get wrong. */
function untilPacificMidnight(now = new Date()) {
  const today = usageMeter.pacificDay(now);
  let t = Math.floor(now.getTime() / 60e3) * 60e3;
  // Coarse step, then fine, so this is a few hundred iterations at most.
  while (usageMeter.pacificDay(new Date(t + 3600e3)) === today) t += 3600e3;
  while (usageMeter.pacificDay(new Date(t + 60e3)) === today) t += 60e3;
  const ms = t + 60e3 - now.getTime();
  return { ms, resetsAt: new Date(t + 60e3) };
}

function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60e3));
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
}

function build(snap) {
  const perModel = {};
  for (const r of snap.rows) {
    const k = r.provider + '|' + r.model;
    const e = perModel[k] || (perModel[k] = { provider: r.provider, model: r.model, attempts: 0, quotaHit: false });
    // 'skipped' means the pre-flight guard declined before calling Groq: no
    // request was sent, so it is not charged against the day.
    if (r.outcome !== 'skipped') e.attempts += r.calls;
    if (r.outcome === 'quota') e.quotaHit = true;
  }

  const gemini = GEMINI_MODELS.map(model => {
    const e = perModel['gemini|' + model] || { attempts: 0, quotaHit: false };
    const left = e.quotaHit ? 0 : Math.max(0, GEMINI_RPD - e.attempts);
    return { model, used: e.attempts, limit: GEMINI_RPD, left, exhausted: left === 0, quotaHit: e.quotaHit };
  });
  // Models that were called but are not in the configured chain (a stale
  // GEMINI_MODELS, or the live-voice model). Shown, not counted toward uploads.
  const otherGemini = Object.values(perModel)
    .filter(e => e.provider === 'gemini' && !GEMINI_MODELS.includes(e.model))
    .map(e => ({ model: e.model, used: e.attempts, quotaHit: e.quotaHit }));

  const groqRows = Object.values(perModel).filter(e => e.provider === 'groq');
  const groqUsed = groqRows.reduce((n, e) => n + e.attempts, 0);
  const groqQuotaHit = groqRows.some(e => e.quotaHit);
  const groqLeft = groqQuotaHit ? 0 : Math.max(0, GROQ_RPD - groqUsed);

  const geminiLeft = gemini.reduce((n, g) => n + g.left, 0);
  const geminiLimit = GEMINI_RPD * GEMINI_MODELS.length;
  // Groq failing is not fatal to an upload (it falls back to Gemini), so it
  // does not cap the count; Gemini does.
  const uploadsLeft = Math.floor(geminiLeft / UPLOAD_COST.gemini);

  let status = 'ok';
  if (uploadsLeft === 0) status = 'exhausted';
  else if (geminiLeft <= geminiLimit * 0.2) status = 'low';

  return {
    day: snap.day,
    status,
    uploadsLeft,
    gemini: { left: geminiLeft, limit: geminiLimit, perModelLimit: GEMINI_RPD, models: gemini, other: otherGemini },
    groq: { used: groqUsed, limit: GROQ_RPD, left: groqLeft, quotaHit: groqQuotaHit },
    totalCalls: snap.total,
    byRoute: snap.byRoute,
    byOutcome: snap.byOutcome,
    lastFlushError: snap.lastFlushError || null,
  };
}

function bar(left, limit, width = 20) {
  const filled = limit ? Math.round((left / limit) * width) : 0;
  return '[' + '#'.repeat(filled) + '.'.repeat(width - filled) + ']';
}

function print(r, reset) {
  const flag = { ok: 'OK', low: 'LOW', exhausted: 'EXHAUSTED' }[r.status];
  const out = [];
  out.push('');
  out.push(`  MootCoach AI allowance — ${r.day} (Pacific)        status: ${flag}`);
  if (reset) out.push(`  Gemini resets in ${fmtDuration(reset.ms)}  (${reset.resetsAt.toISOString()})`);
  out.push('');
  out.push(`  Uploads left today (new propositions): ~${r.uploadsLeft}`);
  out.push('  Cached propositions cost nothing and are not limited by this.');
  out.push('');
  out.push(`  Gemini  ${bar(r.gemini.left, r.gemini.limit)} ${r.gemini.left}/${r.gemini.limit} requests left`);
  for (const g of r.gemini.models) {
    const note = g.quotaHit ? '  <- quota error today' : '';
    out.push(`    ${g.model.padEnd(26)} ${String(g.used).padStart(3)} used  ${String(g.left).padStart(3)} left${note}`);
  }
  for (const g of r.gemini.other) {
    out.push(`    ${g.model.padEnd(26)} ${String(g.used).padStart(3)} used  (not in fallback chain)`);
  }
  out.push(`  Groq    ${bar(r.groq.left, r.groq.limit)} ${r.groq.left}/${r.groq.limit} requests left` +
    (r.groq.quotaHit ? '  <- quota error today' : ''));
  out.push('');
  const routes = Object.entries(r.byRoute);
  if (routes.length) {
    out.push('  Spent on:');
    for (const [route, n] of routes.slice(0, 8)) out.push(`    ${String(n).padStart(4)}  ${route}`);
    out.push('');
  }
  const outcomes = Object.entries(r.byOutcome).map(([k, n]) => `${k} ${n}`).join(', ');
  if (outcomes) out.push(`  Outcomes: ${outcomes}`);
  out.push(`  Limits are estimates (GEMINI_RPD=${r.gemini.perModelLimit}, GROQ_RPD=${r.groq.limit}); a quota error overrides them.`);
  if (r.lastFlushError) out.push(`  Note: last Firestore write failed: ${r.lastFlushError}`);
  out.push('');
  console.log(out.join('\n'));
}

async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not set (expected in .env). Cannot read usage.');
    process.exitCode = 2;
    return;
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });

  const snap = await usageMeter.snapshot(askedDay);
  const report = build(snap);
  const isToday = !askedDay || askedDay === usageMeter.pacificDay();
  const reset = isToday ? untilPacificMidnight() : null;
  if (reset) report.resetsInMinutes = Math.round(reset.ms / 60e3);

  if (asJson) console.log(JSON.stringify(report, null, 2));
  else print(report, reset);

  // Exit codes a loop or script can act on without parsing text.
  process.exitCode = report.status === 'exhausted' ? 3 : report.status === 'low' ? 1 : 0;
}

if (require.main === module) {
  main().catch(e => {
    console.error('Could not read usage:', e && e.message);
    process.exitCode = 2;
  }).finally(() => {
    // firebase-admin keeps sockets open; do not hang the shell.
    setTimeout(() => process.exit(), 50).unref();
  });
}

module.exports = { build };
