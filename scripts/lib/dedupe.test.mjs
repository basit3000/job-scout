import assert from 'node:assert/strict';

test('native employer-feed IDs are scoped to their employer and provider', () => {
  const base = { source: 'gb:companycareers', nativeId: '1', title: 'Engineer', location: 'London', via: 'personio' };
  const jobs = [{ ...base, id: 'one', company: 'Example Workshop', url: 'https://workshop.example.org/job/1' },
    { ...base, id: 'two', company: 'Example Studio', url: 'https://studio.example.org/job/1' }];
  assert.equal(dedupeJobs(jobs).length, 2);
  assert.equal(mergeJobArchives(jobs, [jobs[0]]).length, 2);
});
import test from 'node:test';
import { dedupeJobs, mergeJobArchives } from './dedupe.mjs';

test('vacancy query IDs, locations and requisitions remain distinct', () => {
  const base = { company: 'Fictional Labs', title: 'Engineer', location: 'Berlin', source: 'indeed' };
  const a = { ...base, id: 'a', url: 'https://indeed.com/viewjob?jk=A' };
  assert.equal(dedupeJobs([a, { ...a, id: 'b', url: 'https://indeed.com/viewjob?jk=B' }]).length, 2);
  assert.equal(dedupeJobs([a, { ...a, id: 'b', url: a.url + '&utm_source=demo' }]).length, 1);
  for (const extra of [{ location: 'London' }, { requisitionId: 'R2' }]) {
    assert.equal(dedupeJobs([{ ...a, requisitionId: 'R1' }, { ...a, ...extra, id: 'b', url: 'https://jobs.example/2', source: 'other' }]).length, 2);
  }
});

test('cross-board duplicates preserve identity, provenance and richer information', () => {
  const a = { id: 'accepted-pack', company: 'Fictional Labs', title: 'Engineer', location: 'Berlin', requisitionId: 'R1', source: 'a', url: 'https://a.example/1' };
  const b = { ...a, id: 'new', source: 'b', url: 'https://b.example/2', description: 'Complete posting', salary: 'Published range' };
  const [merged] = mergeJobArchives([a], [b]);
  assert.equal(merged.id, a.id); assert.equal(merged.description, b.description);
  assert.equal(merged.provenance.length, 2); assert.ok(merged.mergedIds.includes(b.id));
  assert.equal(mergeJobArchives([a, { ...a, id: 'other-existing-pack' }], []).length, 2);
});

test('dedupe keeps a JobSpy description when a later Apify copy is empty', () => {
  const jobs = [
    {
      id: 'js',
      via: 'jobspy',
      url: 'https://www.linkedin.com/jobs/view/1',
      title: 'Software Engineer',
      company: 'Acme',
      description: 'Build APIs in Berlin. Python and FastAPI.',
    },
    {
      id: 'ap',
      via: 'apify',
      url: 'https://www.linkedin.com/jobs/view/1',
      title: 'Software Engineer',
      company: 'Acme',
      description: null,
    },
  ];
  const out = dedupeJobs(jobs);
  assert.equal(out.length, 1);
  assert.equal(out[0].via, 'apify');
  assert.match(out[0].description, /Build APIs/);
});

test('mergeJobArchives prefers the longer description from either copy', () => {
  const previous = [
    {
      id: 'old',
      via: 'html',
      url: 'https://example.com/jobs/1',
      title: 'Backend Engineer',
      company: 'Beta',
      description: 'Short teaser.',
      salary: null,
    },
  ];
  const next = [
    {
      id: 'new',
      via: 'html',
      url: 'https://example.com/jobs/1',
      title: 'Backend Engineer',
      company: 'Beta',
      description: 'Full posting: own APIs, Postgres, and on-call in Berlin.',
      salary: '70k EUR',
    },
  ];
  const merged = mergeJobArchives(previous, next, { fetchedAt: '2026-09-07T00:00:00.000Z' });
  assert.equal(merged.length, 1);
  assert.match(merged[0].description, /Full posting/);
  assert.equal(merged[0].salary, '70k EUR');
});
