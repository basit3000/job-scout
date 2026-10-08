const $ = id => document.getElementById(id);
const labels = { note: 'Notes', contactName: 'Contact name', contactEmail: 'Contact email', contactPhone: 'Contact phone', salary: 'Salary' };
const fieldLabels = { ...labels, title: 'Job title', company: 'Company', status: 'Status', url: 'Job URL', board: 'Source', location: 'Location',
  appliedDate: 'Application date', followUpDate: 'Follow-up date', postedAt: 'Posted on', postedAtApproximate: 'Posting date approximate', applicants: 'Applicant observation' };
let status, previewId, busy = false;
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
  status = data;
  $('connectionStatus').textContent = `${data.paired ? 'Connected' : data.revoked ? 'Access revoked — pair again' : 'Not connected'}${data.origin ? ` · ${data.origin}` : ''} · ${data.pending || 0} pending transfers`;
  if (data.origin) $('origin').value = data.origin;
  $('origin').readOnly = Boolean(data.origin);
  $('pairButton').disabled = Boolean(data.paired);
  $('redeem').disabled = Boolean(data.paired);
  document.querySelectorAll('[data-paired]').forEach(button => { button.disabled = !data.paired; });
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
async function preview(direction) {
  const localIds = checked('localList'), remoteIds = checked('remoteList');
  if (direction === 'map' && (localIds.length !== 1 || remoteIds.length !== 1)) throw new Error('Select exactly one application on each side to link.');
  const result = await api('/preview', { direction, ids: direction === 'push' ? localIds : remoteIds,
    selectedOptional: checked('optional'), includeHistory: $('history').checked, localRecordId: direction === 'map' ? localIds[0] : undefined });
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
$('cancelPreview').addEventListener('click', () => { previewId = null; $('previewSection').hidden = true; });
$('confirm').addEventListener('click', () => run(async () => {
  if (!previewId) throw new Error('Prepare a new preview first.');
  showStatus(await api('/confirm', { previewId })); previewId = null; $('previewSection').hidden = true;
}, 'Transfer processed. Review any conflicts below.'));
run(async () => showStatus(await api()), 'Choose applications to connect.');
