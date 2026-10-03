import { randomUUID } from 'node:crypto';

/** Independent progress and cancellation, with bounded concurrent job preparation. */
export function createPreparationRuns({ concurrency = 2, onChange = () => {} } = {}) {
  const runs = new Map();
  const queue = [];
  let active = 0;
  const snapshot = run => ({ runId: run.runId, jobId: run.jobId, startedAt: run.startedAt,
    running: run.running, queued: run.queued, stopping: run.stopping });
  const broadcast = (run, event, data) => {
    for (const client of run.clients) {
      try { client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
      catch { run.clients.delete(client); }
    }
  };
  const log = (run, line, stream = 'meta') => {
    const entry = { line: String(line), stream, t: Date.now(), runId: run.runId, jobId: run.jobId };
    run.buffer.push(entry);
    if (run.buffer.length > 800) run.buffer.shift();
    broadcast(run, 'log', entry);
  };
  const complete = (run, result) => {
    run.running = false;
    run.queued = false;
    run.stopping = false;
    run.result = { ...result, runId: run.runId, jobId: run.jobId, startedAt: run.startedAt };
    broadcast(run, 'done', run.result);
    onChange();
  };
  const drain = () => {
    while (active < concurrency && queue.length) {
      const { run, execute } = queue.shift();
      if (!run.running) continue;
      active++;
      run.queued = false;
      broadcast(run, 'status', snapshot(run));
      void (async () => {
        try {
          const result = await execute(run.controller.signal, (line, stream) => log(run, line, stream));
          run.controller.signal.throwIfAborted();
          complete(run, { ok: true, ...result });
        } catch (error) {
          log(run, error.message, 'stderr');
          complete(run, { ok: false, cancelled: run.controller.signal.aborted, error: error.message });
        } finally { active--; drain(); }
      })();
    }
  };
  return {
    get busy() { return [...runs.values()].some(run => run.running); },
    activeForJob(jobId) { return [...runs.values()].find(run => run.running && run.jobId === jobId); },
    snapshots() { return [...runs.values()].filter(run => run.running).map(snapshot); },
    get(id) {
      if (id) return runs.get(id);
      const activeRuns = [...runs.values()].filter(run => run.running);
      return activeRuns.length > 1 ? null : activeRuns[0] || [...runs.values()].at(-1);
    },
    start(jobId, execute) {
      if (this.activeForJob(jobId)) throw new Error('Preparation is already running for this job.');
      for (const [id, run] of runs) {
        if (runs.size < 30) break;
        if (!run.running && !run.clients.size) runs.delete(id);
      }
      const run = { runId: randomUUID(), jobId, startedAt: new Date().toISOString(),
        running: true, queued: true, stopping: false, buffer: [], clients: new Set(), result: null,
        controller: new AbortController() };
      runs.set(run.runId, run);
      log(run, 'Preparation queued. You can keep browsing.');
      queue.push({ run, execute });
      drain();
      return snapshot(run);
    },
    stop(id) {
      const run = this.get(id);
      if (!run) throw new Error('Select the preparation run to stop.');
      if (!run.running) return false;
      run.stopping = true;
      run.controller.abort(new Error('Goose workflow cancelled'));
      if (run.queued) complete(run, { ok: false, cancelled: true, error: 'Preparation cancelled while queued.' });
      else log(run, 'Stop requested. Cancelling this preparation run.');
      return true;
    },
    subscribe(run, res) {
      res.write(`event: status\ndata: ${JSON.stringify(snapshot(run))}\n\n`);
      for (const entry of run.buffer) res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
      if (run.result) res.write(`event: done\ndata: ${JSON.stringify(run.result)}\n\n`);
      run.clients.add(res);
      res.on('close', () => run.clients.delete(res));
    },
  };
}
