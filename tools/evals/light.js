// Light jobs (authority card, bench forecast, Chambers Briefing) on two models,
// same inputs, scored by the same checks, with real token counts.
//   node tools/evals/light.js [model1,model2]   (default 3.8-flash vs 3.1-flash-lite)
// Raw answers and a results JSON go to tools/evals/reports/light/.
const path = require('path');
const R = path.join(__dirname, '..', '..') + '/';
const { execFileSync } = require('child_process');
const CASES = require(R + 'tools/evals/cases.js');
const CARD = require(R + 'prompts/authorityCardPrompt');
const FORECAST = require(R + 'prompts/benchForecastPrompt');
const { buildOralBriefingPrompt } = require(R + 'prompts/oralBriefingPrompt');
const MODELS = (process.argv[2] || 'gemini-3.8-flash,gemini-3.1-flash-lite').split(',');
const fs = require('fs');
const OUT = path.join(__dirname, 'reports', 'light'); fs.mkdirSync(OUT, { recursive: true });

const SCEN = [
  { id: 'india', c: CASES.find(x => x.id === 'in-sc-shutdown'), stance: 'Petitioner',
    issue: "Whether the district-wide internet suspension for 74 days violates Articles 19(1)(a) and 19(1)(g) for want of proportionality.",
    known: ['Anuradha Bhasin v. Union of India, (2020) 3 SCC 637', 'Modern Dental College v. State of Madhya Pradesh, (2016) 7 SCC 353'],
    authority: 'Anuradha Bhasin v. Union of India, (2020) 3 SCC 637', wrong: /first amendment|european convention|echr\b/i },
  { id: 'uk', c: CASES.find(x => x.id === 'uk-jr-deportation'), stance: 'Appellant',
    issue: "Whether certifying the human-rights claim as clearly unfounded, so that the appeal can only be brought after removal, was unlawful under Article 8 ECHR.",
    known: ['R (Kiarie and Byndloss) v Secretary of State for the Home Department [2017] UKSC 42', 'ZH (Tanzania) v Secretary of State for the Home Department [2011] UKSC 4'],
    authority: 'R (Kiarie and Byndloss) v Secretary of State for the Home Department [2017] UKSC 42',
    wrong: /puttaswamy|maneka gandhi|article\s*21 of the constitution|supreme court of india|\bSCC\b/i },
];
const draftFor = s => `My Lords, the ${s.stance} submits that the measure fails the test of proportionality. ${s.issue} The authorities, notably ${s.known.join(' and ')}, require the State to show necessity and to consider less restrictive means. No such material was produced.`;

