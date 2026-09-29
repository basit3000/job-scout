/** Overleaf sync, PDF rendering, integrity checks, and explicit validated publishing. */

import { mkdir, readFile, writeFile, copyFile, readdir, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { run, loadDotEnv, workspaceDir } from './common.mjs';
import { stageFinalDocumentText, reviewStatusReason } from './review-documents.mjs';
import { compileTexToPdf, htmlFileToPdf, countPdfPages } from './pdf.mjs';
import { overleafTexToHtml } from './tex-html.mjs';
import { applyNextFitPass, ensureAtsTextLayer, experienceItemCount } from './tex-fit.mjs';
import {
  applyJobAwareOptionalDrops,
  applyNextOptionalSpaceDrop,
  ensureOptionalLines,
  loadOptionalLines,
} from './cv-optional.mjs';
import { checkAtsText, extractPdfText } from './pdf-text.mjs';

loadDotEnv();

export function overleafDir() {
  return join(workspaceDir(), 'overleaf');
}

export function overleafConfigured() {
  loadDotEnv();
  const token = process.env.OVERLEAF_GIT_TOKEN || '';
  const id = process.env.OVERLEAF_PROJECT_ID || '';
  return Boolean(token.trim() && id.trim());
}

export function overleafStatus() {
  const configured = overleafConfigured();
  return {
    configured,
    projectIdSet: Boolean((process.env.OVERLEAF_PROJECT_ID || '').trim()),
    tokenSet: Boolean((process.env.OVERLEAF_GIT_TOKEN || '').trim()),
    localClone: existsSync(join(overleafDir(), '.git')),
    hint: configured
      ? 'Overleaf credentials found in .env'
      : 'Set OVERLEAF_GIT_TOKEN and OVERLEAF_PROJECT_ID in .env (Menu → Sync → Git on Overleaf)',
  };
}

function gitUrl() {
  const token = process.env.OVERLEAF_GIT_TOKEN.trim();
  const id = process.env.OVERLEAF_PROJECT_ID.trim();
  return `https://git:${token}@git.overleaf.com/${id}`;
}

export async function syncOverleaf() {
  if (!overleafConfigured()) {
    throw new Error(
      'Overleaf not configured. Add OVERLEAF_GIT_TOKEN and OVERLEAF_PROJECT_ID to .env',
    );
  }
  const dest = overleafDir();
  await mkdir(workspaceDir(), { recursive: true });
  if (existsSync(join(dest, '.git'))) {
    try {
      await run('git', ['-C', dest, 'pull', '--rebase', '--autostash'], { timeout: 120000 });
    } catch {
      // Dirty tree from a prior failed run — stash, pull, keep going
      try {
        await run('git', ['-C', dest, 'stash', 'push', '-u', '-m', 'job-scout-sync'], {
          timeout: 30000,
        });
      } catch {
        /* ignore */
      }
      await run('git', ['-C', dest, 'pull', '--rebase'], { timeout: 120000 });
    }
    return { dest, action: 'pulled' };
  }
  if (existsSync(dest)) {
    // Incomplete dir — remove is dangerous; try clone into temp name
    throw new Error(
      `.workspace/overleaf exists but is not a git repo. Delete it and retry.`,
    );
  }
  await run('git', ['clone', '--depth', '1', gitUrl(), dest], { timeout: 180000 });
  return { dest, action: 'cloned' };
}

async function listTexFiles(dir) {
  const names = await readdir(dir);
  return names.filter((n) => n.endsWith('.tex'));
}

async function pageCountForTex(dir, texName) {
  const texPath = join(dir, texName);
  if (!existsSync(texPath)) return { pages: null, error: `${texName} not found` };
  const outDir = join(dir, '.cv-build');
  await mkdir(outDir, { recursive: true });
  const compiled = await compileTexToPdf(texPath, outDir);
  if (!compiled.ok) return { pages: null, error: compiled.error };
  const pages = await countPdfPages(compiled.path);
  return { pages, path: compiled.path, via: compiled.via };
}

async function fitOneTexToOnePage(dir, name, job = null) {
  const path = join(dir, name);
  let tex = await readFile(path, 'utf8');
  const expBefore = experienceItemCount(tex);
  const applied = [];
  const actions = [];

  const restored = ensureOptionalLines(tex, loadOptionalLines());
  if (restored.changed) {
    tex = restored.tex;
    actions.push(`restored optional lines: ${restored.added.join('; ')}`);
    await writeFile(path, tex);
  }

  if (job) {
    const drops = applyJobAwareOptionalDrops(tex, job);
    if (drops.changed) {
      tex = drops.tex;
      actions.push(...drops.actions);
      await writeFile(path, tex);
    }
  }

  let last = await pageCountForTex(dir, name);
  if (last.pages == null) {
    return { ok: false, skipped: true, reason: last.error, pages: null, applied, actions };
  }
  if (last.pages === 1) {
    return { ok: true, pages: 1, applied, already: true, actions };
  }

  while (last.pages > 1) {
    const next = applyNextFitPass(tex, applied);
    if (next.changed) {
      if (experienceItemCount(next.tex) < expBefore) break;
      tex = next.tex;
      applied.push(next.pass);
      await writeFile(path, tex);
      last = await pageCountForTex(dir, name);
      if (last.pages == null) {
        return { ok: false, skipped: true, reason: last.error, pages: null, applied, actions };
      }
      continue;
    }
    const space = applyNextOptionalSpaceDrop(tex, applied);
    if (!space.changed) break;
    if (experienceItemCount(space.tex) < expBefore) break;
    tex = space.tex;
    applied.push(space.pass);
    actions.push(space.label);
    await writeFile(path, tex);
    last = await pageCountForTex(dir, name);
    if (last.pages == null) {
      return { ok: false, skipped: true, reason: last.error, pages: null, applied, actions };
    }
  }

  return {
    ok: last.pages === 1,
    pages: last.pages,
    applied,
    overflow: last.pages > 1,
    actions,
  };
}

/**
 * Compile-check main.tex and ats.tex. Restore optional extras, drop ones the
 * posting does not need, then squeeze. Never drop Experience bullets.
 */
export async function fitOverleafCvsToOnePage(job = null, { prepDir } = {}) {
  const dir = overleafDir();
  const files = await listTexFiles(dir);
  const targets = ['ats.tex', 'main.tex'].filter((n) => files.includes(n));
  if (targets.includes('ats.tex')) {
    const path = join(dir, 'ats.tex');
    const r = ensureAtsTextLayer(await readFile(path, 'utf8'));
    if (r.changed) await writeFile(path, r.tex);
  }
  const perFile = {};
  for (const name of targets) {
    perFile[name] = await fitOneTexToOnePage(dir, name, job);
  }
  const pages = Object.fromEntries(
    Object.entries(perFile).map(([k, v]) => [k, v.pages]),
  );
  const ok = targets.length > 0 && targets.every((n) => perFile[n]?.pages === 1);
  if (prepDir) {
    try {
      const lines = ['# Page check', '', 'Never drops Experience. Optional: courses, spoken languages, certificates.', ''];
      for (const name of targets) {
        const f = perFile[name];
        lines.push(`## ${name}`, '');
        lines.push(`Pages after content cuts: ${f.pages ?? '?'}${f.ok ? ' (one page)' : ''}`);
        for (const a of f.actions || []) lines.push(`- ${a}`);
        if (f.applied?.length) lines.push(`- fit passes: ${f.applied.join(', ')}`);
        if (f.overflow) lines.push('- Needs review: complete PDF preserved; shorten or adjust the layout.');
        lines.push('');
      }
      await writeFile(join(prepDir, 'page-check.md'), `${lines.join('\n').trim()}\n`);
    } catch {
      /* optional */
    }
  }
  return { ok, files: perFile, pages, targets };
}

async function cleanOverleafArtifacts(dir) {
  await rm(join(dir, '.cv-build'), { recursive: true, force: true });
  for (const n of ['main.pdf', 'ats.pdf', 'cv.pdf', 'resume.pdf']) {
    try {
      await unlink(join(dir, n));
    } catch {
      /* missing is fine */
    }
  }
}

export async function readOverleafAts() {
  const dir = overleafDir();
  for (const name of ['ats.tex', 'main.tex', 'cv.tex', 'resume.tex']) {
    try {
      return { name, text: await readFile(join(dir, name), 'utf8') };
    } catch {
      /* next */
    }
  }
  return null;
}

export async function pushOverleaf(message) {
  const dir = overleafDir();
  await cleanOverleafArtifacts(dir);
  const { stdout: status } = await run('git', ['-C', dir, 'status', '--porcelain']);
  if (!String(status || '').trim()) {
    return { pushed: false, reason: 'no changes' };
  }
  await run('git', ['-C', dir, 'add', '-A']);
  await run('git', [
    '-C',
    dir,
    'commit',
    '-m',
    message || 'Tailor CV via Job Scout',
  ]);
  await run('git', ['-C', dir, 'push'], { timeout: 120000 });
  return { pushed: true };
}

/**
 * Compile one named .tex into destPdf.
 */
export async function compileOverleafTex(texName, destPdf) {
  const dir = overleafDir();
  const texPath = join(dir, texName);
  if (!existsSync(texPath)) {
    return { ok: false, error: `${texName} not found`, source: texName };
  }
  const result = await compileTexToPdf(texPath, dir);
  if (!result.ok) return { ...result, source: texName };
  await mkdir(dirname(destPdf), { recursive: true });
  await copyFile(result.path, destPdf);
  const pages = await countPdfPages(destPdf);
  return { ok: true, path: destPdf, via: result.via, source: texName, pages };
}

/** When LaTeX fails (e.g. moderncv + tectonic on Windows), print tex→HTML→PDF. */
async function compileTexViaHtmlFallback(texName, destPdf, prepDir) {
  try {
    // Repair corrupted Skills before rendering (main.tex often still broken from older runs)
    await repairSkillsIfNeeded(overleafDir(), texName);
    const texPath = join(overleafDir(), texName);
    const tex = await readFile(texPath, 'utf8');
    const html = overleafTexToHtml(tex, {
      jobTitle: texName.replace(/\.tex$/i, ''),
      company: 'Overleaf',
      photoPath: texPath,
    });
    const htmlPath = join(prepDir, `${texName.replace(/\.tex$/i, '')}.print.html`);
    await writeFile(htmlPath, html);
    const printed = await htmlFileToPdf(htmlPath, destPdf);
    if (!printed.ok) return { ok: false, error: printed.error, source: texName };
    // Sanity: empty / tiny PDF means the HTML converter failed
    const { stat } = await import('node:fs/promises');
    const size = (await stat(destPdf)).size;
    if (size < 4000) {
      return {
        ok: false,
        error: `HTML fallback PDF too small (${size} bytes) — converter likely missed content`,
        source: texName,
      };
    }
    return { ok: true, path: destPdf, via: `html-fallback:${printed.via}`, source: texName, bytes: size };
  } catch (err) {
    return { ok: false, error: err.message || String(err), source: texName };
  }
}

/**
 * Compile ats.tex and/or main.tex into prep dir as cv-ats.pdf / cv-main.pdf.
 * Also writes cv.pdf as alias of ATS (else Main).
 */
export async function compileOverleafPdfs(prepDir) {
  const dir = overleafDir();
  const files = await listTexFiles(dir);
  await mkdir(prepDir, { recursive: true });
  const results = { ats: null, main: null, alias: null };

  async function compileOne(texName, destName) {
    let result = await compileOverleafTex(texName, join(prepDir, destName));
    if (!result.ok) {
      result = await compileTexViaHtmlFallback(texName, join(prepDir, destName), prepDir);
    }
    if (result.ok && (result.pages == null || result.pages > 1)) {
      result = { ...result, needsReview: true, reviewReason: 'One-page fit could not be verified; complete PDF preserved.' };
    }
    return result;
  }

  if (files.includes('ats.tex')) {
    results.ats = await compileOne('ats.tex', 'cv-ats.pdf');
  }
  if (files.includes('main.tex')) {
    results.main = await compileOne('main.tex', 'cv-main.pdf');
  }

  // Fallback single-file projects
  if (!results.ats && !results.main) {
    const order = ['cv.tex', 'resume.tex'];
    const tex = order.find((n) => files.includes(n)) || files[0];
    if (tex) {
      results.ats = await compileOne(tex, 'cv-ats.pdf');
    }
  }

  const aliasSrc = results.ats?.ok
    ? join(prepDir, 'cv-ats.pdf')
    : results.main?.ok
      ? join(prepDir, 'cv-main.pdf')
      : null;
  if (aliasSrc) {
    await copyFile(aliasSrc, join(prepDir, 'cv.pdf'));
    results.alias = 'cv.pdf';
  }

  const ok = Boolean(results.ats?.ok || results.main?.ok);
  const viaParts = [results.ats?.ok && results.ats.via, results.main?.ok && results.main.via].filter(Boolean);
  const via = viaParts.join(' + ') || null;
  const error = ok
    ? null
    : [results.ats?.error, results.main?.error].filter(Boolean).join(' | ') || 'No PDF compiled';
  const pages = {
    ats: results.ats?.pages ?? null,
    main: results.main?.pages ?? null,
  };

  // Read the parser copy back the way an ATS does and keep the verdict with the pack.
  let atsText = null;
  const parsePath = results.ats?.ok ? join(prepDir, 'cv-ats.pdf') : results.main?.ok ? join(prepDir, 'cv-main.pdf') : null;
  if (parsePath) {
    atsText = await checkPdfTextLayer(parsePath, dir);
    try {
      await writeFile(join(prepDir, 'cv-ats.txt'), `${atsText.text || ''}\n`);
    } catch {
      /* the text dump is a convenience */
    }
  }

  return {
    ok,
    via,
    error,
    hasAts: Boolean(results.ats?.ok),
    hasMain: Boolean(results.main?.ok),
    ats: results.ats,
    main: results.main,
    alias: results.alias,
    pages,
    atsText: atsText ? { ok: atsText.ok, problems: atsText.problems, warnings: atsText.warnings } : null,
  };
}

/** Contact facts to look for in the text layer come from the .tex header itself. */
async function checkPdfTextLayer(pdfPath, texDir) {
  try {
    const { text, pages } = await extractPdfText(pdfPath);
    const expect = {};
    try {
      const ats = await readFile(join(texDir, 'ats.tex'), 'utf8');
      const email = ats.match(/mailto:([^}\s]+)/);
      if (email) expect.email = email[1];
      const phone = ats.match(/(\+\d[\d\s]{7,}\d)/);
      if (phone) expect.phone = phone[1].trim();
    } catch {
      /* optional */
    }
    const verdict = checkAtsText(text, expect);
    return { ...verdict, text, pages };
  } catch (err) {
    return { ok: false, problems: [`text-layer check failed: ${err.message || err}`], warnings: [], text: '' };
  }
}

