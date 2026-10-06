import { editDocument } from '../scripts/lib/document-edit.mjs';
const active = new Map();
export async function handleDocumentEdit(req, res, url, { json, readBody, jobs, busy, invalidate }) {
  if (!['/api/document-editor', '/api/document-editor/stop'].includes(url.pathname)) return false;
  if (!['GET', 'POST'].includes(req.method) || (url.pathname.endsWith('/stop') && req.method !== 'POST')) {
    json(res, 405, { error: 'Use GET to read documents and POST for editing actions.' }); return true;
  }
  try {
    const body = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await readBody(req);
    if (url.pathname === '/api/document-editor/stop') {
      active.get(body.id)?.abort(); json(res, 200, { ok: true }); return true;
    }
    const job = (await jobs()).find(job => job.id === body.id);
    if (!job) throw new Error('Job not found');
    if (busy() || active.has(job.id)) throw new Error('Wait for the active preparation or edit review.');
    const controller = new AbortController(); active.set(job.id, controller);
    try { json(res, 200, await editDocument({ ...body, action: req.method === 'GET' ? 'read' : body.action, job, signal: controller.signal })); invalidate(); }
    finally { active.delete(job.id); }
  } catch (error) { json(res, 400, { error: error.message }); }
  return true;
}
