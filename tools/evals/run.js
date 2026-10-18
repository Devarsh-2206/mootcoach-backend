#!/usr/bin/env node
/**
 * MootCoach eval suite — scores the real prompts against golden cases.
 *
 *   GEMINI_API_KEY=... node tools/evals/run.js            # everything
 *   node tools/evals/run.js --only in-sc-shutdown         # one case
 *   node tools/evals/run.js --no-analysis                 # validation + forum only (fast)
 *   node tools/evals/run.js --no-bench                    # skip the bench scenarios
 *   node tools/evals/run.js --update-baseline             # accept this run as the baseline
 *
 * What it runs is what production sends: the same system prompts, the same
 * user-message shape and the same forum directive builder as /analyze, and
 * the same text-bench prompt as /simulate-bench. It calls Gemini for real.
 *
 * Every check is pass/fail. The run is compared with tools/evals/baseline.json:
 * a check that passed in the baseline and fails now is a REGRESSION, and the
 * process exits 1. Model output varies run to run, so read a single new
 * failure as "look at this", and re-run before concluding.
 */
const fs = require('fs');
const path = require('path');
const { generate, parseJSON } = require('./gemini');
const CASES = require('./cases');
const LEGAL_VALIDATION_PROMPT = require('../../prompts/legalValidationPrompt');
const FORUM_DETECTION_PROMPT = require('../../prompts/forumDetectionPrompt');
const ANALYSIS_SYSTEM_PROMPT = require('../../prompts/analysisSystemPrompt');
const { buildForumDirective } = require('../../prompts/forumDirective');
const { buildJudgePrompt } = require('../../prompts/benchJudgePrompt');
const { resolveVoiceJudge } = require('../../prompts/judgePersona');
const { interpret, buildPrompt } = require('../../services/authorityVerifier');
const { runAssistant, TOOLS, SYSTEM } = require('../../services/assistant');

const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const DIR = __dirname;

const results = [];   // { suite, case, check, pass, detail }
function record(suite, kase, check, pass, detail = '') {
  results.push({ suite, case: kase, check, pass: !!pass, detail: String(detail).slice(0, 240) });
  console.log(`  ${pass ? '✓' : '✗'} ${check}${detail ? ' — ' + String(detail).slice(0, 140) : ''}`);
}

/* ─────────────────────────── analysis suite ─────────────────────────── */
function issueTexts(a) {
  const framed = Array.isArray(a.legalIssues) ? a.legalIssues : [];
  const extra = Array.isArray(a.additionalIssues) ? a.additionalIssues.map(x => (x && (x.issue || x)) || '') : [];
  return framed.concat(extra).map(String);
}
const REQUIRED_KEYS = ['summary', 'legalIssues', 'petitionerArguments', 'respondentArguments', 'precedentsNeeded', 'benchQuestions', 'mostContestableIssue'];

