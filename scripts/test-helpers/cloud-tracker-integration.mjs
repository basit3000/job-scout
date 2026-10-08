/** Fictional end-to-end fixture launched by Job Tracker's pytest harness. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CloudTracker } from '../lib/cloud-tracker.mjs';
import { ApiError } from '../lib/tracker-client.mjs';
import { loadDecisions, patchDecision } from '../lib/decisions.mjs';
import { syncApplications, syncState } from '../lib/cloud-sync.mjs';

const [baseUrl, root] = process.argv.slice(2);
const options = { baseUrl, root, allowLoopbackHttp: true };
await mkdir(join(root, 'state'), { recursive: true });
const localId = 'manual:application:fictional-http';
await writeFile(join(root, 'state', 'decisions.json'), JSON.stringify({ decisions: [{
  id: localId, title: 'Fictional engineer', company: 'Example HTTP', decision: 'applied', date: '2026-01-01',
  note: 'Not selected', prepPath: 'fictional/prep', attachments: [{ name: 'fictional.pdf' }],
  statusHistory: [{ from: null, to: 'applied', at: null }],
}] }));
let adapter = await CloudTracker.open(options);
try {
  const pairing = await adapter.client.beginPairing('Fictional Job Scout test');
  console.log(`PAIRING_CODE:${pairing.userCode}`);
  const deadline = Date.now() + 20000;
  while (!adapter.state.token) {
    try { await adapter.redeem(); }
    catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'approval_pending' || Date.now() > deadline) throw error;
      await new Promise(done => setTimeout(done, 200));
    }
  }
  let preview = await adapter.preview({ direction: 'push', ids: [localId] });
  const request = adapter.client.request.bind(adapter.client);
  adapter.client.request = async (...args) => {
    const result = await request(...args);
    if (args[0] === '/mutations') throw new Error('Lost acknowledgment');
    return result;
  };
  await assert.rejects(adapter.confirm(preview.id), /Lost acknowledgment/);
  await adapter.close(); adapter = await CloudTracker.open(options); await adapter.sync();
  let application = Object.values(adapter.state.applications)[0];
  assert.equal(Object.keys(adapter.state.applications).length, 1);
  assert.equal(application.version, 1); assert.equal(application.appliedDate, null); assert.equal(application.note, undefined);
  assert.equal(application.statusHistory.find(event => event.sourceEventId).occurredAt, null);
  const id = application.id;
  preview = await adapter.preview({ direction: 'push', ids: [localId] });
  await adapter.client.request('/mutations', { method: 'POST', body: { operation: 'update', mutationId: randomUUID(), applicationId: id, expectedVersion: 1, fields: { status: 'interviewing' } } });
  const conflict = await adapter.confirm(preview.id);
  assert.equal(conflict.issues[0].code, 'version_conflict');
  await adapter.confirm((await adapter.preview({ direction: 'import', ids: [id] })).id);
  let records = (await loadDecisions(root)).decisions;
  assert.equal(records[0].decision, 'interviewing'); assert.equal(records[0].note, 'Not selected');
  assert.equal(records[0].prepPath, 'fictional/prep'); assert.equal(records[0].attachments.length, 1);
  const historyCount = records[0].statusHistory.length;
  assert.equal(historyCount, 2, 'Own server transition must not duplicate the imported source event');
  await adapter.confirm((await adapter.preview({ direction: 'import', ids: [id] })).id);
  assert.equal((await loadDecisions(root)).decisions[0].statusHistory.length, historyCount);
  assert.deepEqual((await adapter.preview({ direction: 'push', ids: [localId] })).items[0].mutation.statusHistory, []);
  const created = await adapter.client.request('/mutations', { method: 'POST', body: { operation: 'create', mutationId: randomUUID(), fields: { title: 'Online role', company: 'Example Cloud', status: 'offer', appliedDate: null } } });
  await adapter.confirm((await adapter.preview({ direction: 'import', ids: [created.application.id] })).id);
  records = (await loadDecisions(root)).decisions;
  assert.equal(records.length, 2); assert.equal(records[1].appliedDate, null);
  assert.equal(adapter.adapter.mappings[records[1].id].applicationId, created.application.id);
  await patchDecision(localId, { decision: 'rejected', followUpDate: '2026-10-20' }, { root });
  await adapter.confirm((await adapter.preview({ direction: 'push', ids: [localId] })).id);
  application = adapter.state.applications[id]; assert.equal(application.status, 'rejected'); assert.equal(application.followUpDate, null);
  // Real API normalization must not appear as a conflicting online edit.
  await patchDecision(localId, { location: '  Example City  ', postedAt: '2026-01-01T12:00:00.000Z' }, { root });
  await syncApplications(adapter);
  application = adapter.state.applications[id];
  assert.equal(application.location, 'Example City');
  const syncedVersion = application.version;
  await syncApplications(adapter);
  assert.equal(adapter.state.applications[id].version, syncedVersion);
  assert.deepEqual(syncState(adapter).issues, {});
  syncState(adapter).direction = 'two-way';
  await adapter.client.request('/mutations', { method: 'POST', body: { operation: 'update', mutationId: randomUUID(), applicationId: id, expectedVersion: syncedVersion, fields: { status: 'interviewing' } } });
  await syncApplications(adapter);
  assert.equal((await loadDecisions(root)).decisions.find(record => record.id === localId).decision, 'interviewing');
  const receivedVersion = adapter.state.applications[id].version;
  await syncApplications(adapter);
  assert.equal(adapter.state.applications[id].version, receivedVersion, 'Imported changes must not echo back');
  assert.deepEqual(syncState(adapter).issues, {});
  application = adapter.state.applications[id];
  await adapter.client.request('/mutations', { method: 'POST', body: { operation: 'delete', mutationId: randomUUID(), applicationId: id, expectedVersion: application.version } });
  await adapter.confirm((await adapter.preview({ direction: 'import', ids: [id] })).id);
  await assert.rejects(adapter.preview({ direction: 'push', ids: [localId] }), /deleted online/);
  const token = adapter.state.token;
  await adapter.client.disconnect();
  const response = await fetch(`${baseUrl}/api/v1/device`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 401);
  console.log('JOB_SCOUT_ADAPTER_OK');
} finally { await adapter.close(); }
