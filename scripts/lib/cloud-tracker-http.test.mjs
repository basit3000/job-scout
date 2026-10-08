import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleCloudTrackerApi } from '../../web/cloud-tracker-routes.mjs';
import { enforceLocalBoundary } from '../../web/local-boundary.mjs';
import { cloudStatePath, CloudTracker } from './cloud-tracker.mjs';

test('HTTP connection keeps credentials server-side, rejects cross-origin access and reconnects safely', { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'scout-cloud-http-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let revoked = false, redirect = false;
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const remote = createServer((req, res) => {
    req.resume();
    if (redirect) { res.writeHead(302, { Location: 'https://elsewhere.example.com' }); res.end(); return; }
    if (req.url === '/api/v1/pairings') return json(res, 200, { pairingId: 'fictional-pair', pairingSecret: 'fictional-secret', userCode: 'CODE-TEST', approvalPath: '/integrations' });
    if (req.url === '/api/v1/pairings/redeem') { revoked = false; return json(res, 200, { token: 'fictional-token', deviceId: 'fictional-device', optionalFields: [] }); }
    assert.equal(req.headers.authorization, 'Bearer fictional-token');
    if (revoked) return json(res, 401, { error: { code: 'unauthorized' } });
    return json(res, 200, { entries: [], cursor: 'cursor', changesCursor: 'cursor', hasMore: false });
  });
  await new Promise(done => remote.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => remote.close(done)));
  const origin = `http://127.0.0.1:${remote.address().port}`;
  const local = createServer(async (req, res) => {
    if (!enforceLocalBoundary(req, res)) return;
    await handleCloudTrackerApi(req, res, new URL(req.url, 'http://fixture'), {
      root, allowLoopbackHttp: true, json, invalidate() {},
      readBody: async request => { let body = ''; for await (const chunk of request) body += chunk; return JSON.parse(body); },
    });
  });
  await new Promise(done => local.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => local.close(done)));
  const base = `http://127.0.0.1:${local.address().port}/api/cloud-tracker`;
  const post = (path, body = {}, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await (await fetch(base)).json()).configured, false);
  assert.equal((await post('/pair', { origin }, { Origin: 'https://untrusted.example.com' })).status, 403);
  assert.equal((await fetch(base, { headers: { 'Sec-Fetch-Site': 'same-site' } })).status, 403);
  const wrongHostStatus = await new Promise((done, reject) => {
    get(base, { headers: { Host: 'untrusted.example.com' } }, response => { response.resume(); done(response.statusCode); }).on('error', reject);
  });
  assert.equal(wrongHostStatus, 403);
  assert.equal((await fetch(base + '/pair', { method: 'POST', body: '{}' })).status, 403);
  const pairing = await (await post('/pair', { origin })).json();
  assert.equal(pairing.userCode, 'CODE-TEST'); assert.equal(pairing.pairingSecret, undefined);
  const status = await (await post('/redeem')).json(); assert.equal(status.paired, true);
  assert.ok(!JSON.stringify(status).includes('fictional-token'));
  assert.ok(!JSON.stringify(await (await fetch(base)).json()).includes('fictional-secret'));
  let adapter = await CloudTracker.open({ root, allowLoopbackHttp: true });
  adapter.state.pending.push({ mutationId: 'unsent-fictional', operation: 'create', fields: { title: 'Role', company: 'Example' } });
  await adapter.persist(); await adapter.close();
  revoked = true;
  assert.equal((await post('/sync')).status, 400);
  let stored = JSON.parse(await readFile(cloudStatePath(root)));
  assert.equal(stored.token, null); assert.equal(stored.pending.length, 1);
  await post('/pair', { origin }); await post('/redeem');
  stored = JSON.parse(await readFile(cloudStatePath(root)));
  assert.equal(stored.token, 'fictional-token'); assert.equal(stored.pending.length, 0);
  assert.equal(stored.conflicts[0].code, 'reconnect_review');
  redirect = true;
  const refused = await (await post('/pull')).json(); assert.match(refused.error, /Redirect refused/);
});
