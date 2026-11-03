/**
 * services/genaiClient.js: Vertex first, AI Studio key as the fallback.
 *   node tools/evals/genai-client.test.js
 * Uses a fake @google/genai, so no network and no credentials.
 */
const assert = require('assert');
const Module = require('module');

const made = [];
let vertexFails = false;
class FakeGenAI {
  constructor(opts) { this.opts = opts; made.push(opts); }
  get models() {
    return { generateContent: async (p) => {
      if (this.opts.vertexai && vertexFails) { const e = new Error('PERMISSION_DENIED: billing'); e.status = 403; throw e; }
      return { via: this.opts.vertexai ? 'vertex:' + this.opts.location : 'studio', model: p.model };
    } };
  }
  get live() { return { connect: async () => ({ via: this.opts.vertexai ? 'vertex:' + this.opts.location : 'studio' }) }; }
}
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === '@google/genai' ? { GoogleGenAI: FakeGenAI } : origLoad.call(this, req, ...rest); };

(async () => {
  const sa = JSON.stringify({ project_id: 'trial-proj', client_email: 'x@y', private_key: 'k' });
  const g = require('../../services/genaiClient');

  // off: AI Studio only
  delete process.env.GEMINI_BACKEND;
  assert.strictEqual((await g.ai.models.generateContent({ model: 'm' })).via, 'studio');
  assert.deepStrictEqual(g.liveBackends(), ['studio']);

  // on but no service account: still AI Studio
  process.env.GEMINI_BACKEND = 'vertex';
  assert.strictEqual((await g.ai.models.generateContent({ model: 'm' })).via, 'studio');

  // on: Vertex in "global", project from the key
  process.env.VERTEX_SERVICE_ACCOUNT = sa;
  const r = await g.ai.models.generateContent({ model: 'gemini-3.8-flash' });
  assert.strictEqual(r.via, 'vertex:global');
  const vopts = made.find(o => o.vertexai);
  assert.strictEqual(vopts.project, 'trial-proj');
  assert.deepStrictEqual(vopts.googleAuthOptions.credentials.project_id, 'trial-proj');

  // Vertex refuses: the same call goes through on the AI Studio key
  vertexFails = true;
  const warn = console.warn; const warnings = []; console.warn = (m) => warnings.push(m);
  assert.strictEqual((await g.ai.models.generateContent({ model: 'gemini-3.8-flash' })).via, 'studio');
  console.warn = warn;
  assert.ok(warnings.some(w => /Vertex refused/.test(w)), 'the fallback is logged');
  vertexFails = false;

  // voice: Vertex first (us-central1), then AI Studio
  assert.deepStrictEqual(g.liveBackends(), ['vertex', 'studio']);
  assert.strictEqual((await g.liveClient('vertex').live.connect({})).via, 'vertex:us-central1');
  assert.strictEqual((await g.liveClient('studio').live.connect({})).via, 'studio');

  // a broken key falls back rather than crashing
  process.env.VERTEX_SERVICE_ACCOUNT = '{not json';
  console.warn = () => {};
  assert.strictEqual(g.vertexEnabled(), false);
  console.warn = warn;

  console.log('ALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
