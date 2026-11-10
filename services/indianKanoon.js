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
const stats = { lookups: 0, found: 0, notFound: 0, errors: 0, lastError: '', lastErrorAt: null, lastSample: '', missStreak: 0, paused: false, lastMisses: [] };

/*
 * SAFEGUARDS, so a mismatch cannot quietly spend the credit:
 *  1. After PAUSE_AFTER searches in a row that confirm nothing (not found or
 *     an error), Indian Kanoon is paused until the next restart; cases fall
 *     back to the free web check and the Pilot panel says it is paused.
 *  2. At most MAX_PER_CHECK searches per check (one upload's case list);
 *     any further cases use the web check (applied in authorityVerifier.js).
 */
const PAUSE_AFTER = Number(process.env.INDIANKANOON_PAUSE_AFTER || 5);
/*
 * 3. A whole-site daily ceiling on paid searches (India time), whatever any
 *    one user does: INDIANKANOON_DAILY_MAX (default 200 searches = Rs 100).
 *    Counted before each search is sent, so parallel searches cannot overshoot.
 */
const DAILY_MAX = Number(process.env.INDIANKANOON_DAILY_MAX || 200);
const daily = { day: '', count: 0 };
const istDay = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
function dailyLeft() { const d = istDay(); if (d !== daily.day) { daily.day = d; daily.count = 0; } return DAILY_MAX - daily.count; }
const MAX_PER_CHECK = Number(process.env.INDIANKANOON_MAX_PER_UPLOAD || 6);
function miss() {
  stats.missStreak++;
  if (!stats.paused && stats.missStreak >= PAUSE_AFTER) {
    stats.paused = true;
    console.warn(`[INDIAN KANOON] paused: ${stats.missStreak} searches in a row confirmed nothing. Web check only until restart.`);
  }
}
/** Use Indian Kanoon now? Token set, and not paused by the safeguard. */
const active = () => configured() && !stats.paused && dailyLeft() > 0;
const status = () => ({ configured: configured(), pauseAfter: PAUSE_AFTER, maxPerUpload: MAX_PER_CHECK, dailyMax: DAILY_MAX, usedToday: (dailyLeft(), daily.count), ...stats });

/** Words that carry no identity in a case name. */
const STOP = new Set(['the', 'of', 'and', 'v', 'vs', 'versus', 'ltd', 'limited', 'pvt', 'private', 'co', 'company', 'corporation',
  'mr', 'ms', 'dr', 'smt', 'shri', 'sri', 'm', 's', 'anr', 'ors', 'others', 'another', 'retd', 'on', 'in', 're', 'and', 'by', 'through', 'thr']);
/*
 * Indian Kanoon titles often abbreviate a party: "Shreya Singhal vs U.O.I"
 * (production, 6 Nov 2026: the only one of six cases not matched). Expand the
 * common forms before comparing.
 */
