/**
 * Checks that an authority exists, against the web, and returns where it was
 * found.
 *
 * WHY: the model proposes case law, and it invents citations. The citation
 * guard (citationGuard.js) already refuses to trust the model's own claim and
 * marks every authority it proposed [VERIFY]. That keeps students safe, but it
 * leaves the checking to them. This does the checking.
 *
 * HOW: one Gemini call with Google Search grounding for a batch of authorities.
 * The model is asked to say, per authority, whether it exists and what the
 * correct citation is. Its word alone counts for nothing: an authority is only
 * "verified" (or "corrected") when Google's grounding metadata ties that
 * authority's line of the answer to at least one web source. No source, no
 * verification. Same rule the citation guard applies, now with evidence.
 *
 * Results are cached (memory, plus Firestore when available) because case law
 * does not change and every check spends quota.
 */
const crypto = require('crypto');

const MODELS = (process.env.GEMINI_VERIFY_MODELS || process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-2.5-flash,gemini-3.6-flash')
  .split(',').map(s => s.trim()).filter(Boolean);
const MAX_ITEMS = 12;
const TTL_MS = 30 * 24 * 3600 * 1000;

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const keyOf = a => crypto.createHash('sha1').update(norm(a.name) + '|' + norm(a.citation)).digest('hex').slice(0, 24);

function buildPrompt(items, forum) {
  return [
    'You are checking legal citations for a law student. Use Google Search to check each authority below.',
    forum ? `The matter is before: ${forum}.` : '',
    'For each one, answer on ONE line in exactly this form, keeping the number:',
    '[n] FOUND | <correct case name> | <correct citation> | <court and year>',
    '[n] NOT FOUND | <what you searched> | - | -',
    'Write FOUND only if you found the judgment itself or a reliable report of it (court website, law report, recognised legal database or reputable legal publication).',
    'If the case exists but the citation given is wrong, write FOUND with the correct citation.',
    'Do not guess. If you are not sure, write NOT FOUND.',
    '',
    ...items.map((a, i) => `[${i + 1}] ${a.name}${a.citation ? ', ' + a.citation : ''}`),
  ].filter(Boolean).join('\n');
}

/**
 * Pure: turn a grounded Gemini response into one result per item.
 * Exported for tests — needs no network.
 *
 * @param {Array<{name:string,citation?:string}>} items
 * @param {string} text   the model's answer
 * @param {object} gm     candidate.groundingMetadata ({groundingChunks, groundingSupports})
 */
function interpret(items, text, gm) {
  text = String(text || '');
  const chunks = (gm && gm.groundingChunks) || [];
  const supports = (gm && gm.groundingSupports) || [];

  // Where each numbered line sits in the answer, so grounding segments
  // (character ranges in the answer) can be attributed to an authority.
  const lines = [];
  const re = /^\s*\[(\d+)\]\s*(.*)$/gm;
  let m;
  while ((m = re.exec(text))) lines.push({ n: Number(m[1]), start: m.index, end: m.index + m[0].length, body: m[2] });

  // Segment offsets in grounding metadata are UTF-8 byte offsets; ours are
  // UTF-16 indices. Convert ours so non-ASCII text (case names, dashes)
  // does not shift the ranges.
  const byteAt = i => Buffer.byteLength(text.slice(0, i), 'utf8');

  return items.map((item, i) => {
    const line = lines.find(l => l.n === i + 1);
    const base = { name: item.name, citation: item.citation || '', status: 'unverified', sources: [] };
    if (!line) return { ...base, note: 'No answer for this authority.' };

    const [verdict, name, citation, court] = line.body.split('|').map(s => s.trim());
    const found = /^found\b/i.test(verdict || '');

    const b0 = byteAt(line.start), b1 = byteAt(line.end);
    const idx = new Set();
    for (const s of supports) {
      const seg = s.segment || {};
      const st = seg.startIndex || 0, en = seg.endIndex || 0;
      // Attribute by position only. Matching on names would hand one case's
      // sources to another that shares a party (every "Union of India").
      if (en > b0 && st < b1) (s.groundingChunkIndices || []).forEach(k => idx.add(k));
    }
    const sources = [...idx].map(k => chunks[k] && chunks[k].web).filter(Boolean)
      .map(w => ({ title: w.title || 'source', url: w.uri })).slice(0, 3);

    if (!found) return { ...base, sources, note: 'No reliable source found. Check this before citing it.' };
    if (!sources.length) return { ...base, note: 'The model said it exists but gave no source, so it is not counted as verified.' };

    const givenCit = norm(item.citation), foundCit = norm(citation && citation !== '-' ? citation : '');
    const corrected = foundCit && givenCit && foundCit !== givenCit && !foundCit.includes(givenCit) && !givenCit.includes(foundCit);
    return {
      ...base,
      status: corrected ? 'corrected' : 'verified',
      foundName: name || item.name,
      foundCitation: citation && citation !== '-' ? citation : item.citation,
      court: court && court !== '-' ? court : '',
      sources,
      note: corrected ? `Citation corrected from "${item.citation}".` : '',
    };
  });
}

/* ── cache ── */
const mem = new Map();
function firestore() {
  try { const admin = require('firebase-admin'); return admin.apps.length ? admin.firestore() : null; } catch (e) { return null; }
}
async function cacheGet(k) {
  const hit = mem.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const db = firestore(); if (!db) return null;
  try {
    const d = await db.collection('authorityVerifications').doc(k).get();
    if (d.exists && Date.now() - d.data().at < TTL_MS) { mem.set(k, d.data()); return d.data().v; }
  } catch (e) { /* cache is best-effort */ }
  return null;
}
async function cacheSet(k, v) {
  // Only cache conclusive answers. An "unverified" caused by a quota blip
  // should be retried next time, not remembered for a month.
  if (!v || v.status === 'unverified' && !v.sources.length && /No answer/.test(v.note || '')) return;
  const rec = { at: Date.now(), v };
  mem.set(k, rec);
  const db = firestore(); if (!db) return;
  try { await db.collection('authorityVerifications').doc(k).set(rec); } catch (e) {}
}

/* ── the grounded call ── */
let ai = null;
function client() {
  if (!ai) { const { GoogleGenAI } = require('@google/genai'); ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); }
  return ai;
}
async function groundedCall(prompt) {
  let last;
  for (const model of MODELS) {
    try {
      const r = await client().models.generateContent({
        model, contents: prompt, config: { tools: [{ googleSearch: {} }], temperature: 0 },
      });
      const cand = (r.candidates || [])[0] || {};
      const text = ((cand.content || {}).parts || []).map(p => p.text || '').join('');
      if (text) return { text, gm: cand.groundingMetadata || {}, model };
      last = new Error(`${model}: empty answer`);
    } catch (e) { last = e; }
  }
  throw last || new Error('no model available');
}

/**
 * @param {Array<{name:string,citation?:string}>} authorities
 * @param {{forum?:string}} [opts]
 */
async function verifyAuthorities(authorities, opts = {}) {
  const items = (Array.isArray(authorities) ? authorities : [])
    .filter(a => a && typeof a.name === 'string' && a.name.trim())
    .map(a => ({ name: a.name.trim().slice(0, 300), citation: String(a.citation || '').trim().slice(0, 200) }))
    .slice(0, MAX_ITEMS);

  const out = new Array(items.length);
  const todo = [];
  for (let i = 0; i < items.length; i++) {
    const cached = await cacheGet(keyOf(items[i]));
    if (cached) out[i] = { ...cached, cached: true }; else todo.push(i);
  }
  if (todo.length) {
    const batch = todo.map(i => items[i]);
    const { text, gm } = await groundedCall(buildPrompt(batch, opts.forum));
    const res = interpret(batch, text, gm);
    for (let j = 0; j < todo.length; j++) { out[todo[j]] = res[j]; await cacheSet(keyOf(batch[j]), res[j]); }
  }
  return out;
}

module.exports = { verifyAuthorities, interpret, buildPrompt, MAX_ITEMS };
