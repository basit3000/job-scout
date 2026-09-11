import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportCvDownloads, exportCoverLetterDownloads, jobDownloadFolder } from './cv-downloads.mjs';
import { generateDocuments, inspectDocuments, prepFingerprint, assessPrep } from './prep-state.mjs';
import { scoreJob } from './fit.mjs';
import { currentSearchState } from './current-search.mjs';
import { extractPdfText } from './pdf-text.mjs';
import { withMatchingAnswers } from './match-requirements.mjs';

import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';

async function temporary(t) {
  const dir = await mkdtemp(join(tmpdir(), 'job-scout-workflow-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('different jobs at one company retain their own exported CV and letter', async (t) => {
  const root = await temporary(t);
  const src = join(root, 'source.pdf');
  const opts = { company: 'Example', profileName: 'Test Candidate', jobTitle: 'Engineer', exportRoot: root };
  await writeFile(src, 'first CV');
  const first = await exportCvDownloads({ ...opts, jobId: 'board:1', atsPdfPath: src });
  await exportCoverLetterDownloads({ ...opts, jobId: 'board:1', mdText: 'first letter' });
  await writeFile(src, 'second CV');
  const second = await exportCvDownloads({ ...opts, jobId: 'board:2', atsPdfPath: src });
  await exportCoverLetterDownloads({ ...opts, jobId: 'board:2', mdText: 'second letter' });
  assert.notEqual(first.dir, second.dir);
  assert.equal(await readFile(first.ats, 'utf8'), 'first CV');
  assert.equal(await readFile(join(first.dir, 'Anschreiben_Test_Candidate.md'), 'utf8'), 'first letter\n');
  assert.equal(await readFile(second.ats, 'utf8'), 'second CV');
  assert.notEqual(jobDownloadFolder({ ...opts, jobId: 'a/b' }), jobDownloadFolder({ ...opts, jobId: 'a:b' }));
  assert.ok(!jobDownloadFolder({ ...opts, company: '..', jobId: 'x' }).startsWith('..'));
});

const profile = { name: 'Test Candidate', targetRole: 'Backend Engineer', seniority: 'mid',
  search: { titles: ['Backend Engineer'] }, skills: { strong: ['Python', 'SQL', 'Docker', 'AWS'] } };
const job = { id: 'fixture:1', title: 'Backend Engineer', company: 'Example', description: 'Build Python SQL Docker AWS services.', url: 'https://example.com/job' };

test('overflow and failed replacements preserve both the accepted CV and complete draft', async (t) => {
  const root = await temporary(t);
  const options = { root, job, profile, settings: { source: 'local' }, scopes: ['cv'], mode: 'fast' };
  const accepted = await generateDocuments(options, async (dir) => {
    await writeFile(join(dir, 'cv.pdf'), pdfFixture(['Accepted CV']));
    return {};
  });
  assert.equal(accepted.needsReview, false);
  const original = await readFile(join(accepted.dir, 'cv.pdf'));
  const rejected = await generateDocuments(options, async (dir) => {
    assert.deepEqual(await readFile(join(accepted.dir, 'cv.pdf')), original, 'accepted pack remains readable during generation');
    await writeFile(join(dir, 'cv.pdf'), pdfFixture(['First page', 'Experience continued on page two']));
    return {};
  });
  assert.equal(rejected.needsReview, true);
  assert.equal(rejected.preservedPrevious, true);
  assert.deepEqual(await readFile(join(accepted.dir, 'cv.pdf')), original);
  const draft = await extractPdfText(join(rejected.draftDir, 'cv.pdf'));
  assert.equal(draft.pages, 2);
  assert.match(draft.text, /Experience continued on page two/);
  await assert.rejects(generateDocuments(options, async (dir) => {
    await writeFile(join(dir, 'cv.pdf'), 'broken');
    throw new Error('renderer failed');
  }), /renderer failed/);
  assert.deepEqual(await readFile(join(accepted.dir, 'cv.pdf')), original);
  const replaced = await generateDocuments(options, async (dir) => {
    await writeFile(join(dir, 'cv.pdf'), pdfFixture(['New accepted CV']));
    return {};
  });
  assert.equal(replaced.needsReview, false);
  assert.deepEqual(await readFile(join(replaced.previousDir, 'cv.pdf')), original);
});

test('missing or unreadable PDFs need review, and overflow letters keep their closing', async (t) => {
  const dir = await temporary(t);
  assert.equal((await inspectDocuments(dir, ['cv'])).cv.needsReview, true);
  await writeFile(join(dir, 'cv.pdf'), 'invalid PDF');
  assert.equal((await inspectDocuments(dir, ['cv'])).cv.needsReview, true);
  await writeFile(join(dir, 'cover-letter.pdf'), pdfFixture(['Dear recruiter', 'Yours sincerely Test Candidate']));
  assert.equal((await inspectDocuments(dir, ['letter'])).letter.needsReview, true);
  assert.match((await extractPdfText(join(dir, 'cover-letter.pdf'))).text, /Yours sincerely/);
});

test('CV and experience evidence improve matching without treating the posting as candidate evidence', () => {
  const p = { ...profile, skills: { strong: [] } };
  const baseline = scoreJob(job, p);
  const evidenced = scoreJob(job, p, 'Built Python and SQL services.');
  assert.ok(evidenced.score > baseline.score);
  assert.ok(evidenced.matched.includes('Python'));
  assert.ok(!baseline.matched.includes('Python'));
  assert.ok(!evidenced.matched.includes('Docker'));
  assert.ok(scoreJob(job, { ...p, experience: [{ bullets: ['Built Python services'] }] }).matched.includes('Python'));
});

test('mandatory mismatches and unknown requirements cannot become Strong through keyword volume', () => {
  const posting = { ...job, title: 'Senior Backend Engineer', description: `${job.description} Fluent German C1 and ten years of experience required.` };
  const mismatch = scoreJob(posting, { ...profile, constraints: { notes: ['English only; no German'] } });
  assert.equal(mismatch.verdict, 'No');
  assert.equal(mismatch.eligibility.status, 'incompatible');
  const unknown = scoreJob(posting, profile);
  assert.notEqual(unknown.verdict, 'Strong');
  assert.equal(unknown.eligibility.status, 'needs-checking');
  const missingSkill = scoreJob({ ...job, description: `${job.description} Kubernetes required.` }, profile);
  assert.notEqual(missingSkill.verdict, 'Strong');
  assert.match(missingSkill.gaps.join(' '), /Kubernetes required/);
  assert.equal(scoreJob({ ...job, description: `${job.description} German preferred.` }, profile).verdict, 'Strong');
  assert.equal(scoreJob({ ...job, description: `${job.description} No visa sponsorship.` }, { ...profile, constraints: { needsSponsorship: true } }).verdict, 'No');
  const alternatives = scoreJob({ ...job, description: `${job.description} English or German required.` }, { ...profile, constraints: { notes: ['English only; no German'] } });
  assert.notEqual(alternatives.eligibility.status, 'incompatible');
  const qualified = scoreJob({ ...job, description: `${job.description} German C1 required.` }, { ...profile, languages: { German: 'C1' } });
  assert.equal(qualified.eligibility.status, 'matched');
  assert.equal(qualified.verdict, 'Strong');
  assert.equal(withMatchingAnswers(profile, { needsSponsorship: 'yes' }).constraints.needsSponsorship, true);
  assert.equal(withMatchingAnswers(profile, { needsSponsorship: 'depends' }).constraints.needsSponsorship, null);
});

test('C++ and C# are matched as complete skills', () => {
  const fit = scoreJob({ ...job, description: 'C++ and C#' }, { ...profile, skills: { strong: ['C++', 'C#'] } });
  assert.deepEqual(fit.matched, ['C++', 'C#']);
});

test('generation fingerprints detect changed inputs and keep CV and letter freshness independent', () => {
  const context = { job, profile, settings: { source: 'local' }, inputs: { 'cv/resume.md': 'CV', 'cv/cover-letter.md': 'Letter' } };
  const manifest = Object.fromEntries(['cv', 'letter'].map((scope) => [scope, {
    fingerprint: prepFingerprint({ ...context, scope, instructions: 'Be concise', mode: 'fast' }), instructions: 'Be concise', mode: 'fast',
  }]));
  assert.deepEqual(assessPrep(manifest, context), { cv: 'current', letter: 'current' });
  for (const changed of [
    { ...context, job: { ...job, description: 'Changed requirements' } },
    { ...context, profile: { ...profile, name: 'Updated name' } },
    { ...context, inputs: { ...context.inputs, 'cv/resume.md': 'New achievement' } },
    { ...context, settings: { source: 'overleaf' } },
  ]) assert.equal(assessPrep(manifest, changed).cv, 'outdated');
  assert.equal(assessPrep(manifest, context, { instructions: 'Emphasize leadership' }).cv, 'outdated');
  assert.equal(assessPrep(manifest, context, { mode: 'agent' }).cv, 'outdated');
  const letterChanged = { ...context, inputs: { ...context.inputs, 'cv/cover-letter.md': 'Updated letter' } };
  assert.deepEqual(assessPrep(manifest, letterChanged), { cv: 'current', letter: 'outdated' });
  assert.equal(assessPrep(null, context).cv, 'outdated', 'legacy packs need revalidation');
});

test('current search excludes old and mismatched archive jobs without deleting history', () => {
  const market = { locationPatterns: ['Berlin', 'Germany'], excludeLocationPatterns: ['London'] };
  const config = { filters: { maxAgeDays: 14, countryOnly: true } };
  const p = { ...profile, search: { includeTitlePatterns: ['Backend'], excludeTitlePatterns: ['Sales'] }, constraints: { excludeCompanies: ['Excluded'] } };
  const fresh = { ...job, location: 'Berlin', postedAt: new Date().toISOString(), lastSeenAt: '2026-01-01T00:00:00Z' };
  const old = { ...fresh, postedAt: '2020-01-01' };
  const archive = [fresh, old, { ...fresh, title: 'Sales Manager' }, { ...fresh, location: 'London' }, { ...fresh, company: 'Excluded' }];
  assert.equal(archive.filter((j) => currentSearchState(j, p, config, market).current).length, 1);
  assert.equal(archive.length, 5);
  assert.equal(currentSearchState(fresh, p, config, market).current, true, 'not recently seen does not mean closed');
  assert.equal(currentSearchState({ ...fresh, postedAt: null }, p, config, market).ageDays, null);
});
