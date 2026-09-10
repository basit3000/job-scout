import { validDateKey } from './tracker-view.js';

const STATUSES = [['shortlisted', 'Shortlisted'], ['applied', 'Applied'], ['interviewing', 'Interviewing'], ['offer', 'Offer'], ['accepted', 'Accepted'], ['rejected', 'Rejected'], ['closed', 'Closed'], ['skipped', 'Skipped']];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const statusLabel = (id) => STATUSES.find(([value]) => value === id)?.[1] || id;

export function openApplicationEditor(item, { api, onSaved }) {
  const creating = !item;
  const entry = item || {};
  const dialog = document.createElement('dialog');
  dialog.className = 'application-dialog';
  dialog.setAttribute('aria-labelledby', 'applicationEditorTitle');
  const textField = (key, label, type = 'text', max = 300) => `<label>${label}<input name="${key}" type="${type}" maxlength="${max}" value="${esc(entry[key])}" ${['title', 'company'].includes(key) ? 'required' : ''} /></label>`;
  dialog.innerHTML = `
    <header class="application-dialog-head"><div><p class="eyebrow">APPLICATION RECORD</p><h2 id="applicationEditorTitle">${creating ? 'Add an application' : esc(entry.company || 'Application details')}</h2><p class="meta">${creating ? 'Track a job from any website, referral, or conversation.' : 'Keep the details and documents for this application together.'}</p></div><button class="btn ghost" type="button" data-close aria-label="Close application editor">Close</button></header>
    <form class="application-form">
      <div class="application-fields">
        ${textField('company', 'Company *')}${textField('title', 'Job title *')}
        <label>Status<select name="decision">${STATUSES.map(([id, label]) => `<option value="${id}"${(entry.decision || 'applied') === id ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Application date<input type="date" name="appliedDate" value="${validDateKey(entry.appliedDate) ? entry.appliedDate : ''}" /><small>Leave blank if unknown or not yet applied.</small></label>
        ${textField('location', 'Location')}${textField('salary', 'Salary / range', 'text', 150)}
        <label class="field-wide">Job posting URL<input type="url" name="url" maxlength="2000" placeholder="https://…" value="${esc(entry.url)}" /></label>
        ${textField('contactName', 'Contact name', 'text', 200)}${textField('contactEmail', 'Contact email', 'email', 254)}
        ${textField('contactPhone', 'Contact phone', 'tel', 100)}
        <label>Follow-up date<input type="date" name="followUpDate" value="${validDateKey(entry.followUpDate) ? entry.followUpDate : ''}" /><small>Completed applications are excluded from reminders.</small></label>
        <label class="field-wide">Notes<textarea name="note" rows="4" maxlength="10000" placeholder="Interview notes, next steps, or context…">${esc(entry.note)}</textarea></label>
      </div>
      <p class="application-error" role="alert" hidden></p>
      <div class="application-save"><span class="meta">Saved locally on your computer.</span><button class="btn primary" type="submit">${creating ? 'Add application' : 'Save application'}</button></div>
    </form>
    ${creating ? '<p class="application-section meta">Save the application first, then open Details to attach the documents you submitted.</p>' : `
    <section class="application-section"><h3>Submitted documents</h3><p class="meta">Keep the exact CV or letter you sent. These copies stay separate from newly generated documents.</p><ul class="attachment-list">${attachmentLinks(entry)}</ul>
      <form class="attachment-form"><label>Document type<select name="kind"><option value="cv">Submitted CV</option><option value="letter">Submitted cover letter</option><option value="other">Other document</option></select></label><label>File<input type="file" name="file" accept=".pdf,.docx,.txt" required /><small>PDF, DOCX or TXT · up to 8 MB each · 20 files per application</small></label><button type="submit" class="btn">Attach document</button><p class="attachment-feedback" role="status" hidden></p></form>
    </section>
    <section class="application-section"><h3>Status history</h3>${entry.statusHistory?.length ? `<ol class="application-history">${[...entry.statusHistory].reverse().map((event) => `<li><strong>${esc(statusLabel(event.to))}</strong><span>${esc(new Date(event.at).toLocaleString())}${event.from ? ` · from ${esc(statusLabel(event.from))}` : ''}</span></li>`).join('')}</ol>` : '<p class="meta">Earlier status changes were not recorded. New changes will appear here.</p>'}</section>`}`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector('.application-form');
  const initialValues = JSON.stringify([...new FormData(form)]);
  let saved = false;
  let busy = false;
  let documentsChanged = false;
  const close = () => {
    if (busy) return;
    if (!saved && JSON.stringify([...new FormData(form)]) !== initialValues && !window.confirm('Discard unsaved application edits?')) return;
    dialog.close();
  };
  dialog.querySelector('[data-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (documentsChanged && !saved) onSaved('Submitted documents saved.');
  });
  const setBusy = (value) => {
    busy = value;
    dialog.querySelectorAll('button[type="submit"], [data-close]').forEach((button) => { button.disabled = value; });
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const error = form.querySelector('.application-error');
    error.hidden = true;
    setBusy(true);
    try {
      const fields = Object.fromEntries(new FormData(form));
      const result = await api('/api/tracker/application', { method: creating ? 'POST' : 'PATCH', body: JSON.stringify({ ...fields, ...(creating ? {} : { id: entry.id }) }) });
      saved = true;
      dialog.close();
      const syncFailed = result.sheets?.ok === false && result.sheets?.error;
      onSaved(`${creating ? 'Added' : 'Saved'} ${fields.company}.${syncFailed ? ' Saved locally; Sheets sync needs attention.' : ''}`, result.entry);
    } catch (err) {
      error.hidden = false;
      error.textContent = `Could not save: ${err.message}. Your edits are still here.`;
    } finally { setBusy(false); }
  });
  dialog.querySelector('.attachment-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const upload = event.currentTarget;
    const feedback = upload.querySelector('.attachment-feedback');
    feedback.hidden = false;
    const file = upload.elements.file.files[0];
    if (!file || !/\.(pdf|docx|txt)$/i.test(file.name) || !file.size || file.size > 8 * 1024 * 1024) { feedback.textContent = 'Choose a PDF, DOCX or TXT file between 1 byte and 8 MB.'; return; }
    setBusy(true);
    feedback.textContent = 'Attaching document…';
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read this file'));
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const result = await api('/api/tracker/attachments', { method: 'POST', body: JSON.stringify({ id: entry.id, name: file.name, kind: upload.elements.kind.value, data }) });
      entry.attachments = [...(entry.attachments || []), result.attachment];
      dialog.querySelector('.attachment-list').innerHTML = attachmentLinks(entry);
      documentsChanged = true;
      upload.elements.file.value = '';
      feedback.textContent = `Attached ${file.name}.`;
    } catch (err) { feedback.textContent = `Could not attach document: ${err.message}`; }
    finally { setBusy(false); }
  });
  dialog.showModal();
}

function attachmentLinks(entry) {
  return entry.attachments?.length ? entry.attachments.map((file) => `<li><a href="/api/tracker/attachments?id=${encodeURIComponent(entry.id)}&attachment=${encodeURIComponent(file.id)}" download>${esc(file.name)}</a><span>${esc({ cv: 'CV', letter: 'Cover letter', other: 'Document' }[file.kind] || 'Document')} · ${Math.max(1, Math.round(file.size / 1024))} KB</span></li>`).join('') : '<li class="meta">No submitted documents attached yet.</li>';
}
