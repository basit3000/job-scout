import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { writePrivate } from './private-store.mjs';
import { runApplicationSession, readApplicationSession, previousApplicationLock } from './application-session.mjs';

test('dry runs, missing answers, cancellation, freshness and uncertain outcomes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'scout-apply-')); t.after(() => rm(root, { recursive: true, force: true }));
  let submitted = 0, steps = 0;
  const pack = { jobId: 'fictional', ats: { id: 'linkedin' } };
  const adapter = { open: async () => {}, fillAndInspect: async () => ({ action: ++steps === 1 ? 'next' : 'submit' }),
    next: async () => {}, submit: async () => { submitted++; }, confirmation: async () => false };
  const run = options => runApplicationSession({ pack, adapter, root, ...options });
  assert.equal((await run()).status, 'ready'); assert.equal(submitted, 0);
  adapter.fillAndInspect = async () => ({ missing: ['Sponsorship'], action: 'submit' });
  assert.equal((await run({ dryRun: false, authorizeSubmit: true })).status, 'paused'); assert.equal(submitted, 0);
  adapter.fillAndInspect = async () => ({ action: 'submit' });
  assert.equal((await run({ freshness: async () => false })).status, 'paused');
  const controller = new AbortController(); controller.abort();
  assert.equal((await run({ signal: controller.signal })).status, 'cancelled');
  assert.equal((await run({ dryRun: false, authorizeSubmit: true })).status, 'submission_unknown');
  assert.equal(submitted, 1);
  await assert.rejects(run({ dryRun: false, authorizeSubmit: true }), /locked/);
  assert.equal((await readApplicationSession(pack.jobId, root)).status, 'submission_unknown');
});
test('restart preserves uncertain outcomes and concurrent runs cannot both act', async t => {
  const root = await mkdtemp(join(tmpdir(), 'scout-restart-')); t.after(() => rm(root, { recursive: true, force: true }));
  const id = 'restart-fixture', path = join(root, 'state', 'apply-sessions', createHash('sha256').update(id).digest('hex') + '.json');
  await writePrivate(path, { jobId: id, status: 'submitting' });
  assert.equal((await readApplicationSession(id, root)).status, 'submission_unknown');
  const pack = { jobId: 'parallel', applyUrl: 'https://jobs.example.org/shared', ats: { id: 'linkedin' } };
  let unblock; const held = new Promise(resolve => { unblock = resolve; });
  const adapter = { open: () => held, fillAndInspect: async () => ({ action: 'submit' }) };
  const first = runApplicationSession({ pack, adapter, root });
  const second = runApplicationSession({ pack: { ...pack, jobId: 'alias', applyUrl: `${pack.applyUrl}?utm_source=fixture` }, adapter, root });
  // One call acquires the lock before awaiting its browser operation.
  setTimeout(unblock, 20);
  const results = await Promise.allSettled([first, second]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
});
test('existing auto-apply uncertainty and tracker associations block duplicate submission', async t => {
  const root = await mkdtemp(join(tmpdir(), 'scout-legacy-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writePrivate(join(root, 'state', 'auto-apply.json'), { runs: [{ job: { id: 'old', url: 'https://jobs.example.org/1' }, state: 'failed', history: [{ to: 'submitting' }] }] });
  assert.match(await previousApplicationLock({ jobId: 'alias', applyUrl: 'https://jobs.example.org/1?utm_source=fixture' }, root), /ledger/);
  await writePrivate(join(root, 'state', 'decisions.json'), { decisions: [{ id: 'applied', decision: 'applied' }] });
  assert.match(await previousApplicationLock({ jobId: 'applied' }, root), /Tracker/);
});
