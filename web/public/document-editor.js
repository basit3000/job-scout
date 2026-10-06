export function openDocumentEditor(job) {
  const dialog = document.createElement('dialog'); dialog.className = 'document-editor-dialog';
  dialog.innerHTML = `<h2>Edit prepared document</h2><p>Accepted files remain available until this edit passes rendering and renewed review.</p>
    <label>Document <select id="editScope"><option value="cv">CV</option><option value="letter">Cover letter</option></select></label>
    <label>Format <select id="editTemplate"></select></label><button id="editLoad">Load document</button>
    <textarea id="editText" rows="10" aria-label="Document text"></textarea>
    <label>AI change request <input id="editInstruction"></label><button id="editPropose">Propose changes with Goose</button>
    <pre id="editDiff"></pre><button id="editAccept" hidden>Accept proposed text</button><button id="editReject" hidden>Reject proposal</button>
    <button id="editPreview">Preview</button><iframe id="editFrame" title="Document preview" sandbox=""></iframe>
    <p id="editStatus" role="status"></p><button id="editApply">Render and review edited draft</button><button id="editStop">Stop review</button><button id="editClose">Close</button>`;
  document.body.append(dialog); dialog.showModal();
  const el = id => dialog.querySelector('#' + id); let base, proposal, loadedKey;
  const request = async (path, body) => { const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const value = await response.json(); if (!response.ok) throw new Error(value.error); return value; };
  const payload = action => ({ id: job.id, scope: el('editScope').value, template: el('editTemplate').value, action, base, text: el('editText').value, instruction: el('editInstruction').value });
  const status = text => el('editStatus').textContent = text;
  const run = fn => async () => { try { await fn(); } catch (error) { status(error.message); } };
  const load = async () => {
    const p = payload('read'); const result = await request('/api/document-editor?' + new URLSearchParams({ id: job.id, scope: p.scope, template: p.template }));
    base = result.base; loadedKey = p.scope + p.template; el('editText').value = result.text; status('Loaded. Edits need a new review.');
  };
  el('editLoad').onclick = run(load);
  const action = kind => run(async () => {
    const p = payload(kind); if (loadedKey !== p.scope + p.template) throw new Error('Load the selected document first.');
    status(kind === 'apply' ? 'Rendering and reviewing with Goose…' : 'Preparing preview…');
    const result = await request('/api/document-editor', p);
    if (result.html) el('editFrame').srcdoc = result.html;
    el('editDiff').textContent = ['Removed lines:', ...(result.changes?.removed || []).map(line => `− ${line}`), '\nAdded lines:', ...(result.changes?.added || []).map(line => `+ ${line}`)].join('\n');
    if (kind === 'propose') { proposal = result.text; el('editAccept').hidden = el('editReject').hidden = false; status('AI proposal. Review the removed and added lines, then accept or reject.'); }
    else status(result.message || 'Preview only; no accepted documents changed.');
  });
  el('editPropose').onclick = action('propose'); el('editPreview').onclick = action('preview'); el('editApply').onclick = action('apply');
  el('editAccept').onclick = () => { el('editText').value = proposal; proposal = null; el('editAccept').hidden = el('editReject').hidden = true; status('Proposal accepted into draft. Render and review to apply.'); };
  el('editReject').onclick = () => { proposal = null; el('editAccept').hidden = el('editReject').hidden = true; status('Proposal rejected.'); };
  el('editStop').onclick = run(async () => { await request('/api/document-editor/stop', { id: job.id }); status('Cancellation requested.'); });
  el('editClose').onclick = () => { dialog.close(); dialog.remove(); };
  run(async () => { const { templates } = await request('/api/cv-templates'); for (const template of templates) { const option = new Option(template.name, template.id); el('editTemplate').append(option); } })();
}
