/**
 * Employer job portals discovered from search results.
 *
 * When a relevant job links to a public applicant-tracking system (Greenhouse,
 * Lever, Ashby, Personio, Workable, SmartRecruiters, Recruitee), the employer's
 * feed is saved to the ignored local file state/company-portals.json. The
 * "discoveredportals" board scans enabled entries with the Company careers
 * fetchers. Detection only parses URLs already fetched; it makes no requests.
 */
import { join } from 'node:path';
import { ROOT } from './common.mjs';
import { readPrivate, writePrivate } from './private-store.mjs';
import { expandSearchTitles } from './title-matching.mjs';

export const COMPANY_PORTALS_PATH = join(ROOT, 'state', 'company-portals.json');
export const DISCOVERED_BOARD = 'discoveredportals';
export const PORTAL_PROVIDERS = ['greenhouse', 'lever', 'ashby', 'personio', 'workable', 'smartrecruiters', 'recruitee'];

const EMPTY = { version: 1, portals: [] };
const TENANT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
// Jobs from employer feeds would only re-record the feed they came from.
const SKIP_BOARDS = new Set(['companycareers', DISCOVERED_BOARD]);
const RESERVED_SUBDOMAINS = new Set(['www', 'apply', 'jobs', 'api', 'app', 'help', 'support']);

function firstSegment(url) {
  const segment = url.pathname.split('/').filter(Boolean)[0] || '';
  try { return decodeURIComponent(segment); } catch { return ''; }
}

/** Identify a supported ATS feed from a job or apply URL. Returns null when unknown. */
export function detectPortal(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '')); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  let hit = null;
  if (/^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(host)) {
    const segment = firstSegment(url);
    hit = { provider: 'greenhouse', tenant: segment === 'embed' ? url.searchParams.get('for') : segment };
  } else if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
    hit = { provider: 'lever', tenant: firstSegment(url), ...(host === 'jobs.eu.lever.co' ? { domain: 'eu' } : {}) };
  } else if (host === 'jobs.ashbyhq.com') {
    hit = { provider: 'ashby', tenant: firstSegment(url) };
  } else if (host === 'apply.workable.com') {
    hit = { provider: 'workable', tenant: firstSegment(url) };
  } else if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') {
    hit = { provider: 'smartrecruiters', tenant: firstSegment(url) };
  } else {
    const personio = host.match(/^([a-z0-9-]+)\.jobs\.personio\.(de|com)$/);
    const recruitee = host.match(/^([a-z0-9-]+)\.recruitee\.com$/);
    const workable = host.match(/^([a-z0-9-]+)\.workable\.com$/);
    if (personio) hit = { provider: 'personio', tenant: personio[1], domain: personio[2] };
    else if (recruitee && !RESERVED_SUBDOMAINS.has(recruitee[1])) hit = { provider: 'recruitee', tenant: recruitee[1] };
    else if (workable && !RESERVED_SUBDOMAINS.has(workable[1])) hit = { provider: 'workable', tenant: workable[1] };
  }
  if (!hit?.tenant || !TENANT.test(hit.tenant) || hit.tenant === 'embed') return null;
  return hit;
}

export const portalId = (portal) => `${portal.provider}:${String(portal.tenant).toLowerCase()}`;

const union = (list, value) => (value && !(list || []).includes(value) ? [...(list || []), value] : [...(list || [])]);

export async function loadCompanyPortals(path = COMPANY_PORTALS_PATH) {
  const data = await readPrivate(path, EMPTY);
  return { version: 1, portals: Array.isArray(data?.portals) ? data.portals : [] };
}

/** Pure merge of newly seen jobs into a portal store. */
export function mergeDiscoveredPortals(store, jobs, { marketId = null, now = new Date().toISOString() } = {}) {
  const byId = new Map((store?.portals || []).map((p) => [p.id, { ...p }]));
  let added = 0;
  let changed = false;
  for (const job of jobs || []) {
    if (SKIP_BOARDS.has(job?.board)) continue;
    const found = [job.applyUrl, job.url].map(detectPortal).find(Boolean);
    if (!found) continue;
    const id = portalId(found);
    const board = job.board || 'unknown';
    const previous = byId.get(id);
    changed = true;
    if (previous) {
      byId.set(id, {
        ...previous,
        lastSeenAt: now,
        seenCount: (previous.seenCount || 0) + 1,
        markets: union(previous.markets, marketId),
        discoveredFrom: union(previous.discoveredFrom, board),
      });
      continue;
    }
    added += 1;
    const company = String(job.company || '').trim();
    byId.set(id, {
      id,
      name: company && company !== 'unknown' ? company : found.tenant,
      ...found,
      enabled: true,
      markets: marketId ? [marketId] : [],
      discoveredFrom: [board],
      firstSeenAt: now,
      lastSeenAt: now,
      seenCount: 1,
    });
  }
  const portals = [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { store: { version: 1, portals }, added, changed };
}

/** Record portals from relevant jobs. Writes only when something was seen. */
export async function recordDiscoveredPortals(jobs, { marketId = null, path = COMPANY_PORTALS_PATH, now } = {}) {
  const current = await loadCompanyPortals(path);
  const { store, added, changed } = mergeDiscoveredPortals(current, jobs, { marketId, now });
  if (changed) await writePrivate(path, store);
  return { added, total: store.portals.length };
}

async function editPortals(path, id, edit) {
  const store = await loadCompanyPortals(path);
  const index = store.portals.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`Company portal not found: ${id}`);
  edit(store.portals, index);
  await writePrivate(path, store);
  return store;
}

export function setCompanyPortalEnabled(id, enabled, { path = COMPANY_PORTALS_PATH } = {}) {
  if (typeof enabled !== 'boolean') throw new Error('enabled must be true or false');
  return editPortals(path, id, (portals, i) => { portals[i] = { ...portals[i], enabled }; });
}

export function removeCompanyPortal(id, { path = COMPANY_PORTALS_PATH } = {}) {
  return editPortals(path, id, (portals, i) => { portals.splice(i, 1); });
}

/**
 * One query per enabled portal seen in this market. Employers already in the
 * manual Company careers watchlist are skipped so they are not fetched twice.
 */
export function portalQueries(store, config, profile, market) {
  const manual = new Set((config?.companies || [])
    .filter((c) => c?.provider && c?.tenant)
    .map((c) => portalId(c)));
  const titles = expandSearchTitles(profile?.search?.titles || []);
  return (store?.portals || [])
    .filter((p) => p.enabled !== false && PORTAL_PROVIDERS.includes(p.provider) && TENANT.test(String(p.tenant || '')))
    .filter((p) => !p.markets?.length || p.markets.includes(market.id))
    .filter((p) => !manual.has(p.id))
    .map((p) => ({
      what: p.name,
      where: market.name,
      board: DISCOVERED_BOARD,
      company: { name: p.name, provider: p.provider, tenant: p.tenant, ...(p.domain ? { domain: p.domain } : {}) },
      titles,
      include: profile?.search?.includeTitlePatterns || [],
      exclude: profile?.search?.excludeTitlePatterns || [],
    }));
}
