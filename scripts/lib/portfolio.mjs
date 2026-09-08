import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './common.mjs';

export function looksLikePortfolio(root) {
  return Boolean(root) && existsSync(join(root, 'src', 'data', 'projects.js'));
}

export function resolvePortfolioRoot({ env = process.env, root = ROOT, explicit = '' } = {}) {
  const fromArg = String(explicit || '').trim();
  if (fromArg) return resolve(fromArg);
  const fromEnv = String(env.PORTFOLIO_ROOT || '').trim();
  if (fromEnv) return resolve(root, fromEnv);
  if (looksLikePortfolio(root)) return root;
  const sibling = join(root, '..', 'portfolio');
  if (looksLikePortfolio(sibling)) return resolve(sibling);
  return '';
}
