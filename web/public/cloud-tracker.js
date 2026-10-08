const $ = id => document.getElementById(id);
const labels = { note: 'Notes', contactName: 'Contact name', contactEmail: 'Contact email', contactPhone: 'Contact phone', salary: 'Salary' };
const fieldLabels = { ...labels, title: 'Job title', company: 'Company', status: 'Status', url: 'Job URL', board: 'Source', location: 'Location',
  appliedDate: 'Application date', followUpDate: 'Follow-up date', postedAt: 'Posted on', postedAtApproximate: 'Posting date approximate', applicants: 'Applicant observation' };
let status, previewId, busy = false;
let settingsDirty = false;
async function api(action = '', body) {
  const response = await fetch(`/api/cloud-tracker${action}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Tracker request failed.');
  return data;
}
function node(tag, text) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; }
function checked(id) { return [...$(id).querySelectorAll('input:checked')].map(input => input.value); }
function check(value, label) {
  const el = node('label'); el.className = 'cloud-check';
  const input = node('input'); input.type = 'checkbox'; input.value = value;
  el.append(input, node('span', label)); return el;
}
function showStatus(data) {
  const justConnected = data.paired && !status?.paired;
  status = data;
  $('connectionStatus').textContent = `${data.paired ? 'Connected' : data.revoked ? 'Access revoked — pair again' : 'Not connected'}${data.origin ? ` · ${data.origin}` : ''} · ${data.pending || 0} pending transfers`;
  if (data.origin) $('origin').value = data.origin;
  $('origin').readOnly = Boolean(data.origin);
  $('pairButton').disabled = Boolean(data.paired);
  $('redeem').disabled = Boolean(data.paired);
  document.querySelectorAll('[data-paired]').forEach(button => { button.disabled = !data.paired; });
  if (!data.paired) $('connectionSettings').open = true;
  else if (justConnected) $('connectionSettings').open = false;
  $('pairForm').hidden = Boolean(data.paired);
  $('redeem').hidden = Boolean(data.paired);
  renderSync(data);
  const selected = checked('optional');
  $('optional').replaceChildren(node('legend', 'Optional fields for this transfer'));
  for (const field of data.optionalFields || []) {
    const el = check(field, labels[field]); el.querySelector('input').checked = selected.includes(field); $('optional').append(el);
  }
  if (!data.optionalFields?.length) $('optional').append(node('p', 'No optional fields granted. You can grant them when pairing in Job Tracker.'));
  for (const [key, target] of [['local', 'localList'], ['remote', 'remoteList']]) {
    const selectedIds = checked(target);
    $(target).replaceChildren();
    for (const record of data[key] || []) {
      const query = $('transferSearch').value.trim().toLowerCase();
      if (query && !`${record.company || ''} ${record.title || ''}`.toLowerCase().includes(query)) continue;
      const deleted = record.deletedAt || record.mapping?.deletedAt;
      const el = check(record.id, `${record.company || 'Deleted application'} · ${record.title || record.id} · ${deleted ? 'deleted online' : record.status}${record.mapping || record.localRecordId ? ' · linked' : ''}`);
      el.querySelector('input').checked = selectedIds.includes(record.id); $(target).append(el);
    }
    if (!data[key]?.length) $(target).append(node('p', key === 'local' ? 'No local applications.' : 'Download cloud changes to see available applications.'));
  }
  $('recoverySection').hidden = !data.recovery;
  $('issues').replaceChildren();
  for (const issue of data.issues || []) {
    const details = node('details'); details.append(node('summary', `${issue.code} · ${issue.localRecordId || issue.applicationId || issue.id}`));
    details.append(node('pre', JSON.stringify({ proposed: issue.proposed, cloud: issue.current }, null, 2)));
    const dismiss = node('button', 'Dismiss reviewed issue'); dismiss.className = 'btn';
    dismiss.addEventListener('click', () => run(async () => showStatus(await api('/dismiss', { id: issue.id })))) ;
    details.append(dismiss); $('issues').append(details);
  }
  if (!data.issues?.length) $('issues').append(node('p', 'No conflicts or rejected transfers.'));
}
async function run(task, success = '') {
  if (busy) return;
  busy = true; $('feedback').dataset.error = 'false'; $('feedback').textContent = 'Working…';
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try { await task(); $('feedback').textContent = success || 'Done.'; }
  catch (error) {
    $('feedback').dataset.error = 'true'; $('feedback').textContent = error.message;
    try { showStatus(await api()); } catch { /* Keep the original actionable error. */ }
  } finally {
    busy = false;
    document.querySelectorAll('button').forEach(button => { button.disabled = false; });
    if (status) showStatus(status);
  }
}
$('pairForm').addEventListener('submit', event => {
  event.preventDefault(); run(async () => {
    const result = await api('/pair', { origin: $('origin').value });
    $('pairing').replaceChildren(node('strong', `Code: ${result.userCode} — `));
    const link = node('a', 'Open Job Tracker to approve'); link.href = result.approvalUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    $('pairing').append(link); $('pairing').hidden = false; showStatus(await api());
  }, 'Approve the displayed code in Job Tracker, then finish pairing here.');
});
for (const [id, action] of Object.entries({ redeem: '/redeem', pull: '/pull', retry: '/sync', reset: '/reset-snapshot', disconnect: '/disconnect', recover: '/recover', cancelRecovery: '/cancel-recovery' })) {
  $(id).addEventListener('click', () => run(async () => {
    showStatus(await api(action, {}));
    if (id === 'redeem') $('pairing').hidden = true;
  }));
}
async function preview(direction, selectedId) {
  const localIds = selectedId && direction === 'push' ? [selectedId] : checked('localList'), remoteIds = selectedId && direction === 'import' ? [selectedId] : checked('remoteList');
  if (direction === 'map' && (localIds.length !== 1 || remoteIds.length !== 1)) throw new Error('Select exactly one application on each side to link.');
  const result = await api('/preview', { direction, ids: direction === 'push' ? localIds : remoteIds,
    selectedOptional: selectedId ? [] : checked('optional'), includeHistory: $('history').checked, localRecordId: direction === 'map' ? localIds[0] : undefined });
  previewId = result.id;
  $('previewSummary').textContent = `${result.items.length} application(s) · ${direction === 'push' ? 'send local values to cloud' : direction === 'map' ? 'link identities only' : 'apply cloud values locally'}. Confirm only after reviewing each record.`;
  $('previewItems').replaceChildren();
  for (const item of result.items) {
    const proposed = item.mutation?.fields || item.application;
    const details = node('details'); details.open = true;
    details.append(node('summary', `${proposed.company || item.current?.company || 'Deleted application'} · ${proposed.title || item.current?.title || ''}`));
    if (item.application?.deletedAt) details.append(node('p', 'Mark this record as deleted online and clear its follow-up. The local application and its documents are retained.'));
    else {
      const table = node('table'); table.className = 'cloud-diff';
      const head = node('tr'); for (const title of ['Field', direction === 'map' ? 'Local record' : 'Current destination', direction === 'map' ? 'Cloud record' : 'After transfer']) head.append(node('th', title));
      const thead = node('thead'); thead.append(head); table.append(thead);
      const tbody = node('tbody');
      const valueText = value => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      for (const key of Object.keys(fieldLabels).filter(key => Object.hasOwn(proposed, key))) {
        const row = node('tr'); if (JSON.stringify(item.current?.[key]) !== JSON.stringify(proposed[key])) row.className = 'changed';
        row.append(node('th', fieldLabels[key]), node('td', valueText(item.current?.[key])), node('td', valueText(proposed[key]))); tbody.append(row);
      }
      table.append(tbody); details.append(table);
      details.append(node('p', direction === 'map' ? 'Only link these identities; no fields are copied.' : 'Highlighted rows change the destination. A dash means an empty or unknown value; fields absent from this table stay unchanged.'));
      const events = item.mutation?.statusHistory || proposed.statusHistory || [];
      if (events.length && direction !== 'map') {
        details.append(node('h3', 'Status history included'));
        const list = node('ul');
        for (const event of events) list.append(node('li', `${event.fromStatus || 'No prior status'} → ${event.status} · ${event.occurredAt || 'Occurrence time unknown'}`));
        details.append(list);
      }
    }
    $('previewItems').append(details);
  }
  $('previewSection').hidden = false; $('previewSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
for (const direction of ['push', 'import', 'map']) $(direction + 'Preview').addEventListener('click', () => run(() => preview(direction), 'Preview ready. No application changes have been sent or imported.'));
$('cancelPreview').addEventListener('click', () => run(async () => { showStatus(await api('/cancel-preview', {})); previewId = null; $('previewSection').hidden = true; }));
$('confirm').addEventListener('click', () => run(async () => {
  if (!previewId) throw new Error('Prepare a new preview first.');
  showStatus(await api('/confirm', { previewId })); previewId = null; $('previewSection').hidden = true;
}, 'Transfer processed. Review any conflicts below.'));
function renderSync(data) {
  const sync = data.automatic || { enabled: false, intervalMinutes: 1, direction: 'push', issues: [], recent: [] };
  if (!settingsDirty) {
    $('syncOnApplied').checked = Boolean(sync.onApplied);
    $('autoEnabled').checked = sync.enabled; $('syncInterval').value = String(sync.intervalMinutes); $('syncDirection').value = sync.direction;
  }
  const issues = [...(sync.issues || []), ...(data.issues || []).map(item => ({ id: item.id, localId: item.localRecordId,
    applicationId: item.applicationId, code: item.code, message: 'This transfer needs review. Compare the versions below before retrying.',
    company: data.local?.find(record => record.id === item.localRecordId)?.company }))];
  $('syncBadge').textContent = data.syncing ? 'Syncing' : !data.paired ? 'Not connected' : issues.length ? 'Needs attention' : sync.lastError ? 'Needs attention' : sync.enabled ? 'Automatic sync on' : sync.onApplied ? 'Sync on Applied' : 'Manual sync';
  $('syncBadge').dataset.state = issues.length || sync.lastError ? 'attention' : data.paired ? 'connected' : 'disconnected';
  $('syncWaiting').textContent = sync.waiting ?? 0; $('syncLinked').textContent = sync.linked ?? 0; $('syncReviewCount').textContent = issues.length;
  const time = value => new Date(value).toLocaleString();
  $('syncTiming').textContent = `${sync.lastSuccess ? `Last synced ${time(sync.lastSuccess)}.` : 'No completed sync yet.'}${sync.enabled && sync.nextRun ? ` Next check: ${time(sync.nextRun)}.` : ' Use Sync now whenever you want.'}`;
  const restartNeeded = data.paired && !data.automatic;
  const error = restartNeeded ? 'Restart Job Scout to activate the new sync engine, then refresh this page.' : data.recovery ? 'An interrupted import needs attention. Open Advanced transfers and recovery to resume it.' : sync.lastError;
  $('syncError').hidden = !error; $('syncError').textContent = error || '';
  $('syncNow').textContent = data.syncing ? 'Syncing…' : 'Sync now'; $('syncNow').disabled = !data.paired || Boolean(data.syncing) || restartNeeded;
  $('saveSyncSettings').disabled = !data.paired || restartNeeded;
  $('syncAttention').hidden = !issues.length; $('syncIssueList').replaceChildren();
  for (const issue of issues) {
    const row = node('article'); row.className = 'sync-issue'; row.append(node('h3', issue.company || 'Application needs review'), node('p', issue.message));
    const actions = node('div'); actions.className = 'cloud-actions';
    if (issue.localId && issue.code !== 'possible_duplicate') {
      const send = node('button', 'Review local version'); send.className = 'btn'; send.onclick = () => run(() => preview('push', issue.localId)); actions.append(send);
    }
    if (issue.applicationId && issue.code !== 'possible_duplicate') {
      const receive = node('button', 'Review online version'); receive.className = 'btn'; receive.onclick = () => run(() => preview('import', issue.applicationId)); actions.append(receive);
    }
    const advanced = node('button', 'Open advanced tools'); advanced.className = 'btn ghost'; advanced.onclick = () => { $('advancedTransfers').open = true; $('advancedTransfers').scrollIntoView({ block: 'start' }); }; actions.append(advanced);
    row.append(actions); $('syncIssueList').append(row);
  }
  $('syncRecent').replaceChildren();
  for (const record of sync.recent || []) {
    const row = node('article'); row.className = 'sync-record';
    const text = node('div'); text.append(node('strong', record.company), node('p', record.title));
    const badge = node('span', ({ synced: 'Up to date', waiting: 'Waiting to sync', 'needs-review': 'Needs review', 'deleted-online': 'Deleted online' })[record.state]); badge.className = 'sync-record-state';
    row.append(text, badge); $('syncRecent').append(row);
  }
  if (!sync.recent?.length) $('syncRecent').append(node('p', 'No applications to sync yet. Mark a job Applied in your local Tracker to get started.'));
}
$('syncSettings').addEventListener('input', () => { settingsDirty = true; });
$('syncSettings').addEventListener('submit', event => { event.preventDefault(); run(async () => {
  const data = await api('/settings', { enabled: $('autoEnabled').checked, onApplied: $('syncOnApplied').checked, intervalMinutes: Number($('syncInterval').value), direction: $('syncDirection').value });
  settingsDirty = false; showStatus(data);
}, 'Sync settings saved. Automatic checks run while Job Scout is open.'); });
$('syncNow').addEventListener('click', () => run(async () => showStatus(await api('/sync-now', {})), 'Sync finished. Any conflicts are listed under Needs your attention.'));
$('transferSearch').addEventListener('input', () => { if (status) showStatus(status); });
setInterval(async () => { if (!busy && !document.hidden && !previewId) { try { showStatus(await api()); } catch { /* The next poll retries without replacing the current form. */ } } }, 10000);
run(async () => showStatus(await api()), 'Ready. Sync now or enable automatic sync.');
