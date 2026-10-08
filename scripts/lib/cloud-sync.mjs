import { randomUUID } from 'node:crypto';
import { cloudFields, localFingerprint, syncFieldsFingerprint, syncLocalFingerprint } from './cloud-records.mjs';

const APPLICATION_STATES = new Set(['applied', 'interviewing', 'offer', 'accepted', 'rejected', 'closed']);
const own = (object, key) => Object.hasOwn(object, key) ? object[key] : undefined;
const put = (object, key, value) => Object.defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });
export function syncState(adapter) {
  adapter.adapter.automatic ||= { enabled: false, intervalMinutes: 1, direction: 'push', baselines: {}, receipts: {}, issues: {} };
  return adapter.adapter.automatic;
}
export function syncEligible(adapter, record) {
  return Boolean(own(adapter.adapter.mappings, record.id)) || APPLICATION_STATES.has(record.decision);
}
export function syncSummary(adapter, records) {
  const state = syncState(adapter);
  const eligible = records.filter(record => syncEligible(adapter, record));
  const issueIds = new Set([...Object.keys(state.issues), ...adapter.state.conflicts.map(item => item.mutation.localRecordId), ...adapter.state.failures.map(item => item.mutation.localRecordId)]);
  const waiting = eligible.filter(record => !issueIds.has(record.id) && !own(adapter.adapter.mappings, record.id)?.deletedAt
    && own(state.baselines, record.id)?.local !== syncLocalFingerprint(record)).length;
  return { enabled: state.enabled, onApplied: Boolean(state.onApplied), intervalMinutes: state.intervalMinutes, direction: state.direction,
    lastAttempt: state.lastAttempt || null, lastSuccess: state.lastSuccess || null, lastError: state.lastError || null,
    nextRun: state.enabled ? new Date((Date.parse(state.lastAttempt) || Date.now()) + state.intervalMinutes * 60000).toISOString() : null,
    eligible: eligible.length, waiting, linked: eligible.filter(record => own(adapter.adapter.mappings, record.id)).length,
    issues: Object.values(state.issues), lastCounts: state.lastCounts || null,
    recent: eligible.slice().sort((a, b) => String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || ''))).slice(0, 8).map(record => ({
      id: record.id, company: record.company, title: record.title, status: record.decision,
      state: issueIds.has(record.id) ? 'needs-review' : own(adapter.adapter.mappings, record.id)?.deletedAt ? 'deleted-online'
        : own(state.baselines, record.id)?.local === syncLocalFingerprint(record) ? 'synced' : 'waiting',
    })) };
}
export async function configureSync(adapter, settings) {
  if (settings.onApplied !== undefined && typeof settings.onApplied !== 'boolean') throw new Error('Sync when marked Applied must be on or off.');
  if (typeof settings.enabled !== 'boolean' || ![1, 5, 15].includes(settings.intervalMinutes)
    || !['push', 'two-way'].includes(settings.direction)) throw new Error('Choose a sync direction and an interval of 1, 5 or 15 minutes.');
  if (settings.enabled && (!adapter.state.token || adapter.state.revoked)) throw new Error('Connect your tracker before enabling automatic sync.');
  Object.assign(syncState(adapter), { enabled: settings.enabled, intervalMinutes: settings.intervalMinutes, direction: settings.direction, lastAttempt: null });
  if (settings.onApplied !== undefined) syncState(adapter).onApplied = settings.onApplied;
  await adapter.persist();
  return adapter.status();
}

// A receipt holds the exact local snapshot and expected cloud fields submitted,
// not whatever happens to be on either side when a lost response is retried.
export function settleSyncReceipts(adapter) {
  const state = syncState(adapter);
  for (const [id, receipt] of Object.entries(state.receipts)) {
    if (adapter.state.pending.some(item => item.mutationId === id)) continue;
    const failed = [...adapter.state.conflicts, ...adapter.state.failures].find(item => item.mutation.mutationId === id);
    if (!failed) {
      put(state.baselines, receipt.localId, { local: receipt.local, remote: receipt.remote });
      if (receipt.reviewed) {
        adapter.state.conflicts = adapter.state.conflicts.filter(item => item.mutation.localRecordId !== receipt.localId);
        adapter.state.failures = adapter.state.failures.filter(item => item.mutation.localRecordId !== receipt.localId);
      }
    }
    delete state.receipts[id];
  }
}
export function rememberImport(adapter, item, record) {
  if (!record) return;
  const state = syncState(adapter);
  put(state.baselines, item.localId, { local: record.cloudImport?.syncFingerprint || syncLocalFingerprint(record),
    remote: syncFieldsFingerprint(item.application) });
  delete state.issues[item.localId];
  adapter.state.conflicts = adapter.state.conflicts.filter(issue => issue.mutation.localRecordId !== item.localId);
  adapter.state.failures = adapter.state.failures.filter(issue => issue.mutation.localRecordId !== item.localId);
}
export function rememberSend(adapter, record, mutation, application, reviewed = false) {
  const state = syncState(adapter);
  put(state.receipts, mutation.mutationId, { localId: record.id, local: syncLocalFingerprint(record),
    remote: syncFieldsFingerprint({ ...application, ...mutation.fields }), reviewed });
  delete state.issues[record.id];
}

