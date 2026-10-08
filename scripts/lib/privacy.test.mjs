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

test('privacy check catches private prompts, preferences, answers and template identifiers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scout-private-settings-'));
  const git = args => run('git', args, { cwd: dir, windowsHide: true });
  const check = args => run(process.execPath, [script, ...args], { cwd: dir, windowsHide: true });
  const prompt = 'Synthetic private instruction for a fictional candidate: use a distinctive invented document style.';
  const preference = 'Synthetic private preference: put the fictional research portfolio ahead of other sections.';
  const answer = 'Synthetic private application answer with fictional circumstances requiring confirmation.';
  const template = { id: 'template-synthetic-private-123', name: 'Fictional Private Layout' };
  const project = 'Fictional Private Project';
  const experience = 'Built an entirely fictional private reporting workflow for a synthetic candidate.';
  const token = 'synthetic-tracker-token-not-a-real-credential';
  try {
    await git(['init', '--quiet']);
    await mkdir(join(dir, 'state'));
    await mkdir(join(dir, 'prompts'));
    await writeFile(join(dir, '.gitignore'), 'state/\nprompts/local.json\ncv/templates/\n');
    await writeFile(join(dir, 'state/memory.json'), JSON.stringify({ facts: { projects: [{ name: project }], experience: [{ bullets: [experience] }] },
      preferences: { tailoringNotes: preference }, answers: { availability: answer } }));
    await mkdir(join(dir, 'state/private'));
    await writeFile(join(dir, 'state/private/tracker.json'), JSON.stringify({ token }));
    await writeFile(join(dir, 'prompts/local.json'), JSON.stringify({ instructions: { cv: prompt }, templates: [template] }));
    await writeFile(join(dir, 'example.md'), 'Generic template support without private settings.');
    await git(['add', '.']);
    assert.match((await check([])).stdout, /passed/);
    for (const [value, label] of [[prompt, 'private prompt instruction'], [preference, 'private candidate preference'],
      [answer, 'private saved answer'], [template.id, 'private template ID'], [template.name, 'private template name'],
      [experience, 'private candidate content'], [token, 'private tracker credential'], [project, 'candidate project']]) {
      await writeFile(join(dir, 'example.md'), value);
      await assert.rejects(check([]), error => {
        assert.ok(error.stderr.includes(`example.md: ${label}`));
        assert.ok(!error.stderr.includes(value), 'private values must not appear in diagnostic output');
        return true;
      });
    }
    await git(['add', 'example.md']);
    await writeFile(join(dir, 'example.md'), 'Clean working copy.');
    assert.match((await check([])).stdout, /passed/);
    await assert.rejects(check(['--staged']), error => /candidate project/.test(error.stderr));
    await git(['add', 'example.md']);
    await mkdir(join(dir, 'cv/templates'), { recursive: true });
    await writeFile(join(dir, 'cv/templates/formatting-rules.md'), 'Synthetic private layout.');
    await git(['add', '-f', 'cv/templates/formatting-rules.md']);
    await assert.rejects(check(['--staged']), error => /private\/generated file/.test(error.stderr));
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  }
});
