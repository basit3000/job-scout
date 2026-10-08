import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CloudTracker, cloudStatePath } from './cloud-tracker.mjs';
import { ApiError, validateOrigin } from './tracker-client.mjs';
import { cloudFields, importCloudRecord, localFingerprint } from './cloud-records.mjs';
import { loadDecisions, patchDecision, recordDecision } from './decisions.mjs';
import { syncApplications, configureSync, syncState } from './cloud-sync.mjs';
import { createCloudSyncService } from '../../web/cloud-sync-service.mjs';

const record = () => ({ id: 'manual:application:fictional', company: 'Example Workshop', title: 'Engineer', decision: 'applied',
  date: '2026-01-01', note: 'A fictional note', prepPath: '.workspace/fictional', attachments: [{ name: 'fictional.pdf' }],
  statusHistory: [{ from: null, to: 'applied', at: null }] });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'scout-cloud-'));
  let adapter;
  t.after(async () => { await adapter?.close(); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'state'));
  await writeFile(join(root, 'state', 'decisions.json'), JSON.stringify({ decisions: [record()] }));
  // Poison unrelated private stores: sync must never read these files.
  await writeFile(join(root, 'state', 'memory.json'), 'not-json');
  await mkdir(join(root, '.workspace'));
  await writeFile(join(root, '.workspace', 'jobs.json'), 'not-json');
  const applications = new Map(), receipts = new Map(), sent = [];
  async function open() {
    adapter = await CloudTracker.open({ root, baseUrl: 'https://tracker.example.com' });
    adapter.state.token = 'fictional-token'; adapter.state.optionalFields = ['note'];
    adapter.client.request = async (path, { body } = {}) => {
      if (path.startsWith('/applications?') || path.startsWith('/changes?')) return { entries: [...applications.values()].map(application => ({ application: structuredClone(application) })), cursor: 'cursor', changesCursor: 'cursor', hasMore: false };
      if (path.startsWith('/applications/')) return structuredClone(applications.get(path.split('/').at(-1)));
      if (path === '/mutations') {
        sent.push(structuredClone(body));
        if (receipts.has(body.mutationId)) return structuredClone(receipts.get(body.mutationId));
        let application = applications.get(body.applicationId);
        if (body.operation !== 'create' && (application.version !== body.expectedVersion || application.deletedAt)) throw new ApiError(409, 'version_conflict', application);
        if (body.operation === 'create') application = { id: randomUUID(), version: 0, statusHistory: [], mappings: [], createdAt: '2026-10-08T12:00:00Z' };
        application = { ...application, ...body.fields, version: application.version + 1 };
        if (body.localRecordId && !application.mappings.some(item => item.localRecordId === body.localRecordId)) application.mappings.push({ installationId: adapter.state.installationId, localRecordId: body.localRecordId });
        for (const event of body.statusHistory || []) {
          if (!application.statusHistory.some(item => item.sourceEventId === event.sourceEventId)) application.statusHistory.push({ ...event, id: randomUUID(), installationId: adapter.state.installationId, recordedAt: '2026-10-08T12:00:00Z' });
        }
        applications.set(application.id, application);
        const result = { application: structuredClone(application) }; receipts.set(body.mutationId, result); return result;
      }
      throw new Error('Unexpected request');
    };
    return adapter;
  }
  return { root, applications, sent, open, adapter: await open(), records: async () => (await loadDecisions(root)).decisions };
}

test('projection excludes nested/private fields, enforces limits, and keeps unknown dates', () => {
  const fields = cloudFields({ ...record(), applicants: { count: null, memory: 'forbidden' } }, [], { creating: true });
  assert.equal(fields.appliedDate, null); assert.equal(fields.note, undefined);
  assert.deepEqual(fields.applicants, { count: null });
  for (const key of ['memory', 'answers', 'prepPath', 'attachments', 'date']) assert.equal(fields[key], undefined);
  assert.throws(() => cloudFields({ ...record(), title: 'x'.repeat(129) }), /128/);
  assert.throws(() => cloudFields({ ...record(), appliedDate: '2026-02-30' }), /calendar/);
  assert.throws(() => cloudFields({ ...record(), url: 'https://name:secret@example.com' }), /credentials/);
  assert.throws(() => cloudFields(record(), ['memory']), /optional/);
});