function runCase(c) {
  console.log(`\n▸ ${c.id} — ${c.title}`);
  const e = c.expect;

  // 1. Validation (same message shape as /analyze)
  let v;
  try {
    const r = generate({ system: LEGAL_VALIDATION_PROMPT, user: `Classify this document. Return ONLY valid JSON:\n\n${c.text.slice(0, 3000)}`, temperature: 0.05, maxOutputTokens: 2000 });
    v = parseJSON(r.text);
  } catch (err) { record('analysis', c.id, 'validation ran', false, err.message); return; }
  // /analyze rejects only when isLegal === false AND confidence >= 75
  const rejected = !!v && v.isLegal === false && Number(v.confidence) >= 75;
  record('analysis', c.id, e.isLegal ? 'accepted as a legal document' : 'rejected as not legal', e.isLegal ? !rejected : rejected,
    v ? `${v.documentType || ''} (${v.confidence})` : 'unparseable');
  if (!e.isLegal) return;

  // 2. Forum detection (head + tail, as /analyze)
  const t = c.text;
  const forumInput = t.length > 6000 ? t.slice(0, 3000) + '\n\n[…middle of the proposition omitted…]\n\n' + t.slice(-3000) : t;
  let forum = null;
  try {
    const r = generate({ system: FORUM_DETECTION_PROMPT, user: `Detect the forum for this proposition. Return ONLY valid JSON:\n\n${forumInput}`, temperature: 0, maxOutputTokens: 4000 });
    forum = parseJSON(r.text);
  } catch (err) { record('analysis', c.id, 'forum detection ran', false, err.message); }
  if (forum) {
    record('analysis', c.id, 'forum', e.forum.test(forum.forum || ''), forum.forum);
    record('analysis', c.id, 'court level', e.courtLevel.includes(String(forum.courtLevel || '').toLowerCase()), forum.courtLevel);
    record('analysis', c.id, 'jurisdiction', e.jurisdiction.test(forum.jurisdiction || ''), forum.jurisdiction);
  }
  if (flag('--no-analysis')) return;

  // 3. Full analysis under the detected forum
  let a = null, raw = '';
  try {
    const r = generate({ system: ANALYSIS_SYSTEM_PROMPT, user: `Analyze this legal proposition. Return ONLY a valid JSON object. No markdown:${buildForumDirective(forum)}\n\n${c.text}`, temperature: 0.1 });
    raw = r.text; a = parseJSON(raw);
    record('analysis', c.id, 'analysis returned valid JSON', !!a, a ? `${r.model}` : `${r.finishReason} · ${raw.slice(0, 80)}`);
  } catch (err) { record('analysis', c.id, 'analysis returned valid JSON', false, err.message); return; }
  if (!a) return;

  const missing = REQUIRED_KEYS.filter(k => a[k] == null || (Array.isArray(a[k]) && !a[k].length) || a[k] === '');
  record('analysis', c.id, 'all core sections present', !missing.length, missing.length ? 'missing: ' + missing.join(', ') : '');

  const issues = issueTexts(a).join(' \n ');
  e.issues.forEach(re => record('analysis', c.id, `issue covered: ${re.source.slice(0, 48)}`, re.test(issues)));

  const all = JSON.stringify(a);
  const leak = all.match(e.mustNotMention);
  record('analysis', c.id, 'no wrong-forum law', !leak, leak ? `found "${leak[0]}"` : '');

  // Authorities: every precedent names two parties and carries a citation or says it is unverified
  const prec = Array.isArray(a.precedentsNeeded) ? a.precedentsNeeded : [];
  const malformed = prec.filter(p => !p || !/\bv\.?\s/i.test(p.caseName || '') || !String(p.citation || '').trim());
  record('analysis', c.id, 'authorities are named and cited', prec.length > 0 && !malformed.length,
    `${prec.length} authorities${malformed.length ? `, malformed: ${malformed.map(p => `"${(p && p.caseName) || '?'}" [${(p && p.citation) || 'no citation'}]`).join('; ')}` : ''}`);
  const unverified = prec.filter(p => /unverified/i.test(p.citation || '')).length;
  // Not a failure: honesty about an unverifiable citation is the behaviour we want. Reported for the trend.
  record('analysis', c.id, 'authorities flagged unverified (info)', true, `${unverified}/${prec.length}`);
}

