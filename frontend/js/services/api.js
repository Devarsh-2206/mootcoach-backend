import { BASE_URL } from '../config.js';
import { auth } from './firebase.js';

/**
 * Identify the caller to the server.
 *
 * Without this every request from one network looks like one person, so a
 * room of students sharing a wifi connection shares a single allowance and
 * the fifth of them is told to come back in fifteen minutes. Signed in, each
 * gets their own.
 *
 * Best effort on purpose: a failure here must never stop an upload, it only
 * means falling back to the shared bucket.
 */
async function identityHeaders() {
  try {
    const u = auth && auth.currentUser;
    if (!u) return {};
    const token = await u.getIdToken();
    return token ? { Authorization: 'Bearer ' + token } : {};
  } catch (e) {
    return {};
  }
}

/**
 * POST and read a JSON answer, turning every way that can fail into a sentence
 * a student can act on.
 *
 * Before this, three failures surfaced badly or not at all: a dropped
 * connection ("Failed to fetch"), a gateway page instead of JSON when the host
 * timed out or restarted ("Unexpected token <"), and a request that never
 * came back at all, which left a spinner running forever. The server gives up
 * at 180s, so the browser waits a little longer than that and then says so.
 */
export async function requestJson(path, { body, formData, timeoutMs = 190000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: Object.assign(formData ? {} : { 'Content-Type': 'application/json' }, await identityHeaders()),
      body: formData || JSON.stringify(body || {}),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      throw new Error('The server took too long to answer. Nothing you wrote has been lost. Try again.');
    }
    throw new Error("Couldn't reach the MootCoach server. If it has been idle it can take up to a minute to wake up. Try again shortly.");
  }
  clearTimeout(timer);
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON: a gateway or host error page */ }
  if (!data) {
    throw new Error(`The server could not finish that request (status ${res.status}). It may have restarted or timed out. Try again.`);
  }
  // A rejection ("this is not a legal document") is an answer, not a failure:
  // the caller has its own screen for it.
  if (data.isRejection) return data;
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `The request failed (status ${res.status}). Try again.`);
  }
  return data;
}

export async function checkBackendHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`${BASE_URL}/health`, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch (err) {
    clearTimeout(timeout);
    return false;
  }
}

export async function analyzeProposition(formData) {
  return requestJson('/analyze', { formData });
}

export async function evaluateOral(argumentText, contextText, difficultyMode) {
  return requestJson('/evaluate-oral', { body: {
    argument: argumentText,
    propositionContext: contextText || '',
    difficulty: difficultyMode
  } });
}

export async function logSessionSecurely(payload, idToken) {
  const res = await fetch(`${BASE_URL}/api/log-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Secure database log failed with status ${res.status}`);
  }
  return data;
}

export async function buildArgument(stance, issue, notes, propositionContext, forum, opts = {}) {
  // instructions: the advocate's directives, kept separate from notes so the
  // backend can present them as binding rather than as material to summarise.
  // authorities: their Authority Armory picks, which must appear in the memorial.
  return requestJson('/api/build-argument', { body: { stance, issue, notes, propositionContext, forum,
    instructions: opts.instructions || '', authorities: opts.authorities || [],
    memorialFocus: !!opts.memorialFocus } });
}


/**
 * Builds a competition-length memorial in passes. Separate from buildArgument
 * because that endpoint also produces the oral-advocacy, rebuttal and citation
 * blocks the other panels read, and one generation cannot do both jobs well:
 * measured, the memorial was 44% of its output and capped around 13-23 numbered
 * paragraphs where a filed memorial runs to 65.
 *
 * depth 'standard' makes one call per issue (~100s); 'full' makes one per
 * sub-ground, which roughly doubles the body but takes a few minutes.
 */
export async function buildMemorial(payload) {
  // Several passes; 'full' depth can run past the default wait.
  return requestJson('/api/build-memorial', { body: payload, timeoutMs: 400000 });
}
