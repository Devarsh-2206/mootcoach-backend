/**
 * The memorial as a Word document (.docx), for teams who finish their memorial
 * in Word. It follows the same conventions as the PDF export
 * (frontend/js/components/memorialPrint.js):
 *
 *   A4, 1 inch margins · Times New Roman 12pt, 1.5 lines, justified
 *   real Word footnotes, 10pt, numbered by Word in order
 *   cover unnumbered; Table of Contents to Summary of Arguments in Roman
 *   numerals; Arguments Advanced and the Prayer from 1
 *   footer: "Memorial for the <side>" left, page number right
 *
 * The Table of Contents is a Word field: Word fills in the page numbers when it
 * updates fields on opening (it asks first). The Index of Authorities has no
 * page references here; the PDF export has them.
 *
 * The browser sends the memorial already prepared (headings labelled,
 * footnotes numbered, by prepareArguments in memorialPrint.js), so the two
 * exports never disagree. Everything in it is still untrusted input: strings
 * are bounded, unknown shapes ignored, and the text goes into Word only as
 * text runs, which the library escapes.
 */
const {
  Document, Packer, Paragraph, TextRun, Footer, AlignmentType, PageNumber, NumberFormat,
  TabStopType, HeadingLevel, TableOfContents, FootnoteReferenceRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, HeightRule, VerticalAlign,
} = require('docx');

const FONT = 'Times New Roman';
const LINE = 360;                 // 1.5 lines (240 = single)
const AFTER = 160;                // 8pt after a paragraph
const TEXT_WIDTH = 9026;          // A4 (11906 twips) less two 1-inch margins

const str = (v, n = 6000) => (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '')).slice(0, n);
const arr = (v, n = 200) => (Array.isArray(v) ? v.slice(0, n) : []);
const has = v => str(v).trim() !== '';

/* Model output sometimes arrives HTML-escaped ("Equity &amp; Good Conscience"). */
function decode(s) {
  return str(s, 20000)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    // Characters Word's XML cannot hold.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

/** **bold**, *italic* and _italic_ as the drafter writes them, as Word runs.
 *  Bold first, then italics inside each piece, as the PDF export does. */
function runs(text, base = {}) {
  const out = [];
  const italics = (t, b) => {
    const re = /(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:]|$)|(^|[\s(])_(?!\s)(.+?)_(?=[\s).,;:]|$)/g;
    let last = 0; let m;
    while ((m = re.exec(t))) {
      const start = m.index + (m[1] !== undefined ? m[1] : m[3] || '').length;
      if (start > last) out.push(new TextRun({ ...b, text: t.slice(last, start) }));
      out.push(new TextRun({ ...b, text: m[2] !== undefined ? m[2] : m[4], italics: true }));
      last = re.lastIndex;
    }
    if (last < t.length) out.push(new TextRun({ ...b, text: t.slice(last) }));
  };
  decode(text).split(/\*\*(.+?)\*\*/g).forEach((piece, i) => {
    if (piece) italics(piece, i % 2 ? { ...base, bold: true } : base);
  });
  return out.length ? out : [new TextRun({ ...base, text: '' })];
}

const body = (children, extra = {}) => new Paragraph({
  children, alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, after: AFTER }, ...extra,
});
/* One paragraph per paragraph the drafter wrote. */
const prose = (text, base = {}, extra = {}) => decode(text).split(/\n\s*\n|\n/)
  .map(t => t.trim()).filter(Boolean).map(t => body(runs(t, base), extra));

/* A part's title: its own page, in a shaded, ruled box (a Heading 1, so the
   Table of Contents lists it). */
const rule = { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 4 };
function partTitle(text, { first = false, inContents = true } = {}) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 32, font: FONT })],
    heading: inContents ? HeadingLevel.HEADING_1 : undefined,
    alignment: AlignmentType.CENTER,
    pageBreakBefore: !first,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: '8C8C8C' },
    border: { top: rule, bottom: rule, left: rule, right: rule },
    spacing: { before: 0, after: 440, line: 276 },
    keepNext: true,
  });
}

