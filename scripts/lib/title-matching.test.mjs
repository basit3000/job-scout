import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSearchTitles, matchesTitlePatterns, titleVariants } from './title-matching.mjs';
import { currentSearchState } from './current-search.mjs';
import { companyQueries, fetchCompanyCareers } from './company-careers.mjs';
import { scoreJob } from './fit.mjs';

const profile = { targetRole: 'Software Engineer', seniority: 'junior', skills: { strong: ['Python', 'SQL'] },
  search: { titles: ['Software Engineer'], includeTitlePatterns: ['software\\s+engineer'], excludeTitlePatterns: ['senior|intern|embedded'] } };
const market = { id: 'DE', slug: 'de', shortName: 'Germany', locationPatterns: ['Germany'], excludeLocationPatterns: [] };

test('recognizes common wording without changing the actual title or qualifiers', () => {
  const title = 'Junior Software Development Engineer II (m/f/d)';
  assert.deepEqual(titleVariants(title), [title, 'Junior Software Engineer II (m/f/d)']);
  assert.equal(matchesTitlePatterns(title, [/software engineer/i]), true);
  assert.equal(matchesTitlePatterns('Software Dev Engineer', [/software engineer/i]), true);
  assert.equal(matchesTitlePatterns('Back-end Developer', [/backend developer/i]), true);
  assert.equal(matchesTitlePatterns('Fullstack Developer', [/full stack developer/i]), true);
  for (const unrelated of ['Product Engineer', 'Founding Engineer', 'Civil Engineer', 'DevOps Engineer', 'SDE']) {
    assert.equal(matchesTitlePatterns(unrelated, [/software engineer/i]), false);
  }
});

test('current search and ranking agree about equivalent titles; exclusions still win', () => {
  const job = { title: 'Software Development Engineer', location: 'Germany', description: 'Build Python services and SQL data models.' };
  assert.equal(currentSearchState(job, profile, {}, market).current, true);
  assert.equal(scoreJob(job, profile).score, scoreJob({ ...job, title: 'Software Engineer' }, profile).score);
  for (const qualifier of ['Senior', 'Intern', 'Embedded']) {
    assert.ok(currentSearchState({ ...job, title: `${qualifier} ${job.title}` }, profile, {}, market).reasons.includes('Excluded title'));
  }
});

test('query expansion preserves specialty and seniority, deduplicates, leaves other professions alone', () => {
  assert.deepEqual(expandSearchTitles(['Junior Software Engineer', 'Junior Software Development Engineer', 'Nurse']),
    ['Junior Software Engineer', 'Junior Software Development Engineer', 'Nurse']);
  assert.deepEqual(expandSearchTitles(['Python Software Engineer']), ['Python Software Engineer', 'Python Software Development Engineer']);
  assert.equal(companyQueries({ companies: [{ name: 'Example' }] }, profile)[0].titles.length, 2);
});

test('company feed retains an equivalent title and rejects its senior variant', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ jobs: [
    { id: 1, title: 'Software Development Engineer', location: { name: 'Germany' }, absolute_url: 'https://example.org/jobs/1', content: 'Python services' },
    { id: 2, title: 'Senior Software Development Engineer', location: { name: 'Germany' }, absolute_url: 'https://example.org/jobs/2', content: 'Python services' },
  ] })));
  const [query] = companyQueries({ companies: [{ name: 'Example', tenant: 'example', provider: 'greenhouse' }] }, profile);
  const jobs = await fetchCompanyCareers(query, {}, market);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Software Development Engineer');
});
