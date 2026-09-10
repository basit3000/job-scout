import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './common.mjs';
import { clearJobDownloads, jobDownloadFolder } from './cv-downloads.mjs';

test('replacement clears only its role and refuses a company junction', async (t) => {
  const parent = join(ROOT, '.workspace', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'replace-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const exportRoot = join(root, 'downloads');
  const job = { company: '../../Example', jobTitle: '../Backend', jobId: '../../job:1' };
  const role = join(exportRoot, jobDownloadFolder(job));
  const other = join(exportRoot, jobDownloadFolder({ ...job, jobId: 'job:2' }));
  for (const dir of [role, other]) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'cv.pdf'), 'saved');
  }
  await clearJobDownloads({ ...job, exportRoot });
  await assert.rejects(readFile(join(role, 'cv.pdf')), /ENOENT/);
  assert.equal(await readFile(join(other, 'cv.pdf'), 'utf8'), 'saved');
  await clearJobDownloads({ ...job, exportRoot }); // Missing role is harmless.
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'keep.txt'), 'keep');
  await symlink(outside, join(exportRoot, 'Linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(clearJobDownloads({ ...job, company: 'Linked', exportRoot }), /linked folder/);
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'keep');
});
