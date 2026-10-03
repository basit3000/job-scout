import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPreparationRuns } from './preparation-runs.mjs';

function watch(runs, id) {
  const done = Promise.withResolvers();
  const messages = [];
  const client = new EventEmitter();
  client.write = chunk => {
    messages.push(chunk);
    if (chunk.startsWith('event: done\n')) done.resolve(JSON.parse(chunk.split('data: ')[1]));
  };
  runs.subscribe(runs.get(id), client);
  return { done: done.promise, messages, close: () => client.emit('close') };
}

test('two jobs run together; further jobs queue; events and results stay with their run', async () => {
  const runs = createPreparationRuns();
  const releases = Array.from({ length: 3 }, () => Promise.withResolvers());
  const started = [];
  const jobs = releases.map((release, index) => runs.start(`job:${index}`, async (_signal, log) => {
    started.push(index);
    log(`only-job-${index}`);
    await release.promise;
    return { value: index };
  }));
  const watchers = jobs.map(run => watch(runs, run.runId));
  assert.deepEqual(started, [0, 1]);
  assert.equal(jobs[2].queued, true);
  assert.equal(runs.get(), null, 'ambiguous legacy requests cannot target another run');
  assert.throws(() => runs.start('job:0', async () => ({})), /already running for this job/);
  releases[0].resolve();
  await watchers[0].done;
  assert.deepEqual(started, [0, 1, 2]);
  releases[1].resolve(); releases[2].resolve();
  for (const [index, watcher] of watchers.entries()) {
    const result = await watcher.done;
    assert.equal(result.value, index);
    assert.equal(result.runId, jobs[index].runId);
    assert.ok(watcher.messages.join('').includes(`only-job-${index}`));
    assert.ok(!watcher.messages.join('').includes(`only-job-${(index + 1) % 3}`));
    watcher.close();
  }
  assert.equal(runs.busy, false);
  assert.equal((await watch(runs, jobs[0].runId).done).value, 0, 'completed runs reconnect to their own result');
});

test('cancelling a running or queued job never cancels other jobs', async () => {
  const runs = createPreparationRuns();
  const release = Promise.withResolvers();
  const first = runs.start('first', signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  const second = runs.start('second', async signal => { await release.promise; assert.equal(signal.aborted, false); return {}; });
  let queuedStarted = false;
  const third = runs.start('third', async () => { queuedStarted = true; return {}; });
  const watches = [first, second, third].map(run => watch(runs, run.runId));
  assert.throws(() => runs.stop(), /Select the preparation run/);
  runs.stop(third.runId);
  runs.stop(first.runId);
  assert.equal((await watches[0].done).cancelled, true);
  assert.equal((await watches[2].done).cancelled, true);
  assert.equal(queuedStarted, false);
  assert.equal(runs.activeForJob('second').running, true);
  release.resolve();
  assert.equal((await watches[1].done).ok, true);
  watches.forEach(watcher => watcher.close());
});
