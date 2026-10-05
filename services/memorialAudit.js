/**
 * Deterministic structural audit of an uploaded memorial.
 *
 * WHY THIS IS NOT LEFT TO THE MODEL
 * Half of what a memorial is marked on is mechanically checkable: whether the
 * required sections are present and in order, whether every authority in the
 * Index is actually cited in the body and vice versa, whether paragraph
 * numbering runs continuously, whether the word count is inside the limit,
 * whether counsel has slipped into the court's voice. A model asked to count
 * authorities will approximate; this counts them. The model is better spent on
 * what code cannot judge — whether the argument is any good and whether the law
 * is right.
 *
 * The section names and order come from memorials actually filed at NUALS 2025.
 */

/** Section headings, in the order a memorial must carry them. */
const SECTIONS = [
  { key: 'cover',          label: 'Cover Page',             patterns: [/memorial\s+for\s+(the\s+)?(petitioner|respondent|appellant|claimant|applicant)/i, /before\s+the\s+hon'?ble/i] },
  { key: 'contents',       label: 'Table of Contents',      patterns: [/table\s+of\s+contents?/i] },
  { key: 'abbreviations',  label: 'List of Abbreviations',  patterns: [/list\s+of\s+abbreviations?/i, /\babbreviations?\b/i] },
  { key: 'authorities',    label: 'Index of Authorities',   patterns: [/index\s+of\s+authorit/i, /table\s+of\s+authorit/i] },
  { key: 'jurisdiction',   label: 'Statement of Jurisdiction', patterns: [/statement\s+of\s+jurisdiction/i] },
  { key: 'facts',          label: 'Statement of Facts',     patterns: [/statement\s+of\s+facts?/i, /\bfacts\s+of\s+the\s+case\b/i] },
  { key: 'issues',         label: 'Issues Raised',          patterns: [/issues?\s+raised/i, /statement\s+of\s+issues?/i, /questions?\s+presented/i] },
  { key: 'summary',        label: 'Summary of Arguments',   patterns: [/summary\s+of\s+(arguments?|pleadings?)/i] },
  { key: 'arguments',      label: 'Arguments Advanced',     patterns: [/arguments?\s+advanced/i, /\bpleadings\b/i, /written\s+submissions?/i] },
  { key: 'prayer',         label: 'Prayer',                 patterns: [/\bprayer\b/i] },
];

/** Phrases that belong to the court, not to counsel. */
const JUDICIAL_VOICE = [
  /\bthe\s+petition\s+is\s+(hereby\s+)?dismissed\b/i,
  /\bthe\s+appeal\s+is\s+(hereby\s+)?(allowed|dismissed)\b/i,
  /\bthe\s+suit\s+is\s+(hereby\s+)?decreed\b/i,
  /\bwe\s+hold\s+that\b/i,
  /\bthis\s+court\s+holds\b/i,
  /\bit\s+is\s+(hereby\s+)?ordered\b/i,
  /\bwe\s+are\s+of\s+the\s+(considered\s+)?opinion\b/i,
];

/** First person — a memorial speaks as "the Petitioner", not "I" or "we argue". */
const FIRST_PERSON = [/\bI\s+(argue|submit|believe|think)\b/, /\bwe\s+(argue|believe|think)\b/i, /\bmy\s+client\b/i, /\bin\s+my\s+(view|opinion)\b/i];

/**
 * Case names are matched WITHIN a line, with [ \t] rather than \s, because \s
 * crosses newlines. On the first run that produced "INDEX OF AUTHORITIES Cases
 * Vodafone International Holdings" as a party name — the heading, the group
 * label and the actual case swallowed into one match — which then failed to
 * match the same case in the body and reported a mismatch that did not exist.
 */
const CASE_CITE = /\b([A-Z][A-Za-z.'&-]+(?:[ \t]+[A-Z][A-Za-z.'&-]+){0,6})[ \t]+v\.?s?\.?[ \t]+([A-Z][A-Za-z.'&-]+(?:[ \t]+[A-Z][A-Za-z.'&-]+){0,6})/g;

