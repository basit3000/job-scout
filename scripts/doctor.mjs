#!/usr/bin/env node
/** Local checks only; optional rendering uses synthetic documents, never a CV. */
import { existsSync } from 'node:fs';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join, delimiter } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, loadDotEnv, run } from './lib/common.mjs';
import { runPython } from './lib/python-runtime.mjs';
import { findBrowser, htmlFileToPdf } from './lib/pdf.mjs';

loadDotEnv();
const flags = new Set(process.argv.slice(2));
const known = new Set(['--goose', '--git', '--browser', '--render-html', '--cv-tools', '--skills']);
for (const flag of flags) {
  if (!known.has(flag)) throw new Error(`Unknown doctor option: ${flag}`);
}
const manifest = JSON.parse(await readFile(join(ROOT, 'toolchain.windows.json'), 'utf8'));
function localTool(name) {
  const spec = manifest[name];
  const exe = join(ROOT, '.workspace', 'tools', `${name}-${spec.version}`, spec.executable);
  return process.platform === 'win32' && existsSync(exe) ? exe : name;
}
if (process.platform === 'win32') {
  const paths = Object.keys(manifest).map(localTool).filter((exe) => existsSync(exe)).map(dirname);
  process.env.PATH = [...paths, process.env.PATH || ''].join(delimiter);
}
let failures = 0;
async function check(name, fn) {
  try { console.log(`OK   ${name}: ${await fn()}`); }
  catch {
    // Do not echo arbitrary CLI stderr, profile contents or environment secrets.
    failures++;
    console.error(`FAIL ${name}. See docs/windows-setup.md for repair steps.`);
  }
}
await check('Node', async () => {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Unsupported Node');
  return process.versions.node;
});
await check('Node packages', async () => {
  const require = createRequire(import.meta.url);
  for (const name of ['docx', 'pdfjs-dist', 'playwright-core']) require.resolve(name);
  await import('docx');
  await import('playwright-core');
  return 'dependencies resolve and document/browser packages load';
});
await check('Python + JobSpy (same interpreter as fetch)', async () => {
  const { stdout } = await runPython(['-c', 'import sys, jobspy; from importlib.metadata import version; assert sys.version_info >= (3,10); print(sys.version.split()[0] + " / JobSpy " + version("python-jobspy"))'], {
    cwd: ROOT, env: process.env, timeout: 60000,
  });
  return stdout.trim();
});
const browser = await findBrowser();
if (flags.has('--browser') || flags.has('--render-html')) {
  await check('Chrome/Edge', async () => {
    if (!browser) throw new Error('Browser missing');
    return 'detected';
  });
} else {
  console.log(browser ? 'INFO Chrome/Edge detected (optional)' : 'INFO Chrome/Edge missing (optional; needed for Fill and HTML PDFs)');
}
if (flags.has('--git')) await check('Git', async () => (await run(localTool('git'), ['--version'], { timeout: 15000 })).stdout.trim());
if (flags.has('--goose')) {
  await check('Goose executable', async () => (await run(localTool('goose'), ['--version'], { timeout: 30000 })).stdout.trim());
  await check('Goose review recipe (no model call)', async () => {
    await run(localTool('goose'), ['recipe', 'validate', join(ROOT, 'docs', 'goose', 'review.recipe.json')], { cwd: ROOT, timeout: 30000 });
    return 'valid';
  });
}
if (flags.has('--skills')) {
  for (const name of ['cv-review', 'cv-repair', 'cv-update']) {
    await check(`Skill ${name}`, async () => {
      const text = await readFile(join(ROOT, '.agents', 'skills', name, 'SKILL.md'), 'utf8');
      if (!/^---\r?\n/.test(text) || !/^name: .+/m.test(text) || !/^description: .+/m.test(text)) throw new Error('Invalid skill');
      return 'present';
    });
  }
}
if (flags.has('--render-html') || flags.has('--cv-tools')) {
  const parent = join(ROOT, '.workspace', 'setup', 'checks');
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(join(parent, 'render-'));
  const marker = 'Job Scout setup check';
  async function verifyPdf(path) {
    const { extractPdfText } = await import('./lib/pdf-text.mjs');
    const result = await extractPdfText(path);
    if (result.pages !== 1 || !result.text.includes(marker)) throw new Error('PDF check failed');
    return 'one page with extractable text';
  }
  if (flags.has('--render-html')) await check('HTML PDF rendering', async () => {
    const html = join(dir, 'check.html');
    const pdf = join(dir, 'html.pdf');
    await writeFile(html, `<!doctype html><meta charset="utf-8"><title>Setup check</title><h1>${marker}</h1><p>Synthetic document.</p>`);
    const result = await htmlFileToPdf(html, pdf);
    if (!result.ok) throw new Error('Browser rendering failed');
    return verifyPdf(pdf);
  });
  if (flags.has('--cv-tools')) await check('LaTeX PDF rendering', async () => {
    const tex = join(dir, 'check.tex');
    await writeFile(tex, `\\documentclass{article}\n\\begin{document}\n${marker}\n\\end{document}\n`);
    await run(localTool('tectonic'), [tex, '--outdir', dir], { cwd: ROOT, timeout: 300000, maxBuffer: 4 * 1024 * 1024 });
    return verifyPdf(join(dir, 'check.pdf'));
  });
}
console.log(failures ? `${failures} required check(s) failed.` : 'Selected checks passed. Profile completion and agent login are separate steps.');
process.exitCode = failures ? 1 : 0;
