import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { catalogCommand, createModelCatalog, discoverCodexModels, discoverClaudeModels, normalizeModels, updateAgentSelection } from './agent-models.mjs';
import { resolveAgentModel } from './cv-agent.mjs';

function fakeCli(handle) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => { child.stopped = true; child.emit('close', 0); };
  const sent = [];
  child.stdin.on('data', (data) => {
    const message = JSON.parse(String(data));
    sent.push(message);
    queueMicrotask(() => handle(message, (reply) => child.stdout.write(`${JSON.stringify(reply)}\n`)));
  });
  return { child, sent, spawnImpl: (_bin, args) => { child.args = args; return child; } };
}

test('Codex discovery initializes, paginates, excludes hidden entries and never starts a turn', async () => {
  const cli = fakeCli((m, reply) => {
    if (m.method === 'initialize') reply({ id: m.id, result: {} });
    if (m.method === 'model/list') {
      assert.equal(m.params.includeHidden, false);
      reply({ id: m.id, result: m.params.cursor
        ? { data: [{ id: 'b', model: 'second', displayName: 'Second' }], nextCursor: null }
        : { data: [{ id: 'a', model: 'first' }, { id: 'h', model: 'hidden', hidden: true }], nextCursor: 'page2' } });
    }
  });
  const models = await discoverCodexModels('codex', cli);
  assert.deepEqual(models.map((m) => m.id), ['first', 'second']);
  assert.deepEqual(cli.sent.map((m) => m.method), ['initialize', 'initialized', 'model/list', 'model/list']);
  assert.equal(cli.child.stopped, true);
});

test('Claude reads initialization models and preserves context aliases without a prompt', async () => {
  const cli = fakeCli((m, reply) => {
    reply({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id,
      response: { models: [{ value: 'default' }, { value: 'opus[1m]', displayName: 'Opus' }, { value: 'new-model', displayName: 'New' }] } } });
  });
  const models = await discoverClaudeModels('claude', cli);
  assert.deepEqual(models.map((m) => m.id), ['opus[1m]', 'new-model']);
  assert.equal(cli.sent.length, 1);
  assert.equal(cli.sent[0].request.subtype, 'initialize');
  assert.ok(cli.child.args.includes('--no-session-persistence'));
  assert.ok(cli.child.args.includes('{"disableAllHooks":true}'));
  assert.ok(cli.child.args.includes('--strict-mcp-config'));
  assert.equal(cli.child.stopped, true);
});

test('discovery bounds slow and invalid providers and terminates their processes', async () => {
  const slow = fakeCli(() => {});
  await assert.rejects(discoverClaudeModels('claude', { ...slow, timeoutMs: 10 }), /timed out/);
  assert.equal(slow.child.stopped, true);
  const invalid = fakeCli((m, reply) => reply({ id: m.id, error: { message: 'secret raw diagnostic' } }));
  await assert.rejects(discoverCodexModels('codex', invalid), /Codex rejected/);
  assert.equal(invalid.child.stopped, true);
});

test('catalog cache coalesces requests, refreshes, and identifies stale results after failure', async () => {
  let calls = 0;
  let clock = 0;
  let fail = false;
  const catalog = createModelCatalog(async () => {
    calls++;
    await Promise.resolve();
    if (fail) throw new Error('offline');
    return [{ id: 'live-model' }];
  }, { now: () => clock, ttlMs: 100, retryMs: 10 });
  const results = await Promise.all([catalog('codex'), catalog('codex')]);
  assert.equal(calls, 1);
  assert.equal(results[0], results[1]);
  assert.deepEqual(results[0].models.map((m) => m.id), ['', 'live-model']);
  await catalog('codex');
  assert.equal(calls, 1);
  await catalog('codex', { refresh: true });
  assert.equal(calls, 2);
  fail = true; clock = 101;
  const stale = await catalog('codex');
  assert.equal(stale.source, 'stale');
  assert.equal(stale.error, 'offline');
  assert.equal(stale.models[1].id, 'live-model');
  const unavailable = await catalog('claude-code');
  assert.equal(unavailable.source, 'unavailable');
  assert.deepEqual(unavailable.models.map((m) => m.id), ['']);
});

test('Cursor catalog normalization does not inject fixed models and deduplicates results', () => {
  assert.deepEqual(normalizeModels([{ model: { id: 'fresh', displayName: 'Fresh' } }, { id: 'fresh' }], 'cursor'), [
    { id: 'fresh', displayName: 'Fresh', description: '' },
  ]);
  assert.throws(() => normalizeModels([], 'cursor'), /no selectable models/);
});

test('provider changes remember each model and accept actual Claude catalog IDs', () => {
  let cv = { agentProvider: 'cursor', agentModel: 'composer-sample' };
  cv = updateAgentSelection(cv, { agentProvider: 'codex' });
  assert.equal(cv.agentModel, '');
  cv = updateAgentSelection(cv, { agentModel: 'codex-sample' });
  cv = updateAgentSelection(cv, { agentProvider: 'claude-code', agentModel: 'opus[1m]' });
  assert.equal(cv.agentModel, 'opus[1m]');
  cv = updateAgentSelection(cv, { agentProvider: 'cursor' });
  assert.equal(cv.agentModel, 'composer-sample');
  cv = updateAgentSelection(cv, { agentProvider: 'codex' });
  assert.equal(cv.agentModel, 'codex-sample');
  assert.throws(() => updateAgentSelection(cv, { agentModel: 'model & command' }), /Invalid model/);
});

test('configured defaults never borrow another provider environment variable', () => {
  const old = Object.fromEntries(['CURSOR_AGENT_MODEL', 'CODEX_MODEL', 'CLAUDE_CODE_MODEL'].map((key) => [key, process.env[key]]));
  try {
    process.env.CURSOR_AGENT_MODEL = 'cursor-only';
    process.env.CODEX_MODEL = 'codex-only';
    process.env.CLAUDE_CODE_MODEL = 'claude-only';
    assert.equal(resolveAgentModel('', 'codex').id, 'codex-only');
    assert.equal(resolveAgentModel('', 'claude-code').id, 'claude-only');
    delete process.env.CODEX_MODEL;
    assert.equal(resolveAgentModel('', 'codex').id, '');
  } finally {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('Windows npm CLI shims run via Node without shell interpolation', () => {
  const bin = join('install with spaces', 'codex.cmd');
  const entry = join('install with spaces', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  assert.deepEqual(catalogCommand(bin, 'codex', (path) => path === entry), { bin: process.execPath, prefix: [entry] });
  assert.throws(() => catalogCommand(bin, 'codex', () => false), /native executable/);
});
