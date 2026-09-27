export function createMemoryEditor({ api, onSaved = () => {} }) {
  const el = (id) => document.getElementById(id);
  let pending = null;
  let loaded = null;
  let editVersion = 0;
  const sections = () => Object.fromEntries(['facts', 'preferences', 'answers'].map((key) => [key, JSON.parse(el(`memory-${key}`).value)]));
  const message = (text) => { el('memoryMessage').textContent = text; };
  function discardPreview() {
    editVersion += 1;
    pending = null; el('memoryConfirm').disabled = true; el('memoryPreview').hidden = true;
  }
  function render(memory) {
    loaded = memory; discardPreview();
    el('memoryFields').hidden = !memory;
    if (!memory) { message('Complete setup, or run npm run memory:migrate for an older installation.'); return; }
    message(`Local memory · revision ${memory.revision}. Changes stay on this computer and are excluded from Git.`);
    for (const key of ['facts', 'preferences', 'answers']) el(`memory-${key}`).value = JSON.stringify(memory[key], null, 2);
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
  el('memoryPreviewBtn').addEventListener('click', async () => {
    discardPreview();
    const version = editVersion;
    try {
      const data = sections();
      const preview = await api('/api/memory/preview', { method: 'POST', body: JSON.stringify(data) });
      if (version !== editVersion) return;
      pending = { ...data, confirmation: preview.confirmation };
      el('memoryPreview').hidden = false;
      const get = (obj, path) => path.split('.').reduce((v, key) => v?.[key], obj);
      el('memoryChanges').textContent = preview.changes.length ? preview.changes.map((path) =>
        `${path}\nBefore: ${JSON.stringify(get(preview.before, path), null, 2)}\nAfter: ${JSON.stringify(get(preview.after, path), null, 2)}`).join('\n\n') : 'No changes.';
      el('memoryConfirm').disabled = !preview.changes.length;
      message(preview.changes.length ? 'Review the changes below, then confirm to save.' : 'No changes to save.');
    } catch (error) { message(`Cannot preview: ${error.message}`); }
  });
  el('memoryConfirm').addEventListener('click', async () => {
    if (!pending) return;
    const submitted = pending;
    const version = editVersion;
    el('memoryConfirm').disabled = true;
    try {
      const result = await api('/api/memory', { method: 'PUT', body: JSON.stringify(submitted) });
      if (version === editVersion) render(result.memory);
      else { loaded = result.memory; discardPreview(); }
      message(`Saved revision ${result.memory.revision}. Future runs use the updated memory; affected documents become outdated. Any newer edits still need previewing.`);
      await onSaved();
    } catch (error) { discardPreview(); message(error.message); }
  });
  return { refresh };
}
