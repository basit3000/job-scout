import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { migrateMemory, planMemoryMigration } from './memory-migration.mjs';
import { readMemory, readMemorySync, loadCandidateProfile, memoryAnswers, withMemorySnapshot,
  updateMemory, previewMemory, confirmMemory, memoryInputs, memoryEvidence } from './memory.mjs';
import { prepFingerprint, assessPrep } from './prep-state.mjs';
import { handleMemoryApi } from '../../web/memory-routes.mjs';
import { cleanupMemory } from './memory-cleanup.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'scout-memory-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['state', 'cv', '.agents/skills/cv-tailor.local/references']) await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, 'profile.json'), JSON.stringify({ name: 'Example Candidate', links: { github: 'https://github.com/example-person' },
    constraints: { needsSponsorship: false }, skills: { strong: ['Python'] }, experience: [], education: [] }));
  await writeFile(join(root, 'state/saved-answers.json'), JSON.stringify({ answers: { phone: '+000000000000', needsSponsorship: 'Yes' } }));
  await writeFile(join(root, 'cv/tech-stack.md'), 'Candidate-provided Python experience.');
  await writeFile(join(root, 'cv/resume.md'), '# Example Candidate\nMaster document, kept separate.');
  await writeFile(join(root, '.agents/skills/cv-tailor.local/agent-rules.md'), 'Use plain English.');
  return root;
}

test('migration preserves sources and archives, identifies conflicts, and does not reimport legacy edits', async (t) => {
  const root = await fixture(t);
  const plan = await planMemoryMigration(root);
  const originalProfile = await readFile(join(root, 'profile.json'), 'utf8');
  assert.equal(plan.migration.conflicts.length, 1);
  assert.equal(await readMemory(root), null);
  const { memory } = await migrateMemory(root);
  assert.equal(memory.answers.needsSponsorship, 'Yes');
  assert.equal(memory.facts.constraints.needsSponsorship, undefined);
  assert.equal(memory.facts.links.phone, '+000000000000');
  assert.equal(memory.answers.phone, undefined);
  assert.equal(memory.preferences.agentRules, 'Use plain English.');
  assert.equal(memory.facts.background.techStack, 'Candidate-provided Python experience.');
  assert.equal(await readFile(join(root, memory.migration.archive, 'profile.json'), 'utf8'), originalProfile);
  await writeFile(join(root, 'profile.json'), '{"name":"Stale legacy value"}');
  assert.equal((await loadCandidateProfile(root)).name, 'Example Candidate');
  assert.equal((await migrateMemory(root)).migrated, false);
  assert.equal((await readMemory(root)).revision, 1);
  assert.equal(memoryAnswers(memory).phone, '+000000000000');
});

test('malformed canonical memory fails closed instead of falling back to old personal files', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'state/memory.json'), 'broken JSON');
  await assert.rejects(loadCandidateProfile(root), /state\/memory.json/);
  await assert.rejects(migrateMemory(root), /state\/memory.json/);
});

test('one-way cleanup archives unique legacy content, keeps facts and masters, and is idempotent', async (t) => {
  const root = await fixture(t);
  const { memory } = await migrateMemory(root);
  const before = JSON.stringify({ facts: memory.facts, preferences: memory.preferences, answers: memory.answers });
  await writeFile(join(root, 'profile.json'), '{"name":"Unmerged old-tool correction"}');
  const result = await cleanupMemory(root);
  assert.ok(result.removed > 0);
  const current = await readMemory(root);
  assert.equal(JSON.stringify({ facts: current.facts, preferences: current.preferences, answers: current.answers }), before);
  await assert.rejects(readFile(join(root, 'profile.json')), /ENOENT/);
  await assert.rejects(readFile(join(root, '.agents/skills/cv-tailor.local/agent-rules.md')), /ENOENT/);
  assert.match(await readFile(join(root, 'cv/resume.md'), 'utf8'), /Master document/);
  const report = JSON.parse(await readFile(join(root, result.report), 'utf8'));
  const item = report.removed.find(item => item.source === 'profile.json');
  assert.match(await readFile(join(root, 'state/memory-migration/retired-inputs', `${item.sha256}-profile.json`), 'utf8'), /Unmerged old-tool correction/);
  assert.equal((await cleanupMemory(root)).removed, 0);
  await writeFile(join(root, 'profile.json'), '{"name":"Another old-tool correction"}');
  assert.equal((await cleanupMemory(root)).removed, 1);
  const merged = JSON.parse(await readFile(join(root, result.report), 'utf8'));
  assert.equal(merged.removed.filter(item => item.source === 'profile.json').length, 2);
});

