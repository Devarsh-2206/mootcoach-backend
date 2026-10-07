/**
 * Moot Calendar — when the next competition is, and what to do between now and
 * then.
 *
 * Opens from the sidebar rather than living in the stage wizard. The wizard is
 * per-moot and starts from an uploaded proposition; this is the opposite - an
 * advocate comes here BEFORE they have a proposition, to find out what is worth
 * entering. Putting it in the wizard would hide it behind the one thing they
 * have not done yet.
 *
 * Competitions come from Firestore so a new moot can be added without a
 * redeploy. See tools/seed-competitions.js for the document shape.
 */

import { currentUser, db } from '../services/firebase.js';

/* ── Milestone vocabulary ───────────────────────────────────────────────────
   Seed data carries a short `type`; the wording lives here so every
   competition reads the same and a typo in one document cannot invent a new
   kind of deadline.

   `kind` drives the visual weight and is the thing that matters to a mooter:
     hard  - miss it and you are out
     orals - the rounds themselves
     soft  - something becomes available; nothing is lost by being late
*/
const MILESTONE = {
  open:  { kind: 'soft',  label: 'Registrations open',          chip: 'Reg. opens' },
  prop:  { kind: 'soft',  label: 'Proposition released',        chip: 'Proposition out' },
  reg:   { kind: 'hard',  label: 'Registration deadline',       chip: 'Reg. closes' },
  clar:  { kind: 'hard',  label: 'Clarification requests due',  chip: 'Clarifications' },
  memo:  { kind: 'hard',  label: 'Memorial submission',         chip: 'Memorial due' },
  orals: { kind: 'orals', label: 'Oral rounds',                 chip: 'Orals' },
};

const CATEGORIES = [
  ['all', 'All'],
  ['national', 'National'],
  ['international', 'International'],
  ['intra', 'Intra-college'],
];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/* ── Date helpers. All UTC: a deadline is a calendar date, and shifting it by
      the viewer's timezone would show the wrong day to someone travelling. ── */
