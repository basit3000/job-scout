import { daysSince, isJobInMarket } from './common.mjs';

const patterns = (items = []) => items.filter((p) => p && !String(p).includes('YOUR_')).map((p) => new RegExp(p, 'i'));

/** Filter the view, never the archive or tracker. Not seen again is not closed. */
export function currentSearchState(job, profile, config, market) {
  const reasons = [];
  const ageDays = job.postedAt ? daysSince(job.postedAt) : null;
  const limit = config.filters?.maxAgeDays ?? profile.constraints?.maxAgeDays ?? 30;
  if (ageDays != null && ageDays > limit) reasons.push(`Older than ${limit} days`);
  const include = patterns(profile.search?.includeTitlePatterns);
  const exclude = patterns([...(config.filters?.titleMustNotMatch || []), ...(profile.search?.excludeTitlePatterns || [])]);
  if (include.length && !include.some((r) => r.test(job.title || ''))) reasons.push('Outside current target titles');
  if (exclude.some((r) => r.test(job.title || ''))) reasons.push('Excluded title');
  if (patterns([...(config.filters?.excludeCompanies || []), ...(profile.constraints?.excludeCompanies || [])]).some((r) => r.test(job.company || ''))) reasons.push('Excluded company');
  if ((config.filters?.countryOnly ?? config.filters?.uaeOnly ?? true) && !isJobInMarket(job, market)) reasons.push('Outside current market');
  if ((profile.constraints?.dropNationalsOnly ?? config.filters?.dropNationalsOnly ?? market.dropNationalsOnlyDefault)
    && (job.flags || []).some((f) => ['nationals-only', 'uae-nationals-only'].includes(f))) reasons.push('Nationals-only restriction');
  return { current: reasons.length === 0, reasons, ageDays, lastSeenAt: job.lastSeenAt || job.scrapedAt || null };
}
