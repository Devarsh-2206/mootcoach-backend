/**
 * The memorial as a filed document.
 *
 * Export used to copy the on-screen preview into a print window. That preview
 * is built from Tailwind classes, and Tailwind does not exist in the print
 * window, so every margin, alignment and section break fell away: text ran to
 * the edge of a US Letter sheet, single-spaced and ragged, the cover printed
 * twice, and the footer landed on top of the argument.
 *
 * This typesets the memorial from its structured data instead, to the
 * conventions most Indian moot competitions set (each competition's own rules
 * govern, and they vary):
 *
 *   A4, 1 inch margins · Times New Roman 12pt, 1.5 lines (as Word sets it),
 *   justified · footnotes 10pt single-spaced at the foot of the page
 *   each part on a new page under its title in a shaded, ruled box
 *   a thin border around every page after the cover
 *   footer: "Memorial for the <side>" in small capitals left, page number right
 *   cover unnumbered; preliminary pages in Roman numerals from the Table of
 *   Contents; Arguments Advanced restart at 1
 *
 * The look follows memorials filed at NUALS 2025 (Concordia): colour only on
 * the cover — blue for the Petitioner, red for the Respondent, black ink —
 * and black on white everywhere else.
 *
 * Paged.js lays the document out in the print window, which is what makes
 * real page numbers in the Table of Contents and the Index of Authorities, and
 * footnotes on the page that cites them, possible in a browser. It is served
 * from this site (js/vendor), so the export does not depend on a CDN.
 */

const has = v => v !== undefined && v !== null && String(v).trim() !== '';
const arr = v => Array.isArray(v) ? v : [];

/* Model output sometimes arrives already HTML-escaped ("Equity &amp; Good
   Conscience"), which then printed literally. Decode first, escape once. */
function decode(s) {
  return String(s == null ? '' : s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
}
function esc(s) {
  return decode(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/* **bold** and *italic* / _italic_ as the drafter writes them; case names are
   usually italicised this way. */
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_(?!\s)(.+?)_(?=[\s).,;:]|$)/g, '$1<i>$2</i>');
}
/* A block of prose: one <p> per paragraph the drafter wrote. */
function paras(text, cls = '') {
  return decode(text).split(/\n\s*\n|\n/).map(t => t.trim()).filter(Boolean)
    .map(t => `<p${cls ? ` class="${cls}"` : ''}>${inline(t)}</p>`).join('');
}

const SECTION_TITLES = {
  toc: 'Table of Contents',
  abbr: 'List of Abbreviations',
  ioa: 'Index of Authorities',
  juris: 'Statement of Jurisdiction',
  facts: 'Statement of Facts',
  issues: 'Issues Raised',
  summary: 'Summary of Arguments',
  args: 'Arguments Advanced',
  prayer: 'Prayer',
};

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

