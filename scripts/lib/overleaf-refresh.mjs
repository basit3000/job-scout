import { mkdir, rename, realpath, lstat, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { run } from './common.mjs';

// Build a fresh checkout first; retain the entire previous one, including untracked drafts.
export async function refreshOverleafCheckout({ remote, workspace, signal }) {
  await mkdir(workspace, { recursive: true });
  const root = await realpath(workspace);
  const dest = join(root, 'overleaf');
  const incoming = join(root, `overleaf-incoming-${randomUUID()}`);
  if (dirname(dest) !== root || dirname(incoming) !== root) throw new Error('Invalid Overleaf working directory.');
  const existing = await lstat(dest).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error('Overleaf working checkout must be an ordinary directory.');
  signal?.throwIfAborted();
  try {
    await run('git', ['clone', '--depth', '1', remote, incoming], { timeout: 180000, signal, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  } catch { throw new Error(signal?.aborted ? 'Overleaf refresh cancelled.' : 'Could not read the online Overleaf master; the previous checkout is unchanged.'); }
  for (const name of ['main.tex', 'ats.tex']) {
    try { await access(join(incoming, name)); }
    catch { throw new Error(`Online Overleaf master is missing ${name}; the previous checkout is unchanged.`); }
  }
  signal?.throwIfAborted();
  let backup = null;
  if (existing) {
    const history = join(root, 'overleaf-history');
    await mkdir(history, { recursive: true });
    if (await realpath(history) !== history) throw new Error('Overleaf history must remain inside the workspace.');
    backup = join(history, randomUUID());
    await rename(dest, backup);
  }
  try { await rename(incoming, dest); }
  catch (error) { if (backup) await rename(backup, dest); throw error; }
  return { dest, action: 'refreshed from online master', backup };
}