test('HTTPS origin enforcement, exclusive private state, selected durable sends, and lost acknowledgments', async t => {
  assert.throws(() => validateOrigin('http://example.com', true));
  assert.throws(() => validateOrigin('http://localhost:5000', true));
  assert.equal(validateOrigin('http://127.0.0.1:5000', true), 'http://127.0.0.1:5000');
  const f = await fixture(t); let a = f.adapter;
  await assert.rejects(CloudTracker.open({ root: f.root, baseUrl: 'https://tracker.example.com' }), /in use/);
  const preview = await a.preview({ direction: 'push', ids: [record().id] });
  assert.equal(f.sent.length, 0); assert.equal(a.state.pending.length, 0);
  assert.equal(preview.items[0].mutation.fields.note, undefined);
  assert.equal(preview.items[0].mutation.statusHistory[0].occurredAt, null);
  const original = a.client.request;
  a.client.request = async (...args) => {
    const result = await original(...args);
    if (args[0] === '/mutations') throw new Error('Simulated lost acknowledgment');
    return result;
  };
  await assert.rejects(a.confirm(preview.id), /lost acknowledgment/);
  const stored = JSON.parse(await readFile(cloudStatePath(f.root)));
  assert.equal(stored.pending.length, 1);
  const mutationId = stored.pending[0].mutationId;
  await a.close(); a = await f.open(); await a.sync();
  assert.equal(f.applications.size, 1); assert.equal(f.sent[1].mutationId, mutationId);
  assert.equal(a.adapter.mappings[record().id].version, 1);
  assert.equal(a.state.pending.length, 0);
});

test('stale previews, version conflicts and history rewrites require a new explicit choice', async t => {
  const f = await fixture(t), a = f.adapter;
  let preview = await a.preview({ direction: 'push', ids: [record().id] });
  await patchDecision(record().id, { decision: 'interviewing' }, { root: f.root });
  await assert.rejects(a.confirm(preview.id), /changed after preview/);
  preview = await a.preview({ direction: 'push', ids: [record().id] }); await a.confirm(preview.id);
  preview = await a.preview({ direction: 'push', ids: [record().id] });
  const remote = [...f.applications.values()][0]; remote.version++; remote.status = 'offer';
  const result = await a.confirm(preview.id);
  assert.equal(result.issues[0].code, 'version_conflict'); assert.equal(remote.status, 'offer');
  await patchDecision(record().id, { statusHistory: [{ from: null, to: 'closed', at: null }] }, { root: f.root });
  await assert.rejects(a.preview({ direction: 'push', ids: [record().id] }), /rewritten/);
  preview = await a.preview({ direction: 'push', ids: [record().id], includeHistory: false });
  assert.deepEqual(preview.items[0].mutation.statusHistory, []);
  await a.confirm(preview.id);
  assert.equal([...f.applications.values()][0].status, 'interviewing');
});

test('remote import preserves local fields, unknown dates, event identity and never queues echoes', async t => {
  const f = await fixture(t), a = f.adapter;
  await a.confirm((await a.preview({ direction: 'push', ids: [record().id] })).id);
  const remote = [...f.applications.values()][0];
  remote.version++; remote.status = 'rejected'; remote.followUpDate = '2026-10-10'; remote.note = null;
  remote.statusHistory.push({ id: randomUUID(), status: 'rejected', fromStatus: 'applied', occurredAt: null, recordedAt: '2026-10-08T12:00:00Z' });
  await a.confirm((await a.preview({ direction: 'import', ids: [remote.id], selectedOptional: ['note'] })).id);
  const imported = (await f.records())[0];
  assert.equal(imported.note, ''); assert.equal(imported.appliedDate, null); assert.equal(imported.followUpDate, null);
  assert.equal(imported.prepPath, record().prepPath); assert.deepEqual(imported.attachments, record().attachments);
  assert.equal(imported.statusHistory.length, 2); assert.equal(imported.statusHistory[1].at, null);
  await a.confirm((await a.preview({ direction: 'import', ids: [remote.id] })).id);
  assert.equal((await f.records())[0].statusHistory.length, 2); assert.equal(a.state.pending.length, 0);
  const push = await a.preview({ direction: 'push', ids: [record().id] });
  assert.deepEqual(push.items[0].mutation.statusHistory, []);
});

