import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

export function normalise(job) {
  return {
    id: job.id,
    source: job.source,
    board: job.board ?? null,
    via: job.via ?? null,
    title: clean(job.title),
    company: clean(job.company) || 'unknown',
    location: clean(job.location) || null,
    country: job.country ?? 'UAE',
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

export function detectUaeFlags(job) {
  const text = `${job.title}\n${job.description ?? ''}\n${job.nationality ?? ''}`;
  const flags = [...(job.flags ?? [])];
  if (/uae nationals?\s*only|emirati\s*only|for uae nationals/i.test(text)) flags.push('uae-nationals-only');
  if (/uae experience\s*(required|mandatory)|years?\s*(of\s*)?uae experience/i.test(text)) flags.push('uae-experience-required');
  if (/visa (transfer|sponsorship)|company (will )?provide visa|employment visa/i.test(text)) flags.push('mentions-visa');
  if (/immediate joiners?\s*only|joining immediately/i.test(text)) flags.push('immediate-joiner');
  return [...new Set(flags)];
}

export function isUaeLocation(location) {
  if (!location) return false;
  return /\b(uae|u\.a\.e|united arab emirates|dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah|umm al|al ain|du,\s*ae|az,\s*ae)\b/i.test(
    location,
  );
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
