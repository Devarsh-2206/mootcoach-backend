/**
 * Model shoot-out through OpenRouter: the same MootCoach tasks, the same
 * inputs and the same checks for every model.
 *
 *   node tools/evals/models.js --model anthropic/claude-haiku-5.5 [--runs 2] [--cap 3]
 *   node tools/evals/models.js --verify          # check every cited case on the web
 *   node tools/evals/models.js --summary         # one table across all models
 *
 * Tasks per run: full analysis of the five legal propositions in cases.js, one
 * memorial issue for an Indian and an English case (a fixed plan, so every
 * model argues the same thing), the three light jobs from light.js, and the
 * four bench scenarios. Raw answers are kept for a blind side-by-side read.
 *
 * Needs an OpenRouter key on openrouter.ai (a network secret in the sandbox).
 * --cap stops a model once its spend in this run reaches that many dollars.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const R = path.join(__dirname, '..', '..') + '/';
const CASES = require('./cases');
const light = require('./light');
const ANALYSIS_SYSTEM_PROMPT = require(R + 'prompts/analysisSystemPrompt');
const { buildForumDirective } = require(R + 'prompts/forumDirective');
const { buildIssueArgumentPrompt } = require(R + 'prompts/memorialPrompt');
const { buildJudgePrompt } = require(R + 'prompts/benchJudgePrompt');
const { resolveVoiceJudge } = require(R + 'prompts/judgePersona');

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = path.join(__dirname, 'reports', 'models');
fs.mkdirSync(OUT, { recursive: true });
const slug = m => m.replace(/[^\w.-]+/g, '_');

/* ───────────────────────── transport ───────────────────────── */
function chat(model, { system, messages, temperature = 0.2, maxTokens = 16000, json = true, plugins }) {
  const msgs = (system ? [{ role: 'system', content: system }] : []).concat(messages);
  let body = { model, messages: msgs, temperature, max_tokens: maxTokens, usage: { include: true },
    ...(json ? { response_format: { type: 'json_object' } } : {}), ...(plugins ? { plugins } : {}) };
  const t0 = Date.now();
  let last = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    let out;
    try {
      out = execFileSync('curl', ['-s', '--max-time', '420', '-X', 'POST', '-H', 'content-type: application/json',
        '--data-binary', '@-', 'https://openrouter.ai/api/v1/chat/completions'],
        { input: JSON.stringify(body), maxBuffer: 1 << 27 }).toString();
    } catch (e) { last = `curl ${e.status}`; execSync(`sleep ${10 * (attempt + 1)}`); continue; }
    let j; try { j = JSON.parse(out); } catch (e) { last = `non-JSON ${out.slice(0, 80)}`; execSync(`sleep ${10 * (attempt + 1)}`); continue; }
    if (j.error) {
      last = `${j.error.code}: ${String(j.error.message).slice(0, 160)}`;
      // Some models refuse JSON mode; the prompts already demand JSON, so drop it.
      if (body.response_format && /response_format|json/i.test(j.error.message)) { const { response_format, ...b } = body; body = b; continue; }
      if ([408, 429, 500, 502, 503, 504].includes(Number(j.error.code))) { execSync(`sleep ${15 * (attempt + 1)}`); continue; }
      break;
    }
    const ch = (j.choices || [])[0] || {};
    const msg = ch.message || {};
    const u = j.usage || {};
    return { text: msg.content || '', finish: ch.finish_reason, provider: j.provider, ms: Date.now() - t0,
      annotations: msg.annotations || [], cost: Number(u.cost || 0),
      tokens: { in: u.prompt_tokens, out: u.completion_tokens, reasoning: (u.completion_tokens_details || {}).reasoning_tokens || 0 } };
  }
  return { err: last, ms: Date.now() - t0, cost: 0, tokens: {} };
}

function parse(text) {
  const s = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
  return null;
}

