/**
 * Confirms Indian cases against Indian Kanoon's own database (its paid API),
 * and links each one to the judgment itself.
 *
 *   INDIANKANOON_API_TOKEN   from api.indiankanoon.org; without it, Indian
 *                            cases fall back to the web check
 *                            (authorityVerifier.js) and nothing breaks.
 *
 * Price (Indian Kanoon's published rates, to be confirmed by the owner):
 * search ₹0.50 per request. One search per case; results are cached with the
 * rest of the verifier's results, so a landmark case is paid for once a month,
 * not once per student.
 *
 * A case counts as confirmed when a search result's title matches the case:
 * both sides' names (the parts around "v.") must appear in the title. The
 * court and decision date come from Indian Kanoon, so they are true even
 * when the suggested reporter citation is not; a citation whose year does
 * not fit the decision date is dropped rather than shown.
 *
 * NOTE: the request and response shapes follow Indian Kanoon's API as
 * documented (POST /search/?formInput=..&pagenum=0, "Authorization: Token ..",
 * JSON {docs:[{tid,title,docsource,publishdate}]}). They are parsed defensively
 * and must be checked against a live call once the token is in place.
 */
const BASE = 'https://api.indiankanoon.org';
const PRICE_INR = { search: 0.5 };

const configured = () => !!process.env.INDIANKANOON_API_TOKEN;

/** Since the server started; shown in the Pilot panel to diagnose the link. */
const stats = { lookups: 0, found: 0, notFound: 0, errors: 0, lastError: '', lastErrorAt: null, lastSample: '', missStreak: 0, paused: false };

/*
 * SAFEGUARDS, so a mismatch cannot quietly spend the credit:
 *  1. After PAUSE_AFTER searches in a row that confirm nothing (not found or
 *     an error), Indian Kanoon is paused until the next restart; cases fall
 *     back to the free web check and the Pilot panel says it is paused.
 *  2. At most MAX_PER_CHECK searches per check (one upload's case list);
 *     any further cases use the web check (applied in authorityVerifier.js).
 */
const PAUSE_AFTER = Number(process.env.INDIANKANOON_PAUSE_AFTER || 5);
const MAX_PER_CHECK = Number(process.env.INDIANKANOON_MAX_PER_UPLOAD || 6);
function miss() {
  stats.missStreak++;
  if (!stats.paused && stats.missStreak >= PAUSE_AFTER) {
    stats.paused = true;
    console.warn(`[INDIAN KANOON] paused: ${stats.missStreak} searches in a row confirmed nothing. Web check only until restart.`);
  }
}
/** Use Indian Kanoon now? Token set, and not paused by the safeguard. */
const active = () => configured() && !stats.paused;
const status = () => ({ configured: configured(), pauseAfter: PAUSE_AFTER, maxPerUpload: MAX_PER_CHECK, ...stats });

/** Words that carry no identity in a case name. */
const STOP = new Set(['the', 'of', 'and', 'v', 'vs', 'versus', 'ltd', 'limited', 'pvt', 'private', 'co', 'company', 'corporation',
  'mr', 'ms', 'dr', 'smt', 'shri', 'sri', 'm', 's', 'anr', 'ors', 'others', 'another', 'retd', 'on', 'in', 're', 'and', 'by', 'through', 'thr']);
const words = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w));

/** "A v. B" → [A words, B words]; a single-party name → [words]. */
function sides(name) {
  const parts = String(name || '').split(/\s+(?:v\.?|vs\.?|versus)\s+/i);
  return parts.slice(0, 2).map(words).filter(p => p.length);
}

/** Does an Indian Kanoon title name this case? Every side must be mostly present. */
function titleMatches(caseName, title) {
  const t = new Set(words(String(title || '').replace(/\s+on\s+\d{1,2}\s+\w+,?\s+\d{4}\s*$/i, '')));
  const ss = sides(caseName);
  if (!ss.length) return false;
  return ss.every(side => {
    const hit = side.filter(w => t.has(w)).length;
    return hit >= Math.max(1, Math.ceil(side.length * 0.6));
  });
}

