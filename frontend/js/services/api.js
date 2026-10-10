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
  const res = await fetch(`${BASE_URL}/analyze`, {
    method: 'POST',
    headers: await identityHeaders(),      // no Content-Type: the browser sets the multipart boundary
    body: formData,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => 'Unknown server error.');
    throw new Error(`Server ${res.status}: ${txt}`);
  }
  return res.json();
}

export async function evaluateOral(argumentText, contextText, difficultyMode) {
  const res = await fetch(`${BASE_URL}/evaluate-oral`, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, await identityHeaders()),
    body: JSON.stringify({
      argument: argumentText,
      propositionContext: contextText || '',
      difficulty: difficultyMode
    })
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Evaluation failed.');
  return data;
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
  const res = await fetch(`${BASE_URL}/api/build-argument`, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, await identityHeaders()),
    // instructions: the advocate's directives, kept separate from notes so the
    // backend can present them as binding rather than as material to summarise.
    // authorities: their Authority Armory picks, which must appear in the memorial.
    body: JSON.stringify({ stance, issue, notes, propositionContext, forum,
      instructions: opts.instructions || '', authorities: opts.authorities || [],
      memorialFocus: !!opts.memorialFocus })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Failed to build argument with status ${res.status}`);
  }
  return data;
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
  const res = await fetch(`${BASE_URL}/api/build-memorial`, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, await identityHeaders()),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Memorial drafting failed with status ${res.status}`);
  }
  return data;
}
