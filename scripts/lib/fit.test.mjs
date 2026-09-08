import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  jobTitleAboveProfileSeniority,
  jobTitleSeniorityRank,
  profileSeniorityRank,
} from './fit.mjs';

describe('seniority vs profile', () => {
  it('reads the candidate target from profile.seniority', () => {
    assert.equal(profileSeniorityRank('junior'), 2);
    assert.equal(profileSeniorityRank('mid'), 3);
    assert.equal(profileSeniorityRank('senior'), 4);
    assert.equal(profileSeniorityRank('any'), Number.POSITIVE_INFINITY);
    assert.equal(profileSeniorityRank('YOUR_SENIORITY'), null);
    assert.equal(profileSeniorityRank(''), null);
  });

  it('does not treat untitled roles as above target', () => {
    assert.equal(jobTitleSeniorityRank('Software Developer'), null);
    assert.equal(jobTitleAboveProfileSeniority('Software Developer', 'junior'), false);
  });

  it('penalises only titles above the profile target', () => {
    assert.equal(jobTitleAboveProfileSeniority('Senior Software Engineer', 'junior'), true);
    assert.equal(jobTitleAboveProfileSeniority('Senior Software Engineer', 'mid'), true);
    assert.equal(jobTitleAboveProfileSeniority('Senior Software Engineer', 'senior'), false);
    assert.equal(jobTitleAboveProfileSeniority('Lead Engineer', 'senior'), true);
    assert.equal(jobTitleAboveProfileSeniority('Junior Developer', 'mid'), false);
    assert.equal(jobTitleAboveProfileSeniority('Staff Engineer', 'any'), false);
  });
});
