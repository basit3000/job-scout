import { createHash, randomUUID } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ROOT, loadJson, prepDir, workspaceDir } from './common.mjs';
import { artifactContext } from './artifact-context.mjs';
import { extractPdfText } from './pdf-text.mjs';
import { reviewStatusReason } from './review-documents.mjs';

const MANIFEST = 'generation.json';
const activeJobs = new Set();
const CV_FILES = ['cv.md', 'cv.html', 'cv.pdf', 'cv-ats.pdf', 'cv-main.pdf', 'instructions.md', 'review.md', 'cv-final-text.md'];
const LETTER_FILES = ['cover-letter.md', 'cover-letter.html', 'cover-letter.pdf', 'cover-letter.docx', 'cover-letter-review.md', 'letter-final-text.md'];
const readText = (path) => readFile(path, 'utf8').catch(() => '');
const exists = (path) => access(path).then(() => true, () => false);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => [k, canonical(value[k])]),
  );
  return value;
}

export async function loadPrepInputs(settings = {}, root = ROOT) {
  const sources = settings.source === 'overleaf'
    ? (await readdir(join(root, '.workspace', 'overleaf')).catch(() => []))
      .filter((name) => name.endsWith('.tex')).sort().map((name) => `.workspace/overleaf/${name}`)
    : [await exists(join(root, 'cv', 'resume.md')) ? 'cv/resume.md' : 'cv/resume.txt'];
  const paths = [...sources, 'cv/cover-letter.md', 'cv/cover-letter-notes.md'];
  return Object.fromEntries(await Promise.all(paths.map(async (p) => [p, await readText(join(root, p))])));
}

export function prepFingerprint({ job, profile, settings = {}, inputs = {}, scope, instructions = '', mode }) {
  const sourceInputs = Object.fromEntries(Object.entries(inputs).filter(([p]) =>
    scope === 'letter' || !p.includes('cover-letter')));
  return createHash('sha256').update(JSON.stringify(canonical({
    version: 1, scope, instructions, mode: mode || settings.tailorMode || 'agent',
    job: { id: job.id, title: job.title, company: job.company, description: job.description || '', url: job.url },
    profile, inputs: sourceInputs,
    settings: { source: settings.source || 'local', agentProvider: settings.agentProvider, agentModel: settings.agentModel },
  }))).digest('hex');
}

export function assessPrep(manifest, context, { cv = true, letter = true, instructions, mode } = {}) {
  const state = {};
  for (const scope of ['cv', 'letter']) {
    if (!(scope === 'cv' ? cv : letter)) continue;
    const saved = manifest?.[scope];
    const fingerprint = prepFingerprint({ ...context, scope,
      instructions: instructions ?? saved?.instructions ?? '', mode: mode ?? saved?.mode });
    state[scope] = !saved ? 'outdated' : saved.needsReview ? 'needs-review'
      : saved.fingerprint === fingerprint ? 'current' : 'outdated';
  }
  return state;
}

export async function prepStatus(job, profile, settings, options = {}) {
  const inputs = options.inputs || await loadPrepInputs(settings);
  const manifest = await loadJson(join(prepDir(job.id), MANIFEST), null);
  const state = assessPrep(manifest, { job, profile, settings, inputs }, options);
  const reviews = await loadJson(join(prepDir(job.id), 'review-summary.json'), {});
  for (const scope of Object.keys(state)) {
    if (state[scope] === 'current' && await reviewStatusReason(prepDir(job.id), scope, reviews[scope])) state[scope] = 'needs-review';
  }
  return state;
}

export async function inspectDocuments(dir, scopes) {
  const files = await readdir(dir);
  const review = await loadJson(join(dir, 'review-summary.json'), {});
  const reports = {};
  for (const scope of scopes) {
    const pdfs = files.filter((f) => scope === 'cv' ? /^cv(?:-ats|-main)?\.pdf$/.test(f) : f === 'cover-letter.pdf');
    const reasons = [];
    if (!pdfs.length) reasons.push('PDF was not generated');
    for (const name of pdfs) {
      try {
        const pdf = await extractPdfText(join(dir, name));
        if (pdf.pages !== 1) reasons.push(`${name}: ${pdf.pages} pages; complete document preserved`);
        if (!pdf.text.trim()) reasons.push(`${name}: no readable text`);
      } catch {
        reasons.push(`${name}: could not verify PDF pages and text`);
      }
    }
    const reviewReason = await reviewStatusReason(dir, scope, review[scope]);
    if (reviewReason) reasons.push(reviewReason);
    reports[scope] = { needsReview: reasons.length > 0, reasons };
  }
  return reports;
}

