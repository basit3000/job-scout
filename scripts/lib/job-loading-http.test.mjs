import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOT } from './common.mjs';

test('cold archive cannot block the shell; document reads and responses are page-sized', { timeout: 30000 }, async t => {
  const parent = resolve(ROOT, '.workspace/tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'loading-http-'));
  assert.ok(resolve(root).startsWith(parent + sep));
  let child;
  t.after(async () => {
    if (child && child.exitCode == null && child.signalCode == null) {
      const exit = once(child, 'exit'); child.kill(); await exit;
    }
    await rm(root, { recursive: true, force: true });
  });
  for (const dir of ['scripts/lib', 'web', 'markets']) await cp(join(ROOT, dir), join(root, dir), { recursive: true });
  for (const dir of ['state', '.workspace']) await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(root, 'state/memory.json'), JSON.stringify({ schemaVersion: 1, revision: 1,
    facts: { name: 'Fictional Candidate', targetRole: 'Developer', search: { titles: ['Developer'] } }, preferences: {}, answers: {} }));
  await writeFile(join(root, 'search-profile.json'), JSON.stringify({ market: 'DE', cv: { source: 'local' } }));
  const jobs = Array.from({ length: 250 }, (_, i) => ({ id: `fixture-${i}`, title: 'Developer', company: `Example ${i}`,
    location: 'Berlin, Germany', postedAt: new Date().toISOString(), description: 'Build software. '.repeat(150), url: `https://example.org/jobs/${i}` }));
  await writeFile(join(root, '.workspace/jobs.json'), JSON.stringify({ jobs }));
  await writeFile(join(root, '.workspace/digest.json'), JSON.stringify({ newIds: jobs.map(job => job.id) }));
  // Stall the real scoring path until the test releases it. This would deadlock
  // HTTP asset requests if scoring still ran on the server's event loop.
  const fitPath = join(root, 'scripts/lib/fit.mjs');
  await writeFile(fitPath, "import { existsSync as fixtureExists, writeFileSync as fixtureWrite } from 'node:fs';\n"
    + (await readFile(fitPath, 'utf8')).replace("export function scoreJob(job, profile, evidenceText = '', options = {}) {", `export function scoreJob(job, profile, evidenceText = '', options = {}) {
      if (!globalThis.fixtureScoringStarted) {
        globalThis.fixtureScoringStarted = true;
        fixtureWrite(new URL('../../.workspace/scoring-started', import.meta.url), 'started');
        while (!fixtureExists(new URL('../../.workspace/release-scoring', import.meta.url)))
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }`));
  const prepPath = join(root, 'scripts/lib/prep.mjs');
  await writeFile(prepPath, "import { appendFileSync as fixtureAppend } from 'node:fs';\n"
    + (await readFile(prepPath, 'utf8')).replace('export async function loadPrepFlagsForJob(jobId) {', `export async function loadPrepFlagsForJob(jobId) {
      fixtureAppend(new URL('../../.workspace/document-reads', import.meta.url), jobId + '\\n');`));
  child = spawn(process.execPath, [join(root, 'web/server.mjs')], { cwd: root, windowsHide: true,
    env: { ...process.env, PORT: '0', NO_OPEN: '1', GOOGLE_SHEETS_SPREADSHEET_ID: '', APIFY_TOKEN: '', JOB_SCOUT_NOTIFICATION_WEBHOOK: '' },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let errors = ''; child.stderr.on('data', data => { errors += data; });
  const [{ port }] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(errors); })]);
  const base = `http://127.0.0.1:${port}`;
  const get = async path => {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, path); return response;
  };
  let finished = false;
  const firstRequest = get('/api/jobs?scope=history&pageSize=10').then(response => response.json()).then(data => { finished = true; return data; });
  for (let tries = 0; ; tries++) {
    if (await readFile(join(root, '.workspace/scoring-started'), 'utf8').catch(() => '')) break;
    assert.ok(tries < 400, 'worker started scoring'); await delay(10);
  }
  const started = performance.now();
  assert.match(await (await get('/')).text(), /workspaceNav/);
  assert.match(await (await get('/styles.css')).text(), /color-scheme/);
  assert.equal((await (await get('/api/status?light=1')).json()).readyCount, null);
  assert.equal(finished, false, 'shell/settings respond while archive scoring is still held');
  t.diagnostic(`Shell, stylesheet and light status during blocked scoring: ${Math.round(performance.now() - started)} ms`);
  await writeFile(join(root, '.workspace/release-scoring'), 'go');
  const first = await firstRequest;
  assert.equal(first.jobs.length, 10); assert.equal(first.pagination.total, 250);
  assert.ok(first.jobs.every(job => !Object.hasOwn(job, 'description')));
  const reads = async () => (await readFile(join(root, '.workspace/document-reads'), 'utf8')).trim().split('\n');
  assert.equal((await reads()).length, 10, 'first page checks only ten document folders');
  await get('/api/jobs?scope=history&pageSize=10');
  assert.equal((await reads()).length, 10, 'cached page does not repeat document checks');
  const second = await (await get('/api/jobs?scope=history&pageSize=10&page=2')).json();
  assert.equal((await reads()).length, 20);
  assert.equal(new Set([...first.jobs, ...second.jobs].map(job => job.id)).size, 20);
  const single = await (await get('/api/jobs/fixture-249')).json();
  assert.equal(single.job.description, jobs[249].description);
  assert.ok((await reads()).length <= 21, 'detail request reads at most one additional folder');
  const changed = await fetch(base + '/api/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: first.jobs[0].id, decision: 'skipped', job: first.jobs[0] }) });
  assert.equal(changed.status, 200);
  const filtered = await (await get('/api/jobs?scope=history&hide=skipped')).json();
  assert.equal(filtered.pagination.total, 249, 'mutations invalidate the worker index');
  assert.ok(!filtered.jobs.some(job => job.id === first.jobs[0].id));
});