/**
 * After a Goose worker edited Overleaf: sync (optional push leftover), compile PDFs.
 * Does not run keyword reorder — the agent already tailored the .tex.
 */
export async function assembleOverleafAfterAgent({
  push = false,
  job,
  prepDir,
  onEvent = null,
}) {
  const emit = (line, stream = 'meta') => {
    if (typeof onEvent === 'function') onEvent({ stream, line: String(line), t: Date.now() });
  };
  // Do not pull — the agent just edited `.workspace/overleaf`. A pull would
  // stash those edits and waste the tailor pass.
  emit('Fitting Overleaf CVs to one page…');
  const fit = await fitOverleafCvsToOnePage(job, { prepDir });
  emit('Compiling Overleaf PDFs into the prep pack…');
  const pdf = await compileOverleafPdfs(prepDir);
  await recordOverleafSources(prepDir);
  const pushResult = push ? await pushValidatedOverleaf({ job, prepDir }) : { pushed: false, reason: 'deferred until final validation' };
  if (pdf.atsText) {
    if (pdf.atsText.ok) emit(`ATS text layer: clean${pdf.atsText.warnings.length ? ` (${pdf.atsText.warnings.length} note(s) in README)` : ''}`, 'ok');
    else emit(`ATS text layer: ${pdf.atsText.problems.join('; ')}`, 'stderr');
  }
  return {
    sync: { action: 'skipped-after-agent' },
    tailor: { edited: ['agent'], changed: true },
    fit,
    push: pushResult,
    pdf,
    overleafDir: overleafDir(),
    via: 'agent',
  };
}

