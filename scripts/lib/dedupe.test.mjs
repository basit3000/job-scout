import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeJobs, mergeJobArchives } from './dedupe.mjs';

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
