export const CUSTOM_MODEL = '__custom_model__';

export function createModelPicker({ select, provider, customInput, hint, refreshButton, fetchCatalog, saveModel, onError }) {
  let generation = 0;
  let displayedProvider = '';
  let catalog = null;
  const option = (value, label, title = '') => {
    const el = select.ownerDocument.createElement('option');
    el.value = value;
    el.textContent = label;
    el.title = title;
    return el;
  };
  const showHint = () => {
    const description = catalog?.models?.find((m) => m.id === select.value)?.description || '';
    const warning = catalog?.error
      ? `${catalog.source === 'stale' ? 'Showing previously loaded models. ' : ''}${catalog.error}` : '';
    hint.textContent = warning || description || `${Math.max(0, select.options.length - 2)} models from ${provider.options[provider.selectedIndex]?.textContent || provider.value}.`;
  };
  function invalidate() {
    generation += 1;
    select.disabled = true;
    customInput.hidden = true;
    refreshButton.disabled = true;
    hint.textContent = 'Loading models…';
  }
  async function load(prov = provider.value, selected, { refresh = false } = {}) {
    if (prov !== provider.value) return;
    const previous = displayedProvider === prov && select.value !== CUSTOM_MODEL ? select.value : '';
    invalidate();
    const version = generation;
    const current = () => generation === version && provider.value === prov;
    let data;
    try {
      data = await fetchCatalog(prov, refresh);
    } catch (error) {
      data = { models: [], source: 'unavailable', error: `Could not load models: ${error.message}` };
    }
    if (!current()) return;
    catalog = data;
    displayedProvider = prov;
    const value = selected ?? (data.selectedProvider === prov ? data.selected : previous) ?? '';
    const models = data.models || [];
    const options = models.map((m) => option(m.id ?? '', m.displayName || m.id || 'Configured default', m.description));
    if (!models.some((m) => m.id === '')) options.unshift(option('', 'Configured default'));
    if (value && !models.some((m) => m.id === value)) options.push(option(value, `${value} (saved; not listed)`));
    options.push(option(CUSTOM_MODEL, 'Custom model…'));
    select.replaceChildren(...options);
    select.value = value;
    select.disabled = false;
    refreshButton.disabled = false;
    showHint();
    if (data.availability?.detail) provider.title = data.availability.detail;
  }
  async function persist(value) {
    const prov = provider.value;
    if (value && !/^[a-zA-Z0-9][a-zA-Z0-9._+:/\[\]-]{0,159}$/.test(value)) {
      onError(new Error('Enter a model ID without spaces or shell characters.'));
      return;
    }
    try {
      await saveModel(prov, value);
      if (provider.value === prov) await load(prov, value);
    } catch (error) { onError(error); }
  }
  select.addEventListener('change', () => {
    const custom = select.value === CUSTOM_MODEL;
    customInput.hidden = !custom;
    if (custom) {
      customInput.value = '';
      customInput.focus();
      hint.textContent = 'Enter an exact model ID supported by this provider, then press Enter.';
    } else {
      showHint();
      void persist(select.value);
    }
  });
  customInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const value = customInput.value.trim();
    if (value) void persist(value);
  });
  refreshButton.addEventListener('click', () => {
    void load(provider.value, select.value === CUSTOM_MODEL ? '' : select.value, { refresh: true });
  });
  return { load, invalidate };
}
