#!/usr/bin/env node
/**
 * Add or update competitions in the Moot Calendar.
 *
 * The calendar reads this collection, so editing it here puts a new moot in
 * front of every user without a redeploy.
 *
 *   node tools/seed-competitions.js --dry     show what would be written
 *   node tools/seed-competitions.js           write it
 *
 * Needs the Firebase Admin credentials the server already uses. Set
 * GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON, or put
 * FIREBASE_SERVICE_ACCOUNT (the JSON itself) in .env.
 *
 * ── The document shape ──────────────────────────────────────────────────────
 *   name      the competition's full name, as the brochure writes it
 *   short     4-10 chars; this is what fits in a calendar cell
 *   cat       national | international | intra
 *   host      the organising institution
 *   city      city, or "Online"
 *   mode      Offline | Online | Hybrid
 *   subject   area of law
 *   elig      who may enter
 *   team      team composition
 *   fee       registration fee, or "No fee"
 *   verified  YYYY-MM-DD you last checked this against the brochure
 *   link      brochure URL (optional)
 *   milestones[]
 *     type    open | prop | reg | clar | memo | orals
 *             The wording and the weight come from the type, so you only give
 *             the date. A memorial deadline is always treated as hard, orals
 *             always as the rounds.
 *     d       YYYY-MM-DD
 *     time    "23:59" (optional; shown next to the date)
 *     end     YYYY-MM-DD (optional; for multi-day orals)
 *     tent    true if the date is not yet confirmed (optional)
 *     label   override the wording (optional)
 *
 * A competition needs at least one milestone to appear. It needs a `memo` for
 * the prep plan, because the plan is scheduled backwards from it.
 */

require('dotenv').config();
const admin = require('firebase-admin');

/* ────────────────────────────────────────────────────────────────────────────
   EDIT THIS LIST. Each entry is keyed by `id`, so re-running with the same id
   updates that competition rather than creating a second copy.

   The entries below are EXAMPLES with placeholder details. Replace them with
   real moots, and check every date against the official brochure before an
   advocate plans a term around it.
   ──────────────────────────────────────────────────────────────────────────── */
const COMPETITIONS = [
  {
    id: 'example-national-constitutional',
    name: '[Replace me] National Constitutional Law Moot',
    short: 'Const.',
    cat: 'national',
    host: '[Host law school]',
    city: '[City]',
    mode: 'Offline',
    subject: 'Constitutional law',
    elig: '2nd–5th year · 5-yr and 3-yr LLB',
    team: '2 speakers + 1 researcher',
    fee: '[Confirm from the brochure]',
    verified: '2026-10-07',
    link: '',
    milestones: [
      { type: 'prop',  d: '2026-11-03' },
      { type: 'reg',   d: '2026-11-13', time: '23:59' },
      { type: 'clar',  d: '2026-11-18', time: '23:59' },
      { type: 'memo',  d: '2026-12-20', time: '23:59' },
      { type: 'orals', d: '2027-01-22', end: '2027-01-24', tent: true },
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────────────── */

const VALID_TYPES = ['open', 'prop', 'reg', 'clar', 'memo', 'orals'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function problems(c) {
  const out = [];
  if (!c.id) out.push('missing id');
  if (!c.name) out.push('missing name');
  if (!['national', 'international', 'intra'].includes(c.cat)) out.push('cat must be national, international or intra');
  if (!Array.isArray(c.milestones) || !c.milestones.length) out.push('needs at least one milestone');
  (c.milestones || []).forEach((m, i) => {
    const at = 'milestone ' + (i + 1);
    if (!VALID_TYPES.includes(m.type)) out.push(at + ': type must be one of ' + VALID_TYPES.join(', '));
    if (!DATE.test(m.d || '')) out.push(at + ': d must be YYYY-MM-DD');
    if (m.end && !DATE.test(m.end)) out.push(at + ': end must be YYYY-MM-DD');
    if (m.end && m.d && m.end < m.d) out.push(at + ': end is before d');
  });
  if (c.verified && !DATE.test(c.verified)) out.push('verified must be YYYY-MM-DD');
  // Worth saying out loud rather than letting it surface as a missing plan.
  if ((c.milestones || []).every(m => m.type !== 'memo')) {
    out.push('NOTE: no memorial deadline, so this competition gets no prep plan');
  }
  return out;
}

function init() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  } else {
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS.
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}

async function main() {
  const dry = process.argv.includes('--dry');

  let bad = 0;
  COMPETITIONS.forEach(c => {
    const p = problems(c);
    const fatal = p.filter(x => !x.startsWith('NOTE:'));
    if (p.length) {
      console.log('\n  ' + (c.id || '(no id)'));
      p.forEach(x => console.log('    ' + (x.startsWith('NOTE:') ? '· ' : '! ') + x));
    }
    if (fatal.length) bad++;
  });
  if (bad) {
    console.error('\n  ' + bad + ' competition(s) have errors. Nothing written.\n');
    process.exit(1);
  }

  console.log('\n  ' + COMPETITIONS.length + ' competition(s) ready:');
  COMPETITIONS.forEach(c => {
    const next = c.milestones.map(m => m.d).sort()[0];
    console.log('    ' + c.id.padEnd(36) + ' ' + c.milestones.length + ' dates, from ' + next);
  });

  if (dry) { console.log('\n  --dry: nothing written.\n'); return; }

  init();
  const db = admin.firestore();
  const col = db.collection('artifacts').doc('moot.coach').collection('competitions');
  const batch = db.batch();
  COMPETITIONS.forEach(c => {
    const { id, ...rest } = c;
    batch.set(col.doc(id), rest, { merge: true });
  });
  await batch.commit();
  console.log('\n  Written. The calendar picks these up on next open.\n');
}

main().catch(e => { console.error('\n  Failed: ' + (e && e.message) + '\n'); process.exit(1); });
