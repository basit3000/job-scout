import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runReviewerPass, parseReviewMarkdown } from './cv-review.mjs';
import { documentFingerprint } from './review-documents.mjs';
import { inspectDocuments, generateDocuments } from './prep-state.mjs';
import { verifyCvAfterAgent, verifyLetterAfterAgent, verifyMarkdownCv } from './cv-verify.mjs';
import { pushValidatedOverleaf } from './overleaf-cv.mjs';
import { appendAgentAttempt } from './agent-usage.mjs';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';

const job = { id: 'review-fixture', title: 'Engineer', company: 'Example' };
const pass = 'Verdict: pass\nATS: 8/10\nPosting fit: 8/10\nRecruiter scan: 8/10\n\n## Must fix\n- _none_';
const revise = pass.replace('Verdict: pass', 'Verdict: revise').replace('- _none_', '- Clarify the API work.');
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'scout-review-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'cv.md'), 'Original CV');
  await writeFile(join(dir, 'cv.pdf'), pdfFixture(['Original CV']));
  return dir;
}

test('empty, malformed, contradictory and incomplete reviews never pass', () => {
  for (const text of ['', 'Cannot complete review', 'Verdict: pass', revise.replace('- Clarify the API work.', '- _none_'), pass.replace('8/10', '99/10')]) {
    assert.equal(parseReviewMarkdown(text).verdict, 'not_reviewed');
  }
  assert.equal(parseReviewMarkdown(pass).verdict, 'pass');
});

test('review must be written by the current attempt and reports unavailable reviewers', async (t) => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'review.md'), pass);
  const result = await runReviewerPass({ job, prepDir: dir, runAgent: async () => {} });
  assert.equal(result.verdict, 'not_reviewed');
  assert.equal((await inspectDocuments(dir, ['cv'])).cv.needsReview, true);
  const unavailable = await runReviewerPass({ job, prepDir: dir, runAgent: async () => { throw new Error('offline'); } });
  assert.equal(unavailable.verdict, 'not_reviewed');
  assert.match(unavailable.error, /offline/);
});

test('review follows fitting, and one repair is rendered and verified before passing', async (t) => {
  const dir = await fixture(t);
  const order = [];
  let reviews = 0;
  const result = await runReviewerPass({ job, prepDir: dir, extraInstructions: 'Simple English',
    prepare: async () => {
      order.push('render');
      await writeFile(join(dir, 'cv.pdf'), pdfFixture([await readFile(join(dir, 'cv.md'), 'utf8')]));
    },
    verifyCv: async (opts) => { assert.equal(opts.extraInstructions, 'Simple English'); return { ok: true }; },
    runAgent: async (opts) => {
      if (opts.repair) {
        order.push('repair');
        assert.match(opts.extraInstructions, /ONLY the Must fix/);
        await writeFile(join(dir, 'cv.md'), 'Clarified API work');
      } else {
        order.push('review');
        const text = await readFile(join(dir, 'cv-final-text.md'), 'utf8');
        if (reviews) {
          assert.match(text, /Clarified API work/);
          assert.deepEqual(opts.repairChecks, ['Clarify the API work.']);
        }
        await writeFile(join(dir, 'review.md'), reviews++ ? pass : revise);
      }
    },
  });
  assert.deepEqual(order, ['render', 'review', 'repair', 'render', 'review']);
  assert.equal(result.verdict, 'pass');
  assert.equal(result.ranFixLoop, true);
  assert.equal(result.documentFingerprint, await documentFingerprint(dir, 'cv'));
  assert.equal((await inspectDocuments(dir, ['cv'])).cv.needsReview, false);
  await writeFile(join(dir, 'cv.pdf'), pdfFixture(['Changed after review']));
  assert.match((await inspectDocuments(dir, ['cv'])).cv.reasons.join(' '), /does not match/);
});

