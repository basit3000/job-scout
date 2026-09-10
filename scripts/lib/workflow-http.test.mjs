import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ROOT } from './common.mjs';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';

test('HTTP workflow filters history, exports per job, regenerates stale packs and preserves a good CV on overflow', { timeout: 60000 }, async (t) => {
  const parent = join(ROOT, '.workspace', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'http-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode == null && child.signalCode == null) {
      const exit = once(child, 'exit');
      if (child.kill()) await exit;
    }
    await rm(root, { recursive: true, force: true });
  });
  for (const dir of ['scripts/lib', 'web', 'markets']) await cp(join(ROOT, dir), join(root, dir), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  for (const dir of ['cv', 'state', '.workspace']) await mkdir(join(root, dir), { recursive: true });
  const profile = { name: 'Test Candidate', headline: 'Backend Engineer', targetRole: 'Backend Engineer', seniority: 'mid',
    search: { titles: ['Backend Engineer'], includeTitlePatterns: ['Backend'] }, skills: { strong: ['Python', 'SQL'] },
    links: { email: 'candidate@example.com' } };
  await writeFile(join(root, 'profile.json'), JSON.stringify(profile));
  await writeFile(join(root, 'search-profile.json'), JSON.stringify({ market: 'DE', filters: { maxAgeDays: 14 }, cv: { source: 'local', tailorMode: 'fast', agentProvider: 'cursor', agentModel: 'composer-2.5' } }));
  const resume = '# Test Candidate\ncandidate@example.com\n\n## Experience\n### Engineer | Example\n2022 – Present\n- Built Python services and SQL databases.\n\n## Education\n### Computer Science | University\n2020\n\n## Skills\nPython, SQL\n';
  await writeFile(join(root, 'cv', 'resume.md'), resume);
  const job = { id: 'fixture:1', title: 'Backend Engineer', company: 'Example', location: 'Berlin, Germany', description: 'Build Python services and SQL databases.', postedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), url: 'https://example.com/job/1' };
  await writeFile(join(root, '.workspace', 'jobs.json'), JSON.stringify({ jobs: [job, { ...job, id: 'fixture:2', title: 'Backend Engineer Platform', url: 'https://example.com/job/2' }, { ...job, id: 'old', title: 'Backend Engineer Legacy', url: 'https://example.com/job/old', postedAt: '2020-01-01' }] }));
  await writeFile(join(root, 'state', 'decisions.json'), JSON.stringify({ decisions: [{ id: 'old', decision: 'applied', title: 'Backend Engineer Legacy', date: '2020-01-01' }] }));

  // Substitute only the external renderer in the isolated copy. Routes, tailoring,
  // PDF inspection, manifests, staging, and exports use the production modules.
  const pdfPath = join(root, 'scripts/lib/pdf.mjs');
  const pdf = await readFile(pdfPath, 'utf8');
  const begin = pdf.indexOf('export async function htmlFileToPdf(');
  const end = pdf.indexOf('\nasync function pathIfRunnable', begin);
  assert.ok(begin >= 0 && end > begin);
  const fixture = (text) => pdfFixture(text).toString('base64');
  const renderer = `export async function htmlFileToPdf(htmlPath, pdfPath) {
    const overflow = await readFile(join(ROOT, '.workspace', 'overflow'), 'utf8').catch(() => '');
    await writeFile(pdfPath, Buffer.from(overflow ? '${fixture(['First page', 'Experience on page two'])}' : '${fixture(['Complete test CV'])}', 'base64'));
    return { ok: true, path: pdfPath, via: 'test renderer' };
  }\n`;
  await writeFile(pdfPath, pdf.slice(0, begin) + renderer + pdf.slice(end));
  const letterPath = join(root, 'scripts/lib/cover-letter.mjs');
  const letterSource = await readFile(letterPath, 'utf8');
  const wordStart = letterSource.indexOf('function docxToPdfViaWord(');
  const wordEnd = letterSource.indexOf('\nasync function writeCoverLetterArtifacts', wordStart);
  assert.ok(wordStart >= 0 && wordEnd > wordStart);
  await writeFile(letterPath, letterSource.slice(0, wordStart)
    + 'function docxToPdfViaWord() { return { ok: false }; }\n' + letterSource.slice(wordEnd));
  const serverPath = join(root, 'web/server.mjs');
  await writeFile(serverPath, (await readFile(serverPath, 'utf8')).replace('server.listen(PORT, () => {', 'server.listen(PORT, () => { process.send({ port: server.address().port });'));
  child = spawn(process.execPath, [serverPath], { cwd: root, windowsHide: true,
    env: { ...process.env, PORT: '0', NO_OPEN: '1', GOOGLE_SHEETS_SPREADSHEET_ID: '', APIFY_TOKEN: '', OVERLEAF_GIT_TOKEN: '', OVERLEAF_PROJECT_ID: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let logs = '';
  child.stderr.on('data', (b) => { logs += b; });
  child.stdout.resume();
  const [{ port }] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(`Server exited: ${logs}`); })]);
  async function request(path, body, method = body ? 'POST' : 'GET') {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    assert.ok(res.ok, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  assert.equal((await request('/api/jobs')).pagination.total, 2);
  assert.equal((await request('/api/jobs?scope=history')).pagination.total, 3);
  assert.equal((await request('/api/tracker')).total, 1);
  const prep = (id, recreate = true) => request('/api/prep', { id, mode: 'fast', recreate, includeCoverLetter: false });
  const first = await prep('fixture:1');
  assert.equal(first.pack.needsReview, false);
  assert.ok(first.pack.downloadFolderAbs);
  assert.ok((await readdir(first.pack.downloadFolderAbs)).includes('Test Candidate CV.pdf'));
  const second = await prep('fixture:2');
  assert.notEqual(second.pack.downloadFolderAbs, first.pack.downloadFolderAbs);
  assert.equal((await prep('fixture:1', false)).cached, true);
  const reusedFast = await request('/api/prep', { id: 'fixture:1', mode: 'agent', recreate: false, includeCoverLetter: false });
  assert.equal(reusedFast.cached, true, 'Use existing reuses a current Fast pack without launching an agent');
  const letter = await request('/api/cover-letter', { id: 'fixture:1', mode: 'fast', open: false });
  assert.equal(letter.needsReview, false);
  assert.equal(letter.folder, first.pack.downloadFolderAbs);
  assert.ok((await readdir(letter.folder)).includes('Test Candidate Cover Letter.pdf'));
  assert.equal((await request('/api/jobs')).jobs.find((j) => j.id === 'fixture:1').prepFreshness.letter, 'current');
  assert.equal((await request('/api/ready')).total, 2);
  async function batch(id, options = {}) {
    await request('/api/prep/batch', { ids: Array.isArray(id) ? id : [id], mode: 'fast', includeCoverLetter: false, skipExisting: true, ...options });
    for (let i = 0; i < 100; i++) {
      const result = await request('/api/prep/batch');
      if (!result.running) return result;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Batch did not finish');
  }
  const skipped = await batch('fixture:2');
  assert.equal(skipped.items[0].status, 'skipped');
  await writeFile(join(root, 'cv', 'resume.md'), `${resume}\nAdditional project: Python API.\n`);
  // The UI enrichment cache has a short TTL; a settings mutation invalidates it.
  await request('/api/settings', { maxAgeDays: 14 }, 'PUT');
  assert.equal((await request('/api/jobs')).jobs.find((j) => j.id === 'fixture:1').prepOutdated, true);
  assert.equal((await request('/api/ready')).total, 0);
  const staleReuse = await fetch(`http://127.0.0.1:${port}/api/prep`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'fixture:1', recreate: false, mode: 'agent', includeCoverLetter: false }) });
  assert.equal(staleReuse.status, 409, 'Use existing must not silently start paid generation');
  const regenerated = await prep('fixture:1');
  assert.equal(regenerated.cached, false);
  assert.ok(regenerated.pack.previousDir);
  const rebuilt = await batch('fixture:2');
  assert.equal(rebuilt.items[0].status, 'done', 'stale documents must not be skipped');
  const bytes = await readFile(join(regenerated.pack.dir, 'cv.pdf'));
  await writeFile(join(root, '.workspace', 'overflow'), '1');
  const overflow = await prep('fixture:1');
  assert.equal(overflow.pack.needsReview, true);
  assert.equal(overflow.pack.preservedPrevious, true);
  assert.deepEqual(await readFile(join(regenerated.pack.dir, 'cv.pdf')), bytes);
  assert.ok(overflow.pack.draftDir);
  const oldExport = join(first.pack.downloadFolderAbs, 'obsolete.txt');
  await writeFile(oldExport, 'old export');
  await writeFile(join(regenerated.pack.dir, 'obsolete.txt'), 'old cache');
  const replace = () => request('/api/prep', { id: 'fixture:1', recreate: true,
    replaceExisting: true, mode: 'fast', includeCoverLetter: false });
  const failedReplacement = await replace();
  assert.equal(failedReplacement.pack.preservedPrevious, true);
  assert.equal(await readFile(oldExport, 'utf8'), 'old export');
  await writeFile(join(root, '.workspace', 'overflow'), '');
  const replacement = await replace();
  assert.equal(replacement.cached, false);
  assert.equal(replacement.pack.needsReview, false);
  assert.equal(replacement.pack.downloadFolderAbs, first.pack.downloadFolderAbs);
  await assert.rejects(readFile(oldExport), /ENOENT/);
  await assert.rejects(readFile(join(replacement.pack.dir, 'obsolete.txt')), /ENOENT/);
  await assert.rejects(readFile(join(replacement.pack.dir, 'cover-letter.md')), /ENOENT/);
  await assert.rejects(readFile(join(first.pack.downloadFolderAbs, 'Test Candidate Cover Letter.pdf')), /ENOENT/);
  assert.ok((await readdir(second.pack.downloadFolderAbs)).includes('Test Candidate CV.pdf'));
  assert.equal(await readFile(join(root, 'cv', 'resume.md'), 'utf8'), `${resume}\nAdditional project: Python API.\n`);
  const invalidReplace = await fetch(`http://127.0.0.1:${port}/api/prep`, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'fixture:1', recreate: false, replaceExisting: true }) });
  assert.equal(invalidReplace.status, 400);

  const otherExport = join(second.pack.downloadFolderAbs, 'obsolete.txt');
  await writeFile(oldExport, 'selected role');
  await writeFile(otherExport, 'unselected role');
  await writeFile(join(root, '.workspace', 'overflow'), '1');
  const failedBatchReplacement = await batch('fixture:1', { replaceExisting: true });
  assert.equal(failedBatchReplacement.replaceExisting, true);
  assert.equal(failedBatchReplacement.skipExisting, false, 'replacement overrides the skip default');
  assert.equal(failedBatchReplacement.items[0].status, 'failed');
  assert.equal(await readFile(oldExport, 'utf8'), 'selected role');
  await writeFile(join(root, '.workspace', 'overflow'), '');
  const batchReplacement = await batch('fixture:1', { replaceExisting: true, includeCoverLetter: true });
  assert.equal(batchReplacement.items[0].status, 'done');
  await assert.rejects(readFile(oldExport), /ENOENT/);
  assert.ok((await readdir(first.pack.downloadFolderAbs)).includes('Test Candidate Cover Letter.pdf'));
  assert.equal(await readFile(otherExport, 'utf8'), 'unselected role');
  const replacedBoth = await batch(['fixture:1', 'fixture:2'], { replaceExisting: true });
  assert.equal(replacedBoth.counts.done, 2);
  assert.equal(replacedBoth.counts.skipped, 0);
  await assert.rejects(readFile(otherExport), /ENOENT/);
  await assert.rejects(readFile(join(first.pack.downloadFolderAbs, 'Test Candidate Cover Letter.pdf')), /ENOENT/);
  const normalBatch = await batch('fixture:1');
  assert.equal(normalBatch.replaceExisting, false, 'replacement does not leak into later batches');
  assert.equal(normalBatch.items[0].status, 'skipped');
});
