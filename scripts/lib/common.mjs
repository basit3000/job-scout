import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactContext } from './artifact-context.mjs';

export const run = promisify(execFile);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const args = process.argv.slice(2);
export const flag = (name) => args.includes(name);
export const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

export function loadDotEnv(path = join(ROOT, '.env')) {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}

export async function loadJson(path, fallback) {
  try {
    const text = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDuration(ms) {
  const n = Math.max(0, Math.round(Number(ms) || 0));
  if (n < 1000) return `${n}ms`;
  const sec = Math.round(n / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (!rm && !s) return `${h}h`;
  if (!s) return `${h}h ${rm}m`;
  if (!rm) return `${h}h ${s}s`;
  return `${h}h ${rm}m ${s}s`;
}

export const stripHtml = (html) =>
  String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const DESCRIPTION_MAX = 8000;

export function pickDescription(...candidates) {
  let best = '';
  for (const c of candidates) {
    if (c == null || c === '') continue;
    const text = stripHtml(String(c)).trim();
    if (text.length > best.length) best = text;
  }
  return best ? best.slice(0, DESCRIPTION_MAX) : null;
}

export const daysSince = (iso) => {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((Date.now() - then) / 86400000));
};

export const jobId = (source, native) =>
  `${source}:${createHash('sha1').update(String(native)).digest('hex').slice(0, 12)}`;

/** Resolve market from CLI `--market`, search-profile `market`, or inline `country`. */
export async function loadMarket(config = {}) {
  const cliMarket = value('--market', null);
  const marketId = cliMarket || config.market || config.country?.id || 'AE';

  let market = null;
  if (config.country && typeof config.country === 'object' && !cliMarket) {
    market = { ...config.country };
    if (!market.id) market.id = marketId;
  } else {
    const path = join(ROOT, 'markets', `${String(marketId).toUpperCase()}.json`);
    market = await loadJson(path, null);
    if (!market) {
      const available = await listMarketIds();
      throw new Error(
        `Unknown market "${marketId}". Add markets/${String(marketId).toUpperCase()}.json or pick one of: ${available.join(', ')}`,
      );
    }
  }

  const required = ['id', 'name', 'shortName', 'indeedCountryCode', 'jobspyCountryIndeed', 'defaultLocation'];
  for (const key of required) {
    if (!market[key]) throw new Error(`Market ${market.id ?? '?'} missing required field: ${key}`);
  }

  market.id = String(market.id).toUpperCase();
  market.currency = market.currency || 'USD';
  market.defaultRadiusKm = market.defaultRadiusKm ?? 50;
  market.cities = Array.isArray(market.cities) ? market.cities : [{ where: market.defaultLocation, radiusKm: market.defaultRadiusKm }];
  market.locationPatterns = market.locationPatterns ?? [market.name, market.shortName, market.defaultLocation];
  market.boards = market.boards ?? ['indeed', 'linkedin'];
  market.nationalsOnlyPatterns = market.nationalsOnlyPatterns ?? [];
  market.localExperiencePatterns = market.localExperiencePatterns ?? [];
  market.dropNationalsOnlyDefault = market.dropNationalsOnlyDefault ?? false;
  market.slug = String(market.shortName || market.id).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return market;
}

export async function listMarketIds() {
  try {
    const entries = await readdir(join(ROOT, 'markets'));
    return entries
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/i, ''))
      .sort();
  } catch {
    return [];
  }
}

export function normalise(job, market) {
  return {
    id: job.id,
    source: job.source,
    board: job.board ?? null,
    via: job.via ?? null,
    nativeId: job.nativeId ?? null,
    title: clean(job.title),
    company: clean(job.company) || 'unknown',
    location: clean(job.location) || null,
    country: job.country ?? market?.shortName ?? null,
    remote: job.remote ?? null,
    url: job.url ?? null,
    postedAt: job.postedAt ?? null,
    ageDays: daysSince(job.postedAt),
    employmentType: job.employmentType ?? null,
    salary: job.salary ?? null,
    seniority: job.seniority ?? null,
    yearsExperience: job.yearsExperience ?? null,
    nationality: job.nationality ?? null,
    emails: Array.isArray(job.emails)
      ? job.emails.filter(Boolean)
      : String(job.emails || '')
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.includes('@')),
    companyUrl: job.companyUrl || job.company_url || null,
    description: pickDescription(job.description),
    alsoOn: [],
    flags: job.flags ?? [],
  };
}

function matchAny(text, patterns) {
  return (patterns ?? []).some((p) => {
    try {
      return new RegExp(p, 'i').test(text);
    } catch {
      return false;
    }
  });
}

export function detectMarketFlags(job, market) {
  const text = `${job.title}\n${job.description ?? ''}\n${job.nationality ?? ''}`;
  const flags = [...(job.flags ?? [])];
  if (matchAny(text, market.nationalsOnlyPatterns)) flags.push('nationals-only');
  if (matchAny(text, market.localExperiencePatterns)) flags.push('local-experience-required');
  if (/visa (transfer|sponsorship)|company (will )?provide visa|employment visa|sponsorship available|will sponsor/i.test(text)) {
    flags.push('mentions-visa');
  }
  if (/immediate joiners?\s*only|joining immediately/i.test(text)) flags.push('immediate-joiner');
  return [...new Set(flags)];
}

function testAnyPattern(text, patterns) {
  if (!text || !patterns?.length) return false;
  try {
    const re = new RegExp(`(?:${patterns.join('|')})`, 'i');
    return re.test(text);
  } catch {
    return false;
  }
}

export function isMarketLocation(location, market) {
  if (!location) return false;
  return testAnyPattern(location, market.locationPatterns ?? []);
}

/** True when a location string names a country/city outside this market. */
export function locationMentionsExcluded(location, market) {
  return testAnyPattern(location, market.excludeLocationPatterns ?? []);
}

/**
 * Whether a job is in the chosen market. `job.country` is ignored — fetchers stamp
 * it with the search market (e.g. always "Germany"), so it is not evidence.
 * Bare "Remote" / empty location is not enough when countryOnly filtering.
 */
export function isJobInMarket(job, market) {
  const locationStr = String(job?.location ?? '').trim();
  if (!locationStr) return false;
  if (locationMentionsExcluded(locationStr, market)) return false;
  return isMarketLocation(locationStr, market);
}

export async function runApifyActor(actor, input, { token, timeoutSec = 300 } = {}) {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor.replace('/', '~')}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSec}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeoutSec + 10) * 1000),
    },
  );
  if (!res.ok) throw new Error(`Apify ${actor} HTTP ${res.status}: ${(await res.text()).slice(0, 280)}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error(`Apify ${actor} returned non-array payload`);
  return items;
}

export function workspaceDir() {
  return join(ROOT, '.workspace');
}

export function prepDir(jobId) {
  const staged = artifactContext.getStore();
  if (staged?.jobId === jobId) return staged.dir;
  const id = String(jobId).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  if (!id || id === '.' || id === '..') throw new Error('Invalid job ID');
  return join(workspaceDir(), 'prep', id);
}

export async function listFilesRecursive(dir, pred) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFilesRecursive(p, pred)));
    else if (!pred || pred(p)) out.push(p);
  }
  return out;
}