/* ───────────────────────── inputs ───────────────────────── */
// The forum each proposition was written for. Production detects this first;
// fixing it here means every model drafts under the same instructions.
const FORUM = {
  'in-sc-shutdown': { forum: 'Supreme Court of India (original writ jurisdiction, Article 32)', courtLevel: 'apex', proceedingType: 'writ petition', jurisdiction: 'India', governingLaw: 'Constitution of India', adjudicatorType: 'three-judge bench', isConstitutionalMatter: true, terminology: { parties: 'Petitioner / Respondent' } },
  'in-civil-tenancy': { forum: 'Court of the Principal Civil Judge, Belagavi', courtLevel: 'trial', proceedingType: 'civil suit', jurisdiction: 'India', state: 'Karnataka', governingLaw: 'Code of Civil Procedure, 1908; Karnataka Land Reforms Act, 1961', adjudicatorType: 'single judge', isConstitutionalMatter: false, terminology: { parties: 'Plaintiffs / Defendants' } },
  'intl-hr-expression': { forum: 'Grand Chamber, Universal Court of Human Rights', courtLevel: 'international', proceedingType: 'individual application', jurisdiction: 'International', governingLaw: 'Universal Convention on Human Rights; ICCPR', adjudicatorType: 'Grand Chamber', isConstitutionalMatter: false, terminology: { parties: 'Applicant / Respondent State' } },
  'arb-sg-supply': { forum: 'SIAC arbitral tribunal (seat: Singapore)', courtLevel: 'arbitral', proceedingType: 'arbitration', jurisdiction: 'Singapore (seat); English law governs the contract', governingLaw: 'English law; SIAC Rules', adjudicatorType: 'arbitral tribunal', isConstitutionalMatter: false, terminology: { parties: 'Claimant / Respondent' } },
  'uk-jr-deportation': { forum: 'Court of Appeal (Civil Division), England and Wales', courtLevel: 'appellate', proceedingType: 'appeal (judicial review)', jurisdiction: 'United Kingdom', governingLaw: 'UK Borders Act 2007; Human Rights Act 1998; ECHR', adjudicatorType: 'three Lords Justices', isConstitutionalMatter: false, terminology: { parties: 'Appellant / Respondent' } },
};

const MEMORIAL = [
  { id: 'india', caseId: 'in-sc-shutdown', stance: 'Petitioner',
    known: [{ name: 'Anuradha Bhasin v. Union of India', citation: '(2020) 3 SCC 637' }, { name: 'Modern Dental College and Research Centre v. State of Madhya Pradesh', citation: '(2016) 7 SCC 353' }],
    wrong: /first amendment|european convention|echr\b/i,
    issue: { numeral: 'I', heading: 'THE SUSPENSION ORDER VIOLATES ARTICLES 19(1)(a) AND 19(1)(g) BECAUSE IT FAILS THE TEST OF PROPORTIONALITY',
      roadmap: 'The order was made without the safeguards the Rules require, a district-wide suspension for 74 days is not the least restrictive measure, and the restriction is not reasonable under Articles 19(2) and 19(6).',
      subGrounds: [
        { label: 'A', heading: 'The order was unpublished and the mandatory review never took place', thrust: 'Procedural safeguards under the Suspension Rules were ignored; an unpublished order cannot be challenged or reviewed.' },
        { label: 'B', heading: 'A district-wide, open-ended suspension is not the least restrictive measure', thrust: 'No material shows that targeted blocking or shorter suspensions were considered.' },
        { label: 'C', heading: 'The restriction is not a reasonable restriction under Articles 19(2) and 19(6)', thrust: 'Loss to 4,000 traders over 74 days is disproportionate to the stated aim.' }] } },
  { id: 'uk', caseId: 'uk-jr-deportation', stance: 'Appellant',
    known: [{ name: 'R (Kiarie and Byndloss) v Secretary of State for the Home Department', citation: '[2017] UKSC 42' }, { name: 'ZH (Tanzania) v Secretary of State for the Home Department', citation: '[2011] UKSC 4' }],
    wrong: /puttaswamy|maneka gandhi|article\s*21 of the constitution|supreme court of india|\bSCC\b|\bAIR\b/i,
    issue: { numeral: 'I', heading: 'THE CERTIFICATION OF THE HUMAN RIGHTS CLAIM AS CLEARLY UNFOUNDED WAS UNLAWFUL',
      roadmap: 'The Article 8 claim was not bound to fail, an out-of-country appeal is not an effective remedy on these facts, and the best interests of the child were never treated as a primary consideration.',
      subGrounds: [
        { label: 'A', heading: 'The Article 8 claim was arguable and therefore could not be certified', thrust: '21 years of lawful residence, a British partner and a British child.' },
        { label: 'B', heading: 'Removal before appeal denies an effective appeal', thrust: 'The appellant cannot give live evidence or properly instruct counsel from abroad.' },
        { label: 'C', heading: 'The best interests of the child were not a primary consideration', thrust: 'Section 55 of the Borders, Citizenship and Immigration Act 2009 and the child\'s British citizenship.' }] } },
];

