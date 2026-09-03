/**
 * Export tailored CVs into <project-root>/downloads/<Company>/
 *   <Name> CV.pdf       ← ATS / portals
 *   <Name> CV Main.pdf  ← human-facing Main
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { ROOT } from './common.mjs';

/** Copy src → dest; if dest is locked (EBUSY/EPERM), try numbered fallbacks. */
async function safeCopyFile(src, dest) {
  try {
    await copyFile(src, dest);
    return dest;
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      const ext = dest.match(/(\.[^.]+)$/)?.[1] || '';
      const stem = dest.slice(0, dest.length - ext.length);
      for (let n = 2; n <= 9; n++) {
        const alt = `${stem} (${n})${ext}`;
        try { await copyFile(src, alt); return alt; } catch (e2) {
          if (e2.code !== 'EBUSY' && e2.code !== 'EPERM') throw e2;
        }
      }
    }
    throw err;
  }
}

/** Write content to dest; if locked, try numbered fallbacks. */
async function safeWriteFile(dest, content) {
  try {
    await writeFile(dest, content);
    return dest;
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      const ext = dest.match(/(\.[^.]+)$/)?.[1] || '';
      const stem = dest.slice(0, dest.length - ext.length);
      for (let n = 2; n <= 9; n++) {
        const alt = `${stem} (${n})${ext}`;
        try { await writeFile(alt, content); return alt; } catch (e2) {
          if (e2.code !== 'EBUSY' && e2.code !== 'EPERM') throw e2;
        }
      }
    }
    throw err;
  }
}

/** "Ada Lovelace Byron" → "Lovelace Byron" (matches moderncv short name when 3+ parts). */
export function cvFileBaseName(profileName) {
  const parts = String(profileName || 'Candidate')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 3) return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
  if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
  return parts[0] || 'Candidate';
}

export function safeFolderName(company) {
  const raw = String(company || 'Unknown')
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return raw || 'Unknown';
}

export function downloadsRoot() {
  return join(ROOT, 'downloads');
}

/**
 * Copy ATS/Main PDFs into downloads/<Company>/ under the project root.
 */
export async function exportCvDownloads({
  company,
  profileName,
  atsPdfPath = null,
  mainPdfPath = null,
  jobTitle = '',
} = {}) {
  const base = cvFileBaseName(profileName);
  const folder = safeFolderName(company);
  const dir = join(downloadsRoot(), folder);

  const mainSrc =
    (mainPdfPath && existsSync(mainPdfPath) && mainPdfPath) || null;
  const atsSrc =
    (atsPdfPath && existsSync(atsPdfPath) && atsPdfPath) || null;

  if (!mainSrc && !atsSrc) {
    return { error: 'No PDF sources to export', folder };
  }

  await mkdir(dir, { recursive: true });
  const files = [];
  let mainOut = null;
  let atsOut = null;

  // ATS / portal file → "<Name> CV.pdf" (no "ATS" in the filename)
  if (atsSrc) {
    atsOut = await safeCopyFile(atsSrc, join(dir, `${base} CV.pdf`));
    files.push(atsOut);
  }

  // Human-facing Main → "<Name> CV Main.pdf"
  if (mainSrc) {
    mainOut = await safeCopyFile(mainSrc, join(dir, `${base} CV Main.pdf`));
    files.push(mainOut);
  }

  const note = [
    `# ${company}`,
    '',
    jobTitle ? `Role: ${jobTitle}` : '',
    `Exported: ${new Date().toISOString()}`,
    '',
    atsOut ? `- \`${base} CV.pdf\` — ATS / portals` : '',
    mainOut ? `- \`${base} CV Main.pdf\` — main / human-facing` : '',
    '',
    `Path: \`${dir}\``,
    '',
  ]
    .filter(Boolean)
    .join('\n');
  await writeFile(join(dir, 'README.md'), `${note}\n`);

  return {
    dir,
    relativeDir: `downloads/${folder}`,
    absoluteDir: dir,
    projectDir: dir,
    projectRelativeDir: `downloads/${folder}`,
    main: mainOut,
    ats: atsOut,
    files,
    baseName: base,
    folder,
  };
}

/**
 * Write cover letter into the same downloads/<Company>/ folder as the CV.
 */
export async function exportCoverLetterDownloads({
  company,
  profileName,
  jobTitle = '',
  mdText = '',
  pdfPath = null,
  docxPath = null,
} = {}) {
  const base = cvFileBaseName(profileName);
  const folder = safeFolderName(company);
  const dir = join(downloadsRoot(), folder);
  await mkdir(dir, { recursive: true });

  const files = [];
  let mdOut = null;
  if (mdText) {
    mdOut = await safeWriteFile(join(dir, `${base} Cover Letter.md`), mdText.endsWith('\n') ? mdText : `${mdText}\n`);
    files.push(mdOut);
  }
  let pdfOut = null;
  if (pdfPath && existsSync(pdfPath)) {
    pdfOut = await safeCopyFile(pdfPath, join(dir, `${base} Cover Letter.pdf`));
    files.push(pdfOut);
  }
  let docxOut = null;
  if (docxPath && existsSync(docxPath)) {
    docxOut = await safeCopyFile(docxPath, join(dir, `${base} Cover Letter.docx`));
    files.push(docxOut);
  }

  const note = [
    `# ${company}`,
    '',
    jobTitle ? `Role: ${jobTitle}` : '',
    `Exported: ${new Date().toISOString()}`,
    '',
    `- \`${base} Cover Letter.md\``,
    pdfOut ? `- \`${base} Cover Letter.pdf\`` : '',
    docxOut ? `- \`${base} Cover Letter.docx\`` : '',
    existsSync(join(dir, `${base} CV.pdf`)) ? `- \`${base} CV.pdf\` — ATS / portals` : '',
    existsSync(join(dir, `${base} CV Main.pdf`)) ? `- \`${base} CV Main.pdf\` — main / human-facing` : '',
    '',
    `Path: \`${dir}\``,
    '',
  ]
    .filter(Boolean)
    .join('\n');
  await writeFile(join(dir, 'README.md'), `${note}\n`);

  return {
    dir,
    relativeDir: `downloads/${folder}`,
    absoluteDir: dir,
    files,
    md: mdOut,
    pdf: pdfOut,
    docx: docxOut,
    baseName: base,
    folder,
  };
}

/** Open company folder in Explorer (Windows) / Finder / xdg-open. */
export function revealDownloadsFolder(dir) {
  if (!dir || !existsSync(dir)) return { ok: false, error: 'Folder not found' };
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', dir], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
    }
    return { ok: true, dir };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
