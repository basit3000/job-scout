/** Results-list sort comparators. Fit ranking is unchanged; date sorts are display-only. */

const FIT_RANK = { Strong: 0, 'Worth a shot': 1, Stretch: 2, No: 3 };
const DAY_MS = 86_400_000;

export function parseIsoMs(value) {
  if (value == null || value === '') return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Recency timestamp: postedAt, else now − ageDays, else lastSeenAt / firstSeenAt. */
export function postedRecencyMs(job, nowMs = Date.now()) {
  const posted = parseIsoMs(job?.postedAt);
  if (posted != null) return posted;
  if (job?.ageDays != null && job.ageDays !== '' && Number.isFinite(Number(job.ageDays))) {
    return nowMs - Number(job.ageDays) * DAY_MS;
  }
  return parseIsoMs(job?.lastSeenAt) ?? parseIsoMs(job?.firstSeenAt);
}

export function compareFit(a, b) {
  const av = FIT_RANK[a.fit?.verdict] ?? 9;
  const bv = FIT_RANK[b.fit?.verdict] ?? 9;
  if (av !== bv) return av - bv;
  return (b.fit?.score ?? 0) - (a.fit?.score ?? 0);
}

function comparePosted(a, b, newestFirst, nowMs) {
  const ra = postedRecencyMs(a, nowMs);
  const rb = postedRecencyMs(b, nowMs);
  if (ra == null && rb == null) return 0;
  if (ra == null) return 1;
  if (rb == null) return -1;
  return newestFirst ? rb - ra : ra - rb;
}

export function comparePostedNewest(a, b, nowMs = Date.now()) {
  return comparePosted(a, b, true, nowMs);
}

export function comparePostedOldest(a, b, nowMs = Date.now()) {
  return comparePosted(a, b, false, nowMs);
}

export function sortJobs(jobs, mode, nowMs = Date.now()) {
  const list = [...(jobs ?? [])];
  const sort = String(mode || 'fit').toLowerCase();
  if (sort === 'newest') list.sort((a, b) => comparePostedNewest(a, b, nowMs));
  else if (sort === 'oldest') list.sort((a, b) => comparePostedOldest(a, b, nowMs));
  else list.sort(compareFit);
  return list;
}
