/**
 * Second-pass reviewer after the Prep writer + deterministic quality gate.
 *
 * The reviewer agent only writes review.md / cover-letter-review.md. If it
 * verdicts "revise" with must-fix items, Job Scout runs the writer once more
 * with those items, then re-runs the quality gate. A hard-gate miss on that
 * loop restores the already-accepted files so PDFs still ship.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ROOT } from './common.mjs';
import { currentEvidenceRel, runCvTailorAgent } from './cv-agent.mjs';
import { verifyCvAfterAgent, verifyLetterAfterAgent } from './cv-verify.mjs';

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
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
}

export function parseReviewMarkdown(md) {
  const src = String(md || '').trim();
  const verdictRaw = src.match(/^verdict:\s*(\S+)/im)?.[1] || '';
  const verdictWord = verdictRaw.toLowerCase().replace(/[^a-z]/g, '');
  let verdict = 'pass';
  if (verdictWord === 'revise' || verdictWord === 'fail' || verdictWord === 'reject') {
    verdict = 'revise';
  }
  const scores = {};
  for (const [key, label] of Object.entries(SCORE_KEYS)) {
    scores[key] = parseScore(src, label);
  }
  const mustFix = bulletsUnder(src, 'Must fix').slice(0, MAX_MUST_FIX);
  const shouldFix = bulletsUnder(src, 'Should fix');
  const fine = bulletsUnder(src, 'Fine as-is');
  const gaps = bulletsUnder(src, 'Gaps \\(do not invent\\)')
    .concat(bulletsUnder(src, 'Gaps'));
  if (!mustFix.length) verdict = 'pass';
  return {
    verdict,
    scores,
    mustFix,
    shouldFix,
    fine,
    gaps,
    empty: !src,
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
  };
}

/**
 * Review the tailored CV or letter. Never throws — Prep continues if the
 * reviewer is unavailable; the writer output already passed the quality gate.
 */