const D = (s) => new Date(s + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 86400000));
const diffDays = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const fmt = (s) => { const d = D(s); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const fmtShort = (s) => { const d = D(s); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
const today = () => iso(new Date());

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

/* ── State ── */
let COMPS = [];
let state = { y: 0, m: 0, sel: null, cat: 'all', view: 'month', hours: 8, open: '' };
let loadError = null;

/* ── Data ─────────────────────────────────────────────────────────────────── */

function normalise(id, raw) {
  const ms = (Array.isArray(raw.milestones) ? raw.milestones : [])
    .filter(x => x && x.d && MILESTONE[x.type])
    .map(x => ({
      type: x.type,
      kind: MILESTONE[x.type].kind,
      // A document may override the wording (an "Intra-moot selection round"
      // is still of kind orals), but never the kind.
      label: x.label || MILESTONE[x.type].label,
      chip: x.chip || MILESTONE[x.type].chip,
      d: x.d,
      time: x.time || '',
      end: x.end || '',
      tent: !!x.tent,
    }))
    .sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);

  return {
    id,
    name: raw.name || 'Untitled competition',
    short: raw.short || String(raw.name || '').split(/\s+/).slice(0, 2).join(' '),
    cat: ['national', 'international', 'intra'].includes(raw.cat) ? raw.cat : 'national',
    catLabel: raw.cat === 'international' ? 'International' : raw.cat === 'intra' ? 'Intra-college' : 'National',
    host: raw.host || '', city: raw.city || '', mode: raw.mode || '',
    subject: raw.subject || '', elig: raw.elig || '', team: raw.team || '', fee: raw.fee || '',
    verified: raw.verified || '', link: raw.link || '',
    ms,
  };
}

export async function loadCompetitions() {
  loadError = null;
  if (!db) { loadError = 'no-db'; return []; }
  try {
    const snap = await db.collection('artifacts').doc('moot.coach')
      .collection('competitions').get();
    const rows = [];
    snap.forEach(doc => {
      const c = normalise(doc.id, doc.data() || {});
      if (c.ms.length) rows.push(c);
    });
    // Soonest upcoming milestone first, so the list answers "what is next".
    const t = today();
    const nextOf = (c) => {
      const up = c.ms.filter(x => (x.end || x.d) >= t);
      return up.length ? up[0].d : '9999-12-31';
    };
    rows.sort((a, b) => nextOf(a) < nextOf(b) ? -1 : nextOf(a) > nextOf(b) ? 1 : 0);
    return rows;
  } catch (e) {
    console.error('[CALENDAR] Could not load competitions:', e && e.message);
    // A rules denial and a dropped connection look identical to the user but
    // need opposite responses: one needs the Firestore rules deployed, the
    // other genuinely does clear up on its own. Telling someone to "try again
    // in a moment" when the rule is missing sends them round in circles.
    const code = String((e && e.code) || '');
    const msg = String((e && e.message) || '');
    loadError = (code === 'permission-denied' || /insufficient permissions|PERMISSION_DENIED/i.test(msg))
      ? 'denied'
      : 'network';
    return [];
  }
}

/* ── Prep plan ───────────────────────────────────────────────────────────────
   Scheduled BACKWARDS from the memorial deadline, because that is the date
   that cannot move. Proportional rather than fixed-length: a six-week moot and
   a six-month moot both get a first read, research, drafting and a finishing
   window, in the same ratios.

   Needs a memorial deadline to anchor to; without one there is no plan to make.
*/
const TOOL_LABEL = {
  pa: 'Proposition Analysis', ii: 'Issue Workspace',
  ab: 'Argument Builder', cb: 'Advocacy Workspace', bs: 'Bench Simulator',
};

function buildPlan(mo, hoursPerWeek) {
  const t = today();
  const g = (type) => mo.ms.find(x => x.type === type);
  const prop = g('prop'), clar = g('clar'), memo = g('memo'), orals = g('orals');
  if (!memo) return null;

  const start = (prop && prop.d > t) ? prop.d : t;
  if (memo.d < start) return null;            // deadline already gone

  const span = diffDays(start, memo.d) + 1;
  let firstReadEnd = addDays(start, Math.min(3, Math.max(1, Math.round(span * 0.1))) - 1);
  const clarActive = clar && clar.d >= start;
  if (clarActive && clar.d < firstReadEnd) firstReadEnd = clar.d;

  const finishDays = span >= 20 ? 5 : Math.max(2, Math.round(span * 0.2));
  const finishStart = addDays(memo.d, -(finishDays - 1));
  const midStart = addDays(firstReadEnd, 1);
  const mid = Math.max(0, diffDays(midStart, finishStart));
  const researchEnd = mid >= 2 ? addDays(midStart, Math.max(1, Math.round(mid * 4 / 7)) - 1) : midStart;
  const draftStart = mid >= 2 ? addDays(researchEnd, 1) : midStart;
  const draftEnd = mid >= 2 ? addDays(finishStart, -1) : midStart;

  const phases = [
    { id: 'first_read', title: 'First read', s: start, e: firstReadEnd,
      tasks: [
        { t: 'Each member reads the proposition alone, twice, before any AI output' },
        { t: 'Compare your own reading against the issue map', tool: 'pa' },
        { t: 'Agree the issues, the side and the theory of the case as a team' },
      ].concat(clarActive ? [{ t: 'Submit clarification questions', due: fmt(clar.d) }] : []),
      check: 'Everyone can state each issue, and your answer to it, in one line without notes.' },
    { id: 'research', title: 'Research', s: midStart, e: researchEnd,
      tasks: [
        { t: 'One owner per issue' },
        { t: 'Collect the starting authorities and the counter-authority', tool: 'ii' },
        { t: 'Verify every authority on SCC Online or Manupatra: full judgment, right paragraph, still good law' },
      ].concat(clar ? [{ t: 'Re-check the issues once clarifications are released', tool: 'pa' }] : []),
      check: 'Every authority you will cite has been read in full and verified by a teammate.' },
    { id: 'drafting', title: 'Drafting', s: draftStart, e: draftEnd,
      tasks: [
        { t: 'Check the rulebook on AI use, word limits and format before writing a line' },
        { t: 'Write the memorial in your own words, issue by issue' },
        { t: 'Stress-test each argument against its strongest counter', tool: 'ab' },
      ],
      check: 'A full draft exists, and every argument survives its strongest counter.' },
    { id: 'finishing', title: 'Finishing', s: finishStart, e: memo.d,
      tasks: [
        { t: 'Index of authorities, citations and cross-references' },
        { t: 'Rule compliance: word count, font, page limit, cover' },
        { t: 'Proofread by someone who did not write that section, then a plagiarism check' },
      ],
      check: 'Submitted before the deadline. No new research in this phase.' },
  ];

  if (orals) {
    const gap = diffDays(memo.d, orals.d);
    const hasFinal = gap >= 5;
    const finalStart = hasFinal ? addDays(orals.d, -2) : null;
    const oralsPrepEnd = hasFinal ? addDays(finalStart, -1) : addDays(orals.d, -1);
    if (diffDays(addDays(memo.d, 1), oralsPrepEnd) >= 0) {
      phases.push({ id: 'orals_prep', title: 'Orals prep', s: addDays(memo.d, 1), e: oralsPrepEnd,
        tasks: [
          { t: 'Oral submissions and the speaker split', tool: 'cb' },
          { t: 'Prepare the opposite side too, if the rules require both' },
          { t: 'Daily bench sessions on both sides, against all three judges', tool: 'bs' },
          { t: 'At least two mock rounds with seniors or faculty' },
          { t: 'Compendium and rebuttal notes' },
        ],
        check: 'Three hostile bench questions per issue, on both sides, without notes.' });
    }
    if (hasFinal) {
      phases.push({ id: 'final', title: 'Final two days', s: finalStart, e: addDays(orals.d, -1),
        tasks: [
          { t: 'Light run-throughs only. No new research' },
          { t: 'Travel, documents, compendium copies' },
          { t: 'Rest' },
        ],
        check: 'Arrive rested, with a 30-second summary of each issue.' });
    }
  }

  return phases.map((p, i) => {
    const days = Math.max(1, diffDays(p.s, p.e) + 1);
    return Object.assign({}, p, {
      n: String(i + 1).padStart(2, '0'),
      range: p.s === p.e ? fmtShort(p.s) : fmtShort(p.s) + ' – ' + fmtShort(p.e),
      days,
      hrs: Math.max(1, Math.round(days / 7 * hoursPerWeek)),
      past: p.e < t,
    });
  });
}

/* ── .ics export ─────────────────────────────────────────────────────────────
   A downloaded file rather than a Google Calendar link: it imports into Google,
   Apple and Outlook alike, and needs no OAuth or account connection.
*/
function icsFor(mo) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const fold = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MootCoach//Moot Calendar//EN', 'CALSCALE:GREGORIAN',
  ];
  mo.ms.forEach((x, i) => {
    const startD = x.d.replace(/-/g, '');
    // DTEND is exclusive for all-day events, so a single day ends the next day.
    const endD = (x.end ? addDays(x.end, 1) : addDays(x.d, 1)).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + mo.id + '-' + x.type + '-' + i + '@mootcoach',
      'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + startD,
      'DTEND;VALUE=DATE:' + endD,
      'SUMMARY:' + fold(mo.name + ' — ' + x.label + (x.time ? ' (' + x.time + ')' : '')),
      'DESCRIPTION:' + fold([mo.host, mo.city, x.tent ? 'Dates tentative — confirm with the organisers' : '']
        .filter(Boolean).join(' · ')),
      x.kind === 'hard' ? 'BEGIN:VALARM\nTRIGGER:-P3D\nACTION:DISPLAY\nDESCRIPTION:' + fold(mo.name + ' — ' + x.label + ' in 3 days') + '\nEND:VALARM' : '',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

function downloadIcs(mo) {
  const blob = new Blob([icsFor(mo)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = mo.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/* ── Rendering ──────────────────────────────────────────────────────────────*/

const MONO = "font-family:'IBM Plex Mono',monospace;";

function kindStyle(kind) {
  if (kind === 'hard') return 'background:var(--gold);color:#FFF8F0;border:1px solid var(--gold);';
  if (kind === 'orals') return 'background:var(--ink);color:var(--paper);border:1px solid var(--ink);';
  return 'background:transparent;color:var(--white-2);border:1px dashed var(--glass-b);';
}

function nextHardDeadline() {
  const t = today();
  let best = null;
  COMPS.forEach(mo => mo.ms.forEach(x => {
    if (x.kind === 'hard' && x.d >= t && (!best || x.d < best.x.d)) best = { mo, x };
  }));
  return best;
}

function renderBanner() {
  const b = nextHardDeadline();
  if (!b) return '';
  const days = diffDays(today(), b.x.d);
  const rel = days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days';
  return `
    <button type="button" data-pick="${esc(b.mo.id)}" data-go="${esc(b.x.d)}"
      style="display:block;width:100%;text-align:left;cursor:pointer;border:1px solid var(--gold);
             background:var(--glass);padding:12px 15px;margin-bottom:16px;">
      <span style="display:inline-block;${MONO}font-size:11px;letter-spacing:.1em;text-transform:uppercase;
            color:#FFF8F0;background:var(--gold);padding:2px 8px;">Next deadline · ${esc(rel)}</span>
      <div style="font-weight:600;margin-top:7px;color:var(--white);">${esc(b.mo.name)}</div>
      <div style="font-size:.84rem;color:var(--white-muted);">${esc(b.x.label)} · ${esc(fmt(b.x.d))}${b.x.time ? ', ' + esc(b.x.time) : ''}</div>
    </button>`;
}

function renderPills() {
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;">` + CATEGORIES.map(([v, label]) => {
    const on = state.cat === v;
    return `<button type="button" data-cat="${v}" aria-pressed="${on}"
      style="min-height:40px;padding:0 15px;cursor:pointer;${MONO}font-size:12px;
             border:1px solid var(--glass-b);
             ${on ? 'background:var(--ink);color:var(--paper);' : 'background:transparent;color:var(--white-2);'}">${label}</button>`;
  }).join('') + `</div>`;
}

function visibleComps() {
  return COMPS.filter(c => state.cat === 'all' || c.cat === state.cat);
}

/** date -> chips, expanding multi-day events across each day they cover. */
function chipsByDate() {
  const map = {};
  visibleComps().forEach(mo => mo.ms.forEach(x => {
    const n = x.end ? diffDays(x.d, x.end) + 1 : 1;
    for (let k = 0; k < n; k++) {
      const ds = addDays(x.d, k);
      (map[ds] = map[ds] || []).push({
        id: mo.id, kind: x.kind,
        label: mo.short + ' · ' + x.chip + (n > 1 ? ' D' + (k + 1) : ''),
        aria: mo.name + ', ' + x.label + (n > 1 ? ' day ' + (k + 1) : '') + ', ' + fmt(ds),
      });
    }
  }));
  return map;
}

function renderMonth() {
  const map = chipsByDate();
  const t = today();
  const first = iso(new Date(Date.UTC(state.y, state.m, 1)));
  const dow = (D(first).getUTCDay() + 6) % 7;          // Monday-first
  const start = addDays(first, -dow);
  const dim = new Date(Date.UTC(state.y, state.m + 1, 0)).getUTCDate();
  const total = Math.ceil((dow + dim) / 7) * 7;

  const head = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d =>
    `<div style="${MONO}font-size:11px;letter-spacing:.08em;text-transform:uppercase;
          color:var(--white-muted);padding:6px 4px;">${d}</div>`).join('');

  let cells = '';
  for (let i = 0; i < total; i++) {
    const ds = addDays(start, i);
    const d = D(ds);
    const inMonth = d.getUTCMonth() === state.m;
    const isToday = ds === t;
    const chips = (map[ds] || []).map(c =>
      `<button type="button" data-pick="${esc(c.id)}" aria-label="${esc(c.aria)}"
        style="display:block;width:100%;text-align:left;${MONO}font-size:11px;line-height:1.3;
               padding:3px 5px;cursor:pointer;white-space:normal;${kindStyle(c.kind)}
               ${c.id === state.sel ? 'outline:2px solid var(--white);outline-offset:1px;' : ''}">${esc(c.label)}</button>`
    ).join('');
    cells += `<div style="min-height:92px;padding:6px;display:flex;flex-direction:column;gap:3px;
                   background:${inMonth ? 'transparent' : 'var(--glass)'};border:1px solid var(--glass-b);">
        <span style="${MONO}font-size:12px;align-self:flex-start;padding:0 4px;
              ${isToday ? 'background:var(--gold);color:#FFF8F0;' : inMonth ? 'color:var(--white-2);' : 'color:var(--white-muted);opacity:.6;'}">${d.getUTCDate()}</span>
        ${chips}
      </div>`;
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:0 2px;">${head}</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">${cells}</div>`;
}

function renderList() {
  const t = today();
  const rows = [];
  visibleComps().forEach(mo => mo.ms.forEach(x => {
    if ((x.end || x.d) >= t) rows.push({ mo, x });
  }));
  rows.sort((a, b) => a.x.d < b.x.d ? -1 : a.x.d > b.x.d ? 1 : 0);
  if (!rows.length) {
    return `<div style="padding:30px;text-align:center;color:var(--white-muted);font-size:.86rem;">
      No upcoming dates in this category.</div>`;
  }

  let out = '', lastMonth = '';
  rows.forEach(({ mo, x }) => {
    const d = D(x.d);
    const mk = MONTH_FULL[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    if (mk !== lastMonth) {
      lastMonth = mk;
      out += `<h3 style="margin:16px 0 6px;${MONO}font-size:12px;font-weight:500;letter-spacing:.1em;
              text-transform:uppercase;color:var(--white-muted);">${esc(mk)}</h3>`;
    }
    const rel = diffDays(t, x.d);
    const hard = x.kind === 'hard';
    out += `
      <button type="button" data-pick="${esc(mo.id)}"
        style="display:flex;gap:12px;align-items:center;width:100%;text-align:left;cursor:pointer;
               padding:10px 4px;background:transparent;border:none;border-bottom:1px solid var(--glass-b);">
        <span style="width:44px;flex:none;display:flex;flex-direction:column;align-items:center;">
          <span style="font-family:var(--serif),Georgia,serif;font-size:24px;line-height:1;color:var(--white);">${d.getUTCDate()}</span>
          <span style="${MONO}font-size:10px;color:var(--white-muted);">${['MON','TUE','WED','THU','FRI','SAT','SUN'][(d.getUTCDay()+6)%7]}</span>
        </span>
        <span style="width:10px;height:10px;flex:none;border-radius:50%;box-sizing:border-box;
              ${hard ? 'background:var(--gold);' : x.kind === 'orals' ? 'background:var(--ink);' : 'border:1px dashed var(--white-muted);'}"></span>
        <span style="flex:1;min-width:0;display:flex;flex-direction:column;">
          <span style="font-weight:600;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(mo.name)}</span>
          <span style="font-size:.84rem;color:${hard ? 'var(--gold)' : 'var(--white-muted)'};">${esc(x.label)}${x.time ? ' · ' + esc(x.time) : ''}${x.tent ? ' · tentative' : ''}</span>
        </span>
        <span style="${MONO}font-size:12px;flex:none;color:${hard ? 'var(--gold)' : 'var(--white-muted)'};">${rel === 0 ? 'today' : rel + 'd'}</span>
      </button>`;
  });
  return out;
}