const isIndianCourt = (src) => /supreme court of india|high court|tribunal|commission|indian|india/i.test(String(src || ''));
const yearOf = (s) => { const m = String(s || '').match(/\b(18|19|20)\d{2}\b/); return m ? Number(m[0]) : null; };
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function search(query, { fetchImpl = fetch } = {}) {
  const url = `${BASE}/search/?formInput=${encodeURIComponent(query)}&pagenum=0`;
  const r = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: 'Token ' + process.env.INDIANKANOON_API_TOKEN, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    const e = new Error(`Indian Kanoon ${r.status}${text ? ': ' + text.replace(/\s+/g, ' ').slice(0, 120) : ''}`);
    e.status = r.status;
    stats.errors++; stats.lastError = e.message; stats.lastErrorAt = new Date().toISOString();
    miss();
    throw e;
  }
  const raw = await r.text().catch(() => '');
  let body = {};
  try { body = JSON.parse(raw); } catch (e) {
    stats.errors++; stats.lastError = 'Reply was not JSON: ' + raw.replace(/\s+/g, ' ').slice(0, 120); stats.lastErrorAt = new Date().toISOString();
    miss();
    throw new Error(stats.lastError);
  }
  stats.lookups++;
  // A short, content-free sample of the reply's shape, to check the format.
  if (!stats.lastSample) stats.lastSample = 'keys: ' + Object.keys(body).slice(0, 8).join(',') +
    (Array.isArray(body.docs) && body.docs[0] ? ' | doc keys: ' + Object.keys(body.docs[0]).slice(0, 10).join(',') : '');
  try { require('./spend').recordFlat('indiankanoon', PRICE_INR.search); } catch (e) { /* metering is best-effort */ }
  return Array.isArray(body.docs) ? body.docs : [];
}

/**
 * One case → a verifier-shaped result ({status, foundName, foundCitation,
 * court, date, sources, url}). status is 'verified' or 'unverified'.
 */
async function confirmCase({ name, citation }, opts = {}) {
  const base = { name, citation: citation || '', status: 'unverified', sources: [] };
  const docs = await search(name, opts);
  const hit = docs.find(d => titleMatches(name, strip(d.title)) && isIndianCourt(d.docsource)) ||
              docs.find(d => titleMatches(name, strip(d.title)));
  if (!hit) { stats.notFound++; miss(); return { ...base, note: 'Not found on Indian Kanoon.' }; }
  stats.found++; stats.missStreak = 0;
  const url = `https://indiankanoon.org/doc/${encodeURIComponent(hit.tid)}/`;
  const decided = hit.publishdate || '';
  const cy = yearOf(citation), dy = yearOf(decided);
  // A reporter citation a year or more off the decision date is not trusted;
  // the court and date from Indian Kanoon are shown instead.
  const citationFits = !citation || !cy || !dy || Math.abs(cy - dy) <= 1;
  return {
    ...base,
    status: 'verified',
    source: 'indiankanoon',
    foundName: strip(hit.title).replace(/\s+on\s+\d{1,2}\s+\w+,?\s+\d{4}\s*$/i, ''),
    foundCitation: citationFits ? citation : '',
    citationDropped: !citationFits,
    court: strip(hit.docsource),
    date: decided,
    url,
    sources: [{ title: 'indiankanoon.org', url, tier: 'database' }],
  };
}

/** Which authorities to send to Indian Kanoon: Indian forum, or an Indian-looking case. */
function looksIndian(item, forum) {
  const text = `${item.name || ''} ${item.citation || ''}`;
  if (/\b(SCC|SCR|AIR|SCALE|SCC OnLine|Bom LR|All LJ|Cri LJ|Mad LJ|Ker LT|ITR)\b/.test(text)) return true;
  if (/Union of India|State of [A-Z][a-z]+|Government of India|Commissioner of Income Tax/.test(text)) return true;
  return /india|indian|high court of|supreme court of india/i.test(String(forum || ''));
}

module.exports = { configured, active, status, MAX_PER_CHECK, confirmCase, looksIndian, titleMatches, search, PRICE_INR };
