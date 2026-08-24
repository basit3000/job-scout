/**
 * Prep & CV agent runners — pluggable backends:
 *   cursor       → Cursor SDK (@cursor/sdk)
 *   claude-code  → Claude Code CLI (`claude -p`)
 *   codex        → OpenAI Codex CLI (`codex exec`)
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { Agent, Cursor, CursorAgentError } from '@cursor/sdk';
import { ROOT, run } from './common.mjs';

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

function skillHint() {
  if (personalCvSkillPresent()) {
    return [
      'Prefer the personal skill at `.agents/skills/cv-tailor.local/` (name: cv-tailor-personal).',
      'Also read writing rules under that folder. Fall back to `.agents/skills/cv-tailor/` for scripts/checks.',
    ].join(' ');
  }
  return (
    'Follow `.agents/skills/cv-tailor/SKILL.md` and its references '
    + '(`writing-rules.md`, `format-benchmarks.md`, `overleaf.md`).'
  );
}

function buildPrompt({
  job,
  prepRel,
  jobPostingRel,
  instructionsRel,
  cvSource,
  overleafPush,
  profileName,
  extraInstructions,
}) {
  const lines = [
    'You are running Job Scout Prep & CV in agent mode.',
    skillHint(),
    '',
    'Hard rules:',
    '- No invented facts, metrics, employers, dates, or titles.',
    '- Experience is always the first body section (then Education → Projects → Skills).',
    '- Edit both main.tex and ats.tex (or neither) when using Overleaf.',
    '- Do not commit secrets. Do not echo git tokens or API keys.',
    '',
    'Experience bullets (source of truth):',
    '- Keep the current Overleaf Experience bullets. Do not replace them with a new story.',
    '- Lightly rewrite them so the same duties lead with what this posting cares about',
    '  (clause order, in-line tech names already on the CV). Same theme and voice.',
    '- Never invent duties, tools, team size, or metrics that are not already on the CV',
    '  or in the evidence pack.',
    '- Leave a bullet alone if it already fits.',
    '',
    'Portfolio:',
    '- Use portfolio project copy (evidence.md / src/data/projects.js / the live site)',
    '  for Projects and for stack names those entries already list.',
    '- Do not paste personal-project work into employment bullets.',
    '',
    `Candidate: ${profileName || 'from profile.json'}`,
    `Job: ${job.title} @ ${job.company}`,
    `Job URL: ${job.url || '(none)'}`,
    `CV source setting: ${cvSource}`,
    `Overleaf push after edit: ${overleafPush ? 'yes' : 'no'}`,
    `Prep pack directory: ${prepRel}`,
    `Job posting file (read fully): ${jobPostingRel}`,
  ];
  if (extraInstructions) {
    lines.push(`Extra instructions from the user: ${extraInstructions}`);
    lines.push(`Also written to: ${instructionsRel}`);
  }
  lines.push('');
  if (cvSource === 'overleaf') {
    lines.push(
      'Overleaf workflow for this repo (Job Scout paths):',
      '- Credentials are in the environment as OVERLEAF_GIT_TOKEN and OVERLEAF_PROJECT_ID.',
      '- Use the git clone at `.workspace/overleaf` (create/pull it if needed).',
      '- URL form: `https://git:$OVERLEAF_GIT_TOKEN@git.overleaf.com/$OVERLEAF_PROJECT_ID`.',
      '- Surgically edit ats.tex and main.tex for this job; keep one-page fit.',
      '- Run page/ATS checks when practical (scripts under `.agents/skills/cv-tailor/scripts/`).',
      overleafPush
        ? '- Commit and push the .tex changes to Overleaf when done.'
        : '- Do not push; leave edits in the local `.workspace/overleaf` clone.',
      '- After editing, Job Scout will compile PDFs into the prep pack — still write agent-report.md.',
    );
  } else {
    lines.push(
      'Local CV workflow:',
      '- Source of truth: `cv/resume.md` and/or `profile.json`.',
      `- Write a tailored one-page CV as Markdown to ${prepRel}/cv.md (facts only).`,
      '- Follow the same writing rules as the cv-tailor skill.',
    );
  }
  lines.push(
    '',
    `When finished, write a short report to ${prepRel}/agent-report.md covering:`,
    '- What changed (bullet by bullet) and the evidence for each change',
    '- Gaps / open questions',
    '- Whether Overleaf was pushed (if applicable)',
    '',
    'Do not stop after planning — apply the CV edits.',
  );
  return lines.join('\n');
}

function emitFn(onEvent) {
  return (line, stream = 'stdout') => {
    if (typeof onEvent === 'function') onEvent({ stream, line: String(line), t: Date.now() });
  };
}

async function streamRun(run, emit) {
  if (!run.supports('stream')) return;
  try {
    for await (const event of run.stream()) {
      if (event?.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block?.type === 'text' && block.text) {
            for (const line of String(block.text).split(/\r?\n/)) {
              if (line.trim()) emit(line);
            }
          }
        }
      } else if (event?.type === 'tool_call' || event?.type === 'tool-call') {
        emit(`tool: ${event.name || event.toolName || 'tool'}`);
      }
    }
  } catch (streamErr) {
    emit(`Stream ended early: ${streamErr.message || streamErr}`, 'stderr');
  }
}

async function waitRunResult(run, emit) {
  const result = await run.wait();
  if (result.status === 'cancelled') throw new Error('Agent run cancelled');
  if (result.status === 'error') {
    throw new Error(result.error?.message || `Agent run failed (${result.id})`);
  }
  emit('Agent finished successfully.');
  if (result.result) {
    for (const line of String(result.result).slice(0, 2000).split(/\r?\n/)) {
      if (line.trim()) emit(line);
    }
  }
  return result;
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
  emit(`Starting Cursor SDK agent…`);
  emit(`Model: ${modelId}`);
  emit(`Skill: ${personalCvSkillPresent() ? 'cv-tailor-personal (local)' : 'cv-tailor (generic)'}`);

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
    emit(`Agent run ${run.id} (agent ${agent.agentId})`);
    await streamRun(run, emit);
    const result = await waitRunResult(run, emit);
    const meta = {
      ok: true,
      provider: 'cursor',
      runId: result.id,
      agentId: agent.agentId,
      status: result.status,
      durationMs: result.durationMs,
      resultText: result.result || '',
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
} = {}) {
  const prov = normalizeAgentProvider(provider);
  const modelSel = resolveAgentModel(model, prov);
  const emit = emitFn(onEvent);

  await mkdir(prepDir, { recursive: true });
  const prepRel = relative(ROOT, prepDir).replace(/\\/g, '/') || prepDir;
  const jobPostingRel = `${prepRel}/job-posting.md`;
  const instructionsRel = `${prepRel}/instructions.md`;
  const instr = String(extraInstructions || '').trim();

  const prompt = buildPrompt({
    job,
    prepRel,
    jobPostingRel,
    instructionsRel,
    cvSource,
    overleafPush,
    profileName: profile?.name,
    extraInstructions: instr,
  });

  const promptPath = join(prepDir, 'agent-prompt.md');
  await writeFile(promptPath, `${prompt}\n`);

  emit(`Provider: ${prov}`);
  emit(`Skill: ${personalCvSkillPresent() ? 'cv-tailor-personal (local)' : 'cv-tailor (generic)'}`);

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
