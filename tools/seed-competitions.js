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
// The list itself lives in services/competitions.js (the server syncs it on start).
const { COMPETITIONS, problems } = require('../services/competitions');

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