/** Stage all writes; retain the accepted pack and exports if generation fails.
 * Failed/overflow drafts remain inspectable in prep-history, never cropped.
 */
export async function generateDocuments({ job, profile, settings, instructions = '', mode, scopes,
  root = workspaceDir(), inspect = inspectDocuments }, generate) {
  if (activeJobs.has(job.id)) throw new Error('Preparation is already running for this job');
  const accepted = root === workspaceDir() ? prepDir(job.id) : join(root, 'prep', createHash('sha256').update(job.id).digest('hex'));
  activeJobs.add(job.id);
  const history = join(root, 'prep-history', randomUUID());
  const staged = join(root, 'prep-staging', randomUUID());
  let hadAccepted = false;
  try {
    const inputSnapshot = await loadPrepInputs(settings);
    await mkdir(staged, { recursive: true });
    hadAccepted = await exists(accepted);
    if (hadAccepted) await cp(accepted, staged, { recursive: true });
    const reviews = await loadJson(join(staged, 'review-summary.json'), {});
    for (const scope of scopes) delete reviews[scope];
    await writeFile(join(staged, 'review-summary.json'), JSON.stringify(reviews, null, 2));
    // Attempts belong to this generation; the old ledger stays in prep-history.
    await unlink(join(staged, 'agent-session.json')).catch((e) => { if (e.code !== 'ENOENT') throw e; });
    for (const name of scopes.flatMap((s) => s === 'cv' ? CV_FILES : LETTER_FILES)) {
      await unlink(join(staged, name)).catch((err) => { if (err.code !== 'ENOENT') throw err; });
    }
    const result = await artifactContext.run({ jobId: job.id, dir: staged }, () => generate(staged));
    const reports = await inspect(staged, scopes);
    if (result.coverLetterError && reports.letter) {
      reports.letter.needsReview = true;
      reports.letter.reasons.push(result.coverLetterError);
    }
    // Local generation uses the source captured before work starts. Overleaf
    // (and explicit updateMaster) also updates that source as part of the run.
    const inputs = settings.source === 'overleaf' || settings.updateMaster
      ? await loadPrepInputs(settings) : inputSnapshot;
    const manifest = await loadJson(join(staged, MANIFEST), {});
    for (const scope of scopes) manifest[scope] = {
      fingerprint: prepFingerprint({ job, profile, settings, inputs, scope, instructions, mode }),
      sourceFingerprint: prepFingerprint({ job, profile, settings, inputs: inputSnapshot, scope, instructions, mode }),
      instructions, mode, generatedAt: new Date().toISOString(), ...reports[scope],
    };
    await writeFile(join(staged, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    const needsReview = Object.values(reports).some((r) => r.needsReview);
    await writeFile(join(staged, 'document-status.md'), Object.entries(reports).map(([s, r]) =>
      `## ${s}: ${r.needsReview ? 'Needs review' : 'Ready'}\n${r.reasons.join('\n')}\n`).join('\n'));
    await mkdir(dirname(history), { recursive: true });
    if (needsReview && hadAccepted) {
      await rename(staged, history);
      return { ...result, dir: accepted, needsReview: true, preservedPrevious: true, draftDir: history, documentReports: reports };
    }
    await mkdir(dirname(accepted), { recursive: true });
    if (hadAccepted) await rename(accepted, history);
    try { await rename(staged, accepted); }
    catch (err) { if (hadAccepted) await rename(history, accepted); throw err; }
    return { ...result, dir: accepted, needsReview, documentReports: reports, previousDir: hadAccepted ? history : null };
  } catch (err) {
    if (await exists(staged)) {
      await mkdir(dirname(history), { recursive: true });
      const failed = `${history}-failed`;
      await rename(staged, failed);
      err.message += ` (draft preserved at ${failed})`;
    }
    throw err;
  } finally { activeJobs.delete(job.id); }
}
