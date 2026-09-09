/**
 * Review the final rendered document, with at most one repair and verification.
 * A review is valid only for its document fingerprint. Missing reviews and
 * unresolved repairs remain visible and prevent automatic publication.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ROOT } from './common.mjs';
import { currentEvidenceRel, runCvTailorAgent } from './cv-agent.mjs';
import { verifyCvAfterAgent, verifyLetterAfterAgent } from './cv-verify.mjs';
import { DOCUMENT_FILES, documentFingerprint, stageFinalDocumentText } from './review-documents.mjs';

export const ACCEPTED_DIR = 'accepted';
const MAX_MUST_FIX = 6;

const SCORE_KEYS = {
  ats: 'ATS',
  postingFit: 'Posting fit',
  recruiterScan: 'Recruiter scan',
  coverLetter: 'Cover letter',
};

function emitOn(onEvent) {
  return (line, stream = 'meta') => {
    if (typeof onEvent === 'function') onEvent({ stream, line: String(line), t: Date.now() });
  };
}

function bulletsUnder(md, heading) {
  const src = String(md || '');
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'im');
  const start = src.search(re);
  if (start < 0) return [];
  const rest = src.slice(start).replace(/^[^\n]*\n/, '');
  const next = rest.search(/^##\s+/m);
  const body = (next < 0 ? rest : rest.slice(0, next)).trim();
  const items = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (!m) continue;
    const text = m[1].trim();
    if (!text || /^_?none_?\.?$/i.test(text)) continue;
    items.push(text);
  }
  return items;
}

function parseScore(md, label) {
  const re = new RegExp(`^${label}:\\s*(\\d+)\\s*/\\s*10\\b`, 'im');
  const m = String(md || '').match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

export function parseReviewMarkdown(md, scope = 'cv') {
  const src = String(md || '').trim();
  const verdictRaw = src.match(/^verdict:\s*(\S+)/im)?.[1] || '';
  const verdictWord = verdictRaw.toLowerCase().replace(/[^a-z]/g, '');
  let verdict = ['pass', 'revise'].includes(verdictWord) ? verdictWord : 'not_reviewed';
  const scores = {};
  for (const [key, label] of Object.entries(SCORE_KEYS)) {
    scores[key] = parseScore(src, label);
  }
  const mustFix = bulletsUnder(src, 'Must fix').slice(0, MAX_MUST_FIX);
  const shouldFix = bulletsUnder(src, 'Should fix');
  const fine = bulletsUnder(src, 'Fine as-is');
  const gaps = bulletsUnder(src, 'Gaps \\(do not invent\\)')
    .concat(bulletsUnder(src, 'Gaps'));
  const requiredScores = scope === 'letter' ? ['postingFit', 'coverLetter'] : ['ats', 'postingFit', 'recruiterScan'];
  const valid = verdict !== 'not_reviewed' && /^##\s+Must fix\s*$/im.test(src)
    && requiredScores.every((key) => scores[key] !== null)
    && (verdict === 'revise' ? mustFix.length > 0 : mustFix.length === 0);
  if (!valid) verdict = 'not_reviewed';
  return {
    verdict,
    scores,
    mustFix,
    shouldFix,
    fine,
    gaps,
    empty: !src,
    error: valid ? null : 'Reviewer output is missing, malformed, or contradictory',
  };
}

export function formatFixInstructions(review, originalExtra = '') {
  const items = (review?.mustFix || []).map((s) => `- ${s}`).join('\n');
  const original = String(originalExtra || '').trim();
  const block = [
    'Reviewer requested one more pass. Apply ONLY the Must fix items below.',
    'Do not rewrite the rest. Do not invent facts. Leave Should fix alone.',
    '',
    items || '- _none_',
  ].join('\n');
  return original ? `${original}\n\n${block}` : block;
}

export async function copyAcceptedCv({ prepDir, cvSource }) {
  const dir = join(prepDir, ACCEPTED_DIR);
  await mkdir(dir, { recursive: true });
  const saved = [];
  if (cvSource === 'overleaf') {
    for (const name of ['main.tex', 'ats.tex']) {
      const src = join(ROOT, '.workspace', 'overleaf', name);
      if (!existsSync(src)) continue;
      await writeFile(join(dir, name), await readFile(src, 'utf8'));
      saved.push(name);
    }
  } else {
    const src = join(prepDir, 'cv.md');
    if (existsSync(src)) {
      await writeFile(join(dir, 'cv.md'), await readFile(src, 'utf8'));
      saved.push('cv.md');
    }
  }
  return saved;
}

export async function restoreAcceptedCv({ prepDir, cvSource }) {
  const dir = join(prepDir, ACCEPTED_DIR);
  const restored = [];
  if (cvSource === 'overleaf') {
    for (const name of ['main.tex', 'ats.tex']) {
      const src = join(dir, name);
      if (!existsSync(src)) continue;
      await writeFile(join(ROOT, '.workspace', 'overleaf', name), await readFile(src, 'utf8'));
      restored.push(name);
    }
  } else {
    const src = join(dir, 'cv.md');
    if (existsSync(src)) {
      await writeFile(join(prepDir, 'cv.md'), await readFile(src, 'utf8'));
      restored.push('cv.md');
    }
  }
  return restored;
}

export async function copyAcceptedLetter(prepDir, letter) {
  const dir = join(prepDir, ACCEPTED_DIR);
  await mkdir(dir, { recursive: true });
  const text = String(letter || '');
  if (!text.trim()) return false;
  await writeFile(join(dir, 'cover-letter.md'), text.endsWith('\n') ? text : `${text}\n`);
  return true;
}

export async function restoreAcceptedLetter(prepDir) {
  const src = join(prepDir, ACCEPTED_DIR, 'cover-letter.md');
  if (!existsSync(src)) return null;
  const text = await readFile(src, 'utf8');
  await writeFile(join(prepDir, 'cover-letter.md'), text.endsWith('\n') ? text : `${text}\n`);
  return text;
}

async function readReviewFile(prepDir, scope) {
  const name = scope === 'letter' ? 'cover-letter-review.md' : 'review.md';
  const path = join(prepDir, name);
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

export async function loadReviewSummary(prepDir) {
  try {
    return JSON.parse(await readFile(join(prepDir, 'review-summary.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function writeReviewSummary(prepDir, patch) {
  const prev = (await loadReviewSummary(prepDir)) || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  await writeFile(join(prepDir, 'review-summary.json'), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export async function clearReview(prepDir, scope) {
  const previous = (await loadReviewSummary(prepDir)) || {};
  delete previous[scope];
  await writeFile(join(prepDir, 'review-summary.json'), JSON.stringify(previous, null, 2));
  await unlink(join(prepDir, scope === 'letter' ? 'cover-letter-review.md' : 'review.md'))
    .catch((e) => { if (e.code !== 'ENOENT') throw e; });
}

function toPublicReview(parsed, extra = {}) {
  return {
    verdict: parsed.verdict,
    scores: parsed.scores,
    mustFix: parsed.mustFix,
    shouldFix: parsed.shouldFix,
    gaps: parsed.gaps,
    ranFixLoop: Boolean(extra.ranFixLoop),
    restored: Boolean(extra.restored),
    error: extra.error || null,
    documentFingerprint: extra.documentFingerprint || null,
    reviewedAt: new Date().toISOString(),
  };
}

/** Review only rendered, fitted documents. At most one repair and one verification. */
export async function runReviewerPass({
  scope = 'cv', job, prepDir, profile = null, extraInstructions = '',
  cvSource = 'local', provider = null, model = null, onEvent = null,
  letter = '', polishLetter = (s) => String(s || ''), prepare = async () => {},
  // Inject adapters for offline workflow tests, never an alternate production policy.
  runAgent = runCvTailorAgent, verifyCv = verifyCvAfterAgent,
  verifyLetter = verifyLetterAfterAgent, stageText = stageFinalDocumentText,
} = {}) {
  const emit = emitOn(onEvent);
  const letterScope = scope === 'letter';
  const reviewName = letterScope ? 'cover-letter-review.md' : 'review.md';
  const stage = letterScope ? 'letter' : 'cv';
  const common = { job, prepDir, profile, extraInstructions, cvSource, provider, model, onEvent, overleafPush: false };
  let ranFixLoop = false;
  let restored = false;
  let originalReview = null;
  const save = async (parsed, error = parsed.error) => {
    const result = { ...parsed, ranFixLoop, restored, error: error || null,
      documentFingerprint: await documentFingerprint(prepDir, scope) };
    await writeReviewSummary(prepDir, { [scope]: toPublicReview(result, result) });
    if (letterScope) result.letter = await readFile(join(prepDir, 'cover-letter.md'), 'utf8').catch(() => letter);
    return result;
  };
  const inspect = async (checks = []) => {
    const finalName = await stageText(prepDir, scope);
    // Never reuse a report from a previous attempt or generation.
    await unlink(join(prepDir, reviewName)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
    const protectedPaths = [...DOCUMENT_FILES.cv, ...DOCUMENT_FILES.letter].map((n) => join(prepDir, n));
    if (cvSource === 'overleaf') protectedPaths.push(...['main.tex', 'ats.tex'].map((n) => join(ROOT, '.workspace', 'overleaf', n)));
    const snapshot = new Map();
    for (const path of protectedPaths) snapshot.set(path, await readFile(path).catch((e) => { if (e.code !== 'ENOENT') throw e; return null; }));
    let agentError;
    try {
      await runAgent({ ...common, task: letterScope ? 'review-letter' : 'review-cv',
        finalTextRel: `${relToRoot(prepDir)}/${finalName}`, repairChecks: checks,
        sessionKey: `${stage}Review${checks.length ? 'Check' : ''}` });
    } catch (e) { agentError = e; }
    let changed = false;
    for (const [path, before] of snapshot) {
      const after = await readFile(path).catch((e) => { if (e.code !== 'ENOENT') throw e; return null; });
      if (before === null ? after !== null : after === null || !before.equals(after)) {
        changed = true;
        if (before === null) await unlink(path);
        else await writeFile(path, before);
      }
    }
    if (changed) throw new Error('Reviewer changed a document; original documents restored');
    if (agentError) throw agentError;
    return parseReviewMarkdown(await readReviewFile(prepDir, scope), scope);
  };
  try {
    await unlink(join(prepDir, reviewName)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
    await prepare();
    originalReview = await inspect();
    if (originalReview.verdict !== 'revise') return await save(originalReview);
    emit(`Reviewer requested one repair (${originalReview.mustFix.length} item(s)).`);
    if (letterScope) await copyAcceptedLetter(prepDir, await readFile(join(prepDir, 'cover-letter.md'), 'utf8'));
    else await copyAcceptedCv({ prepDir, cvSource });
    ranFixLoop = true;
    await runAgent({ ...common, task: letterScope ? 'cover-letter' : 'cv', repair: true,
      extraInstructions: formatFixInstructions(originalReview, extraInstructions),
      staging: { evidence: false, overleaf: false, snapshot: false, gaps: false },
      sessionKey: `${stage}Fix` });
    if (letterScope) {
      const candidate = polishLetter(await readFile(join(prepDir, 'cover-letter.md'), 'utf8'));
      const gate = await verifyLetter({ ...common, letter: candidate, evidencePath: currentEvidenceRel(), emit });
      if (!gate.ok) throw new Error('Repair failed the factual or style checks');
      await writeFile(join(prepDir, 'cover-letter.md'), candidate);
    } else {
      const gate = await verifyCv({ ...common, evidencePath: currentEvidenceRel(), emit });
      if (!gate.ok) throw new Error('Repair failed the factual or style checks');
    }
    // Fitting can change content. Verify only after the repaired final render.
    await prepare();
    const verified = await inspect(originalReview.mustFix);
    if (verified.verdict === 'not_reviewed') verified.mustFix = originalReview.mustFix;
    return await save(verified);
  } catch (err) {
    const error = err?.message || String(err);
    emit(`Review needs attention: ${error}`, 'stderr');
    if (ranFixLoop) {
      restored = true;
      if (letterScope) await restoreAcceptedLetter(prepDir);
      else await restoreAcceptedCv({ prepDir, cvSource });
      try { await prepare(); } catch (e) { emit(`Restored draft needs attention: ${e.message}`, 'stderr'); }
      return save(originalReview, error);
    }
    return save({ ...parseReviewMarkdown('', scope), verdict: 'not_reviewed' }, error);
  }
}

function relToRoot(abs) {
  return relative(ROOT, abs).replace(/\\/g, '/') || abs;
}
