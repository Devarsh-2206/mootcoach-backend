#!/usr/bin/env node
/**
 * Real-model check of the bench: does the judge react to what counsel said?
 *
 *   GEMINI_API_KEY=... node tools/bench-eval.js [judgeId] [easy|moderate|hard] [--text]
 *
 * --text runs the same exchange through the TEXT bench (buildJudgePrompt on
 * gemini-3.8-flash, as /simulate-bench does) over plain HTTPS — useful where
 * the key is injected by a proxy that does not reach WebSockets.
 *
 * Runs one scripted exchange through the LIVE voice model (text in, the
 * judge's spoken words read back from the transcription) using exactly the
 * prompt and persona production uses, and prints every judge turn with a few
 * automatic checks. It calls Google for real; nothing is mocked.
 */
const { GoogleGenAI } = require('@google/genai');
const { buildLiveJudgePrompt, buildJudgePrompt } = require('../prompts/benchJudgePrompt');
const { resolveVoiceJudge } = require('../prompts/judgePersona');

const judgeId = process.argv[2] || 'in-rao';
const level = process.argv[3] || 'hard';
const TEXT = process.argv.includes('--text');
const MODELS = (process.env.GEMINI_LIVE_MODELS || 'gemini-3.8-live,gemini-3.1-flash-live-preview').split(',');

const CASE = `[Forum: High Court of Karnataka — writ / quashing jurisdiction] [You are the Judges; the advocate addresses you as "My Lord/My Lady".]
Case: Kashinath & Mallappa seek to quash proceedings. A civil court granted an injunction in a tenancy dispute although the Karnataka Land Reforms Act bars civil courts from deciding tenancy questions, and the issue was pending before the Land Tribunal. Counsel appears for the petitioners.`;

// Each turn is what counsel says; the check is what a real bench would do with it.
const OFFTOPIC = process.argv.includes('--offtopic');
const IMPROPER = process.argv.includes('--improper');
const TURNS = IMPROPER ? [
  { say: 'My Lord, I appear for the petitioners. The Civil Court acted within its jurisdiction.', expect: 'a pointed question' },
  { say: 'love you', expect: 'rebukes the impropriety' },
  { say: 'I need a kiss', expect: 'severe rebuke / warning' },
  { say: 'I want to go, please leave me', expect: 'closes once: ends with "The Court is adjourned."' },
] : OFFTOPIC ? [
  { say: 'My Lord, I appear for the petitioners. The Civil Court acted within its jurisdiction in granting the injunction.', expect: 'a pointed question' },
  { say: 'I want the capital of India.', expect: 'does NOT answer; rebukes and returns to the case' },
  { say: 'How many states are there in India?', expect: 'does NOT answer; sharper rebuke / warning' },
  { say: "What's the population of India?", expect: 'does NOT answer' },
] : [
  { say: 'My Lord, I appear for the petitioners. The Civil Court acted within its jurisdiction in granting the injunction.', expect: 'a pointed question on the statutory bar' },
  { say: "I'm sorry my lord.", expect: 'an apology is not an answer; deals with the point' },
  { say: "I don't know.", expect: 'treats it as a concession and draws its consequence; does NOT re-ask the same question' },
  { say: 'My Lord, the bar under the Act applies only to questions of tenancy, and an injunction to protect possession pending the Tribunal is ancillary relief the civil court may still grant.', expect: 'acknowledges a real answer and builds the next question on it' },
];

const words = s => s.trim().split(/\s+/).filter(Boolean).length;
const overlap = (a, b) => {
  const A = new Set(a.toLowerCase().match(/[a-z]{4,}/g) || []), B = new Set(b.toLowerCase().match(/[a-z]{4,}/g) || []);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size);
};

async function run(model) {
  const vj = resolveVoiceJudge({ judgeId });
  const system = buildLiveJudgePrompt(level, [vj.persona, CASE].join('\n\n'));
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let buf = '', resolveTurn = null, setup;
  const setupDone = new Promise(r => { setup = r; });
  const session = await ai.live.connect({
    model,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: vj.voiceName } }, ...(vj.languageCode ? { languageCode: vj.languageCode } : {}) },
      outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: system }] },
    },
    callbacks: {
      onmessage: m => {
        if (m.setupComplete) setup();
        const sc = m.serverContent; if (!sc) return;
        if (sc.outputTranscription && sc.outputTranscription.text) buf += sc.outputTranscription.text;
        if (sc.turnComplete && resolveTurn) { const t = buf.trim(); buf = ''; const r = resolveTurn; resolveTurn = null; r(t); }
      },
      onerror: e => console.error('session error:', e && e.message),
      onclose: e => { if (resolveTurn) resolveTurn(`(session closed: ${e && e.reason})`); },
    },
  });
  await Promise.race([setupDone, new Promise(r => setTimeout(r, 8000))]);
  const ask = text => new Promise(r => { resolveTurn = r; session.sendRealtimeInput({ text }); setTimeout(() => { if (resolveTurn === r) { resolveTurn = null; r(buf.trim() || '(no reply in 45s)'); buf = ''; } }, 45000); });

  console.log(`\n=== ${vj.name} · ${level} bench · ${model} · voice ${vj.voiceName}${vj.languageCode ? ' · ' + vj.languageCode : ''} ===`);
  const opening = await ask('[Appellate Advocacy Hearing Starting] Begin the hearing with one opening question tailored to this issue. Keep it short.');
  console.log(`\nJUDGE (opening): ${opening}`);
  let prev = opening;
  for (const t of TURNS) {
    const reply = await ask(t.say);
    const checks = [
      words(reply) <= 90 ? 'length ok' : `TOO LONG (${words(reply)} words)`,
      overlap(reply, prev) > 0.7 ? 'REPEATS previous question' : 'new ground',
    ];
    if (/love you|kiss/.test(t.say)) checks.push(/(improper|decorum|inappropriate|conduct|record)/i.test(reply) && !/thank/i.test(reply) ? 'rebukes the remark' : 'DOES NOT rebuke');
    if (/want to go/.test(t.say)) checks.push(/court is adjourned/i.test(reply) ? 'adjourns' : 'DOES NOT adjourn');
    if (/capital|states are|population/.test(t.say)) checks.push(/(delhi|twenty|28|1\.4|billion|crore)/i.test(reply) ? 'ANSWERED THE TRIVIA' : 'refused the trivia');
    if (/don't know/.test(t.say)) checks.push(/(don'?t know|do not know|conce|accept|no answer|unprepared|then )/i.test(reply) ? 'reacts to the admission' : 'DOES NOT react to the admission');
    if (/sorry/.test(t.say)) checks.push(/(apolog|sorry|not an answer|answer the)/i.test(reply) ? 'reacts to the apology' : 'ignores the apology');
    console.log(`\nCOUNSEL: ${t.say}\nJUDGE:   ${reply}\n  expected: ${t.expect}\n  checks:   ${checks.join(' · ')}`);
    prev = reply;
  }
  session.close();
}