/** The words that identify an authority wherever it is cited. */
function lookupKey(entry) {
  const name = decode(entry.name || '').replace(/\[VERIFY\]/gi, '').trim();
  const first = name.split(/\s+v(?:s)?\.?\s+/i)[0].split(/,|\(/)[0].trim();
  return (first.length >= 4 ? first : name).toLowerCase();
}

/* Small capitals need mixed case to show: "MEMORIAL FOR PETITIONER" in small
   caps is just capitals. Text that arrives all in capitals is recased first;
   anything already mixed is left as the drafter wrote it. */
function sc(s) {
  const t = decode(s);
  if (!/[a-z]/.test(t) && /[A-Z]{3}/.test(t)) {
    return esc(t.toLowerCase().replace(/(^|[\s([\-'’"/])([a-z])/g, (m, a, b) => a + b.toUpperCase()));
  }
  return esc(t);
}

function coverHtml(cp, colours) {
  if (!cp || !(has(cp.court) || has(cp.memorialFor))) return '';
  const row = (v, cls) => has(v) ? `<div class="${cls}">${sc(v)}</div>` : '';
  return `
  <section class="cover" style="--cover:${colours.bg};--cover-ink:${colours.ink}">
    <div class="cover-frame">
      ${has(cp.teamCode) ? `<div class="cover-team">${esc(cp.teamCode)}</div>` : '<div class="cover-team-gap"></div>'}
      ${row(cp.competition, 'cover-comp')}
      ${row(cp.court, 'cover-court')}
      <div class="cover-rule"></div>
      ${row(cp.caseNumber, 'cover-case')}
      ${row(cp.provision, 'cover-prov')}
      <div class="cover-rule"></div>
      <div class="cover-matter">In the Matter of :</div>
      <div class="cover-rule"></div>
      <div class="cover-party"><span>${sc(cp.petitioner || '')}</span><span>&hellip;Petitioner</span></div>
      <div class="cover-vs">V/S</div>
      <div class="cover-party"><span>${sc(cp.respondent || '')}</span><span>&hellip;Respondent</span></div>
      <div class="cover-rule"></div>
      ${row(cp.memorialFor, 'cover-for')}
      <div class="cover-rule"></div>
    </div>
  </section>`;
}

/**
 * The full print document. Separate from printing so it can be inspected
 * and tested without opening a window.
 */
export function buildMemorialDocument(m, { colours, pagedSrc, title } = {}) {
  m = m || {};
  const cp = m.coverPage || {};
  const side = decode(cp.memorialFor || '').replace(/^memorial\s+(on behalf\s+)?(of|for)\s+(the\s+)?/i, '').trim();
  const runningHead = side ? `Memorial for the ${side.charAt(0).toUpperCase() + side.slice(1).toLowerCase()}` : 'Memorial';
  const sections = [];
  const MAIN = ['args', 'prayer'];
  const sec = (key, inner) => sections.push(
    `<section class="part ${MAIN.includes(key) ? 'main' : 'prelim'}" id="part-${key}"><h1>${SECTION_TITLES[key]}</h1>${inner}</section>`);

  // Table of Contents: filled with page numbers once laid out.
  const tocKeys = ['abbr', 'ioa', 'juris', 'facts', 'issues', 'summary', 'args', 'prayer'];

  // ── Abbreviations ──
  const abbr = arr(m.listOfAbbreviations).filter(a => a && has(a.short));
  if (abbr.length) {
    sec('abbr', `<table class="abbr"><colgroup><col class="c-short"><col></colgroup>${abbr.map(a =>
      `<tr><td>${esc(a.short)}</td><td>${esc(a.full)}</td></tr>`).join('')}</table>`);
  }

  // ── Index of Authorities ──
  const ioa = m.indexOfAuthorities || {};
  let anyUnverified = false;
  const ioaBlocks = IOA_GROUPS.map(([key, label]) => {
    const list = arr(ioa[key]).filter(e => e && has(e.name));
    if (!list.length) return '';
    return `<h3 class="ioa-group">${label}</h3>
      <div class="ioa">
      ${list.map((e, i) => {
        const unverified = !!e.verify || /\[VERIFY\]/i.test(e.name || '');
        if (unverified) anyUnverified = true;
        const name = decode(e.name).replace(/\s*\[VERIFY\]\s*/gi, '').trim();
        const isCase = /\sv(?:s)?\.?\s/i.test(name);
        const cite = [e.citation, e.provisions].filter(has).map(esc).join(', ');
        return `<div class="lead ioa-row" data-key="${esc(lookupKey(e))}"><span class="lead-txt"><span class="ioa-no">${i + 1}.</span>${isCase ? `<i>${esc(name)}</i>` : esc(name)}${cite ? `, ${cite}` : ''}${unverified ? '<span class="dagger">&dagger;</span>' : ''}</span><span class="lead-dots"></span><span class="pg"></span></div>`;
      }).join('')}
      </div>`;
  }).join('');
  if (ioaBlocks) {
    sec('ioa', ioaBlocks + (anyUnverified
      ? `<p class="ioa-note">&dagger; Not verified against a law reporter by MootCoach. Confirm the citation before filing.</p>`
      : ''));
  }

  if (has(m.statementOfJurisdiction)) sec('juris', paras(m.statementOfJurisdiction));

  // ── Facts ──
  if (arr(m.statementOfFacts).length) {
    sec('facts', arr(m.statementOfFacts).map(f => typeof f === 'string' ? paras(f)
      : `${has(f.heading) ? `<h3>${esc(f.heading)}</h3>` : ''}${paras(f.text || '')}`).join(''));
  } else if (has(m.statementOfFacts)) {
    sec('facts', paras(m.statementOfFacts));
  }

  // ── Issues ──
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  if (arr(m.statementOfIssues).length) {
    sec('issues', arr(m.statementOfIssues).map((s, i) => {
      const t = decode(s).replace(/^\s*(issue\s+)?[ivx]+[.:)]\s*/i, '').trim();
      return `<p class="issue"><span class="issue-no">${ROMAN[i] || i + 1}.</span>${inline(t)}</p>`;
    }).join(''));
  }

  // ── Summary ──
  if (arr(m.summaryOfArguments).length) {
    sec('summary', arr(m.summaryOfArguments).map(s => typeof s === 'string' ? paras(s)
      : `${has(s.issue) ? `<h3>${inline(s.issue)}</h3>` : ''}${paras(s.summary || '')}`).join(''));
  }

  // ── Arguments, footnotes on the page that cites them ──
  const argHeads = [];   // listed under Arguments Advanced in the contents
  if (arr(m.argumentsAdvanced).length) {
    let autoNo = 0;
    let fnNo = 0;   // numbered here: Paged.js's footnote counter repeats on a page
    const renderParas = list => arr(list).map(p => {
      const text = typeof p === 'string' ? p : (p.text || '');
      const no = (p && has(p.number)) ? String(p.number).replace(/\.$/, '') : String(++autoNo);
      if (p && has(p.number)) autoNo = Number(no) || autoNo;
      const notes = arr(p && p.footnotes).filter(f => f && has(f.citation))
        .map(f => { fnNo++; return `<span class="fn" data-n="${fnNo}"><sup class="fn-n">${fnNo}</sup>${inline(f.citation)}</span>`; }).join('');
      return `<p class="para"><span class="para-no">${esc(no)}.</span>${inline(text)}${notes}</p>`;
    }).join('');

    sec('args', arr(m.argumentsAdvanced).map(a => `
      ${has(a.heading) ? `<h2 id="h-${argHeads.push({ lvl: 2, text: a.heading })}">${inline(a.heading)}</h2>` : ''}
      ${has(a.roadmap) ? paras(a.roadmap, 'roadmap') : ''}
      ${arr(a.subArguments).map(sa => `
        ${has(sa.heading) ? `<h3 id="h-${argHeads.push({ lvl: 3, text: sa.heading })}">${inline(sa.heading)}</h3>` : ''}
        ${arr(sa.paragraphs).length ? renderParas(sa.paragraphs) : (has(sa.text) ? paras(sa.text) : '')}`).join('')}
      ${renderParas(a.paragraphs)}
      ${['issue', 'rule', 'application', 'conclusion'].filter(k => has(a[k]))
        .map(k => `<p><b>${k.charAt(0).toUpperCase() + k.slice(1)}:</b> ${inline(a[k])}</p>`).join('')}
    `).join(''));
  }

  // ── Prayer ──
  const pr = m.prayer;
  if (pr && typeof pr === 'object') {
    const L = 'abcdefghij';
    sec('prayer', `
      ${has(pr.opening) ? paras(pr.opening) : ''}
      ${arr(pr.declarations).length ? `<ol class="prayer-list">${arr(pr.declarations).map((d, i) =>
        `<li><span class="pl-no">(${L[i] || i + 1})</span>${inline(decode(d).replace(/^\s*\(?[a-z0-9]{1,2}[.)]\s*/i, ''))}</li>`).join('')}</ol>` : ''}
      ${has(pr.closing) ? paras(pr.closing, 'prayer-close') : ''}
      <div class="signature">${has(pr.signature) ? esc(pr.signature) : 'All of which is respectfully submitted.'}<br>
        <span class="sig-line">Counsel for the ${esc(side ? side.charAt(0).toUpperCase() + side.slice(1).toLowerCase() : 'Party')}</span></div>`);
  } else if (has(pr)) {
    sec('prayer', paras(pr));
  }

  if (!sections.length) {
    // The older four-field shape.
    sections.push(`<section class="part"><h1>Memorial</h1>${['issue', 'rule', 'application', 'conclusion']
      .filter(k => has(m[k])).map(k => `<h3>${k.toUpperCase()}</h3>${paras(m[k])}`).join('')}</section>`);
  }

  const present = tocKeys.filter(k => sections.some(s => s.includes(`id="part-${k}"`)));
  const tocRow = (cls, label, target) =>
    `<div class="lead ${cls}"><span class="lead-txt">${label}</span><span class="lead-dots"></span><span class="toc-pg" data-for="${target}"></span></div>`;
  const toc = `<section class="part prelim toc" id="part-toc"><h1>${SECTION_TITLES.toc}</h1>
    <div class="toc-list">${present.map(k => tocRow('toc-main', SECTION_TITLES[k], 'part-' + k)
      + (k === 'args' ? argHeads.map((h, i) => tocRow('toc-sub toc-l' + h.lvl, inline(h.text), 'h-' + (i + 1))).join('') : '')).join('')}</div></section>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title || 'Memorial')}</title>
<style>
  @page {
    size: A4;
    margin: 25.4mm;
    @bottom-left { content: "${esc(runningHead).replace(/"/g, '')}"; font: 10.5pt "Times New Roman", Times, serif; font-variant: small-caps; color: #5a5a5a; vertical-align: middle; }
    @bottom-right { content: counter(page); font: 11pt "Times New Roman", Times, serif; vertical-align: middle; }
  }
  @page prelim { @bottom-right { content: counter(page, upper-roman); } }
  .pagedjs_page.mc-num .pagedjs_margin-bottom-right .pagedjs_margin-content::after { content: var(--mc-pg) !important; }
  @page cover { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Times New Roman", Times, "Liberation Serif", serif;
    font-size: 12pt; line-height: 1.72; color: #000;
    text-align: justify; hyphens: auto; margin: 0;
  }
  p { margin: 0 0 8pt; orphans: 3; widows: 3; }

  /* A thin rule around every page after the cover, a third of an inch in. */
  .pagedjs_page:not(.pagedjs_cover_page) .pagedjs_sheet { position: relative; }
  .pagedjs_page:not(.pagedjs_cover_page) .pagedjs_sheet::after {
    content: ""; position: absolute; inset: 8.8mm; border: .5pt solid #000; pointer-events: none; }

  /* Cover: colour to the edge, black ink, a thin frame and double rules. */
  .cover { page: cover; break-after: page; height: 297mm; box-sizing: border-box;
    padding: 8.8mm; background: var(--cover); color: var(--cover-ink); text-align: center;
    line-height: 1.5; font-variant: small-caps; }
  .cover-frame { border: .75pt solid var(--cover-ink); height: 100%; box-sizing: border-box; padding: 16mm 15mm; }
  .cover-team { float: right; border: 1pt solid var(--cover-ink); padding: 1pt 8pt; font-size: 11pt; font-variant: normal; }
  .cover-team-gap { height: 16pt; }
  .cover-comp { clear: both; padding-top: 34mm; font-size: 12pt; font-weight: bold; }
  .cover-court { font-size: 12pt; font-weight: bold; }
  .cover-case, .cover-prov { font-size: 11.5pt; }
  .cover-matter { font-size: 11.5pt; font-weight: bold; }
  .cover-party { display: flex; justify-content: space-between; font-size: 11.5pt; font-weight: bold; text-align: left; gap: 12pt; }
  .cover-vs { font-size: 11.5pt; font-weight: bold; }
  .cover-for { font-size: 12pt; font-weight: bold; }
  .cover-rule { border-top: 4.2pt double var(--cover-ink); margin: 12pt 0; }

  /* Every part starts a new page, its title in a shaded, ruled box. */
  .part { break-before: page; }
  .prelim { page: prelim; }
  .toc { counter-reset: page 1; }
  #part-args { counter-reset: page 1; }
  /* Paged.js justifies the last line of anything near a page break; headings
     must keep their own alignment. */
  h1, h2, h3, .issue-no, .signature, .lead, .lead span { text-align-last: auto !important; }
  h1 { font-size: 16pt; font-weight: bold; text-transform: uppercase; text-align: center; line-height: 1.3;
       border: .5pt solid #000; background: linear-gradient(#a0a0a0, #7a7a7a); padding: 9pt 6pt;
       margin: 0 0 22pt; break-after: avoid; }
  h2 { font-size: 12pt; font-weight: bold; font-variant: small-caps; text-align: justify; line-height: 1.5;
       margin: 16pt 0 10pt; break-after: avoid; }
  h3 { font-size: 12pt; font-weight: bold; font-variant: small-caps; margin: 12pt 0 8pt; break-after: avoid; text-align: left; line-height: 1.5; }

  /* Numbered paragraphs: number a quarter inch in, text hanging at half an inch. */
  .para { padding-left: 36pt; text-indent: -18pt; }
  .para-no { display: inline-block; min-width: 18pt; text-indent: 0; }
  .roadmap { font-style: italic; }

  /* Footnotes at the foot of the page, under a short rule. */
  .fn { float: footnote; font-size: 10pt; line-height: 1.15; text-align: justify; text-indent: 0; padding-left: 0; }
  /* Paged.js does not carry data-n onto the call it creates, so the call is
     laid out holding a two-digit placeholder (reserving its width) and the
     real number is written in after layout - it can only get narrower, so
     nothing reflows onto the next page. */
  .fn::footnote-call { content: "00"; color: transparent; font-size: 8pt; vertical-align: super; line-height: 0; font-weight: normal; }
  a[data-footnote-call][data-n]::after { content: attr(data-n) !important; color: #000 !important; }
  /* Only a paragraph that continues onto the next page keeps a justified last line. */
  p:not([data-split-to]), li:not([data-split-to]) { text-align-last: auto !important; }
  .fn::footnote-marker { content: none; }
  .fn-n { font-size: 6.5pt; margin-right: 1pt; }
  @footnote { border-top: none; margin-top: 10pt; }
  /* A two-inch rule above the notes, only on pages that have notes. */
  .pagedjs_footnote_inner_content:has(> *)::before {
    content: ""; display: block; width: 2in; border-top: .5pt solid #000; margin-bottom: 4pt; }

  /* Dotted leaders to a page number: contents and authorities. */
  .lead { display: flex; align-items: flex-end; text-align: left; }
  .lead-txt { flex: 0 1 auto; }
  .lead-dots { flex: 1 1 auto; min-width: 12pt; border-bottom: 1pt dotted #000; margin: 0 3pt .42em; }
  .lead .toc-pg, .lead .pg { flex: none; min-width: 1.4em; text-align: right; white-space: nowrap; }
  .toc-main { font-weight: bold; text-transform: uppercase; margin: 0 0 7pt; }
  .toc-sub { font-weight: bold; font-variant: small-caps; text-align: justify; line-height: 1.5; margin: 0 0 7pt; }
  .toc-l2 { padding-left: 12pt; }
  .toc-l3 { padding-left: 24pt; }

  .abbr { width: 100%; border-collapse: collapse; text-align: left; }
  .abbr td { border: .5pt solid #000; padding: 6pt 8pt; vertical-align: middle; line-height: 1.4; }
  .abbr tr:nth-child(even) td { background: #cccccc; }
  .abbr .c-short { width: 26%; }
  .ioa-group { text-align: center; text-decoration: underline; margin: 16pt 0 8pt; }
  .ioa-row { line-height: 1.4; margin-bottom: 6pt; }
  .ioa-no { display: inline-block; min-width: 1.8em; }
  .dagger { margin-left: 2pt; }
  .ioa-note { font-size: 10pt; margin-top: 10pt; font-style: italic; }
  .issue { font-weight: bold; font-variant: small-caps; padding-left: 30pt; text-indent: -30pt; line-height: 1.5; margin-bottom: 14pt; }
  .issue-no { display: inline-block; min-width: 30pt; text-indent: 0; }
  .prayer-list { list-style: none; padding: 0; margin: 0 0 10pt; }
  .prayer-list li { padding-left: 36pt; text-indent: -18pt; margin-bottom: 6pt; }
  .pl-no { display: inline-block; min-width: 18pt; text-indent: 0; }
  .prayer-close { font-weight: bold; font-style: italic; text-align: center; }
  .signature { margin-top: 30pt; text-align: right; line-height: 1.6; }
  .sig-line { font-weight: bold; font-variant: small-caps; }

  /* On screen, while Paged.js lays out: a quiet note instead of a raw flash. */
  @media screen { body { background: #e9e6df; } .pagedjs_page { background: #fff; margin: 12px auto; box-shadow: 0 2px 10px rgba(0,0,0,.15); } }
</style>
<script>
  // Fill page numbers once laid out, then open the print dialog.
  window.PagedConfig = {
    auto: true,
    after: function () {
      try { window.__mcNumber(); } catch (e) { console.warn('[EXPORT] numbering skipped', e); }
      window.__mcReady = true;
      if (!window.__mcNoPrint) setTimeout(function () { window.print(); }, 250);
    }
  };
  window.__mcNumber = function () {
    // Footnote calls: copy each note's number onto the call that points at it.
    document.querySelectorAll('a[data-footnote-call]').forEach(function (a) {
      var note = document.getElementById('note-' + a.getAttribute('data-ref'))
        || document.querySelector('[data-note-id="' + a.getAttribute('data-ref') + '"]');
      var holder = note && (note.getAttribute('data-n') ? note : note.querySelector('[data-n]'));
      var n = holder && holder.getAttribute('data-n');
      if (!n && note) { var m = (note.textContent || '').match(/^\s*(\d+)\./); n = m && m[1]; }
      // Two notes on one sentence read "1, 2", not "12".
      var prev = a.previousSibling;
      if (n && prev && prev.nodeType === 1 && prev.hasAttribute('data-footnote-call')) n = ',' + n;
      if (n) a.setAttribute('data-n', n);
    });
    // The page number printed in the footer: Roman from the Table of Contents,
    // starting again at 1 with the Arguments Advanced.
    var pages = Array.prototype.slice.call(document.querySelectorAll('.pagedjs_page'));
    function pageOf(el) { var pg = el && el.closest('.pagedjs_page'); return pg ? pages.indexOf(pg) : -1; }
    function roman(n) {
      var r = '', t = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
      t.forEach(function (x) { while (n >= x[0]) { r += x[1]; n -= x[0]; } });
      return r;
    }
    var tocIdx = pageOf(document.getElementById('part-toc'));
    var argsIdx = pageOf(document.getElementById('part-args'));
    function shown(el) {
      var i = pageOf(el);
      var start = tocIdx >= 0 ? tocIdx : 0;
      if (i < start) return null;
      if (argsIdx >= 0 && i >= argsIdx) return String(i - argsIdx + 1);
      return roman(i - start + 1);
    }
    // Paged.js keeps a counter-reset for one page only, so the footer read
    // 1, 8, 9 through the Arguments. Each footer is written from the same
    // numbering the contents use.
    pages.forEach(function (pg) {
      var n = shown(pg);
      if (n) { pg.classList.add('mc-num'); pg.style.setProperty('--mc-pg', JSON.stringify(n)); }
    });
    document.querySelectorAll('.toc-pg').forEach(function (td) {
      var n = shown(document.getElementById(td.getAttribute('data-for')));
      if (n) td.textContent = n;
    });
    // Index of Authorities: every page, from the Arguments onward, whose text
    // or footnotes cite the authority. A long part is split across pages, so
    // look at every page rather than inside one element.
    var cites = Array.prototype.slice.call(document.querySelectorAll('.pagedjs_page p, .pagedjs_page .fn'))
      .filter(function (el) { return !el.closest('.ioa') && !el.closest('.ioa-note'); })
      .map(function (el) { return { text: (el.textContent || '').toLowerCase(), idx: pageOf(el) }; })
      .filter(function (c) { return c.idx >= 0 && (argsIdx < 0 || c.idx >= argsIdx); });
    document.querySelectorAll('.ioa-row[data-key]').forEach(function (row) {
      var key = row.getAttribute('data-key');
      if (!key) return;
      var seen = {};
      cites.forEach(function (c) { if (c.text.indexOf(key) !== -1) seen[c.idx] = true; });
      var list = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; })
        .map(function (i) { return argsIdx >= 0 ? String(i - argsIdx + 1) : String(i + 1); });
      var cell = row.querySelector('.pg');
      if (cell && list.length) cell.textContent = list.join(', ');
    });
  };
  window.addEventListener('afterprint', function () { if (!window.__mcNoPrint) window.close(); });
</script>
${pagedSrc ? `<script src="${esc(pagedSrc)}"></script>` : ''}
</head><body>
${coverHtml(cp, colours || { bg: '#1F4E8C', ink: '#FFFFFF' })}
${toc}
${sections.join('\n')}
</body></html>`;
}

/** Open the memorial in a print window. Must be called from a click. */
export function printMemorial(memorial, { colours, title } = {}) {
  const win = window.open('', '_blank');
  if (!win) return false;
  // Relative to this module (js/components/), so it resolves wherever the page is.
  const pagedSrc = new URL('../vendor/paged.polyfill.min.js', import.meta.url).href;
  win.document.open();
  win.document.write(buildMemorialDocument(memorial, { colours, title }));
  win.document.close();
  // Added as an element, not written into the page: a <script src> written
  // with document.write into a popup stayed pending in Chromium and the
  // export never laid out. A script element is fetched asynchronously, and
  // Paged.js starts once it runs (the document is already complete by then).
  const script = win.document.createElement('script');
  script.src = pagedSrc;
  script.onerror = () => {
    // Without Paged.js the browser still prints the same document, just
    // without page numbers in the contents or footnotes at the page foot.
    win.__mcReady = true;
    win.print();
  };
  win.document.head.appendChild(script);
  return true;
}
