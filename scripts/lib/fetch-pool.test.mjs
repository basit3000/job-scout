import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  clampInt,
  resolveFetchConcurrency,
  mapLimit,
  createQueue,
  createCheckpoint,
  startJobspyWorker,
} from './fetch-pool.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mockWorker = join(here, 'fetch-pool-mock-worker.mjs');

describe('resolveFetchConcurrency', () => {
  it('defaults to 4 boards and caps JobSpy at 2', () => {
    assert.deepEqual(resolveFetchConcurrency(undefined), { boards: 4, jobspy: 2, api: 4 });
    assert.deepEqual(resolveFetchConcurrency(8), { boards: 8, jobspy: 2, api: 8 });
    assert.deepEqual(resolveFetchConcurrency(1), { boards: 1, jobspy: 1, api: 1 });
  });

  it('clamps out-of-range values', () => {
    assert.equal(clampInt('nope', { min: 1, max: 8, fallback: 4 }), 4);
    assert.equal(resolveFetchConcurrency(99).boards, 8);
    assert.equal(resolveFetchConcurrency(0).boards, 1);
  });
});

describe('mapLimit', () => {
  it('runs at most N tasks at once', async () => {
    let inflight = 0;
    let peak = 0;
    const started = [];
    await mapLimit([1, 2, 3, 4], 2, async (n) => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      started.push(n);
      await new Promise((r) => setTimeout(r, 20));
      inflight -= 1;
      return n * 10;
    });
    assert.equal(peak, 2);
    assert.deepEqual(started.slice(0, 2).sort(), [1, 2]);
  });

  it('preserves order of results', async () => {
    const out = await mapLimit(['a', 'b', 'c'], 2, async (x, i) => {
      await new Promise((r) => setTimeout(r, 30 - i * 10));
      return x;
    });
    assert.deepEqual(out, ['a', 'b', 'c']);
  });
});

describe('createQueue', () => {
  it('does not overlap', async () => {
    const enqueue = createQueue();
    const log = [];
    await Promise.all([
      enqueue(async () => {
        log.push('a-start');
        await new Promise((r) => setTimeout(r, 20));
        log.push('a-end');
      }),
      enqueue(async () => {
        log.push('b-start');
        log.push('b-end');
      }),
    ]);
    assert.deepEqual(log, ['a-start', 'a-end', 'b-start', 'b-end']);
  });
});

describe('createCheckpoint', () => {
  it('writes immediately once, then coalesces until the interval', async () => {
    const writes = [];
    const cp = createCheckpoint(async (opts) => { writes.push(opts); }, { intervalMs: 50 });
    await cp.note();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].quiet, true);
    await cp.note();
    await cp.note();
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(writes.length, 2);
    await cp.flush({ quiet: false, stopped: true });
    assert.equal(writes.at(-1).stopped, true);
  });
});

describe('JobSpy worker protocol', () => {
  it('sends JSON lines to a warm worker', async () => {
    const worker = await startJobspyWorker({
      command: process.execPath,
      args: [mockWorker],
      spawnImpl: spawn,
      timeoutMs: 5000,
    });
    try {
      const first = await worker.request({ what: 'Python Developer', boards: ['indeed'] });
      const second = await worker.request({ what: 'Backend Engineer' });
      assert.equal(first.ok, true);
      assert.equal(first.jobs[0].title, 'Python Developer');
      assert.equal(first.count, 1);
      assert.equal(second.jobs[0].title, 'Backend Engineer');
    } finally {
      await worker.close();
    }
  });
});
