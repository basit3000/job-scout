import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './common.mjs';
import { loadDecisions } from './decisions.mjs';
import { TrackerClient, OPTIONAL_FIELDS } from './tracker-client.mjs';
import { cloudFields, projectFields, localImportFields, localFingerprint, eventFingerprint, importCloudRecord, validateSourceEvents, syncFieldsFingerprint } from './cloud-records.mjs';
import { syncSummary, syncState, settleSyncReceipts, rememberImport, rememberSend } from './cloud-sync.mjs';

export const cloudStatePath = (root = ROOT) => join(root, 'state', 'private', 'tracker.json');
const own = (object, key) => Object.hasOwn(object, key) ? object[key] : undefined;
const put = (object, key, value) => Object.defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });
export async function configuredOrigin(root = ROOT) {
  try { return JSON.parse(await readFile(cloudStatePath(root), 'utf8')).origin; }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Preserve the private tracker state before recovery; it cannot be read.'); }
}

export class CloudTracker {
  static async open({ root = ROOT, baseUrl, allowLoopbackHttp = false } = {}) {
    const origin = baseUrl || await configuredOrigin(root);
    if (!origin) throw new Error('Enter the tracker service URL and start pairing first.');
    const client = await TrackerClient.open({ baseUrl: origin, statePath: cloudStatePath(root), allowLoopbackHttp });
    return new CloudTracker(root, client);
  }
  constructor(root, client) {
    this.root = root;
    this.client = client;
    this.state = client.state;
    this.state.adapter ||= { mappings: {}, ledger: {}, previews: {}, journal: null };
    this.adapter = this.state.adapter;
    client.onMutationAcknowledged = (mutation, application) => {
      const receipt = own(syncState(this).receipts, mutation.mutationId);
      // Save the server's normalized fields with queue advancement, before any
      // newer change-feed entry can replace this acknowledged version.
      if (receipt) receipt.remote = syncFieldsFingerprint(application);
    };
  }
  close() { return this.client.close(); }
  persist() { return this.client.persist(); }
  async records() { return (await loadDecisions(this.root)).decisions; }
  checkSelection(selected) {
    if (!Array.isArray(selected) || selected.some(key => !OPTIONAL_FIELDS.includes(key) || !this.state.optionalFields.includes(key))) throw new Error('An optional field was not granted during pairing.');
  }
  updateMappings() {
    for (const application of Object.values(this.state.applications)) {
      for (const mapping of application.mappings || []) {
        if (mapping.installationId !== this.state.installationId) continue;
        const old = own(this.adapter.mappings, mapping.localRecordId);
        if (old && old.applicationId !== application.id) throw new Error('Mapping conflict. Review the cloud record before continuing.');
        put(this.adapter.mappings, mapping.localRecordId, { applicationId: application.id, version: application.version, deletedAt: application.deletedAt ?? null });
      }
    }
  }
  history(record, application) {
    const old = own(this.adapter.ledger, record.id) || [];
    const events = record.statusHistory || [];
    if (old.length > events.length || old.some((item, index) => item.fingerprint !== eventFingerprint(events[index]))) throw new Error('History was rewritten or reordered. Review it, then choose current fields only to omit historical events.');
    const ledger = events.map((event, index) => old[index] || { fingerprint: eventFingerprint(event), sourceEventId: event.cloudEventId ? null : randomUUID() });
    put(this.adapter.ledger, record.id, ledger);
    const received = new Set((application?.statusHistory || []).filter(event => event.installationId === this.state.installationId).map(event => event.sourceEventId));
    const result = events.flatMap((event, index) => !ledger[index].sourceEventId || received.has(ledger[index].sourceEventId) ? [] : [{
      sourceEventId: ledger[index].sourceEventId, fromStatus: event.from ?? null, status: event.to, occurredAt: event.at ?? null,
    }]);
    if (result.length > 100) throw new Error('More than 100 unsent history events. Choose current fields only, or reduce the history in a reviewed local edit.');
    return validateSourceEvents(result);
  }
  async status() {
    this.updateMappings();
    const records = await this.records();
    // Deliberately omit bearer tokens, pairing secrets and all local-only fields.
    return { configured: true, origin: this.client.origin, paired: Boolean(this.state.token), revoked: Boolean(this.state.revoked),
      optionalFields: this.state.optionalFields, pending: this.state.pending.length,
      recovery: Boolean(this.adapter.journal), automatic: syncSummary(this, records),
      issues: [...this.state.conflicts, ...this.state.failures].map(item => ({ id: item.mutation.mutationId, code: item.code,
        localRecordId: item.mutation.localRecordId, applicationId: item.mutation.applicationId,
        proposed: item.mutation.fields, current: item.current })),
      local: records.map(record => ({ id: record.id, company: record.company, title: record.title, status: record.decision, mapping: own(this.adapter.mappings, record.id) || null })),
      remote: Object.values(this.state.applications).map(application => ({ id: application.id, company: application.company,
        title: application.title, status: application.status, version: application.version, deletedAt: application.deletedAt,
        localRecordId: (application.mappings || []).find(mapping => mapping.installationId === this.state.installationId)?.localRecordId })) };
  }
  async pull() {
    if (this.adapter.journal) await this.recover();
    await this.client.pull();
    this.updateMappings();
    await this.persist();
    return this.status();
  }
  async sync() {
    if (this.state.revoked) throw new Error('Reconnect, download a fresh snapshot, and review retained work before retrying.');
    if (this.adapter.journal) await this.recover();
    await this.client.pushPending();
    settleSyncReceipts(this); await this.persist();
    await this.client.pull();
    this.updateMappings();
    await this.persist();
    return this.status();
  }
  async redeem() {
    if (this.adapter.journal) throw new Error('Finish or cancel the pending local import before reconnecting.');
    await this.client.redeemPairing(() => {
      // Store new credentials and quarantine old writes in the same atomic replacement.
      // A fresh pairing may target another account or grant a different optional scope.
      for (const mutation of this.state.pending) this.state.conflicts.push({ mutation, code: 'reconnect_review', current: null });
      this.state.pending = [];
      this.state.revoked = false;
      this.adapter.previews = {};
      syncState(this).enabled = false;
      syncState(this).onApplied = false;
    });
    return this.pull();
  }
  async preview({ direction, ids, selectedOptional = [], includeHistory = true, localRecordId } = {}) {
    if (!this.state.token) throw new Error('Pair the tracker first.');
    if (this.adapter.journal) throw new Error('Finish or cancel recovery before previewing another change.');
    if (this.state.pending.length) throw new Error('Retry the pending queue before preparing another transfer.');
    this.checkSelection(selectedOptional);
    if (!['push', 'import', 'map'].includes(direction) || !Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw new Error('Select between 1 and 100 distinct applications.');
    await this.client.pull();
    this.updateMappings();
    const records = await this.records();
    const preview = { id: randomUUID(), direction, selectedOptional, createdAt: Date.now(), items: [] };
    for (const id of ids) {
      if (direction === 'push') {
        const record = records.find(item => item.id === id);
        if (!record) throw new Error('Selected local application was not found.');
        if (typeof id !== 'string' || !id.trim() || [...id].length > 256 || /[\x00-\x1f\x7f]/.test(id)) throw new Error('The selected local application ID is not supported by the tracker.');
        const mapping = own(this.adapter.mappings, id);
        if (mapping?.deletedAt) throw new Error('This application was deleted online. Its mapping is retained and it cannot be revived.');
        const application = mapping && this.state.applications[mapping.applicationId];
        if (mapping && !application) throw new Error('Download a fresh snapshot to review the mapped application.');
        const fields = cloudFields(record, selectedOptional, { creating: !mapping });
        // Manual confirmation authorizes exactly these fields at the reviewed version.
        const mutation = { mutationId: randomUUID(), operation: mapping ? 'update' : 'create', localRecordId: id, fields,
          statusHistory: includeHistory ? this.history(record, application) : [] };
        if (mapping) Object.assign(mutation, { applicationId: mapping.applicationId, expectedVersion: application.version });
        preview.items.push({ localId: id, before: localFingerprint(record), mutation, current: application ? cloudFields(application, selectedOptional) : null });
      } else {
        const application = this.state.applications[id];
        if (!application) throw new Error('Download cloud applications first.');
        const mapping = (application.mappings || []).find(item => item.installationId === this.state.installationId);
        if (direction === 'map' && (ids.length !== 1 || mapping || !localRecordId || application.deletedAt)) throw new Error('Select one unmapped cloud application and an existing local application.');
        const localId = mapping?.localRecordId || (direction === 'map' ? localRecordId : `manual:application:${randomUUID()}`);
        const record = records.find(item => item.id === localId);
        if (direction === 'map' && (!record || own(this.adapter.mappings, localId))) throw new Error('Choose an existing unmapped local application.');
        if (direction !== 'map') {
          if (application.deletedAt && !record) throw new Error('Deleted cloud applications cannot be imported as new records.');
          if (!application.deletedAt) localImportFields(application, selectedOptional, !record);
        }
        const projected = application.deletedAt ? { id: application.id, version: application.version, deletedAt: application.deletedAt }
          : { ...cloudFields(application, selectedOptional), id: application.id, version: application.version,
            createdAt: application.createdAt, statusHistory: application.statusHistory };
        preview.items.push({ localId, before: localFingerprint(record), application: projected, needsMapping: !mapping,
          current: record ? projectFields(record, selectedOptional) : null });
      }
    }
    // One durable preview at a time, invalidated after confirmation or a new preview.
    this.adapter.previews = { [preview.id]: preview };
    await this.persist();
    return preview;
  }
  async confirm(previewId) {
    const preview = own(this.adapter.previews, previewId);
    if (!preview || Date.now() - preview.createdAt > 15 * 60 * 1000) throw new Error('Preview expired. Prepare and review a new preview.');
    if (this.adapter.journal || this.state.pending.length) throw new Error('Finish pending work before confirming.');
    const records = await this.records();
    for (const item of preview.items) {
      if (localFingerprint(records.find(record => record.id === item.localId)) !== item.before) throw new Error('Local application changed after preview. Preview again.');
      if (item.application) {
        const current = await this.client.request(`/applications/${encodeURIComponent(item.application.id)}`);
        if (current.version !== item.application.version) throw new Error('Cloud application changed after preview. Preview again.');
      }
    }
    delete this.adapter.previews[previewId];
    if (preview.direction === 'push') {
      for (const item of preview.items) rememberSend(this, records.find(record => record.id === item.localId), item.mutation,
        item.mutation.applicationId && this.state.applications[item.mutation.applicationId], true);
      this.state.pending.push(...preview.items.map(item => item.mutation));
      await this.persist(); // All selections and stable mutation IDs survive a lost response.
      return this.sync();
    }
    // Journal the whole selection before touching either record store. Recovery is idempotent.
    this.adapter.journal = { ...preview, items: preview.items.map(item => ({ ...item, id: randomUUID(),
      origin: this.client.origin, selectedOptional: preview.selectedOptional, mapMutationId: randomUUID() })) };
    await this.persist();
    await this.recover();
    return this.status();
  }
  async recover() {
    const journal = this.adapter.journal;
    if (!journal) return;
    while (journal.items.length) {
      const item = journal.items[0];
      if (item.needsMapping) {
        // Direct idempotent map request: journal retains ID across transport failure/crash.
        const result = await this.client.request('/mutations', { method: 'POST', body: { operation: 'map',
          mutationId: item.mapMutationId, applicationId: item.application.id,
          expectedVersion: item.application.version, localRecordId: item.localId } });
        this.client.apply(result.application);
        item.application.version = result.application.version;
        item.needsMapping = false;
        this.updateMappings();
        await this.persist();
      }
      if (journal.direction !== 'map') {
        const imported = await importCloudRecord(this.root, item, this.state.installationId, own(this.adapter.ledger, item.localId) || []);
        rememberImport(this, item, imported);
      }
      journal.items.shift();
      await this.persist();
    }
    this.adapter.journal = null;
    await this.persist();
  }
  async dismissIssue(id) {
    this.state.conflicts = this.state.conflicts.filter(item => item.mutation.mutationId !== id);
    this.state.failures = this.state.failures.filter(item => item.mutation.mutationId !== id);
    await this.persist();
    return this.status();
  }
  async cancelRecovery() {
    // Mapping receipts already accepted by the service remain in the durable mapping store.
    this.adapter.journal = null;
    await this.persist();
    return this.status();
  }
}
