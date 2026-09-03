/**
 * Prep & CV agent runners — pluggable backends:
 *   cursor       → Cursor SDK (@cursor/sdk)
 *   claude-code  → Claude Code CLI (`claude -p`)
 *   codex        → OpenAI Codex CLI (`codex exec`)
 */

import { existsSync, statSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { Agent, Cursor, CursorAgentError } from '@cursor/sdk';
import { ROOT, run } from './common.mjs';
import { overleafConfigured, syncOverleaf } from './overleaf-cv.mjs';
import {
  formatAgentEvent,
  formatFinishLine,
} from './cv-agent-log.mjs';
import { analyzeKeywordGaps, formatKeywordGapsMarkdown } from './cv-keywords.mjs';

let activeRun = null;
let activeChild = null;

export const AGENT_PROVIDERS = [
  {
    id: 'cursor',
    label: 'Cursor SDK',
    description: 'Needs CURSOR_API_KEY (Cursor Dashboard → Integrations)',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    description: 'Needs `claude` on PATH (Claude Code CLI + Anthropic login/API key)',
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    description: 'Needs `codex` on PATH (Codex CLI + OpenAI login/API key)',
  },
];

export const DEFAULT_AGENT_PROVIDER = 'cursor';
export const DEFAULT_AGENT_MODEL = 'composer-2.5';

/** Cursor model fallbacks when catalog fetch fails. */
export const FALLBACK_CURSOR_MODELS = [
  { id: 'auto', displayName: 'Auto', description: 'Cursor picks' },
  { id: 'composer-2.5', displayName: 'Composer 2.5', description: 'Default' },
  { id: 'claude-4.5-sonnet', displayName: 'Claude 4.5 Sonnet', description: 'If enabled' },
  { id: 'claude-4.5-opus', displayName: 'Claude 4.5 Opus', description: 'If enabled' },
  { id: 'gpt-5.4', displayName: 'GPT-5.4', description: 'If enabled' },
];

export const CLAUDE_CODE_MODELS = [
  { id: '', displayName: 'CLI default', description: 'Whatever `claude` is configured to use' },
  { id: 'sonnet', displayName: 'Sonnet', description: 'Pass --model sonnet' },
  { id: 'opus', displayName: 'Opus', description: 'Pass --model opus' },
  { id: 'haiku', displayName: 'Haiku', description: 'Pass --model haiku' },
];

export const CODEX_MODELS = [
  { id: '', displayName: 'CLI default', description: 'Whatever `codex` is configured to use' },
  { id: 'gpt-5.4', displayName: 'gpt-5.4', description: 'Pass --model gpt-5.4 if supported' },
  { id: 'o4-mini', displayName: 'o4-mini', description: 'Pass --model o4-mini if supported' },
];

export function normalizeAgentProvider(raw) {
  const id = String(raw || process.env.AGENT_PROVIDER || DEFAULT_AGENT_PROVIDER)
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (id === 'claude' || id === 'anthropic') return 'claude-code';
  if (id === 'openai' || id === 'codex-cli') return 'codex';
  if (AGENT_PROVIDERS.some((p) => p.id === id)) return id;
  return DEFAULT_AGENT_PROVIDER;
}

export function resolveAgentModel(raw, provider = DEFAULT_AGENT_PROVIDER) {
  const envKey =
    provider === 'claude-code'
      ? 'CLAUDE_CODE_MODEL'
      : provider === 'codex'
        ? 'CODEX_MODEL'
        : 'CURSOR_AGENT_MODEL';
  const id = String(raw || process.env[envKey] || (provider === 'cursor' ? DEFAULT_AGENT_MODEL : ''))
    .trim();
  if (!id || id === 'default') {
    return provider === 'cursor' ? { id: DEFAULT_AGENT_MODEL } : { id: '' };
  }
  return { id };
}

/** @deprecated use agentRunnerAvailable — kept for older imports */
export function cursorAgentAvailable() {
  return Boolean(process.env.CURSOR_API_KEY?.trim());
}

async function findOnPath(bin) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await run(cmd, [bin], { windowsHide: true });
    const hit = String(stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return hit || null;
  } catch {
    return null;
  }
}

