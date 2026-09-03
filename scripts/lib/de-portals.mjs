/**
 * Free Germany-specific job sources (not JobSpy / Apify).
 * - arbeitsagentur: Bundesagentur für Arbeit Jobsuche API
 * - arbeitnow: Arbeitnow public job-board API
 * - berlinstartupjobs: Berlin Startup Jobs (WordPress REST)
 * - munichstartup: Munich Startup pinboard (HTML listing)
 * - pegel: Pegel Berlin startup roles API
 * - nomado24: Nomado24 DE/EU remote+hybrid API
 * - stepstone: StepStone.de HTML search listings
 * - xing: XING jobs HTML search listings
 * - kimeta: Kimeta.de Next.js search (packed __PPA__)
 * - heise: jobs.heise.de Next.js search (same PPA shape as Kimeta)
 * - germantechjobs: GermanTechJobs.de public RSS
 */

import { jobId, normalise, detectMarketFlags, stripHtml, clean } from './common.mjs';

const AA_BASE = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
const AA_KEY = 'jobboerse-jobsuche';
const AA_UA = 'JobScout/1.0 (personal job search; +https://github.com/YOUR_GITHUB/job-scout)';

const BSJ_BASE = 'https://berlinstartupjobs.com/wp-json/wp/v2';
const PEGEL_BASE = 'https://pegel.berlin/api/v1';
const NOMADO_BASE = 'https://api.nomado24.de/api/public/v1';
const MUNICH_LIST = 'https://www.munich-startup.de/en/jobs/?category=stellenangebote';

function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

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

