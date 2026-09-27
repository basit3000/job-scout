import { readMemory, previewMemory, confirmMemory } from '../scripts/lib/memory.mjs';

export async function handleMemoryApi(req, res, url, { json, readBody, root, busy = () => false, invalidate = () => {} }) {
  if (!['/api/memory', '/api/memory/preview'].includes(url.pathname)) return false;
  let sameOrigin = true;
  try { if (req.headers.origin) sameOrigin = new URL(req.headers.origin).host === req.headers.host; }
  catch { sameOrigin = false; }
  if (!sameOrigin) {
    json(res, 403, { error: 'Memory is available only from this app.' }); return true;
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/memory') {
      json(res, 200, { memory: await readMemory(root) }); return true;
    }
    if (busy()) { json(res, 409, { error: 'Wait for the active search or preparation to finish before changing memory.' }); return true; }
    const body = await readBody(req);
    if (req.method === 'POST' && url.pathname === '/api/memory/preview') {
      const memory = await readMemory(root);
      const preview = previewMemory(memory, body);
      json(res, 200, { changes: preview.changes, confirmation: preview.confirmation,
        before: { facts: memory.facts, preferences: memory.preferences, answers: memory.answers },
        after: { facts: preview.proposed.facts, preferences: preview.proposed.preferences, answers: preview.proposed.answers } }); return true;
    }
    if (req.method === 'PUT' && url.pathname === '/api/memory') {
      if (typeof body.confirmation !== 'string') throw new Error('Preview your changes before saving.');
      const memory = await confirmMemory(body, body.confirmation, { root }); invalidate(); json(res, 200, { memory }); return true;
    }
    json(res, 405, { error: 'Method not allowed' });
  } catch (error) { json(res, 400, { error: error.message }); }
  return true;
}
