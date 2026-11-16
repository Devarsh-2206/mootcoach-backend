#!/usr/bin/env node
/**
 * Does MootCoach read a rulebook correctly? Sends rulebooks to the rulebook
 * reader and compares what comes back with figures checked by hand against
 * each PDF (16 Nov 2026). Any mismatch is a reading error to fix before
 * students rely on the feature; the confirmation screen is the safety net,
 * not the plan.
 *
 *   1. Start the server locally with your keys (docs/LOCAL_TESTING.md) and
 *      ALLOW_UNAUTHENTICATED=1 in .env (local only; ignored on Render).
 *   2. node tools/rulebook-accuracy.js path/to/rulebook.pdf [more.pdf ...]
 *
 * Each file costs one rulebook reading. Files are matched to the known
 * answers by the competition name the reader returns.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.MOOTCOACH_URL || 'http://localhost:3000';
const KNOWN = [
  { match: /dunant/i, name: 'Henry Dunant 2026 (cl. 4.1, 4.3)', shares: [30, 30, 20, 10, 10], total: 100, pages: 25, lateBasis: 'perDay', late: 3 },
  { match: /luthra/i, name: 'K.K. Luthra 2026 (r. 17, 18)', shares: [25, 25, 25, 15, 10], total: 20, pages: 25, perPage: 1, lateBasis: 'perDay', late: 0.5 },
  { match: /public international|nalsar.*pil|unhcr/i, name: 'NALSAR PIL 2024 (r. 4, 5.a)', shares: [25, 25, 20, 20, 10], total: 200, pages: 50, perPage: 2, missingSection: 2, lateBasis: 'perHour', late: 1 },
  { match: /antitrust|cci/i, name: 'NALSAR-CCI 2025 (r. 13, 15)', shares: [25, 25, 20, 20, 10], total: 100, pages: 45, pageDisqualify: true, missingSection: 5, cap: 50 },
];

const files = process.argv.slice(2);
if (!files.length) { console.error('Usage: node tools/rulebook-accuracy.js rulebook.pdf [...]'); process.exit(1); }

(async () => {
  let wrong = 0, checked = 0;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(file)], { type: 'application/pdf' }), path.basename(file));
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/rulebook/read`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => null);
    console.log(`\n${path.basename(file)} (${Math.round((Date.now() - t0) / 1000)}s)`);
    if (!res.ok || !data || !data.profile) { console.log(`  failed: ${(data && data.error) || res.status}`); wrong++; continue; }
    const p = data.profile;
    const name = [p.competition.name, p.competition.edition].filter(Boolean).join(' ');
    const k = KNOWN.find(x => x.match.test(name));
    console.log(`  read as: ${name}`);
    (p.warnings || []).forEach(w => console.log(`  warning: ${w}`));
    if (!k) { console.log('  no checked answers for this rulebook; shown for information:'); console.log(JSON.stringify(p.marking, null, 1)); continue; }
    const check = (what, got, want) => {
      checked++;
      const same = JSON.stringify(got) === JSON.stringify(want);
      if (!same) wrong++;
      console.log(`  ${same ? 'ok   ' : 'WRONG'} ${what}: ${JSON.stringify(got)}${same ? '' : `  (rulebook: ${JSON.stringify(want)})`}`);
    };
    const pens = p.penalties || [];
    const pen = kind => pens.find(x => x.kind === kind) || {};
    const heads = (p.marking && p.marking.heads) || [];
    const tot = heads.reduce((a, h) => a + h.max, 0) || 1;
    check('marking shares (%)', heads.map(h => Math.round(h.max / tot * 1000) / 10), k.shares);
    // K.K. Luthra states percentages and "out of 20": either reading is right.
    if (k.total !== 20) check('marked out of', p.marking && p.marking.total, k.total);
    else check('marked out of 20 (or 100 as percentages)', [20, 100].includes(p.marking && p.marking.total), true);
    check('memorial page limit', p.limits && p.limits.memorialPages && p.limits.memorialPages.value, k.pages);
    if (k.perPage) check('per page over the limit', pen('pageLimitMemorial').points, k.perPage);
    if (k.pageDisqualify) check('over the page limit', pen('pageLimitMemorial').basis, 'disqualification');
    if (k.missingSection) check('missing section', pen('missingSection').points, k.missingSection);
    if (k.cap) check('penalty cap', p.penaltyCap && p.penaltyCap.points, k.cap);
    if (k.late) check(`late submission (${k.lateBasis})`, [pen('lateSubmission').points, pen('lateSubmission').basis], [k.late, k.lateBasis]);
  }
  console.log(`\n${checked - Math.min(wrong, checked)} of ${checked} figures right${wrong ? `; ${wrong} wrong or failed` : ''}.`);
  process.exit(wrong ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
