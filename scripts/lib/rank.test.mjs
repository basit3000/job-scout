import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankJobs, shortDescription, summariseRanking } from './rank.mjs';
import { scoreJob } from './fit.mjs';

const PROFILE = {
  targetRole: 'Software Developer',
  seniority: 'junior',
  search: { titles: ['Software Developer'] },
  skills: { strong: ['Python', 'FastAPI'], familiar: ['Docker'], learning: [] },
};

describe('rankJobs uses scoreJob', () => {
  it('gives the same score and verdict as the UI scorer', () => {
    const job = {
      id: 'a',
      title: 'Software Developer',
      description: 'Python FastAPI Docker. Build APIs.',
      flags: [],
      ageDays: 4,
    };
    const ui = scoreJob(job, PROFILE, 'Python FastAPI evidence');
    const [ranked] = rankJobs([job], PROFILE, 'Python FastAPI evidence');
    assert.equal(ranked.score, ui.score);
    assert.equal(ranked.fit, ui.verdict);
    assert.deepEqual(ranked.matched, ui.matched);
  });

  it('sorts Strong before No even if the No row has a leftover high score shape', () => {
    const jobs = [
      {
        id: 'gate',
        title: 'Software Developer',
        description: 'Python FastAPI',
        flags: ['nationals-only'],
        ageDays: 1,
      },
      {
        id: 'ok',
        title: 'Software Developer',
        description: 'Python FastAPI Docker backend',
        flags: [],
        ageDays: 10,
      },
    ];
    const ranked = rankJobs(jobs, PROFILE);
    assert.equal(ranked[0].id, 'ok');
    assert.equal(ranked[1].id, 'gate');
    assert.equal(ranked[1].fit, 'No');
  });

  it('counts No instead of Weak', () => {
    const ranked = rankJobs(
      [{ id: 'x', title: 'Unrelated Chef', description: 'Kitchen', flags: ['nationals-only'] }],
      PROFILE,
    );
    const summary = summariseRanking(ranked);
    assert.equal(summary.counts.No, 1);
    assert.equal(summary.counts.Strong, 0);
    assert.equal(summary.counts.Weak, undefined);
  });
});

describe('shortDescription', () => {
  it('keeps the first sentences and strips markdown', () => {
    assert.match(
      shortDescription('Hello world. Second sentence! ![x](y) more.'),
      /^Hello world\. Second sentence!/,
    );
  });
});
