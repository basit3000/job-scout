import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequirementCoverage } from './review-coverage.mjs';
import { parseReviewMarkdown } from './cv-review.mjs';
import { buildReviewerPrompt } from './cv-prompts.mjs';
import { renderRequirementCoverage } from '../../web/public/review-coverage.js';
import { REVIEW_COVERAGE } from '../test-helpers/review-fixture.mjs';
const pass = 'Verdict: pass\nATS: 8/10\nPosting fit: 8/10\nRecruiter scan: 8/10\n## Must fix\n- _none_\n';

test('coverage captures requirements, priority, exact evidence and document locations', () => {
  const parsed = parseReviewMarkdown(pass + REVIEW_COVERAGE);
  assert.equal(parsed.verdict, 'pass');
  assert.deepEqual(parsed.requirementCoverage[0], { requirement: 'Build APIs', priority: 'required', status: 'supported', evidence: 'Memory: Engineer at Example, Built APIs', document: 'Experience, Built APIs' });
  const escaped = parseRequirementCoverage(REVIEW_COVERAGE.replace('Build APIs | required', 'Build APIs \\| services | required').replace(/\n/g, '\r\n'));
  assert.equal(escaped.error, null);
  assert.equal(escaped.rows[0].requirement, 'Build APIs | services');
});

test('missing, empty, duplicated and malformed evidence tables cannot pass', () => {
  for (const coverage of ['', REVIEW_COVERAGE + REVIEW_COVERAGE,
    REVIEW_COVERAGE.replace(/\| Build APIs.*\n/, ''), REVIEW_COVERAGE.replace(' | supported | ', ' | excellent | '),
    REVIEW_COVERAGE.replace('Memory: Engineer at Example, Built APIs', 'none'),
    REVIEW_COVERAGE.replace('Build APIs | required', 'Build APIs | services | required')]) {
    assert.equal(parseReviewMarkdown(pass + coverage).verdict, 'not_reviewed');
  }
});

test('honest gaps may pass document review, but an unsupported claim cannot', () => {
  const gap = REVIEW_COVERAGE.replace('supported', 'gap').replace('Memory: Engineer at Example, Built APIs', 'Not evidenced').replace('Experience, Built APIs', 'Not included');
  assert.equal(parseReviewMarkdown(pass + gap).verdict, 'pass');
  const claim = REVIEW_COVERAGE.replace('supported', 'unsupported-claim');
  assert.equal(parseReviewMarkdown(pass + claim).verdict, 'not_reviewed');
  assert.equal(parseReviewMarkdown(pass.replace('Verdict: pass', 'Verdict: revise').replace('_none_', 'Remove the unsupported API claim.') + claim).verdict, 'revise');
});

test('review prompts distinguish requirements, project evidence and uncertainty in both scopes', () => {
  for (const scope of ['cv', 'letter']) {
    const prompt = buildReviewerPrompt({ job: { title: 'Engineer', company: 'Example' }, prepRel: 'prep', scope });
    assert.match(prompt, /## Requirement coverage/);
    assert.match(prompt, /skill-specific years/);
    assert.match(prompt, /Keep employment, student work and projects separate/);
    assert.match(prompt, /every explicit hard requirement/);
    assert.match(prompt, /full posting is unavailable/);
  }
});

test('Prep displays escaped evidence in an accessible expandable table', () => {
  assert.equal(renderRequirementCoverage([]), '');
  const html = renderRequirementCoverage([{ requirement: '<img src=x onerror=alert(1)>', evidence: 'A & B', document: '<script>bad</script>', priority: 'required', status: 'gap' }]);
  assert.match(html, /<details/);
  assert.match(html, /<caption>/);
  assert.match(html, /A &amp; B/);
  assert.doesNotMatch(html, /<img|<script/);
});