/**
 * Every competition, selectable.
 *
 * The month grid only offers what falls in the visible month, so a moot whose
 * first date is in November cannot be clicked while you are looking at
 * October. This makes the whole list reachable whatever month is on screen.
 */
function renderPicker() {
  const list = visibleComps();
  if (!list.length) return '';
  const t = today();
  return `<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:16px;
            padding-bottom:14px;border-bottom:1px solid var(--glass-b);">` + list.map(c => {
    const on = c.id === state.sel;
    const up = c.ms.filter(x => (x.end || x.d) >= t);
    const nx = up.length ? up[0] : null;
    return `<button type="button" data-pick="${esc(c.id)}"
      style="display:flex;gap:9px;align-items:baseline;width:100%;text-align:left;cursor:pointer;
             padding:7px 9px;border:1px solid ${on ? 'var(--gold)' : 'transparent'};
             background:${on ? 'var(--glass)' : 'transparent'};">
      <span style="flex:1;min-width:0;font-size:.84rem;color:var(--white);overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap;">${esc(c.name)}</span>
      <span style="${MONO}font-size:10px;flex:none;color:var(--white-muted);">${nx ? esc(fmtShort(nx.d)) : 'done'}</span>
    </button>`;
  }).join('') + `</div>`;
}

function renderDetail() {
  const mo = COMPS.find(c => c.id === state.sel);
  if (!mo) {
    return renderPicker() + `<div style="padding:24px 10px;text-align:center;color:var(--white-muted);font-size:.86rem;line-height:1.7;">
      Pick a competition to see its dates and a prep plan built back from the memorial deadline.</div>`;
  }
  const t = today();

  const field = (label, val) => val
    ? `<div style="display:flex;gap:10px;font-size:.8rem;line-height:1.6;margin-top:7px;">
         <span style="color:var(--white-muted);flex:0 0 84px;">${label}</span>
         <span style="color:var(--white-2);flex:1;">${esc(val)}</span></div>`
    : '';

  const dates = mo.ms.map(x => {
    const past = (x.end || x.d) < t;
    const rel = diffDays(t, x.d);
    return `
      <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--glass-b);${past ? 'opacity:.5;' : ''}">
        <span style="width:9px;height:9px;flex:none;margin-top:7px;border-radius:50%;box-sizing:border-box;
              ${x.kind === 'hard' ? 'background:var(--gold);' : x.kind === 'orals' ? 'background:var(--ink);' : 'border:1px dashed var(--white-muted);'}"></span>
        <span style="flex:1;min-width:0;">
          <span style="display:block;font-size:.86rem;color:var(--white);${past ? 'text-decoration:line-through;' : 'font-weight:500;'}">${esc(x.label)}${x.tent ? ' <span style="font-weight:400;color:var(--white-muted);">· tentative</span>' : ''}</span>
          <span style="display:block;font-size:.78rem;color:var(--white-muted);">${x.end ? esc(fmtShort(x.d) + ' – ' + fmt(x.end)) : esc(fmt(x.d) + (x.time ? ', ' + x.time : ''))}</span>
        </span>
        <span style="${MONO}font-size:11px;flex:none;color:var(--white-muted);">${past ? 'passed' : rel === 0 ? 'today' : rel > 0 ? 'in ' + rel + 'd' : 'on now'}</span>
      </div>`;
  }).join('');

  const plan = buildPlan(mo, state.hours);
  const hourPills = [4, 8, 12].map(h => {
    const on = state.hours === h;
    return `<button type="button" data-hours="${h}" aria-pressed="${on}"
      style="min-height:34px;padding:0 11px;cursor:pointer;${MONO}font-size:11px;border:1px solid var(--glass-b);
             ${on ? 'background:var(--ink);color:var(--paper);' : 'background:transparent;color:var(--white-2);'}">${h} hrs/wk</button>`;
  }).join('');

  const planHTML = !plan
    ? `<div style="font-size:.82rem;color:var(--white-muted);line-height:1.7;padding:10px 0;">
         A prep plan needs a memorial submission date to work back from. This competition has
         none recorded yet, so only the dates above are shown.</div>`
    : plan.map(p => {
        const open = state.open === p.id;
        return `
        <div style="border:1px solid var(--glass-b);margin-bottom:8px;${p.past ? 'opacity:.55;' : ''}">
          <button type="button" data-phase="${esc(p.id)}" aria-expanded="${open}"
            style="display:flex;width:100%;gap:11px;align-items:center;text-align:left;cursor:pointer;
                   background:transparent;border:none;padding:11px 13px;">
            <span style="${MONO}font-size:11px;color:var(--white-muted);flex:none;">${p.n}</span>
            <span style="flex:1;min-width:0;">
              <span style="display:block;font-size:.88rem;font-weight:500;color:var(--white);">${esc(p.title)}</span>
              <span style="display:block;${MONO}font-size:11px;color:var(--white-muted);">${esc(p.range)} · ${p.days}d · ~${p.hrs} hrs</span>
            </span>
            <span style="color:var(--white-muted);flex:none;">${open ? '▾' : '▸'}</span>
          </button>
          ${open ? `<div style="padding:0 13px 13px 13px;">
            <ul style="margin:0 0 10px;padding-left:18px;font-size:.82rem;line-height:1.75;color:var(--white-2);">
              ${p.tasks.map(tk => `<li>${esc(tk.t)}${tk.tool ? ` <span style="${MONO}font-size:10px;color:var(--gold);">[${esc(TOOL_LABEL[tk.tool])}]</span>` : ''}${tk.due ? ` <span style="${MONO}font-size:10px;color:var(--white-muted);">due ${esc(tk.due)}</span>` : ''}</li>`).join('')}
            </ul>
            <div style="font-size:.78rem;color:var(--white-muted);line-height:1.65;border-top:1px solid var(--glass-b);padding-top:9px;">
              <strong style="color:var(--white-2);font-weight:500;">Before moving on:</strong> ${esc(p.check)}</div>
          </div>` : ''}
        </div>`;
      }).join('');

  return renderPicker() + `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div style="flex:1;min-width:0;">
        <span style="${MONO}font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--white-muted);">${esc(mo.catLabel)}</span>
        <h2 style="margin:3px 0 0;font-family:var(--serif),Georgia,serif;font-size:1.5rem;font-weight:500;line-height:1.2;color:var(--white);">${esc(mo.name)}</h2>
      </div>
    </div>
    ${field('Host', mo.host)}
    ${field('Where', [mo.city, mo.mode].filter(Boolean).join(' · '))}
    ${field('Subject', mo.subject)}
    ${field('Eligibility', mo.elig)}
    ${field('Team', mo.team)}
    ${field('Fee', mo.fee)}
    ${mo.verified ? `<div style="${MONO}font-size:10px;color:var(--white-muted);margin-top:11px;">Last verified ${esc(fmt(mo.verified))} · always confirm against the brochure</div>` : ''}
    ${mo.link ? `<a href="${esc(mo.link)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;font-size:.8rem;color:var(--gold);">Official brochure →</a>` : ''}

    <h3 style="margin:20px 0 4px;${MONO}font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--white-muted);">Key dates</h3>
    ${dates}

    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
      <button type="button" id="cal-ics" style="min-height:42px;padding:0 15px;cursor:pointer;${MONO}font-size:12px;
        border:1px solid var(--glass-b);background:var(--ink);color:var(--paper);">Add to my calendar (.ics)</button>
    </div>

    <h3 style="margin:22px 0 8px;${MONO}font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--white-muted);">Your prep plan</h3>
    <div style="font-size:.78rem;color:var(--white-muted);line-height:1.65;margin-bottom:10px;">
      Worked back from the memorial deadline, which is the date that cannot move.
    </div>
    <div style="display:flex;gap:7px;margin-bottom:12px;flex-wrap:wrap;">${hourPills}</div>
    ${planHTML}`;
}

