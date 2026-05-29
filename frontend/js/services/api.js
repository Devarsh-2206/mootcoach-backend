import { BASE_URL } from '../config.js';

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
  const res = await fetch(`${BASE_URL}/analyze`, { method: 'POST', body: formData });
  if (!res.ok) {
    const txt = await res.text().catch(() => 'Unknown server error.');
    throw new Error(`Server ${res.status}: ${txt}`);
  }
  return res.json();
}

export async function evaluateOral(argumentText, contextText, difficultyMode) {
  const res = await fetch(`${BASE_URL}/evaluate-oral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function logSessionSecurely(payload) {
  const res = await fetch(`${BASE_URL}/api/log-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Secure database log failed with status ${res.status}`);
  }
  return data;
}

export async function buildArgument(stance, issue, notes, propositionContext) {
  const res = await fetch(`${BASE_URL}/api/build-argument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stance, issue, notes, propositionContext })
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Failed to build argument with status ${res.status}`);
  }
  return data;
}

