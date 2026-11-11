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
  upload: 'Proposition upload (analysis)',
  draft: 'Argument draft (Advocacy)',
  memorial: 'Full memorial (plan + build)',
  memorialReview: 'Memorial review',
  forecast: 'Bench attack forecast',
  oralCoach: 'Oral Coach (written argument)',
  authority: 'Authority cards',
  briefing: 'Chambers briefing',
  voice: 'Voice round (live judge)',
  scoresheet: 'Round scoresheet',
  bench: 'Text bench turn',
  other: 'Other',
};

/*
 * Path -> feature: one row per thing a student can actually do, so each
 * button's cost is seen on its own. The voice row is the live session only;
 * the scoresheet at the end of any round (voice or text) has its own row.
 * Verifying the authorities shown with an analysis happens on its own as the
 * analysis opens, so it counts towards the upload.
 */
const ROUTES = [
  [/^\/(analyze|extract-issues)\b|^\/api\/(verify-authorities|confirm-cases)\b/, 'upload', /^\/analyze\b/],
  [/^\/api\/build-argument\b/, 'draft', /^\/api\/build-argument\b/],
  [/^\/api\/(memorial-plan|build-memorial)\b/, 'memorial', /^\/api\/build-memorial\b/],
  [/^\/api\/analyse-memorial\b/, 'memorialReview', /^\/api\/analyse-memorial\b/],
  [/^\/api\/bench-forecast\b/, 'forecast', /^\/api\/bench-forecast\b/],
  [/^\/evaluate-oral\b/, 'oralCoach', /^\/evaluate-oral\b/],
  [/^\/api\/authority-intelligence\b/, 'authority', /^\/api\/authority-intelligence\b/],
  [/^\/api\/oral-briefing\b/, 'briefing', /^\/api\/oral-briefing\b/],
  [/^\/simulate-bench\/(oral-review|extract-claims)\b/, 'scoresheet', /^\/simulate-bench\/oral-review\b/],
  [/^\/simulate-bench\/?$/, 'bench', /^\/simulate-bench\/?$/],
  [/^\/ws\/voice\b/, 'voice', null],   // a voice round is counted when its session ends
];
function featureForPath(p) {
  p = String(p || '');
  const r = ROUTES.find(([m]) => m.test(p));
  return r ? r[1] : 'other';
}
/** The path that counts as "one use" of its feature, for the per-use figure. */
function useForPath(p) {
  p = String(p || '');
  const r = ROUTES.find(([, , u]) => u && u.test(p));
  return r ? r[1] : null;
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

function blank() { return { calls: 0, uses: 0, input: 0, output: 0, usd: 0, vertexUsd: 0, studioUsd: 0, flatUsd: 0 }; }

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

/**
 * A call priced per request rather than per token (Indian Kanoon's API).
 * Counted under the current feature, and under its own name in "By model".
 */
function recordFlat(name, inr) {
  const usd = Number(inr || 0) / inrPerUsd();
  const f = current();
  const b = bucket(FEATURES[f] ? f : 'other');
  b.calls++; b.usd += usd; b.vertexUsd += 0; b.studioUsd += 0;
  b.flatUsd = (b.flatUsd || 0) + usd;
  const m = models[name] || (models[name] = { calls: 0, input: 0, output: 0, usd: 0 });
  m.calls++; m.usd += usd;
  if (!since) since = new Date().toISOString();
  dirty = true;
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
// When a voice round reports no token usage at all (seen on 11 Nov 2026: the
// round was counted but cost nothing), its tokens are estimated from its
// length, at rates taken from earlier rounds that did report usage on this
// service (about 199k in / 20k out over five rounds of roughly six minutes).
// Rough by design; Google Cloud Billing remains the real figure.
const LIVE_EST_IN_PER_SEC = Number(process.env.SPEND_LIVE_IN_PER_SEC || 110);
const LIVE_EST_OUT_PER_SEC = Number(process.env.SPEND_LIVE_OUT_PER_SEC || 11);

function liveMeter(model, backend) {
  const seen = [];
  const started = Date.now();
  return {
    note(u) { const t = tokensOf(u); if (t) seen.push(t); },
    done() {
      recordUse('voice');
      if (!seen.length) {
        const sec = Math.max(0, (Date.now() - started) / 1000);
        if (sec < 20) return;   // connected and gone: nothing worth counting
        const est = { input: Math.round(sec * LIVE_EST_IN_PER_SEC), output: Math.round(sec * LIVE_EST_OUT_PER_SEC) };
        console.warn(`[SPEND] voice round sent no usage reports; estimated from its length (${Math.round(sec)}s): ${est.input} in / ${est.output} out tokens.`);
        add({ feature: 'voice', model, backend, ...est, live: true });
        return;
      }
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
      vertexInr: b.vertexUsd * rate, studioInr: b.studioUsd * rate, kanoonInr: (b.flatUsd || 0) * rate,
    };
  }).filter(r => r.calls || r.uses);
  const usd = rows.reduce((a, r) => a + r.usd, 0);
  return {
    since, rate, rows,
    totalUsd: usd, totalInr: usd * rate,
    vertexInr: rows.reduce((a, r) => a + r.vertexInr, 0),
    studioInr: rows.reduce((a, r) => a + r.studioInr, 0),
    kanoonInr: rows.reduce((a, r) => a + (r.kanoonInr || 0), 0),
    models: Object.entries(models).map(([model, m]) => ({ model, ...m, inr: m.usd * rate })).sort((a, b) => b.usd - a.usd),
    pricesOverridden: !!process.env.SPEND_PRICES,
  };
}

function _resetForTests() { totals = {}; models = {}; since = null; dirty = false; loaded = false; store = null; }

module.exports = {
  middleware, run, current, recordCall, recordFlat, recordUse, liveMeter, report, attach, flush, reset,
  featureForPath, useForPath, tokensOf, FEATURES, _resetForTests,
};
