/**
 * Ask MootCoach — one assistant that answers by calling MootCoach's own
 * capabilities as tools, after Harvey's move from bespoke orchestration to
 * "everything is a tool call".
 *
 * The model plans, calls tools, reads their results and answers. Tools are the
 * only way it learns anything about the advocate's moots, so facts in an answer
 * come from the advocate's own saved data or from a checked source, never from
 * the model's memory. Every answer reports which tools it used.
 *
 * Tools run with the signed-in user's id: they can only read that user's moots.
 * The model call is injectable so the loop can be tested offline.
 */
const { verifyAuthorities } = require('./authorityVerifier');

const MAX_STEPS = 5;
const MODELS = (process.env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-2.5-flash,gemini-3.6-flash').split(',').map(s => s.trim()).filter(Boolean);

const SYSTEM = `You are MootCoach, a moot court coach for law students. Answer the advocate's question about their own moots.
- Use the tools to find facts. Everything you know about the advocate's moots comes from read_moot, read_progress and list_moots; do not invent facts about them.
- Before you recommend or rely on a case, check it with verify_authorities. Say plainly when a case could not be found, and never present an unchecked case as good law.
- Be direct and practical, as a senior mooter would be. Short paragraphs or a few bullets. No more than about 220 words unless asked for more.
- If the tools cannot answer the question, say what is missing and what the advocate should do in MootCoach to get it.`;

/* ── tools ── */
function firestore() {
  try { const admin = require('firebase-admin'); return admin.apps.length ? admin.firestore() : null; } catch (e) { return null; }
}
const userDoc = uid => firestore().collection('artifacts').doc('moot.coach').collection('users').doc(uid);
const clip = (v, n) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; };
/** Bound a value for the model: long strings cut, long lists shortened. */
const bound = (v, depth = 0) => {
  if (typeof v === 'string') return v.length > 700 ? v.slice(0, 700) + '…' : v;
  if (Array.isArray(v)) return v.slice(0, 10).map(x => bound(x, depth + 1));
  if (v && typeof v === 'object' && depth < 4) { const o = {}; for (const k of Object.keys(v)) o[k] = bound(v[k], depth + 1); return o; }
  return v;
};

const SECTIONS = {
  summary: a => ({ summary: a.summary, mostContestableIssue: a.mostContestableIssue, oralDifficulty: a.oralDifficulty, researchDifficulty: a.researchDifficulty }),
  issues: a => ({ legalIssues: a.legalIssues, additionalIssues: a.additionalIssues, constitutionalIssues: a.constitutionalIssues, missingAngles: a.missingAngles }),
  arguments: a => ({ petitionerArguments: a.petitionerArguments, respondentArguments: a.respondentArguments, argumentDefects: a.argumentDefects }),
  authorities: a => ({ precedentsNeeded: a.precedentsNeeded }),
  bench: a => ({ benchQuestions: a.benchQuestions, benchVulnerabilities: a.benchVulnerabilities }),
};