export async function resolveProviderBinary(provider) {
  if (provider === 'claude-code') {
    return (
      process.env.CLAUDE_CODE_BIN?.trim()
      || (await findOnPath('claude'))
      || (process.platform === 'win32' ? await findOnPath('claude.cmd') : null)
    );
  }
  if (provider === 'codex') {
    return (
      process.env.CODEX_BIN?.trim()
      || (await findOnPath('codex'))
      || (process.platform === 'win32' ? await findOnPath('codex.cmd') : null)
    );
  }
  return null;
}

/**
 * Whether the chosen agent backend can start a run.
 * @param {string} [provider]
 */
export async function agentRunnerAvailable(provider) {
  const p = normalizeAgentProvider(provider);
  if (p === 'cursor') {
    return {
      provider: p,
      ok: Boolean(process.env.CURSOR_API_KEY?.trim()),
      detail: process.env.CURSOR_API_KEY?.trim()
        ? 'CURSOR_API_KEY set'
        : 'Set CURSOR_API_KEY in .env',
    };
  }
  const bin = await resolveProviderBinary(p);
  if (p === 'claude-code') {
    return {
      provider: p,
      ok: Boolean(bin),
      binary: bin,
      detail: bin
        ? `Found ${bin}`
        : 'Install Claude Code CLI and ensure `claude` is on PATH (or set CLAUDE_CODE_BIN)',
    };
  }
  if (p === 'codex') {
    return {
      provider: p,
      ok: Boolean(bin),
      binary: bin,
      detail: bin
        ? `Found ${bin}`
        : 'Install Codex CLI and ensure `codex` is on PATH (or set CODEX_BIN)',
    };
  }
  return { provider: p, ok: false, detail: 'Unknown provider' };
}

/**
 * Status for all providers (UI).
 */
export async function listAgentProvidersStatus() {
  const out = [];
  for (const p of AGENT_PROVIDERS) {
    const st = await agentRunnerAvailable(p.id);
    out.push({ ...p, ...st });
  }
  return out;
}

/**
 * Model catalog for a provider.
 */
export async function listAgentModels(provider) {
  const p = normalizeAgentProvider(provider);
  if (p === 'claude-code') {
    return { provider: p, models: CLAUDE_CODE_MODELS, source: 'static' };
  }
  if (p === 'codex') {
    return { provider: p, models: CODEX_MODELS, source: 'static' };
  }
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    return { provider: p, models: FALLBACK_CURSOR_MODELS, source: 'fallback', error: 'CURSOR_API_KEY missing' };
  }
  try {
    const listed = await Cursor.models.list({ apiKey });
    const models = (listed || [])
      .map((m) => ({
        id: m.id || m.model?.id,
        displayName: m.displayName || m.model?.displayName || m.id,
        description: m.description || '',
      }))
      .filter((m) => m.id);
    if (!models.length) {
      return { provider: p, models: FALLBACK_CURSOR_MODELS, source: 'fallback', error: 'empty catalog' };
    }
    const ids = new Set(models.map((m) => m.id));
    for (const fb of FALLBACK_CURSOR_MODELS) {
      if (!ids.has(fb.id)) models.unshift(fb);
    }
    return { provider: p, models, source: 'cursor' };
  } catch (err) {
    return {
      provider: p,
      models: FALLBACK_CURSOR_MODELS,
      source: 'fallback',
      error: err?.message || String(err),
    };
  }
}