test('cleanup refuses linked legacy directories and preserves outside contents', async (t) => {
  const root = await fixture(t);
  await migrateMemory(root);
  const outside = await mkdtemp(join(tmpdir(), 'scout-memory-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'keep.txt'), 'preserve this');
  await symlink(outside, join(root, 'state/memory-compat-backups'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(cleanupMemory(root), /symbolic links/);
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'preserve this');
  assert.match(await readFile(join(root, 'profile.json'), 'utf8'), /Example Candidate/);
});

test('preview requires exact proposed edits and rejects stale revisions; history preserves old values', async (t) => {
  const root = await fixture(t); const { memory } = await migrateMemory(root);
  const sections = { facts: { ...memory.facts, headline: 'Engineer' }, preferences: memory.preferences, answers: memory.answers };
  const preview = previewMemory(memory, sections);
  assert.deepEqual(preview.changes, ['facts.headline']);
  await assert.rejects(confirmMemory({ ...sections, facts: { ...sections.facts, headline: 'Changed again' } }, preview.confirmation, { root }), /Preview again/);
  const saved = await confirmMemory(sections, preview.confirmation, { root });
  assert.equal(saved.revision, 2); assert.equal(saved.facts.headline, 'Engineer');
  await assert.rejects(confirmMemory(sections, preview.confirmation, { root }), /Preview again/);
  assert.throws(() => previewMemory(saved, { ...sections, answers: { ...sections.answers, github: 'another value' } }), /facts.links/);
});

test('a run keeps its memory snapshot while future runs receive later changes', async (t) => {
  const root = await fixture(t); await migrateMemory(root);
  await withMemorySnapshot(async () => {
    const first = readMemorySync(root);
    await updateMemory((m) => { m.preferences.agentRules = 'Short sentences.'; return m; }, { root });
    assert.equal(readMemorySync(root).revision, first.revision);
    assert.equal(readMemorySync(root).preferences.agentRules, 'Use plain English.');
  }, root);
  assert.equal((await readMemory(root)).revision, 2);
  assert.equal((await readMemory(root)).preferences.agentRules, 'Short sentences.');
});

test('memory edits invalidate document freshness; archived source changes do not become evidence', async (t) => {
  const root = await fixture(t); const { memory } = await migrateMemory(root);
  const context = { job: { id: 'example' }, profile: {}, settings: {}, inputs: memoryInputs(memory) };
  const manifest = { cv: { fingerprint: prepFingerprint({ ...context, scope: 'cv' }) } };
  assert.equal(assessPrep(manifest, context, { letter: false }).cv, 'current');
  const changed = structuredClone(memory); changed.preferences.agentRules = 'Different style.';
  assert.equal(assessPrep(manifest, { ...context, inputs: memoryInputs(changed) }, { letter: false }).cv, 'outdated');
  changed.migration.reviewSources = [{ text: 'Unverified million users' }];
  assert.doesNotMatch(memoryEvidence(changed), /million users|Different style/);
});

test('memory HTTP routes require preview/confirmation, refuse active runs, and reject cross-origin writes', async (t) => {
  const root = await fixture(t); let busy = false;
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const server = createServer(async (req, res) => {
    await handleMemoryApi(req, res, new URL(req.url, 'http://localhost'), { root, json, busy: () => busy,
      readBody: async (request) => { let body = ''; for await (const chunk of request) body += chunk; return JSON.parse(body); } });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (path, body, method = 'POST', headers = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  await migrateMemory(root);
  const current = (await request('/api/memory', null, 'GET')).data.memory;
  const sections = { facts: { ...current.facts, headline: 'Engineer' }, answers: current.answers, preferences: current.preferences };
  assert.equal((await request('/api/memory', sections, 'PUT')).status, 400);
  const preview = await request('/api/memory/preview', sections);
  const body = { ...sections, confirmation: preview.data.confirmation };
  assert.equal((await request('/api/memory', body, 'PUT', { Origin: 'https://example.com' })).status, 403);
  assert.equal((await request('/api/memory', body, 'PUT', { Origin: 'null' })).status, 403);
  busy = true; assert.equal((await request('/api/memory', body, 'PUT')).status, 409);
  busy = false; assert.equal((await request('/api/memory', body, 'PUT')).status, 200);
  assert.equal((await request('/api/memory', body, 'PUT')).status, 400);
});
