import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const script = fileURLToPath(new URL('../check-privacy.mjs', import.meta.url));
test('privacy check blocks personal content in working files and staged snapshots without leaking values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scout-privacy-'));
  const git = args => run('git', args, {cwd:dir, windowsHide:true});
  const check = args => run(process.execPath, [script, ...args], {cwd:dir, windowsHide:true});
  try {
    await git(['init','--quiet']);
    await writeFile(join(dir,'.gitignore'),'profile.json\n.env\nstate/\n');
    await writeFile(join(dir,'profile.json'),JSON.stringify({name:'Fictional Candidate Q',links:{email:'candidate@fictional.invalid'}}));
    await writeFile(join(dir,'.env'),'SERVICE_API_KEY=synthetic-private-value-123456\n');
    await writeFile(join(dir,'example.md'),'Generic public documentation.\n');
    await git(['add','.']);
    assert.match((await check([])).stdout,/passed/);
    await writeFile(join(dir,'example.md'),'Fictional Candidate Q\nsynthetic-private-value-123456\n');
    await assert.rejects(check([]), error => {
      assert.match(error.stderr,/example.md: candidate name, configured secret/);
      assert.doesNotMatch(error.stderr,/Fictional Candidate Q|synthetic-private-value-123456/);
      return true;
    });
    await git(['add','example.md']);
    await writeFile(join(dir,'example.md'),'Clean working copy, sensitive index.\n');
    assert.match((await check([])).stdout,/passed/);
    await assert.rejects(check(['--staged']),error => /Git index/.test(error.stderr));
    await git(['add','example.md']);
    await mkdir(join(dir,'state'));
    await rm(join(dir, 'profile.json'));
    await writeFile(join(dir,'state','memory.json'), JSON.stringify({ facts: { name: 'Another Fictional Candidate Z' } }));
    await writeFile(join(dir,'example.md'),'Another Fictional Candidate Z\n');
    await assert.rejects(check([]), error => {
      assert.match(error.stderr, /example.md: candidate name/);
      assert.doesNotMatch(error.stderr, /Another Fictional Candidate Z/);
      return true;
    });
    await writeFile(join(dir,'example.md'),'Clean working copy.\n');
    await git(['add','-f','state/memory.json']);
    await assert.rejects(check(['--staged']),error => /private\/generated file/.test(error.stderr));
  } finally {
    assert.equal(dirname(resolve(dir)),resolve(tmpdir()));
    await rm(dir,{recursive:true,force:true});
  }
});
