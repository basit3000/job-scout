import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRateLimitError,
  isApifyMonthlyCap,
  isBlockedEmpty,
  collapseFailure,
  summarizeFailures,
  shouldAbandonBoard,
  backoffMs,
  withRateLimitRetry,
  boardPrefersJobspy,
} from './fetch-resilience.mjs';

describe('fetch-resilience classifiers', () => {
  it('detects 429 / rate limits', () => {
    assert.equal(isRateLimitError('api: Arbeitnow HTTP 429'), true);
    assert.equal(isRateLimitError('too many requests'), true);
    assert.equal(isRateLimitError('HTTP 403'), false);
  });

  it('detects Apify monthly hard limit', () => {
    assert.equal(
      isApifyMonthlyCap('platform-feature-disabled: Monthly usage hard limit exceeded'),
      true,
    );
    assert.equal(isApifyMonthlyCap('apify: hit maxApifyRuns (200)'), false);
  });

  it('detects blocked/empty JobSpy and HTML boards', () => {
    assert.equal(isBlockedEmpty('jobspy: JobSpy returned 0 jobs (Glassdoor/Google are often blocked)'), true);
    assert.equal(isBlockedEmpty('StepStone returned no listings'), true);
    assert.equal(isBlockedEmpty('api: Arbeitnow HTTP 429'), false);
  });
});

describe('summarizeFailures', () => {
  it('collapses repeated JobSpy empty messages', () => {
    const msg = 'jobspy: JobSpy returned 0 jobs (Glassdoor/Google are often blocked or broken upstream; Indeed/LinkedIn/Arbeitsagentur are more reliable)';
    const out = summarizeFailures(Array.from({ length: 91 }, () => msg));
    assert.match(out, /×91/);
    assert.equal(out.includes(';'), false);
  });

  it('keeps distinct errors', () => {
    const out = summarizeFailures(['api: HTTP 429', 'api: HTTP 429', 'api: HTTP 500']);
    assert.match(out, /HTTP 429 \(×2\)/);
    assert.match(out, /HTTP 500/);
  });

  it('trims collapseFailure', () => {
    assert.equal(collapseFailure('  foo   bar  '), 'foo bar');
  });
});

describe('shouldAbandonBoard', () => {
  it('does not abandon on a single empty query', () => {
    assert.equal(shouldAbandonBoard({ consecutiveFails: 1, lastError: 'jobspy: JobSpy returned 0 jobs', flaky: true }), null);
  });

  it('abandons flaky boards after 2 empty queries, others after 3', () => {
    assert.equal(
      shouldAbandonBoard({ consecutiveFails: 2, lastError: 'jobspy: JobSpy returned 0 jobs', flaky: true }),
      'blocked',
    );
    assert.equal(
      shouldAbandonBoard({ consecutiveFails: 2, lastError: 'jobspy: JobSpy returned 0 jobs', flaky: false }),
      null,
    );
    assert.equal(
      shouldAbandonBoard({ consecutiveFails: 3, lastError: 'StepStone returned no listings' }),
      'blocked',
    );
  });

  it('abandons after 2 consecutive 429s', () => {
    assert.equal(
      shouldAbandonBoard({ consecutiveFails: 2, lastError: 'api: Arbeitnow HTTP 429' }),
      'rate-limited',
    );
  });

  it('abandons Apify-only boards on monthly cap, not JobSpy boards', () => {
    assert.equal(
      shouldAbandonBoard({ consecutiveFails: 1, lastError: 'Monthly usage hard limit exceeded' }),
      'apify-monthly-cap',
    );
    assert.equal(
      shouldAbandonBoard({
        consecutiveFails: 1,
        lastError: 'Monthly usage hard limit exceeded',
        hasFallback: true,
      }),
      null,
    );
  });

  it('abandons after 5 generic failures', () => {
    assert.equal(shouldAbandonBoard({ consecutiveFails: 5, lastError: 'Xing HTTP 403' }), 'repeated-failures');
    assert.equal(shouldAbandonBoard({ consecutiveFails: 4, lastError: 'Xing HTTP 403' }), null);
  });
});

describe('backoff and retry', () => {
  it('caps exponential backoff', () => {
    assert.equal(backoffMs(0), 1000);
    assert.equal(backoffMs(1), 2000);
    assert.equal(backoffMs(10), 8000);
  });

  it('retries once on 429 then succeeds', async () => {
    let n = 0;
    const waits = [];
    const out = await withRateLimitRetry(
      async () => {
        n += 1;
        if (n === 1) throw new Error('Arbeitnow HTTP 429');
        return 'ok';
      },
      { sleepFn: async (ms) => waits.push(ms) },
    );
    assert.equal(out, 'ok');
    assert.equal(n, 2);
    assert.equal(waits[0], 1000);
  });

  it('does not retry non-429 errors', async () => {
    let n = 0;
    await assert.rejects(
      () => withRateLimitRetry(async () => {
        n += 1;
        throw new Error('HTTP 500');
      }),
      /HTTP 500/,
    );
    assert.equal(n, 1);
  });
});

describe('boardPrefersJobspy', () => {
  it('always prefers JobSpy for LinkedIn', () => {
    assert.equal(boardPrefersJobspy('linkedin', {}, false), true);
    assert.equal(boardPrefersJobspy('indeed', {}, false), false);
    assert.equal(boardPrefersJobspy('indeed', {}, true), true);
  });

  it('honors per-board apify:false / preferJobspy', () => {
    assert.equal(boardPrefersJobspy('indeed', { apify: false }, false), true);
    assert.equal(boardPrefersJobspy('indeed', { preferJobspy: true }, false), true);
  });
});