function queryTokens(query) {
  return clean(query.what)
    .toLowerCase()
    .split(/[^a-z0-9+#.]/i)
    .filter((t) => t.length >= 2);
}

function matchesTextQuery(haystack, query) {
  const title = String(haystack || '').toLowerCase();
  const tokens = queryTokens(query);
  if (tokens.length && !tokens.some((t) => title.includes(t))) return false;
  return true;
}

function matchesWhere(location, remote, query) {
  const where = clean(query.where).toLowerCase();
  if (
    !where ||
    where === 'germany' ||
    where === 'deutschland' ||
    where === 'remote'
  ) {
    return true;
  }
  const loc = String(location || '').toLowerCase();
  if (remote && (where.includes('berlin') || where.includes('munich') || where.includes('münchen'))) {
    // city query: keep remotes that mention Germany / EU / the city
    if (!loc || /germany|deutschland|remote|eu\b|berlin|munich|münchen/.test(loc)) return true;
  }
  if (!loc) return true;
  if (loc.includes(where) || where.includes(loc)) return true;
  if (where.includes('munich') && /münchen|munich/.test(loc)) return true;
  if (where.includes('münchen') && /munich|münchen/.test(loc)) return true;
  return false;
}

function matchesQuery(job, query) {
  const title = `${job.title || ''} ${job.company_name || ''} ${(job.tags || []).join(' ')}`.toLowerCase();
  if (!matchesTextQuery(title, query)) return false;
  return matchesWhere(job.location, Boolean(job.remote), query);
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

function bsjTerms(post, taxonomy) {
  const groups = post._embedded?.['wp:term'] || [];
  const names = [];
  for (const group of groups) {
    for (const t of group || []) {
      if (t?.taxonomy === taxonomy && t.name) names.push(decodeEntities(t.name));
    }
  }
  return names;
}

/** Berlin Startup Jobs — WordPress posts API. */
export async function fetchBerlinStartupJobs(query, { limit }, market) {
  const want = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const out = [];
  const maxPages = 3;
  const search = clean(query.what) || '';

  for (let page = 1; page <= maxPages && out.length < want; page += 1) {
    const params = new URLSearchParams({
      per_page: '20',
      page: String(page),
      _embed: '1',
      orderby: 'date',
      order: 'desc',
    });
    if (search) params.set('search', search);

    const res = await fetch(`${BSJ_BASE}/posts?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': AA_UA },
    });
    const totalPages = Number(res.headers.get('X-WP-TotalPages') || 0);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    // WP REST returns 400 (not 404) when page > available pages.
    if (res.status === 400 && body?.code === 'rest_post_invalid_page_number') break;
    if (!res.ok) {
      throw new Error(`BerlinStartupJobs HTTP ${res.status}`);
    }

    const items = Array.isArray(body) ? body : [];
    if (!items.length) break;

    for (const p of items) {
      const title = decodeEntities(stripHtml(p.title?.rendered || ''));
      const company = bsjTerms(p, 'job_company')[0] || null;
      const location = bsjTerms(p, 'job_location')[0] || 'Berlin, Germany';
      const tags = bsjTerms(p, 'post_tag');
      const hay = `${title} ${company || ''} ${tags.join(' ')}`;
      if (!matchesTextQuery(hay, query)) continue;
      if (!matchesWhere(location, /remote/i.test(location), query)) continue;
      const url = p.link;
      if (!url) continue;
      const source = `${market.slug}:berlinstartupjobs`;
      const raw = {
        board: 'berlinstartupjobs',
        via: 'api',
        nativeId: String(p.id || p.slug || url),
        title,
        company,
        location,
        country: market.shortName,
        remote: /remote/i.test(location),
        url,
        postedAt: p.date || p.date_gmt || null,
        description: stripHtml(decodeEntities(p.excerpt?.rendered || p.content?.rendered || '')).slice(0, 4000),
      };
      const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
      job.flags = detectMarketFlags(job, market);
      out.push(job);
      if (out.length >= want) break;
    }

    if (totalPages && page >= totalPages) break;
  }

  return out;
}

/**
 * Munich Startup jobs pinboard — HTML listing scrape (no public JSON API).
 * Site: https://www.munich-startup.de/en/jobs/
 */
export async function fetchMunichStartup(query, { limit }, market) {
  const want = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const res = await fetch(MUNICH_LIST, {
    headers: { Accept: 'text/html', 'User-Agent': AA_UA },
  });
  if (!res.ok) throw new Error(`MunichStartup HTTP ${res.status}`);
  const html = await res.text();

  const cardRe =
    /href="(\/en\/jobs\/anzeige\/\d+)"[\s\S]*?<p class="text-card-meta[^"]*">([\s\S]*?)<\/p>[\s\S]*?<h3 class="text-card-title[^"]*">([\s\S]*?)<\/h3>/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = cardRe.exec(html)) && out.length < want * 3) {
    const path = m[1];
    const company = decodeEntities(stripHtml(m[2])).trim();
    const title = decodeEntities(stripHtml(m[3])).trim();
    if (!title || seen.has(path)) continue;
    seen.add(path);
    const hay = `${title} ${company}`;
    if (!matchesTextQuery(hay, query)) continue;
    // Board is Munich-focused; keep when where is Munich/Germany/empty
    const where = clean(query.where).toLowerCase();
    if (
      where &&
      where !== 'germany' &&
      where !== 'deutschland' &&
      !where.includes('munich') &&
      !where.includes('münchen') &&
      where !== 'remote'
    ) {
      // e.g. Berlin-only query — skip Munich board hits
      continue;
    }
    const url = `https://www.munich-startup.de${path}`;
    const source = `${market.slug}:munichstartup`;
    const raw = {
      board: 'munichstartup',
      via: 'html',
      nativeId: path.split('/').pop(),
      title,
      company: company || null,
      location: 'Munich, Germany',
      country: market.shortName,
      remote: false,
      url,
      postedAt: null,
      description: null,
    };
    const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
    job.flags = detectMarketFlags(job, market);
    out.push(job);
    if (out.length >= want) break;
  }

  return out;
}

/** Pegel — curated Berlin startup roles (free read-only API). */
export async function fetchPegel(query, { limit }, market) {
  const want = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const out = [];
  const maxPages = 3;
  const search = clean(query.what) || '';

  for (let page = 1; page <= maxPages && out.length < want; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(Math.min(want, 50)),
      postedWithin: '30d',
    });
    if (search) params.set('q', search);

    const res = await fetch(`${PEGEL_BASE}/jobs?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': AA_UA },
    });
    if (!res.ok) throw new Error(`Pegel HTTP ${res.status}`);
    const data = await res.json();
    const items = data.data ?? [];
    if (!items.length) break;

    for (const j of items) {
      const title = j.title || '';
      const company = j.company?.name || null;
      const location = j.location || 'Berlin, Germany';
      const remote = String(j.remoteModeTier || '').includes('remote');
      const hay = `${title} ${company || ''} ${(j.techTags || []).join(' ')}`;
      if (!matchesTextQuery(hay, query)) continue;
      if (!matchesWhere(location, remote, query)) continue;
      const url = j.atsUrl || j.pegelUrl;
      if (!url) continue;
      const source = `${market.slug}:pegel`;
      const salary =
        j.salaryMin != null
          ? `${j.salaryMin}${j.salaryMax != null ? `–${j.salaryMax}` : ''} ${j.salaryCurrency || 'EUR'}`.trim()
          : null;
      const raw = {
        board: 'pegel',
        via: 'api',
        nativeId: j.id || j.slug || url,
        title,
        company,
        location,
        country: market.shortName,
        remote,
        url,
        postedAt: j.postedAt || j.firstSeenAt || null,
        employmentType: j.contractTypeRaw || null,
        salary,
        seniority: j.seniorityRaw || null,
        description: j.summaryText || null,
      };
      const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
      job.flags = detectMarketFlags(job, market);
      out.push(job);
      if (out.length >= want) break;
    }
  }

  return out;
}

/** Nomado24 — free DE/EU remote + hybrid jobs API (attribution: nomado24.de). */
export async function fetchNomado24(query, { limit }, market) {
  const want = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const out = [];
  const maxPages = 3;
  const search = clean(query.what) || '';

  for (let page = 1; page <= maxPages && out.length < want; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(Math.min(want, 50)),
    });
    if (search) params.set('q', search);

    const res = await fetch(`${NOMADO_BASE}/jobs?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': AA_UA },
    });
    if (!res.ok) throw new Error(`Nomado24 HTTP ${res.status}`);
    const data = await res.json();
    const items = data.data ?? [];
    if (!items.length) break;

    for (const j of items) {
      const title = j.title || '';
      const company = j.companyName || null;
      const location = j.location || (j.remote ? 'Remote' : null);
      const remote = Boolean(j.remote) || String(j.workArrangement || '').includes('remote');
      const hay = `${title} ${company || ''} ${(j.tags || []).join(' ')}`;
      if (!matchesTextQuery(hay, query)) continue;
      if (!matchesWhere(location, remote, query)) continue;
      const url = j.url;
      if (!url) continue;
      const source = `${market.slug}:nomado24`;
      const salary =
        j.salaryMin != null
          ? `${j.salaryMin}${j.salaryMax != null ? `–${j.salaryMax}` : ''} ${j.currency || 'EUR'}`.trim()
          : null;
      const raw = {
        board: 'nomado24',
        via: 'api',
        nativeId: j.slug || url,
        title,
        company,
        location,
        country: market.shortName,
        remote,
        url,
        postedAt: j.publishedAt || null,
        employmentType: Array.isArray(j.tags) ? j.tags.find((t) => /full|part|permanent|intern/i.test(t)) : null,
        salary,
        description: null,
      };
      const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
      job.flags = detectMarketFlags(job, market);
      out.push(job);
      if (out.length >= want) break;
    }
  }

  return out;
}

const STEPSTONE_ORIGIN = 'https://www.stepstone.de';
const STEPSTONE_CITY_SLUG = {
  germany: 'deutschland',
  deutschland: 'deutschland',
  berlin: 'berlin',
  munich: 'muenchen',
  'münchen': 'muenchen',
  hamburg: 'hamburg',
  frankfurt: 'frankfurt-am-main',
  'frankfurt am main': 'frankfurt-am-main',
  cologne: 'koeln',
  'köln': 'koeln',
  stuttgart: 'stuttgart',
  düsseldorf: 'duesseldorf',
  dusseldorf: 'duesseldorf',
  leipzig: 'leipzig',
  dresden: 'dresden',
  hannover: 'hannover',
  nuremberg: 'nuernberg',
  nürnberg: 'nuernberg',
  erfurt: 'erfurt',
};

export function stepstoneSlug(text) {
  return clean(text)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function stepstoneCitySlug(where) {
  const key = clean(where).toLowerCase();
  if (!key || key === 'remote') return 'deutschland';
  if (STEPSTONE_CITY_SLUG[key]) return STEPSTONE_CITY_SLUG[key];
  return stepstoneSlug(key) || 'deutschland';
}

export function stepstoneSearchUrl(query, page = 1) {
  const what = stepstoneSlug(query?.what) || 'software-developer';
  const city = stepstoneCitySlug(query?.where);
  let url = `${STEPSTONE_ORIGIN}/jobs/${what}/in-${city}`;
  if (page > 1) url += `?page=${page}`;
  return url;
}

export function parseStepstoneAgo(text) {
  const s = decodeEntities(String(text || '')).toLowerCase();
  const n = Number((s.match(/(\d+)/) || [])[1] || 1);
  const d = new Date();
  if (/stunde|hour/.test(s)) d.setHours(d.getHours() - n);
  else if (/tag|day/.test(s)) d.setDate(d.getDate() - n);
  else if (/woche|week/.test(s)) d.setDate(d.getDate() - 7 * n);
  else if (/monat|month/.test(s)) d.setMonth(d.getMonth() - n);
  else return null;
  return d.toISOString();
}

function tidyField(text) {
  return decodeEntities(stripHtml(text || ''))
    .replace(/data-(?:testid|at)="[^"]+"/gi, ' ')
    .replace(/\btabindex="[^"]*"/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/g, '')
    .replace(/^[>\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fieldAfter(html, at) {
  const start = html.search(new RegExp(`data-at="${at}"`));
  if (start < 0) return '';
  const from = html.slice(start);
  const gt = from.indexOf('>');
  if (gt < 0) return '';
  const rest = from.slice(gt + 1);
  const next = rest.search(/data-at="/);
  const body = next === -1 ? rest.slice(0, 600) : rest.slice(0, next);
  return tidyField(body);
}

export function parseStepstoneCard(chunk) {
  const hrefM = chunk.match(/href="(\/stellenangebote--[^"]+)"/i);
  const href = hrefM?.[1];
  if (!href) return null;
  const idM = href.match(/--(\d+)-inline\.html/i);
  if (!idM) return null;
  const titleBlock = chunk.match(/data-testid="job-item-title"[\s\S]*?<\/a>/i);
  const title = tidyField(titleBlock?.[0] || '');
  if (!title) return null;
  const location = fieldAfter(chunk, 'job-item-location');
  const snippet = fieldAfter(chunk, 'jobcard-content');
  return {
    nativeId: idM[1],
    href,
    title,
    company: fieldAfter(chunk, 'job-item-company-name') || null,
    location: location || null,
    postedAt: parseStepstoneAgo(fieldAfter(chunk, 'job-item-timeago')),
    description: snippet || null,
    remote: /remote|home[\s-]?office|homeoffice/i.test(`${location} ${snippet}`),
  };
}

function splitStepstoneCards(html) {
  const cleaned = String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  return cleaned.split(/data-testid="job-item"/).slice(1);
}

/** StepStone.de search listings (HTML). No public job-search API. */
export async function fetchStepstone(query, { limit }, market) {
  const want = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const out = [];
  const seen = new Set();
  const maxPages = want > 25 ? 2 : 1;

  for (let page = 1; page <= maxPages && out.length < want; page += 1) {
    const url = stepstoneSearchUrl(query, page);
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': AA_UA,
        'Accept-Language': 'en,de;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`StepStone HTTP ${res.status}`);
    const html = await res.text();
    const cards = splitStepstoneCards(html);
    if (!cards.length && page === 1) throw new Error('StepStone returned no listings');

    for (const chunk of cards) {
      const parsed = parseStepstoneCard(chunk);
      if (!parsed || seen.has(parsed.nativeId)) continue;
      seen.add(parsed.nativeId);
      const hay = `${parsed.title} ${parsed.company || ''}`;
      if (!matchesTextQuery(hay, query)) continue;
      if (!matchesWhere(parsed.location, parsed.remote, query)) continue;
      const source = `${market.slug}:stepstone`;
      const raw = {
        board: 'stepstone',
        via: 'html',
        nativeId: parsed.nativeId,
        title: parsed.title,
        company: parsed.company,
        location: parsed.location,
        country: market.shortName,
        remote: parsed.remote,
        url: `${STEPSTONE_ORIGIN}${parsed.href}`,
        postedAt: parsed.postedAt,
        description: parsed.description,
      };
      const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
      job.flags = detectMarketFlags(job, market);
      out.push(job);
      if (out.length >= want) break;
    }
  }

  return out;
}

const XING_ORIGIN = 'https://www.xing.com';
const KIMETA_ORIGIN = 'https://www.kimeta.de';
const HEISE_ORIGIN = 'https://jobs.heise.de';
const GERMANTECH_RSS = 'https://germantechjobs.de/rss';

function nationwideWhere(where) {
  const key = clean(where).toLowerCase();
  return !key || key === 'germany' || key === 'deutschland' || key === 'remote';
}

export function xingSearchUrl(query, page = 1) {
  const params = new URLSearchParams({ keywords: clean(query?.what) || 'software' });
  if (!nationwideWhere(query?.where)) params.set('location', clean(query.where));
  const radius = Number(query?.radiusKm);
  if (Number.isFinite(radius) && radius > 0) params.set('radius', String(Math.round(radius)));
  if (page > 1) params.set('page', String(page));
  return `${XING_ORIGIN}/jobs/search?${params}`;
}

export function parseXingCard(chunk) {
  const hrefM = String(chunk || '').match(/href="(\/jobs\/[^"#?]+)"/i);
  const href = hrefM?.[1];
  if (!href) return null;
  const idM = href.match(/-(\d+)\/?$/);
  if (!idM) return null;
  const titleBlock = chunk.match(/data-testid="job-teaser-list-title"[^>]*>([\s\S]*?)<\/h2>/i);
  const title = tidyField(titleBlock?.[1] || '');
  if (!title) return null;
  const companyBlock = chunk.match(/job-teaser-list-item-styles__Company[^>]*>([\s\S]*?)<\/p>/i);
  const imgCompany = chunk.match(/<img[^>]*(?:title|aria-label)="([^"]+)"/i);
  const company = tidyField(companyBlock?.[1] || '') || tidyField(imgCompany?.[1] || '') || null;
  const locBlock = chunk.match(/multi-location-display[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  const location =
    tidyField((locBlock?.[1] || '').replace(/<b[\s\S]*$/i, ''))
      .replace(/\+\s*\d+\s*more/i, '')
      .replace(/\u00a0/g, ' ')
      .trim() || null;
  const timeM = chunk.match(/<time[^>]*dateTime="([^"]+)"/i);
  const snippet = [...chunk.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => tidyField(m[1]))
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
  return {
    nativeId: idM[1],
    href,
    title,
    company,
    location,
    postedAt: timeM?.[1] || null,
    description: snippet || null,
    remote: /remote|home[\s-]?office|homeoffice/i.test(`${location || ''} ${snippet} ${title}`),
  };
}

function splitXingCards(html) {
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .split(/data-testid="job-search-result"/)
    .slice(1);
}

/** XING.com/jobs search listings (HTML). No public job-search API. */
export async function fetchXing(query, { limit }, market) {
  const want = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const out = [];
  const seen = new Set();
  const maxPages = want > 25 ? 2 : 1;

  for (let page = 1; page <= maxPages && out.length < want; page += 1) {
    const url = xingSearchUrl(query, page);
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': AA_UA,
        'Accept-Language': 'en,de;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`Xing HTTP ${res.status}`);
    const html = await res.text();
    const cards = splitXingCards(html);
    if (!cards.length && page === 1) throw new Error('Xing returned no listings');

    for (const chunk of cards) {
      const parsed = parseXingCard(chunk);
      if (!parsed || seen.has(parsed.nativeId)) continue;
      seen.add(parsed.nativeId);
      const hay = `${parsed.title} ${parsed.company || ''}`;
      if (!matchesTextQuery(hay, query)) continue;
      if (!matchesWhere(parsed.location, parsed.remote, query)) continue;
      const source = `${market.slug}:xing`;
      const raw = {
        board: 'xing',
        via: 'html',
        nativeId: parsed.nativeId,
        title: parsed.title,
        company: parsed.company,
        location: parsed.location,
        country: market.shortName,
        remote: parsed.remote,
        url: `${XING_ORIGIN}${parsed.href}`,
        postedAt: parsed.postedAt,
        description: parsed.description,
      };
      const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
      job.flags = detectMarketFlags(job, market);
      out.push(job);
      if (out.length >= want) break;
    }
  }

  return out;
}

export function decodePackedJson(codes) {
  const CHUNK = 24576;
  let s = '';
  for (let i = 0; i < codes.length; i += CHUNK) {
    s += String.fromCharCode(...codes.slice(i, i + CHUNK));
  }
  return JSON.parse(s);
}

export function extractNextPpa(html) {
  const m = String(html || '').match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const ppa = data?.props?.pageProps?.__PPA__;
  if (Array.isArray(ppa)) return decodePackedJson(ppa);
  return data?.props?.pageProps ?? null;
}

export function ppaSearchUrl(origin, query, page = 0) {
  const params = new URLSearchParams();
  params.set('q', clean(query?.what) || '');
  if (!nationwideWhere(query?.where)) params.set('loc', clean(query.where));
  const radius = Number(query?.radiusKm);
  if (Number.isFinite(radius) && radius > 0) params.set('r', String(Math.round(radius)));
  if (page > 0) params.set('page', String(page));
  return `${origin}/search?${params}`;
}

export function mapPpaOffer(offer) {
  if (!offer?.documentId || !offer?.title) return null;
  const url = offer.offerUrl || offer.offerOriginalUrl;
  if (!url) return null;
  const loc = offer.location || null;
  const snippet = offer.teaser || '';
  return {
    nativeId: String(offer.documentId),
    title: decodeEntities(offer.title),
    company: offer.companyName ? decodeEntities(offer.companyName) : null,
    location: loc ? decodeEntities(loc) : null,
    url,
    postedAt: offer.firstFound || offer.lastChange || parseStepstoneAgo(offer.publishedString),
    description: snippet ? stripHtml(decodeEntities(snippet)).slice(0, 4000) : null,
    remote: /remote|home[\s-]?office|homeoffice/i.test(`${loc || ''} ${snippet}`),
    employmentType: Array.isArray(offer.hours) ? offer.hours.join(', ') : offer.hours || null,
  };
}

async function fetchPpaPortal(origin, board, query, { limit }, market) {
  const want = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const out = [];
  const seen = new Set();
  const maxPages = want > 20 ? 3 : 2;
  const label = board === 'heise' ? 'Heise' : 'Kimeta';

  for (let page = 0; page < maxPages && out.length < want; page += 1) {
    const url = ppaSearchUrl(origin, query, page);
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': AA_UA,
        'Accept-Language': 'de,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    const html = await res.text();
    const ppa = extractNextPpa(html);
    const offers = ppa?.searchResults?.jobOffers;
    if (!Array.isArray(offers) || !offers.length) {
      if (page === 0) throw new Error(`${label} returned no listings`);
      break;
    }

    for (const offer of offers) {
      const parsed = mapPpaOffer(offer);
      if (!parsed || seen.has(parsed.nativeId)) continue;
      seen.add(parsed.nativeId);
      const hay = `${parsed.title} ${parsed.company || ''}`;
      if (!matchesTextQuery(hay, query)) continue;
      if (!matchesWhere(parsed.location, parsed.remote, query)) continue;
      const source = `${market.slug}:${board}`;
      const raw = {
        board,
        via: 'html',
        nativeId: parsed.nativeId,
        title: parsed.title,
        company: parsed.company,
        location: parsed.location,
        country: market.shortName,
        remote: parsed.remote,
        url: parsed.url,
        postedAt: parsed.postedAt,
        employmentType: parsed.employmentType,
        description: parsed.description,
      };
      const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
      job.flags = detectMarketFlags(job, market);
      out.push(job);
      if (out.length >= want) break;
    }

    if (!ppa.searchResults?.canPageMore) break;
  }

  return out;
}

export function fetchKimeta(query, opts, market) {
  return fetchPpaPortal(KIMETA_ORIGIN, 'kimeta', query, opts, market);
}

export function fetchHeise(query, opts, market) {
  return fetchPpaPortal(HEISE_ORIGIN, 'heise', query, opts, market);
}

export function parseGermantechTitle(title) {
  const s = decodeEntities(title || '').trim();
  const m = s.match(/^(.*?)\s+@\s+(.*?)(?:\s+\[(.*)\])?\s*$/);
  if (!m) return { title: s, company: null, salary: null };
  return { title: m[1].trim(), company: m[2].trim(), salary: m[3] ? m[3].trim() : null };
}

export function parseRssItems(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const block = m[1];
    const tag = (name) => {
      const tm = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
      if (!tm) return '';
      return decodeEntities(tm[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim());
    };
    out.push({
      title: tag('title'),
      link: tag('link') || tag('guid'),
      pubDate: tag('pubDate'),
      description: tag('description'),
    });
  }
  return out;
}

function stripTracking(url) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

let germantechCache = { fetchedAt: 0, items: null };
const GERMANTECH_TTL_MS = 10 * 60 * 1000;

async function loadGermantechItems() {
  const now = Date.now();
  if (germantechCache.items && now - germantechCache.fetchedAt < GERMANTECH_TTL_MS) {
    return germantechCache.items;
  }
  const res = await fetch(GERMANTECH_RSS, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': AA_UA },
  });
  if (!res.ok) throw new Error(`GermanTechJobs HTTP ${res.status}`);
  const items = parseRssItems(await res.text());
  germantechCache = { fetchedAt: now, items };
  return items;
}

/** GermanTechJobs.de — salary-transparent tech/IT board via public RSS. */
export async function fetchGermantechJobs(query, { limit }, market) {
  const want = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const items = await loadGermantechItems();
  const out = [];

  for (const item of items) {
    if (out.length >= want) break;
    const parsed = parseGermantechTitle(item.title);
    const url = item.link ? stripTracking(item.link) : '';
    if (!parsed.title || !url) continue;
    const description = stripHtml(item.description || '').slice(0, 4000);
    const hay = `${parsed.title} ${parsed.company || ''} ${description}`;
    if (!matchesTextQuery(hay, query)) continue;
    const remote = /remote|home[\s-]?office|homeoffice/i.test(hay);
    if (!matchesWhere(description, remote, query)) continue;
    const source = `${market.slug}:germantechjobs`;
    let postedAt = null;
    if (item.pubDate) {
      const ms = Date.parse(item.pubDate);
      if (!Number.isNaN(ms)) postedAt = new Date(ms).toISOString();
    }
    const raw = {
      board: 'germantechjobs',
      via: 'rss',
      nativeId: url,
      title: parsed.title,
      company: parsed.company,
      location: remote ? 'Remote, Germany' : 'Germany',
      country: market.shortName,
      remote,
      url,
      postedAt,
      salary: parsed.salary,
      description: description || null,
    };
    const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
    job.flags = detectMarketFlags(job, market);
    out.push(job);
  }

  return out;
}

export async function fetchGermanyPortal(board, query, opts, market) {
  if (board === 'arbeitsagentur') return fetchArbeitsagentur(query, opts, market);
  if (board === 'arbeitnow') return fetchArbeitnow(query, opts, market);
  if (board === 'berlinstartupjobs') return fetchBerlinStartupJobs(query, opts, market);
  if (board === 'munichstartup') return fetchMunichStartup(query, opts, market);
  if (board === 'pegel') return fetchPegel(query, opts, market);
  if (board === 'nomado24') return fetchNomado24(query, opts, market);
  if (board === 'stepstone') return fetchStepstone(query, opts, market);
  if (board === 'xing') return fetchXing(query, opts, market);
  if (board === 'kimeta') return fetchKimeta(query, opts, market);
  if (board === 'heise') return fetchHeise(query, opts, market);
  if (board === 'germantechjobs') return fetchGermantechJobs(query, opts, market);
  throw new Error(`No Germany portal fetcher for "${board}"`);
}