function renderBody() {
  const body = document.getElementById('cal-body');
  if (!body) return;

  if (!COMPS.length) {
    body.innerHTML = `
      <div style="padding:52px 24px;text-align:center;">
        <div style="font-size:1.6rem;opacity:.45;margin-bottom:10px;">▦</div>
        <div style="font-size:.95rem;color:var(--white);margin-bottom:8px;">
          ${loadError === 'denied' ? 'The calendar is not readable yet'
            : loadError ? 'Could not load the calendar'
            : 'No competitions listed yet'}</div>
        <div style="font-size:.84rem;color:var(--white-muted);line-height:1.72;max-width:440px;margin:0 auto;">
          ${loadError === 'denied'
            ? 'This account is not allowed to read the competition list. The Firestore rule for it has not been deployed yet \u2014 <code style="font-size:.85em;">firebase deploy --only firestore:rules</code> fixes it. Retrying will not.'
            : loadError
              ? 'The competition list could not be read just now. That is usually a connection problem \u2014 try again in a moment.'
              : 'Competitions are read from the shared list. Once one is added it appears here for every user, with its deadlines and a prep plan.'}
        </div>
      </div>`;
    return;
  }

  const viewBtn = (v, label) => {
    const on = state.view === v;
    return `<button type="button" data-view="${v}" aria-pressed="${on}"
      style="min-height:34px;padding:0 13px;cursor:pointer;${MONO}font-size:12px;border:none;
             ${on ? 'background:var(--ink);color:var(--paper);' : 'background:transparent;color:var(--white-2);'}">${label}</button>`;
  };

  body.innerHTML = `
    <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;">
      <div style="flex:1 1 560px;min-width:0;">
        ${renderBanner()}
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;">
            <button type="button" id="cal-prev" aria-label="Previous month"
              style="width:34px;height:34px;cursor:pointer;border:1px solid var(--glass-b);background:transparent;color:var(--white-2);">‹</button>
            <span style="font-family:var(--serif),Georgia,serif;font-size:1.15rem;color:var(--white);min-width:160px;text-align:center;">${MONTH_FULL[state.m]} ${state.y}</span>
            <button type="button" id="cal-next" aria-label="Next month"
              style="width:34px;height:34px;cursor:pointer;border:1px solid var(--glass-b);background:transparent;color:var(--white-2);">›</button>
          </div>
          <div style="display:flex;border:1px solid var(--glass-b);">${viewBtn('month', 'Month')}${viewBtn('list', 'List')}</div>
        </div>
        <div style="margin-bottom:12px;">${renderPills()}</div>
        ${state.view === 'month' ? renderMonth() : renderList()}
      </div>
      <div style="flex:1 1 360px;min-width:0;border-left:1px solid var(--glass-b);padding-left:20px;" id="cal-detail">
        ${renderDetail()}
      </div>
    </div>`;

  wire(body);
}

