/**
 * Produce a PDF from HTML (Chrome/Edge headless) or LaTeX (tectonic, auto-downloaded).
 */

import { access, mkdir, writeFile, chmod, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { run, ROOT, workspaceDir } from './common.mjs';

const TECTONIC_VERSION = '0.16.9';

const WIN_BROWSERS = [
  join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];

async function findBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  for (const p of WIN_BROWSERS) {
    if (p && existsSync(p)) return p;
  }
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'msedge', 'chrome']) {
    try {
      await run(process.platform === 'win32' ? 'where' : 'which', [name]);
      return name;
    } catch {
      /* next */
    }
  }
  return null;
}

function fileUrl(absPath) {
  const normalized = absPath.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}

/**
 * Print an HTML file to PDF. Returns pdf path or null.
 */
export async function htmlFileToPdf(htmlPath, pdfPath) {
  const browser = await findBrowser();
  if (!browser) return { ok: false, error: 'No Chrome/Edge found for PDF export' };
  const absHtml = resolve(htmlPath);
  const absPdf = resolve(pdfPath);
  try {
    await access(absHtml);
  } catch {
    return { ok: false, error: `HTML file missing: ${absHtml}` };
  }
  await mkdir(dirname(absPdf), { recursive: true });
  try {
    await run(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-pdf-header-footer',
        '--allow-file-access-from-files',
        `--print-to-pdf=${absPdf}`,
        fileUrl(absHtml),
      ],
      { timeout: 90000, cwd: ROOT },
    );
    await access(absPdf);
    return { ok: true, path: absPdf, via: browser };
  } catch (err) {
    return { ok: false, error: err.stderr || err.message || String(err) };
  }
}

async function pathIfRunnable(bin) {
  try {
    await run(bin, ['--version'], { timeout: 15000 });
    return bin;
  } catch {
    return null;
  }
}

/** Download a portable tectonic binary into .workspace/bin if needed. */
export async function ensureTectonic() {
  const binDir = join(workspaceDir(), 'bin');
  const exe = join(binDir, process.platform === 'win32' ? 'tectonic.exe' : 'tectonic');
  if (existsSync(exe)) return exe;

  const onPath = await pathIfRunnable('tectonic');
  if (onPath) return onPath;

  await mkdir(binDir, { recursive: true });
  const asset =
    process.platform === 'win32'
      ? `tectonic-${TECTONIC_VERSION}-x86_64-pc-windows-msvc.zip`
      : process.platform === 'darwin'
        ? `tectonic-${TECTONIC_VERSION}-x86_64-apple-darwin.tar.gz`
        : `tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-gnu.tar.gz`;
  const url = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/${asset}`;

  const archivePath = join(binDir, asset);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download tectonic (${res.status}) from ${url}`);
  }
  await writeFile(archivePath, Buffer.from(await res.arrayBuffer()));

  if (asset.endsWith('.zip')) {
    // Prefer tar if available (Windows 10+), else PowerShell Expand-Archive
    try {
      await run('tar', ['-xf', archivePath, '-C', binDir], { timeout: 60000 });
    } catch {
      await run(
        'powershell',
        ['-NoProfile', '-Command', `Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${binDir}'`],
        { timeout: 60000 },
      );
    }
  } else {
    await run('tar', ['-xzf', archivePath, '-C', binDir], { timeout: 60000 });
  }

  if (!existsSync(exe)) {
    // Archive may unpack as plain "tectonic"
    const alt = join(binDir, 'tectonic');
    if (existsSync(alt) && process.platform === 'win32') {
      await run('powershell', ['-NoProfile', '-Command', `Move-Item -Force '${alt}' '${exe}'`]);
    }
  }
  if (existsSync(exe) && process.platform !== 'win32') {
    await chmod(exe, 0o755);
  }
  if (!existsSync(exe)) {
    throw new Error(`tectonic downloaded but binary not found at ${exe}`);
  }
  return exe;
}

/**
 * Count pages in a PDF. Prefers the /Pages /Count tree; falls back to /Type /Page objects.
 */
export function parsePdfPageCount(buf) {
  const s = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf ?? '');
  const near = [...s.matchAll(/\/Type\s*\/Pages[\s\S]{0,240}\/Count\s+(\d+)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n >= 1 && n < 80);
  if (near.length) return Math.max(...near);
  const pages = [...s.matchAll(/\/Type\s*\/Page(?![sA-Za-z])/g)].length;
  return pages || null;
}

export async function countPdfPages(pdfPath) {
  try {
    const buf = await readFile(pdfPath);
    return parsePdfPageCount(buf);
  } catch {
    return null;
  }
}

/** Try tectonic / latexmk / pdflatex on a .tex file. Auto-fetches tectonic once. */
export async function compileTexToPdf(texPath, outDir) {
  let tectonicBin = null;
  let tectonicError = '';
  try {
    tectonicBin = await ensureTectonic();
  } catch (err) {
    tectonicBin = null;
    tectonicError = err.message || String(err);
  }

  const engines = [];
  if (tectonicBin) {
    // Classic mode: tectonic file.tex  (writes pdf next to tex / cwd)
    engines.push([tectonicBin, [texPath, '--outdir', outDir]]);
  }
  engines.push(
    ['latexmk', ['-pdf', '-interaction=nonstopmode', `-outdir=${outDir}`, texPath]],
    ['pdflatex', ['-interaction=nonstopmode', `-output-directory=${outDir}`, texPath]],
  );

  const errors = [];
  for (const [bin, args] of engines) {
    try {
      await run(bin, args, { timeout: 300000, cwd: outDir });
      const base = texPath.replace(/\\/g, '/').split('/').pop().replace(/\.tex$/i, '.pdf');
      const pdfPath = join(outDir, base);
      await access(pdfPath);
      return { ok: true, path: pdfPath, via: bin };
    } catch (err) {
      errors.push(`${bin}: ${err.stderr || err.message || err}`);
    }
  }
  return {
    ok: false,
    error: `LaTeX compile failed. ${tectonicError ? `Tectonic setup: ${tectonicError}. ` : ''}${errors.slice(0, 2).join(' | ')}`,
  };
}
