/**
 * Where the candidate's portfolio repo lives (the cv-tailor evidence source).
 *
 * Order: PORTFOLIO_ROOT → this repo (if it is the portfolio) → sibling ../portfolio.
 * Returns '' when nothing plausible exists so callers can degrade gracefully.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './common.mjs';

export function looksLikePortfolio(root) {
  return Boolean(root) && existsSync(join(root, 'src', 'data', 'projects.js'));
}

export function resolvePortfolioRoot({ env = process.env, root = ROOT } = {}) {
  const fromEnv = String(env.PORTFOLIO_ROOT || '').trim();
  if (fromEnv) return resolve(root, fromEnv);
  if (looksLikePortfolio(root)) return root;
  const sibling = join(root, '..', 'portfolio');
  if (looksLikePortfolio(sibling)) return resolve(sibling);
  return '';
}