test('new remote imports map explicitly, survive local-write crashes, and tombstones cannot revive', async t => {
  const f = await fixture(t), a = f.adapter;
  const remote = { id: randomUUID(), version: 1, title: 'Cloud role', company: 'Example Remote', status: 'applied', appliedDate: null, statusHistory: [], mappings: [] };
  f.applications.set(remote.id, remote);
  const preview = await a.preview({ direction: 'import', ids: [remote.id] });
  const persist = a.persist.bind(a);
  let interrupted = false;
  a.persist = async () => {
    if (!interrupted && a.adapter.journal?.items.length === 0) { interrupted = true; throw new Error('Simulated crash after local write'); }
    return persist();
  };
  await assert.rejects(a.confirm(preview.id), /Simulated crash/);
  await a.close(); const reopened = await f.open(); await reopened.recover();
  assert.equal((await f.records()).length, 2); assert.equal((await f.records())[1].appliedDate, null);
  assert.equal(f.sent.filter(item => item.operation === 'map').length, 1);
  const mapped = f.applications.get(remote.id);
  mapped.version++; mapped.deletedAt = '2026-10-08T13:00:00Z';
  await reopened.confirm((await reopened.preview({ direction: 'import', ids: [remote.id] })).id);
  await assert.rejects(reopened.preview({ direction: 'push', ids: [preview.items[0].localId] }), /deleted online/);
  assert.ok((await f.records())[1].cloudImport.deletedAt);
});

test('import validation and compare-and-swap protect local edits and optional scope', async t => {
  const f = await fixture(t), a = f.adapter;
  await assert.rejects(a.preview({ direction: 'push', ids: [record().id], selectedOptional: ['salary'] }), /not granted/);
  const remote = { id: randomUUID(), version: 1, title: 'Role', company: 'Example', status: 'applied', note: 'x'.repeat(10001), statusHistory: [], mappings: [] };
  f.applications.set(remote.id, remote);
  await assert.rejects(a.preview({ direction: 'import', ids: [remote.id], selectedOptional: ['note'] }), /10000/);
  const before = localFingerprint((await f.records())[0]);
  await patchDecision(record().id, { note: 'New local edit' }, { root: f.root });
  await assert.rejects(importCloudRecord(f.root, { id: randomUUID(), localId: record().id, before, application: remote, selectedOptional: [] }), /changed after preview/);
  assert.equal((await f.records())[0].note, 'New local edit');
});

test('opaque IDs cannot collide with object prototypes and explicit links never copy fields', async t => {
  const f = await fixture(t), a = f.adapter;
  await writeFile(join(f.root, 'state', 'decisions.json'), JSON.stringify({ decisions: [{ ...record(), id: '__proto__' }] }));
  const remote = { id: randomUUID(), version: 1, title: 'Different title', company: 'Example Cloud', status: 'offer', statusHistory: [], mappings: [] };
  f.applications.set(remote.id, remote);
  const preview = await a.preview({ direction: 'map', ids: [remote.id], localRecordId: '__proto__' });
  await a.confirm(preview.id);
  assert.equal(a.adapter.mappings.__proto__.applicationId, remote.id);
  assert.equal((await f.records())[0].title, 'Engineer');
  assert.equal(f.applications.get(remote.id).title, 'Different title');
});

