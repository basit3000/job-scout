/** Classify fetch failures, compact log noise, and decide when to abandon a board. */

export function isRateLimitError(message) {
  return /HTTP\s*429|429 Too Many|rate limit|too many requests/i.test(String(message || ''));
}

export function isApifyMonthlyCap(message) {
  return /monthly usage hard limit|platform-feature-disabled/i.test(String(message || ''));
}

export function isBlockedEmpty(message) {
  return /JobSpy returned 0 jobs|often blocked|returned no listings/i.test(String(message || ''));
}

export function collapseFailure(message) {
  return String(message || '')
    .replace(/\s+/g, ' ')
    .replace(/ \(Glassdoor\/Google[^)]*\)/gi, '')
    .trim()
    .slice(0, 200);
}

export function summarizeFailures(messages) {
  const counts = new Map();
  for (const raw of messages ?? []) {
    const key = collapseFailure(raw);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([k, n]) => (n > 1 ? `${k} (×${n})` : k)).join('; ');
}

/**
 * @param {{ consecutiveFails?: number, lastError?: string, flaky?: boolean, hasFallback?: boolean }} opts
 * @returns {string|null} reason to skip remaining queries on this board
 */
export function shouldAbandonBoard({ consecutiveFails = 0, lastError = '', flaky = false, hasFallback = false } = {}) {
  const n = Number(consecutiveFails) || 0;
  const msg = String(lastError || '');
  if (n < 1) return null;
  if (isApifyMonthlyCap(msg) && !hasFallback) return 'apify-monthly-cap';
  if (isRateLimitError(msg) && n >= 2) return 'rate-limited';
  const emptyLimit = flaky ? 2 : 3;
  if (isBlockedEmpty(msg) && n >= emptyLimit) return 'blocked';
  if (n >= 5) return 'repeated-failures';
  return null;
}

export function backoffMs(attempt, { base = 1000, cap = 8000 } = {}) {
  const a = Math.max(0, Number(attempt) || 0);
  return Math.min(cap, base * (2 ** a));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export async function withRateLimitRetry(fn, { retries = 1, sleepFn = sleep } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries || !isRateLimitError(err?.message || String(err))) throw err;
      await sleepFn(backoffMs(i));
    }
  }
  throw lastErr;
}

/** LinkedIn JobSpy is free and good enough — don't burn Apify until JobSpy is empty. */
export function boardPrefersJobspy(board, boardConfig, globalPreferJobspy) {
  if (boardConfig?.apify === false) return true;
  if (boardConfig?.preferJobspy === true) return true;
  if (board === 'linkedin') return true;
  return Boolean(globalPreferJobspy);
}
