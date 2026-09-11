/**
 * Export tailored CVs into <project-root>/downloads/<Company>/<Role>-<JobID>/
 *   <Name> CV.pdf       ← ATS / portals
 *   <Name> CV Main.pdf  ← human-facing Main
 */

import { copyFile, lstat, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { ROOT } from './common.mjs';
import { createHash } from 'node:crypto';
import { artifactContext } from './artifact-context.mjs';

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

/**
 * Document file names, as a German employer expects to receive them:
 * "Lebenslauf_Ada_Lovelace.pdf" and "Anschreiben_Ada_Lovelace.pdf".
 *
 * Underscores rather than spaces, because these travel through upload forms and
 * ATS parsers that still mangle spaces in filenames.
 */
function fileNameSlug(profileName) {
  return cvFileBaseName(profileName).replace(/\s+/g, '_');
}

export function cvDocumentName(profileName) {
  return `Lebenslauf_${fileNameSlug(profileName)}`;
}

export function letterDocumentName(profileName) {
  return `Anschreiben_${fileNameSlug(profileName)}`;
}

export function safeFolderName(company) {
  const raw = String(company || 'Unknown')
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const clean = raw.replace(/[. ]+$/g, '');
  if (!clean || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)) return 'Unknown';
  return clean;
}

export function downloadsRoot() {
  return join(ROOT, 'downloads');
}

export function jobDownloadFolder({ company, jobTitle = '', jobId } = {}) {
  if (!jobId) throw new Error('A job ID is required to export application documents');
  const suffix = createHash('sha256').update(String(jobId)).digest('hex').slice(0, 16);
  return join(safeFolderName(company), `${safeFolderName(jobTitle || 'Role')}-${suffix}`);
}

/** Clear only this role's export directory; refuse links or paths outside downloads. */
export async function clearJobDownloads({ exportRoot = downloadsRoot(), ...job } = {}) {
  const root = resolve(exportRoot);
  const target = resolve(root, jobDownloadFolder(job));
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error('Replacement folder must be inside downloads');
  }
  // Check ancestors too: a company folder or downloads itself may be a junction.
  for (let current = target; ; current = dirname(current)) {
    const stat = await lstat(current).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (stat?.isSymbolicLink()) throw new Error('Cannot replace documents through a linked folder');
    if (dirname(current) === current) break;
  }
  await rm(target, { recursive: true, force: true });
  return target;
}

/**
 * Copy ATS/Main PDFs into downloads/<Company>/<Role>-<JobID>/ under the project root.
 */
export async function exportCvDownloads({
  jobId,
  exportRoot = downloadsRoot(),
  company,
  profileName,
  atsPdfPath = null,
  mainPdfPath = null,
  jobTitle = '',
} = {}) {
  const base = cvFileBaseName(profileName);
  const cvName = cvDocumentName(profileName);
  const folder = jobDownloadFolder({ company, jobTitle, jobId });
  const dir = join(exportRoot, folder);
  if (artifactContext.getStore()) return { deferred: true, files: [] };

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
    atsOut = await safeCopyFile(atsSrc, join(dir, `${cvName}.pdf`));
    files.push(atsOut);
  }

  // Human-facing Main → "<Name> CV Main.pdf"
  if (mainSrc) {
    mainOut = await safeCopyFile(mainSrc, join(dir, `${cvName}_Main.pdf`));
    files.push(mainOut);
  }

  const note = [
    `# ${company}`,
    '',
    jobTitle ? `Role: ${jobTitle}` : '',
    `Exported: ${new Date().toISOString()}`,
    '',
    atsOut ? `- \`${cvName}.pdf\` — ATS / portals` : '',
    mainOut ? `- \`${cvName}_Main.pdf\` — main / human-facing` : '',
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
 * Write cover letter into the same downloads/<Company>/<Role>-<JobID>/ folder as the CV.
 */
export async function exportCoverLetterDownloads({
  jobId,
  exportRoot = downloadsRoot(),
  company,
  profileName,
  jobTitle = '',
  mdText = '',
  pdfPath = null,
  docxPath = null,
} = {}) {
  const base = cvFileBaseName(profileName);
  const cvName = cvDocumentName(profileName);
  const letterName = letterDocumentName(profileName);
  const folder = jobDownloadFolder({ company, jobTitle, jobId });
  const dir = join(exportRoot, folder);
  if (artifactContext.getStore()) return { deferred: true, files: [] };
  await mkdir(dir, { recursive: true });

  const files = [];
  let mdOut = null;
  if (mdText) {
    mdOut = await safeWriteFile(join(dir, `${letterName}.md`), mdText.endsWith('\n') ? mdText : `${mdText}\n`);
    files.push(mdOut);
  }
  let pdfOut = null;
  if (pdfPath && existsSync(pdfPath)) {
    pdfOut = await safeCopyFile(pdfPath, join(dir, `${letterName}.pdf`));
    files.push(pdfOut);
  }
  let docxOut = null;
  if (docxPath && existsSync(docxPath)) {
    docxOut = await safeCopyFile(docxPath, join(dir, `${letterName}.docx`));
    files.push(docxOut);
  }

  const note = [
    `# ${company}`,
    '',
    jobTitle ? `Role: ${jobTitle}` : '',
    `Exported: ${new Date().toISOString()}`,
    '',
    `- \`${letterName}.md\``,
    pdfOut ? `- \`${letterName}.pdf\`` : '',
    docxOut ? `- \`${letterName}.docx\`` : '',
    existsSync(join(dir, `${cvName}.pdf`)) ? `- \`${cvName}.pdf\` — ATS / portals` : '',
    existsSync(join(dir, `${cvName}_Main.pdf`)) ? `- \`${cvName}_Main.pdf\` — main / human-facing` : '',
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
