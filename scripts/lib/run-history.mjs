/**
 * Wall-clock timing for Digest searches and Batch Prep.
 * History lives in .workspace/run-history.json (gitignored).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadJson, workspaceDir } from './common.mjs';

export const HISTORY_LIMIT = 40;
export const HISTORY_KINDS = ['fetch', 'batch'];

export function runHistoryPath(dir = workspaceDir()) {
  return join(dir, 'run-history.json');
}

export function formatDuration(ms) {
  const n = Math.max(0, Math.round(Number(ms) || 0));
  if (n < 1000) return `${n}ms`;
  const sec = Math.round(n / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (!rm && !s) return `${h}h`;
  if (!s) return `${h}h ${rm}m`;
  if (!rm) return `${h}h ${s}s`;
  return `${h}h ${rm}m ${s}s`;
}

export function avgMs(totalMs, count) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  return Math.round((Number(totalMs) || 0) / n);
}

export function elapsedMs(startedAt, finishedAt = null, now = Date.now()) {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(start)) return 0;
  const end = finishedAt ? Date.parse(finishedAt) : now;
  const endMs = Number.isFinite(end) ? end : now;
  return Math.max(0, endMs - start);
}

/** Average over jobs that actually ran (done / failed), not skipped or cancelled. */
export function batchRunTiming({
  startedAt,
  finishedAt,
  items = [],
  running = false,
  now = Date.now(),
} = {}) {
  const elapsed = elapsedMs(startedAt, finishedAt, now);
  const timed = (items || []).filter((item) => {
    if (item?.status !== 'done' && item?.status !== 'failed') return false;
    return Number(item.durationMs) > 0;
  });
  const average = timed.length
    ? Math.round(timed.reduce((sum, item) => sum + Number(item.durationMs), 0) / timed.length)
    : null;
  const remaining = (items || []).filter(
    (item) => item?.status === 'pending' || item?.status === 'running',
  ).length;
  const etaMs = running && average != null && remaining > 0 ? average * remaining : null;
  return {
    elapsedMs: elapsed,
    avgMsPerJob: average,
    etaMs,
    timedCount: timed.length,
  };
}

export function fetchRunTiming({ durationMs, queriesRun } = {}) {
  const duration = Math.max(0, Number(durationMs) || 0);
  const queries = Math.max(0, Number(queriesRun) || 0);
  return {
    durationMs: duration,
    queriesRun: queries,
    avgMsPerQuery: avgMs(duration, queries),
  };
}

export async function loadRunHistory(dir = workspaceDir()) {
  const data = await loadJson(runHistoryPath(dir), null);
  const fetch = Array.isArray(data?.fetch) ? data.fetch : [];
  const batch = Array.isArray(data?.batch) ? data.batch : [];
  return {
    updatedAt: data?.updatedAt || null,
    fetch,
    batch,
  };
}

export async function appendRunHistory(kind, record, { dir = workspaceDir(), limit = HISTORY_LIMIT } = {}) {
  if (!HISTORY_KINDS.includes(kind)) {
    throw new Error(`Unknown run-history kind "${kind}"`);
  }
  await mkdir(dir, { recursive: true });
  const history = await loadRunHistory(dir);
  const entry = {
    ...record,
    kind,
    recordedAt: new Date().toISOString(),
  };
  const next = [entry, ...(history[kind] || [])].slice(0, Math.max(1, Number(limit) || HISTORY_LIMIT));
  const payload = {
    updatedAt: entry.recordedAt,
    fetch: kind === 'fetch' ? next : history.fetch,
    batch: kind === 'batch' ? next : history.batch,
  };
  await writeFile(runHistoryPath(dir), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}