function memorialUser(m) {
  const c = CASES.find(x => x.id === m.caseId);
  const f = FORUM[m.caseId];
  const context = `PROPOSITION FACTS / RECORD:\n${c.text}\n`
    + `FORUM: ${f.forum} · ${f.jurisdiction}\n`
    + `\nAUTHORITIES SELECTED BY THE ADVOCATE (must be used, marked source:"advocate"):\n`
    + m.known.map(a => `- ${a.name}, ${a.citation}`).join('\n') + '\n'
    + `\nSTANCE / SIDE: ${m.stance}\n`
    + `ADVOCATE'S NOTES: Lead with the strongest limb and meet the other side's best answer on each.\n`;
  const i = m.issue;
  const brief = `ISSUE TO ARGUE:\nNumeral: ${i.numeral}\nHeading: ${i.heading}\nRoadmap: ${i.roadmap}\n`
    + `Sub-grounds you must develop, in this order:\n` + i.subGrounds.map(s => `  ${s.label}. ${s.heading} — ${s.thrust}`).join('\n')
    + `\n\nIssues already argued (do not repeat them, but you may cross-refer):\n  none`;
  return context + '\n' + brief + '\n\nArgue this issue in full now.';
}

/* ───────────────────────── checks ───────────────────────── */
const REQUIRED_KEYS = ['summary', 'legalIssues', 'petitionerArguments', 'respondentArguments', 'precedentsNeeded', 'benchQuestions', 'mostContestableIssue'];
const issueTexts = a => (Array.isArray(a.legalIssues) ? a.legalIssues : []).concat(
  (Array.isArray(a.additionalIssues) ? a.additionalIssues : []).map(x => (x && (x.issue || x)) || '')).map(String);

function checkAnalysis(a, c) {
  const e = c.expect, ck = {};
  const missing = REQUIRED_KEYS.filter(k => a[k] == null || (Array.isArray(a[k]) && !a[k].length) || a[k] === '');
  ck['all core sections'] = !missing.length;
  const issues = issueTexts(a).join(' \n ');
  e.issues.forEach((re, n) => { ck[`issue ${n + 1} framed`] = re.test(issues); });
  ck['no wrong-forum law'] = !e.mustNotMention.test(JSON.stringify(a));
  // "No verified precedent identified: …" is the honest answer when the model
  // knows of no authority, and is not counted against it.
  const honest = p => /no verified|unverified|not identified/i.test(`${(p && p.caseName) || ''} ${(p && p.citation) || ''}`);
  const prec = (Array.isArray(a.precedentsNeeded) ? a.precedentsNeeded : []).filter(p => p && !honest(p));
  ck['authorities named and cited'] = prec.length > 0 && prec.every(p => /\bv\.?\s/i.test(p.caseName || '') && String(p.citation || '').trim());
  return { ck, cases: prec.map(p => ({ name: p.caseName || '', citation: p.citation || '' })).filter(x => x.name),
    honest: (Array.isArray(a.precedentsNeeded) ? a.precedentsNeeded : []).filter(honest).length,
    missing, issueCount: issueTexts(a).length };
}

