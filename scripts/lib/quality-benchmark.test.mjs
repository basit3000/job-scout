import test from 'node:test';
import assert from 'node:assert/strict';
import { runQualityBenchmark, evaluateDocument } from './quality-benchmark.mjs';
import { candidate, resume, cases } from '../benchmarks/fixtures.mjs';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';
import { explicitTokenUsage } from './agent-usage.mjs';
test('only explicit numeric token counters become measured usage', () => {
  assert.deepEqual(explicitTokenUsage({ input_tokens: 12, output_tokens: 4 }), { inputTokens: 12, outputTokens: 4 });
  assert.equal(explicitTokenUsage({ input_tokens: '12', output_tokens: 4 }), null);
  assert.equal(explicitTokenUsage({ total_tokens: 16 }), null);
});
test('benchmark contracts are repeatable and usage/cost remain unknown', async () => {
  const first = await runQualityBenchmark(), second = await runQualityBenchmark();
  const stable = report => report.results.map(({ durationMs, ...row }) => row);
  assert.deepEqual(stable(first), stable(second)); assert.equal(first.modelResults, false);
  assert.ok(first.results.every(row => row.tokens === null && row.cost === null));
  assert.ok(first.results.every(row => row.pass));
});
test('invented metrics, removed employment, damaged PDF and page overflow fail gates', async () => {
  for (const [markdown, pdf] of [[resume + '\nImproved revenue 999%.', pdfFixture([resume])], ['', Buffer.from('broken')], [resume, pdfFixture([resume, 'Overflow page'])]]) {
    const result = await evaluateDocument({ markdown, pdf, job: cases[0] }); assert.equal(result.pass, false);
  }
});

test('benchmark reports generation, rendering and reviewer failures separately', async () => {
  const fail = async () => { throw new Error('Fictional failure'); };
  for (const [option, phase] of [['generate', 'generation'], ['render', 'render'], ['review', 'review']]) {
    const report = await runQualityBenchmark({ [option]: fail });
    assert.ok(report.results.every(row => !row.pass && row.failurePhase === phase));
    assert.ok(report.results.every(row => row.generationFailure === (phase === 'generation') && row.reviewFailure === (phase === 'review')));
  }
});
