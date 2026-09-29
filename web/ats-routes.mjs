import { inspectAtsPdf } from '../scripts/lib/ats-check.mjs';

export async function handleAtsApi(req, res, url, { json, readBody }) {
  if (url.pathname !== '/api/ats-check') return false;
  try {
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
      json(res, 403, { error: 'Open the ATS checker from this app.' }); return true;
    }
    if (req.method !== 'POST') { json(res, 405, { error: 'Use POST.' }); return true; }
    const body = await readBody(req, 15 * 1024 * 1024);
    if (typeof body.pdf !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.pdf)) throw new Error('Choose a PDF to check.');
    const result = await inspectAtsPdf(Buffer.from(body.pdf, 'base64'), body.keywords || []);
    json(res, 200, result);
  } catch (error) { json(res, 400, { error: error.message }); }
  return true;
}
