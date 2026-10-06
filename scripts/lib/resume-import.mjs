import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './common.mjs';
import { runPython } from './python-runtime.mjs';
import { extractPdfText } from './pdf-text.mjs';

export function proposeResumeContent(text, memory) {
  text = String(text).trim();
  if (text.length < 30) throw new Error('No readable resume content. Scanned documents need OCR outside Job Scout.');
  if (text.length > 100000) throw new Error('Resume text exceeds 100,000 characters.');
  const proposals = [{ path: 'facts.background.importedResume', value: text, uncertain: true,
    reason: 'Review extracted content and reading order; dates, roles, qualifications and metrics are not inferred.' }];
  const emails = [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])];
  if (emails.length === 1) proposals.push({ path: 'facts.links.email', value: emails[0], uncertain: false, reason: 'Single email found in source; verify ownership.' });
  return proposals.map(item => {
    const before = item.path.split('.').reduce((value, key) => value?.[key], memory);
    return { ...item, before: before ?? null, conflict: before != null && before !== '' && before !== item.value };
  });
}

export async function importResumeContent({ filename, base64 }, memory) {
  if (!/\.(pdf|docx)$/i.test(filename || '') || typeof base64 !== 'string' || base64.length > 12 * 1024 * 1024) throw new Error('Choose a readable PDF or DOCX up to 8 MB.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 8 * 1024 * 1024) throw new Error('File exceeds 8 MB.');
  let extracted;
  if (/\.pdf$/i.test(filename)) {
    extracted = await extractPdfText(bytes, { maxPages: 30 });
    extracted.warnings = ['Verify text order and uncertain extraction. No OCR or inferred employment dates.'];
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'job-scout-import-'));
    try {
      const path = join(dir, 'resume.docx'); await writeFile(path, bytes, { mode: 0o600 });
      const result = await runPython([join(ROOT, 'scripts/extract-resume-content.py'), path], { timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true });
      extracted = JSON.parse(result.stdout);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
  return { text: extracted.text, warnings: extracted.warnings, proposals: proposeResumeContent(extracted.text, memory) };
}
