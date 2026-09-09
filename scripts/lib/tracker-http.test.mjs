import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ROOT } from './common.mjs';

test('manual application lifecycle and submitted files through the real HTTP routes', { timeout: 30000 }, async (t) => {
  const parent = resolve(ROOT, '.workspace/tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'tracker-http-'));
  assert.ok(resolve(root).startsWith(parent + sep));
  let child;
  t.after(async () => {
    if (child && child.exitCode == null && child.signalCode == null) { const exit = once(child, 'exit'); child.kill(); await exit; }
    await rm(root, { recursive: true, force: true });
  });
  for (const dir of ['scripts/lib', 'web', 'markets']) await cp(join(ROOT, dir), join(root, dir), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  const server = join(root, 'web/server.mjs');
  await writeFile(server, (await readFile(server, 'utf8')).replace('server.listen(PORT, () => {', 'server.listen(PORT, () => { process.send({ port: server.address().port });'));
  child = spawn(process.execPath, [server], { cwd: root, windowsHide: true, env: { ...process.env, PORT: '0', NO_OPEN: '1', GOOGLE_SHEETS_SPREADSHEET_ID: '', APIFY_TOKEN: '', OVERLEAF_GIT_TOKEN: '', OVERLEAF_PROJECT_ID: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let logs = '';
  child.stderr.on('data', (data) => { logs += data; });
  child.stdout.resume();
  const [{ port }] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(logs); })]);
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, body, method = 'POST') => {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const added = await request('/api/tracker/application', { company: 'Manual Co', title: 'Engineer', decision: 'applied', appliedDate: '2026-08-01', contactName: 'Taylor', url: 'https://example.com/job' });
  assert.equal(added.status, 201);
  const id = added.data.entry.id;
  assert.ok(id.startsWith('manual:application:'));
  assert.equal((await request('/api/tracker/application', { id, decision: 'offer' }, 'PATCH')).status, 200);
  const payload = { id, name: 'CV.txt', kind: 'cv', data: Buffer.from('Submitted CV bytes').toString('base64') };
  const attached = await request('/api/tracker/attachments', payload);
  assert.equal(attached.status, 201);
  const attachment = attached.data.attachment.id;
  const downloaded = await fetch(`${base}/api/tracker/attachments?id=${encodeURIComponent(id)}&attachment=${attachment}`);
  assert.equal(await downloaded.text(), 'Submitted CV bytes');
  assert.match(downloaded.headers.get('content-disposition'), /^attachment;/);
  assert.equal((await fetch(`${base}/api/tracker/attachments?id=wrong&attachment=${attachment}`)).status, 404);
  await request('/api/decisions', { id, decision: 'accepted' });
  const tracker = await request('/api/tracker', null, 'GET');
  assert.equal(tracker.data.counts.accepted, 1);
  const entry = tracker.data.items[0];
  assert.equal(entry.appliedDate, '2026-08-01');
  assert.equal(entry.contactName, 'Taylor');
  assert.equal(entry.attachments.length, 1);
  assert.deepEqual(entry.statusHistory.map((h) => h.to), ['applied', 'offer', 'accepted']);
  assert.equal((await request('/api/tracker/application', { company: '', title: 'Dev' })).status, 400);
  assert.equal((await request('/api/tracker/application', { id, url: 'javascript:alert(1)' }, 'PATCH')).status, 400);
});
