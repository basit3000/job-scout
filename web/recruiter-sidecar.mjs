#!/usr/bin/env node
// Sidecar for recruiter-contact APIs. Lets the UI pick up the feature while
// web/server.mjs is already running (do not restart that process).
//
//   node web/recruiter-sidecar.mjs
//   → http://127.0.0.1:4051/api/recruiter-contact/status

import { createServer } from 'node:http';
import { loadDotEnv } from '../scripts/lib/common.mjs';
import { handleRecruiterApi } from './recruiter-routes.mjs';

loadDotEnv();

const PORT = Number(process.env.RECRUITER_API_PORT || 4051);
const HOST = '127.0.0.1';

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const handled = await handleRecruiterApi(req, res, url, { json, readBody });
    if (!handled) json(res, 404, { error: 'Not found' });
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: err.message || String(err) });
    else res.end();
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Recruiter API already running on ${HOST}:${PORT}`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`Recruiter API → http://${HOST}:${PORT}`);
});
