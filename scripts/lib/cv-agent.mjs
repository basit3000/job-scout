// Goose document workers: stage, write, review, and repair.
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ROOT, run } from './common.mjs';
import { overleafConfigured, syncOverleaf } from './overleaf-cv.mjs';
import { analyzeKeywordGaps, formatKeywordGapsMarkdown } from './cv-keywords.mjs';
import { WRITING_RULES_GENERIC } from './cv-style.mjs';
import { snapshotCvSources } from './cv-verify.mjs';
import { appendAgentAttempt } from './agent-usage.mjs';
import { resolveGooseBinary, runGoose, cancelGooseRuns } from './goose-runtime.mjs';
import { readMemorySync, memoryEvidence, withMemorySnapshot } from './memory.mjs';
import { artifactContext } from './artifact-context.mjs';
import { cvPreferences } from './cv-preferences.mjs';
import { buildAgentBrief, buildAgentPrompt, buildCoverLetterAgentBrief, buildCoverLetterAgentPrompt,
  buildReviewerBrief, buildReviewerPrompt, buildRepairBrief, inlineReviewContext } from './cv-prompts.mjs';

export const DEFAULT_AGENT_PROVIDER = 'goose';
export function resolveAgentModel(raw) { return { id: String(raw || process.env.GOOSE_MODEL || '').trim() }; }
export async function agentRunnerAvailable() {
  const binary = await resolveGooseBinary();
  return { provider: 'goose', ok: Boolean(binary), binary,
    detail: binary ? 'Goose uses its configured provider and model' : 'Run ./setup.ps1, then ./goose.ps1 configure' };
}
export function agentSessionPath(prepDir) {
  return join(prepDir, 'agent-session.json');
}

export async function loadAgentSession(prepDir) {
  try {
    return JSON.parse(await readFile(agentSessionPath(prepDir), 'utf8'));
  } catch {
    return null;
  }
}

export async function saveAgentSession(prepDir, meta, stage = 'cvWriter') {
  await mkdir(prepDir, { recursive: true });
  const prev = (await loadAgentSession(prepDir)) || {};
  const next = appendAgentAttempt(prev, meta, stage);
  await writeFile(agentSessionPath(prepDir), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}


function relToRoot(abs) {
  return relative(ROOT, abs).replace(/\\/g, '/') || abs;
}

function emitFn(onEvent) {
  return (line, stream = 'stdout') => {
    if (typeof onEvent === 'function') onEvent({ stream, line: String(line), t: Date.now() });
  };
}

export function currentEvidenceRel() {
  const path = join(artifactContext.getStore()?.dir || join(ROOT, '.workspace'), 'memory-evidence.md');
  return existsSync(path) ? relToRoot(path) : '';
}
async function refreshEvidence({ emit }) {
  const memory = readMemorySync();
  if (!memory) throw new Error('Complete setup or run npm run memory:migrate first.');
  const dir = artifactContext.getStore()?.dir || join(ROOT, '.workspace');
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'memory-evidence.md');
  await writeFile(path, memoryEvidence(memory));
  emit(`Evidence rebuilt from local memory revision ${memory.revision}.`, 'meta');
  return path;
}

async function stageOverleaf(emit, signal) {
  if (!overleafConfigured()) {
    throw new Error('CV source is Overleaf but OVERLEAF_GIT_TOKEN / OVERLEAF_PROJECT_ID are empty');
  }
  emit('Reading the current online Overleaf master; archiving the previous working checkout…', 'meta');
  const sync = await syncOverleaf({ signal });
  emit(`Overleaf ${sync.action} — .workspace/overleaf`, 'meta');
  return sync;
}

export async function cancelCvTailorAgent() { return cancelGooseRuns(); }
async function persistAgentMeta(prepDir, meta, sessionKey) {
  await saveAgentSession(prepDir, meta, sessionKey);
}

function defaultStaging(task) {
  const review = task === 'review-cv' || task === 'review-letter';
  const letter = task === 'cover-letter';
  return {
    evidence: !review,
    overleaf: !letter && !review,
    snapshot: !letter && !review,
    gaps: true,
  };
}

export async function runCvTailorAgent(options = {}) {
  return withMemorySnapshot(() => runCvTailorAgentWithMemory(options));
}

