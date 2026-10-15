#!/usr/bin/env node
/**
 * Real-model check of the bench: does the judge react to what counsel said?
 *
 *   GEMINI_API_KEY=... node tools/bench-eval.js [judgeId] [easy|moderate|hard]
 *
 * Runs one scripted exchange through the LIVE voice model (text in, the
 * judge's spoken words read back from the transcription) using exactly the
 * prompt and persona production uses, and prints every judge turn with a few
 * automatic checks. It calls Google for real; nothing is mocked.
 */
const { GoogleGenAI } = require('@google/genai');
const { buildLiveJudgePrompt } = require('../prompts/benchJudgePrompt');
const { resolveVoiceJudge } = require('../prompts/judgePersona');

const judgeId = process.argv[2] || 'in-rao';
const level = process.argv[3] || 'hard';
const MODELS = (process.env.GEMINI_LIVE_MODELS || 'gemini-3.8-live,gemini-3.1-flash-live-preview').split(',');

const CASE = `[Forum: High Court of Karnataka — writ / quashing jurisdiction] [You are the Judges; the advocate addresses you as "My Lord/My Lady".]
Case: Kashinath & Mallappa seek to quash proceedings. A civil court granted an injunction in a tenancy dispute although the Karnataka Land Reforms Act bars civil courts from deciding tenancy questions, and the issue was pending before the Land Tribunal. Counsel appears for the petitioners.`;

// Each turn is what counsel says; the check is what a real bench would do with it.
const TURNS = [
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
    if (/don't know/.test(t.say)) checks.push(/(don'?t know|do not know|conce|accept|no answer|unprepared|then )/i.test(reply) ? 'reacts to the admission' : 'DOES NOT react to the admission');
    if (/sorry/.test(t.say)) checks.push(/(apolog|sorry|not an answer|answer the)/i.test(reply) ? 'reacts to the apology' : 'ignores the apology');
    console.log(`\nCOUNSEL: ${t.say}\nJUDGE:   ${reply}\n  expected: ${t.expect}\n  checks:   ${checks.join(' · ')}`);
    prev = reply;
  }
  session.close();
}

(async () => {
  if (!process.env.GEMINI_API_KEY) { console.error('Set GEMINI_API_KEY to run this against the real model.'); process.exit(1); }
  for (const model of MODELS) {
    try { await run(model); break; }
    catch (e) { console.error(`${model} failed: ${e.message}; trying the next model.`); }
  }
  process.exit(0);
})();
