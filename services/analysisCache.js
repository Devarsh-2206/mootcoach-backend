/**
 * Analysing the same proposition twice should not cost twice.
 *
 * The heaviest route in the app spends one Gemini request from a daily
 * allowance of roughly 20-50 per model, and testing means uploading the same
 * document again and again. Nothing about that document changed between
 * uploads, so nothing about the answer needs to be bought again.
 *
 * The key is the extracted text plus a fingerprint of every prompt that shapes
 * the output. That second part matters: edit a prompt and the fingerprint
 * changes, so the cache invalidates itself rather than serving an answer the
 * current prompts would not produce. There is no version number to remember
 * to bump.
 *
 * Entries are shared across users, and that is safe because the key IS the
 * document: you cannot read an entry without already holding the exact text
 * that produced it.
 *
 * Nothing here may break a request. A cache that takes the route down with it
 * is worse than no cache.
 */

const crypto = require('crypto');
const admin = require('firebase-admin');

const MAX_AGE_DAYS = Number(process.env.ANALYSIS_CACHE_DAYS || 30);
const MAX_BYTES = 900 * 1024;          // Firestore's document ceiling is 1 MiB
const COLLECTION = 'analysisCache';


function db() {
  try {
    return admin.apps.length ? admin.firestore() : null;
  } catch (e) {
    return null;
  }
}

/**
 * A fingerprint of the prompts that shape an analysis.
 *
 * Computed once per process from the prompt text itself, so changing a prompt
 * changes every key and the old answers are simply never looked up again.
 */
function fingerprint(prompts) {
  // Recomputed each time rather than memoised. Hashing the prompts costs
  // under a millisecond and happens once per upload, whereas a cached value
  // would ignore its own arguments - so a second prompt set in the same
  // process would silently inherit the first one's fingerprint and serve its
  // answers.
  const h = crypto.createHash('sha256');
  for (const p of prompts) h.update(String(p || ''), 'utf8');
  return h.digest('hex').slice(0, 16);
}

function keyFor(text, prompts) {
  return crypto.createHash('sha256')
    .update(fingerprint(prompts), 'utf8')
    .update('\u0000', 'utf8')
    .update(String(text || ''), 'utf8')
    .digest('hex');
}

async function get(key) {
  const f = db();
  if (!f || !key) return null;
  try {
    const snap = await f.collection('artifacts').doc('moot.coach')
      .collection(COLLECTION).doc(key).get();
    if (!snap.exists) return null;

    const d = snap.data() || {};
    const ageMs = Date.now() - (d.createdAtMs || 0);
    if (!d.payload || ageMs > MAX_AGE_DAYS * 86400000) return null;

    // Touched so a document in active use is visibly distinct from a dead one
    // when the time comes to prune. Fire and forget.
    f.collection('artifacts').doc('moot.coach').collection(COLLECTION).doc(key)
      .set({ hits: admin.firestore.FieldValue.increment(1),
             lastHitMs: Date.now() }, { merge: true })
      .catch(() => {});

    return { payload: d.payload, ageMs, hits: d.hits || 0 };
  } catch (e) {
    console.warn('[CACHE] read failed, continuing without it:', e && e.message);
    return null;
  }
}

async function put(key, payload, meta) {
  const f = db();
  if (!f || !key || !payload) return false;
  try {
    const size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (size > MAX_BYTES) {
      console.warn('[CACHE] not stored: ' + size + ' bytes exceeds the document ceiling.');
      return false;
    }
    await f.collection('artifacts').doc('moot.coach').collection(COLLECTION).doc(key)
      .set(Object.assign({
        payload,
        createdAtMs: Date.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        bytes: size,
        hits: 0,
      }, meta || {}), { merge: false });
    return true;
  } catch (e) {
    console.warn('[CACHE] write failed, continuing:', e && e.message);
    return false;
  }
}

/** How much the cache has saved, for the usage report. */
async function stats() {
  const f = db();
  if (!f) return { entries: 0, hits: 0 };
  try {
    const snap = await f.collection('artifacts').doc('moot.coach')
      .collection(COLLECTION).select('hits', 'bytes').get();
    let hits = 0, bytes = 0;
    snap.forEach(d => { const v = d.data() || {}; hits += v.hits || 0; bytes += v.bytes || 0; });
    return { entries: snap.size, hits, bytes };
  } catch (e) {
    return { entries: 0, hits: 0, error: e && e.message };
  }
}

module.exports = { keyFor, get, put, stats, MAX_AGE_DAYS };
