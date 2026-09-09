/**
 * Recruiter-contact HTTP routes. Used by web/server.mjs and the sidecar
 * (so the UI can call them without restarting a running Job Scout server).
 */

import {
  getRecruiterContact,
  loadJobRecord,
  recruiterRunSnapshot,
  saveRecruiterContact,
  startRecruiterJob,
  stopRecruiterJob,
} from '../scripts/lib/recruiter-contact.mjs';

export async function handleRecruiterApi(req, res, url, { json, readBody }) {
  const path = url.pathname;
  if (!path.startsWith('/api/recruiter-contact')) return false;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return true;
  }

  if (req.method === 'GET' && path === '/api/recruiter-contact/status') {
    json(res, 200, { ok: true, ...recruiterRunSnapshot() });
    return true;
  }

  if (req.method === 'GET' && path === '/api/recruiter-contact') {
    const id = (url.searchParams.get('id') || '').trim();
    if (!id) {
      json(res, 400, { error: 'id is required' });
      return true;
    }
    const contact = await getRecruiterContact(id);
    json(res, 200, {
      contact,
      run: recruiterRunSnapshot(),
    });
    return true;
  }

  if (req.method === 'POST' && path === '/api/recruiter-contact/stop') {
    json(res, 200, await stopRecruiterJob());
    return true;
  }

  if (req.method === 'POST' && path === '/api/recruiter-contact') {
    try {
      const body = await readBody(req);
      const id = String(body.id || '').trim();
      if (!id) {
        json(res, 400, { error: 'id is required' });
        return true;
      }
      const mode = body.mode === 'agent' ? 'agent' : 'lookup';
      const started = await startRecruiterJob(id, mode);
      json(res, 200, started);
    } catch (err) {
      const status = err.code === 'BUSY' ? 409 : 400;
      json(res, status, { error: err.message || 'Lookup failed' });
    }
    return true;
  }

  if (req.method === 'PATCH' && path === '/api/recruiter-contact') {
    try {
      const body = await readBody(req);
      const id = String(body.id || '').trim();
      if (!id) {
        json(res, 400, { error: 'id is required' });
        return true;
      }
      const job = await loadJobRecord(id);
      const contact = await saveRecruiterContact(id, {
        name: body.name,
        role: body.role,
        email: body.email,
        linkedinUrl: body.linkedinUrl,
        notes: body.notes,
        sources: [{ kind: 'manual', note: 'Saved from the popup' }],
      }, job || { id }, { replace: true });
      json(res, 200, { ok: true, contact });
    } catch (err) {
      json(res, 400, { error: err.message || 'Save failed' });
    }
    return true;
  }

  json(res, 404, { error: 'Not found' });
  return true;
}
