/** Conservative vacancy identity shared by fetching and the UI. */
import { createHash } from 'node:crypto';
import { latestApplicants } from './job-signals.mjs';

export function normalizeCompany(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\b(llc|ltd|fz|fzco|dmcc|l\.l\.c|inc|corp|gmbh|plc|ag|se|ug|co|kg)\b/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function normalizeTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function jobDedupeKey(job) {
  return `${normalizeCompany(job.company)}|${normalizeTitle(job.title)}|${normalizeTitle(job.location)}|${requisition(job)}`;
}

const requisition = job => String(job.requisitionId || job.requisition_id || job.reqId || '').trim();
const source = job => job.source || job.board || '';
const nativeId = job => String(job.nativeId || job.sourceId || job.source_id || '').trim();
// Employer feeds may reuse small numeric IDs across tenants/providers.
const nativeScope = job => `${source(job)}|${job.via || ''}|${normalizeCompany(job.company)}`;

export function urlDedupeKey(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Unknown parameters are retained: a source may use them as vacancy identity.
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_.+|gclid|fbclid|msclkid|trk|trackingId|referrer|referral|source|gh_src)$/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.port ? ':' + u.port : ''}${u.pathname.replace(/\/$/, '')}${u.search}${u.hash}`;
  } catch {
    return String(url).toLowerCase().replace(/\/$/, '');
  }
}

export function sameVacancy(a, b) {
  if (a.id && a.id === b.id) return true;
  const ar = requisition(a), br = requisition(b);
  if (ar && br && ar !== br) return false;
  if (source(a) && nativeScope(a) === nativeScope(b) && nativeId(a) && nativeId(b)) return nativeId(a) === nativeId(b);
  const au = urlDedupeKey(a.url), bu = urlDedupeKey(b.url);
  if (au && au === bu) return true;
  if (!a.company || !a.title || !a.location || !b.location) return false;
  if (normalizeCompany(a.company) !== normalizeCompany(b.company)
    || normalizeTitle(a.title) !== normalizeTitle(b.title)
    || normalizeTitle(a.location) !== normalizeTitle(b.location)) return false;
  if (ar && br) return ar === br;
  // Different IDs on one board describe different vacancies, even with identical text.
  if (!source(a) || !source(b) || source(a) === source(b)) return false;
  try { if (new URL(a.url).hostname === new URL(b.url).hostname) return false; } catch { return false; }
  // Cross-board merge only with substantial identical posting text, not keywords.
  const text = value => String(value || '').replace(/\s+/g, ' ').trim();
  return text(a.description).length >= 160 && text(a.description) === text(b.description);
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

function textLen(value) {
  return String(value ?? '').trim().length;
}

function longerText(a, b) {
  return textLen(b) > textLen(a) ? (b ?? null) : (a ?? null);
}

function firstFilled(a, b) {
  if (a == null || a === '') return b ?? a ?? null;
  if (typeof a === 'string' && !a.trim()) return b ?? a;
  return a;
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
    description: longerText(winner.description, loser.description),
    salary: firstFilled(winner.salary, loser.salary),
    seniority: firstFilled(winner.seniority, loser.seniority),
    employmentType: firstFilled(winner.employmentType, loser.employmentType),
    location: firstFilled(winner.location, loser.location),
    postedAt: firstFilled(winner.postedAt, loser.postedAt),
    postedAtApproximate: winner.postedAt ? winner.postedAtApproximate : loser.postedAtApproximate,
    postedAtText: winner.postedAt ? winner.postedAtText : loser.postedAtText,
    scrapedAt: laterIso(winner.scrapedAt, loser.scrapedAt),
    applicants: latestApplicants(winner.applicants, loser.applicants),
    nationality: firstFilled(winner.nationality, loser.nationality),
    yearsExperience: firstFilled(winner.yearsExperience, loser.yearsExperience),
    requisitionId: firstFilled(requisition(winner), requisition(loser)),
    alsoOn,
    mergedIds,
    provenance: [...new Map([...(winner.provenance || []), ...(loser.provenance || []),
      ...[winner, loser].map(j => ({ id: j.id, source: j.source, board: j.board, url: j.url, nativeId: nativeId(j), requisitionId: requisition(j) }))]
      .map(item => [JSON.stringify(item), item])).values()],
    firstSeenAt: earlierIso(winner.firstSeenAt, loser.firstSeenAt),
    lastSeenAt: laterIso(winner.lastSeenAt, loser.lastSeenAt),
  };
}

function pickBetter(a, b) {
  // Keep the first archive ID: preparation packs and decisions are keyed by it.
  const merged = mergeInto({ ...a }, b);
  if (b.via === 'apify') merged.via = b.via;
  return merged;
}

function identityIndex(rows) {
  const index = new Map();
  const keys = job => {
    const group = `${normalizeCompany(job.company)}|${normalizeTitle(job.title)}|${normalizeTitle(job.location)}`;
    const description = String(job.description || '').replace(/\s+/g, ' ').trim();
    return [job.id && `id:${job.id}`, job.url && `url:${urlDedupeKey(job.url)}`,
      nativeId(job) && source(job) && `native:${nativeScope(job)}:${nativeId(job)}`,
      requisition(job) && `req:${group}:${requisition(job)}`,
      description.length >= 160 && `text:${group}:${createHash('sha256').update(description).digest('hex')}`].filter(Boolean);
  };
  const add = (job, position) => { for (const key of keys(job)) { if (!index.has(key)) index.set(key, new Set()); index.get(key).add(position); } };
  rows.forEach(add);
  return { add, matches: job => [...new Set(keys(job).flatMap(key => [...(index.get(key) || [])]))].filter(position => sameVacancy(rows[position], job)) };
}

/**
 * Collapse proven duplicate postings; never rely on title/company alone.
 * Preserve the first ID and retain richer descriptions and provenance.
 */
export function dedupeJobs(jobs) {
  const result = [];
  const identity = identityIndex(result);
  for (const job of jobs || []) {
    const index = identity.matches(job)[0];
    if (index == null) { result.push({ ...job }); identity.add(job, result.length - 1); }
    else { result[index] = pickBetter(result[index], job); identity.add(result[index], index); identity.add(job, index); }
  }
  return result;
}

/**
 * Merge new vacancies conservatively while retaining all old archive rows.
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
  // Never collapse old rows on upgrade. Existing associations remain addressable.
  const result = stampedOld;
  const identity = identityIndex(result);
  for (const job of stampedNew) {
    const matches = identity.matches(job);
    if (matches.length === 1) { result[matches[0]] = pickBetter(result[matches[0]], job); identity.add(result[matches[0]], matches[0]); identity.add(job, matches[0]); }
    else if (!matches.length) { result.push(job); identity.add(job, result.length - 1); }
    // Ambiguous archive duplicates are retained without assigning new associations.
  }
  return result;
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
