import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ROOT, loadJson, workspaceDir } from './common.mjs';

export const VALID_DECISIONS = [
  'applied',
  'skipped',
  'shortlisted',
  'interviewing',
  'rejected',
  'closed',
];

export function decisionsPath() {
  return join(ROOT, 'state', 'decisions.json');
}

export async function loadDecisions() {
  return loadJson(decisionsPath(), { decisions: [] });
}

/**
 * Record or update a ruling for a job id.
 * @param {object} [extra] followUpDate, prepPath, clearFollowUp
 */
export async function recordDecision(id, decision, note = '', extra = {}) {
  if (!id) throw new Error('id is required');
  if (!VALID_DECISIONS.includes(decision)) {
    throw new Error(`Unknown decision "${decision}". Use one of: ${VALID_DECISIONS.join(', ')}`);
  }

  const log = await loadDecisions();
  const fetched = await loadJson(join(workspaceDir(), 'jobs.json'), { jobs: [] });
  const snapshot = extra.job && typeof extra.job === 'object' ? extra.job : null;
  const job = (fetched.jobs ?? []).find((j) => j.id === id) || snapshot;

  const existingIndex = log.decisions.findIndex((d) => d.id === id);
  const prev = existingIndex !== -1 ? log.decisions[existingIndex] : null;

  let followUpDate = prev?.followUpDate ?? null;
  if (extra.followUpDate !== undefined) followUpDate = extra.followUpDate || null;
  else if (decision === 'applied' && !followUpDate) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    followUpDate = d.toISOString().slice(0, 10);
  } else if (decision === 'skipped' || decision === 'rejected' || decision === 'closed') {
    if (extra.followUpDate === undefined) followUpDate = null;
  }

  const entry = {
    id,
    decision,
    date: new Date().toISOString().slice(0, 10),
    title: job?.title ?? snapshot?.title ?? prev?.title ?? null,
    company: job?.company ?? snapshot?.company ?? prev?.company ?? null,
    url: job?.url ?? snapshot?.url ?? prev?.url ?? null,
    board: job?.board ?? snapshot?.board ?? prev?.board ?? null,
    note: note || prev?.note || null,
    followUpDate,
    prepPath: extra.prepPath !== undefined ? extra.prepPath : (prev?.prepPath ?? null),
  };

  let updated = false;
  let previous;
  if (existingIndex !== -1) {
    previous = prev.decision;
    log.decisions[existingIndex] = { ...entry, previousDecision: previous };
    updated = true;
  } else {
    log.decisions.push(entry);
  }

  const path = decisionsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(log, null, 2)}\n`);

  return { entry: updated ? log.decisions[existingIndex] : entry, updated, previous };
}

export async function patchDecision(id, patch = {}) {
  const log = await loadDecisions();
  const i = log.decisions.findIndex((d) => d.id === id);
  if (i === -1) throw new Error(`No decision for ${id}`);
  log.decisions[i] = {
    ...log.decisions[i],
    ...patch,
    id,
  };
  await mkdir(dirname(decisionsPath()), { recursive: true });
  await writeFile(decisionsPath(), `${JSON.stringify(log, null, 2)}\n`);
  return log.decisions[i];
}
