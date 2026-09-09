import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { applicationFields } from '../scripts/lib/application-fields.mjs';
import { recordDecision, patchDecision } from '../scripts/lib/decisions.mjs';
import { addApplicationAttachment, applicationAttachment } from '../scripts/lib/application-attachments.mjs';

export async function handleTrackerApi(req, res, url, { readBody, json, invalidate, sync }) {
  if (!['/api/tracker/application', '/api/tracker/attachments'].includes(url.pathname)) return false;
  try {
    if (url.pathname === '/api/tracker/application' && ['POST', 'PATCH'].includes(req.method)) {
      const body = await readBody(req);
      const creating = req.method === 'POST';
      const fields = applicationFields(body, { creating });
      const entry = creating
        ? (await recordDecision(`manual:application:${randomUUID()}`, fields.decision, fields.note, { application: { ...fields, board: 'manual', source: 'manual' } })).entry
        : await patchDecision(body.id, fields);
      invalidate();
      const sheets = await sync(entry).catch((err) => ({ ok: false, error: err.message }));
      json(res, creating ? 201 : 200, { ok: true, entry, sheets });
    } else if (url.pathname === '/api/tracker/attachments' && req.method === 'POST') {
      const body = await readBody(req, 12 * 1024 * 1024);
      const attachment = await addApplicationAttachment(body.id, body);
      invalidate();
      json(res, 201, { ok: true, attachment });
    } else if (url.pathname === '/api/tracker/attachments' && req.method === 'GET') {
      const file = await applicationAttachment(url.searchParams.get('id'), url.searchParams.get('attachment'));
      const info = await stat(file.path);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      createReadStream(file.path).on('error', () => res.destroy()).pipe(res);
    } else json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    json(res, err.code === 'ENOENT' || /not found|No decision/.test(err.message) ? 404 : 400, { error: err.message });
  }
  return true;
}
