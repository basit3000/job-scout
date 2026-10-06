import { scoreJob } from './fit.mjs';
import { extractPdfText } from './pdf-text.mjs';
import { verifyMarkdownCv, numberTokens } from './cv-verify.mjs';
import { defaultPromptSettings } from './prompt-settings.mjs';
import { parseReviewMarkdown } from './cv-review.mjs';
import { candidate, resume, cases } from '../benchmarks/fixtures.mjs';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';

export async function evaluateDocument({ markdown, pdf, review = '', job, maxPages = 1 }) {
  const corpus = { text: JSON.stringify(candidate), numbers: numberTokens(JSON.stringify(candidate), { expand: true }) };
  const factual = verifyMarkdownCv({ before: resume, after: markdown, corpus, settings: defaultPromptSettings() });
  const forbidden = [/999\s*%/, /(?:I (?:have|hold)|earned|awarded)\s+(?:a\s+)?doctorate/i, /active security clearance/i].filter(re => re.test(markdown));
  let document;
  try {
    const extracted = await extractPdfText(pdf);
    document = { pages: extracted.pages, readable: extracted.text.trim().length > 30, pageLimitPassed: extracted.pages <= maxPages,
      extractionCoverage: markdown.split(/\s+/).filter(word => word.length > 3).filter(word => extracted.text.includes(word)).length / Math.max(1, markdown.split(/\s+/).filter(word => word.length > 3).length) };
  } catch { document = { pages: null, readable: false, pageLimitPassed: false, extractionCoverage: 0 }; }
  const parsed = parseReviewMarkdown(review);
  const reviewPassed = parsed.verdict === 'pass';
  const unsupportedClaims = factual.hard.length + forbidden.length;
  return { unsupportedClaims, factualFindings: factual.hard, document,
    requirementCoverage: parsed.requirementCoverage || [], honestGaps: (parsed.requirementCoverage || []).filter(row => ['gap', 'unknown', 'partial'].includes(row.status)).length,
    reviewPassed, reviewVerdict: parsed.verdict,
    pass: unsupportedClaims === 0 && document.readable && document.pageLimitPassed && document.extractionCoverage >= 0.8 && reviewPassed,
    fit: scoreJob(job, candidate, {}, { now: new Date('2026-01-01T00:00:00Z') }) };
}

export async function runQualityBenchmark({ generate, review, render, usageForCase = () => null, mode = 'mocked-contract' } = {}) {
  const results = [];
  for (const job of cases) {
    const started = performance.now();
    let phase = 'generation';
    try {
      const markdown = generate ? await generate({ candidate, resume, job }) : resume;
      phase = 'render';
      const pdf = render ? await render(markdown, job) : pdfFixture([markdown]);
      const rendered = await extractPdfText(pdf);
      phase = 'review';
      const reviewText = review ? await review({ candidate, markdown, job, rendered }) :
        'Verdict: pass\nATS: 8/10\nPosting fit: 5/10\nRecruiter scan: 8/10\n\n## Must fix\n- _none_\n\n## Requirement coverage\n| Requirement | Priority | Status | Candidate evidence | Document evidence |\n| --- | --- | --- | --- | --- |\n| Posting requirements | required | unknown | Candidate evidence incomplete | Not claimed |';
      const evaluated = await evaluateDocument({ markdown, pdf, review: reviewText, job });
      results.push({ id: job.id, ...evaluated, generationFailure: false, renderFailure: false, reviewFailure: !evaluated.reviewPassed, durationMs: Math.round(performance.now() - started), tokens: usageForCase(job.id), cost: null });
    } catch (error) { results.push({ id: job.id, pass: false, failurePhase: phase, generationFailure: phase === 'generation', renderFailure: phase === 'render', reviewFailure: phase === 'review', error: error.message, durationMs: Math.round(performance.now() - started), tokens: null, cost: null }); }
  }
  return { schemaVersion: 1, fixtureVersion: 1, mode, modelResults: mode === 'real-model',
    limitations: ['Fictional contract benchmark; not hiring outcomes.', 'Unsupported-claim checks are bounded detectors, not proof of factual completeness.', 'Usage and cost unknown unless reported reliably.'], results };
}
