/**
 * Read the text layer of a PDF the way an applicant-tracking parser does, and
 * check it for the failures that silently kill a CV at the first screen:
 * words split by kerning ("W orking"), ligature glyphs with no Unicode mapping
 * ("speciﬁc" → "specic"), an unreadable e-mail address, missing section names.
 *
 * pdf.js is what many ATS vendors and browser previews use, so what it sees is
 * a fair proxy for what they see. Pure Node, no poppler needed.
 */

import { readFile } from 'node:fs/promises';

let pdfjsPromise = null;
function pdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

/**
 * Text of every page, lines rebuilt from glyph positions.
 * @returns {Promise<{ pages: number, text: string, lines: string[] }>}
 */
export async function extractPdfText(pdfPath) {
  const { getDocument } = await pdfjs();
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent({ includeMarkedContent: false });
    let current = '';
    let lastY = null;
    let lastX = null;
    let lastW = 0;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const [, , , , x, y] = item.transform;
      const sameLine = lastY !== null && Math.abs(y - lastY) < 2.5;
      if (!sameLine) {
        if (current.trim()) lines.push(current.replace(/\s+/g, ' ').trim());
        current = '';
      } else if (lastX !== null) {
        // A visible horizontal gap is a space; a tiny kern is not.
        const gap = x - (lastX + lastW);
        if (gap > 1.2 && !current.endsWith(' ') && item.str && !item.str.startsWith(' ')) current += ' ';
      }
      current += item.str;
      if (item.hasEOL) {
        if (current.trim()) lines.push(current.replace(/\s+/g, ' ').trim());
        current = '';
        lastY = null;
        lastX = null;
        continue;
      }
      lastY = y;
      lastX = x;
      lastW = item.width;
    }
    if (current.trim()) lines.push(current.replace(/\s+/g, ' ').trim());
    lines.push('');
  }
  await doc.destroy();
  return { pages: doc.numPages, text: lines.join('\n'), lines };
}

const HEADINGS = ['Experience', 'Education', 'Projects', 'Skills'];

/**
 * ATS parse checks on extracted text.
 * @param {string} text
 * @param {{ email?: string, name?: string, phone?: string, expectWords?: string[] }} expect
 * @returns {{ ok: boolean, problems: string[], warnings: string[] }}
 */
export function checkAtsText(text, expect = {}) {
  const problems = [];
  const warnings = [];
  const src = String(text || '');
  const flat = src.replace(/\s+/g, ' ');

  if (!src.trim()) {
    problems.push('no text layer at all (image-only PDF)');
    return { ok: false, problems, warnings };
  }

  // Private-use / notdef glyphs mean a font without a ToUnicode map.
  const badGlyphs = src.match(/[\uFFFD\uE000-\uF8FF]/g);
  if (badGlyphs) problems.push(`${badGlyphs.length} unmapped glyph(s) — a font in this PDF has no Unicode mapping`);

  // Ligatures left as single code points: fine for humans, a miss for keyword matching.
  const lig = src.match(/[\uFB00-\uFB06]/g);
  if (lig) warnings.push(`${lig.length} ligature code point(s) (ﬁ ﬂ ﬀ) — some parsers do not fold them into letters`);

  // Kerning read as a word break: a capital, then a space, then the rest of a lowercase word.
  const splits = [...flat.matchAll(/\b([A-Z]) ([a-z]{3,})\b/g)]
    .map((m) => `${m[1]} ${m[2]}`)
    .filter((s) => !/^(A|I) /.test(s));
  if (splits.length) problems.push(`words split by kerning: ${[...new Set(splits)].slice(0, 6).join(', ')}`);

  // A word cut in two mid-lowercase ("Softw are").
  const midSplits = [...flat.matchAll(/\b([a-z]{2,})\s([a-z]{1,2})\b(?=[ ,.;])/g)]
    .map((m) => `${m[1]} ${m[2]}`)
    .filter((s) => !/\b(a|an|as|at|be|by|do|go|he|if|in|is|it|me|my|no|of|on|or|so|to|up|us|we)$/.test(s));
  if (midSplits.length > 2) warnings.push(`possible mid-word splits: ${[...new Set(midSplits)].slice(0, 5).join(', ')}`);

  if (expect.email && !flat.includes(expect.email)) problems.push(`e-mail "${expect.email}" is not readable as one token`);
  if (expect.name && !flat.includes(expect.name)) problems.push(`name "${expect.name}" is not readable as one token`);
  if (expect.phone) {
    const digits = expect.phone.replace(/\D/g, '');
    if (!flat.replace(/\D/g, '').includes(digits)) problems.push('phone number digits are not readable in order');
  }

  const missing = HEADINGS.filter((h) => !new RegExp(`(^|\\n|\\s)${h}(\\s|$)`, 'i').test(src));
  if (missing.length) problems.push(`section heading(s) not found as plain text: ${missing.join(', ')}`);

  for (const w of expect.expectWords || []) {
    if (!flat.toLowerCase().includes(String(w).toLowerCase())) warnings.push(`expected word not found in text layer: "${w}"`);
  }

  return { ok: problems.length === 0, problems, warnings };
}