function sideLabel(cp) {
  const t = `${str(cp.memorialFor)} ${str(cp.court)} ${str(cp.caseNumber)}`;
  if (/claimant|arbitra|tribunal/i.test(t)) return 'Claimant';
  if (/appellant|appeal/i.test(t)) return 'Appellant';
  if (/applicant/i.test(t)) return 'Applicant';
  return 'Petitioner';
}

/* Small capitals need mixed case to show; text that arrives all in capitals
   is recased first, as the PDF export does. */
function recase(s) {
  const t = decode(s);
  if (!/[a-z]/.test(t) && /[A-Z]{3}/.test(t)) {
    return t.toLowerCase().replace(/(^|[\s([\-'’"/])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }
  return t;
}

function cover(cp, colour, ink = '000000') {
  const line = (text, opts = {}) => new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: recase(text), smallCaps: true, bold: !!opts.bold, color: ink, size: opts.size || 24, font: FONT })],
  });
  const dbl = new Paragraph({ border: { bottom: { style: BorderStyle.DOUBLE, size: 12, color: ink, space: 1 } }, spacing: { after: 200 }, children: [] });
  const party = (name, label) => new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 7600 }],
    spacing: { after: 80 },
    children: [
      new TextRun({ text: recase(name), smallCaps: true, bold: true, color: ink, size: 23, font: FONT }),
      new TextRun({ text: `\t…${label}`, smallCaps: true, bold: true, color: ink, size: 23, font: FONT }),
    ],
  });
  const kids = [];
  if (has(cp.teamCode)) {
    kids.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: decode(cp.teamCode), color: ink, size: 22, font: FONT })] }));
  }
  kids.push(new Paragraph({ spacing: { before: 1800 }, children: [] }));
  if (has(cp.competition)) kids.push(line(cp.competition, { bold: true }));
  if (has(cp.court)) kids.push(line(cp.court, { bold: true }));
  kids.push(dbl);
  if (has(cp.caseNumber)) kids.push(line(cp.caseNumber, { size: 23 }));
  if (has(cp.provision)) kids.push(line(cp.provision, { size: 23 }));
  kids.push(dbl);
  kids.push(line('In the Matter of :', { bold: true, size: 23 }));
  kids.push(dbl);
  kids.push(party(str(cp.petitioner, 400), sideLabel(cp)));
  kids.push(line('V/S', { bold: true, size: 23 }));
  kids.push(party(str(cp.respondent, 400), 'Respondent'));
  kids.push(dbl);
  if (has(cp.memorialFor)) kids.push(line(cp.memorialFor, { bold: true }));
  kids.push(dbl);

  const frame = { style: BorderStyle.SINGLE, size: 6, color: ink };
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: [TEXT_WIDTH],
    rows: [new TableRow({
      height: { value: 13600, rule: HeightRule.EXACT },
      children: [new TableCell({
        children: kids,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: colour },
        margins: { top: 400, bottom: 400, left: 500, right: 500 },
        verticalAlign: VerticalAlign.TOP,
        borders: { top: frame, bottom: frame, left: frame, right: frame },
      })],
    })],
  });
}