function checkMemorial(d, m) {
  const ck = {};
  const subs = Array.isArray(d.subArguments) ? d.subArguments : [];
  const paras = subs.flatMap(s => (Array.isArray(s.paragraphs) ? s.paragraphs : []));
  const words = paras.reduce((n, p) => n + String((p && p.text) || '').split(/\s+/).filter(Boolean).length, 0);
  const withFn = paras.filter(p => Array.isArray(p.footnotes) && p.footnotes.length).length;
  const au = d.authoritiesUsed || {};
  const cases = [].concat(au.cases || [], au.internationalCases || []).filter(x => x && x.name);
  const all = JSON.stringify(d);
  ck['all 3 sub-grounds argued'] = subs.length >= 3;
  ck['15+ paragraphs'] = paras.length >= 15;
  ck['half the paragraphs footnoted'] = paras.length > 0 && withFn / paras.length >= 0.5;
  ck['both advocate authorities used'] = m.known.every(k => all.toLowerCase().includes(k.name.split(/ v\.? /i)[0].replace(/^R \(/, '').slice(0, 10).toLowerCase()));
  ck['index lists the cases cited'] = cases.length >= 2;
  ck['conclusion is a submission'] = /submit/i.test(String(d.conclusion || ''));
  ck['no wrong-forum law'] = !m.wrong.test(all);
  return { ck, cases: cases.map(x => ({ name: x.name, citation: x.citation || '' })), paragraphs: paras.length, words };
}

const BENCH_CASE = `[Forum: High Court of Karnataka — writ / quashing jurisdiction] [You are the Judges; the advocate addresses you as "My Lord/My Lady".]
Case: Kashinath & Mallappa seek to quash proceedings. A civil court granted an injunction in a tenancy dispute although the Karnataka Land Reforms Act bars civil courts from deciding tenancy questions, and the issue was pending before the Land Tribunal. Counsel appears for the petitioners.`;
const OPEN = 'My Lord, I appear for the petitioners. The Civil Court acted within its jurisdiction in granting the injunction.';
const overlap = (x, y) => {
  const A = new Set(x.toLowerCase().match(/[a-z]{4,}/g) || []), B = new Set(y.toLowerCase().match(/[a-z]{4,}/g) || []);
  if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size);
};
const BENCH = [
  { id: 'trivia', turns: [OPEN, 'What is the capital of India?'], check: r => !/new delhi|\bdelhi\b/i.test(r[1]) },
  { id: 'improper', turns: [OPEN, 'love you'], check: r => /improper|decorum|conduct|inappropriate|contempt|warn|unbecoming|dignity|serious/i.test(r[1]) },
  // "admitted"/"admission"/"accept" added: both Groq models answered "having admitted…" and failed only on wording.
  { id: 'dont-know', turns: [OPEN, "I don't know."], check: r => overlap(r[1], r[0]) < 0.7 && /concede|concession|admi(t|ssion)|accept|cannot answer|no answer|unable|then|so/i.test(r[1]) },
  { id: 'length', turns: [OPEN], check: r => r[0].trim().split(/\s+/).length <= 90 },
];

