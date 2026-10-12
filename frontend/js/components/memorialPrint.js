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
 *   A4, 1 inch margins · Times New Roman 12pt, 1.5 spacing, justified
 *   footnotes 10pt single-spaced at the foot of the page
 *   headings 14pt bold capitals, centred · each part on a new page
 *   cover unnumbered, page numbers bottom centre from the Table of Contents
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

function coverHtml(cp, colours) {
  if (!cp || !(has(cp.court) || has(cp.memorialFor))) return '';
  const row = (v, cls) => has(v) ? `<div class="${cls}">${esc(v)}</div>` : '';
  return `
  <section class="cover" style="--cover:${colours.bg};--cover-ink:${colours.ink}">
    <div class="cover-frame">
      ${has(cp.teamCode) ? `<div class="cover-team">${esc(cp.teamCode)}</div>` : ''}
      ${row(cp.competition, 'cover-comp')}
      <hr class="cover-rule">
      ${row(cp.court, 'cover-court')}
      ${row(cp.caseNumber, 'cover-case')}
      ${row(cp.provision, 'cover-prov')}
      <hr class="cover-rule">
      <div class="cover-matter">In the matter of</div>
      <div class="cover-party"><span>${esc(cp.petitioner || '')}</span><span>&hellip;Petitioner</span></div>
      <div class="cover-vs">versus</div>
      <div class="cover-party"><span>${esc(cp.respondent || '')}</span><span>&hellip;Respondent</span></div>
      <hr class="cover-rule">
      ${row(cp.memorialFor, 'cover-for')}
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
  const runningHead = side ? `Memorial for the ${side.charAt(0) + side.slice(1).toLowerCase()}` : 'Memorial';
  const sections = [];
  const sec = (key, inner) => sections.push(
    `<section class="part" id="part-${key}"><h1>${SECTION_TITLES[key]}</h1>${inner}</section>`);

  // Table of Contents: filled with page numbers once laid out.
  const tocKeys = ['abbr', 'ioa', 'juris', 'facts', 'issues', 'summary', 'args', 'prayer'];

  // ── Abbreviations ──
  const abbr = arr(m.listOfAbbreviations).filter(a => a && has(a.short));
  if (abbr.length) {
    sec('abbr', `<table class="abbr">${abbr.map(a =>
      `<tr><td class="abbr-short">${esc(a.short)}</td><td>${esc(a.full)}</td></tr>`).join('')}</table>`);
  }

  // ── Index of Authorities ──
  const ioa = m.indexOfAuthorities || {};
  let anyUnverified = false;
  const ioaBlocks = IOA_GROUPS.map(([key, label]) => {
    const list = arr(ioa[key]).filter(e => e && has(e.name));
    if (!list.length) return '';
    return `<h3 class="ioa-group">${label}</h3>
      <table class="ioa"><colgroup><col class="c-no"><col><col class="c-pg"></colgroup>
      <thead><tr><th>S. No.</th><th>Authority</th><th>Page</th></tr></thead><tbody>
      ${list.map((e, i) => {
        const unverified = !!e.verify || /\[VERIFY\]/i.test(e.name || '');
        if (unverified) anyUnverified = true;
        const name = decode(e.name).replace(/\s*\[VERIFY\]\s*/gi, '').trim();
        const isCase = /\sv(?:s)?\.?\s/i.test(name);
        const cite = [e.citation, e.provisions].filter(has).map(esc).join(', ');
        return `<tr data-key="${esc(lookupKey(e))}"><td>${i + 1}.</td>
          <td>${isCase ? `<i>${esc(name)}</i>` : esc(name)}${cite ? `, ${cite}` : ''}${unverified ? '<span class="dagger">&dagger;</span>' : ''}</td>
          <td class="pg"></td></tr>`;
      }).join('')}
      </tbody></table>`;
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
      return `<div class="issue"><span class="issue-no">Issue ${ROMAN[i] || i + 1}</span><p>${inline(t)}</p></div>`;
    }).join(''));
  }

  // ── Summary ──
  if (arr(m.summaryOfArguments).length) {
    sec('summary', arr(m.summaryOfArguments).map(s => typeof s === 'string' ? paras(s)
      : `${has(s.issue) ? `<h3>${inline(s.issue)}</h3>` : ''}${paras(s.summary || '')}`).join(''));
  }

  // ── Arguments, footnotes on the page that cites them ──
  if (arr(m.argumentsAdvanced).length) {
    let autoNo = 0;
    let fnNo = 0;   // numbered here: Paged.js's footnote counter repeats on a page
    const renderParas = list => arr(list).map(p => {
      const text = typeof p === 'string' ? p : (p.text || '');
      const no = (p && has(p.number)) ? String(p.number).replace(/\.$/, '') : String(++autoNo);
      if (p && has(p.number)) autoNo = Number(no) || autoNo;
      const notes = arr(p && p.footnotes).filter(f => f && has(f.citation))
        .map(f => { fnNo++; return `<span class="fn" data-n="${fnNo}"><span class="fn-n">${fnNo}.</span> ${inline(f.citation)}</span>`; }).join('');
      return `<p class="para"><span class="para-no">${esc(no)}.</span>${inline(text)}${notes}</p>`;
    }).join('');

    sec('args', arr(m.argumentsAdvanced).map(a => `
      ${has(a.heading) ? `<h2>${inline(a.heading)}</h2>` : ''}
      ${has(a.roadmap) ? paras(a.roadmap, 'roadmap') : ''}
      ${arr(a.subArguments).map(sa => `
        ${has(sa.heading) ? `<h3>${inline(sa.heading)}</h3>` : ''}
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
      ${has(pr.closing) ? paras(pr.closing) : ''}
      <div class="signature">${has(pr.signature) ? esc(pr.signature) : 'All of which is respectfully submitted.'}<br>
        <span class="sig-line">Counsel for the ${esc(side ? side.charAt(0) + side.slice(1).toLowerCase() : 'Party')}</span></div>`);
  } else if (has(pr)) {
    sec('prayer', paras(pr));
  }

  if (!sections.length) {
    // The older four-field shape.
    sections.push(`<section class="part"><h1>Memorial</h1>${['issue', 'rule', 'application', 'conclusion']
      .filter(k => has(m[k])).map(k => `<h3>${k.toUpperCase()}</h3>${paras(m[k])}`).join('')}</section>`);
  }

  const present = tocKeys.filter(k => sections.some(s => s.includes(`id="part-${k}"`)));
  const toc = `<section class="part toc" id="part-toc"><h1>${SECTION_TITLES.toc}</h1>
    <table class="toc-table">${present.map(k =>
      `<tr><td class="toc-label">${SECTION_TITLES[k]}</td><td class="toc-dots"></td><td class="toc-pg" data-for="part-${k}"></td></tr>`).join('')}</table></section>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title || 'Memorial')}</title>
<style>
  @page {
    size: A4;
    margin: 25.4mm;
    @top-right { content: "${esc(runningHead).replace(/"/g, '')}"; font: italic 9pt "Times New Roman", Times, serif; color: #444; }
    @bottom-center { content: counter(page); font: 11pt "Times New Roman", Times, serif; }
  }
  @page cover { margin: 0; @top-right { content: none; } @bottom-center { content: none; } }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Times New Roman", Times, "Liberation Serif", serif;
    font-size: 12pt; line-height: 1.5; color: #000;
    text-align: justify; hyphens: auto; margin: 0;
  }
  p { margin: 0 0 10pt; orphans: 3; widows: 3; }

  /* Cover: full bleed, coloured by side, unnumbered. */
  .cover { page: cover; break-after: page; height: 297mm; box-sizing: border-box;
    padding: 22mm 20mm; background: var(--cover); color: var(--cover-ink); text-align: center; }
  .cover-frame { border: 1.5pt solid var(--cover-ink); height: 100%; box-sizing: border-box;
    padding: 18mm 14mm; display: flex; flex-direction: column; justify-content: space-between; }
  .cover-team { align-self: flex-end; border: 1pt solid var(--cover-ink); padding: 3pt 12pt; font-weight: bold; }
  .cover-comp { font-size: 16pt; font-weight: bold; text-transform: uppercase; }
  .cover-court { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
  .cover-case, .cover-prov { font-size: 12pt; }
  .cover-matter { font-size: 12pt; font-style: italic; }
  .cover-party { display: flex; justify-content: space-between; font-size: 13pt; font-weight: bold; text-transform: uppercase; text-align: left; gap: 12pt; }
  .cover-vs { font-style: italic; }
  .cover-for { font-size: 15pt; font-weight: bold; text-transform: uppercase; letter-spacing: .04em; }
  .cover-rule { width: 100%; border: none; border-top: 3pt double var(--cover-ink); margin: 6pt 0; }

  /* Every part starts a new page, under a centred capitalised heading. */
  .part { break-before: page; }
  .toc { counter-reset: page 1; }
  /* Paged.js justifies the last line of anything near a page break; headings
     must keep their own alignment. */
  h1, h2, h3, .issue-no, .signature, .toc-table td { text-align-last: auto !important; }
  h1 { font-size: 14pt; font-weight: bold; text-transform: uppercase; text-align: center;
       letter-spacing: .03em; margin: 0 0 18pt; break-after: avoid; }
  h2 { font-size: 12pt; font-weight: bold; text-transform: uppercase; text-align: justify;
       margin: 18pt 0 10pt; break-after: avoid; }
  h3 { font-size: 12pt; font-weight: bold; margin: 14pt 0 8pt; break-after: avoid; text-align: left; }

  /* Numbered paragraphs with a hanging number. */
  .para { padding-left: 3em; text-indent: -3em; }
  .para-no { display: inline-block; width: 3em; text-indent: 0; font-weight: bold; }
  .roadmap { font-style: italic; }

  /* Footnotes at the foot of the page, as filed memorials carry them. */
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
  .fn-n { display: inline-block; min-width: 1.6em; }
  @footnote { border-top: .5pt solid #000; padding-top: 4pt; margin-top: 8pt; }

  .toc-table, .ioa, .abbr { width: 100%; border-collapse: collapse; text-align: left; }
  .toc-table td { padding: 4pt 0; vertical-align: bottom; }
  .toc-label { white-space: nowrap; padding-right: 6pt !important; text-transform: uppercase; }
  .toc-dots { width: 100%; border-bottom: 1pt dotted #000; }
  .toc-pg { white-space: nowrap; padding-left: 6pt !important; min-width: 2em; text-align: right; }
  .abbr td { padding: 3pt 0; vertical-align: top; }
  .abbr-short { width: 22%; font-weight: bold; }
  .ioa-group { text-transform: uppercase; margin-top: 16pt; }
  .ioa th, .ioa td { border: .5pt solid #000; padding: 4pt 6pt; vertical-align: top; font-size: 11pt; line-height: 1.3; }
  .ioa th { font-weight: bold; text-align: center; }
  .ioa .c-no { width: 10%; } .ioa .c-pg { width: 14%; }
  .ioa td:first-child, .ioa td.pg { text-align: center; }
  .ioa tr { break-inside: avoid; }
  .dagger { margin-left: 2pt; }
  .ioa-note { font-size: 10pt; margin-top: 10pt; font-style: italic; }
  .issue { margin-bottom: 14pt; }
  .issue-no { display: block; font-weight: bold; text-transform: uppercase; text-align: center; margin-bottom: 4pt; }
  .issue p { font-weight: bold; }
  .prayer-list { list-style: none; padding: 0; margin: 0 0 10pt; }
  .prayer-list li { padding-left: 3em; text-indent: -3em; margin-bottom: 8pt; }
  .pl-no { display: inline-block; width: 3em; text-indent: 0; }
  .signature { margin-top: 36pt; text-align: right; font-weight: bold; line-height: 1.6; }
  .sig-line { font-style: italic; font-weight: normal; }

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
    // The page number printed in the footer: Paged.js's counter, including
    // the reset at the Table of Contents.
    function shown(el) {
      var page = el && el.closest('.pagedjs_page');
      if (!page) return null;
      var pages = Array.prototype.slice.call(document.querySelectorAll('.pagedjs_page'));
      var tocPage = document.querySelector('#part-toc') && document.querySelector('#part-toc').closest('.pagedjs_page');
      var start = tocPage ? pages.indexOf(tocPage) : 0;
      var i = pages.indexOf(page);
      return i >= start ? (i - start + 1) : null;
    }
    document.querySelectorAll('.toc-pg').forEach(function (td) {
      var target = document.getElementById(td.getAttribute('data-for'));
      var n = shown(target);
      if (n) td.textContent = n;
    });
    // Index of Authorities: every page, from the Arguments onward, whose text
    // or footnotes cite the authority. A long part is split across pages, so
    // look at every page rather than inside one element.
    var argsStart = shown(document.getElementById('part-args'));
    var cites = Array.prototype.slice.call(document.querySelectorAll('.pagedjs_page p, .pagedjs_page .fn'))
      .filter(function (el) { return !el.closest('table') && !el.closest('.ioa-note'); })
      .map(function (el) { return { text: (el.textContent || '').toLowerCase(), page: shown(el) }; })
      .filter(function (c) { return c.page && (!argsStart || c.page >= argsStart); });
    document.querySelectorAll('.ioa tr[data-key]').forEach(function (tr) {
      var key = tr.getAttribute('data-key');
      if (!key) return;
      var seen = {};
      cites.forEach(function (c) { if (c.text.indexOf(key) !== -1) seen[c.page] = true; });
      var list = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
      var cell = tr.querySelector('.pg');
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
