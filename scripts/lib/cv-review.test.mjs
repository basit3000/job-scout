import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  copyAcceptedLetter,
  formatFixInstructions,
  parseReviewMarkdown,
  restoreAcceptedLetter,
} from './cv-review.mjs';

const SAMPLE = `# Review — Backend Engineer @ Acme

Verdict: revise
ATS: 6/10
Posting fit: 7/10
Recruiter scan: 5/10
Cover letter: 8/10

## Must fix
- Put FastAPI in the first current-role bullet (ats.tex).
- Mirror "REST API" spelling in the PD-League project bullet.

## Should fix
- Drop the filler "robust" if it is still there.

## Fine as-is
- Headline already matches the posting title.

## Gaps (do not invent)
- No Kubernetes evidence — leave it off.
`;

describe('parseReviewMarkdown', () => {
  it('reads verdict, scores, and must-fix bullets', () => {
    const r = parseReviewMarkdown(SAMPLE);
    assert.equal(r.verdict, 'revise');
    assert.equal(r.scores.ats, 6);
    assert.equal(r.scores.postingFit, 7);
    assert.equal(r.scores.recruiterScan, 5);
    assert.equal(r.scores.coverLetter, 8);
    assert.equal(r.mustFix.length, 2);
    assert.match(r.mustFix[0], /FastAPI/);
    assert.equal(r.gaps.length, 1);
    assert.match(r.gaps[0], /Kubernetes/);
  });

  it('rejects contradictory or incomplete review output', () => {
    const r = parseReviewMarkdown(`Verdict: revise\nATS: 9/10\n\n## Must fix\n- _none_\n`);
    assert.equal(r.verdict, 'not_reviewed');
    assert.equal(r.mustFix.length, 0);
  });

  it('treats pass-with-nits as pass', () => {
    const r = parseReviewMarkdown(`Verdict: pass\nATS: 9/10\nPosting fit: 8/10\nRecruiter scan: 8/10\n\n## Must fix\n- _none_\n\n## Should fix\n- Shorten bullet 3.\n`);
    assert.equal(r.verdict, 'pass');
    assert.equal(r.shouldFix.length, 1);
  });
});

describe('formatFixInstructions', () => {
  it('asks the writer to apply only must-fix items', () => {
    const text = formatFixInstructions(
      { mustFix: ['Put FastAPI in bullet 1.'] },
      'Lead with backend',
    );
    assert.match(text, /Lead with backend/);
    assert.match(text, /ONLY the Must fix/);
    assert.match(text, /Put FastAPI/);
    assert.match(text, /Leave Should fix alone/);
  });
});

describe('accepted letter copy/restore', () => {
  it('round-trips a letter through accepted/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'js-review-'));
    try {
      await copyAcceptedLetter(dir, 'Hello\n');
      await writeFile(join(dir, 'cover-letter.md'), 'CHANGED\n');
      const restored = await restoreAcceptedLetter(dir);
      assert.equal(restored.trim(), 'Hello');
      assert.equal((await readFile(join(dir, 'cover-letter.md'), 'utf8')).trim(), 'Hello');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
