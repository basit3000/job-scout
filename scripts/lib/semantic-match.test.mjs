import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { embedding, semanticSearch } from './semantic-match.mjs';
test('semantic retrieval finds related wording without changing deterministic eligibility', async () => {
  const jobs = [
    { id: 'irrelevant', title: 'Engineer', description: 'Road construction', fit: { score: 60, verdict: 'Worth a shot' } },
    { id: 'relevant', title: 'Engineer', description: 'Service reliability and fault tolerance', fit: { score: 50, verdict: 'Worth a shot' } },
    { id: 'excluded', title: 'Principal Engineer', description: 'Service reliability', fit: { score: 10, verdict: 'No', eligibility: { status: 'incompatible' } } },
  ];
  const before = structuredClone(jobs);
  const result = await semanticSearch({ jobs, profile: { seniority: 'junior' }, query: 'Resilient systems', config: { enabled: true }, embed: async text => /Road/.test(text) ? [0, 1] : [1, 0] });
  assert.equal(result.results[0].job.id, 'relevant'); assert.equal(result.results.at(-1).excluded, true); assert.deepEqual(jobs, before);
  const fallback = await semanticSearch({ jobs, profile: {}, query: 'x', config: { enabled: true }, embed: async () => { throw new Error('offline'); } });
  assert.equal(fallback.mode, 'deterministic'); assert.equal(fallback.results[0].job.id, 'irrelevant');
});
test('private embeddings invalidate on text, model and revision changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'scout-embedding-')); t.after(() => rm(root, { recursive: true, force: true }));
  let calls = 0; const fetchImpl = async () => { calls++; return Response.json({ embeddings: [[1, 0]] }); };
  const config = { model: 'fictional-model', revision: '1' };
  await embedding('a', config, { root, fetchImpl }); await embedding('a', config, { root, fetchImpl }); assert.equal(calls, 1);
  await embedding('b', config, { root, fetchImpl }); await embedding('a', { ...config, revision: '2' }, { root, fetchImpl }); assert.equal(calls, 3);
  await assert.rejects(embedding('a', { ...config, endpoint: 'https://remote.example/embed' }, { root, fetchImpl }), /local/);
});