test('incremental sync sends applications once, excludes the archive/private fields and notices later edits', async t => {
  const f = await fixture(t), a = f.adapter;
  await writeFile(join(f.root, 'state/decisions.json'), JSON.stringify({ decisions: [record(), { ...record(), id: 'shortlist', decision: 'shortlisted' }] }));
  await configureSync(a, { enabled: true, intervalMinutes: 1, direction: 'push' });
  let status = await syncApplications(a);
  assert.equal(f.sent.length, 1); assert.equal(status.automatic.waiting, 0);
  assert.equal(status.automatic.linked, 1); assert.equal(status.automatic.recent[0].state, 'synced');
  for (const key of ['note', 'attachments', 'memory', 'prepPath', 'salary']) assert.equal(f.sent[0].fields[key], undefined);
  await syncApplications(a); assert.equal(f.sent.length, 1);
  await patchDecision(record().id, { note: 'Different private note' }, { root: f.root });
  await syncApplications(a); assert.equal(f.sent.length, 1, 'private-only edits never trigger an upload');
  await patchDecision(record().id, { decision: 'interviewing' }, { root: f.root });
  status = await syncApplications(a);
  assert.equal(f.sent.length, 2); assert.equal(f.sent[1].operation, 'update'); assert.equal(status.automatic.waiting, 0);
  assert.equal([...f.applications.values()][0].status, 'interviewing');
});

test('lost acknowledgements retain mutation identity and do not absorb newer local edits', async t => {
  const f = await fixture(t); let a = f.adapter;
  const request = a.client.request;
  a.client.request = async (...args) => {
    const result = await request(...args);
    if (args[0] === '/mutations') throw new Error('Lost acknowledgement');
    return result;
  };
  await assert.rejects(syncApplications(a), /Lost acknowledgement/);
  const originalId = a.state.pending[0].mutationId;
  await patchDecision(record().id, { decision: 'interviewing' }, { root: f.root });
  await a.close(); a = await f.open(); await syncApplications(a);
  assert.equal(f.applications.size, 1); assert.equal(f.sent[1].mutationId, originalId);
  assert.equal([...f.applications.values()][0].status, 'interviewing');
  assert.equal(f.sent.length, 3, 'replayed original create followed by a separate update');
  await syncApplications(a); assert.equal(f.sent.length, 3);
});

test('two-way sync imports online edits without echo, preserves local-only details and holds conflicting edits', async t => {
  const f = await fixture(t), a = f.adapter;
  await configureSync(a, { enabled: true, intervalMinutes: 5, direction: 'two-way' });
  await syncApplications(a);
  const remote = [...f.applications.values()][0]; remote.version++; remote.status = 'interviewing';
  remote.statusHistory.push({ id: randomUUID(), fromStatus: 'applied', status: 'interviewing', occurredAt: null });
  let status = await syncApplications(a);
  let local = (await f.records())[0];
  assert.equal(local.decision, 'interviewing'); assert.equal(local.note, record().note);
  assert.deepEqual(local.attachments, record().attachments); assert.equal(status.automatic.lastCounts.received, 1);
  await syncApplications(a); assert.equal(f.sent.length, 1, 'imports never echo back as uploads');
  await patchDecision(record().id, { decision: 'offer' }, { root: f.root });
  remote.version++; remote.status = 'rejected';
  status = await syncApplications(a);
  assert.equal(status.automatic.issues[0].code, 'both_changed');
  assert.equal((await f.records())[0].decision, 'offer'); assert.equal(remote.status, 'rejected');
  await a.confirm((await a.preview({ direction: 'import', ids: [remote.id] })).id);
  status = await syncApplications(a); assert.equal(status.automatic.issues.length, 0);
  assert.equal((await f.records())[0].decision, 'rejected');
});

