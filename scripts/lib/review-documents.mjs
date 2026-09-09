import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractPdfText } from './pdf-text.mjs';

export const DOCUMENT_FILES = {
  cv: ['cv.md', 'cv.html', 'cv.pdf', 'cv-ats.pdf', 'cv-main.pdf'],
  letter: ['cover-letter.md', 'cover-letter.html', 'cover-letter.docx', 'cover-letter.pdf'],
};

export async function documentFingerprint(dir, scope) {
  const hash = createHash('sha256');
  for (const name of DOCUMENT_FILES[scope]) {
    const bytes = await readFile(join(dir, name)).catch((e) => { if (e.code !== 'ENOENT') throw e; return null; });
    hash.update(name).update(bytes ? 'present' : 'missing');
    if (bytes) hash.update(bytes);
  }
  return hash.digest('hex');
}

export async function stageFinalDocumentText(dir, scope, extract = extractPdfText) {
  const sections = [];
  for (const name of DOCUMENT_FILES[scope].filter((n) => n.endsWith('.pdf'))) {
    try { await readFile(join(dir, name)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    const pdf = await extract(join(dir, name));
    if (pdf.pages !== 1 || !pdf.text.trim()) throw new Error(`${name}: final PDF must have one page and readable text`);
    sections.push(`## ${name} — ${pdf.pages} page\n${pdf.text}`);
  }
  if (!sections.length) throw new Error('No final PDF available for review');
  const name = scope === 'cv' ? 'cv-final-text.md' : 'letter-final-text.md';
  await writeFile(join(dir, name), sections.join('\n\n'));
  return name;
}

export async function reviewStatusReason(dir, scope, review) {
  if (!review) return null; // Fast mode has no LLM review.
  if (review.verdict !== 'pass') return review.error || `Reviewer: ${review.verdict === 'not_reviewed' ? 'Not reviewed' : 'unresolved Must fix items'}`;
  if (!review.documentFingerprint || review.documentFingerprint !== await documentFingerprint(dir, scope)) {
    return 'Review does not match the final documents';
  }
  return null;
}