async function runCvTailorAgentWithMemory({
  job,
  prepDir,
  profile = null,
  extraInstructions = '',
  cvSource = 'local',
  provider = null,
  model = null,
  onEvent = null,
  task = 'cv',
  staging = null,
  extraReads = [],
  sessionKey = null,
  repair = false,
  repairChecks = [],
  finalTextRel = '',
  signal,
} = {}) {
  const letterTask = task === 'cover-letter';
  const reviewCv = task === 'review-cv';
  const reviewLetter = task === 'review-letter';
  const reviewTask = reviewCv || reviewLetter;
  const flags = { ...defaultStaging(task), ...(staging || {}) };
  const prov = 'goose';
  const modelSel = resolveAgentModel(model, prov);
  const emit = emitFn(onEvent);

  await mkdir(prepDir, { recursive: true });
  const prepRel = relative(ROOT, prepDir).replace(/\\/g, '/') || prepDir;
  const jobPostingRel = `${prepRel}/job-posting.md`;
  const instructionsRel = `${prepRel}/instructions.md`;
  const briefName = reviewCv
    ? 'reviewer-brief.md'
    : reviewLetter
      ? 'cover-letter-reviewer-brief.md'
      : letterTask
        ? 'cover-letter-brief.md'
        : 'agent-brief.md';
  const briefRel = `${prepRel}/${briefName}`;
  const instr = String(extraInstructions || '').trim();

  emit(
    reviewTask
      ? `Provider: ${prov} · reviewer (read + write review file only)`
      : `Provider: ${prov} · staging context outside the model`,
    'meta',
  );

  const policy = cvPreferences(readMemorySync());
  const brief = repair ? buildRepairBrief({ cvSource, letter: letterTask, policy }) : reviewTask
    ? buildReviewerBrief({ scope: reviewLetter ? 'letter' : 'cv', policy })
    : letterTask
      ? buildCoverLetterAgentBrief()
      : buildAgentBrief({ cvSource, policy });
  await writeFile(join(prepDir, briefName), brief.endsWith('\n') ? brief : `${brief}\n`);

  const memory = readMemorySync();
  if (!memory) throw new Error('Complete Memory setup first.');
  const evidenceRel = relToRoot(await refreshEvidence({ emit }));

  if (flags.overleaf && cvSource === 'overleaf') {
    await stageOverleaf(emit, signal);
  }
  if (flags.snapshot) {
    const saved = await snapshotCvSources({ prepDir, cvSource });
    if (saved.length) emit(`Snapshot for the quality gate: ${saved.join(', ')}`, 'meta');
  }

  const gapsRel = `${prepRel}/keyword-gaps.md`;
  if (flags.gaps) {
    try {
      const cvBits = [];
      const tailoredMd = join(prepDir, 'cv.md');
      if ((letterTask || reviewLetter) && existsSync(tailoredMd)) cvBits.push(await readFile(tailoredMd, 'utf8'));
      for (const name of !cvBits.length && cvSource === 'overleaf' ? ['ats.tex', 'main.tex'] : []) {
        const p = join(ROOT, '.workspace', 'overleaf', name);
        if (existsSync(p)) cvBits.push(await readFile(p, 'utf8'));
      }
      if (!cvBits.length && existsSync(tailoredMd)) cvBits.push(await readFile(tailoredMd, 'utf8'));
      if (!cvBits.length) {
        const resume = join(ROOT, 'cv', 'resume.md');
        if (existsSync(resume)) cvBits.push(await readFile(resume, 'utf8'));
      }
      let evidenceText = '';
      if (evidenceRel) {
        try {
          evidenceText = await readFile(join(ROOT, evidenceRel), 'utf8');
        } catch {
          /* optional */
        }
      }
      const analysis = analyzeKeywordGaps({
        job,
        cvText: cvBits.join('\n'),
        evidenceText,
        profile: profile || {},
      });
      await writeFile(
        join(prepDir, 'keyword-gaps.md'),
        formatKeywordGapsMarkdown(analysis, job),
      );
      emit(
        `First-screen gaps: ${analysis.onCv.length} on CV · ${analysis.promote.length} to promote · ${analysis.gaps.length} not evidenced · ${analysis.requirements?.length || 0} requirement lines`,
        'meta',
      );
      if (analysis.headline) emit(`Headline target: ${analysis.headline}`, 'meta');
    } catch (err) {
      emit(`Keyword-gap staging failed: ${err.message || err}`, 'stderr');
    }
  }

  let writingRulesRel = WRITING_RULES_GENERIC;
  if (memory.preferences.writingRules) {
    await writeFile(join(prepDir, 'memory-writing-rules.md'), memory.preferences.writingRules);
    writingRulesRel = `${prepRel}/memory-writing-rules.md`;
  }

  const cvMdAbs = join(prepDir, 'cv.md');
  const cvRel = existsSync(cvMdAbs) ? `${prepRel}/cv.md`
    : cvSource === 'overleaf' ? '.workspace/overleaf/main.tex and .workspace/overleaf/ats.tex' : 'cv/resume.md';
  const qualityAbs = join(prepDir, 'quality-report.md');
  const qualityRel = existsSync(qualityAbs) ? `${prepRel}/quality-report.md` : '';
  let notesRel = '';
  if (letterTask || reviewLetter) {
    if (memory.facts.background?.coverLetterNotes) {
      const notesText = memory.facts.background.coverLetterNotes;
      await writeFile(join(prepDir, 'cover-letter-notes.md'), notesText.endsWith('\n') ? notesText : `${notesText}\n`);
      notesRel = `${prepRel}/cover-letter-notes.md`;
    }
  }

  let prompt = reviewTask
    ? buildReviewerPrompt({
      job,
      prepRel,
      jobPostingRel,
      briefRel,
      evidenceRel,
      gapsRel,
      writingRulesRel,
      qualityRel,
      overleafRel: '.workspace/overleaf',
      cvSource,
      cvRel,
      letterRel: `${prepRel}/cover-letter.md`,
      profileName: profile?.name,
      scope: reviewLetter ? 'letter' : 'cv',
      extraInstructions: instr,
      notesRel,
      finalTextRel,
      repairChecks,
    })
    : letterTask
      ? buildCoverLetterAgentPrompt({
        job,
        prepRel,
        jobPostingRel,
        instructionsRel,
        briefRel,
        evidenceRel,
        gapsRel,
        writingRulesRel,
        letterRel: `${prepRel}/cover-letter.md`,
        cvRel,
        notesRel,
        profileName: profile?.name,
        extraInstructions: instr,
        extraReads,
      })
      : buildAgentPrompt({
        job,
        prepRel,
        jobPostingRel,
        instructionsRel,
        briefRel,
        evidenceRel,
        gapsRel,
        writingRulesRel,
        overleafRel: '.workspace/overleaf',
        cvSource,
        profileName: profile?.name,
        extraInstructions: instr,
        cvRel,
        extraReads,
      });

  if (reviewTask) {
    const packet = await inlineReviewContext(prompt);
    // A context file avoids Windows command-line length limits.
    const contextName = reviewLetter ? 'letter-review-context.md' : 'cv-review-context.md';
    await writeFile(join(prepDir, contextName), packet);
    prompt = `Read ${prepRel}/${contextName} once and follow its reviewer task. All inputs are included there. Write only the specified review file.`;
  }

  const promptName = reviewCv
    ? 'reviewer-prompt.md'
    : reviewLetter
      ? 'cover-letter-reviewer-prompt.md'
      : letterTask
        ? 'cover-letter-prompt.md'
        : 'agent-prompt.md';
  await writeFile(join(prepDir, promptName), `${prompt}\n`);
  emit(
    reviewTask
      ? `Prompt ready (${prompt.length} chars) — reviewer writes ${reviewLetter ? 'cover-letter-review.md' : 'review.md'} only`
      : letterTask
        ? `Prompt ready (${prompt.length} chars) — agent edits cover-letter.md only`
        : `Prompt ready (${prompt.length} chars) — agent edits only; Job Scout compiles afterward`,
    'meta',
  );

  const nestedKey = sessionKey
    || (reviewCv ? 'cvReview' : reviewLetter ? 'letterReview' : letterTask ? 'letterWriter' : 'cvWriter');

  const startedAt = Date.now();
  try {
    const resultText = await runGoose({ prompt, model: modelSel.id, onEvent });
    const meta = { ok: true, provider: 'goose', model: modelSel.id || null,
      status: 'finished', durationMs: Date.now() - startedAt, usage: null,
      usageUnavailable: 'Goose provider usage is not normalized', resultText: resultText.slice(0, 4000),
      jobId: job.id, cvSource, createdAt: new Date().toISOString() };
    await persistAgentMeta(prepDir, meta, nestedKey);
    return meta;
  } catch (error) {
    await persistAgentMeta(prepDir, { ok: false, provider: prov, model: modelSel.id || null,
      status: 'error', error: error.message, usage: error.usage || null,
      durationMs: Date.now() - startedAt, createdAt: new Date().toISOString() }, nestedKey);
    throw error;
  }
}

export async function seedPrepForAgent(prepDir, job, extraInstructions = '') {
  await mkdir(prepDir, { recursive: true });
  const jobPosting = `# ${job.title} — ${job.company}

- **URL:** ${job.url || '_none_'}
- **Location:** ${job.location || '_unknown_'}
- **Board:** ${job.board || '?'} via ${job.via || '?'}
- **ID:** \`${job.id}\`

## Description

${job.description || '_No description captured — open the URL._'}
`;
  await writeFile(join(prepDir, 'job-posting.md'), jobPosting.endsWith('\n') ? jobPosting : `${jobPosting}\n`);
  const instr = String(extraInstructions || '').trim();
  if (instr) {
    await writeFile(join(prepDir, 'instructions.md'), `# Extra instructions\n\n${instr}\n`);
  }
  return { jobPostingPath: join(prepDir, 'job-posting.md') };
}