export async function runReviewerPass({
  scope = 'cv',
  job,
  prepDir,
  profile = null,
  extraInstructions = '',
  cvSource = 'local',
  overleafPush = true,
  provider = null,
  model = null,
  onEvent = null,
  letter = '',
  polishLetter = (s) => String(s || ''),
} = {}) {
  const emit = emitOn(onEvent);
  const letterScope = scope === 'letter';
  const empty = {
    verdict: 'pass',
    scores: {},
    mustFix: [],
    shouldFix: [],
    fine: [],
    gaps: [],
    empty: true,
    ranFixLoop: false,
    restored: false,
    error: null,
  };

  emit(letterScope ? 'Reviewer — scoring the cover letter…' : 'Reviewer — scoring the tailored CV…');

  try {
    await runCvTailorAgent({
      job,
      prepDir,
      profile,
      extraInstructions,
      cvSource,
      overleafPush: false,
      provider,
      model,
      onEvent,
      task: letterScope ? 'review-letter' : 'review-cv',
    });
  } catch (err) {
    const error = err?.message || String(err);
    emit(`Reviewer skipped (${error}) — shipping the quality-gated draft.`, 'stderr');
    const parsed = { ...empty, error };
    await writeReviewSummary(prepDir, { [letterScope ? 'letter' : 'cv']: toPublicReview(parsed, { error }) });
    return parsed;
  }

  const raw = await readReviewFile(prepDir, scope);
  const parsed = parseReviewMarkdown(raw);
  if (parsed.empty) {
    emit('Reviewer wrote no review file — continuing without a fix loop.', 'stderr');
    await writeReviewSummary(prepDir, { [letterScope ? 'letter' : 'cv']: toPublicReview(parsed) });
    return { ...parsed, ranFixLoop: false, restored: false, error: 'reviewer wrote no file' };
  }

  const scoreBits = Object.entries(SCORE_KEYS)
    .map(([key, label]) => (parsed.scores[key] == null ? null : `${label} ${parsed.scores[key]}/10`))
    .filter(Boolean)
    .join(' · ');
  emit(
    `Reviewer verdict: ${parsed.verdict}${scoreBits ? ` (${scoreBits})` : ''}${
      parsed.mustFix.length ? ` · ${parsed.mustFix.length} must-fix` : ''
    }`,
    parsed.verdict === 'revise' ? 'meta' : 'ok',
  );

  if (parsed.verdict !== 'revise' || !parsed.mustFix.length) {
    await writeReviewSummary(prepDir, { [letterScope ? 'letter' : 'cv']: toPublicReview(parsed) });
    return { ...parsed, ranFixLoop: false, restored: false, error: null };
  }

  emit(`Reviewer requested one fix loop (${parsed.mustFix.length} item(s)).`);
  const fixInstr = formatFixInstructions(parsed, extraInstructions);
  const reviewRead = `${relToRoot(prepDir)}/${letterScope ? 'cover-letter-review.md' : 'review.md'}`;

  try {
    if (letterScope) {
      await copyAcceptedLetter(prepDir, letter);
      await runCvTailorAgent({
        job,
        prepDir,
        profile,
        extraInstructions: fixInstr,
        cvSource: 'local',
        overleafPush: false,
        provider,
        model,
        onEvent,
        task: 'cover-letter',
        staging: { evidence: false, overleaf: false, snapshot: false, gaps: true },
        extraReads: [reviewRead],
        sessionKey: 'letterFix',
      });
      const edited = await readFile(join(prepDir, 'cover-letter.md'), 'utf8');
      const candidate = polishLetter(edited);
      const gate = await verifyLetterAfterAgent({
        prepDir,
        letter: candidate,
        job,
        evidencePath: currentEvidenceRel(),
        extraInstructions: fixInstr,
        emit: (line, stream = 'meta') => emit(line, stream),
      });
      if (!gate.ok) {
        const restored = await restoreAcceptedLetter(prepDir);
        emit('Fix loop failed the letter quality gate — keeping the previous letter.', 'stderr');
        const publicReview = toPublicReview(parsed, { ranFixLoop: true, restored: true });
        await writeReviewSummary(prepDir, { letter: publicReview });
        return { ...parsed, ranFixLoop: true, restored: true, letter: restored, error: null };
      }
      await writeFile(join(prepDir, 'cover-letter.md'), candidate.endsWith('\n') ? candidate : `${candidate}\n`);
      const publicReview = toPublicReview(parsed, { ranFixLoop: true, restored: false });
      await writeReviewSummary(prepDir, { letter: publicReview });
      return { ...parsed, ranFixLoop: true, restored: false, letter: candidate, error: null };
    }

    await copyAcceptedCv({ prepDir, cvSource });
    await runCvTailorAgent({
      job,
      prepDir,
      profile,
      extraInstructions: fixInstr,
      cvSource,
      overleafPush,
      provider,
      model,
      onEvent,
      task: 'cv',
      staging: { evidence: false, overleaf: false, snapshot: false, gaps: true },
      extraReads: [reviewRead],
      sessionKey: 'cvFix',
    });
    const gate = await verifyCvAfterAgent({
      prepDir,
      cvSource,
      job,
      profile,
      evidencePath: currentEvidenceRel(),
      extraInstructions: fixInstr,
      emit: (line, stream = 'meta') => emit(line, stream),
    });
    if (gate.reverted) {
      await restoreAcceptedCv({ prepDir, cvSource });
      emit('Fix loop failed the CV quality gate — keeping the previous tailor.', 'stderr');
      const publicReview = toPublicReview(parsed, { ranFixLoop: true, restored: true });
      await writeReviewSummary(prepDir, { cv: publicReview });
      return { ...parsed, ranFixLoop: true, restored: true, error: null };
    }
    const publicReview = toPublicReview(parsed, { ranFixLoop: true, restored: false });
    await writeReviewSummary(prepDir, { cv: publicReview });
    return { ...parsed, ranFixLoop: true, restored: false, error: null };
  } catch (err) {
    const error = err?.message || String(err);
    emit(`Fix loop failed (${error}) — keeping the quality-gated draft.`, 'stderr');
    if (letterScope) await restoreAcceptedLetter(prepDir);
    else await restoreAcceptedCv({ prepDir, cvSource });
    const publicReview = toPublicReview(parsed, { ranFixLoop: true, restored: true, error });
    await writeReviewSummary(prepDir, { [letterScope ? 'letter' : 'cv']: publicReview });
    return { ...parsed, ranFixLoop: true, restored: true, error };
  }
}

function relToRoot(abs) {
  return relative(ROOT, abs).replace(/\\/g, '/') || abs;
}