async function runText() {
  const vj = resolveVoiceJudge({ judgeId });
  const ctx = [vj.persona, CASE].join('\n\n');
  const CHAIN = (process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-2.5-flash,gemini-3.6-flash,gemini-3-flash-preview').split(',');
  const used = new Set();
  const key = /^AIza/.test(process.env.GEMINI_API_KEY || '') ? process.env.GEMINI_API_KEY : null;
  const history = [], asked = [];
  async function judge(say) {
    history.push({ role: 'user', parts: [{ text: say }] });
    const body = { systemInstruction: { parts: [{ text: buildJudgePrompt(level, ctx, [], asked, []) }] }, contents: history, generationConfig: { responseMimeType: 'application/json' } };
    // curl, not fetch: in a sandbox whose proxy injects the key, curl goes
    // through that proxy and Node's fetch does not.
    const { execFileSync } = require('child_process');
    let j = null, lastErr = '';
    // Google answers 503 "high demand" in bursts. Walk the chain (as the site
    // does), and if every model is busy, wait and walk it again — up to 4
    // rounds — so one busy spell does not leave a hole in the exchange.
    for (let round = 0; round < 4 && !j; round++) {
    if (round) { const wait = 8000 * round; console.error(`  (all models busy; retrying in ${wait / 1000}s)`); require('child_process').execSync(`sleep ${wait / 1000}`); }
    for (const model of CHAIN) {   // same order as the site: a busy model hands over to the next
      const args = ['-s', '--max-time', '120', '-X', 'POST', '-H', 'content-type: application/json', '--data-binary', '@-',
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`];
      if (key) args.splice(args.length - 1, 0, '-H', `x-goog-api-key: ${key}`);
      const out = execFileSync('curl', args, { input: JSON.stringify(body), maxBuffer: 1 << 24 }).toString();
      try { j = JSON.parse(out); } catch (e) { lastErr = out.slice(0, 80); j = null; continue; }
      if (j.error) { lastErr = `${model}: ${j.error.code} ${j.error.message.slice(0, 60)}`; j = null; continue; }
      used.add(model); break;
    }
    }
    if (!j) { history.pop(); return `(all models failed — last: ${lastErr})`; }
    const raw = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text).join('') || '';
    let reply = raw; try { const o = JSON.parse(raw); reply = o.judgeResponse || raw; } catch (e) {}
    history.push({ role: 'model', parts: [{ text: raw }] }); asked.push(reply);
    return reply;
  }
  console.log(`\n=== ${vj.name} · ${level} bench · TEXT bench (chain ${CHAIN.join(' > ')}) ===`);
  let prev = '';
  for (const t of TURNS) {
    const reply = await judge(t.say);
    const checks = [words(reply) <= 90 ? 'length ok' : `TOO LONG (${words(reply)} words)`, prev && overlap(reply, prev) > 0.7 ? 'REPEATS previous question' : 'new ground'];
    if (/capital|states are|population/.test(t.say)) checks.push(/(delhi|twenty|28|1\.4|billion|crore)/i.test(reply) ? 'ANSWERED THE TRIVIA' : 'refused the trivia');
    if (/don't know/.test(t.say)) checks.push(/(don'?t know|do not know|conce|accept|no answer|unprepared|then )/i.test(reply) ? 'reacts to the admission' : 'DOES NOT react to the admission');
    if (/sorry/.test(t.say)) checks.push(/(apolog|sorry|not an answer|answer the)/i.test(reply) ? 'reacts to the apology' : 'ignores the apology');
    console.log(`\nCOUNSEL: ${t.say}\nJUDGE:   ${reply}\n  expected: ${t.expect}\n  checks:   ${checks.join(' · ')}`);
    prev = reply;
  }
  console.log(`\nModels that answered: ${[...used].join(', ') || 'none'}`);
}

(async () => {
  if (TEXT) { await runText(); process.exit(0); }
  if (!process.env.GEMINI_API_KEY) { console.error('Set GEMINI_API_KEY to run this against the real model.'); process.exit(1); }
  for (const model of MODELS) {
    try { await run(model); break; }
    catch (e) { console.error(`${model} failed: ${e.message}; trying the next model.`); }
  }
  process.exit(0);
})();