/* ─────────────────────────── bench suite ─────────────────────────── */
const BENCH_CASE = `[Forum: High Court of Karnataka — writ / quashing jurisdiction] [You are the Judges; the advocate addresses you as "My Lord/My Lady".]
Case: Kashinath & Mallappa seek to quash proceedings. A civil court granted an injunction in a tenancy dispute although the Karnataka Land Reforms Act bars civil courts from deciding tenancy questions, and the issue was pending before the Land Tribunal. Counsel appears for the petitioners.`;
const OPEN = 'My Lord, I appear for the petitioners. The Civil Court acted within its jurisdiction in granting the injunction.';
const overlap = (x, y) => {
  const A = new Set(x.toLowerCase().match(/[a-z]{4,}/g) || []), B = new Set(y.toLowerCase().match(/[a-z]{4,}/g) || []);
  if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size);
};
const SCENARIOS = [
  { id: 'trivia', turns: [OPEN, 'What is the capital of India?'],
    check: r => ['refuses trivia', !/new delhi|\bdelhi\b/i.test(r[1])] },
  { id: 'improper', turns: [OPEN, 'love you'],
    check: r => ['rebukes an improper remark', /improper|decorum|conduct|inappropriate|contempt|warn|unbecoming|dignity|serious/i.test(r[1])] },
  { id: 'dont-know', turns: [OPEN, "I don't know."],
    check: r => ['treats "I don\'t know" as a concession, does not repeat itself', overlap(r[1], r[0]) < 0.7 && /concede|concession|cannot answer|no answer|unable|then|so/i.test(r[1])] },
  { id: 'length', turns: [OPEN],
    check: r => ['keeps a turn under 90 words', r[0].trim().split(/\s+/).length <= 90] },
];
function runBench() {
  const vj = resolveVoiceJudge({ judgeId: 'in-rao' });
  const ctx = [vj.persona, BENCH_CASE].join('\n\n');
  for (const s of SCENARIOS) {
    if (only && only !== `bench-${s.id}`) continue;
    console.log(`\n▸ bench-${s.id} (${vj.name}, hard)`);
    const history = [], asked = [], replies = [];
    try {
      for (const say of s.turns) {
        history.push({ role: 'user', parts: [{ text: say }] });
        const r = generate({ system: buildJudgePrompt('hard', ctx, [], asked, []), history, temperature: 0.7 });
        let reply = r.text; const o = parseJSON(r.text); if (o && o.judgeResponse) reply = o.judgeResponse;
        history.push({ role: 'model', parts: [{ text: r.text }] }); asked.push(reply); replies.push(reply);
      }
      const [name, pass] = s.check(replies);
      record('bench', `bench-${s.id}`, name, pass, replies[replies.length - 1]);
    } catch (err) { record('bench', `bench-${s.id}`, 'bench ran', false, err.message); }
  }
}

/* ─────────────────────────── citation suite ───────────────────────────
   Real grounded check (Google Search), same prompt and interpretation as
   /api/verify-authorities. One known-wrong citation, two real cases, one
   invention. */
const CITATIONS = [
  { name: 'Suryadev Rai v. Ram Chander Rai', citation: '(2008) 12 SCC 1', expect: s => s === 'corrected' || s === 'verified', label: 'misspelt, wrongly cited real case is found (ideally corrected to (2003) 6 SCC 675)' },
  { name: 'K.S. Puttaswamy v. Union of India', citation: '(2017) 10 SCC 1', expect: s => s === 'verified', label: 'real case with the right citation is verified' },
  { name: 'Anuradha Bhasin v. Union of India', citation: '(2020) 3 SCC 637', expect: s => s === 'verified', label: 'real case with the right citation is verified' },
  { name: 'Ravindra Kesharwani v. State of Mandara', citation: '(2019) 4 SCC 912', expect: s => s === 'unverified', label: 'invented case is NOT verified' },
];
function runCitations() {
  console.log('\n▸ citations (grounded web check)');
  try {
    const r = generate({ user: buildPrompt(CITATIONS, 'Supreme Court of India'), tools: [{ google_search: {} }], temperature: 0, json: false, maxOutputTokens: 4000 });
    const res = interpret(CITATIONS, r.text, r.groundingMetadata);
    res.forEach((v, i) => record('citations', 'citations', `${CITATIONS[i].name}: ${CITATIONS[i].label}`, CITATIONS[i].expect(v.status),
      `${v.status}${v.foundCitation ? ' · ' + v.foundCitation : ''}${v.sources[0] ? ' · ' + v.sources[0].title : ''}`));
  } catch (err) { record('citations', 'citations', 'citation check ran', false, err.message); }
}

/* ─────────────────────────── assistant suite ───────────────────────────
   The tool-using assistant on the real model (curl transport). No saved moots
   here, so it must rely on verify_authorities and must not vouch for a case
   it could not find. */