function call(model, system, user, temperature, maxOut) {
  const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: Object.assign({ temperature, responseMimeType: 'application/json' }, maxOut ? { maxOutputTokens: maxOut } : {}) };
  const t = Date.now();
  let j;
  for (let a = 0; a < 6; a++) {
  const out = execFileSync('curl', ['-s', '--max-time', '180', '-X', 'POST', '-H', 'content-type: application/json', '--data-binary', '@-',
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`], { input: JSON.stringify(body), maxBuffer: 1 << 26 }).toString();
  try { j = JSON.parse(out); if (j.error && j.error.code === 503 && a < 5) { execFileSync('sleep', [String(20 * (a + 1))]); continue; } break; } catch (e) { j = { error: { code: 'net', message: out.slice(0, 80) } }; execFileSync('sleep', ['5']); }
  }
  if (j.error) return { err: `${j.error.code} ${String(j.error.message).slice(0, 90)}`, ms: Date.now() - t };
  const cand = (j.candidates || [])[0] || {};
  const text = ((cand.content || {}).parts || []).map(p => p.text || '').join('');
  let data = null; try { data = JSON.parse(text); } catch (e) { const m = text.match(/\{[\s\S]*\}/); try { data = m && JSON.parse(m[0]); } catch (e2) {} }
  return { text, data, finish: cand.finishReason, usage: j.usageMetadata || {}, ms: Date.now() - t };
}

const str = v => typeof v === 'string' && v.trim().length > 0;
const checks = {
  card(d, s) {
    const F = ['ratioDecidendi', 'selectionRationale', 'usageStrategy', 'courtroomUsageExample', 'opponentAttack', 'distinguishingStrategy', 'benchQuestion'];
    return { 'all 7 fields': F.every(f => str(d[f])), 'no wrong-country law': !s.wrong.test(JSON.stringify(d)) };
  },
  forecast(d, s) {
    const q = Array.isArray(d.likelyQuestions) ? d.likelyQuestions : [];
    const F = ['question', 'probability', 'rationale', 'idealAnswer', 'dangerousFollowUp', 'recoveryRoute'];
    return { 'summary + advice': str(d.forecastSummary) && str(d.strategicAdvice), 'exactly 3 questions': q.length === 3,
      'each question complete': q.length > 0 && q.every(x => F.every(f => str(x[f]))), 'no wrong-country law': !s.wrong.test(JSON.stringify(d)) };
  },
  briefing(d, s) {
    const oa = d.oralAdvocacy || {}, rb = d.rebuttals || {};
    const arr = v => Array.isArray(v) ? v : [];
    const prec = arr(oa.precedents).filter(p => p && p.name);
    const knownHit = prec.filter(p => s.known.some(k => k.toLowerCase().includes(String(p.name).toLowerCase().split(/ v\.? /)[0].trim().slice(0, 12))));
    return { '6 Q&A': arr(oa.qa).filter(x => x && x.q).length >= 6, '4 precedents': prec.length >= 4,
      'uses the known authorities': knownHit.length >= Math.min(2, s.known.length), '4 traps': arr(oa.traps).length >= 4,
      '5 follow-ups': arr(rb.followUpQuestions).filter(x => x && x.q).length >= 5,
      '4 opponent args + 4 replies': arr(rb.opponentArguments).length >= 4 && arr(rb.demolitionStrategy).length >= 4,
      'plan B, rescue, prayer': str(rb.planB) && str(rb.emergencyRescue) && str(oa.closingPrayer) && /alternative/i.test(oa.closingPrayer),
      'no wrong-country law': !s.wrong.test(JSON.stringify(d)), _precedents: prec.map(p => p.name) };
  },
};

const rows = [];
for (const s of SCEN) {
  const ctx = s.c.text;
  const jobs = {
    card: [CARD, `\nPROPOSITION FACTS / CONTEXT:\n${ctx}\n\nADVOCATE'S STANCE (SIDE):\n${s.stance}\n\nAUTHORITY TO ANALYZE:\n${s.authority}\n\nADVOCATE'S NOTES:\nNone\n`, 0.2, 0],
    forecast: [FORECAST, `\nPROPOSITION FACTS / CONTEXT:\n${ctx}\n\nSELECTED LEGAL ISSUE:\n${s.issue}\n\nADVOCATE'S STANCE (SIDE):\n${s.stance}\n\nADVOCATE'S PREPARED NOTES:\n${draftFor(s)}\n`, 0.3, 0],
    briefing: [buildOralBriefingPrompt({ stance: s.stance, benchMode: 'moderate' }),
      [`PROPOSITION:\n${ctx}`, `ISSUE BEING ARGUED:\n${s.issue}`, `KNOWN AUTHORITIES (real; relied on in this moot):\n- ${s.known.join('\n- ')}`, `THE ADVOCATE'S DRAFT:\n${draftFor(s)}`].join('\n\n') + '\n\nReturn ONLY a valid JSON object.', 0.3, 12000],
  };
  for (const [job, [sys, user, temp, maxOut]] of Object.entries(jobs)) {
    for (const model of MODELS) {
      const r = call(model, sys, user, temp, maxOut);
      const ck = r.data ? checks[job](r.data, s) : { 'valid JSON': false };
      const u = r.usage || {};
      rows.push({ scen: s.id, job, model, ms: r.ms, err: r.err, finish: r.finish, in: u.promptTokenCount, out: u.candidatesTokenCount, think: u.thoughtsTokenCount || 0, ck });
      fs.writeFileSync(`${OUT}/out-${s.id}-${job}-${model}.json`, r.text || r.err || '');
      const fails = Object.entries(ck).filter(([k, v]) => !k.startsWith('_') && v === false).map(([k]) => k);
      console.log(`${s.id.padEnd(5)} ${job.padEnd(8)} ${model.padEnd(22)} ${r.err ? 'ERROR ' + r.err : (fails.length ? '✗ ' + fails.join(', ') : '✓ all checks')} | ${Math.round(r.ms / 1000)}s in=${u.promptTokenCount} out=${u.candidatesTokenCount} think=${u.thoughtsTokenCount || 0}${ck._precedents ? ' | precedents: ' + ck._precedents.join(' ; ').slice(0, 200) : ''}`);
    }
  }
}
fs.writeFileSync(`${OUT}/results-${Date.now()}.json`, JSON.stringify(rows, null, 1));