test('failed repair restores the previous draft and unresolved fixes block acceptance', async (t) => {
  const dir = await fixture(t);
  const result = await runReviewerPass({ job, prepDir: dir,
    prepare: async () => writeFile(join(dir, 'cv.pdf'), pdfFixture([await readFile(join(dir, 'cv.md'), 'utf8')])),
    verifyCv: async () => ({ ok: false }),
    runAgent: async ({ repair }) => {
      await writeFile(join(dir, repair ? 'cv.md' : 'review.md'), repair ? 'Invented claim' : revise);
    },
  });
  assert.equal(result.restored, true);
  assert.equal(result.verdict, 'revise');
  assert.equal(await readFile(join(dir, 'cv.md'), 'utf8'), 'Original CV');
  assert.equal((await inspectDocuments(dir, ['cv'])).cv.needsReview, true);
});

test('a second revise stops after one repair and leaves the remaining issues visible', async (t) => {
  const dir = await fixture(t);
  let repairs = 0;
  let reviews = 0;
  const result = await runReviewerPass({ job, prepDir: dir, verifyCv: async () => ({ ok: true }),
    runAgent: async ({ repair }) => {
      if (repair) repairs++;
      else { reviews++; await writeFile(join(dir, 'review.md'), revise); }
    },
  });
  assert.equal(repairs, 1);
  assert.equal(reviews, 2);
  assert.equal(result.verdict, 'revise');
  assert.deepEqual(result.mustFix, ['Clarify the API work.']);
  assert.equal((await inspectDocuments(dir, ['cv'])).cv.needsReview, true);
});

test('letter review checks the rendered repaired letter and saves a letter-specific fingerprint', async (t) => {
  const dir = await fixture(t);
  const letterPass = 'Verdict: pass\nPosting fit: 8/10\nCover letter: 8/10\n\n## Must fix\n- _none_';
  let count = 0;
  await writeFile(join(dir, 'cover-letter.md'), 'Original letter');
  const result = await runReviewerPass({ scope: 'letter', job, prepDir: dir,
    prepare: async () => writeFile(join(dir, 'cover-letter.pdf'), pdfFixture([await readFile(join(dir, 'cover-letter.md'), 'utf8')])),
    verifyLetter: async () => ({ ok: true }),
    runAgent: async ({ repair }) => {
      if (repair) await writeFile(join(dir, 'cover-letter.md'), 'Repaired letter');
      else {
        if (count) assert.match(await readFile(join(dir, 'letter-final-text.md'), 'utf8'), /Repaired letter/);
        await writeFile(join(dir, 'cover-letter-review.md'), count++ ? letterPass
          : letterPass.replace('Verdict: pass', 'Verdict: revise').replace('- _none_', '- Clarify motivation.'));
      }
    },
  });
  assert.equal(result.letter, 'Repaired letter');
  assert.equal(result.verdict, 'pass');
  assert.equal(result.documentFingerprint, await documentFingerprint(dir, 'letter'));
  assert.equal((await inspectDocuments(dir, ['letter'])).letter.needsReview, false);
});

test('reviewer edits are reverted and rejected even if it reports pass', async (t) => {
  const dir = await fixture(t);
  const result = await runReviewerPass({ job, prepDir: dir, runAgent: async () => {
    await writeFile(join(dir, 'cv.md'), 'Reviewer rewrite');
    await writeFile(join(dir, 'review.md'), pass);
  } });
  assert.equal(await readFile(join(dir, 'cv.md'), 'utf8'), 'Original CV');
  assert.equal(result.verdict, 'not_reviewed');
  assert.match(result.error, /changed a document/);
});

test('overflow is detected before spending tokens on review', async (t) => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'cv.pdf'), pdfFixture(['First', 'Second']));
  let called = false;
  const result = await runReviewerPass({ job, prepDir: dir, runAgent: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(result.verdict, 'not_reviewed');
});

test('repair instructions cannot legitimise an invented metric in CV or letter gates', async (t) => {
  const dir = await fixture(t);
  await mkdir(join(dir, 'before'));
  const cv = '## Experience\n### Engineer\n- Built APIs.\n## Education\n## Projects\n## Skills\n';
  await writeFile(join(dir, 'before', 'resume.md'), cv);
  await writeFile(join(dir, 'cv.md'), cv.replace('Built APIs.', 'Reduced latency by 987654%.'));
  const extraInstructions = 'Reviewer: claim reduced latency by 987654%.';
  const gate = await verifyCvAfterAgent({ prepDir: dir, cvSource: 'local', job, extraInstructions });
  assert.equal(gate.ok, false);
  assert.match(gate.hard.join(' '), /987654/);
  const letter = await verifyLetterAfterAgent({ prepDir: dir, job, extraInstructions,
    letter: 'Application for Engineer\n\nI reduced latency by 987654%.\n\nKind regards,\nCandidate' });
  assert.equal(letter.ok, false);
  assert.match(letter.hard.join(' '), /987654/);
});

