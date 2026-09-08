/** Recency windows for Apify LinkedIn / Indeed. Prefer recent; widen only if empty. */

export const LINKEDIN_DATE_POSTED = ['past24h', 'pastWeek', 'pastMonth'];
export const INDEED_DATE_POSTED = ['1', '3', '7', '14'];

/** Tightest LinkedIn window to try first (always recent-first, not pastMonth). */
export function mapLinkedInDatePosted(maxAgeDays) {
  const days = Number(maxAgeDays ?? 30);
  if (!Number.isFinite(days) || days <= 0) return 'pastWeek';
  if (days <= 1) return 'past24h';
  return 'pastWeek';
}

export function mapIndeedDatePosted(maxAgeDays) {
  const days = Number(maxAgeDays ?? 30);
  if (!Number.isFinite(days) || days <= 0) return '';
  if (days <= 1) return '1';
  if (days <= 3) return '3';
  if (days <= 7) return '7';
  return '14';
}

/** LinkedIn: tight window first, then wider. A pinned boardConfig.input.datePosted disables widening. */
export function linkedInDatePostedLadder(maxAgeDays, pinned) {
  if (pinned && (LINKEDIN_DATE_POSTED.includes(pinned) || pinned === 'any')) return [pinned];
  const days = Number(maxAgeDays ?? 30);
  if (days <= 1) return ['past24h', 'pastWeek'];
  if (days <= 7) return ['pastWeek'];
  return ['pastWeek', 'pastMonth'];
}

/** Indeed: same idea. Pinned input.datePosted is used as-is (no widen). */
export function indeedDatePostedLadder(maxAgeDays, pinned) {
  if (pinned != null && (INDEED_DATE_POSTED.includes(String(pinned)) || pinned === '')) {
    return [String(pinned)];
  }
  const days = Number(maxAgeDays ?? 30);
  if (!Number.isFinite(days) || days <= 0) return [''];
  if (days <= 1) return ['1', '3', '7'];
  if (days <= 3) return ['3', '7'];
  if (days <= 7) return ['7'];
  return ['7', '14'];
}

export function apifyDatePostedAttempts(board, maxAgeDays, boardConfig) {
  const pinned = boardConfig?.input?.datePosted;
  if (board === 'linkedin') return linkedInDatePostedLadder(maxAgeDays, pinned);
  if (board === 'indeed') return indeedDatePostedLadder(maxAgeDays, pinned);
  return [undefined];
}