const IOA_GROUPS = [
  ['cases', 'Cases'], ['internationalCases', 'International Cases'],
  ['constitutionalProvisions', 'Constitutional Provisions'], ['statutes', 'Statutes'],
  ['treatiesAndConventions', 'Treaties and Conventions'],
  ['rulesAndRegulations', 'Rules, Regulations and Circulars'],
  ['booksAndCommentaries', 'Books and Commentaries'],
  ['articlesAndReports', 'Articles and Reports'],
  ['booksAndArticles', 'Books and Articles'],
  ['mootProposition', 'Moot Proposition'], ['other', 'Other Authorities'],
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * @param {object} m       The memorial, prepared by the browser.
 * @param {object} opts    { colour, ink } the cover's colour and ink, as the PDF uses.
 * @returns {Promise<Buffer>}
 */
async function buildMemorialDocx(m, { colour, ink } = {}) {
  if (!m || typeof m !== 'object') throw new Error('No memorial to export.');
  const cp = (m.coverPage && typeof m.coverPage === 'object') ? m.coverPage : {};
  const hex = (v, d) => /^#?[0-9a-f]{6}$/i.test(str(v)) ? str(v).replace('#', '') : d;
  const fill = hex(colour, '4472C4');
  const coverInk = hex(ink, '000000');
  const side = decode(cp.memorialFor).replace(/^memorial\s+(on behalf\s+)?(of|for)\s+(the\s+)?/i, '').trim();
  const sideNice = side ? side.charAt(0).toUpperCase() + side.slice(1).toLowerCase() : '';
  const runningHead = sideNice ? `Memorial for the ${sideNice}` : 'Memorial';

  const footer = new Footer({
    children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
      children: [
        new TextRun({ text: runningHead, smallCaps: true, size: 21, color: '5A5A5A', font: FONT }),
        new TextRun({ children: ['\t', PageNumber.CURRENT], size: 22, font: FONT }),
      ],
    })],
  });
  const page = (start, formatType) => ({
    size: { width: 11906, height: 16838 },
    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, footer: 600 },
    pageNumbers: { start, formatType },
  });

  // ── Preliminary pages ──
  const pre = [];
  pre.push(partTitle('Table of Contents', { first: true, inContents: false }));
  pre.push(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }));

  const abbr = arr(m.listOfAbbreviations).filter(a => a && has(a.short));
  if (abbr.length) {
    pre.push(partTitle('List of Abbreviations'));
    const cell = (t, shade, w) => new TableCell({
      width: { size: w, type: WidthType.DXA },
      shading: shade ? { type: ShadingType.CLEAR, color: 'auto', fill: 'CCCCCC' } : undefined,
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
      children: [new Paragraph({ children: runs(t) })],
    });
    pre.push(new Table({
      width: { size: TEXT_WIDTH, type: WidthType.DXA }, columnWidths: [2350, TEXT_WIDTH - 2350],
      rows: abbr.map((a, i) => new TableRow({ children: [cell(str(a.short, 200), i % 2, 2350), cell(str(a.full, 600), i % 2, TEXT_WIDTH - 2350)] })),
    }));
  }

  const ioa = (m.indexOfAuthorities && typeof m.indexOfAuthorities === 'object') ? m.indexOfAuthorities : {};
  let anyUnverified = false;
  const ioaParas = [];
  for (const [key, label] of IOA_GROUPS) {
    const list = arr(ioa[key]).filter(e => e && has(e.name));
    if (!list.length) continue;
    ioaParas.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 160 }, keepNext: true,
      children: [new TextRun({ text: label, bold: true, underline: {}, smallCaps: true, font: FONT })] }));
    list.forEach((e, i) => {
      const unverified = !!e.verify || /\[VERIFY\]/i.test(str(e.name));
      if (unverified) anyUnverified = true;
      const name = decode(e.name).replace(/\s*\[VERIFY\]\s*/gi, '').trim();
      const isCase = /\sv(?:s)?\.?\s/i.test(name);
      const cite = [e.citation, e.provisions].filter(has).map(decode).join(', ');
      ioaParas.push(new Paragraph({
        indent: { left: 540, hanging: 540 }, tabStops: [{ type: TabStopType.LEFT, position: 540 }],
        spacing: { after: 120, line: 276 },
        children: [
          new TextRun({ text: `${i + 1}.\t`, font: FONT }),
          new TextRun({ text: name, italics: isCase, font: FONT }),
          ...(cite ? [new TextRun({ text: `, ${cite}`, font: FONT })] : []),
          ...(unverified ? [new TextRun({ text: ' †', font: FONT })] : []),
        ],
      }));
    });
  }
  if (ioaParas.length) {
    pre.push(partTitle('Index of Authorities'), ...ioaParas);
    if (anyUnverified) {
      pre.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: '† Not verified against a law reporter by MootCoach. Confirm the citation before filing.', italics: true, size: 20, font: FONT })] }));
    }
  }

  if (has(m.statementOfJurisdiction)) pre.push(partTitle('Statement of Jurisdiction'), ...prose(m.statementOfJurisdiction));

  const facts = arr(m.statementOfFacts);
  if (facts.length || has(m.statementOfFacts)) {
    pre.push(partTitle('Statement of Facts'));
    if (facts.length) {
      for (const f of facts) {
        if (typeof f === 'string') { pre.push(...prose(f)); continue; }
        if (!f || typeof f !== 'object') continue;
        if (has(f.heading)) pre.push(new Paragraph({ keepNext: true, spacing: { before: 120, after: 120 }, children: [new TextRun({ text: decode(f.heading), bold: true, smallCaps: true, font: FONT })] }));
        pre.push(...prose(f.text));
      }
    } else pre.push(...prose(m.statementOfFacts));
  }

  const issues = arr(m.statementOfIssues).filter(has);
  if (issues.length) {
    pre.push(partTitle('Issues Raised'));
    issues.forEach((s, i) => {
      const t = decode(s).replace(/^\s*(issue\s+)?[ivx]+[.:)]\s*/i, '').trim();
      pre.push(new Paragraph({
        indent: { left: 600, hanging: 600 }, tabStops: [{ type: TabStopType.LEFT, position: 600 }],
        spacing: { after: 280, line: LINE }, alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: `${ROMAN[i] || i + 1}.\t`, bold: true, smallCaps: true, font: FONT }), ...runs(t, { bold: true, smallCaps: true })],
      }));
    });
  }

  const summary = arr(m.summaryOfArguments);
  if (summary.length) {
    pre.push(partTitle('Summary of Arguments'));
    for (const s of summary) {
      if (typeof s === 'string') { pre.push(...prose(s)); continue; }
      if (!s || typeof s !== 'object') continue;
      if (has(s.issue)) pre.push(new Paragraph({ keepNext: true, spacing: { before: 120, after: 120, line: LINE }, alignment: AlignmentType.JUSTIFIED, children: runs(s.issue, { bold: true, smallCaps: true }) }));
      pre.push(...prose(s.summary));
    }
  }

  // ── Arguments Advanced and the Prayer ──
  const main = [];
  const footnotes = {};
  let fn = 0;
  const numbered = list => arr(list, 400).forEach(p => {
    const text = typeof p === 'string' ? p : (p && p.text) || '';
    if (!has(text)) return;
    const no = (p && has(p.number)) ? str(p.number, 12).replace(/\.$/, '') : '';
    const refs = arr(p && p.footnotes, 20).filter(f => f && has(f.citation)).map(f => {
      fn++;
      footnotes[fn] = { children: [new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: runs(f.citation, { size: 20 }) })] };
      return new FootnoteReferenceRun(fn);
    });
    main.push(new Paragraph({
      indent: { left: 720, hanging: 360 }, tabStops: [{ type: TabStopType.LEFT, position: 720 }],
      alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, after: AFTER },
      children: [...(no ? [new TextRun({ text: `${no}.\t`, font: FONT })] : []), ...runs(text), ...refs],
    }));
  });

  const args = arr(m.argumentsAdvanced, 10);
  if (args.length) {
    main.push(partTitle('Arguments Advanced', { first: true }));
    for (const a of args) {
      if (!a || typeof a !== 'object') continue;
      if (has(a.heading)) {
        main.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 320, after: 200, line: LINE }, children: runs(a.heading, { bold: true, smallCaps: true }) }));
      }
      if (has(a.roadmap)) main.push(...prose(a.roadmap, { italics: true }));
      for (const sa of arr(a.subArguments, 12)) {
        if (!sa || typeof sa !== 'object') continue;
        if (has(sa.heading)) {
          main.push(new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true,
            spacing: { before: 240, after: 160, line: LINE }, children: runs(sa.heading, { bold: true, smallCaps: true }) }));
        }
        if (arr(sa.paragraphs).length) numbered(sa.paragraphs);
        else if (has(sa.text)) main.push(...prose(sa.text));
      }
      numbered(a.paragraphs);
      for (const k of ['issue', 'rule', 'application', 'conclusion']) {
        if (has(a[k])) main.push(body([new TextRun({ text: `${k.charAt(0).toUpperCase() + k.slice(1)}: `, bold: true, font: FONT }), ...runs(a[k])]));
      }
    }
  }

  const pr = m.prayer;
  if (pr && typeof pr === 'object') {
    main.push(partTitle('Prayer', { first: !args.length }));
    if (has(pr.opening)) main.push(...prose(pr.opening));
    arr(pr.declarations, 20).filter(has).forEach((d, i) => {
      main.push(new Paragraph({
        indent: { left: 720, hanging: 360 }, tabStops: [{ type: TabStopType.LEFT, position: 720 }],
        alignment: AlignmentType.JUSTIFIED, spacing: { line: LINE, after: 120 },
        children: [new TextRun({ text: `(${'abcdefghijklmnopqrst'[i]})\t`, font: FONT }), ...runs(decode(d).replace(/^\s*\(?[a-z0-9]{1,2}[.)]\s*/i, ''))],
      }));
    });
    if (has(pr.closing)) main.push(...prose(pr.closing, { bold: true, italics: true }, { alignment: AlignmentType.CENTER }));
    // "All of which is respectfully submitted, COUNSELS for PETITIONERS": the
    // counsel part on its own line, and only once.
    const sig = decode(pr.signature).trim();
    const sm = sig.match(/^(.*?)[\s,;:]*\b((?:counsels?|advocates?)\s+(?:for|on behalf of)\b.*)$/i);
    const lead = (sm ? sm[1] : sig).trim() || 'All of which is respectfully submitted.';
    const counsel = sm ? recase(sm[2].toUpperCase()) : `Counsel for the ${sideNice || 'Party'}`;
    main.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 600, line: LINE }, children: [new TextRun({ text: lead, font: FONT })] }));
    main.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { line: LINE }, children: [new TextRun({ text: counsel, bold: true, smallCaps: true, font: FONT })] }));
  } else if (has(pr)) {
    main.push(partTitle('Prayer', { first: !args.length }), ...prose(pr));
  }

  const blankFooter = new Footer({ children: [new Paragraph({ children: [] })] });
  const sections = [
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
      footers: { default: blankFooter }, children: [cover(cp, fill, coverInk)] },
    { properties: { page: page(1, NumberFormat.UPPER_ROMAN) }, footers: { default: footer }, children: pre },
  ];
  if (main.length) sections.push({ properties: { page: page(1, NumberFormat.DECIMAL) }, footers: { default: footer }, children: main });

  const heading = (id, name, size, extra = {}) => ({
    id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true,
    run: { font: FONT, size, bold: true, color: '000000', ...extra.run },
    paragraph: { spacing: { line: LINE }, ...extra.paragraph },
  });
  const doc = new Document({
    creator: 'MootCoach',
    title: runningHead,
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: LINE } } } },
      paragraphStyles: [
        heading('Heading1', 'Heading 1', 32),
        heading('Heading2', 'Heading 2', 24, { run: { smallCaps: true } }),
        heading('Heading3', 'Heading 3', 24, { run: { smallCaps: true } }),
        { id: 'FootnoteText', name: 'footnote text', basedOn: 'Normal', run: { font: FONT, size: 20 }, paragraph: { spacing: { line: 240, after: 0 } } },
      ],
    },
    footnotes,
    sections,
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildMemorialDocx };
