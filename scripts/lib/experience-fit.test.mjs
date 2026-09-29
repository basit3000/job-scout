import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateExperience, extractExperienceRequirements, assessExperience } from './experience-fit.mjs';
import { scoreJob } from './fit.mjs';
import { rankJobs, rankingEvidence } from './rank.mjs';

const now = new Date('2026-01-01T00:00:00Z');
const profile = { targetRole: 'Software Developer', skills: { strong: ['Python', 'SQL', 'Docker'] },
  experience: [
    { title: 'Software Developer', org: 'Example A', from: '01/2023', to: '12/2023' },
    { title: 'Working Student Developer', org: 'Example B', from: '2024-01', to: '2024-12' },
    { title: 'Software Developer', org: 'Example C', from: 'Jan 2025', to: 'Present', employmentType: 'Full-time' },
  ] };
const posting = (description) => ({ title: 'Software Developer', description: 'Python SQL Docker. ' + description });
const fit = (description, p = profile) => scoreJob(posting(description), p, '', { now });

test('employment duration merges overlaps, excludes gaps and personal projects, and labels student time', () => {
  const result = candidateExperience({ experience: [...profile.experience,
    { title: 'Developer', from: '06/2024', to: '06/2025' },
    { title: 'Personal project', from: '01/2010', to: 'present' },
  ] }, { now });
  assert.equal(result.years, 3);
  assert.match(result.notes.join(' '), /not full-time-equivalent/);
  assert.match(result.notes.join(' '), /Personal projects excluded/);
  assert.equal(candidateExperience({ experience: [profile.experience[0], profile.experience[2]] }, { now }).years, 2);
});

test('missing/ambiguous/future dates are unknown rather than fabricated zero years', () => {
  const result = candidateExperience({ experience: [{ from: '2020', to: '2022' }, { from: '01/2030', to: 'present' }] }, { now });
  assert.equal(result.years, null);
  assert.equal(result.incomplete, true);
  assert.equal(assessExperience(posting('3 years of experience'), {}, 'Experience 2020–2024', { now }).requirements[0].status, 'needs-checking');
});

test('day-precision dates do not inflate short assignments into whole months', () => {
  const result = candidateExperience({ experience: [{ from: '2024-01-31', to: '2024-02-01' }] }, { now });
  assert.ok(result.years > 0 && result.years < 0.01);
  assert.equal(candidateExperience({ experience: [{ from: '2024-02-31', to: '2024-03-01' }] }, { now }).years, null);
});

test('explicit zero is known and contradictions in totals stay visible', () => {
  assert.equal(candidateExperience({ experienceYears: 0 }, { now }).years, 0);
  const result = assessExperience(posting('3 years of experience'), { ...profile, experienceYears: 0 }, '', { now });
  assert.equal(result.requirements[0].status, 'needs-checking');
  assert.match(result.candidate.notes.join(' '), /differ/);
});

test('experience requirement parser handles ranges, words, decimal years, reversed forms and German', () => {
  for (const [description, min, max] of [
    ['3–5 years of professional experience required', 3, 5],
    ['at least two years of experience', 2, null],
    ['1.5 years of experience', 1.5, null],
    ['Experience: at least 4 years', 4, null],
    ['Mindestens drei Jahre Berufserfahrung', 3, null],
    ['2+ years in Python', 2, null],
  ]) {
    const requirements = extractExperienceRequirements({ description });
    assert.equal(requirements.length, 1, description);
    assert.equal(requirements[0].minYears, min, description);
    assert.equal(requirements[0].maxYears, max, description);
  }
  assert.equal(extractExperienceRequirements({ yearsExperience: '2-4' })[0].minYears, 2);
});

test('company history, optional requirements, and no-experience adverts are distinguished', () => {
  assert.equal(extractExperienceRequirements({ description: 'Our company has 35 years of experience.' }).length, 0);
  assert.equal(extractExperienceRequirements({ description: 'Dahinter stehen 35 Jahre Erfahrung und ein treuer Kundenstamm.' }).length, 0);
  assert.equal(extractExperienceRequirements({ description: 'No experience required. 30 days of holiday.' }).length, 0);
  assert.equal(extractExperienceRequirements({ description: '5 years of experience preferred.' })[0].optional, true);
  const required = fit('5 years of experience required');
  const preferred = fit('5 years of experience preferred');
  assert.ok(preferred.score > required.score);
  assert.notEqual(preferred.verdict, 'No');
  assert.equal(preferred.eligibility.status, 'matched');
});

