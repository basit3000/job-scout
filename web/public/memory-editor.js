import { renderStructuredMemory, memoryFieldLabel } from './structured-memory.js';
export function createMemoryEditor({ api, onSaved = () => {} }) {
  const el = (id) => document.getElementById(id);
  let pending = null;
  let loaded = null;
  let editVersion = 0;
  let previewing = false;
  let saving = false;
  let saveError = '';
  const sections = () => Object.fromEntries(['facts', 'preferences', 'answers'].map((key) => [key, JSON.parse(el(`memory-${key}`).value)]));
  const message = (text) => { el('memoryMessage').textContent = text; };
  const dirty = () => loaded && ['facts', 'preferences', 'answers'].some(key => el(`memory-${key}`).value !== JSON.stringify(loaded[key], null, 2));
  function updateActions() {
    const changed = dirty();
    el('memoryPreviewBtn').disabled = !changed || previewing || saving;
    el('memoryPreviewBtn').textContent = previewing ? 'Preparing review…' : 'Save changes';
    el('memoryReset').disabled = !changed || saving;
    el('memoryDraftStatus').textContent = saving ? 'Saving changes…' : changed ? 'Unsaved changes' : 'All changes saved';
    el('memoryDraftStatus').dataset.dirty = String(Boolean(changed));
    el('memorySaveHint').textContent = saveError || (changed ? 'Save changes opens a review before anything is applied.' : 'Edit any field, then save and review your changes.');
  }
  function closeReview() {
    if (el('memoryPreview').open) el('memoryPreview').close();
    el('memoryPreview').hidden = true;
  }
  const structured = () => renderStructuredMemory(el('memoryStructured'), sections(), values => {
    for (const key of ['facts', 'preferences', 'answers']) el(`memory-${key}`).value = JSON.stringify(values[key], null, 2);
    discardPreview();
  });
  function discardPreview() {
    editVersion += 1;
    saveError = '';
    pending = null; el('memoryConfirm').disabled = true; closeReview();
    updateActions();
  }
  function render(memory) {
    loaded = memory; discardPreview();
    el('memoryFields').hidden = !memory;
    if (!memory) { message('Complete setup, or run npm run memory:migrate for an older installation.'); return; }
    message(`Local memory · revision ${memory.revision}. Changes stay on this computer and are excluded from Git.`);
    for (const key of ['facts', 'preferences', 'answers']) el(`memory-${key}`).value = JSON.stringify(memory[key], null, 2);
    structured();
    updateActions();
    const conflicts = memory.migration?.conflicts || [];
    el('memoryConflicts').hidden = !conflicts.length;
    el('memoryConflictText').textContent = JSON.stringify(conflicts, null, 2);
    el('memorySources').textContent = (memory.migration?.sources || []).map((s) => `${s.path}: ${s.disposition}`).join('\n');
    el('memoryReferences').textContent = memory.migration?.referencesArchive ? `Archived reference material: ${memory.migration.referencesArchive}` : JSON.stringify(memory.migration?.reviewSources || [], null, 2);
  }
  async function refresh() {
    // Keep unsaved edits when changing tabs.
    if (loaded && ['facts', 'preferences', 'answers'].some((key) => el(`memory-${key}`).value !== JSON.stringify(loaded[key], null, 2))) return;
    const version = editVersion;
    try { const result = await api('/api/memory'); if (version === editVersion) render(result.memory); } catch (error) { message(error.message); }
  }
  for (const key of ['facts', 'preferences', 'answers']) el(`memory-${key}`).addEventListener('input', discardPreview);
  el('memoryReset').addEventListener('click', () => {
    if (loaded && window.confirm('Discard your unsaved Memory edits?')) render(loaded);
  });
  el('memoryBack').addEventListener('click', discardPreview);
  el('memoryPreview').addEventListener('cancel', event => {
    event.preventDefault();
    if (!saving) discardPreview();
  });
  el('memoryRefreshForms').addEventListener('click', () => { try { structured(); } catch (error) { message(error.message); } });
  el('memoryImport').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Choose a file up to 8 MB.');
      const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = await api('/api/memory/import', { method: 'POST', body: JSON.stringify({ filename: file.name, base64 }) });
      const box = el('memoryImportProposals'); box.replaceChildren();
      const warning = document.createElement('p'); warning.textContent = result.warnings.join(' '); box.append(warning);
      for (const proposal of result.proposals) {
        const row = document.createElement('details'); const summary = document.createElement('summary');
        summary.textContent = `${proposal.path}: ${proposal.conflict ? 'CONFLICT' : 'proposed'}${proposal.uncertain ? ' — extraction needs review' : ''}`;
        const pre = document.createElement('pre'); pre.textContent = `Before: ${proposal.before ?? '(unknown)'}\nProposed: ${proposal.value}\n${proposal.reason}`;
        const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = 'Use in draft (not saved)';
        accept.onclick = () => {
          const draft = sections(), parts = proposal.path.split('.'); let node = draft;
          for (const part of parts.slice(0, -1)) node = node[part] ||= {};
          node[parts.at(-1)] = proposal.value;
          for (const key of ['facts', 'preferences', 'answers']) el(`memory-${key}`).value = JSON.stringify(draft[key], null, 2);
          discardPreview(); structured(); accept.disabled = true;
        };
        row.append(summary, pre, accept); box.append(row);
      }
      message('Review the import suggestions, add chosen fields to your draft, then choose Save changes.');
    } catch (error) { message(error.message); }
  });
  el('memoryPreviewBtn').addEventListener('click', async () => {
    if (previewing || saving) return;
    discardPreview();
    const version = editVersion;
    previewing = true; updateActions();
    try {
      const data = sections();
      const preview = await api('/api/memory/preview', { method: 'POST', body: JSON.stringify(data) });
      if (version !== editVersion) return;
      pending = { ...data, confirmation: preview.confirmation };
      el('memoryPreview').hidden = false;
      renderChanges(preview);
      el('memoryConfirm').disabled = !preview.changes.length;
      el('memoryReviewSummary').textContent = preview.changes.length ? `${preview.changes.length} changed ${preview.changes.length === 1 ? 'field' : 'fields'}. Confirm to save these details locally.` : 'Your draft matches the saved Memory. Nothing needs saving.';
      el('memoryReviewError').hidden = true;
      el('memoryPreview').showModal();
      el('memoryBack').focus();
    } catch (error) { saveError = `Could not prepare changes: ${error.message}. Your draft is still here.`; message(saveError); }
    finally { previewing = false; updateActions(); }
  });
  el('memoryConfirm').addEventListener('click', async () => {
    if (!pending || saving) return;
    const submitted = pending;
    const version = editVersion;
    saving = true; updateActions();
    el('memoryConfirm').disabled = true; el('memoryConfirm').textContent = 'Saving…'; el('memoryBack').disabled = true;
    el('memoryReviewError').hidden = true;
    try {
      const result = await api('/api/memory', { method: 'PUT', body: JSON.stringify(submitted) });
      if (version === editVersion) render(result.memory);
      else { loaded = result.memory; discardPreview(); }
      message(`Saved revision ${result.memory.revision}. ${dirty() ? 'Your newer edits still need saving.' : 'Your changes are saved. Future applications use these details.'}`);
      await Promise.resolve().then(onSaved).catch(() => {});
    } catch (error) {
      pending = null;
      el('memoryReviewError').textContent = `Could not save: ${error.message}. Go back to editing and choose Save changes to review again. Your draft has been kept.`;
      el('memoryReviewError').hidden = false;
    } finally {
      saving = false; updateActions(); el('memoryConfirm').textContent = 'Confirm and save'; el('memoryBack').disabled = false;
    }
  });
  function renderChanges(preview) {
    const get = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);
    const format = value => {
      if (value === undefined || value === null || value === '') return 'Not provided';
      if (Array.isArray(value)) return value.length ? value.map(format).join('\n\n') : 'Not provided';
      if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${memoryFieldLabel(key)}: ${format(item)}`).join('\n');
      return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
    };
    el('memoryChanges').replaceChildren();
    for (const path of preview.changes) {
      const card = document.createElement('section'); card.className = 'memory-change';
      const heading = document.createElement('h3'); heading.textContent = path.split('.').map(memoryFieldLabel).join(' / '); card.append(heading);
      const values = document.createElement('div'); values.className = 'memory-change-values';
      for (const [label, object] of [['Currently saved', preview.before], ['Your change', preview.after]]) {
        const column = document.createElement('div'), caption = document.createElement('strong'), content = document.createElement('p');
        caption.textContent = label; content.textContent = format(get(object, path)); column.append(caption, content); values.append(column);
      }
      card.append(values); el('memoryChanges').append(card);
    }
  }
  return { refresh };
}
