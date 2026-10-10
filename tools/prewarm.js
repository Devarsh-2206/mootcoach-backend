#!/usr/bin/env node
/**
 * Analyse propositions ahead of a session, so the session cannot fail on them.
 *
 *   node tools/prewarm.js ./propositions/*.pdf
 *   node tools/prewarm.js --check ./propositions/*.pdf    say what is ready, change nothing
 *
 * Why this exists
 * ---------------
 * The first upload of a document is the expensive one: it spends a Gemini
 * request from a daily allowance of roughly 20-50 per model, takes a minute
 * or two, and is the single thing most likely to fail in front of somebody
 * trying MootCoach for the first time.
 *
 * Every upload after that is a cache hit: no provider call, about a second.
 *
 * So if you know which propositions a session will use, run them through the
 * night before. Everyone who uploads one gets an instant, complete analysis,
 * and no quota is touched while people are watching. The demo cannot hit a
 * wall it has already walked past.
 *
 * It uses the running server rather than reaching into the pipeline, so what
 * gets cached is exactly what a real upload produces.
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const BASE = process.env.PREWARM_BASE_URL || 'http://localhost:3000';
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const files = args.filter(a => !a.startsWith('--'));

if (!files.length) {
  console.error('\n  usage: node tools/prewarm.js [--check] <file.pdf> [more.pdf ...]\n');
  process.exitCode = 1;
}

async function send(file, qs) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'application/pdf' }), path.basename(file));
  const t = Date.now();
  const res = await fetch(BASE + '/analyze' + (qs || ''), { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, ms: Date.now() - t };
}

(async () => {
  try {
    const h = await fetch(BASE + '/health');
    if (!h.ok) throw new Error('status ' + h.status);
  } catch (e) {
    console.error('\n  No server at ' + BASE + ' (' + (e && e.message) + ').' +
      '\n  Start it, or set PREWARM_BASE_URL to the deployed address.\n');
    process.exitCode = 1;
  }

  console.log('\n  ' + files.length + ' proposition(s) against ' + BASE + '\n');
  let ready = 0, warmed = 0, reduced = 0, failed = 0;

  for (const f of files) {
    const name = path.basename(f);
    if (!fs.existsSync(f)) { console.log('  ' + name.padEnd(42) + 'not found'); failed++; continue; }

    // Asks only whether it is ready. A plain upload would ANALYSE a document
    // that is not cached yet, which would make checking the expensive thing.
    const state = await send(f, '?probe=1');

    if (state.status === 200 && state.body.cached) {
      console.log('  ' + name.padEnd(42) + 'ready (cached)');
      ready++;
      continue;
    }
    if (checkOnly) {
      console.log('  ' + name.padEnd(42) + 'NOT ready - would be analysed');
      continue;
    }

    // Not ready, and we were asked to make it ready. This is the real upload.
    const probe = await send(f, '');

    if (probe.status === 200 && probe.body.reduced) {
      // A reduced analysis is not cached, so this document is not actually
      // ready. Worth saying plainly rather than counting it as a success.
      console.log('  ' + name.padEnd(42) + 'reduced only - the full analysis could not run');
      reduced++;
      continue;
    }
    if (probe.status === 200) {
      console.log('  ' + name.padEnd(42) + 'analysed and cached (' + (probe.ms / 1000).toFixed(1) + 's)');
      warmed++;
      continue;
    }

    console.log('  ' + name.padEnd(42) + 'FAILED ' + probe.status + ' ' +
      String(probe.body.error || '').slice(0, 80));
    failed++;
  }

  console.log('');
  if (checkOnly) {
    console.log('  ' + ready + ' ready, ' + (files.length - ready - failed) + ' would need analysing.\n');
    return;
  }

  console.log('  ' + (ready + warmed) + ' of ' + files.length + ' ready to hand out.');
  if (reduced) console.log('  ' + reduced + ' got only a reduced analysis - try again when the daily quota resets.');
  if (failed) console.log('  ' + failed + ' failed.');
  console.log('\n  A cached proposition costs no provider call and returns in about a second,' +
              '\n  so these cannot fail during the session.\n');
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error('\n  ' + (e && e.message) + '\n'); process.exitCode = 1; });