/* ───────────────────────── one model ───────────────────────── */
function runModel(model, runs, cap) {
  const dir = path.join(OUT, slug(model)); fs.mkdirSync(dir, { recursive: true });
  const rows = []; let spent = 0;
  const save = (name, text) => fs.writeFileSync(path.join(dir, name), text || '');
  const log = (task, kase, run, r, ck, extra = '') => {
    const fails = ck ? Object.entries(ck).filter(([, v]) => !v).map(([k]) => k) : ['no answer'];
    console.log(`[${model}] r${run} ${task}/${kase} ${r.err ? 'ERROR ' + r.err : fails.length ? '✗ ' + fails.join(', ') : '✓'} | ${Math.round(r.ms / 1000)}s $${(r.cost || 0).toFixed(4)} ${extra}`);
  };
  const push = (o, r) => { spent += r.cost || 0; rows.push(Object.assign(o, { model, ms: r.ms, cost: r.cost, tokens: r.tokens, provider: r.provider, finish: r.finish, err: r.err })); };
  const over = () => spent >= cap;

  for (let run = 1; run <= runs && !over(); run++) {
    for (const c of CASES.filter(x => x.expect.isLegal)) {
      if (over()) break;
      const r = chat(model, { system: ANALYSIS_SYSTEM_PROMPT, temperature: 0.1, maxTokens: 24000,
        messages: [{ role: 'user', content: `Analyze this legal proposition. Return ONLY a valid JSON object. No markdown:${buildForumDirective(FORUM[c.id])}\n\n${c.text}` }] });
      save(`r${run}-analysis-${c.id}.json`, r.text || r.err);
      const d = r.text && parse(r.text);
      const res = d ? checkAnalysis(d, c) : null;
      const ck = d ? res.ck : { 'valid JSON': false };
      push({ run, task: 'analysis', case: c.id, ck, cases: res ? res.cases : [], issueCount: res && res.issueCount }, r);
      log('analysis', c.id, run, r, ck, res ? `${res.cases.length} cases` : '');
    }
    for (const m of MEMORIAL) {
      if (over()) break;
      const r = chat(model, { system: buildIssueArgumentPrompt(1, 'issue'), temperature: 0.3, maxTokens: 24000,
        messages: [{ role: 'user', content: memorialUser(m) }] });
      save(`r${run}-memorial-${m.id}.json`, r.text || r.err);
      const d = r.text && parse(r.text);
      const res = d ? checkMemorial(d, m) : null;
      const ck = d ? res.ck : { 'valid JSON': false };
      push({ run, task: 'memorial', case: m.id, ck, cases: res ? res.cases : [], paragraphs: res && res.paragraphs, words: res && res.words }, r);
      log('memorial', m.id, run, r, ck, res ? `${res.paragraphs} paras, ${res.words} words` : '');
    }
    for (const s of light.SCEN) {
      for (const [job, [sys, user, temp]] of Object.entries(light.jobsFor(s))) {
        if (over()) break;
        const r = chat(model, { system: sys, temperature: temp, maxTokens: 12000, messages: [{ role: 'user', content: user }] });
        save(`r${run}-${job}-${s.id}.json`, r.text || r.err);
        const d = r.text && parse(r.text);
        const full = d ? light.checks[job](d, s) : null;
        const ck = full ? Object.fromEntries(Object.entries(full).filter(([k]) => !k.startsWith('_'))) : { 'valid JSON': false };
        const cases = job === 'briefing' && d ? ((d.oralAdvocacy || {}).precedents || []).filter(p => p && p.name).map(p => ({ name: p.name, citation: '' })) : [];
        push({ run, task: job, case: s.id, ck, cases }, r);
        log(job, s.id, run, r, ck);
      }
    }
    const vj = resolveVoiceJudge({ judgeId: 'in-rao' });
    const ctx = [vj.persona, BENCH_CASE].join('\n\n');
    for (const sc of BENCH) {
      if (over()) break;
      const history = [], replies = []; let r = {}, cost = 0, ms = 0;
      for (const say of sc.turns) {
        history.push({ role: 'user', content: say });
        r = chat(model, { system: buildJudgePrompt('hard', ctx, [], [], []), temperature: 0.7, maxTokens: 4000, messages: history });
        cost += r.cost || 0; ms += r.ms || 0;
        if (r.err) break;
        const o = parse(r.text); const reply = (o && o.judgeResponse) || r.text;
        replies.push(reply); history.push({ role: 'assistant', content: r.text });
      }
      const ok = !r.err && replies.length === sc.turns.length;
      const ck = ok ? { [sc.id]: sc.check(replies) } : { 'bench answered': false };
      save(`r${run}-bench-${sc.id}.txt`, replies.join('\n---\n') || r.err);
      push({ run, task: 'bench', case: sc.id, ck, cases: [] }, Object.assign({}, r, { cost, ms }));
      log('bench', sc.id, run, Object.assign({}, r, { cost, ms }), ck);
    }
  }
  fs.writeFileSync(path.join(OUT, `results-${slug(model)}.json`), JSON.stringify({ model, spent, capped: over(), rows }, null, 1));
  console.log(`[${model}] done · $${spent.toFixed(3)}${over() ? ' (stopped at the cap)' : ''}`);
}

/* ───────────────────────── citation check ───────────────────────── */
const norm = n => String(n || '').toLowerCase()
  .replace(/secretary of state for the home department/g, 'sshd').replace(/\(on the application of ([^)]*)\)/g, '($1)')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|and|of|ltd|limited|anr|ors|others)\b/g, ' ').replace(/\s+/g, ' ').trim();