export async function syncApplications(adapter, { localId } = {}) {
  const state = syncState(adapter);
  const direction = localId ? 'push' : state.direction;
  if (!adapter.state.token || adapter.state.revoked) throw new Error('Connect your tracker before syncing.');
  if (!localId) state.lastAttempt = new Date().toISOString();
  state.lastError = null;
  const counts = { sent: 0, received: 0, needsReview: 0 };
  const issue = (record, code, message, application) => {
    const localId = record?.id || null, key = localId || application.id;
    put(state.issues, key, { id: key, localId, applicationId: application?.id || null,
      company: record?.company || application?.company, title: record?.title || application?.title, code, message });
  };
  try {
    if (adapter.adapter.journal) throw new Error('Finish or cancel the interrupted import before syncing.');
    // Retry exactly the saved mutations first. New edits get their own mutation later.
    await adapter.client.pushPending({ localId }); settleSyncReceipts(adapter); await adapter.persist();
    await adapter.client.pull(); adapter.updateMappings();
    const records = await adapter.records();
    const byId = new Map(records.map(record => [record.id, record]));
    const blocked = new Set([...adapter.state.conflicts, ...adapter.state.failures].map(item => item.mutation.localRecordId));
    const previews = Object.values(adapter.adapter.previews).filter(preview => Date.now() - preview.createdAt < 15 * 60 * 1000);
    for (const preview of previews) for (const item of preview.items) blocked.add(item.localId);
    const previewedCloud = new Set(previews.flatMap(preview => preview.items.map(item => item.application?.id).filter(Boolean)));
    if (localId) delete state.issues[localId];
    else state.issues = {};
    const imports = [];
    const importItem = (record, application, needsMapping = false) => {
      if (imports.length + adapter.state.pending.length >= 100) return;
      const localId = record?.id || `manual:application:${application.id}`;
      imports.push({ id: randomUUID(), localId, before: localFingerprint(record),
        application: { ...cloudFields(application), id: application.id, version: application.version, deletedAt: application.deletedAt || null,
          createdAt: application.createdAt, statusHistory: application.statusHistory || [] },
        selectedOptional: [], needsMapping, mapMutationId: randomUUID(), origin: adapter.client.origin });
    };
    for (const record of records.filter(record => (!localId || record.id === localId) && syncEligible(adapter, record))) {
      if (blocked.has(record.id)) continue;
      const mapping = own(adapter.adapter.mappings, record.id);
      const application = mapping && adapter.state.applications[mapping.applicationId];
      const baseline = own(state.baselines, record.id);
      if (mapping && !application) { issue(record, 'missing_snapshot', 'Download a fresh cloud snapshot before syncing this application.'); continue; }
      if (application?.deletedAt) {
        if (direction === 'two-way' && !record.cloudImport?.deletedAt) {
          if (baseline && baseline.local === syncLocalFingerprint(record)) importItem(record, application);
          else issue(record, 'deleted_online', 'Deleted online while local changes remain. Review before importing the deletion.', application);
        }
        continue; // Tombstones are never recreated.
      }
      if (!mapping) {
        const duplicate = Object.values(adapter.state.applications).find(remote => !remote.deletedAt &&
          ((record.url && record.url === remote.url) || (record.company === remote.company && record.title === remote.title)));
        if (duplicate) { issue(record, 'possible_duplicate', 'A similar application already exists online. Link the records in advanced tools before syncing.', duplicate); continue; }
      }
      const local = syncLocalFingerprint(record), remote = application && syncFieldsFingerprint(application);
      if (application && !baseline) {
        if (syncFieldsFingerprint(record) === remote) put(state.baselines, record.id, { local, remote });
        else issue(record, 'initial_difference', 'The linked records differ. Choose which version to keep.', application);
        continue;
      }
      if (baseline && remote !== baseline.remote && application) {
        if (direction === 'two-way' && local === baseline.local) importItem(record, application);
        else issue(record, 'both_changed', 'The online version changed. Review both versions before replacing either one.', application);
        continue;
      }
      if (baseline?.local === local) continue;
      if (adapter.state.pending.length + imports.length >= 100) continue;
      try {
        if (typeof record.id !== 'string' || !record.id.trim() || [...record.id].length > 256 || /[\x00-\x1f\x7f]/.test(record.id)) throw new Error('Edit the unsupported local application ID before syncing.');
        const mutation = { mutationId: randomUUID(), operation: mapping ? 'update' : 'create', localRecordId: record.id,
          fields: cloudFields(record, [], { creating: !mapping }), statusHistory: adapter.history(record, application),
          ...(mapping ? { applicationId: application.id, expectedVersion: application.version } : {}) };
        rememberSend(adapter, record, mutation, application);
        adapter.state.pending.push(mutation); counts.sent++;
      } catch (error) { issue(record, 'invalid_local', error.message, application); }
    }
    if (direction === 'two-way') for (const application of Object.values(adapter.state.applications)) {
      if (application.deletedAt || previewedCloud.has(application.id) || application.mappings?.some(item => item.installationId === adapter.state.installationId)) continue;
      const duplicate = records.find(record => (record.url && record.url === application.url) || (record.company === application.company && record.title === application.title));
      if (duplicate || byId.has(`manual:application:${application.id}`)) {
        issue(duplicate, 'possible_duplicate', 'Link this existing application in advanced tools before importing it.', application); continue;
      }
      if (imports.length + adapter.state.pending.length < 100) importItem(null, application, true);
    }
    // Persist the complete outbound queue before any network write.
    await adapter.persist();
    await adapter.client.pushPending({ localId }); settleSyncReceipts(adapter); adapter.updateMappings(); await adapter.persist();
    if (imports.length) {
      counts.received = imports.length;
      adapter.adapter.journal = { id: randomUUID(), direction: 'import', automatic: true, items: imports };
      await adapter.persist(); await adapter.recover();
    }
    counts.needsReview = Object.keys(state.issues).length + adapter.state.conflicts.length + adapter.state.failures.length;
    state.lastCounts = counts; state.lastSuccess = new Date().toISOString();
    await adapter.persist(); return adapter.status();
  } catch (error) {
    state.lastError = error.message;
    if (adapter.state.revoked) state.enabled = false;
    await adapter.persist(); throw error;
  }
}
