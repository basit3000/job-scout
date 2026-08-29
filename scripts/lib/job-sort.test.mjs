import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareFit,
  comparePostedNewest,
  postedRecencyMs,
  sortJobs,
} from './job-sort.mjs';

const NOW = Date.parse('2026-08-29T12:00:00.000Z');

test('compareFit keeps Strong first, then score descending', () => {
  const jobs = [
    { id: 'no', fit: { verdict: 'No', score: 90 } },
    { id: 'stretch', fit: { verdict: 'Stretch', score: 10 } },
    { id: 'worth-low', fit: { verdict: 'Worth a shot', score: 20 } },
    { id: 'worth-high', fit: { verdict: 'Worth a shot', score: 40 } },
    { id: 'strong-low', fit: { verdict: 'Strong', score: 50 } },
    { id: 'strong-high', fit: { verdict: 'Strong', score: 80 } },
    { id: 'unknown' },
  ];
  assert.deepEqual(
    sortJobs(jobs, 'fit').map((j) => j.id),
    ['strong-high', 'strong-low', 'worth-high', 'worth-low', 'stretch', 'no', 'unknown'],
  );
  assert.ok(compareFit(jobs[5], jobs[4]) < 0);
});

test('newest uses postedAt descending and puts null dates last', () => {
  const jobs = [
    { id: 'old', postedAt: '2026-08-01T00:00:00.000Z' },
    { id: 'undated' },
    { id: 'new', postedAt: '2026-08-28T00:00:00.000Z' },
    { id: 'mid', postedAt: '2026-08-15T00:00:00.000Z' },
  ];
  assert.deepEqual(
    sortJobs(jobs, 'newest', NOW).map((j) => j.id),
    ['new', 'mid', 'old', 'undated'],
  );
  assert.deepEqual(
    sortJobs(jobs, 'oldest', NOW).map((j) => j.id),
    ['old', 'mid', 'new', 'undated'],
  );
});

test('missing postedAt falls back to smaller ageDays, then lastSeenAt/firstSeenAt', () => {
  const jobs = [
    { id: 'by-age', ageDays: 2 },
    { id: 'by-posted', postedAt: '2026-08-28T00:00:00.000Z' },
    { id: 'by-last', lastSeenAt: '2026-08-20T00:00:00.000Z' },
    { id: 'by-first', firstSeenAt: '2026-08-10T00:00:00.000Z' },
    { id: 'none' },
  ];
  assert.deepEqual(
    sortJobs(jobs, 'newest', NOW).map((j) => j.id),
    ['by-posted', 'by-age', 'by-last', 'by-first', 'none'],
  );
  assert.ok(postedRecencyMs({ ageDays: 1 }, NOW) > postedRecencyMs({ ageDays: 5 }, NOW));
  assert.ok(comparePostedNewest({ ageDays: 1 }, { ageDays: 5 }, NOW) < 0);
});

test('unknown sort mode and default stay on fit', () => {
  const jobs = [
    { id: 'stretch', fit: { verdict: 'Stretch', score: 1 } },
    { id: 'strong', fit: { verdict: 'Strong', score: 1 } },
  ];
  assert.deepEqual(sortJobs(jobs).map((j) => j.id), ['strong', 'stretch']);
  assert.deepEqual(sortJobs(jobs, 'nope').map((j) => j.id), ['strong', 'stretch']);
});

test('sortJobs does not mutate the input array', () => {
  const jobs = [
    { id: 'a', postedAt: '2026-08-01T00:00:00.000Z' },
    { id: 'b', postedAt: '2026-08-20T00:00:00.000Z' },
  ];
  const copy = [...jobs];
  sortJobs(jobs, 'newest', NOW);
  assert.deepEqual(jobs, copy);
});