test('Markdown gate preserves employment across Windows line endings and rejects removed entries', () => {
  const before = '## Experience\r\n### Engineer\r\n- Built APIs.\r\n## Education\r\n### Degree\r\n## Projects\r\n## Skills\r\n';
  const after = before.replace(/\r\n/g, '\n');
  const corpus = { numbers: new Set(), text: '', names: '' };
  assert.deepEqual(verifyMarkdownCv({ before, after, corpus }).hard, []);
  assert.match(verifyMarkdownCv({ before, after: after.replace('### Engineer\n- Built APIs.\n', ''), corpus }).hard.join(' '), /entry removed|bullets dropped/);
});

test('recreating a pack discards prior review files and usage while preserving history', async (t) => {
  const dir = await fixture(t);
  const opts = { root: dir, job, profile: {}, settings: { source: 'local' }, scopes: ['cv'], mode: 'fast' };
  const old = await generateDocuments(opts, async (d) => {
    await writeFile(join(d, 'cv.pdf'), pdfFixture(['Old']));
    await writeFile(join(d, 'review.md'), pass);
    await writeFile(join(d, 'agent-session.json'), '{}');
    return {};
  });
  const fresh = await generateDocuments(opts, async (d) => {
    await assert.rejects(readFile(join(d, 'review.md')), /ENOENT/);
    await assert.rejects(readFile(join(d, 'agent-session.json')), /ENOENT/);
    await writeFile(join(d, 'cv.pdf'), pdfFixture(['Fresh']));
    return {};
  });
  assert.equal(fresh.needsReview, false);
  assert.equal(await readFile(join(fresh.previousDir, 'review.md'), 'utf8'), pass);
  assert.equal(old.dir, fresh.dir);
});

test('Overleaf publishes only matching sources and validated reviewed PDFs', async (t) => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'overleaf-source.json'), JSON.stringify({ fingerprint: 'same' }));
  let pushed = 0;
  const opts = { job, prepDir: dir, sourceFingerprint: async () => 'same', push: async () => { pushed++; return { pushed: true }; } };
  await writeFile(join(dir, 'review-summary.json'), JSON.stringify({ cv: { verdict: 'not_reviewed' } }));
  await assert.rejects(pushValidatedOverleaf(opts), /Not reviewed/);
  assert.equal(pushed, 0);
  await writeFile(join(dir, 'review-summary.json'), JSON.stringify({ cv: { verdict: 'pass', documentFingerprint: await documentFingerprint(dir, 'cv') } }));
  await assert.rejects(pushValidatedOverleaf({ ...opts, sourceFingerprint: async () => 'different' }), /sources changed/);
  assert.equal(pushed, 0);
  assert.equal((await pushValidatedOverleaf(opts)).pushed, true);
  await writeFile(join(dir, 'cv.pdf'), pdfFixture(['First', 'Second']));
  await assert.rejects(pushValidatedOverleaf(opts), /one page/);
  assert.equal(pushed, 1);
});

test('usage keeps writers, reviews, repeated repairs and unknown CLI attempts separate', () => {
  let record = appendAgentAttempt({}, { usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 40, totalTokens: 150 } }, 'cvWriter');
  record = appendAgentAttempt(record, { usage: { inputTokens: 50, outputTokens: 5, totalTokens: 55 } }, 'letterWriter');
  record = appendAgentAttempt(record, { usage: null, status: 'error' }, 'cvReview');
  record = appendAgentAttempt(record, { usage: { inputTokens: 20, outputTokens: 2, totalTokens: 22 } }, 'cvReview');
  assert.equal(record.attempts.length, 4);
  assert.equal(record.cvWriter.usage.inputTokens, 100);
  assert.equal(record.usageSummary.counters.totalTokens, 227);
  assert.equal(record.usageSummary.counters.inputTokens, 170);
  assert.equal(record.usageSummary.complete, false);
});