function wire(body) {
  body.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    state.sel = b.getAttribute('data-pick');
    const go = b.getAttribute('data-go');
    if (go) { const d = D(go); state.y = d.getUTCFullYear(); state.m = d.getUTCMonth(); }
    state.open = '';
    renderBody();
  }));
  body.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
    state.cat = b.getAttribute('data-cat'); renderBody();
  }));
  body.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    state.view = b.getAttribute('data-view'); renderBody();
  }));
  body.querySelectorAll('[data-hours]').forEach(b => b.addEventListener('click', () => {
    state.hours = Number(b.getAttribute('data-hours')); renderBody();
  }));
  body.querySelectorAll('[data-phase]').forEach(b => b.addEventListener('click', () => {
    const id = b.getAttribute('data-phase');
    state.open = state.open === id ? '' : id;
    renderBody();
  }));
  const prev = body.querySelector('#cal-prev');
  if (prev) prev.addEventListener('click', () => {
    state.m--; if (state.m < 0) { state.m = 11; state.y--; } renderBody();
  });
  const next = body.querySelector('#cal-next');
  if (next) next.addEventListener('click', () => {
    state.m++; if (state.m > 11) { state.m = 0; state.y++; } renderBody();
  });
  const ics = body.querySelector('#cal-ics');
  if (ics) ics.addEventListener('click', () => {
    const mo = COMPS.find(c => c.id === state.sel);
    if (mo) downloadIcs(mo);
  });
}

