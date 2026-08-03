/**
 * Export tailored CVs into <project-root>/downloads/<Company>/<Name> CV.pdf
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { ROOT } from './common.mjs';

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

  if (mainSrc) {
    mainOut = join(dir, `${base} CV.pdf`);
    await copyFile(mainSrc, mainOut);
    files.push(mainOut);
  } else if (atsSrc) {
    mainOut = join(dir, `${base} CV.pdf`);
    await copyFile(atsSrc, mainOut);
    files.push(mainOut);
  }

  if (atsSrc) {
    atsOut = join(dir, `${base} CV ATS.pdf`);
    await copyFile(atsSrc, atsOut);
    if (!files.includes(atsOut)) files.push(atsOut);
  }

  const note = [
    `# ${company}`,
    '',
    jobTitle ? `Role: ${jobTitle}` : '',
    `Exported: ${new Date().toISOString()}`,
    '',
    mainOut ? `- \`${base} CV.pdf\` — main / human-facing` : '',
    atsOut ? `- \`${base} CV ATS.pdf\` — ATS / portals` : '',
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
