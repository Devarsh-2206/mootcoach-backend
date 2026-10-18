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

function generate({ system, user, history, temperature = 0.1, json = true, maxOutputTokens = 32000 }) {
  const contents = history || [{ role: 'user', parts: [{ text: user }] }];
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature, maxOutputTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  let lastErr = '';
  for (let round = 0; round < 4; round++) {
    if (round) execSync(`sleep ${8 * round}`);
    for (const model of CHAIN) {
      const args = ['-s', '--max-time', '180', '-X', 'POST', '-H', 'content-type: application/json', '--data-binary', '@-',
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`];
      if (KEY) args.splice(args.length - 1, 0, '-H', `x-goog-api-key: ${KEY}`);
      let out;
      try { out = execFileSync('curl', args, { input: JSON.stringify(body), maxBuffer: 1 << 26 }).toString(); }
      catch (e) { lastErr = `${model}: curl ${e.status}`; continue; }
      let j; try { j = JSON.parse(out); } catch (e) { lastErr = `${model}: non-JSON ${out.slice(0, 80)}`; continue; }
      if (j.error) { lastErr = `${model}: ${j.error.code} ${String(j.error.message).slice(0, 80)}`; continue; }
      const cand = (j.candidates || [])[0] || {};
      const text = ((cand.content || {}).parts || []).map(p => p.text || '').join('');
      if (!text) { lastErr = `${model}: empty (${cand.finishReason || 'no candidate'})`; continue; }
      return { text, model, finishReason: cand.finishReason };
    }
  }
  throw new Error(`all models failed — last: ${lastErr}`);
}

/** Pull the first JSON object out of a model reply (tolerates fences/prose). */
function parseJSON(text) {
  try { return JSON.parse(text); } catch (e) {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return null;
}

module.exports = { generate, parseJSON, CHAIN };