/* ── Overlay ────────────────────────────────────────────────────────────────*/

function close() {
  const o = document.getElementById('cal-overlay');
  if (o) o.remove();
  document.removeEventListener('keydown', onEsc);
}
function onEsc(e) { if (e.key === 'Escape') close(); }

function buildOverlay() {
  const o = el(`
    <div id="cal-overlay" role="dialog" aria-modal="true" aria-label="Moot Calendar"
      style="position:fixed;inset:0;z-index:12000;background:rgba(20,16,12,.55);backdrop-filter:blur(3px);
             display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:28px 16px;">
      <div style="background:var(--navy-3);color:var(--white);max-width:1180px;width:100%;border-radius:14px;
             box-shadow:0 24px 70px rgba(0,0,0,.4);overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:15px 22px;
             background:var(--navy-2);border-bottom:1px solid var(--glass-b);">
          <div>
            <div style="${MONO}font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--white-muted);">MootCoach</div>
            <div style="font-family:var(--serif),Georgia,serif;font-size:1.3rem;">Moot Calendar</div>
          </div>
          <button id="cal-close" aria-label="Close"
            style="background:none;border:none;font-size:26px;line-height:1;cursor:pointer;color:var(--white-muted);">&times;</button>
        </div>
        <div id="cal-body" style="padding:20px 22px 26px;">
          <div style="padding:52px 24px;text-align:center;color:var(--white-muted);font-size:.86rem;">Loading competitions…</div>
        </div>
      </div>
    </div>`);
  o.addEventListener('click', e => { if (e.target === o) close(); });
  o.querySelector('#cal-close').addEventListener('click', close);
  return o;
}

export async function openMootCalendar() {
  close();
  const o = buildOverlay();
  document.body.appendChild(o);
  document.addEventListener('keydown', onEsc);

  COMPS = await loadCompetitions();

  // Open on the month of the next deadline, not on today: an advocate opening
  // this in a quiet month should still land on something.
  const b = nextHardDeadline();
  const anchor = b ? D(b.x.d) : new Date();
  state.y = anchor.getUTCFullYear();
  state.m = anchor.getUTCMonth();
  if (!state.sel || !COMPS.some(c => c.id === state.sel)) {
    state.sel = b ? b.mo.id : (COMPS[0] && COMPS[0].id) || null;
  }

  if (document.getElementById('cal-overlay')) renderBody();
}

window.openMootCalendar = openMootCalendar;