test('two-way sync maps new online records once, prevents possible duplicates and honors tombstones', async t => {
  const f = await fixture(t), a = f.adapter;
  await configureSync(a, { enabled: true, intervalMinutes: 1, direction: 'two-way' });
  const remote = { id: randomUUID(), version: 1, title: 'Cloud role', company: 'Example Remote', status: 'applied', statusHistory: [], mappings: [] };
  f.applications.set(remote.id, remote);
  await syncApplications(a); await syncApplications(a);
  assert.equal((await f.records()).length, 2); assert.equal(f.applications.size, 2);
  assert.equal(f.sent.filter(item => item.operation === 'map').length, 1);
  const cloud = f.applications.get(remote.id); cloud.version++; cloud.deletedAt = '2026-10-08T13:00:00Z';
  await syncApplications(a); await syncApplications(a);
  assert.equal(f.applications.size, 2);
  assert.equal((await f.records()).find(item => item.company === 'Example Remote').cloudImport.deletedAt, cloud.deletedAt);
  const duplicate = { ...remote, id: randomUUID(), title: record().title, company: record().company, mappings: [] };
  f.applications.set(duplicate.id, duplicate);
  const status = await syncApplications(a);
  assert.ok(status.automatic.issues.some(item => item.code === 'possible_duplicate'));
  assert.equal((await f.records()).length, 2);
});

test('automatic sync respects an open review, invalid records, revocation, and interval validation', async t => {
  const f = await fixture(t), a = f.adapter;
  await assert.rejects(configureSync(a, { enabled: true, intervalMinutes: 0, direction: 'push' }), /interval/);
  await a.preview({ direction: 'push', ids: [record().id] });
  await syncApplications(a); assert.equal(f.sent.length, 0, 'an open manual review is not invalidated by the timer');
  a.adapter.previews = {};
  await patchDecision(record().id, { title: 'x'.repeat(129) }, { root: f.root });
  let status = await syncApplications(a); assert.equal(status.automatic.issues[0].code, 'invalid_local'); assert.equal(f.sent.length, 0);
  await patchDecision(record().id, { title: 'Engineer' }, { root: f.root });
  await syncApplications(a); assert.equal(f.sent.length, 1);
  a.state.revoked = true; a.state.token = null;
  await assert.rejects(syncApplications(a), /Connect/); assert.equal(f.sent.length, 1);
});

test('a remote version conflict blocks retries until an explicit reviewed resolution', async t => {
  const f = await fixture(t), a = f.adapter;
  await syncApplications(a);
  await patchDecision(record().id, { decision: 'interviewing' }, { root: f.root });
  const original = a.client.request;
  let race = true;
  a.client.request = async (path, options) => {
    if (race && path === '/mutations') { const remote = [...f.applications.values()][0]; remote.version++; remote.status = 'offer'; race = false; }
    return original(path, options);
  };
  let status = await syncApplications(a); assert.equal(status.issues[0].code, 'version_conflict');
  const attempts = f.sent.length; await syncApplications(a); assert.equal(f.sent.length, attempts);
  await a.confirm((await a.preview({ direction: 'push', ids: [record().id] })).id);
  status = await syncApplications(a); assert.equal(status.issues.length, 0); assert.equal(status.automatic.issues.length, 0);
  assert.equal([...f.applications.values()][0].status, 'interviewing');
});

test('timer respects interval and pause, serializes runs, and exposes status during network work', async t => {
  const f = await fixture(t);
  await configureSync(f.adapter, { enabled: true, intervalMinutes: 1, direction: 'push' });
  await f.adapter.close();
  let clock = Date.now(), requests = 0, hold = true;
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const service = createCloudSyncService({ root: f.root, configured: async () => true, now: () => clock,
    open: async () => {
      const adapter = await f.open(), original = adapter.client.request;
      adapter.client.request = async (...args) => {
        requests++;
        if (hold) { hold = false; started.resolve(); await release.promise; }
        return original(...args);
      };
      return adapter;
    } });
  t.after(() => service.stop());
  const running = service.tick(); await started.promise;
  assert.equal((await service.status()).syncing, true);
  await service.tick(); assert.equal(requests, 1, 'overlapping timer ticks do not start a second transfer');
  release.resolve(); await running;
  let previous = requests; await service.tick(); assert.equal(requests, previous, 'not due yet');
  clock += 61000; await service.tick(); assert.ok(requests > previous);
  await service.run(adapter => configureSync(adapter, { enabled: false, intervalMinutes: 1, direction: 'push' }));
  previous = requests; clock += 61000; await service.tick(); assert.equal(requests, previous, 'paused settings survive reopen');
});

