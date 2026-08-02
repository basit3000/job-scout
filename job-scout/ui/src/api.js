async function request(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  state: () => request('/api/state'),
  markets: () => request('/api/markets'),
  saveProfile: (body) =>
    request('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  setMarket: (market) =>
    request('/api/market', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ market }),
    }),
  uploadCvFile: async (file) => {
    const fd = new FormData();
    fd.append('cv', file);
    return request('/api/cv', { method: 'POST', body: fd });
  },
  uploadCvText: (text) =>
    request('/api/cv', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
  scout: (body) =>
    request('/api/scout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  decision: (id, decision, note = '') =>
    request('/api/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, decision, note }),
    }),
};
