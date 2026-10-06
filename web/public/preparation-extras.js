export function openPreparationExtras(job) {
  const dialog = document.createElement('dialog'); dialog.className = 'document-editor-dialog';
  dialog.innerHTML = `<h2>Interview preparation and application email</h2><label>Reviewed CV format <select id="extraTemplate"></select></label>
    <h3>Interview preparation</h3><button id="interviewRead">Load saved preparation</button><button id="interviewGenerate">Generate with Goose</button><button id="interviewStop">Stop</button><pre id="interviewContent"></pre>
    <h3>Email draft</h3><label><input type="checkbox" id="emailLetter">Attach reviewed cover letter</label><button id="emailLoad">Load draft</button>
    <label>Recipient (leave unknown blank)<input id="emailRecipient" type="email"></label><label>Subject<input id="emailSubject"></label><label>Body<textarea id="emailBody" rows="10"></textarea></label>
    <button id="emailPreview">Preview selected versions</button><pre id="emailAttachments"></pre>
    <label><input type="checkbox" id="emailReviewed">I reviewed recipient, subject, body and attachments</label>
    <button id="emailExport">Export .eml</button><button id="emailGmail" disabled>Create Gmail draft</button>
    <p>Nothing is sent automatically. Gmail requires an explicitly configured connection and this separate action.</p><p id="extraStatus" role="status"></p><button id="extraClose">Close</button>`;
  document.body.append(dialog); dialog.showModal();
  const el = id => dialog.querySelector('#' + id); let confirmation;
  const request = async (path, body) => { const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; };
  const run = fn => async () => { try { await fn(); } catch (error) { el('extraStatus').textContent = error.message; } };
  const selected = () => ({ id: job.id, template: el('extraTemplate').value, includeLetter: el('emailLetter').checked });
  const draft = () => ({ recipient: el('emailRecipient').value, subject: el('emailSubject').value, body: el('emailBody').value });
  for (const id of ['extraTemplate','emailLetter','emailRecipient','emailSubject','emailBody']) el(id).oninput = () => { confirmation = null; el('emailReviewed').checked = false; };
  const interview = generate => run(async () => {
    el('extraStatus').textContent = generate ? 'Generating suggested preparation with Goose…' : 'Loading…';
    const result = await request(generate ? '/api/interview' : '/api/interview?' + new URLSearchParams({ id: job.id, template: selected().template }), generate ? selected() : undefined);
    const prep = result.preparation;
    el('interviewContent').textContent = prep ? [
      'Likely questions', ...(prep.questions || []).map(item => `• ${item}`),
      '\nConfirmed experience to draw on', ...(prep.examples || []).map(item => `${item.supportedQuote}\nEvidence: ${item.evidenceId}\nPreparation prompt: ${item.preparationQuestion}\n`),
      '\nSuggested knowledge gaps', ...(prep.knowledgeGaps || []).map(item => `• ${item}`),
      '\nMatching gaps', ...(prep.deterministicGaps || []).map(item => `• ${item}`),
      '\nQuestions for the employer', ...(prep.employerQuestions || []).map(item => `• ${item}`),
      '\n' + (prep.notice || ''),
    ].join('\n') : 'No saved preparation. Generate it using the selected reviewed CV.';
    el('extraStatus').textContent = result.stale ? 'Outdated preparation: regenerate using current reviewed documents.' : 'Evidence quotations and suggested preparation are separate.';
  });
  el('interviewRead').onclick = interview(false); el('interviewGenerate').onclick = interview(true);
  el('interviewStop').onclick = run(async () => request('/api/interview/stop', { id: job.id }));
  const preview = async initial => {
    const result = await request('/api/application-email', { ...selected(), action: 'preview', ...(initial ? {} : { draft: draft() }) });
    el('emailRecipient').value = result.draft.recipient; el('emailSubject').value = result.draft.subject; el('emailBody').value = result.draft.body;
    confirmation = result.confirmation; el('emailAttachments').textContent = result.attachments.map(file => `${file.filename} · ${Math.ceil(file.size / 1024)} KB · reviewed version ${file.hash.slice(0, 12)}`).join('\n'); el('emailGmail').disabled = !result.gmailConfigured;
    el('emailReviewed').checked = false; el('extraStatus').textContent = 'Review the fields and exact attachment versions, then check the review box.';
  };
  el('emailLoad').onclick = run(() => preview(true)); el('emailPreview').onclick = run(() => preview(false));
  const exportDraft = action => run(async () => {
    if (!confirmation || !el('emailReviewed').checked) throw new Error('Preview and review the draft first.');
    const result = await request('/api/application-email', { ...selected(), draft: draft(), action, confirmation, reviewed: true, gmailConsent: action === 'gmail' });
    if (result.eml) {
      const url = URL.createObjectURL(new Blob([result.eml], { type: 'message/rfc822' })); const link = document.createElement('a'); link.href = url; link.download = 'application-draft.eml'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      el('extraStatus').textContent = 'Exported local draft with reviewed attachments. Nothing was sent.';
    } else el('extraStatus').textContent = 'Gmail draft created. Review it in Gmail; nothing was sent.';
  });
  el('emailExport').onclick = exportDraft('export'); el('emailGmail').onclick = exportDraft('gmail');
  el('extraClose').onclick = () => dialog.remove();
  run(async () => { const { templates } = await request('/api/cv-templates'); for (const template of templates) el('extraTemplate').append(new Option(template.name, template.id)); })();
}
