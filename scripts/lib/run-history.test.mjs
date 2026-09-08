import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatDuration,
  avgMs,
  elapsedMs,
  fetchRunTiming,
  batchRunTiming,
  appendRunHistory,
  loadRunHistory,
} from './run-history.mjs';

describe('run-history', () => {
  it('formats durations including hours', () => {
    assert.equal(formatDuration(0), '0ms');
    assert.equal(formatDuration(450), '450ms');
    assert.equal(formatDuration(1200), '1s');
    assert.equal(formatDuration(233000), '3m 53s');
    assert.equal(formatDuration(3600000), '1h');
    assert.equal(formatDuration(3723000), '1h 2m 3s');
  });

  it('averages and elapsed wall time', () => {
    assert.equal(avgMs(1000, 0), null);
    assert.equal(avgMs(9000, 3), 3000);
    assert.equal(
      elapsedMs('2026-09-08T10:00:00.000Z', '2026-09-08T10:01:30.000Z'),
      90_000,
    );
  });

  it('computes fetch average per query', () => {
    assert.deepEqual(fetchRunTiming({ durationMs: 88_000, queriesRun: 8 }), {
      durationMs: 88_000,
      queriesRun: 8,
      avgMsPerQuery: 11_000,
    });
    assert.equal(fetchRunTiming({ durationMs: 10_000, queriesRun: 0 }).avgMsPerQuery, null);
  });

  it('averages batch jobs that actually ran and estimates remaining time', () => {
    const items = [
      { status: 'done', durationMs: 10_000 },
      { status: 'failed', durationMs: 20_000 },
      { status: 'skipped', durationMs: 50 },
      { status: 'pending' },
      { status: 'running' },
    ];
    const timing = batchRunTiming({
      startedAt: '2026-09-08T10:00:00.000Z',
      items,
      running: true,
      now: Date.parse('2026-09-08T10:00:30.000Z'),
    });
    assert.equal(timing.elapsedMs, 30_000);
    assert.equal(timing.avgMsPerJob, 15_000);
    assert.equal(timing.timedCount, 2);
    assert.equal(timing.etaMs, 30_000);
  });

  it('appends newest-first and caps history per kind', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'js-run-history-'));
    await appendRunHistory('fetch', { durationMs: 1, queriesRun: 1 }, { dir, limit: 2 });
    await appendRunHistory('fetch', { durationMs: 2, queriesRun: 2 }, { dir, limit: 2 });
    await appendRunHistory('batch', { durationMs: 9, done: 1 }, { dir, limit: 2 });
    const third = await appendRunHistory('fetch', { durationMs: 3, queriesRun: 3 }, { dir, limit: 2 });
    assert.equal(third.fetch.length, 2);
    assert.equal(third.fetch[0].durationMs, 3);
    assert.equal(third.fetch[1].durationMs, 2);
    assert.equal(third.batch.length, 1);
    assert.equal(third.batch[0].kind, 'batch');
    const loaded = await loadRunHistory(dir);
    assert.equal(loaded.fetch[0].kind, 'fetch');
    const raw = JSON.parse(await readFile(join(dir, 'run-history.json'), 'utf8'));
    assert.equal(raw.fetch.length, 2);
  });
});
