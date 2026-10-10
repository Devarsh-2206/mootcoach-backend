/**
 * What the day's provider allowance is actually being spent on.
 *
 * Both free tiers cap by the day, and nothing in the app knew how much was
 * left or which route had spent it — so a quota wall arrived with no warning
 * and no way to tell afterwards what had eaten the day.
 *
 *   Gemini   requests per day, PER MODEL, resetting at midnight Pacific.
 *   Groq     1,000 requests and 200,000 tokens per day for gpt-oss-120b.
 *
 * The important thing this counts is ATTEMPTS, not successes. A call that
 * comes back RECITATION or SAFETY is a response the model actually produced,
 * so it costs a request exactly like a useful answer does. Counting only
 * successes would hide the most expensive failure mode in the system.
 *
 * Nothing here may ever break a request: every entry point swallows its own
 * errors. A counter that takes the app down with it is worse than no counter.
 */

const admin = require('firebase-admin');

/* Google resets requests-per-day at midnight Pacific, so the day this counts
   has to be the Pacific day, not the server's and not the viewer's. For an
   Indian user that boundary lands around 12:30 in the afternoon, which is
   worth knowing when a quota seems to refill in the middle of a work day. */
function pacificDay(d = new Date()) {
  try {
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  } catch (e) {
    return d.toISOString().slice(0, 10);          // en-CA is already YYYY-MM-DD
  }
}

/* Outcome classes. These are the distinctions that change what you would do
   about them, which is the only reason to separate them. */
function classify(errMessage) {
  const m = String(errMessage || '');
  if (!m) return 'ok';
  if (/RESOURCE_EXHAUSTED|exceeded your current quota|free_tier|PerDay|quota/i.test(m)) return 'quota';
  if (/RECITATION|SAFETY|BLOCKLIST|PROHIBITED|empty response/i.test(m)) return 'filter';
  if (/UNAVAILABLE|\b503\b|high demand|overloaded/i.test(m)) return 'overload';
  if (/Timeout/i.test(m)) return 'timeout';
  if (/\b429\b|rate.?limit|tokens per minute|\bTPM\b/i.test(m)) return 'ratelimit';
  if (/skipped/i.test(m)) return 'skipped';
  return 'error';
}

/* In-memory until flushed. Firestore is the durable copy, because Render
   restarts the process often enough that memory alone would keep resetting
   the very number you came to look at. */
let day = pacificDay();
let pending = new Map();           // "provider|model|label|outcome" -> count
let flushTimer = null;
let flushing = false;
const wallsLogged = new Set();     // "model|day", so each wall is reported once
let lastFlushError = null;

const FLUSH_MS = 15000;

function db() {
  try {
    return admin.apps.length ? admin.firestore() : null;
  } catch (e) {
    return null;
  }
}

function docFor(d) {
  const f = db();
  return f ? f.collection('artifacts').doc('moot.coach').collection('telemetry').doc('usage-' + d) : null;
}

/**
 * Record one attempt against a provider.
 *
 * `outcome` is derived from the error message when one is given, so callers
 * do not have to agree on vocabulary with this file.
 */
function record(entry) {
  try {
    const { provider, model, label, error } = entry || {};
    const now = pacificDay();
    if (now !== day) {                 // crossed midnight Pacific mid-process
      flush().catch(() => {});
      day = now;
      pending = new Map();
    }
    const key = [
      provider || 'unknown',
      model || 'unknown',
      (label || 'unlabelled').replace(/[.$[\]#/]/g, ' ').slice(0, 60),
      classify(error),
    ].join('|');
    pending.set(key, (pending.get(key) || 0) + 1);

    // The moment a model runs out is the moment the breakdown is worth having,
    // and it is the one moment nobody is watching. Logged once per model per
    // day so the hosting logs carry it without becoming noise.
    const outcome = key.split('|')[3];
    if (outcome === 'quota' && !wallsLogged.has(model + '|' + day)) {
      wallsLogged.add(model + '|' + day);
      snapshot(day).then(u => {
        console.warn('[USAGE] ' + model + ' is out of requests for ' + day + ' (Pacific). ' +
          'Spent so far today: ' + u.total + ' calls. By route: ' +
          JSON.stringify(u.byRoute) + '. By outcome: ' + JSON.stringify(u.byOutcome));
      }).catch(() => {});
    }

    if (!flushTimer) flushTimer = setTimeout(() => { flush().catch(() => {}); }, FLUSH_MS);
  } catch (e) {
    // Never let counting break a request.
  }
}

async function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (flushing || !pending.size) return;
  const doc = docFor(day);
  if (!doc) return;                              // no Firestore: memory only

  flushing = true;
  const batchOf = pending;
  pending = new Map();
  try {
    // Nested, not a dotted key: set() reads "counts.x" as a field literally
    // named "counts.x" rather than as a path into the map, so the map stayed
    // empty. A nested object merges properly, and increment() is honoured at
    // any depth - which is what lets several instances write the same day
    // without clobbering each other.
    const counts = {};
    for (const [key, n] of batchOf) {
      counts[key.replace(/\./g, '·')] = admin.firestore.FieldValue.increment(n);
    }
    await doc.set({
      day,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      counts,
    }, { merge: true });
    lastFlushError = null;
  } catch (e) {
    lastFlushError = e && e.message;
    // Put them back so nothing is lost to a transient Firestore failure.
    for (const [key, n] of batchOf) pending.set(key, (pending.get(key) || 0) + n);
  } finally {
    flushing = false;
    if (pending.size && !flushTimer) flushTimer = setTimeout(() => { flush().catch(() => {}); }, FLUSH_MS);
  }
}

/** Parse the flat "provider|model|label|outcome" keys back into something readable. */
function shape(counts) {
  const byModel = {}, byRoute = {}, byOutcome = {}, rows = [];
  let total = 0;
  for (const [key, n] of Object.entries(counts || {})) {
    const [provider, rawModel, label, outcome] = key.split('|');
    if (!provider) continue;
    const model = String(rawModel).replace(/·/g, '.');
    total += n;
    const mk = provider + ' / ' + model;
    byModel[mk] = (byModel[mk] || 0) + n;
    byRoute[label] = (byRoute[label] || 0) + n;
    byOutcome[outcome] = (byOutcome[outcome] || 0) + n;
    rows.push({ provider, model, route: label, outcome, calls: n });
  }
  rows.sort((a, b) => b.calls - a.calls);
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
  return { total, byModel: sortObj(byModel), byRoute: sortObj(byRoute), byOutcome: sortObj(byOutcome), rows };
}

/**
 * The day's usage: what Firestore holds plus anything not yet flushed, so the
 * number is current rather than up to FLUSH_MS stale.
 */
async function snapshot(which) {
  const d = which || pacificDay();
  const counts = {};
  const doc = docFor(d);
  if (doc) {
    try {
      const snap = await doc.get();
      Object.assign(counts, (snap.exists && snap.data().counts) || {});
    } catch (e) {
      // Fall through to whatever is in memory.
    }
  }
  if (d === day) {
    for (const [key, n] of pending) {
      const k = key.replace(/\./g, '·');
      counts[k] = (counts[k] || 0) + n;
    }
  }
  return Object.assign({ day: d, pendingWrites: d === day ? pending.size : 0, lastFlushError }, shape(counts));
}

// Best effort on the way out, so a restart does not drop the last few.
process.on('beforeExit', () => { flush().catch(() => {}); });

module.exports = { record, snapshot, flush, pacificDay, classify };
