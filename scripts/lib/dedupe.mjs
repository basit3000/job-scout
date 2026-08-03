/** Shared dedupe for fetch + web UI (URL and company+title). */

export function normalizeCompany(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\b(llc|ltd|fz|fzco|dmcc|l\.l\.c|inc|corp|gmbh|plc|ag|se|ug|co|kg)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function jobDedupeKey(job) {
  return `${normalizeCompany(job.company)}|${normalizeTitle(job.title)}`;
}

export function urlDedupeKey(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return String(url).toLowerCase().replace(/\/$/, '');
  }
}

function earlierIso(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function laterIso(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function mergeInto(winner, loser) {
  const alsoOn = [
    ...new Set([
      ...(winner.alsoOn ?? []),
      ...(loser.alsoOn ?? []),
      loser.source,
      loser.board ? `${loser.board}${loser.via ? `/${loser.via}` : ''}` : null,
    ].filter(Boolean)),
  ].filter((s) => s && s !== winner.source && s !== winner.board);

  const mergedIds = [...new Set([
    ...(winner.mergedIds ?? []),
    ...(loser.mergedIds ?? []),
    loser.id,
  ].filter(Boolean))];

  return {
    ...winner,
    alsoOn,
    mergedIds,
    firstSeenAt: earlierIso(winner.firstSeenAt, loser.firstSeenAt),
    lastSeenAt: laterIso(winner.lastSeenAt, loser.lastSeenAt),
  };
}

function pickBetter(a, b) {
  if (b.via === 'apify' && a.via !== 'apify') return mergeInto({ ...b }, a);
  if (a.via === 'apify' && b.via !== 'apify') return mergeInto({ ...a }, b);
  if ((b.description?.length ?? 0) > (a.description?.length ?? 0)) return mergeInto({ ...b }, a);
  return mergeInto({ ...a }, b);
}

/**
 * Collapse duplicate postings by URL first, then company+title.
 * Prefer Apify + longer descriptions. Merges `alsoOn` / `mergedIds`.
 */
export function dedupeJobs(jobs) {
  const byUrl = new Map();
  const noUrl = [];

  for (const job of jobs ?? []) {
    const uk = urlDedupeKey(job.url);
    if (!uk) {
      noUrl.push(job);
      continue;
    }
    const existing = byUrl.get(uk);
    byUrl.set(uk, existing ? pickBetter(existing, job) : { ...job, alsoOn: [...(job.alsoOn ?? [])] });
  }

  const byKey = new Map();
  for (const job of [...byUrl.values(), ...noUrl]) {
    const k = jobDedupeKey(job);
    const existing = byKey.get(k);
    byKey.set(k, existing ? pickBetter(existing, job) : { ...job, alsoOn: [...(job.alsoOn ?? [])] });
  }

  return [...byKey.values()];
}

/**
 * Merge a new fetch into the archive. Dedupes by URL / company+title.
 * Prefers Apify copies and longer descriptions. Stamps firstSeenAt / lastSeenAt.
 */
export function mergeJobArchives(
  previousJobs,
  newJobs,
  { fetchedAt = new Date().toISOString(), previousFetchedAt = null } = {},
) {
  const stampedNew = (newJobs ?? []).map((job) => ({
    ...job,
    firstSeenAt: job.firstSeenAt ?? fetchedAt,
    lastSeenAt: fetchedAt,
  }));
  const oldFallback = previousFetchedAt || fetchedAt;
  const stampedOld = (previousJobs ?? []).map((job) => ({
    ...job,
    firstSeenAt: job.firstSeenAt ?? job.scrapedAt ?? oldFallback,
    lastSeenAt: job.lastSeenAt ?? job.scrapedAt ?? job.firstSeenAt ?? oldFallback,
  }));
  return dedupeJobs([...stampedOld, ...stampedNew]);
}

/** Group jobs by company for UI clustering. */
export function clusterByCompany(jobs) {
  const map = new Map();
  for (const job of jobs ?? []) {
    const key = normalizeCompany(job.company) || 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(job);
  }
  return [...map.entries()].map(([companyKey, items]) => ({
    companyKey,
    company: items[0]?.company ?? companyKey,
    count: items.length,
    jobs: items,
  }));
}
