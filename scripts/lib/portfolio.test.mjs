import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { looksLikePortfolio, resolvePortfolioRoot } from './portfolio.mjs';

test('looksLikePortfolio rejects empty paths', () => {
  assert.equal(looksLikePortfolio(''), false);
  assert.equal(looksLikePortfolio(null), false);
});

test('resolvePortfolioRoot prefers an explicit path over env', () => {
  assert.equal(
    resolvePortfolioRoot({ root: '/tmp/job-scout', explicit: '/abs/mine', env: { PORTFOLIO_ROOT: '../other' } }),
    resolve('/abs/mine'),
  );
});

test('resolvePortfolioRoot uses PORTFOLIO_ROOT when no explicit path', () => {
  const root = '/tmp/job-scout';
  assert.equal(
    resolvePortfolioRoot({ root, env: { PORTFOLIO_ROOT: '../portfolio' } }),
    resolve(root, '../portfolio'),
  );
});

test('resolvePortfolioRoot returns empty when nothing looks like a portfolio', () => {
  assert.equal(resolvePortfolioRoot({ root: '/tmp/does-not-exist-job-scout', env: {} }), '');
});
