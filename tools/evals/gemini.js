/**
 * Minimal Gemini caller for the eval suite.
 *
 * curl, not fetch: in a sandbox whose proxy injects the API key, curl goes
 * through that proxy and Node's fetch does not. Walks the same model chain as
 * the site and retries whole rounds when every model is busy (503 / 429), so
 * one busy spell does not fail a case.
 */
const { execFileSync, execSync } = require('child_process');

const CHAIN = (process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-2.5-flash,gemini-3.6-flash,gemini-3-flash-preview').split(',');
const KEY = /^AIza/.test(process.env.GEMINI_API_KEY || '') ? process.env.GEMINI_API_KEY : null;

const exhausted = new Set();

/**
 * Groq, for comparing an open model on the same checks. A chain entry
 * "groq:<model>" is sent to Groq's OpenAI-style API instead of Gemini. Groq's
 * free tier rejects any single request whose input plus max_tokens exceeds the
 * per-minute budget, so max_tokens is cut to fit GROQ_TPM_BUDGET (8000 on the
 * free tier); a reply that hits it comes back as MAX_TOKENS, which is the
 * budget talking, not the model.
 */
function groqGenerate(model, { system, contents, temperature, json, maxOutputTokens }) {
  const messages = (system ? [{ role: 'system', content: system }] : []).concat(contents.map(c => ({
    role: c.role === 'model' ? 'assistant' : 'user', content: (c.parts || []).map(p => p.text || '').join('') })));
  const budget = Number(process.env.GROQ_TPM_BUDGET || 8000);
  const est = Math.ceil(JSON.stringify(messages).length / 4);
  const max = Math.min(maxOutputTokens || 32000, budget - est - 300);
  if (budget - est - 300 < 500) throw new Error(`${model}: request too large for a ${budget}-token budget (~${est} input)`);
  const body = { model, messages, temperature, max_tokens: max,
    ...(process.env.GROQ_REASONING ? { reasoning_effort: process.env.GROQ_REASONING } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}) };
  let last = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const out = execFileSync('curl', ['-s', '--max-time', '180', '-X', 'POST', '-H', 'content-type: application/json', '--data-binary', '@-',
      'https://api.groq.com/openai/v1/chat/completions'], { input: JSON.stringify(body), maxBuffer: 1 << 26 }).toString();
    let j; try { j = JSON.parse(out); } catch (e) { last = `non-JSON ${out.slice(0, 80)}`; execSync('sleep 5'); continue; }
    if (j.error) {
      last = `${j.error.code || j.error.type}: ${String(j.error.message).slice(0, 120)}`;
      const wait = String(j.error.message).match(/try again in ([\d.]+)s/i);
      if (/rate_limit|tokens per minute/i.test(JSON.stringify(j.error)) && !/per day|TPD|RPD/i.test(j.error.message)) {
        execSync(`sleep ${Math.ceil((wait ? parseFloat(wait[1]) : 20) + 1)}`); continue;
      }
      break;
    }
    const ch = (j.choices || [])[0] || {};
    const text = (ch.message && ch.message.content) || '';
    const finishReason = ch.finish_reason === 'length' ? 'MAX_TOKENS' : (ch.finish_reason || '').toUpperCase();
    if (!text) { last = `empty (${finishReason})`; break; }
    return { text, model: 'groq:' + model, finishReason, groundingMetadata: {}, usage: j.usage };
  }
  throw new Error(`groq:${model}: ${last}`);
}

function generate({ system, user, history, contents: rawContents, temperature = 0.1, json = true, maxOutputTokens = 32000, tools }) {
  const contents = rawContents || history || [{ role: 'user', parts: [{ text: user }] }];
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    ...(tools ? { tools } : {}),
    generationConfig: { temperature, maxOutputTokens, ...(json && !tools ? { responseMimeType: 'application/json' } : {}) },
  };
  let lastErr = '';
  for (let round = 0; round < 4; round++) {
    if (CHAIN.every(m => exhausted.has(m))) break;
    if (round) execSync(`sleep ${8 * round}`);
    for (const model of CHAIN) {
      if (exhausted.has(model)) continue;
      if (model.startsWith('groq:')) {
        try { return groqGenerate(model.slice(5), { system, contents, temperature, json, maxOutputTokens }); }
        catch (e) { lastErr = e.message; if (/per day|TPD|RPD/i.test(e.message)) exhausted.add(model); continue; }
      }
      const args = ['-s', '--max-time', '180', '-X', 'POST', '-H', 'content-type: application/json', '--data-binary', '@-',
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`];
      if (KEY) args.splice(args.length - 1, 0, '-H', `x-goog-api-key: ${KEY}`);
      let out;
      try { out = execFileSync('curl', args, { input: JSON.stringify(body), maxBuffer: 1 << 26 }).toString(); }
      catch (e) { lastErr = `${model}: curl ${e.status}`; continue; }
      let j; try { j = JSON.parse(out); } catch (e) { lastErr = `${model}: non-JSON ${out.slice(0, 80)}`; continue; }
      if (j.error) {
        lastErr = `${model}: ${j.error.code} ${String(j.error.message).slice(0, 80)}`;
        // A spent DAILY quota does not come back by waiting a few seconds; note
        // it so the run stops instead of hammering every model in the chain.
        if (j.error.code === 429 && /PerDay|per day|free_tier/i.test(JSON.stringify(j.error))) exhausted.add(model);
        continue;
      }
      const cand = (j.candidates || [])[0] || {};
      const text = ((cand.content || {}).parts || []).map(p => p.text || '').join('');
      const calls = ((cand.content || {}).parts || []).filter(p => p.functionCall).map(p => p.functionCall);
      if (calls.length) return { text, model, content: cand.content, calls, groundingMetadata: {} };
      if (!text) { lastErr = `${model}: empty (${cand.finishReason || 'no candidate'})`; continue; }
      return { text, model, finishReason: cand.finishReason, groundingMetadata: cand.groundingMetadata || {} };
    }
  }
  const err = new Error(`all models failed — last: ${lastErr}`);
  err.quotaExhausted = CHAIN.every(m => exhausted.has(m));
  throw err;
}

/** Pull the first JSON object out of a model reply (tolerates fences/prose). */
function parseJSON(text) {
  try { return JSON.parse(text); } catch (e) {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

module.exports = { generate, groqGenerate, parseJSON, CHAIN, exhausted };
