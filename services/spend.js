/**
 * Estimated AI spend, per feature, for the pilot panel.
 *
 * Every Gemini call reports how many tokens it used (usageMetadata). This
 * module adds those up per feature (upload, memorial, voice round...) and
 * per backend, and turns them into an ESTIMATE in dollars and rupees using a
 * price table. It is an estimate, not the bill: Google's billing page is the
 * source of truth. The prices below are list prices as best known when this
 * was written and may be out of date; set SPEND_PRICES to correct them.
 *
 *   SPEND_PRICES   JSON, per model (or "*" for the default):
 *                  {"gemini-3.8-flash":{"in":0.3,"out":2.5}, "live":{"in":3,"out":12}}
 *                  dollars per million tokens; "live" covers the voice bench.
 *   SPEND_INR_PER_USD   default 95.23 (the trial credit: ₹28,569 for $300)
 *
 * Which feature a call belongs to comes from the request path, carried
 * through async code with AsyncLocalStorage, so nothing has to pass it along.
 * Totals are kept in memory and written to Firestore every 30 seconds, so a
 * restart loses at most that much.
 */
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

const FEATURES = {
  upload: 'Proposition upload',
  memorial: 'Memorial drafting',
  memorialReview: 'Memorial review',
  voice: 'Voice round',
  bench: 'Text bench',
  other: 'Other',
};

/** Path -> feature. Calls made after an upload (issues, authorities, forecast) count towards the upload. */
function featureForPath(p) {
  p = String(p || '');
  if (/^\/(analyze|extract-issues)\b|^\/api\/(authority-intelligence|bench-forecast)\b/.test(p)) return 'upload';
  if (/^\/api\/(memorial-plan|build-memorial|build-argument|verify-authorities)\b/.test(p)) return 'memorial';
  if (/^\/api\/analyse-memorial\b/.test(p)) return 'memorialReview';
  if (/^\/ws\/voice\b|^\/simulate-bench\/(oral-review|extract-claims)\b|^\/evaluate-oral\b|^\/api\/oral-briefing\b/.test(p)) return 'voice';
  if (/^\/simulate-bench\b/.test(p)) return 'bench';
  return 'other';
}

/** The one path per feature that counts as "one use", for the per-use average. */
function useForPath(p) {
  p = String(p || '');
  if (/^\/analyze\b/.test(p)) return 'upload';
  if (/^\/api\/build-memorial\b/.test(p)) return 'memorial';
  if (/^\/api\/analyse-memorial\b/.test(p)) return 'memorialReview';
  if (/^\/simulate-bench$/.test(p)) return 'bench';
  return null;
}

// Best-known list prices, dollars per million tokens. ESTIMATES: verify on
// Google's Vertex AI pricing page and override with SPEND_PRICES.
const DEFAULT_PRICES = {
  '*': { in: 0.30, out: 2.50 },
  'gemini-2.5-flash': { in: 0.30, out: 2.50 },
  'gemini-3.1-flash-lite': { in: 0.10, out: 0.40 },
  'gemini-3.5-flash-lite': { in: 0.10, out: 0.40 },
  live: { in: 3.00, out: 12.00 },
};

function prices() {
  let extra = {};
  try { extra = JSON.parse(process.env.SPEND_PRICES || '{}') || {}; } catch (e) { extra = {}; }
  return { ...DEFAULT_PRICES, ...extra };
}
function inrPerUsd() {
  const n = Number(process.env.SPEND_INR_PER_USD);
  return n > 0 ? n : 95.23;
}
function priceFor(model, live) {
  const t = prices();
  if (live) return t[model] || t.live || t['*'];
  return t[model] || t['*'];
}

/** Billable tokens: thinking tokens are billed as output. */
function tokensOf(u) {
  if (!u) return null;
  const input = Number(u.promptTokenCount || 0) + Number(u.toolUsePromptTokenCount || 0);
  const output = Number(u.candidatesTokenCount || u.responseTokenCount || 0) + Number(u.thoughtsTokenCount || 0);
  if (!input && !output) return null;
  return { input, output };
}

function blank() { return { calls: 0, uses: 0, input: 0, output: 0, usd: 0, vertexUsd: 0, studioUsd: 0 }; }

let totals = {};          // feature -> blank()
let models = {};          // model -> { calls, input, output, usd }
let dirty = false, since = null, loaded = false, store = null;

function bucket(f) { return totals[f] || (totals[f] = blank()); }

function add({ feature, model, backend, input, output, live = false }) {
  const f = FEATURES[feature] ? feature : 'other';
  const p = priceFor(model, live);
  const usd = (input * p.in + output * p.out) / 1e6;
  const b = bucket(f);
  b.calls++; b.input += input; b.output += output; b.usd += usd;
  if (backend === 'vertex') b.vertexUsd += usd; else b.studioUsd += usd;
  const m = models[model] || (models[model] = { calls: 0, input: 0, output: 0, usd: 0 });
  m.calls++; m.input += input; m.output += output; m.usd += usd;
  if (!since) since = new Date().toISOString();
  dirty = true;
}

