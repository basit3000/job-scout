import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from './common.mjs';

const run = promisify(execFile);
test('clean source copy uses only memory through first setup, restart, and standalone evidence', async (t) => {
  const parent = join(ROOT, '.workspace', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'memory-new-user-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(parent));
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  });
  for (const dir of ['scripts', 'markets', '.agents/skills/cv-tailor']) {
    await cp(join(ROOT, dir), join(root, dir), { recursive: true,
      filter: path => !path.endsWith('.test.mjs') && !path.includes('__pycache__') });
  }
  for (const file of ['package.json', 'state/memory.example.json', 'search-profile.example.json', '.env.example',
    'cv/resume.example.md', 'cv/cover-letter.example.md',
    'state/decisions.example.json']) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await cp(join(ROOT, file), join(root, file));
  }
  const options = { cwd: root, windowsHide: true, env: { ...process.env, PORTFOLIO_ROOT: root } };
  await run('git', ['init', '--quiet'], options);
  await run(process.execPath, ['scripts/setup.mjs', '--quiet'], options);
  const code = `
    import assert from 'node:assert/strict';
    import {readFile} from 'node:fs/promises';
    import {applySetup,getSetupStatus} from './scripts/lib/setup-state.mjs';
    import {readMemory,updateMemory} from './scripts/lib/memory.mjs';
    assert.equal((await getSetupStatus()).needsSetup,true);
    const setup = {name:'Example Candidate',targetRole:'Engineer',market:'GB',email:'example@example.com',searchTitles:'Engineer',skills:'Python'};
    await assert.rejects(applySetup(setup), /Preview again/);
    const preview = await applySetup({...setup,previewOnly:true});
    await applySetup({...setup,confirmation:preview.confirmation});
    assert.deepEqual((await readMemory()).facts.experience, []);
    assert.equal((await getSetupStatus()).needsSetup,false);
    assert.equal((await readMemory()).facts.name,'Example Candidate');
    await updateMemory(m=>{m.facts.headline='Updated from memory';m.answers.needsSponsorship='No';return m;});
    await assert.rejects(readFile('profile.json'), /ENOENT/);
    await assert.rejects(readFile('state/saved-answers.json'), /ENOENT/);
  `;
  await run(process.execPath, ['--input-type=module', '-e', code], options);
  // The standalone collector reads canonical memory even if an old tool edited its copy.
  await writeFile(join(root, 'profile.json'), '{"name":"Stale legacy candidate"}');
  await run(process.execPath, ['.agents/skills/cv-tailor/scripts/gather-evidence.mjs', '--no-github', '--out-dir', '.cv-workspace'], options);
  const evidence = JSON.parse(await readFile(join(root, '.cv-workspace/evidence.json'), 'utf8'));
  assert.equal(evidence.profile.headline, 'Updated from memory');
  await run(process.execPath, ['scripts/setup.mjs', '--quiet'], options);
  assert.match(await readFile(join(root, 'profile.json'), 'utf8'), /Stale legacy candidate/);
  assert.equal(JSON.parse(await readFile(join(root, 'state/memory.json'), 'utf8')).facts.headline,'Updated from memory');
  // Overleaf users can remove the local master without startup or setup recreating it.
  const overleafCode = `
    import assert from 'node:assert/strict';
    import {readFile,writeFile,unlink} from 'node:fs/promises';
    import {applySetup,getSetupStatus} from './scripts/lib/setup-state.mjs';
    const config = JSON.parse(await readFile('search-profile.json','utf8'));
    config.cv = {...config.cv,source:'overleaf'};
    await writeFile('search-profile.json',JSON.stringify(config));
    await unlink('cv/resume.md');
    assert.equal((await getSetupStatus()).hasResume,false);
    const setup = {name:'Example Candidate',targetRole:'Engineer',market:'GB',email:'example@example.com',searchTitles:'Engineer',skills:'Python'};
    const preview = await applySetup({...setup,previewOnly:true});
    await applySetup({...setup,confirmation:preview.confirmation});
    await assert.rejects(readFile('cv/resume.md'), /ENOENT/);
    assert.equal(JSON.parse(await readFile('search-profile.json','utf8')).cv.source,'overleaf');
    assert.ok(await readFile('cv/cover-letter.md','utf8'));
  `;
  await run(process.execPath, ['--input-type=module', '-e', overleafCode], options);
  await run(process.execPath, ['scripts/setup.mjs', '--quiet'], options);
  await assert.rejects(readFile(join(root, 'cv/resume.md')), /ENOENT/);
});
