/**
 * One Gemini client for the whole server, able to use Vertex AI.
 *
 * Gemini is reachable two ways: the Gemini API with an AI Studio key
 * (GEMINI_API_KEY, what MootCoach has always used) and Vertex AI with a
 * Google Cloud service account. The Google Cloud free-trial credit pays for
 * Vertex AI, not for the AI Studio key, so during the pilot Vertex goes first.
 *
 *   GEMINI_BACKEND=vertex        use Vertex AI first (anything else: AI Studio only)
 *   VERTEX_SERVICE_ACCOUNT       the service account's JSON key, pasted whole
 *   VERTEX_PROJECT               optional; defaults to the key's project_id
 *   VERTEX_LOCATION              text models; default "global"
 *   VERTEX_LIVE_LOCATION         the voice bench; default "us-central1"
 *
 * Every Vertex refusal (credentials, billing, a model it does not offer, a
 * busy spell) falls back to the AI Studio key for that call, so switching
 * Vertex on can never take the app down. Fallbacks are logged, at most once a
 * minute per reason, so a misconfiguration shows up in the Render logs.
 *
 * The object exported as `ai` has the same shape the code already calls:
 * ai.models.generateContent(params) and ai.live.connect(params).
 */
const { GoogleGenAI } = require('@google/genai');
const spend = require('./spend');

let studio = null;
const vertexByLocation = new Map();

function studioClient() {
  return studio || (studio = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

function serviceAccount() {
  const raw = process.env.VERTEX_SERVICE_ACCOUNT;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { warnOnce('bad-json', 'VERTEX_SERVICE_ACCOUNT is not valid JSON; using the AI Studio key.'); return null; }
}

function vertexEnabled() {
  return process.env.GEMINI_BACKEND === 'vertex' && !!serviceAccount();
}

function vertexClient(location) {
  if (vertexByLocation.has(location)) return vertexByLocation.get(location);
  const sa = serviceAccount();
  const client = new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || sa.project_id,
    location,
    googleAuthOptions: { credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] },
  });
  vertexByLocation.set(location, client);
  return client;
}

const warned = new Map();
function warnOnce(key, msg) {
  const t = warned.get(key) || 0;
  if (Date.now() - t < 60e3) return;
  warned.set(key, Date.now());
  console.warn('[VERTEX] ' + msg);
}
const reasonOf = (e) => String((e && (e.status || e.code)) || '') + ' ' + String((e && e.message) || e).slice(0, 160);

/** Since the server started: how calls were served. Shown in the admin panel. */
const stats = { vertex: 0, fallback: 0, studio: 0, lastFallback: '', voiceVertex: 0, voiceStudio: 0 };
/** A voice session opened on this backend (called by geminiService). */
function noteLive(backend) { if (backend === 'vertex') stats.voiceVertex++; else stats.voiceStudio++; }

async function generateContent(params) {
  if (vertexEnabled()) {
    try {
      const r = await vertexClient(process.env.VERTEX_LOCATION || 'global').models.generateContent(params);
      stats.vertex++;
      spend.recordCall(params && params.model, 'vertex', r);
      return r;
    } catch (e) {
      stats.fallback++;
      stats.lastFallback = reasonOf(e).trim().slice(0, 120);
      warnOnce('gen:' + String((e && (e.status || e.code)) || 'err'), `${params && params.model}: Vertex refused (${reasonOf(e)}); using the AI Studio key for this call.`);
    }
  }
  stats.studio++;
  const r = await studioClient().models.generateContent(params);
  spend.recordCall(params && params.model, 'studio', r);
  return r;
}

/**
 * The voice bench walks its own list of attempts (geminiService), so instead
 * of hiding a fallback here it asks which backends to try, in order.
 */
function liveBackends() {
  return vertexEnabled() ? ['vertex', 'studio'] : ['studio'];
}
function liveClient(backend) {
  return backend === 'vertex' ? vertexClient(process.env.VERTEX_LIVE_LOCATION || 'us-central1') : studioClient();
}

const ai = {
  models: { generateContent },
  live: { connect: (params) => liveClient(liveBackends()[0]).live.connect(params) },
};

function aiStatus() { return { backend: vertexEnabled() ? 'vertex' : 'studio', ...stats }; }

module.exports = { ai, liveBackends, liveClient, vertexEnabled, studioClient, aiStatus, noteLive };
