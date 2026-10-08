import { createHash } from 'node:crypto';
import { applicationFields } from './application-fields.mjs';
import { mutateDecisions, VALID_DECISIONS } from './decisions.mjs';
import { DEFAULT_FIELDS, OPTIONAL_FIELDS } from './tracker-client.mjs';
import { validDateKey } from '../../web/public/tracker-view.js';

const TEXT_LIMITS = { title: 128, company: 128, url: 512, board: 128, location: 128,
  note: 20000, contactName: 128, contactEmail: 254, contactPhone: 80, salary: 64 };
const OBSERVATION_KEYS = ['count', 'relation', 'label', 'source', 'url', 'observedAt'];
const TERMINAL = new Set(['skipped', 'accepted', 'rejected', 'closed']);
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function text(value, key, limit) {
  if (value === null) return;
  if (typeof value !== 'string' || [...value].length > limit) throw new Error(`${key} must be text of at most ${limit} characters. Edit the application before sharing.`);
  const controls = key === 'note' ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/;
  if (controls.test(value)) throw new Error(`${key} contains unsupported control characters.`);
}
function timestamp(value, key) {
  if (value === null) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    || !validDateKey(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw new Error(`${key} needs a valid timestamp with a timezone, or null.`);
}
function httpUrl(value, key) {
  if (!value) return;
  let url;
  try { url = new URL(value); } catch { throw new Error(`${key} needs a complete HTTP or HTTPS URL.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`${key} needs HTTP or HTTPS without credentials.`);
}

// Always project before validation, previews, persistence or network requests.
export function projectFields(record, selectedOptional = []) {
  if (!Array.isArray(selectedOptional) || selectedOptional.some(key => !OPTIONAL_FIELDS.includes(key))) throw new Error('Invalid optional field selection.');
  const fields = {};
  for (const key of [...DEFAULT_FIELDS, ...selectedOptional]) {
    if (Object.hasOwn(record, key)) fields[key] = record[key];
  }
  if (Object.hasOwn(record, 'decision')) fields.status = record.decision;
  if (fields.applicants && typeof fields.applicants === 'object' && !Array.isArray(fields.applicants)) {
    fields.applicants = Object.fromEntries(OBSERVATION_KEYS.filter(key => Object.hasOwn(fields.applicants, key)).map(key => [key, fields.applicants[key]]));
  }
  return fields;
}

export function cloudFields(record, selectedOptional = [], { creating = false } = {}) {
  const fields = projectFields(record, selectedOptional);
  // Legacy date is the decision date, never evidence of application submission.
  if (creating && !Object.hasOwn(fields, 'appliedDate')) fields.appliedDate = null;
  for (const [key, limit] of Object.entries(TEXT_LIMITS)) if (Object.hasOwn(fields, key)) text(fields[key], key, limit);
  for (const key of ['title', 'company']) {
    if ((creating || Object.hasOwn(fields, key)) && (typeof fields[key] !== 'string' || !fields[key].trim())) throw new Error(`${key} is required.`);
  }
  if (fields.status !== undefined && !VALID_DECISIONS.includes(fields.status)) throw new Error('Unknown application status.');
  for (const key of ['appliedDate', 'followUpDate']) if (fields[key] !== undefined && fields[key] !== null && !validDateKey(fields[key])) throw new Error(`${key} needs a valid calendar date or null.`);
  if (fields.postedAt !== undefined) timestamp(fields.postedAt, 'postedAt');
  if (fields.postedAtApproximate !== undefined && typeof fields.postedAtApproximate !== 'boolean') throw new Error('postedAtApproximate must be a boolean.');
  if (fields.postedAtApproximate && !fields.postedAt) throw new Error('Approximate posting dates require postedAt.');
  httpUrl(fields.url, 'url');
  if (fields.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contactEmail)) throw new Error('Invalid contact email.');
  if (fields.applicants != null) {
    const value = fields.applicants;
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid applicant observation.');
    fields.applicants = Object.fromEntries(OBSERVATION_KEYS.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
    const observation = fields.applicants;
    if (observation.count != null && (!Number.isInteger(observation.count) || observation.count < 0 || observation.count > 1e9)) throw new Error('Invalid applicant count.');
    if (observation.relation != null && !['exact', 'less-than', 'more-than', 'at-least'].includes(observation.relation)) throw new Error('Invalid applicant relation.');
    for (const key of ['label', 'source', 'url']) if (observation[key] !== undefined) text(observation[key], `applicants.${key}`, key === 'url' ? 512 : 128);
    if (observation.observedAt !== undefined) timestamp(observation.observedAt, 'applicants.observedAt');
    httpUrl(observation.url, 'applicants.url');
    if (observation.count != null && (!observation.relation || !observation.source?.trim() || !observation.observedAt)) throw new Error('Applicant counts need a relation, source and observation time.');
  }
  return fields;
}

export function localFingerprint(record) {
  if (!record) return null;
  // Local-only attachments may change while a preview is open; imports preserve them.
  return digest([...DEFAULT_FIELDS, ...OPTIONAL_FIELDS, 'decision', 'statusHistory'].map(key => [key, record[key] ?? null]));
}

export function eventFingerprint(event) {
  return digest([event.from ?? null, event.to, event.at ?? null]);
}

export function validateSourceEvents(events) {
  for (const event of events) {
    if (!VALID_DECISIONS.includes(event.status) || (event.fromStatus != null && !VALID_DECISIONS.includes(event.fromStatus))) throw new Error('Unknown status in local history. Review history or send current fields only.');
    timestamp(event.occurredAt, 'History occurrence time');
  }
  return events;
}

export function localImportFields(application, selectedOptional, creating) {
  const fields = cloudFields(application, selectedOptional, { creating });
  const input = { ...fields, decision: fields.status };
  for (const key of Object.keys(TEXT_LIMITS)) if (input[key] === null) input[key] = '';
  const local = applicationFields(input, { creating });
  for (const key of ['board', 'postedAt', 'postedAtApproximate', 'applicants']) if (Object.hasOwn(fields, key)) local[key] = fields[key];
  return local;
}

export async function importCloudRecord(root, journal, installationId, ledger = []) {
  return mutateDecisions(root, log => {
    const index = log.decisions.findIndex(record => record.id === journal.localId);
    const previous = index < 0 ? null : log.decisions[index];
    if (previous?.cloudImport?.operationId === journal.id) return previous;
    if (localFingerprint(previous) !== journal.before) throw new Error('Local application changed after preview. Cancel recovery and preview the import again.');
    const application = journal.application;
    const patch = application.deletedAt ? {} : localImportFields(application, journal.selectedOptional, !previous);
    if (!previous && application.deletedAt) throw new Error('Cannot import a deleted cloud application as a new record.');
    const history = structuredClone(previous?.statusHistory || []);
    const receivedEvents = new Set(previous?.cloudImport?.eventIds || []);
    for (const event of application.statusHistory || []) {
      if (!VALID_DECISIONS.includes(event.status) || (event.fromStatus != null && !VALID_DECISIONS.includes(event.fromStatus))) throw new Error('Invalid remote status history.');
      timestamp(event.occurredAt ?? null, 'occurredAt');
      timestamp(event.recordedAt ?? null, 'recordedAt');
      if (typeof event.id !== 'string' || !event.id) throw new Error('Missing remote event identity.');
      if (receivedEvents.has(event.id) || history.some(item => item.cloudEventId === event.id)) continue;
      receivedEvents.add(event.id);
      // A cloud echo of our original event annotates that event instead of duplicating it.
      const sourceIndex = event.installationId === installationId ? ledger.findIndex(item => item.sourceEventId === event.sourceEventId) : -1;
      if (sourceIndex >= 0 && history[sourceIndex] && eventFingerprint(history[sourceIndex]) === ledger[sourceIndex].fingerprint) {
        history[sourceIndex].cloudEventId = event.id;
        history[sourceIndex].sourceEventId = event.sourceEventId;
      } else if (!(event.source === 'device' && event.installationId === installationId && !event.sourceEventId
        && history.some(item => item.sourceEventId && item.to === event.status && (item.from ?? null) === (event.fromStatus ?? null)))) {
        history.push({ from: event.fromStatus ?? null, to: event.status, at: event.occurredAt ?? null,
          cloudEventId: event.id, sourceEventId: event.sourceEventId ?? null, recordedAt: event.recordedAt ?? null });
      }
    }
    const now = new Date().toISOString();
    const entry = { ...previous, ...patch, id: journal.localId, statusHistory: history,
      createdAt: previous?.createdAt || application.createdAt || now, updatedAt: now,
      appliedDate: patch.appliedDate !== undefined ? patch.appliedDate : previous?.appliedDate ?? null,
      cloudImport: { operationId: journal.id, origin: journal.origin, applicationId: application.id,
        version: application.version, deletedAt: application.deletedAt ?? null, eventIds: [...receivedEvents] } };
    if (TERMINAL.has(entry.decision) || application.deletedAt) entry.followUpDate = null;
    if (index < 0) log.decisions.push(entry); else log.decisions[index] = entry;
    return entry;
  });
}