export function personalCvSkillPresent() {
  return existsSync(join(ROOT, '.agents', 'skills', 'cv-tailor.local', 'SKILL.md'));
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

export async function saveAgentSession(prepDir, meta) {
  await mkdir(prepDir, { recursive: true });
  const prev = (await loadAgentSession(prepDir)) || {};
  const next = { ...prev, ...meta, updatedAt: new Date().toISOString() };
  await writeFile(agentSessionPath(prepDir), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

const EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function relToRoot(abs) {
  return relative(ROOT, abs).replace(/\\/g, '/') || abs;
}

export function buildAgentBrief({ cvSource = 'overleaf' } = {}) {
  const overleaf = cvSource === 'overleaf';
  return [
    '# Agent brief — tailor only, do not research',
    '',
    'Job Scout already staged evidence and the Overleaf clone. This brief replaces',
    'SKILL.md / format-benchmarks / gather-evidence for this run.',
    '',
    '## Hard rules',
    '- No invented facts, metrics, employers, dates, or titles.',
    '- Experience → Education → Projects → Skills (both files).',
    '- Keep current Experience bullets. Light rewrite only: clause order, posting synonyms,',
    '  in-line tech already on the CV or in the evidence pack. Same theme and voice.',
    '- Leave a bullet alone if it already fits. Change about a third to half of them.',
    '- Portfolio copy is for Projects only — never paste side-project work into employment.',
    '- Print **Germany** only (never a city). PD-League may cite 82 members and 196 matches.',
    '  List it as Independent Developer / Personal, never as a company, and not again under Projects.',
    '- e.solutions is ~90% backend: lead with FastAPI/TypeScript REST, MongoDB, LiteLLM, CI/CD.',
    '  React/Next.js is API contracts and occasional front-end — not an equal bullet.',
    '  TypeScript, Jenkins, ArgoCD, LiteLLM (LLM calls) are confirmed. Not agents/RAG/fine-tuning.',
    '- Vercel, Railway, Cloudflare, AWS EC2 are personal hosting (EC2 also at Psmorfia).',
    '  Never put them on the e.solutions bullets. Do not list Porkbun on Skills.',
    '- OpenAI on Translation Service is a personal project, not employment.',
    '- Target full-stack and applied LLM/automation roles, not research-scientist posts.',
    '- Do not commit secrets or echo tokens.',
    overleaf ? '- Edit both `.workspace/overleaf/main.tex` and `ats.tex` (or neither).' : '- Write facts-only Markdown.',
    '',
    '## Do not do (already done, or Job Scout does after you finish)',
    '- Do not read SKILL.md, format-benchmarks.md, or overleaf.md.',
    '- Do not run gather-evidence.mjs or `gh api`.',
    '- Do not git clone Overleaf. Do not touch `.cv-workspace/overleaf`.',
    '- Do not web-search hiring format, ATS blogs, or the job URL unless the posting file is empty.',
    '- Do not compile LaTeX, run check-onepage.sh / check-ats.sh, or commit/push.',
    '',
    '## First screen (this is how 2026 ATS + AI copilots + recruiters decide)',
    'Three readers, in order: parser → AI summary card → human (~6s on the top third).',
    'No extra summary paragraph — the headline and the first three current-role bullets are that card.',
    '1. Headline: honest title close to the posting (never Senior/Staff/Lead) + 3–5 evidenced JD skills.',
    '2. First three present-role bullets: each is an evidence sentence (duty + the JD tech on the same line).',
    '3. Every “Already” / “Promote” phrase from keyword-gaps.md must appear in a bullet, not only Skills.',
    '4. Mirror the posting’s exact wording only where it is already true (REST API ↔ HTTP API, back-end ↔ backend).',
    '5. German posting: keep English tech names (ATS) and add the German role noun if it is an honest equivalent.',
    '6. Skills line: JD-matched evidenced tech first; drop tools you would not take an interview question on.',
    '7. Do not invent metrics. If a real number would win the screen, list it as a question in the report.',
    '',
    '## Do',
    '- Read only the files listed in the prompt, in that order.',
    '- Follow keyword-gaps.md: promote evidenced misses, never fill the “not evidenced” list.',
    '- Map posting → evidence, then surgically edit. Write agent-report.md (changes + leftover gaps).',
    '',
  ].join('\n');
}

export function buildAgentPrompt({
  job,
  prepRel,
  jobPostingRel,
  instructionsRel,
  briefRel,
  evidenceRel,
  techStackRel,
  gapsRel,
  writingRulesRel,
  overleafRel,
  cvSource,
  profileName,
  extraInstructions,
}) {
  const reads = [
    briefRel,
    jobPostingRel,
    gapsRel,
    evidenceRel,
    techStackRel,
    writingRulesRel,
    cvSource === 'overleaf'
      ? `${overleafRel}/main.tex and ${overleafRel}/ats.tex`
      : 'cv/resume.md',
  ].filter(Boolean);

  const lines = [
    'Prep & CV tailor — execute, do not research. Evidence and Overleaf are already staged.',
    '',
    `Candidate: ${profileName || 'from profile.json'}`,
    `Job: ${job.title} @ ${job.company}`,
    `Job URL: ${job.url || '(none)'}`,
    `CV source: ${cvSource}`,
    `Prep pack: ${prepRel}`,
    '',
    'Read only these, in order:',
    ...reads.map((p) => `- ${p}`),
  ];
  if (extraInstructions) {
    lines.push(`- Extra instructions: ${extraInstructions}`);
    if (instructionsRel) lines.push(`  (also at ${instructionsRel})`);
  }
  lines.push('');
  if (cvSource === 'overleaf') {
    lines.push(
      `Surgically edit ${overleafRel}/main.tex and ${overleafRel}/ats.tex for this job.`,
      'Do not clone, compile, commit, or push. Do not edit `.cv-workspace/overleaf`.',
    );
  } else {
    lines.push(`Write a tailored one-page Markdown CV to ${prepRel}/cv.md (facts only).`);
  }
  lines.push(
    `Then write ${prepRel}/agent-report.md: what changed (with evidence) and gaps.`,
    'Apply the edits. Do not stop at a plan.',
  );
  return lines.join('\n');
}

/** Same evidence / skill rules as the CV brief, plus letter-specific layout. */
export function buildCoverLetterAgentBrief() {
  return [
    '# Agent brief — cover letter tailor only, do not research',
    '',
    'Job Scout already assembled a draft cover letter from cv/cover-letter.md and staged',
    'the same evidence pack used for Prep & CV. This brief replaces SKILL.md for this run.',
    '',
    '## Hard rules (same as the CV)',
    '- No invented facts, metrics, employers, dates, or titles.',
    '- Portfolio copy is for side projects only — never paste side-project work into employment.',
    '- Print **Germany** only (never a city). PD-League may cite 82 members and 196 matches.',
    '  List it as Independent Developer / Personal, never as a company.',
    '- e.solutions is ~90% backend: lead with FastAPI/TypeScript REST, MongoDB, LiteLLM, CI/CD.',
    '  React/Next.js is API contracts and occasional front-end — not an equal claim.',
    '  TypeScript, Jenkins, ArgoCD, LiteLLM (LLM calls) are confirmed. Not agents/RAG/fine-tuning.',
    '- Vercel, Railway, Cloudflare, AWS EC2 are personal hosting (EC2 also at Psmorfia).',
    '  Never put them on the e.solutions sentences. Do not mention Porkbun.',
    '- OpenAI on Translation Service is a personal project, not employment.',
    '- Target full-stack and applied LLM/automation roles, not research-scientist posts.',
    '- Follow keyword-gaps.md: promote evidenced misses, never fill the “not evidenced” list.',
    '- Follow extra instructions.md the same way the CV tailor would (emphasis, stack, tone).',
    '- Do not commit secrets or echo tokens.',
    '',
    '## Cover letter shape',
    '- Start with `Application for <Role>` (already filled). No sender header, no date at the top.',
    '- Keep: greeting, 2–4 body paragraphs, thanks, then sign-off.',
    '- Sign-off must be exactly: `Kind regards,` then a blank line, then name, email, website',
    '  each on its own line.',
    '- Never use em dashes or spaced hyphen asides (`word - word`). Use a comma or rewrite.',
    '- One page. Do not add a header block or address block.',
    '- Light rewrite only: lead with posting-matched skills that are already true. Same voice.',
    '- Drop or shorten a past-job / project sentence if it does not help this posting.',
    '- Do not invent a new employer, project, or metric to fill a gap. Leave it out.',
    '',
    '## Do not do',
    '- Do not read SKILL.md, format-benchmarks.md, or overleaf.md.',
    '- Do not run gather-evidence.mjs or `gh api`.',
    '- Do not git clone Overleaf, compile LaTeX, or edit the CV files.',
    '- Do not web-search the job URL unless job-posting.md is empty.',
    '',
    '## Do',
    '- Read only the files listed in the prompt, in that order.',
    '- Map posting → evidence, then surgically edit cover-letter.md.',
    '- Write cover-letter-report.md (what changed + leftover gaps).',
    '',
  ].join('\n');
}

export function buildCoverLetterAgentPrompt({
  job,
  prepRel,
  jobPostingRel,
  instructionsRel,
  briefRel,
  evidenceRel,
  techStackRel,
  gapsRel,
  writingRulesRel,
  letterRel,
  cvRel,
  profileName,
  extraInstructions,
}) {
  const reads = [
    briefRel,
    jobPostingRel,
    gapsRel,
    evidenceRel,
    techStackRel,
    writingRulesRel,
    cvRel,
    letterRel,
  ].filter(Boolean);

  const lines = [
    'Cover letter tailor — execute, do not research. Evidence is already staged.',
    'Use the same skill rules and extra instructions as Prep & CV.',
    '',
    `Candidate: ${profileName || 'from profile.json'}`,
    `Job: ${job.title} @ ${job.company}`,
    `Job URL: ${job.url || '(none)'}`,
    `Prep pack: ${prepRel}`,
    '',
    'Read only these, in order:',
    ...reads.map((p) => `- ${p}`),
  ];
  if (extraInstructions) {
    lines.push(`- Extra instructions: ${extraInstructions}`);
    if (instructionsRel) lines.push(`  (also at ${instructionsRel})`);
  }
  lines.push(
    '',
    `Surgically edit ${letterRel} so it leads with evidenced skills this posting cares about.`,
    'Do not invent facts. Do not edit the CV or Overleaf files.',
    `Then write ${prepRel}/cover-letter-report.md: what changed (with evidence) and gaps.`,
    'Apply the edits. Do not stop at a plan.',
  );
  return lines.join('\n');
}

function emitFn(onEvent) {
  return (line, stream = 'stdout') => {
    if (typeof onEvent === 'function') onEvent({ stream, line: String(line), t: Date.now() });
  };
}

async function streamRun(run, emit) {
  const stats = { tools: 0, started: new Set(), usage: null };
  if (!run.supports('stream')) return stats;
  try {
    for await (const event of run.stream()) {
      const formatted = formatAgentEvent(event, stats);
      if (formatted) emit(formatted.line, formatted.stream);
    }
  } catch (streamErr) {
    emit(`Stream ended early: ${streamErr.message || streamErr}`, 'stderr');
  }
  return stats;
}

async function waitRunResult(run, emit, stats = {}) {
  const result = await run.wait();
  if (result.status === 'cancelled') throw new Error('Agent run cancelled');
  if (result.status === 'error') {
    throw new Error(result.error?.message || `Agent run failed (${result.id})`);
  }
  const usage = result.usage || stats.usage || null;
  emit(
    formatFinishLine({
      durationMs: result.durationMs,
      tools: stats.tools || 0,
      usage,
    }),
    'ok',
  );
  return { result, usage, tools: stats.tools || 0 };
}

function evidenceAgeMs(filePath) {
  try {
    return Date.now() - statSync(filePath).mtimeMs;
  } catch {
    return Infinity;
  }
}

function newestEvidencePath() {
  const portfolio = process.env.PORTFOLIO_ROOT?.trim();
  const candidates = [
    join(ROOT, '.cv-workspace', 'evidence.md'),
    join(ROOT, '.workspace', 'evidence.md'),
    portfolio ? join(portfolio, '.cv-workspace', 'evidence.md') : null,
  ].filter(Boolean);
  let best = null;
  let bestAge = Infinity;
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const age = evidenceAgeMs(p);
    if (age < bestAge) {
      best = p;
      bestAge = age;
    }
  }
  return best ? { path: best, ageMs: bestAge } : null;
}

async function refreshEvidence({ profile, emit }) {
  const existing = newestEvidencePath();
  if (existing && existing.ageMs < EVIDENCE_MAX_AGE_MS) {
    const ageLabel = existing.ageMs < 3_600_000
      ? `${Math.max(1, Math.round(existing.ageMs / 60_000))}m old`
      : `${Math.round(existing.ageMs / 3_600_000)}h old`;
    emit(`Evidence cached (${ageLabel}) — ${relToRoot(existing.path)}`, 'meta');
    return existing.path;
  }

  emit('Refreshing evidence pack (Node, not the agent)…', 'meta');
  const username = profile?.githubUsername || process.env.GITHUB_USERNAME || '';
  const gather = join(ROOT, '.agents', 'skills', 'cv-tailor', 'scripts', 'gather-evidence.mjs');
  try {
    const args = [gather];
    if (username) args.push('--username', username);
    else args.push('--no-github');
    const portfolio = process.env.PORTFOLIO_ROOT?.trim();
    if (portfolio) args.push('--portfolio-root', portfolio);
    await run(process.execPath, args, { timeout: 180000, cwd: ROOT });
  } catch (err) {
    emit(`gather-evidence skipped: ${err.message || err}`, 'stderr');
    try {
      await run(process.execPath, [join(ROOT, 'scripts', 'build-evidence.mjs')], {
        timeout: 60000,
        cwd: ROOT,
      });
    } catch (err2) {
      emit(`build-evidence skipped: ${err2.message || err2}`, 'stderr');
    }
  }

  const after = newestEvidencePath();
  if (after) {
    emit(`Evidence ready — ${relToRoot(after.path)}`, 'meta');
    return after.path;
  }
  emit('No evidence.md found — agent will use profile.json / the current CV only.', 'stderr');
  return null;
}

async function stageOverleaf(emit) {
  if (!overleafConfigured()) {
    throw new Error('CV source is Overleaf but OVERLEAF_GIT_TOKEN / OVERLEAF_PROJECT_ID are empty');
  }
  emit('Pulling Overleaf clone…', 'meta');
  const sync = await syncOverleaf();
  emit(`Overleaf ${sync.action} — .workspace/overleaf`, 'meta');
  return sync;
}

/**
 * Cancel in-flight Cursor run or CLI child.
 */
export async function cancelCvTailorAgent() {
  let ok = false;
  const run = activeRun;
  if (run?.supports?.('cancel')) {
    try {
      await run.cancel();
      ok = true;
    } catch {
      /* ignore */
    }
  }
  const child = activeChild;
  if (child?.pid) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        child.kill('SIGTERM');
      }
      ok = true;
    } catch {
      /* ignore */
    }
  }
  return ok;
}

