import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGooseToolBridge, validateGooseRequest } from './goose-tools.mjs';
import { runGoose } from './goose-runtime.mjs';
import { runGooseCoordinator, recoverJobDescription } from './goose-pipeline.mjs';
import { assessPrep, prepFingerprint, generateDocuments } from './prep-state.mjs';
import { suggestedGoosePrompt } from '../../web/public/goose-prep.js';

async function rpc(bridge, method, params = {}, headers = {}) {
  const response = await fetch(bridge.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return { status: response.status, body: await response.json() };
}

test('missing posting recovery persists public details and tolerates unavailable optional sources', async () => {
  const job = { id: 'fixture:missing', board: 'arbeitsagentur', description: 'Beruf: Engineer' };
  const saved = [];
  const events = [];
  const options = { onEvent: event => events.push(event.line), hydrate: async () => 'Build and test Python APIs.',
    persistDescription: async (...args) => { saved.push(args); return true; } };
  const recovered = await recoverJobDescription(job, options);
  assert.equal(recovered.description, 'Build and test Python APIs.');
  assert.deepEqual(saved, [[job.id, recovered.description]]);
  assert.equal(job.description, 'Beruf: Engineer', 'original snapshot is not mutated');
  assert.equal(await recoverJobDescription(recovered, { hydrate: () => assert.fail('must not refetch a complete posting') }), recovered);
  for (const hydrate of [async () => null, async () => { throw new Error('offline'); }]) {
    assert.equal(await recoverJobDescription(job, { ...options, hydrate }), job);
  }
  assert.equal(await recoverJobDescription(job, { ...options, persistDescription: async () => false }), job);
  assert.ok(events.some(line => /job fit may remain unassessed/.test(line)));
  const controller = new AbortController();
  await assert.rejects(recoverJobDescription(job, { signal: controller.signal,
    hydrate: async () => { controller.abort(new Error('cancelled')); return 'Recovered description'; },
    persistDescription: () => assert.fail('cancelled recovery must not save'),
  }), /cancelled/);
});

test('workflow validation rejects empty/unknown tools and invalid prompts', () => {
  for (const body of [{}, { tools: [], prompt: 'Review' }, { tools: ['shell'], prompt: 'Review' },
    { tools: ['inspect_job'], prompt: ' ' }, { tools: ['inspect_job'], prompt: 'a'.repeat(4001) }]) {
    assert.throws(() => validateGooseRequest(body));
  }
  assert.deepEqual(validateGooseRequest({ tools: ['inspect_job', 'inspect_job'], prompt: ' Review ' }),
    { tools: ['inspect_job'], prompt: 'Review' });
});

test('Overleaf publication requires a boolean choice and the CV tool', () => {
  assert.throws(() => validateGooseRequest({ tools: ['prepare_cv'], prompt: 'Create CV', pushToOverleaf: 'true' }), /checkbox/);
  assert.throws(() => validateGooseRequest({ tools: ['inspect_cv'], prompt: 'Read CV', pushToOverleaf: true }), /Prepare CV/);
  assert.equal(validateGooseRequest({ tools: ['prepare_cv'], prompt: 'Create CV', pushToOverleaf: true }).pushToOverleaf, true);
});

test('MCP exposes only selected tools and rejects disabled tools and arguments', async (t) => {
  let calls = 0;
  const bridge = await createGooseToolBridge({ tools: ['inspect_job'], handlers: {
    inspect_job: async () => { calls++; return { title: 'Synthetic role' }; },
    prepare_cv: async () => { throw new Error('must not run'); },
  } });
  t.after(() => bridge.close());
  const init = await rpc(bridge, 'initialize');
  assert.equal(init.body.result.serverInfo.name, 'job-scout');
  const list = await rpc(bridge, 'tools/list');
  assert.deepEqual(list.body.result.tools.map((tool) => tool.name), ['inspect_job']);
  assert.equal((await rpc(bridge, 'tools/call', { name: 'prepare_cv' })).body.result.isError, true);
  assert.equal((await rpc(bridge, 'tools/call', { name: 'inspect_job', arguments: { path: '.env' } })).body.result.isError, true);
  const allowed = await rpc(bridge, 'tools/call', { name: 'inspect_job' });
  assert.match(allowed.body.result.content[0].text, /Synthetic role/);
  assert.equal(calls, 1);
});

test('MCP rejects cross-origin requests and unknown capability paths', async (t) => {
  const bridge = await createGooseToolBridge({ tools: ['inspect_job'], handlers: {} });
  t.after(() => bridge.close());
  assert.equal((await rpc(bridge, 'tools/list', {}, { Origin: 'https://example.com' })).status, 403);
  const response = await fetch(new URL('/mcp/wrong', bridge.url), { method: 'POST', body: '{}' });
  assert.equal(response.status, 403);
});

test('document calls are sequential and retrying a completed write is idempotent', async (t) => {
  let release, calls = 0;
  const waiting = new Promise((resolve) => { release = resolve; });
  const bridge = await createGooseToolBridge({ tools: ['prepare_cv', 'inspect_job'], handlers: {
    prepare_cv: async () => { calls++; await waiting; return { needsReview: false }; },
    inspect_job: async () => ({}),
  } });
  t.after(() => bridge.close());
  const first = rpc(bridge, 'tools/call', { name: 'prepare_cv' });
  while (!calls) await new Promise((resolve) => setTimeout(resolve, 5));
  const conflict = await rpc(bridge, 'tools/call', { name: 'inspect_job' });
  assert.equal(conflict.body.result.isError, true);
  release(); await first;
  await rpc(bridge, 'tools/call', { name: 'prepare_cv' });
  assert.equal(calls, 1);
  assert.equal(bridge.calls[0].status, 'done');
});

test('inspection calls overlap, block writes, and are all drained on finish', async t => {
  const release = Promise.withResolvers();
  const firstStarted = Promise.withResolvers();
  const secondStarted = Promise.withResolvers();
  const bridge = await createGooseToolBridge({ tools: ['inspect_job', 'inspect_cv', 'prepare_cv'], handlers: {
    inspect_job: async () => { firstStarted.resolve(); await release.promise; return {}; },
    inspect_cv: async () => { secondStarted.resolve(); await release.promise; return {}; },
    prepare_cv: async () => { throw new Error('write must not start during inspection'); },
  } });
  t.after(async () => { release.resolve(); await bridge.close(); });
  const first = rpc(bridge, 'tools/call', { name: 'inspect_job' });
  const second = rpc(bridge, 'tools/call', { name: 'inspect_cv' });
  await Promise.all([firstStarted.promise, secondStarted.promise]);
  assert.equal(bridge.calls.filter(call => call.status === 'running').length, 2);
  assert.equal((await rpc(bridge, 'tools/call', { name: 'prepare_cv' })).body.result.isError, true);
  const finished = bridge.finish();
  release.resolve();
  await finished;
  for (const result of await Promise.all([first, second])) assert.equal(result.body.result.isError, undefined);
  assert.ok(bridge.calls.every(call => call.status === 'done'));
});

test('cancelled runs reject further tool calls; failures remain in the audit', async (t) => {
  const controller = new AbortController();
  const bridge = await createGooseToolBridge({ tools: ['inspect_job'], signal: controller.signal,
    handlers: { inspect_job: async () => { throw new Error('fixture failure'); } } });
  t.after(() => bridge.close());
  assert.equal((await rpc(bridge, 'tools/call', { name: 'inspect_job' })).body.result.isError, true);
  assert.equal(bridge.calls[0].status, 'failed');
  controller.abort();
  assert.equal((await rpc(bridge, 'tools/call', { name: 'inspect_job' })).body.result.isError, true);
  assert.equal(bridge.calls.length, 1);
});

test('tool call budget prevents unlimited agent loops', async (t) => {
  const bridge = await createGooseToolBridge({ tools: ['inspect_job'], maxCalls: 1,
    handlers: { inspect_job: async () => ({}) } });
  t.after(() => bridge.close());
  await rpc(bridge, 'tools/call', { name: 'inspect_job' });
  assert.equal((await rpc(bridge, 'tools/call', { name: 'inspect_job' })).body.result.isError, true);
});

for (const outcome of ['ready', 'needs-review', 'failed', 'cancelled']) {
  test(`coordinator exit waits for active host work: ${outcome}`, async (t) => {
    const controller = new AbortController();
    const started = Promise.withResolvers();
    const work = Promise.withResolvers();
    const waiting = Promise.withResolvers();
    const bridge = await createGooseToolBridge({ tools: ['prepare_cv', 'inspect_reviews'],
      signal: controller.signal, handlers: {
        prepare_cv: async () => {
          started.resolve();
          await work.promise;
          if (outcome === 'failed') throw new Error('Host review failed');
          return { needsReview: outcome === 'needs-review' };
        },
        inspect_reviews: async () => ({}),
      } });
    t.after(async () => { work.resolve(); await bridge.close(); });
    let request, settled = false;
    const session = runGooseCoordinator({ signal: controller.signal,
      onEvent: () => waiting.resolve() }, bridge, async () => {
      request = rpc(bridge, 'tools/call', { name: 'prepare_cv' });
      await started.promise;
      return 'Coordinator has exited';
    });
    session.then(() => { settled = true; }, () => { settled = true; });
    await waiting.promise;
    assert.equal(bridge.calls[0].status, 'running');
    const lateCall = await rpc(bridge, 'tools/call', { name: 'inspect_reviews' });
    assert.equal(lateCall.body.result.isError, true);
    assert.equal(bridge.calls.length, 1);
    assert.equal(settled, false);
    assert.equal(controller.signal.aborted, false);
    if (outcome === 'cancelled') controller.abort(new Error('User cancelled'));
    work.resolve();
    if (outcome === 'failed') await assert.rejects(session, /prepare_cv failed: Host review failed/);
    else if (outcome === 'cancelled') await assert.rejects(session, /User cancelled/);
    else assert.equal(await session, 'Coordinator has exited');
    const response = await request;
    assert.equal(bridge.calls[0].status, ['failed', 'cancelled'].includes(outcome) ? 'failed' : 'done');
    if (outcome === 'needs-review') {
      assert.equal(JSON.parse(response.body.result.content[0].text).needsReview, true);
    }
  });
}

function fakeGoose(source, capture = () => {}) {
  return (bin, args, options) => {
    capture(bin, args, options);
    return spawn(process.execPath, ['-e', source], options);
  };
}

test('Goose sends long prompts on stdin and joins fragmented stream text', async () => {
  const prompt = 'Review inputs start\n' + 'x'.repeat(40_000) + '\nMemory evidence in the middle\n' + 'x'.repeat(40_000) + '\nReview inputs end';
  const lines = [];
  const result = await runGoose({ binary: process.execPath, prompt, extensionUrl: 'http://127.0.0.1:1/mcp/test',
    onEvent: (event) => lines.push(event.line),
    spawnImpl: fakeGoose(`let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => {
      const expected = 'Review inputs start\\n' + 'x'.repeat(40_000) + '\\nMemory evidence in the middle\\n' + 'x'.repeat(40_000) + '\\nReview inputs end';
      if (input !== expected) process.exit(3);
      for (const text of ['hel','lo',' world']) console.log(JSON.stringify({type:'message', message:{role:'assistant',content:[{type:'text',text}]}}));
    });`, (_bin, args, opts) => {
      assert.equal(args.includes(prompt), false);
      assert.ok(args.includes('--no-profile'));
      assert.ok(args.includes('--with-streamable-http-extension'));
      assert.equal(opts.shell, false);
    }) });
  assert.equal(result, 'hello world'); assert.deepEqual(lines, ['hello world']);
});

test('Goose nonzero exit, timeout, and cancellation are failures', async () => {
  await assert.rejects(runGoose({ binary: process.execPath, prompt: 'test',
    spawnImpl: fakeGoose('process.exit(2)') }), /code 2/);
  await assert.rejects(runGoose({ binary: process.execPath, prompt: 'test', timeoutMs: 100,
    spawnImpl: fakeGoose('setInterval(()=>{},1000)') }), /timed out/);
  const controller = new AbortController();
  const pending = runGoose({ binary: process.execPath, prompt: 'test', signal: controller.signal,
    spawnImpl: fakeGoose('setInterval(()=>{},1000)') });
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});

test('Goose workflow freshness ignores standard provider selection but detects changed facts', () => {
  const context = { job: { id: 'fixture', title: 'Engineer' }, profile: { name: 'Example Candidate' },
    inputs: { 'cv/resume.md': 'Original' }, settings: { source: 'local', agentProvider: 'goose', agentModel: '' } };
  const saved = { workflow: 'goose', mode: 'agent', instructions: 'Review',
    fingerprint: prepFingerprint({ ...context, scope: 'cv', mode: 'agent', instructions: 'Review' }) };
  const changedProvider = { ...context, settings: { source: 'local', agentProvider: 'cursor', agentModel: 'example' } };
  assert.equal(assessPrep({ cv: saved }, changedProvider, { letter: false }).cv, 'current');
  assert.equal(assessPrep({ cv: saved }, { ...changedProvider, inputs: { 'cv/resume.md': 'Changed' } }, { letter: false }).cv, 'outdated');
});

test('cancellation before document publication preserves the previously accepted pack', async () => {
  const root = await mkdtemp(join(tmpdir(), 'goose-publication-'));
  const job = { id: 'fixture-cancellation', title: 'Engineer' };
  const options = { root, job, profile: {}, settings: {}, scopes: ['cv'], inspect: async () => ({ cv: { needsReview: false, reasons: [] } }) };
  const first = await generateDocuments(options, async (dir) => {
    await writeFile(join(dir, 'cv.md'), 'Accepted'); return {};
  });
  const controller = new AbortController();
  await assert.rejects(generateDocuments({ ...options, settings: { signal: controller.signal } }, async (dir) => {
    await writeFile(join(dir, 'cv.md'), 'Interrupted draft'); controller.abort(new Error('Cancelled')); return {};
  }), /Cancelled/);
  assert.equal(await readFile(join(first.dir, 'cv.md'), 'utf8'), 'Accepted');
});

test('suggested prompt follows tool selection without inventing disabled work', () => {
  const prompt = suggestedGoosePrompt(['inspect_job', 'keyword_gaps']);
  assert.match(prompt, /requirements/); assert.doesNotMatch(prompt, /Prepare a tailored CV|cover letter/);
});
