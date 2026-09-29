import test from 'node:test';
import assert from 'node:assert/strict';
import { createScoreCache } from './score-cache.mjs';

test('ongoing employment advances when the scoring date changes', () => {
  let date = new Date('2026-01-01T00:00:00Z'), calls = 0;
  const cache = createScoreCache((_job, _profile, _evidence, options) => ({ count: ++calls, date: options.now.toISOString() }), 10, { now: () => date });
  const job = { id: 'a' };
  assert.equal(cache({}, '')(job).count, 1);
  assert.equal(cache({}, '')(job).count, 1);
  date = new Date('2026-01-02T00:00:00Z');
  assert.equal(cache({}, '')(job).count, 2);
});

test('score cache reuses unchanged inputs and invalidates posting, profile, and evidence changes', () => {
  let calls = 0;
  const cache = createScoreCache(() => ++calls, 2);
  const job = { id: 'a', description: 'Python' };
  assert.equal(cache({ skills: ['Python'] }, 'CV')(job), 1);
  assert.equal(cache({ skills: ['Python'] }, 'CV')({ ...job }), 1);
  assert.equal(cache({ skills: ['Python'] }, 'CV')({ ...job, description: 'SQL' }), 2);
  const old = cache({ skills: ['Python'] }, 'CV');
  const changed = cache({ skills: ['SQL'] }, 'CV');
  assert.equal(changed(job), 3);
  old(job); // An older concurrent load must not pollute the new context.
  assert.equal(changed(job), 3);
  assert.equal(cache({ skills: ['SQL'] }, 'New CV')(job), 5);
  const bounded = cache({}, '');
  bounded({ id: '1' }); bounded({ id: '2' }); bounded({ id: '3' });
  const before = calls;
  bounded({ id: '1' });
  assert.equal(calls, before + 1);
});
