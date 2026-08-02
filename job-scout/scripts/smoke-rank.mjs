import { rankJobs, shortDescription } from './lib/rank.mjs';

const profile = {
  targetRole: 'Staff Nurse',
  search: {
    titles: ['Staff Nurse', 'ER Nurse'],
    includeTitlePatterns: ['nurse|nursing'],
  },
  skills: { strong: ['triage', 'ACLS', 'ER'], familiar: [] },
};

const jobs = [
  {
    id: '1',
    title: 'ER Staff Nurse',
    company: 'City Hospital',
    location: 'Dubai',
    description: 'Seeking an ER nurse with triage and ACLS. Join our emergency department team immediately.',
    flags: [],
    ageDays: 2,
    url: 'https://example.com/1',
    board: 'indeed',
    via: 'jobspy',
  },
  {
    id: '2',
    title: 'Sales Manager',
    company: 'Corp',
    location: 'Dubai',
    description: 'Sell software to enterprises across the region with a hungry team.',
    flags: [],
    ageDays: 5,
    url: 'https://example.com/2',
    board: 'linkedin',
    via: 'jobspy',
  },
  {
    id: '3',
    title: 'Registered Nurse',
    company: 'Clinic',
    location: 'Abu Dhabi',
    description: 'UAE Nationals Only. Ward nursing role requiring local experience.',
    flags: ['nationals-only', 'local-experience-required'],
    ageDays: 1,
    url: 'https://example.com/3',
    board: 'bayt',
    via: 'apify',
  },
];

const ranked = rankJobs(jobs, profile, 'ER nurse with triage ACLS experience');
console.log(ranked.map((j) => ({ title: j.title, fit: j.fit, score: j.score, blurb: shortDescription(j.description, 80) })));
if (ranked[0].title !== 'ER Staff Nurse') {
  console.error('Expected ER Staff Nurse on top');
  process.exit(1);
}
if (ranked.find((j) => j.id === '3').fit === 'Strong') {
  console.error('Nationals-only should not be Strong');
  process.exit(1);
}
console.log('smoke-rank ok');
