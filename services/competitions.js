/**
 * The Moot Calendar's competitions: the one list the calendar shows.
 *
 * The server copies this list into Firestore when it starts
 * (services/calendarSync.js), so editing it and deploying is all it takes to
 * change what every user sees. tools/seed-competitions.js still writes it by
 * hand and checks it (--dry).
 *
 * The document shape is described in tools/seed-competitions.js.
 */
/* ────────────────────────────────────────────────────────────────────────────
   EDIT THIS LIST. Each entry is keyed by `id`, so re-running with the same id
   updates that competition rather than creating a second copy.

   Every date below was read off the organiser's own brochure, rules booklet or
   competition page. docs/competition-sources.md records which URL confirmed
   which milestone, and when it was fetched. Re-check there before editing, and
   never add a date an advocate could plan a term around without a source.
   ──────────────────────────────────────────────────────────────────────────── */
const COMPETITIONS = [
  /* ── Internationals with significant Indian participation ──────────────── */

  {
    // vismoot.org/home/34th-vis-moot/ and the vismoot.org home page, 2026-10-09.
    id: 'vis-moot-34',
    name: '34th Willem C. Vis International Commercial Arbitration Moot',
    short: 'Vis Moot',
    cat: 'international',
    city: 'Vienna',
    subject: 'International commercial arbitration (CISG)',
    verified: '2026-10-17',
    link: 'https://www.vismoot.org/home/34th-vis-moot/',
    milestones: [
      { type: 'prop',  d: '2026-10-02' },
      { type: 'reg',   d: '2026-11-12' },
      { type: 'memo',  d: '2026-12-10', label: 'Memorandum for Claimant due' },
      { type: 'memo',  d: '2027-01-21', label: 'Memorandum for Respondent due' },
      { type: 'orals', d: '2027-03-19', end: '2027-03-25' },
    ],
  },

  {
    // cisgmoot.org official "Key Dates and Times" PDF, updated 28 July 2026.
    id: 'vis-east-24',
    name: '24th Annual Willem C. Vis (East) International Commercial Arbitration Moot',
    short: 'Vis East',
    cat: 'international',
    host: 'Vis East Moot Foundation Limited',
    city: 'Hong Kong',
    subject: 'International commercial arbitration (CISG)',
    verified: '2026-10-17',
    link: 'https://cisgmoot.org/wp-content/uploads/2026/08/VEM24-Key-Dates-and-Times-as-of-27-July-2026-1.pdf',
    milestones: [
      { type: 'open',  d: '2026-09-25' },
      { type: 'prop',  d: '2026-10-02' },
      // The reissued key-dates PDF (Aug 2026) prints "Saturday, 7 November 2026",
      // correcting the "2025" typo in the July file.
      { type: 'clar',  d: '2026-11-07' },
      { type: 'reg',   d: '2026-11-12' },
      { type: 'memo',  d: '2026-12-10', label: "Claimant's Memorandum due" },
      { type: 'memo',  d: '2027-01-21', label: "Respondent's Memorandum due" },
      { type: 'orals', d: '2027-03-07', end: '2027-03-14' },
    ],
  },

  {
    // Surana & Surana official India Rounds rules (moot.in) plus Stetson's own
    // 2026-2027 International Finals rules PDF, both read 2026-10-09.
    id: 'stetson-iemcc-31-india',
    name: '31st Stetson International Environmental Moot Court Competition — Surana & Surana India Rounds',
    short: 'Stetson',
    cat: 'international',
    host: 'RGNUL Punjab with Surana & Surana',
    city: 'Patiala',
    mode: 'Offline',
    subject: 'Environmental law',
    elig: 'Teams from India and Nepal',
    team: '2 speakers + 1 researcher',
    fee: 'INR 5,900 (incl. GST)',
    verified: '2026-10-17',
    link: 'https://moot.in/moot1/case_documents/171/rules.pdf',
    milestones: [
      { type: 'open',  d: '2026-09-09' },
      { type: 'reg',   d: '2026-11-15' },
      { type: 'memo',  d: '2026-11-16', label: 'Memorial due to Stetson (17:00 EST)' },
      { type: 'memo',  d: '2026-11-17', time: '17:00', label: 'Memorial due to India Rounds' },
      { type: 'orals', d: '2026-12-03', end: '2026-12-05', label: 'India Rounds · RGNUL Punjab' },
      { type: 'orals', d: '2027-04-14', end: '2027-04-17', label: 'International Finals · Gulfport, Florida' },
    ],
  },

  {
    // iisl.space Asia-Pacific page, read 2026-10-09.
    id: 'lachs-asia-pacific-2027',
    name: 'Manfred Lachs Space Law Moot Court Competition 2027 — Asia-Pacific Regional Rounds',
    short: 'Lachs AP',
    cat: 'international',
    host: 'International Institute of Space Law with SMU Yong Pung How School of Law',
    city: 'Singapore',
    subject: 'Space law',
    fee: 'SGD 800 initial + SGD 700 post-memorial',
    verified: '2026-10-17',
    link: 'https://iisl.space/asia-pacific-manfred-lachs-space-law-moot-court-competition',
    milestones: [
      { type: 'open',  d: '2026-09-01' },
      { type: 'reg',   d: '2027-01-15', label: 'Initial registration fee due' },
      { type: 'memo',  d: '2027-02-25' },
      { type: 'orals', d: '2027-05-25', end: '2027-05-29' },
    ],
  },

  /* ── Moots hosted by Indian law schools ─────────────────────────────────── */

  {
    // kkluthramoot.org Schedule of Events 2027 and Rules of the Competition
    // 2027, read 2026-10-09. The schedule itself carries "[The dates and
    // timings are subject to change]", so every date still ahead is tentative.
    id: 'kk-luthra-2027',
    name: 'The K.K. Luthra Memorial Moot Court, 2027',
    short: 'Luthra',
    cat: 'international',
    host: 'Campus Law Centre, Faculty of Law, University of Delhi',
    city: 'New Delhi',
    mode: 'Offline',
    subject: 'Criminal law',
    elig: 'Undergraduate law students · 3-yr, 5-yr integrated or international equivalent',
    team: '2 speakers + 1 researcher, or 2 speakers only',
    fee: 'No fee',
    verified: '2026-10-17',
    link: 'https://kkluthramoot.org/wp-content/uploads/2020/12/Schedule-of-Events-2027-1.pdf',
    milestones: [
      { type: 'prop',  d: '2026-07-15' },
      { type: 'reg',   d: '2026-11-16', tent: true },
      { type: 'clar',  d: '2026-12-01', tent: true },
      { type: 'memo',  d: '2026-12-10', tent: true },
      { type: 'orals', d: '2027-02-12', end: '2027-02-14', tent: true },
    ],
  },

  {
    // Official rules PDF on moot.in (Surana & Surana), read 2026-10-09.
    id: 'surana-raffles-labour-9',
    name: '9th Surana & Surana and School of Law, Raffles University Labour Law Moot Court Competition, 2026-27',
    short: 'Labour',
    cat: 'national',
    host: 'School of Law, Raffles University with Surana & Surana',
    city: 'Online',
    mode: 'Online',
    subject: 'Labour law',
    elig: '5-yr and 3-yr LLB programmes in India',
    team: '2 speakers + 1 researcher',
    fee: 'INR 2,000',
    verified: '2026-10-17',
    link: 'https://moot.in/moot1/case_documents/170/rules.pdf',
    milestones: [
      { type: 'open',  d: '2026-09-01' },
      { type: 'clar',  d: '2026-10-15' },
      { type: 'reg',   d: '2026-10-22' },
      { type: 'memo',  d: '2026-10-30', time: '17:00' },
      { type: 'orals', d: '2026-11-13', end: '2026-11-15' },
    ],
  },

  {
    // Official brochure, "Fifteenth Edition ... 2026", read 2026-10-09.
    id: 'napmcc-15',
    name: '15th Padma Vibhushan N.A. Palkhivala Memorial National Moot Court Competition, 2026',
    short: 'Palkhivala',
    cat: 'national',
    host: 'MNLU Mumbai with AIFTP (Western Zone) and the ITAT Bar Association, Mumbai',
    city: 'Online',
    mode: 'Online',
    subject: 'Taxation law',
    fee: 'INR 3,540 (incl. GST)',
    verified: '2026-10-17',
    link: 'https://itatonline.org/digest/wp-content/uploads/2026/08/15TH-NAPMCC-BROCHURE.pdf',
    milestones: [
      { type: 'open',  d: '2026-08-08' },
      { type: 'prop',  d: '2026-08-08' },
      { type: 'clar',  d: '2026-08-26' },
      { type: 'reg',   d: '2026-09-16' },
      { type: 'memo',  d: '2026-10-01' },
      { type: 'orals', d: '2026-10-23', end: '2026-10-31' },
    ],
  },

  {
    // ICRC New Delhi (co-organiser) registration announcement, read 2026-10-09.
    id: 'henry-dunant-25-india',
    name: '25th Henry Dunant Memorial Moot Court Competition — India National Rounds',
    short: 'Dunant',
    cat: 'national',
    host: 'ICRC New Delhi with the Indian Society of International Law',
    city: 'New Delhi',
    subject: 'International humanitarian law',
    elig: 'Law students from Indian universities',
    verified: '2026-10-17',
    link: 'https://blogs.icrc.org/new-delhi/2026/07/23/opening-of-registrations-for-the-25th-henry-dunant-memorial-moot-court-competition-india-national-rounds-silver-jubilee/',
    milestones: [
      { type: 'clar',  d: '2026-08-17' },
      { type: 'reg',   d: '2026-08-17' },
      { type: 'memo',  d: '2026-09-24' },
      { type: 'orals', d: '2026-11-20', end: '2026-11-22' },
    ],
  },

  {
    // Official brochure / rules PDF on moot.in, read 2026-10-09.
    id: 'surana-upes-insolvency-9',
    name: 'IX Surana & Surana and UPES School of Law Insolvency Law Moot Court Competition, 2026',
    short: 'Insolv.',
    cat: 'national',
    host: 'UPES School of Law with Surana & Surana',
    city: 'Dehradun',
    mode: 'Offline',
    subject: 'Insolvency law',
    fee: 'INR 4,000 (+ INR 3,000 per day for the offline rounds)',
    verified: '2026-10-17',
    link: 'https://moot.in/moot1/case_documents/169/rules.pdf',
    milestones: [
      { type: 'open',  d: '2026-08-13' },
      { type: 'prop',  d: '2026-08-13' },
      { type: 'reg',   d: '2026-09-22' },
      { type: 'clar',  d: '2026-09-22', time: '23:59' },
      { type: 'memo',  d: '2026-10-05', time: '23:59' },
      { type: 'orals', d: '2026-10-30', end: '2026-11-01' },
    ],
  },

  {
    // nls.ac.in call for applications, read 2026-10-09.
    id: 'nlsiu-fintech-3',
    name: '3rd FinTech Moot Court Competition, 2026-27',
    short: 'FinTech',
    cat: 'national',
    host: 'NLSIU Bengaluru with Shardul Amarchand Mangaldas & Co',
    mode: 'Hybrid',
    subject: 'FinTech and financial regulation',
    elig: '2nd year and above · 5-yr integrated and 3-yr LLB',
    fee: 'INR 2,500 registration + INR 7,500 participation for qualifiers',
    verified: '2026-10-17',
    link: 'https://www.nls.ac.in/news-events/call-for-applications-3rd-fintech-moot-court-competition-2026-2027-by-nlsiu-and-shardul-amarchand-mangaldas/',
    milestones: [
      { type: 'prop',  d: '2026-08-22' },
      { type: 'reg',   d: '2026-08-24' },
      { type: 'clar',  d: '2026-08-29' },
      { type: 'memo',  d: '2026-09-25' },
      { type: 'orals', d: '2026-10-24', end: '2026-10-25', label: 'Virtual qualifier rounds' },
      { type: 'orals', d: '2026-11-28', end: '2026-11-29', label: 'Advanced rounds' },
    ],
  },
];

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

module.exports = { COMPETITIONS, problems, VALID_TYPES };