const ABBREV = [
  // Union, government, offices.
  [/\bU\.?\s?O\.?\s?I\b\.?/gi, ' union of india '],
  [/\bGovt\b\.?/gi, ' government '],
  [/\bG\.?\s?N\.?\s?C\.?\s?T\.?\s?D\b\.?/gi, ' government of nct of delhi '],
  [/\bCorpn\b\.?/gi, ' corporation '],
  [/\bComm(?:r|issr)\b\.?/gi, ' commissioner '],
  [/\bAddl\b\.?/gi, ' additional '],
  [/\bDy\b\.?/gi, ' deputy '],
  [/\bAsstt?\b\.?/gi, ' assistant '],
  [/\bSupdt\b\.?/gi, ' superintendent '],
  [/\bSecy\b\.?/gi, ' secretary '],
  [/\bDeptt?\b\.?/gi, ' department '],
  [/\bDistt?\b\.?/gi, ' district '],
  [/\bMunl?\b\.?/gi, ' municipal '],
  [/\bInsp\b\.?/gi, ' inspector '],
  [/\bAssn\b\.?|\bAssoc\b\.?/gi, ' association '],
  [/\bCo-?op\b\.?/gi, ' cooperative '],
  [/\bSoc\b\.?/gi, ' society '],
  [/\bUniv\b\.?/gi, ' university '],
  [/\bInstt?\b\.?/gi, ' institute '],
  [/\bMfg\b\.?/gi, ' manufacturing '],
  [/\bInds?\b\.(?=\s|$)/gi, ' industries '],
  [/\bBros\b\.?/gi, ' brothers '],
  // Bodies usually written as acronyms on one side and in full on the other.
  [/\bC\.?\s?I\.?\s?T\b\.?/g, ' commissioner of income tax '],
  [/\bC\.?\s?B\.?\s?I\b\.?/g, ' central bureau of investigation '],
  [/\bS\.?\s?E\.?\s?B\.?\s?I\b\.?/g, ' securities and exchange board of india '],
  [/\bR\.?\s?B\.?\s?I\b\.?/g, ' reserve bank of india '],
  [/\bP\.?\s?U\.?\s?C\.?\s?L\b\.?/g, ' peoples union for civil liberties '],
  [/\bA\.?\s?D\.?\s?M\b\.?/g, ' additional district magistrate '],
  [/\bL\.?\s?I\.?\s?C\b\.?/g, ' life insurance corporation '],
  // State abbreviations ONLY after "State of" / "Government of", so a
  // person's initials ("A.P. Shah") are never read as a state.
  [/\b((?:state|government|govt\.?)\s+of)\s+U\.\s?P\b\.?/gi, ' $1 uttar pradesh '],
  [/\b((?:state|government|govt\.?)\s+of)\s+M\.\s?P\b\.?/gi, ' $1 madhya pradesh '],
  [/\b((?:state|government|govt\.?)\s+of)\s+A\.\s?P\b\.?/gi, ' $1 andhra pradesh '],
  [/\b((?:state|government|govt\.?)\s+of)\s+H\.\s?P\b\.?/gi, ' $1 himachal pradesh '],
  [/\b((?:state|government|govt\.?)\s+of)\s+T\.\s?N\b\.?/gi, ' $1 tamil nadu '],
  [/\b((?:state|government|govt\.?)\s+of)\s+W\.\s?B\b\.?/gi, ' $1 west bengal '],
  [/\b((?:state|government|govt\.?)\s+of)\s+J\.?\s?(?:&|and)\s?K\b\.?/gi, ' $1 jammu and kashmir '],
];
const expand = (s) => ABBREV.reduce((t, [re, to]) => t.replace(re, to), String(s || ''));
const words = (s) => expand(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w));

/** "A v. B" → [A words, B words]; a single-party name → [words]. */
function sides(name) {
  const parts = expand(name).split(/\s+(?:v\.?|vs\.?|v\/s\.?|versus)\s+/i);
  return parts.slice(0, 2).map(words).filter(p => p.length);
}

/** Does an Indian Kanoon title name this case? Every side must be mostly present. */
function titleMatches(caseName, title) {
  const t = new Set(words(String(title || '').replace(/\s+on\s+\d{1,2}\s+\w+,?\s+\d{4}\s*$/i, '')));
  const ss = sides(caseName);
  if (!ss.length) return false;
  return ss.every(side => {
    // Single letters (initials) are not counted: titles write them in many ways.
    const real = side.filter(w => w.length > 1);
    const need = real.length ? real : side;
    const hit = need.filter(w => t.has(w)).length;
    // A short party name must match completely ("State of Uttar Pradesh" is not
    // "State of M.P."); a long one may be abbreviated in the title, so 60%.
    return need.length <= 3 ? hit === need.length : hit >= Math.ceil(need.length * 0.6);
  });
}

const isIndianCourt = (src) => /supreme court of india|high court|tribunal|commission|indian|india/i.test(String(src || ''));
const yearOf = (s) => { const m = String(s || '').match(/\b(18|19|20)\d{2}\b/); return m ? Number(m[0]) : null; };
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/*
 * How a case is searched. A plain search runs over the FULL TEXT of every
 * document, so "Shreya Singhal v. Union of India" returned Section 66A of the
 * IT Act and judgments that cite Shreya Singhal, never the judgment itself
 * (production, 6 Nov 2026: 9 searches, 1 match). So the search is aimed at
 * TITLES, using the most distinctive party name, and at the Supreme Court
 * when the citation is a Supreme Court report.
 *
 * "title:" and "doctypes:" are documented by Indian Kanoon (API documentation,
 * Search API parameters): title: matches words in a document's title;
 * doctypes: supremecourt limits to the Supreme Court, and doctypes: judgments
 * to judgments of all courts (no Acts or Rules, which a plain search returned,
 * e.g. "Section 66A in The Information Technology Act"). Charged per page of
 * results; one page is fetched. INDIANKANOON_QUERY=plain restores the old search.
 */