test('Applied events send only that application with the timer off and never block the local save', async t => {
  const f = await fixture(t);
  await configureSync(f.adapter, { enabled: false, onApplied: true, intervalMinutes: 1, direction: 'two-way' });
  const unrelated = { ...record(), id: 'manual:application:unrelated', company: 'Example Other' };
  await writeFile(join(f.root, 'state', 'decisions.json'), JSON.stringify({ decisions: [record(), unrelated] }));
  await writeFile(join(f.root, '.workspace', 'jobs.json'), JSON.stringify({ jobs: [] }));
  await f.adapter.close();
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  let hold = true, requests = 0;
  const service = createCloudSyncService({ root: f.root, configured: async () => true, open: async () => {
    const adapter = await f.open(), request = adapter.client.request;
    adapter.client.request = async (...args) => {
      requests++;
      if (hold) { hold = false; started.resolve(); await release.promise; }
      return request(...args);
    };
    return adapter;
  } });
  t.after(async () => { release.resolve(); await service.stop(); });
  service.start(); await service.run(() => {});
  assert.equal(requests, 0, 'enabling does not send older applied applications');
  await patchDecision(record().id, { note: 'Edited note' }, { root: f.root });
  await service.run(() => {}); assert.equal(requests, 0, 'editing an applied record is not a transition');
  await patchDecision(record().id, { decision: 'shortlisted' }, { root: f.root });
  const saved = await patchDecision(record().id, { decision: 'applied' }, { root: f.root });
  assert.equal(saved.decision, 'applied', 'local save completes before the network response');
  await started.promise; release.resolve(); await service.run(() => {});
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].localRecordId, record().id);
  assert.equal((await service.status()).automatic.onApplied, true);
  assert.equal((await service.status()).automatic.enabled, false);
  await recordDecision('manual:application:new', 'applied', '', { root: f.root, job: { company: 'Example New', title: 'Role' } });
  await service.run(() => {});
  assert.equal(f.sent.length, 2); assert.equal(f.sent[1].localRecordId, 'manual:application:new');
  await service.run(adapter => configureSync(adapter, { enabled: false, onApplied: false, intervalMinutes: 1, direction: 'push' }));
  await patchDecision(unrelated.id, { decision: 'shortlisted' }, { root: f.root });
  await patchDecision(unrelated.id, { decision: 'applied' }, { root: f.root });
  await service.run(() => {}); assert.equal(f.sent.length, 2, 'disabled option does nothing');
});

test('Applied sync ignores disconnected trackers and preserves failed sends for retry', async t => {
  const f = await fixture(t);
  await configureSync(f.adapter, { enabled: false, onApplied: true, intervalMinutes: 1, direction: 'push' });
  await f.adapter.close();
  let configured = false, connected = false, revoked = false, opens = 0, requests = 0;
  const service = createCloudSyncService({ root: f.root, configured: async () => configured, open: async () => {
    opens++;
    const adapter = await f.open(); adapter.state.token = connected ? 'fictional-token' : null; adapter.state.revoked = revoked;
    adapter.client.request = async path => {
      requests++;
      if (path === '/mutations') throw new Error('Network unavailable');
      return { entries: [], cursor: 'cursor', changesCursor: 'cursor', hasMore: false };
    };
    return adapter;
  } });
  t.after(() => service.stop());
  await service.applied({ root: f.root, id: record().id }); assert.equal(opens, 0);
  configured = true;
  await service.applied({ root: f.root, id: record().id }); assert.equal(requests, 0);
  connected = true; revoked = true;
  await service.applied({ root: f.root, id: record().id }); assert.equal(requests, 0);
  revoked = false;
  await assert.rejects(service.applied({ root: f.root, id: record().id }), /Network unavailable/);
  const status = await service.status();
  assert.equal(status.pending, 1); assert.match(status.automatic.lastError, /Network unavailable/);
  assert.equal((await f.records())[0].decision, 'applied');
});
