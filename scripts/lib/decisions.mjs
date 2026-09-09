import { writeFile, mkdir, rename, rm, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { ROOT, loadJson, workspaceDir } from './common.mjs';

export const VALID_DECISIONS = ['applied', 'skipped', 'shortlisted', 'interviewing', 'offer', 'accepted', 'rejected', 'closed'];
const TERMINAL = new Set(['skipped', 'accepted', 'rejected', 'closed']);
export function decisionsPath(root = ROOT) { return join(root, 'state', 'decisions.json'); }
export async function loadDecisions(root = ROOT) {
  try {
    const log = JSON.parse(await readFile(decisionsPath(root), 'utf8'));
    if (!Array.isArray(log.decisions)) throw new Error('Invalid application store: decisions must be an array');
    return log;
  } catch (err) {
    if (err.code === 'ENOENT') return { decisions: [] };
    throw err;
  }
}

// Serialize this server's updates and atomically replace JSON; never lose parallel edits.
const pending = new Map();
async function mutate(root, change) {
  const path = decisionsPath(root);
  const task = (pending.get(path) || Promise.resolve()).catch(() => {}).then(async () => {
    const log = await loadDecisions(root);
    const result = await change(log);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(log, null, 2)}\n`, { flag: 'wx' });
      await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
    return result;
  });
  pending.set(path, task);
  try { return await task; } finally { if (pending.get(path) === task) pending.delete(path); }
}

function changedEntry(previous, patch) {
  const now = new Date().toISOString();
  const entry = { ...previous, ...patch, updatedAt: now };
  if (!VALID_DECISIONS.includes(entry.decision)) throw new Error(`Unknown decision "${entry.decision}"`);
  const changed = !previous || entry.decision !== previous.decision;
  entry.createdAt = previous?.createdAt || now;
  entry.date = previous?.date || now.slice(0, 10);
  if (changed) {
    entry.statusHistory = [...(previous?.statusHistory || []), { from: previous?.decision || null, to: entry.decision, at: now }];
    if (previous) entry.previousDecision = previous.decision;
    if (entry.decision === 'applied' && !previous?.appliedDate && patch.appliedDate === undefined) entry.appliedDate = now.slice(0, 10);
  }
  if (TERMINAL.has(entry.decision)) entry.followUpDate = null;
  return entry;
}

export async function recordDecision(id, decision, note = '', extra = {}) {
  if (!id) throw new Error('id is required');
  const root = extra.root || ROOT;
  const fetched = await loadJson(join(root === ROOT ? workspaceDir() : join(root, '.workspace'), 'jobs.json'), { jobs: [] });
  const job = (fetched.jobs ?? []).find((j) => j.id === id) || extra.job;
  return mutate(root, (log) => {
    const index = log.decisions.findIndex((d) => d.id === id);
    const previous = index < 0 ? null : log.decisions[index];
    const patch = { id, decision, note: note || previous?.note || null };
    for (const key of ['title', 'company', 'url', 'board', 'location', 'salary']) patch[key] = previous?.[key] ?? job?.[key] ?? null;
    for (const key of ['followUpDate', 'prepPath']) if (extra[key] !== undefined) patch[key] = extra[key] || null;
    Object.assign(patch, extra.application || {});
    const entry = changedEntry(previous, patch);
    if (index < 0) log.decisions.push(entry); else log.decisions[index] = entry;
    return { entry, updated: index >= 0, previous: previous?.decision };
  });
}

export async function patchDecision(id, patch = {}, { root = ROOT } = {}) {
  return mutate(root, (log) => {
    const index = log.decisions.findIndex((d) => d.id === id);
    if (index < 0) throw new Error(`No decision for ${id}`);
    const previous = log.decisions[index];
    const fields = typeof patch === 'function' ? patch(previous) : patch;
    log.decisions[index] = changedEntry(previous, { ...fields, id });
    return log.decisions[index];
  });
}