/** A generateContent call finished. */
function recordCall(model, backend, response) {
  const t = tokensOf(response && response.usageMetadata);
  if (!t) return;
  add({ feature: current(), model, backend, ...t });
}

/** One use of a feature (an upload, a memorial, a voice round) succeeded. */
function recordUse(feature) {
  if (!FEATURES[feature]) return;
  bucket(feature).uses++;
  if (!since) since = new Date().toISOString();
  dirty = true;
}

/**
 * The voice bench reports usage on its messages. Whether each report is for
 * that turn or a running total for the session is not stated in the SDK's
 * types, so this tracks both readings and settles at the end: if the
 * response count never went down, the reports were running totals.
 */
function liveMeter(model, backend) {
  const seen = [];
  return {
    note(u) { const t = tokensOf(u); if (t) seen.push(t); },
    done() {
      recordUse('voice');
      if (!seen.length) return;
      const running = seen.length > 1 && seen.every((t, i) => i === 0 || (t.output >= seen[i - 1].output && t.input >= seen[i - 1].input));
      const t = running ? seen[seen.length - 1]
        : seen.reduce((a, b) => ({ input: a.input + b.input, output: a.output + b.output }), { input: 0, output: 0 });
      console.log(`[SPEND] voice round: ${seen.length} usage reports, read as ${running ? 'running totals' : 'per turn'}; ${t.input} in / ${t.output} out tokens.`);
      add({ feature: 'voice', model, backend, ...t, live: true });
    },
  };
}

function current() { const s = als.getStore(); return (s && s.feature) || 'other'; }
function run(feature, fn) { return als.run({ feature }, fn); }

/** Express middleware: tag every request's AI calls with its feature, count uses. */
function middleware(req, res, next) {
  const path = req.path;
  const use = useForPath(path);
  if (use) res.on('finish', () => { if (res.statusCode < 300) recordUse(use); });
  als.run({ feature: featureForPath(path) }, next);
}

// ---- persistence --------------------------------------------------------

function snapshot() { return { totals, models, since }; }

function attach(firestoreDoc) {
  store = firestoreDoc;
  if (!store) { loaded = true; return; }
  store.get().then(s => {
    const d = s.exists ? s.data() : null;
    if (d) {
      // Merge anything counted before the load finished.
      for (const [f, v] of Object.entries(d.totals || {})) {
        const b = bucket(f); for (const k of Object.keys(blank())) b[k] += Number(v[k] || 0);
      }
      for (const [m, v] of Object.entries(d.models || {})) {
        const b = models[m] || (models[m] = { calls: 0, input: 0, output: 0, usd: 0 });
        for (const k of Object.keys(b)) b[k] += Number(v[k] || 0);
      }
      if (d.since && (!since || d.since < since)) since = d.since;
    }
    loaded = true;
  }).catch(err => { console.error('[SPEND] load failed:', err && err.message); loaded = true; });
  const timer = setInterval(flush, 30e3);
  if (timer.unref) timer.unref();
}

function flush() {
  if (!store || !loaded || !dirty) return Promise.resolve();
  dirty = false;
  return store.set({ ...snapshot(), updatedAt: new Date().toISOString() })
    .catch(err => { dirty = true; console.error('[SPEND] save failed:', err && err.message); });
}

function reset() {
  totals = {}; models = {}; since = null; dirty = true;
  return flush();
}

/** What the admin panel shows. */
function report() {
  const rate = inrPerUsd();
  const rows = Object.keys(FEATURES).map(f => {
    const b = totals[f] || blank();
    return {
      feature: f, label: FEATURES[f], calls: b.calls, uses: b.uses,
      input: b.input, output: b.output,
      usd: b.usd, inr: b.usd * rate,
      perUseInr: b.uses ? (b.usd * rate) / b.uses : null,
      vertexInr: b.vertexUsd * rate, studioInr: b.studioUsd * rate,
    };
  }).filter(r => r.calls || r.uses);
  const usd = rows.reduce((a, r) => a + r.usd, 0);
  return {
    since, rate, rows,
    totalUsd: usd, totalInr: usd * rate,
    vertexInr: rows.reduce((a, r) => a + r.vertexInr, 0),
    studioInr: rows.reduce((a, r) => a + r.studioInr, 0),
    models: Object.entries(models).map(([model, m]) => ({ model, ...m, inr: m.usd * rate })).sort((a, b) => b.usd - a.usd),
    pricesOverridden: !!process.env.SPEND_PRICES,
  };
}

function _resetForTests() { totals = {}; models = {}; since = null; dirty = false; loaded = false; store = null; }

module.exports = {
  middleware, run, current, recordCall, recordUse, liveMeter, report, attach, flush, reset,
  featureForPath, useForPath, tokensOf, FEATURES, _resetForTests,
};
