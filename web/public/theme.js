// Run before styles load so a saved dark theme is applied on the first paint.
(() => {
  const key = 'job-scout-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const readPreference = () => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* Storage can be unavailable in private or restricted browsers. */ }
    return 'system';
  };
  let preference = readPreference();

  function applyTheme() {
    document.documentElement.dataset.theme = preference === 'system'
      ? (system.matches ? 'dark' : 'light') : preference;
    const select = document.getElementById('themeSelect');
    if (select) select.value = preference;
  }

  applyTheme();
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('themeSelect');
    applyTheme();
    select.addEventListener('change', () => {
      preference = select.value;
      try {
        if (preference === 'system') localStorage.removeItem(key);
        else localStorage.setItem(key, preference);
      } catch { /* Keep the selection for this visit when storage is blocked. */ }
      applyTheme();
    });
  });
  system.addEventListener('change', () => {
    if (preference === 'system') applyTheme();
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = readPreference();
      applyTheme();
    }
  });
})();