const TOOLS = [
  {
    name: 'read_moot',
    description: "Read part of the analysis of one of the advocate's saved moots. Defaults to the moot open in the workspace.",
    parameters: { type: 'object', properties: {
      section: { type: 'string', enum: Object.keys(SECTIONS), description: 'Which part of the analysis to read.' },
      mootId: { type: 'string', description: 'Optional: a moot id from list_moots. Omit for the open moot.' },
    }, required: ['section'] },
    async run(args, ctx) {
      const id = args.mootId || ctx.mootId;
      if (!id) return { error: 'No moot is open. Ask the advocate to open one, or use list_moots.' };
      if (!firestore() || !ctx.uid) return { error: 'Saved moots are not available right now.' };
      const d = await userDoc(ctx.uid).collection('analyses').doc(String(id)).get();
      if (!d.exists) return { error: 'No such moot.' };
      const data = d.data();
      const pick = SECTIONS[args.section] || SECTIONS.summary;
      return { moot: data.mootName || 'Untitled', forum: data.detectedForum && data.detectedForum.forum, section: args.section, content: bound(pick(data.analysisData || {})) };
    },
  },
  {
    name: 'read_progress',
    description: "What the advocate has done on a moot: side and issue chosen, and the latest scores and points from rounds, the Oral Coach and Memorial Review.",
    parameters: { type: 'object', properties: { mootId: { type: 'string', description: 'Optional; defaults to the open moot.' } } },
    async run(args, ctx) {
      const id = args.mootId || ctx.mootId;
      if (!id) return { error: 'No moot is open.' };
      if (!firestore() || !ctx.uid) return { error: 'Saved progress is not available right now.' };
      const adv = userDoc(ctx.uid).collection('analyses').doc(String(id)).collection('advocacy');
      const [s, f] = await Promise.all([adv.doc('_moot_state').get(), adv.doc('_feedback').get()]);
      const st = s.exists ? s.data() : {};
      let feedback = []; try { feedback = f.exists ? JSON.parse(f.data().itemsJson || '[]') : []; } catch (e) {}
      return { side: st.stance || null, issue: st.issueText || null, results: feedback.slice(0, 6).map(x => ({ source: x.source, score: x.score, mode: x.mode, points: x.points, concerns: x.concerns })) };
    },
  },
  {
    name: 'list_moots',
    description: "List the advocate's saved moots (most recent first) with id, name, forum and hardest issue.",
    parameters: { type: 'object', properties: {} },
    async run(args, ctx) {
      if (!firestore() || !ctx.uid) return { error: 'Saved moots are not available right now.' };
      const snap = await userDoc(ctx.uid).collection('analyses').orderBy('timestamp', 'desc').limit(15).get();
      const out = [];
      snap.forEach(d => { const x = d.data(); out.push({ id: d.id, name: x.mootName, forum: x.detectedForum && x.detectedForum.forum, hardestIssue: clip((x.analysisData || {}).mostContestableIssue || '', 240) }); });
      return { moots: out };
    },
  },
  {
    name: 'verify_authorities',
    description: 'Check cases against the web. Returns verified / corrected / unverified for each, with sources. Use before recommending or relying on any case.',
    parameters: { type: 'object', properties: { authorities: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, citation: { type: 'string' } }, required: ['name'] } } }, required: ['authorities'] },
    async run(args) {
      const res = await verifyAuthorities((args.authorities || []).slice(0, 8));
      return { results: res.map(r => ({ name: r.name, status: r.status, citation: r.foundCitation || r.citation, source: (r.sources[0] || {}).title || null, note: r.note || '' })) };
    },
  },
];

/* ── model call (Gemini function calling) ── */
let ai = null;
async function geminiStep(contents) {
  if (!ai) { const { GoogleGenAI } = require('@google/genai'); ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); }
  let last;
  for (const model of MODELS) {
    try {
      const r = await ai.models.generateContent({
        model, contents,
        config: {
          systemInstruction: SYSTEM, temperature: 0.3,
          tools: [{ functionDeclarations: TOOLS.map(t => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
        },
      });
      const cand = (r.candidates || [])[0] || {};
      return { content: cand.content || { role: 'model', parts: [] }, calls: r.functionCalls || [], text: r.text || '' };
    } catch (e) { last = e; }
  }
  throw last || new Error('no model available');
}

/**
 * @param {{question:string, history?:Array<{role:'user'|'model',text:string}>, ctx:{uid?:string,mootId?:string}, step?:Function}} p
 * @returns {Promise<{answer:string, toolsUsed:Array<{name:string,args:object,ok:boolean}>}>}
 */
async function runAssistant({ question, history = [], ctx = {}, step = geminiStep }) {
  const contents = history.slice(-8).map(h => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: String(h.text || '').slice(0, 4000) }] }));
  contents.push({ role: 'user', parts: [{ text: String(question).slice(0, 2000) }] });
  const toolsUsed = [];

  for (let i = 0; i < MAX_STEPS; i++) {
    const { content, calls, text } = await step(contents);
    if (!calls || !calls.length) return { answer: text || 'I could not form an answer to that.', toolsUsed };
    contents.push(content);
    const responses = [];
    for (const call of calls) {
      const tool = TOOLS.find(t => t.name === call.name);
      let result;
      try { result = tool ? await tool.run(call.args || {}, ctx) : { error: `Unknown tool ${call.name}` }; }
      catch (e) { result = { error: String(e.message || e).slice(0, 200) }; }
      toolsUsed.push({ name: call.name, args: call.args || {}, ok: !(result && result.error) });
      responses.push({ functionResponse: { name: call.name, id: call.id, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return { answer: 'That took more steps than I allow for one question. Try asking something narrower.', toolsUsed };
}

module.exports = { runAssistant, TOOLS, SYSTEM };
