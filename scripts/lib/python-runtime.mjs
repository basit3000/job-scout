/** Shared interpreter selection for one-shot fetches, warm workers and doctor. */
import { existsSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { ROOT, run } from './common.mjs';

export function pythonCandidates({
  root = ROOT, env = process.env, platform = process.platform, exists = existsSync,
} = {}) {
  const configured = env.JOB_SCOUT_PYTHON?.trim();
  if (configured) {
    // One executable, never a command string or interpreter plus shell arguments.
    const hasPath = /[/\\]/.test(configured);
    const command = hasPath && !isAbsolute(configured) ? resolve(root, configured) : configured;
    if (hasPath && !exists(command)) throw new Error('JOB_SCOUT_PYTHON does not point to an existing executable.');
    return [{ command, args: [] }];
  }
  const venv = join(root, '.venv', platform === 'win32' ? 'Scripts' : 'bin', platform === 'win32' ? 'python.exe' : 'python');
  if (exists(venv)) return [{ command: venv, args: [] }];
  return platform === 'win32'
    ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }, { command: 'python3', args: [] }]
    : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];
}

export function isMissingPython(err) {
  return err?.code === 'ENOENT' || /Python was not found|App execution aliases/i.test(String(err?.stderr || err?.message || err));
}

export async function runPython(args, options = {}, { runImpl = run, ...selection } = {}) {
  let lastError;
  for (const candidate of pythonCandidates({ ...selection, env: options.env ?? selection.env ?? process.env })) {
    try {
      return await runImpl(candidate.command, [...candidate.args, ...args], options);
    } catch (err) {
      lastError = err;
      if (!isMissingPython(err)) throw err;
    }
  }
  throw lastError || new Error('Python not found. Run setup.ps1 or create .venv.');
}
