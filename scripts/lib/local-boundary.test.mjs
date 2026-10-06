import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { enforceLocalBoundary, localRequestError } from '../../web/local-boundary.mjs';

test('all local endpoints reject remote, rebound hosts and unapproved browser origins', async t => {
  const server = createServer((req, res) => {
    if (enforceLocalBoundary(req, res)) res.end(JSON.stringify({ name: 'Fictional Candidate' }));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => server.close());
  const port = server.address().port;
  const get = (headers = {}, method = 'GET') => new Promise(resolve => {
    request({ host: '127.0.0.1', port, path: '/api/apply-assist/latest', method, headers }, res => {
      let body = ''; res.on('data', b => body += b); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).end();
  });
  assert.equal((await get()).status, 200);
  assert.equal((await get({ origin: `http://127.0.0.1:${port}` })).status, 200);
  for (const headers of [{ host: `evil.example:${port}` }, { origin: 'https://evil.example' },
    { origin: 'null' }, { origin: `http://localhost:${port + 1}` }, { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' }]) {
    const result = await get(headers);
    assert.equal(result.status, 403); assert.doesNotMatch(result.body, /Fictional/);
    assert.equal(result.headers['access-control-allow-origin'], undefined);
  }
  assert.equal((await get({ 'content-type': 'text/plain' }, 'POST')).status, 403);
  assert.equal((await get({ 'content-type': 'application/json' }, 'POST')).status, 200);
  assert.match(localRequestError({ socket: { remoteAddress: '192.0.2.1' } }), /Loopback/);
});