test('mixed required/preferred tenure and alternative qualifications remain separate', () => {
  const checks = extractExperienceRequirements({ description: '2 years of experience required, 5 years in Python preferred' });
  assert.equal(checks[0].optional, false);
  assert.equal(checks[1].optional, true);
  assert.equal(fit('5 years of experience or equivalent education').eligibility.requirements[0].status, 'needs-checking');
  assert.equal(fit('Mehrjährige Berufserfahrung erforderlich').eligibility.requirements[0].status, 'needs-checking');
  assert.equal(extractExperienceRequirements({ description: 'Python experience: at least 4+ years of professional experience building APIs' }).length, 1);
  assert.equal(extractExperienceRequirements({ description: '3 years of experience required with backend systems ' + 'and other responsibilities '.repeat(10) + 'German preferred' })[0].optional, false);
});

test('meeting a general minimum succeeds without assuming tenure in a particular technology', () => {
  assert.equal(fit('3 years of experience required').eligibility.status, 'matched');
  assert.equal(fit('3 years of experience in software development').eligibility.status, 'matched');
  for (const description of ['3 years of Python experience', '3 years of experience with Python', '3 years of full-time experience']) {
    assert.equal(fit(description).eligibility.status, 'needs-checking', description);
  }
  assert.equal(fit('1 year of full-time experience').eligibility.status, 'matched');
});

test('experience shortfalls affect order even for older jobs with previously high scores', () => {
  const jobs = [
    { ...posting('8 years of experience required'), id: 'high', ageDays: 1, score: 100 },
    { ...posting('3 years of experience required'), id: 'match', ageDays: 90, score: 1 },
    { ...posting('4 years of experience required'), id: 'stretch', ageDays: 20, score: 99 },
  ];
  const ranked = rankJobs(jobs, profile, '', { now });
  assert.deepEqual(ranked.map((j) => j.id), ['match', 'stretch', 'high']);
  assert.equal(ranked[2].fit, 'No');
  assert.equal(ranked[1].fit, 'Stretch');
  assert.equal(ranked[0].experience.years, 3);
  assert.ok(ranked[1].gaps.some((g) => /below the requested minimum/.test(g)));
});

test('unknown tenure or an incomplete timeline does not establish an experience mismatch', () => {
  assert.equal(fit('5 years of experience', { ...profile, experience: [] }).eligibility.status, 'needs-checking');
  assert.equal(fit('5 years of experience', { ...profile, experience: [...profile.experience, { title: 'Earlier role' }] }).eligibility.requirements[0].status, 'needs-checking');
});

test('candidate preferences, learning lists, comments and other CV variants do not prove skills', () => {
  const evidence = rankingEvidence({
    '.workspace/overleaf/ats.tex': '% Do not invent Kubernetes experience\nBuilt Python services.',
    '.workspace/overleaf/main.tex': 'Old Kubernetes claim',
    'memory/preferences': 'Emphasize Kubernetes',
    'memory/facts': JSON.stringify({ skills: { learning: ['Kubernetes'] } }),
  });
  assert.doesNotMatch(evidence, /Kubernetes/);
  const result = scoreJob(posting('Kubernetes required'), { ...profile, skills: { strong: ['Python'], learning: ['Kubernetes'] } }, evidence, { now });
  assert.ok(!result.matched.includes('Kubernetes'));
  assert.notEqual(result.verdict, 'Strong');
});

test('German-language proficiency requirements affect fit', () => {
  const candidate = { ...profile, languages: { German: 'A2' } };
  assert.equal(fit('Deutsch C1 erforderlich', candidate).verdict, 'No');
  assert.equal(fit('Verhandlungssicheres Deutsch erforderlich', candidate).verdict, 'No');
  assert.notEqual(fit('Deutsch optional', candidate).verdict, 'No');
});
