/** Bounded parallelism, throttled checkpoints, and a warm JobSpy Python worker. */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export const DEFAULT_FETCH_CONCURRENCY = 4;
export const MAX_FETCH_CONCURRENCY = 8;
export const DEFAULT_JOBSPY_CONCURRENCY = 2;
export const CHECKPOINT_INTERVAL_MS = 15_000;
export const JOBSPY_REQUEST_TIMEOUT_MS = 180_000;

export function clampInt(n, { min, max, fallback }) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/**
 * Boards run in parallel. JobSpy (Indeed/LinkedIn/…) stays at most 2 at once
 * so the same IP does not hammer one site.
 */
export function resolveFetchConcurrency(raw) {
  const boards = clampInt(raw, {
    min: 1,
    max: MAX_FETCH_CONCURRENCY,
    fallback: DEFAULT_FETCH_CONCURRENCY,
  });
  return {
    boards,
    jobspy: Math.min(DEFAULT_JOBSPY_CONCURRENCY, boards),
    api: boards,
  };
}

export async function mapLimit(items, limit, fn) {
  const list = items ?? [];
  if (!list.length) return [];
  const out = new Array(list.length);
  let i = 0;
  const n = Math.min(Math.max(1, Number(limit) || 1), list.length);
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < list.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(list[idx], idx);
    }
  }));
  return out;
}

/** Serialize async work so overlapping callers cannot interleave. */
export function createQueue() {
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(fn, fn);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

/**
 * Coalesce expensive archive writes. `note()` schedules a quiet checkpoint;
 * `flush()` runs immediately (stop / end of run).
 */
export function createCheckpoint(writeFn, { intervalMs = CHECKPOINT_INTERVAL_MS } = {}) {
  const enqueue = createQueue();
  let timer = null;
  let dirty = false;
  let last = 0;

  const write = (opts) => enqueue(() => writeFn(opts));

  const runQuiet = () => {
    if (!dirty) return Promise.resolve();
    dirty = false;
    last = Date.now();
    return write({ quiet: true });
  };

  return {
    note() {
      dirty = true;
      const now = Date.now();
      if (now - last >= intervalMs) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return runQuiet();
      }
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          runQuiet();
        }, Math.max(0, intervalMs - (now - last)));
      }
      return Promise.resolve();
    },
    async flush(opts = {}) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      dirty = false;
      last = Date.now();
      return write(opts);
    },
  };
}

function parseJsonLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

/**
 * Long-lived `jobspy_fallback.py --worker`. One request at a time per worker.
 */
export function startJobspyWorker({
  command,
  args = ['--worker'],
  env = process.env,
  cwd,
  spawnImpl = spawn,
  timeoutMs = JOBSPY_REQUEST_TIMEOUT_MS,
} = {}) {
  if (!command) {
    return Promise.reject(new Error('JobSpy worker needs a Python command'));
  }

  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd,
      env: { ...env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let ready = false;
    let pending = null;
    let dead = false;
    const stderrChunks = [];
    const readyTimer = setTimeout(() => {
      if (ready || dead) return;
      const err = new Error('JobSpy worker did not become ready');
      shutdown(err);
      reject(err);
      try { child.kill(); } catch { /* ignore */ }
    }, 30_000);

    const failPending = (err) => {
      if (pending) {
        const { reject: rejectPending, timer } = pending;
        pending = null;
        clearTimeout(timer);
        rejectPending(err);
      }
    };

    const shutdown = (err) => {
      if (dead) {
        failPending(err);
        return;
      }
      dead = true;
      failPending(err);
      try { child.stdin.end(); } catch { /* already closed */ }
    };

    const api = {
      get dead() { return dead; },
      async request(payload) {
        if (dead) throw new Error('JobSpy worker is not running');
        if (pending) throw new Error('JobSpy worker is busy');
        return new Promise((resolveRequest, rejectRequest) => {
          const timer = setTimeout(() => {
            pending = null;
            try { child.kill(); } catch { /* ignore */ }
            rejectRequest(new Error(`JobSpy worker timed out after ${timeoutMs}ms`));
          }, timeoutMs);
          pending = { resolve: resolveRequest, reject: rejectRequest, timer };
          try {
            child.stdin.write(`${JSON.stringify(payload)}\n`);
          } catch (err) {
            pending = null;
            clearTimeout(timer);
            rejectRequest(err);
          }
        });
      },
      async close() {
        if (dead) return;
        dead = true;
        failPending(new Error('JobSpy worker closed'));
        try {
          child.stdin.write(`${JSON.stringify({ cmd: 'quit' })}\n`);
          child.stdin.end();
        } catch {
          /* ignore */
        }
        await new Promise((resolveClose) => {
          const timer = setTimeout(() => {
            try { child.kill(); } catch { /* ignore */ }
            resolveClose();
          }, 1500);
          child.once('exit', () => {
            clearTimeout(timer);
            resolveClose();
          });
        });
      },
    };

    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      let msg;
      try {
        msg = parseJsonLine(line);
      } catch (err) {
        if (ready) failPending(new Error(`JobSpy worker sent invalid JSON (${err.message})`));
        return;
      }
      if (!msg) return;
      if (!ready) {
        if (msg.ready === true) {
          ready = true;
          clearTimeout(readyTimer);
          resolve(api);
          return;
        }
        if (msg.ok === false) {
          shutdown(new Error(msg.error || 'JobSpy worker failed to start'));
          reject(new Error(msg.error || 'JobSpy worker failed to start'));
          return;
        }
        return;
      }
      if (!pending) return;
      const { resolve: resolvePending, timer } = pending;
      pending = null;
      clearTimeout(timer);
      resolvePending(msg);
    });

    child.stderr?.on('data', (chunk) => {
      const text = String(chunk);
      stderrChunks.push(text);
      if (stderrChunks.length > 20) stderrChunks.shift();
    });

    child.on('error', (err) => {
      clearTimeout(readyTimer);
      shutdown(err);
      if (!ready) reject(err);
    });

    child.on('exit', (code, signal) => {
      clearTimeout(readyTimer);
      const detail = stderrChunks.join('').trim().split('\n').slice(-2).join(' | ');
      const err = new Error(
        detail || `JobSpy worker exited (${signal || (code ?? 'unknown')})`,
      );
      shutdown(err);
      if (!ready) reject(err);
    });
  });
}

export async function startJobspyWorkerFromBins({
  script,
  env = process.env,
  cwd,
  bins = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'],
  spawnImpl = spawn,
  timeoutMs = JOBSPY_REQUEST_TIMEOUT_MS,
} = {}) {
  let lastErr;
  for (const bin of bins) {
    try {
      return await startJobspyWorker({
        command: bin,
        args: [script, '--worker'],
        env,
        cwd,
        spawnImpl,
        timeoutMs,
      });
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (/not found|ENOENT|App execution aliases/i.test(msg)) continue;
      break;
    }
  }
  throw lastErr || new Error('Python not found');
}

/** One warm worker per JobSpy board; restart once if it dies mid-run. */
export function createJobspySession(opts = {}) {
  let worker = null;

  return {
    async request(payload) {
      if (!worker || worker.dead) {
        worker = await startJobspyWorkerFromBins(opts);
      }
      try {
        return await worker.request(payload);
      } catch (err) {
        await worker.close().catch(() => {});
        worker = null;
        throw err;
      }
    },
    async close() {
      if (!worker) return;
      await worker.close().catch(() => {});
      worker = null;
    },
  };
}