function verifyAll() {
  const files = fs.readdirSync(OUT).filter(f => /^results-.*\.json$/.test(f));
  const seen = new Map();
  for (const f of files) for (const row of JSON.parse(fs.readFileSync(path.join(OUT, f))).rows) for (const c of row.cases || []) {
    const k = norm(c.name); if (k.length < 5 || !/ v /.test(` ${k} `)) continue;
    if (!seen.has(k)) seen.set(k, c);
  }
  const cachePath = path.join(OUT, 'verified.json');
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath)) : {};
  const todo = [...seen.entries()].filter(([k]) => !cache[k]);
  console.log(`${seen.size} distinct cases cited; ${todo.length} to check`);
  let spent = 0;
  for (const [k, c] of todo) {
    // The model's word alone verifies nothing: FOUND counts only with a source
    // URL that the web search actually returned.
    const r = chat('google/gemini-3.8-flash', { json: false, temperature: 0, maxTokens: 1500, plugins: [{ id: 'web', max_results: 4 }],
      messages: [{ role: 'user', content: `Is this a real, reported court judgment? "${c.name}"${c.citation ? ` cited as "${c.citation}"` : ''}.\n`
        + `Search, then answer on ONE line exactly:\nFOUND | <exact case name> | <correct citation> | <court> | <URL of a source that reports it>\n`
        + `or\nNOT_FOUND | <one-line reason>\nAnswer FOUND only if a search result is about this exact case.` }] });
    spent += r.cost || 0;
    const line = String(r.text || '').split('\n').find(l => /^(FOUND|NOT_FOUND)/.test(l.trim())) || '';
    const urls = (r.annotations || []).map(a => (a.url_citation || a).url).filter(Boolean);
    const parts = line.split('|').map(s => s.trim());
    const url = parts[4] || '';
    const backed = parts[0] === 'FOUND' && urls.some(u => url && (u === url || new URL(u).hostname === (() => { try { return new URL(url).hostname; } catch (e) { return ''; } })()));
    cache[k] = { name: c.name, citation: c.citation, status: r.err ? 'error' : backed ? 'found' : parts[0] === 'FOUND' ? 'unbacked' : 'not_found',
      found: parts[0] === 'FOUND' ? { name: parts[1], citation: parts[2], court: parts[3], url } : null, reason: parts[0] === 'NOT_FOUND' ? parts[1] : '', sources: urls.slice(0, 4) };
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
    console.log(`${cache[k].status.padEnd(9)} ${c.name.slice(0, 90)}`);
  }
  console.log(`verification spend $${spent.toFixed(3)}`);
}

/* ───────────────────────── summary ───────────────────────── */
function summary() {
  const cache = fs.existsSync(path.join(OUT, 'verified.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'verified.json'))) : {};
  const out = [];
  for (const f of fs.readdirSync(OUT).filter(f => /^results-.*\.json$/.test(f))) {
    const { model, spent, rows } = JSON.parse(fs.readFileSync(path.join(OUT, f)));
    const by = t => rows.filter(r => r.task === t || (t === 'light' && ['card', 'forecast', 'briefing'].includes(r.task)));
    const rate = rs => { const all = rs.flatMap(r => Object.values(r.ck || {})); return all.length ? `${all.filter(Boolean).length}/${all.length}` : '-'; };
    const clean = rs => `${rs.filter(r => r.ck && Object.values(r.ck).every(Boolean)).length}/${rs.length}`;
    const cited = rows.flatMap(r => r.cases || []).map(c => cache[norm(c.name)]).filter(Boolean);
    const bad = cited.filter(v => v.status === 'not_found').length, unb = cited.filter(v => v.status === 'unbacked').length;
    const mem = by('memorial').filter(r => r.words);
    out.push({ model, analysis: clean(by('analysis')), analysisChecks: rate(by('analysis')), memorial: clean(by('memorial')),
      light: clean(by('light')), bench: clean(by('bench')),
      citations: cited.length ? `${cited.filter(v => v.status === 'found').length}/${cited.length} found, ${bad} not found, ${unb} unbacked` : '-',
      memorialWords: mem.length ? Math.round(mem.reduce((n, r) => n + r.words, 0) / mem.length) : '-',
      medianSec: (() => { const t = rows.map(r => r.ms).filter(Boolean).sort((a, b) => a - b); return t.length ? Math.round(t[Math.floor(t.length / 2)] / 1000) : '-'; })(),
      errors: rows.filter(r => r.err).length, spent: `$${spent.toFixed(2)}` });
  }
  console.table(out);
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(out, null, 1));
}

if (argv.includes('--verify')) verifyAll();
else if (argv.includes('--summary')) summary();
else runModel(opt('--model'), Number(opt('--runs', 2)), Number(opt('--cap', 3)));
