import { interviewPreparation, applicationEmail } from '../scripts/lib/preparation-extras.mjs';
const active = new Map();
export async function handlePreparationExtras(req, res, url, { json, readBody, jobs, busy }) {
  if (!['/api/interview', '/api/interview/stop', '/api/application-email'].includes(url.pathname)) return false;
  if (!['GET', 'POST'].includes(req.method) || (url.pathname !== '/api/interview' && req.method !== 'POST')) {
    json(res, 405, { error: 'Use GET to read interview preparation and POST for other actions.' }); return true;
  }
  try {
    const body = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await readBody(req);
    if (url.pathname === '/api/interview/stop') { active.get(body.id)?.abort(); json(res, 200, { ok: true }); return true; }
    if (busy() || active.has(body.id)) throw new Error('Wait for active document preparation.');
    const job = (await jobs()).find(job => job.id === body.id); if (!job) throw new Error('Job not found');
    const controller = new AbortController(); active.set(job.id, controller);
    try {
      const result = url.pathname === '/api/interview'
        ? await interviewPreparation(job, { ...body, generate: req.method === 'POST', signal: controller.signal })
        : await applicationEmail(job, body);
      json(res, 200, result);
    } finally { active.delete(job.id); }
  } catch (error) { json(res, 400, { error: error.message }); }
  return true;
}