async function runCliAgent({
  bin,
  args,
  emit,
  provider,
  modelId,
  prepDir,
  job,
  cvSource,
}) {
  emit(`Starting ${provider} via ${bin}…`);
  if (modelId) emit(`Model: ${modelId}`);

  const resultText = await new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
    activeChild = child;
    let stdout = '';
    const onChunk = (stream) => (buf) => {
      const text = buf.toString('utf8');
      if (stream === 'stdout') stdout += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) emit(line, stream);
      }
    };
    child.stdout.on('data', onChunk('stdout'));
    child.stderr.on('data', onChunk('stderr'));
    child.on('error', (err) => {
      activeChild = null;
      reject(err);
    });
    child.on('close', (code) => {
      activeChild = null;
      if (code === 0) resolve(stdout);
      else reject(new Error(`${provider} exited with code ${code ?? 1}`));
    });
  });

  const meta = {
    ok: true,
    provider,
    model: modelId || null,
    status: 'finished',
    resultText: String(resultText || '').slice(0, 4000),
    jobId: job.id,
    cvSource,
    createdAt: new Date().toISOString(),
  };
  await saveAgentSession(prepDir, meta);
  emit(`${provider} finished successfully.`);
  return meta;
}

async function runCursorAgent({ apiKey, modelId, prompt, emit, prepDir, job, cvSource }) {
  emit(`Starting Cursor SDK · ${modelId}`, 'meta');

  let agent;
  try {
    agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      local: { cwd: ROOT, settingSources: ['project'] },
    });
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor agent startup failed: ${err.message}`);
    }
    throw err;
  }

  try {
    const run = await agent.send(prompt);
    activeRun = run;
    emit(`Agent run ${run.id}`, 'meta');
    const stats = await streamRun(run, emit);
    const { result, usage, tools } = await waitRunResult(run, emit, stats);
    const meta = {
      ok: true,
      provider: 'cursor',
      runId: result.id,
      agentId: agent.agentId,
      status: result.status,
      durationMs: result.durationMs,
      tools,
      usage: usage || null,
      resultText: String(result.result || '').slice(0, 4000),
      jobId: job.id,
      cvSource,
      model: modelId,
      createdAt: new Date().toISOString(),
    };
    await saveAgentSession(prepDir, meta);
    return meta;
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor agent error: ${err.message}`);
    }
    throw err;
  } finally {
    activeRun = null;
    try {
      await agent[Symbol.asyncDispose]();
    } catch {
      try {
        agent.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Run Prep & CV tailor with the configured agent backend.
 */
export async function runCvTailorAgent({
  job,
  prepDir,
  profile = null,
  extraInstructions = '',
  cvSource = 'local',
  overleafPush = true,
  provider = null,
  model = null,
  onEvent = null,
  task = 'cv',
} = {}) {
  const letterTask = task === 'cover-letter';
  const prov = normalizeAgentProvider(provider);
  const modelSel = resolveAgentModel(model, prov);
  const emit = emitFn(onEvent);

  await mkdir(prepDir, { recursive: true });
  const prepRel = relative(ROOT, prepDir).replace(/\\/g, '/') || prepDir;
  const jobPostingRel = `${prepRel}/job-posting.md`;
  const instructionsRel = `${prepRel}/instructions.md`;
  const briefRel = letterTask ? `${prepRel}/cover-letter-brief.md` : `${prepRel}/agent-brief.md`;
  const instr = String(extraInstructions || '').trim();

  emit(`Provider: ${prov} · staging context outside the model`, 'meta');

  const brief = letterTask ? buildCoverLetterAgentBrief() : buildAgentBrief({ cvSource });
  await writeFile(
    join(prepDir, letterTask ? 'cover-letter-brief.md' : 'agent-brief.md'),
    brief.endsWith('\n') ? brief : `${brief}\n`,
  );

  let evidenceRel = '';
  try {
    const evidencePath = await refreshEvidence({ profile, emit });
    if (evidencePath) evidenceRel = relToRoot(evidencePath);
  } catch (err) {
    emit(`Evidence staging failed: ${err.message || err}`, 'stderr');
  }

  const techStackAbs = join(ROOT, 'cv', 'tech-stack.md');
  const techStackRel = existsSync(techStackAbs) ? 'cv/tech-stack.md' : '';

  if (!letterTask && cvSource === 'overleaf') {
    await stageOverleaf(emit);
  }

  const gapsRel = `${prepRel}/keyword-gaps.md`;
  try {
    const cvBits = [];
    for (const name of ['ats.tex', 'main.tex']) {
      const p = join(ROOT, '.workspace', 'overleaf', name);
      if (existsSync(p)) cvBits.push(await readFile(p, 'utf8'));
    }
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
    if (techStackRel) {
      try {
        evidenceText += `\n${await readFile(join(ROOT, techStackRel), 'utf8')}`;
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
      `First-screen gaps: ${analysis.onCv.length} on CV · ${analysis.promote.length} to promote · ${analysis.gaps.length} not evidenced`,
      'meta',
    );
    if (analysis.headline) emit(`Headline target: ${analysis.headline}`, 'meta');
  } catch (err) {
    emit(`Keyword-gap staging failed: ${err.message || err}`, 'stderr');
  }

  const writingRulesAbs = join(ROOT, '.agents', 'skills', 'cv-tailor', 'references', 'writing-rules.md');
  const writingRulesRel = existsSync(writingRulesAbs)
    ? '.agents/skills/cv-tailor/references/writing-rules.md'
    : '';

  const cvMdAbs = join(prepDir, 'cv.md');
  const cvRel = existsSync(cvMdAbs) ? `${prepRel}/cv.md` : '';
  const prompt = letterTask
    ? buildCoverLetterAgentPrompt({
      job,
      prepRel,
      jobPostingRel,
      instructionsRel,
      briefRel,
      evidenceRel,
      techStackRel,
      gapsRel,
      writingRulesRel,
      letterRel: `${prepRel}/cover-letter.md`,
      cvRel,
      profileName: profile?.name,
      extraInstructions: instr,
    })
    : buildAgentPrompt({
      job,
      prepRel,
      jobPostingRel,
      instructionsRel,
      briefRel,
      evidenceRel,
      techStackRel,
      gapsRel,
      writingRulesRel,
      overleafRel: '.workspace/overleaf',
      cvSource,
      profileName: profile?.name,
      extraInstructions: instr,
    });

  const promptPath = join(prepDir, letterTask ? 'cover-letter-prompt.md' : 'agent-prompt.md');
  await writeFile(promptPath, `${prompt}\n`);
  emit(
    letterTask
      ? `Prompt ready (${prompt.length} chars) — agent edits cover-letter.md only`
      : `Prompt ready (${prompt.length} chars) — agent edits only; Job Scout ${
        overleafPush && cvSource === 'overleaf' ? 'compiles + pushes after' : 'compiles after'
      }`,
    'meta',
  );

  if (prov === 'cursor') {
    const apiKey = process.env.CURSOR_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('CURSOR_API_KEY is missing — add it to .env, or switch agent provider to claude-code / codex');
    }
    return runCursorAgent({
      apiKey,
      modelId: modelSel.id || DEFAULT_AGENT_MODEL,
      prompt,
      emit,
      prepDir,
      job,
      cvSource,
    });
  }

  if (prov === 'claude-code') {
    const bin = await resolveProviderBinary('claude-code');
    if (!bin) {
      throw new Error(
        'Claude Code CLI not found. Install it and ensure `claude` is on PATH, or set CLAUDE_CODE_BIN.',
      );
    }
    // Headless: print mode + allow edit tools so Prep can change Overleaf / cv.md
    const args = [
      '-p',
      prompt,
      '--allowedTools',
      'Read,Edit,Write,Bash',
      '--permission-mode',
      'acceptEdits',
      '--output-format',
      'text',
    ];
    if (modelSel.id) args.push('--model', modelSel.id);
    return runCliAgent({
      bin,
      args,
      emit,
      provider: 'claude-code',
      modelId: modelSel.id,
      prepDir,
      job,
      cvSource,
    });
  }

  if (prov === 'codex') {
    const bin = await resolveProviderBinary('codex');
    if (!bin) {
      throw new Error(
        'Codex CLI not found. Install it and ensure `codex` is on PATH, or set CODEX_BIN.',
      );
    }
    const args = [
      'exec',
      '--sandbox',
      'workspace-write',
      '--ask-for-approval',
      'never',
    ];
    if (modelSel.id) args.push('--model', modelSel.id);
    args.push(prompt);
    return runCliAgent({
      bin,
      args,
      emit,
      provider: 'codex',
      modelId: modelSel.id,
      prepDir,
      job,
      cvSource,
    });
  }

  throw new Error(`Unknown agent provider: ${prov}`);
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