const GENERIC = new Set(['for', 'to', 'a', 'an', 'with', 'from', 'additional', 'deputy', 'assistant', 'superintendent', 'inspector', 'income', 'tax', 'central', 'bureau', 'investigation', 'securities', 'exchange', 'reserve', 'bank', 'life', 'insurance', 'police', 'station', 'union', 'india', 'state', 'government', 'commissioner', 'collector', 'municipal', 'corporation',
  'district', 'magistrate', 'secretary', 'director', 'officer', 'board', 'authority', 'council', 'republic', 'people',
  'peoples', 'public', 'prosecutor', 'kerala', 'bihar', 'maharashtra', 'karnataka', 'rajasthan', 'madhya', 'pradesh',
  'uttar', 'tamil', 'nadu', 'west', 'bengal', 'punjab', 'haryana', 'gujarat', 'delhi', 'bombay', 'andhra', 'telangana',
  'orissa', 'odisha', 'assam', 'jharkhand', 'chhattisgarh', 'uttarakhand', 'himachal', 'goa', 'manipur', 'tripura', 'nct']);
const SC_CITATION = /\bSCC\b|\bSCR\b|\bSCALE\b|\bAIR\s*\d{4}\s*SC\b|\bINSC\b|\bSCC OnLine SC\b/i;

/** Pure: the search sent to Indian Kanoon for one case. */
function buildQuery(name, citation) {
  if (String(process.env.INDIANKANOON_QUERY || '').toLowerCase() === 'plain') return String(name || '');
  const ss = sides(name);
  // The side with the most non-generic words names the case best.
  const scored = ss.map(w => w.filter(x => !GENERIC.has(x) && x.length > 1));
  const best = scored.sort((a, b) => b.length - a.length)[0] || [];
  const words = (best.length ? best : (ss[0] || [])).slice(0, 4);
  if (!words.length) return String(name || '');
  return `title: ${words.join(' ')}` + (SC_CITATION.test(String(citation || '')) ? ' doctypes: supremecourt' : ' doctypes: judgments');
}

async function search(query, { fetchImpl = fetch } = {}) {
  if (dailyLeft() <= 0) throw new Error(`Indian Kanoon daily limit reached (${DAILY_MAX} searches); using the web check until tomorrow.`);
  daily.count++;
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
  const query = buildQuery(name, citation);
  const docs = await search(query, opts);
  const named = docs.filter(d => titleMatches(name, strip(d.title)));
  const indianFirst = [...named.filter(d => isIndianCourt(d.docsource)), ...named.filter(d => !isIndianCourt(d.docsource))];
  // Many judgments share one name ("People's Union for Civil Liberties v.
  // Union of India" has dozens). With a citation year, only a judgment decided
  // within a year of it is the case meant; without one that fits, this is not a
  // confirmation (production: a 2023 citation was "confirmed" by a 2009
  // judgment of the same name and the student was sent to the wrong case).
  const wantYear = yearOf(citation);
  const hit = wantYear
    ? indianFirst.find(d => { const y = yearOf(d.publishdate) || yearOf(d.title); return y && Math.abs(y - wantYear) <= 1; })
    : indianFirst[0];
  if (!hit) {
    stats.notFound++; miss();
    // For diagnosis in the Pilot panel: what was asked, and the titles Indian
    // Kanoon returned (case titles are public; no student text is kept).
    stats.lastMisses.unshift({ query: String(name).slice(0, 80) + '  [searched: ' + String(query).slice(0, 80) + ']', results: docs.length,
      titles: docs.slice(0, 3).map(d => strip(d.title).slice(0, 120)),
      courts: docs.slice(0, 3).map(d => strip(d.docsource).slice(0, 60)) });
    stats.lastMisses = stats.lastMisses.slice(0, 3);
    return { ...base, note: named.length ? 'Judgments with this name exist on Indian Kanoon, but none from the year cited.' : 'Not found on Indian Kanoon.' };
  }
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

module.exports = { configured, active, status, MAX_PER_CHECK, confirmCase, looksIndian, titleMatches, buildQuery, search, PRICE_INR };
