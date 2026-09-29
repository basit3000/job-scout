import { extractPdfText, checkAtsText } from './pdf-text.mjs';

export const MAX_ATS_PDF_BYTES = 10 * 1024 * 1024;
export async function inspectAtsPdf(bytes, keywords = []) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_ATS_PDF_BYTES) throw new Error('Choose a PDF of up to 10 MB.');
  if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('The file is not a PDF.');
  if (!Array.isArray(keywords) || keywords.length > 50 || keywords.some(word => typeof word !== 'string' || word.length > 80)) throw new Error('Use up to 50 keywords, each up to 80 characters.');
  const { pages, text } = await extractPdfText(bytes, { maxPages: 10 });
  const parsed = checkAtsText(text);
  const { problems, warnings } = parsed;
  if (!/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text)) warnings.push('No readable email address found.');
  if (pages > 2) warnings.push(`The PDF has ${pages} pages; check whether all pages belong in this CV.`);
  const flat = text.replace(/\s+/g, ' ').toLowerCase();
  const coverage = [...new Set(keywords.map(word => word.trim()).filter(Boolean))].map(keyword => {
    const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { keyword, found: new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(flat) };
  });
  return { status: problems.length ? 'problems' : warnings.length ? 'warnings' : 'clear', pages, problems, warnings, keywords: coverage, text,
    explanation: 'Local PDF text-readability checks, not an employer ATS test or a hiring score. Visual layout and reading order still need human review. Missing keywords are observations, not instructions to add unsupported skills.' };
}