async function overleafSourceFingerprint() {
  const hash = createHash('sha256');
  for (const name of ['main.tex', 'ats.tex']) {
    const content = await readFile(join(overleafDir(), name)).catch((e) => { if (e.code !== 'ENOENT') throw e; return null; });
    hash.update(name).update(content ? 'present' : 'missing');
    if (content) hash.update(content);
  }
  return hash.digest('hex');
}

async function recordOverleafSources(prepDir) {
  await writeFile(join(prepDir, 'overleaf-source.json'), JSON.stringify({ fingerprint: await overleafSourceFingerprint() }));
}

export async function pushValidatedOverleaf({ job, prepDir, push = pushOverleaf,
  stageText = stageFinalDocumentText, sourceFingerprint = overleafSourceFingerprint }) {
  // Do not publish a different job's working tree or an unvalidated final PDF.
  const receipt = JSON.parse(await readFile(join(prepDir, 'overleaf-source.json'), 'utf8'));
  if (receipt.fingerprint !== await sourceFingerprint()) throw new Error('Overleaf sources changed since PDF generation');
  await stageText(prepDir, 'cv');
  const summary = JSON.parse(await readFile(join(prepDir, 'review-summary.json'), 'utf8').catch(() => '{}'));
  const reason = await reviewStatusReason(prepDir, 'cv', summary.cv);
  if (reason) throw new Error(reason);
  return push(`Tailor CV for ${job.title || 'role'} @ ${job.company || 'company'}`);
}
