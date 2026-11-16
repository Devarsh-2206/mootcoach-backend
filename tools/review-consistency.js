#!/usr/bin/env node
/**
 * How steady is Memorial Review? Reviews the same memorial several times and
 * reports how much each mark, and the computed score, moves between runs.
 * A score is worth only as much as it is steady: if one memorial scores 58 and
 * 66 on two runs, a "+4" after a revision means nothing.
 *
 *   1. Start the server locally with your keys (docs/LOCAL_TESTING.md) and
 *      ALLOW_UNAUTHENTICATED=1 in .env (local only; ignored on Render).
 *   2. node tools/review-consistency.js path/to/memorial.pdf [runs=5] [Petitioner]
 *
 * Each run is a real review and costs what one review costs.
 */
const fs = require('fs');
const path = require('path');

const [file, runsArg, side = 'Petitioner'] = process.argv.slice(2);
const runs = Math.max(2, Math.min(10, Number(runsArg) || 5));
const BASE = process.env.MOOTCOACH_URL || 'http://localhost:3000';
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node tools/review-consistency.js memorial.pdf [runs] [side]');
  process.exit(1);
}

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../frontend/js/components/memorialScoring.js'), 'utf8');
  const { scoreMemorial, CRITERIA, SCHEMES } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const pdf = fs.readFileSync(file);
  const results = [];
  for (let i = 1; i <= runs; i++) {
    const fd = new FormData();
    fd.append('file', new Blob([pdf], { type: 'application/pdf' }), path.basename(file));
    fd.append('side', side);
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/analyse-memorial`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.review) {
      console.error(`Run ${i} failed (${res.status}): ${(data && data.error) || 'no review'}`);
      continue;
    }
    results.push(data);
    const s = scoreMemorial(data.review, data);
    console.log(`Run ${i}: ${s ? s.percent : '—'} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  if (results.length < 2) { console.error('Fewer than two runs finished; nothing to compare.'); process.exit(1); }

  const spread = xs => {
    const n = xs.length, mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
    return { min: Math.min(...xs), max: Math.max(...xs), mean: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10 };
  };
  console.log(`\n${results.length} reviews of ${path.basename(file)}\n`);
  console.log('Criterion'.padEnd(22) + 'min  max  mean   sd');
  for (const [k, label] of Object.entries(CRITERIA)) {
    const xs = results.map(d => Number(d.review.scores && d.review.scores[k])).filter(Number.isFinite);
    if (xs.length < 2) continue;
    const s = spread(xs);
    console.log(label.padEnd(22) + `${String(s.min).padEnd(5)}${String(s.max).padEnd(5)}${String(s.mean).padEnd(7)}${s.sd}`);
  }
  console.log('');
  for (const key of Object.keys(SCHEMES)) {
    const xs = results.map(d => scoreMemorial(d.review, d, key)).filter(Boolean).map(s => s.percent);
    if (xs.length < 2) continue;
    const s = spread(xs);
    console.log(`${SCHEMES[key].name}: ${s.min}–${s.max}, mean ${s.mean}, sd ${s.sd}`);
  }
  console.log('\nRead it this way: a change smaller than about twice the sd is within the noise.');
})().catch(e => { console.error(e.message); process.exit(1); });