/** Headings and group labels that must never be read as a party name. */
const HEADING_WORDS = /^(index|table|list|cases?|statutes?|books?|articles?|reports?|treaties|regulations?|constitution|memorial|arguments?|statement|summary|issues?|prayer|abbreviations?|authorities|advanced|raised|contents?|international|scholarly|works?|official|circulars?|other)$/i;
const REPORTER  = /(\(\s*(?:19|20)\d{2}\s*\)\s*\d+\s*[A-Z]{2,6}\s*\d+|AIR\s+(?:19|20)\d{2}\s+[A-Z]{2,5}\s+\d+|\[\s*(?:19|20)\d{2}\s*\]\s*\d*\s*[A-Z.]{2,8}\s*\d+)/g;

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Finds where each required section starts. Headings in a memorial are on their
 * own line and usually capitalised, so a line-level match is far more reliable
 * than searching the whole blob — "statement of facts" appears inside prose too.
 */
function locateSections(text) {
  const lines = text.split(/\r?\n/);
  const found = {};
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.length > 90) return;                     // headings are short lines
    const wordy = t.split(/\s+/).length > 12;
    if (wordy) return;
    for (const sec of SECTIONS) {
      if (found[sec.key] !== undefined) continue;
      if (sec.patterns.some(p => p.test(t))) found[sec.key] = i;
    }
  });
  return found;
}

/** Pulls the Index of Authorities block, so entries can be matched to the body. */
function extractIndexBlock(text, positions) {
  const lines = text.split(/\r?\n/);
  const start = positions.authorities;
  if (start === undefined) return '';
  // Ends at whichever required section comes next.
  const laterStarts = Object.entries(positions)
    .map(([, i]) => i)
    .filter(i => i > start)
    .sort((a, b) => a - b);
  const end = laterStarts.length ? laterStarts[0] : Math.min(lines.length, start + 200);
  return lines.slice(start, end).join('\n');
}

function uniqueCases(block) {
  const out = new Map();
  for (const line of String(block || '').split(/\r?\n/)) {
    let m;
    CASE_CITE.lastIndex = 0;
    while ((m = CASE_CITE.exec(line))) {
      // Trim leading heading words off the first party — a line can begin
      // "Cases Vodafone International Holdings v. ...".
      let first = m[1].split(/[ \t]+/);
      while (first.length > 1 && HEADING_WORDS.test(first[0])) first.shift();
      if (!first.length || HEADING_WORDS.test(first[0])) continue;

      const name = `${first.join(' ')} v. ${m[2]}`.replace(/\s+/g, ' ').trim();
      // Key on the first party's leading words, stripped of corporate noise so
      // "Vodafone International Holdings" and "Vodafone International Holdings
      // B.V." land on the same key.
      const key = norm(first.join(' '))
        .replace(/\b(b v|bv|ltd|limited|pvt|private|co|inc|plc|pte|holdings?|international|company)\b/g, ' ')
        .replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
      if (key.length < 3) continue;
      if (!out.has(key)) out.set(key, name);
    }
  }
  return out;
}

/**
 * @param {string} text  The memorial, as extracted from the PDF.
 * @param {object} opts  { pageCount, wordLimit, pageLimit, side }
 */
