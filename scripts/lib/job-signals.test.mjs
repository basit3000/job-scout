import test from 'node:test';
import assert from 'node:assert/strict';
import { postingDate, postingAge, parseApplicants, sourceSignals, opportunityFor } from './job-signals.mjs';
import { normalise } from './common.mjs';
import { mergeJobArchives } from './dedupe.mjs';
import { rankJobs } from './rank.mjs';
import { scoreJob } from './fit.mjs';
import { sortJobs } from './job-sort.mjs';

const NOW = '2026-10-06T12:00:00.000Z';
const now = Date.parse(NOW);
const observation = (value, observedAt = NOW) => sourceSignals({ applicants: value, board: 'linkedin', url: 'https://www.linkedin.com/jobs/view/123', scrapedAt: observedAt }, NOW).applicants;

test('dates cover ISO, RSS, English and German relative ages without guessing unknown labels', () => {
  for (const text of ['5 days ago', 'Posted 5 days ago', 'vor 5 Tagen']) {
    assert.deepEqual(postingDate(text, NOW), { postedAt: '2026-10-01T12:00:00.000Z', postedAtApproximate: true });
  }
  assert.equal(postingAge(postingDate('2 weeks ago', NOW), now), 14);
  assert.equal(postingAge(postingDate('vor 2 Stunden', NOW), now), 0);
  assert.equal(postingAge(postingDate('yesterday', NOW), now), 1);
  assert.equal(postingAge(postingDate('Thu, 01 Oct 2026 12:00:00 GMT', NOW), now), 5);
  assert.equal(postingDate('2026-10-01', NOW).postedAtApproximate, false);
  for (const value of [null, '', 'N/A', '30', 30, 'promoted']) assert.equal(postingDate(value, NOW).postedAt, null);
  assert.equal(postingDate('99999999999999999999 days ago', NOW).postedAt, null);
  assert.equal(sourceSignals({ ageDays: '' }, NOW).postedAt, null);
  assert.equal(sourceSignals({ ageDays: false }, NOW).postedAt, null);
  assert.equal(sourceSignals({ postedAt: '', datePosted: '5 days ago' }, NOW).postedAt, '2026-10-01T12:00:00.000Z');
  assert.equal(postingAge({ lastSeenAt: NOW }, now), null);
  assert.equal(postingAge({ postedAt: '2027-01-01' }, now), null);
});

test('applicant bounds, zero and unknown values are kept distinct', () => {
  assert.equal(parseApplicants(0).count, 0);
  assert.equal(parseApplicants('20 applicants').relation, 'exact');
  assert.equal(parseApplicants('Be among the first 25 applicants').relation, 'less-than');
  assert.equal(parseApplicants('Under 10 applicants').relation, 'less-than');
  assert.equal(parseApplicants('Over 200 applicants').relation, 'more-than');
  assert.equal(parseApplicants('200+').relation, 'at-least');
  assert.equal(parseApplicants('20').label, '20 applicants');
  assert.equal(parseApplicants('1,234 applicants').count, 1234);
  for (const value of [null, '', 'Apply now', 'No longer accepting applications', '20 views', '-1', -1, 1.5, '10-20 applicants', {}, true]) assert.equal(parseApplicants(value), null);
});

test('normalisation preserves observations across adapters and repeated normalisation', () => {
  const raw = { id: 'a', board: 'linkedin', postedAt: '5 days ago', applicantCount: 'Under 25 applicants', scrapedAt: NOW, url: 'https://www.linkedin.com/jobs/view/123' };
  const first = normalise(raw);
  const second = normalise(first);
  assert.deepEqual(second, first);
  assert.equal(second.applicants.count, 25);
  assert.equal(second.applicants.observedAt, NOW);
  assert.equal(second.postedAtApproximate, true);
  for (const key of ['applicantCount', 'applicantsCount', 'numApplicants', 'num_applicants', 'applicants_count', 'applicant_count']) {
    assert.equal(sourceSignals({ [key]: 10 }, NOW).applicants.count, 10);
  }
  const zero = sourceSignals({ applicantCount: 0 }, NOW);
  assert.equal(zero.applicants.count, 0);
  assert.equal(normalise({ board: 'indeed' }).applicants, null);
});

test('archive refresh updates rising counts, retains evidence on failed refresh and preserves cross-board provenance', () => {
  const base = { id: 'a', board: 'linkedin', postedAt: '2026-10-01', applicants: observation(10, '2026-10-05T12:00:00.000Z') };
  const [updated] = mergeJobArchives([base], [{ ...base, applicants: observation('Over 200 applicants') }], { fetchedAt: NOW });
  assert.equal(updated.applicants.count, 200);
  const [missing] = mergeJobArchives([updated], [{ ...base, applicants: null }], { fetchedAt: NOW });
  assert.deepEqual(missing.applicants, updated.applicants);
  const [crossBoard] = mergeJobArchives([{ ...base, board: 'indeed', applicants: null }], [base], { fetchedAt: NOW });
  assert.equal(crossBoard.applicants.source, 'linkedin');
  assert.match(crossBoard.applicants.url, /linkedin/);
});

test('opportunity rewards low counts on older recent jobs, never treats unknown/stale/lower bounds as low', () => {
  const job = { postedAt: '2026-10-01T12:00:00Z', applicants: observation(20) };
  assert.equal(opportunityFor(job, now).bonus, 7);
  assert.equal(opportunityFor({ ...job, postedAt: '2026-10-03T12:00:00Z' }, now).bonus, 8);
  assert.equal(opportunityFor({ ...job, postedAt: '2026-09-16T12:00:00Z' }, now).bonus, 5);
  assert.equal(opportunityFor({ ...job, postedAt: '2026-08-01' }, now).bonus, 0);
  assert.equal(opportunityFor({ applicants: observation(10) }, now).bonus, 0);
  for (const applicants of [null, observation(100), observation('Over 10 applicants'), observation('10+'), observation(10, '2026-09-01T12:00:00Z'), observation(10, '2026-10-07T12:00:00Z')]) {
    assert.equal(opportunityFor({ ...job, applicants }, now).bonus, 2);
  }
});

test('CLI and UI ranking use the same bonus without changing fit or bypassing eligibility', () => {
  const profile = { targetRole: 'Software Developer', skills: { strong: ['Python', 'SQL'] } };
  const base = { title: 'Software Developer', description: 'Build Python and SQL services.', postedAt: '2026-10-01T12:00:00Z' };
  const jobs = [{ ...base, id: 'busy', applicants: observation(200) }, { ...base, id: 'quiet', applicants: observation(10) }, { ...base, id: 'gate', applicants: observation(0), flags: ['nationals-only'] }];
  const ranked = rankJobs(jobs, profile, '', { now: new Date(NOW) });
  const ui = sortJobs(jobs.map(job => ({ ...job, fit: scoreJob(job, profile, '', { now: new Date(NOW) }) })));
  assert.deepEqual(ranked.map(j => j.id), ['quiet', 'busy', 'gate']);
  assert.deepEqual(ui.map(j => j.id), ranked.map(j => j.id));
  assert.equal(ranked[0].score, ranked[1].score);
  assert.equal(ranked[0].fit, ranked[1].fit);
  assert.equal(ranked[2].fit, 'No');
});
