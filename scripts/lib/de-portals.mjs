/**
 * Free Germany-specific job sources (not JobSpy / Apify).
 * - arbeitsagentur: Bundesagentur für Arbeit Jobsuche API
 * - arbeitnow: Arbeitnow public job-board API
 */

import { jobId, normalise, detectMarketFlags, stripHtml, clean } from './common.mjs';

const AA_BASE = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
const AA_KEY = 'jobboerse-jobsuche';
const AA_UA = 'JobScout/1.0 (personal job search; +https://github.com/YOUR_GITHUB/job-scout)';

function aaLocation(job) {
  const loc = job.stellenlokationen?.[0]?.adresse;
  if (!loc) return null;
  return [loc.ort, loc.region, loc.land].filter(Boolean).join(', ');
}

function aaUrl(job) {
  if (job.externeURL) return job.externeURL;
  const ref = job.referenznummer;
  if (!ref) return null;
  return `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}`;
}

function aaEmploymentType(job) {
  if (job.arbeitszeitVollzeit) return 'fulltime';
  if (
    job.arbeitszeitTeilzeitFlexibel ||
    job.arbeitszeitTeilzeitVormittag ||
    job.arbeitszeitTeilzeitNachmittag ||
    job.arbeitszeitTeilzeitAbend
  ) {
    return 'parttime';
  }
  return null;
}

/** Search Bundesagentur für Arbeit (Germany). Free public API key. */
export async function fetchArbeitsagentur(query, { limit }, market) {
  const size = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const umkreis = Math.min(Math.max(Number(query.radiusKm ?? market.defaultRadiusKm) || 50, 0), 200);
  const params = new URLSearchParams({
    was: query.what || '',
    wo: query.where || market.defaultLocation || 'Deutschland',
    size: String(size),
    page: '1',
    umkreis: String(umkreis),
  });

  const res = await fetch(`${AA_BASE}/pc/v6/jobs?${params}`, {
    headers: {
      'X-API-Key': AA_KEY,
      Accept: 'application/json',
      'User-Agent': AA_UA,
    },
  });
  if (!res.ok) {
    throw new Error(`Arbeitsagentur HTTP ${res.status}`);
  }
  const data = await res.json();
  const items = data.ergebnisliste ?? data.stellenangebote ?? [];
  const source = `${market.slug}:arbeitsagentur`;

  return items
    .map((j) => {
      const url = aaUrl(j);
      if (!url) return null;
      const raw = {
        board: 'arbeitsagentur',
        via: 'api',
        nativeId: j.referenznummer || j.hashId || url,
        title: j.stellenangebotsTitel || j.hauptberuf,
        company: j.firma,
        location: aaLocation(j),
        country: market.shortName,
        remote: Boolean(j.homeofficemoeglich),
        url,
        postedAt: j.datumErsteVeroeffentlichung || j.veroeffentlichungszeitraum?.von || null,
        employmentType: aaEmploymentType(j),
        salary: j.verguetungsangabe && j.verguetungsangabe !== 'KEINE_ANGABEN' ? j.verguetungsangabe : null,
        description: j.hauptberuf ? `Beruf: ${j.hauptberuf}` : null,
      };
      const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
      job.flags = detectMarketFlags(job, market);
      return job;
    })
    .filter(Boolean);
}

function decodeArbeitnowHtml(html) {
  return stripHtml(
    String(html ?? '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&'),
  );
}

function matchesQuery(job, query) {
  const title = `${job.title || ''} ${job.company_name || ''} ${(job.tags || []).join(' ')}`.toLowerCase();
  const tokens = clean(query.what)
    .toLowerCase()
    .split(/[^a-z0-9+#.]/i)
    .filter((t) => t.length >= 2);
  if (tokens.length && !tokens.some((t) => title.includes(t))) return false;

  const where = clean(query.where).toLowerCase();
  if (
    where &&
    where !== 'germany' &&
    where !== 'deutschland' &&
    where !== 'remote'
  ) {
    const loc = String(job.location || '').toLowerCase();
    if (!job.remote && loc && !loc.includes(where) && !where.includes(loc)) return false;
  }
  return true;
}

/** Arbeitnow public board — Germany-heavy tech/remote listings. Client-side filter. */
export async function fetchArbeitnow(query, { limit }, market) {
  const want = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const out = [];
  const maxPages = 3;

  for (let page = 1; page <= maxPages && out.length < want; page += 1) {
    const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, {
      headers: { Accept: 'application/json', 'User-Agent': AA_UA },
    });
    if (!res.ok) throw new Error(`Arbeitnow HTTP ${res.status}`);
    const data = await res.json();
    const items = data.data ?? [];
    if (!items.length) break;

    for (const j of items) {
      if (!matchesQuery(j, query)) continue;
      const url = j.url;
      if (!url) continue;
      const source = `${market.slug}:arbeitnow`;
      const raw = {
        board: 'arbeitnow',
        via: 'api',
        nativeId: j.slug || url,
        title: j.title,
        company: j.company_name,
        location: j.location || (j.remote ? 'Remote' : null),
        country: market.shortName,
        remote: Boolean(j.remote),
        url,
        postedAt: j.created_at ? new Date(Number(j.created_at) * 1000).toISOString() : null,
        employmentType: Array.isArray(j.job_types) && j.job_types.length ? j.job_types.join(', ') : null,
        description: decodeArbeitnowHtml(j.description).slice(0, 4000),
      };
      const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
      job.flags = detectMarketFlags(job, market);
      out.push(job);
      if (out.length >= want) break;
    }
  }

  return out;
}

export async function fetchGermanyPortal(board, query, opts, market) {
  if (board === 'arbeitsagentur') return fetchArbeitsagentur(query, opts, market);
  if (board === 'arbeitnow') return fetchArbeitnow(query, opts, market);
  throw new Error(`No Germany portal fetcher for "${board}"`);
}
