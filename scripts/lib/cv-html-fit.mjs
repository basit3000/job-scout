import { pageLimit } from './prompt-settings.mjs';
import { currentCvTemplate } from './cv-template-context.mjs';
/**
 * Local Markdown CVs must print as compact ATS HTML. Agent drafts used to be
 * dumped with white-space:pre-wrap and no @page rule, so Chrome turned a
 * one-page CV into two pages. Convert before print; squeeze print CSS once
 * if it still overflows. Never crop PDF pages.
 */

import { writeFile } from 'node:fs/promises';
import { cvMarkdownToHtml } from './tailor-cv.mjs';
import { htmlFileToPdf, countPdfPages } from './pdf.mjs';

const TIGHT_MARK = 'job-scout-print-tight';

export function isPreformattedCvHtml(html) {
  const src = String(html ?? '');
  if (/white-space:\s*pre-wrap/i.test(src)) return true;
  if (/<body[^>]*>\s*#\s+\S/i.test(src)) return true;
  return false;
}

export function needsCompactCvHtml(html) {
  const src = String(html ?? '');
  return isPreformattedCvHtml(src) || !/@page\s*\{/.test(src);
}

/** Keep body ≥ 10pt and page margins ≥ 0.5in; only tighten line spacing. */
export function tightenCvPrintCss(html) {
  const src = String(html ?? '');
  if (src.includes(TIGHT_MARK)) return src;
  let out = src.replace('@media print {', `@media print { /* ${TIGHT_MARK} */`);
  out = out.replace(/line-height:\s*1\.22/g, 'line-height: 1.12');
  out = out.replace(/h2 \{ margin: 0\.4rem 0 0\.12rem; \}/g, 'h2 { margin: 0.28rem 0 0.08rem; }');
  out = out.replace(/\.entry \{ margin: 0\.18rem 0 0\.1rem; \}/g, '.entry { margin: 0.12rem 0 0.06rem; }');
  return out;
}

export function compactLocalCvHtml(markdown, { job = {}, profile = {}, meta = {} } = {}) {
  return cvMarkdownToHtml(markdown, { job, profile, meta });
}

export async function ensureLocalCvFits({
  html,
  markdown,
  job = {},
  profile = {},
  meta = {},
  htmlPath,
  pdfPath,
  print = htmlFileToPdf,
  countPages = countPdfPages,
  onEvent = null,
} = {}) {
  let nextHtml = String(html ?? '');
  if (markdown && needsCompactCvHtml(nextHtml)) {
    onEvent?.({
      stream: 'meta',
      line: 'Rebuilding CV HTML for print from the complete Markdown draft.',
      t: Date.now(),
    });
    nextHtml = compactLocalCvHtml(markdown, { job, profile, meta });
  }
  await writeFile(htmlPath, nextHtml.endsWith('\n') ? nextHtml : `${nextHtml}\n`);
  let printed = await print(htmlPath, pdfPath);
  let pages = printed?.ok ? await countPages(pdfPath) : null;
  if (pages > pageLimit('cv') && !currentCvTemplate()) {
    const tight = tightenCvPrintCss(nextHtml);
    if (tight !== nextHtml) {
      nextHtml = tight;
      await writeFile(htmlPath, nextHtml.endsWith('\n') ? nextHtml : `${nextHtml}\n`);
      printed = await print(htmlPath, pdfPath);
      pages = printed?.ok ? await countPages(pdfPath) : pages;
    }
  }
  return { html: nextHtml, printed, pages };
}
