import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const run = promisify(execFile);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const args = process.argv.slice(2);
export const flag = (name) => args.includes(name);
export const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

/** Load KEY=VALUE pairs from .env into process.env (does not override existing). */
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
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

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
    description: job.description ? stripHtml(job.description).slice(0, 4000) : null,
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

/** Detect nationals-only / local-experience / visa / immediate-joiner flags for a market. */
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

/** @deprecated Use detectMarketFlags */
export function detectUaeFlags(job) {
  return detectMarketFlags(job, {
    nationalsOnlyPatterns: ['uae nationals?\\s*only', 'emirati\\s*only', 'for uae nationals'],
    localExperiencePatterns: ['uae experience\\s*(required|mandatory)', 'years?\\s*(of\\s*)?uae experience'],
  }).map((f) => (f === 'nationals-only' ? 'uae-nationals-only' : f === 'local-experience-required' ? 'uae-experience-required' : f));
}

export function isMarketLocation(location, market) {
  if (!location) return false;
  const patterns = market.locationPatterns ?? [];
  if (!patterns.length) return false;
  // Patterns may already include \b / commas; do not wrap again.
  const re = new RegExp(`(?:${patterns.join('|')})`, 'i');
  return re.test(location);
}

/** @deprecated Use isMarketLocation */
export function isUaeLocation(location) {
  return isMarketLocation(location, {
    locationPatterns: [
      'uae', 'u\\.a\\.e', 'united arab emirates', 'dubai', 'abu dhabi', 'sharjah',
      'ajman', 'ras al khaimah', 'fujairah', 'umm al', 'al ain', 'du,\\s*ae', 'az,\\s*ae',
    ],
  });
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