function auditMemorial(text, opts = {}) {
  const body = String(text || '');
  const lines = body.split(/\r?\n/);
  const words = body.split(/\s+/).filter(Boolean).length;
  const positions = locateSections(body);

  const findings = [];
  const add = (severity, area, finding, fix) => findings.push({ severity, area, finding, fix });

  // ── 1. Required sections ──
  const sections = SECTIONS.map(s => ({
    key: s.key, label: s.label,
    present: positions[s.key] !== undefined,
    atLine: positions[s.key],
  }));
  for (const s of sections) {
    if (!s.present) {
      const critical = ['authorities', 'jurisdiction', 'facts', 'issues', 'arguments', 'prayer'].includes(s.key);
      add(critical ? 'critical' : 'major', 'Structure',
        `${s.label} is missing.`,
        `Add a ${s.label} section. Competitions mark structure directly, and a missing ${s.label} is a visible deduction.`);
    }
  }

  // ── 2. Order ──
  const presentInDoc = sections.filter(s => s.present).sort((a, b) => a.atLine - b.atLine);
  const expectedOrder = SECTIONS.map(s => s.key).filter(k => presentInDoc.some(p => p.key === k));
  const actualOrder = presentInDoc.map(s => s.key);
  const outOfOrder = actualOrder.filter((k, i) => k !== expectedOrder[i]);
  if (outOfOrder.length) {
    add('major', 'Structure',
      `Sections are out of the conventional order: found ${actualOrder.map(k => SECTIONS.find(s => s.key === k).label).join(' → ')}.`,
      `Reorder to: ${SECTIONS.map(s => s.label).join(' → ')}.`);
  }

  // ── 3. Index of Authorities against the body ──
  const indexBlock = extractIndexBlock(body, positions);
  const argStart = positions.arguments !== undefined ? positions.arguments : 0;
  const bodyBlock = lines.slice(argStart).join('\n');
  const indexCases = uniqueCases(indexBlock);
  const bodyCases = uniqueCases(bodyBlock);

  const notCited = [...indexCases.entries()].filter(([k]) => !bodyCases.has(k)).map(([, v]) => v);
  const notIndexed = [...bodyCases.entries()].filter(([k]) => !indexCases.has(k)).map(([, v]) => v);

  if (positions.authorities !== undefined) {
    if (notCited.length) {
      add('major', 'Authorities',
        `${notCited.length} ${notCited.length === 1 ? 'authority is' : 'authorities are'} listed in the Index but never cited in the Arguments: ${notCited.slice(0, 6).join('; ')}${notCited.length > 6 ? ' …' : ''}.`,
        'Either cite them in the body or take them out. An Index padded with uncited authorities reads as research that was never used.');
    }
    if (notIndexed.length) {
      add('critical', 'Authorities',
        `${notIndexed.length} ${notIndexed.length === 1 ? 'authority is' : 'authorities are'} cited in the Arguments but missing from the Index: ${notIndexed.slice(0, 6).join('; ')}${notIndexed.length > 6 ? ' …' : ''}.`,
        'Add them to the Index. Judges check the Index against the body, and a mismatch is the easiest mark to lose.');
    }
  }

  const reporterHits = (indexBlock.match(REPORTER) || []).length;
  const indexCaseCount = indexCases.size;
  if (indexCaseCount && reporterHits < indexCaseCount * 0.6) {
    add('major', 'Citation',
      `Only ${reporterHits} of roughly ${indexCaseCount} cases in the Index carry a full reporter reference.`,
      'Give every case its reporter citation — (2012) 6 SCC 613, AIR 1969 SC 78. A case name without a citation cannot be looked up.');
  }

  // ── 4. Paragraph numbering ──
  const paraNums = [];
  for (const line of lines.slice(argStart)) {
    const m = line.match(/^\s*(\d{1,3})[.)]\s+\S/);
    if (m) paraNums.push(Number(m[1]));
  }
  let numbering = { found: paraNums.length, continuous: true, restarts: 0 };
  for (let i = 1; i < paraNums.length; i++) {
    if (paraNums[i] !== paraNums[i - 1] + 1) {
      if (paraNums[i] <= paraNums[i - 1]) numbering.restarts++;
    }
  }
  numbering.continuous = numbering.restarts === 0 && paraNums.length > 0;
  if (!paraNums.length) {
    add('major', 'Structure',
      'The Arguments Advanced are not in numbered paragraphs.',
      'Number them continuously from 1 through the whole memorial. Advocates and judges cite these numbers in oral rounds ("as set out at paragraph 34"), and without them your memorial cannot be argued from.');
  } else if (numbering.restarts) {
    add('major', 'Structure',
      `Paragraph numbering restarts ${numbering.restarts} time${numbering.restarts > 1 ? 's' : ''} instead of running continuously.`,
      'Number straight through: if Issue I ends at 33, Issue II begins at 34.');
  }

  // ── 5. Voice ──
  const judicial = [];
  for (const p of JUDICIAL_VOICE) { const m = body.match(p); if (m) judicial.push(m[0]); }
  if (judicial.length) {
    add('critical', 'Register',
      `The memorial speaks in the court's voice: "${judicial.slice(0, 3).join('", "')}".`,
      'Counsel submits and prays; the court holds and orders. Rewrite as "it is submitted that ..." and let the Prayer ask for the relief.');
  }
  const firstPerson = [];
  for (const p of FIRST_PERSON) { const m = body.match(p); if (m) firstPerson.push(m[0]); }
  if (firstPerson.length) {
    add('minor', 'Register',
      `First person used: "${firstPerson.slice(0, 3).join('", "')}".`,
      'Write in the third person — "the Petitioner submits", not "I argue".');
  }

  // ── 6. Prayer ──
  if (positions.prayer !== undefined) {
    const prayerBlock = lines.slice(positions.prayer).join('\n');
    if (!/\bpray/i.test(prayerBlock)) {
      add('major', 'Prayer', 'The Prayer does not actually pray for anything.',
        'Open with "it is most respectfully prayed that this Hon\'ble Court may be pleased to ..." and list the relief.');
    }
    if (!/(and\s*\/?\s*or|any\s+other\s+order|deem(s)?\s+fit)/i.test(prayerBlock)) {
      add('minor', 'Prayer', 'The Prayer has no residuary clause.',
        'Close with "AND/OR pass any other order this Hon\'ble Court may deem fit in the interest of Justice, Equity and Good Conscience."');
    }
  }

  // ── 7. Limits ──
  const limits = {};
  if (opts.wordLimit) {
    limits.words = { count: words, limit: opts.wordLimit, over: words > opts.wordLimit };
    if (words > opts.wordLimit) {
      add('critical', 'Compliance',
        `The memorial runs to ${words.toLocaleString()} words against a limit of ${Number(opts.wordLimit).toLocaleString()}.`,
        `Cut ${(words - opts.wordLimit).toLocaleString()} words. Most competitions penalise or disqualify for this, and it is the one defect that costs marks before anyone reads a line.`);
    }
  }
  if (opts.pageLimit && opts.pageCount) {
    limits.pages = { count: opts.pageCount, limit: opts.pageLimit, over: opts.pageCount > opts.pageLimit };
    if (opts.pageCount > opts.pageLimit) {
      add('critical', 'Compliance',
        `The memorial runs to ${opts.pageCount} pages against a limit of ${opts.pageLimit}.`,
        'Cut it to length before you worry about anything else here.');
    }
  }

  // ── 8. Side consistency ──
  const forPet = /memorial\s+for\s+(the\s+)?(petitioner|appellant|claimant|applicant)/i.test(body);
  const forRes = /memorial\s+for\s+(the\s+)?(respondent|defendant)/i.test(body);
  if (forPet && forRes) {
    add('major', 'Cover',
      'The document calls itself a memorial for both sides in different places.',
      'Check the running header — it is a common copy-paste slip when one side is drafted from the other.');
  }

  return {
    metrics: {
      words,
      pages: opts.pageCount || null,
      sectionsPresent: sections.filter(s => s.present).length,
      sectionsExpected: SECTIONS.length,
      indexCases: indexCaseCount,
      bodyCases: bodyCases.size,
      authoritiesNotCited: notCited.length,
      authoritiesNotIndexed: notIndexed.length,
      numberedParagraphs: paraNums.length,
      numbering,
      limits,
    },
    sections,
    findings,
  };
}

module.exports = { auditMemorial, SECTIONS };