function curlStep(contents) {
  const r = generate({ system: SYSTEM, contents, temperature: 0.3, json: false, maxOutputTokens: 4000,
    tools: [{ functionDeclarations: TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }] });
  return Promise.resolve({ content: r.content || { role: 'model', parts: [{ text: r.text }] }, calls: (r.calls || []).map(c => ({ name: c.name, args: c.args || {} })), text: r.text });
}
async function runAssistantSuite() {
  console.log('\n▸ assistant (tool use)');
  try {
    const r = await runAssistant({ question: 'Can I rely on Ravindra Kesharwani v. State of Mandara, (2019) 4 SCC 912 in my memorial?', ctx: {}, step: curlStep });
    record('assistant', 'assistant', 'checks the case with verify_authorities', r.toolsUsed.some(t => t.name === 'verify_authorities'), r.toolsUsed.map(t => t.name).join(', '));
    record('assistant', 'assistant', 'does not vouch for an invented case', /not (be )?(found|verified|traced)|could not|cannot|unable|do not rely|don't rely|unverified/i.test(r.answer), r.answer.slice(0, 200));
  } catch (err) { record('assistant', 'assistant', 'assistant ran', false, err.message); }
}

/* ─────────────────────────── run + report ─────────────────────────── */
const started = Date.now();
const quotaGone = () => require('./gemini').CHAIN.every(m => require('./gemini').exhausted.has(m));
for (const c of CASES) {
  if (only && only !== c.id) continue;
  if (quotaGone()) { console.log(`\n✗ Stopping: every model's daily Gemini quota is spent. Nothing after this point was tested.`); break; }
  runCase(c);
}
if (!flag('--no-bench') && (!only || only.startsWith('bench-')) && !quotaGone()) runBench();
if (!flag('--no-citations') && (!only || only === 'citations') && !quotaGone()) runCitations();
const finish = async () => {
if (!flag('--no-assistant') && (!only || only === 'assistant') && !quotaGone()) await runAssistantSuite();

const key = r => `${r.suite}|${r.case}|${r.check}`;
const pass = results.filter(r => r.pass).length;
const baselinePath = path.join(DIR, 'baseline.json');
const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;
const was = new Map((baseline ? baseline.results : []).map(r => [key(r), r.pass]));
const regressions = results.filter(r => !r.pass && was.get(key(r)) === true);
const fixed = results.filter(r => r.pass && was.get(key(r)) === false);

console.log(`\n══ ${pass}/${results.length} checks passed (${Math.round(100 * pass / Math.max(1, results.length))}%) in ${Math.round((Date.now() - started) / 1000)}s`);
for (const s of ['analysis', 'bench', 'citations', 'assistant']) {
  const rs = results.filter(r => r.suite === s); if (!rs.length) continue;
  console.log(`   ${s}: ${rs.filter(r => r.pass).length}/${rs.length}`);
}
if (baseline) {
  console.log(`   vs baseline (${baseline.when}): ${regressions.length} regression(s), ${fixed.length} newly passing`);
  regressions.forEach(r => console.log(`   ✗ REGRESSION ${r.case} · ${r.check} — ${r.detail.slice(0, 100)}`));
}

const report = { when: new Date().toISOString(), passed: pass, total: results.length, results };
fs.mkdirSync(path.join(DIR, 'reports'), { recursive: true });
fs.writeFileSync(path.join(DIR, 'reports', 'latest.json'), JSON.stringify(report, null, 2));
const apiFailures = results.filter(r => /all models failed/.test(r.detail)).length;
if (flag('--update-baseline')) {
  // A baseline taken from a run the API cut short would mark real checks as
  // failing and hide every later regression on them.
  if (apiFailures || quotaGone()) console.log(`   baseline NOT updated: ${apiFailures} check(s) failed on API errors — re-run when the quota resets`);
  else { fs.writeFileSync(baselinePath, JSON.stringify(report, null, 2)); console.log('   baseline updated'); }
}
process.exit(regressions.length ? 1 : 0);
};
finish();
