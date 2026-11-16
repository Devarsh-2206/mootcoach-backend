// Memorial Review's score is computed from a competition's published marking
// scheme (frontend/js/components/memorialScoring.js), not taken from the AI.
// Hand-worked figures for each scheme, the evidence cap and the penalties.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/js/components/memorialScoring.js'), 'utf8');
  const { scoreMemorial, SCHEMES } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

  // Every scheme's heads add up to its published total.
  for (const [k, s] of Object.entries(SCHEMES)) {
    assert.strictEqual(s.heads.reduce((t, h) => t + h.max, 0), s.total, `${k} heads sum to ${s.total}`);
    for (const h of s.heads) assert.ok(Math.abs(Object.values(h.from).reduce((a, b) => a + b, 0) - 1) < 1e-9, `${k}: ${h.label} shares sum to 1`);
  }

  const ev = { knowledgeOfLaw: ['¶3'], useOfFacts: ['¶4'], analysis: ['¶5'], research: ['¶6'], structure: ['TOC'], languageAndStyle: ['¶7'], compliance: ['fn 2'] };
  const review = { scores: { knowledgeOfLaw: 60, useOfFacts: 70, analysis: 50, research: 40, structure: 80, languageAndStyle: 70, compliance: 60 }, evidence: ev };
  const all = { sections: [], metrics: { pages: 20 } };

  // The standard scheme (what students see): same heads and weights, no
  // competition named, problems flagged and never deducted.
  let st = scoreMemorial(review, { sections: [{ key: 'prayer', label: 'Prayer', present: false }], metrics: { pages: 80 } });
  assert.strictEqual(st.schemeKey, 'standard'); assert.strictEqual(st.scheme.name, 'Standard moot marking');
  assert.strictEqual(st.subtotal, 57); assert.strictEqual(st.deducted, 0); assert.strictEqual(st.total, 57);
  assert.deepStrictEqual(st.penalties.map(p => [p.points, /Check your competition/.test(p.note)]), [[0, true]]);   // no page limit known

  // Henry Dunant 2026: 30×65% + 30×50% + 20×40% + 10×80% + 10×65% = 19.5+15+8+8+6.5 = 57.
  let r = scoreMemorial(review, all, 'hdmc2026');
  assert.deepStrictEqual(r.heads.map(h => h.mark), [19.5, 15, 8, 8, 6.5]);
  assert.strictEqual(r.total, 57); assert.strictEqual(r.percent, 57); assert.strictEqual(r.penalties.length, 0);

  // K.K. Luthra, out of 20: 3.5 + 2.5 + 2 + 1.8 + 1.5 = 11.3 → 56.5% → 57.
  r = scoreMemorial(review, all, 'kkLuthra2026');
  assert.strictEqual(r.total, 11.3); assert.strictEqual(r.outOf, 20); assert.strictEqual(r.percent, 57);

  // NALSAR PIL, out of 200: 50×.65 + 50×.5 + 40×.4 + 40×.8 + 20×.7 = 32.5+25+16+32+14 = 119.5.
  r = scoreMemorial(review, all, 'nalsarPil2024');
  assert.strictEqual(r.total, 119.5); assert.strictEqual(r.percent, 60);

  // A mark with no evidence is capped at 59.
  const noProof = { scores: Object.assign({}, review.scores, { structure: 90 }), evidence: Object.assign({}, ev, { structure: [] }) };
  r = scoreMemorial(noProof, all, 'hdmc2026');
  assert.strictEqual(r.heads[3].mark, 5.9); assert.deepStrictEqual(r.capped, ['Structure']);
  // An older review (no evidence asked for) is not capped.
  assert.deepStrictEqual(scoreMemorial({ scores: review.scores }, all, 'hdmc2026').capped, []);

  // Penalties, from the rules: a missing Prayer and 30 pages.
  const audit = { sections: [{ key: 'prayer', label: 'Prayer', present: false }, { key: 'contents', label: 'Table of Contents', present: false }], metrics: { pages: 30 } };
  r = scoreMemorial(review, audit, 'kkLuthra2026');        // 0.25 objective error + (30-1-25)=4 pages × 1
  assert.deepStrictEqual(r.penalties.map(p => p.points), [0.25, 4]);
  assert.strictEqual(r.total, 7.05);
  r = scoreMemorial(review, audit, 'nalsarCci2025');        // 5 per missing core section; 30 pages is within 45
  assert.deepStrictEqual(r.penalties.map(p => p.points), [5]);
  r = scoreMemorial(review, { sections: [], metrics: { pages: 50 } }, 'nalsarCci2025');
  assert.ok(r.penalties[0].disqualify, 'over 45 pages: disqualification risk');
  r = scoreMemorial(review, audit, 'hdmc2026');            // no amounts stated: flagged, nothing deducted
  assert.strictEqual(r.deducted, 0); assert.strictEqual(r.penalties.length, 2);

  // Unknown scheme falls back to the default; a missing criterion gives no score.
  assert.strictEqual(scoreMemorial(review, all, 'nope').schemeKey, 'standard');
  assert.strictEqual(scoreMemorial({ scores: { analysis: 50 }, evidence: {} }, all, 'hdmc2026'), null);

  console.log('PASS memorial scoring: standard scheme (flags, no deductions), published weights, hand-worked totals, evidence cap, rulebook penalties');
})().catch(e => { console.error('FAIL memorial scoring:', e.message); process.exit(1); });
