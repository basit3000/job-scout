/**
 * Free Germany-specific job sources (not JobSpy / Apify).
 * - arbeitsagentur: Bundesagentur für Arbeit Jobsuche API
 * - arbeitnow: Arbeitnow public job-board API
 * - berlinstartupjobs: Berlin Startup Jobs (WordPress REST)
 * - munichstartup: Munich Startup pinboard (HTML listing)
 * - pegel: Pegel Berlin startup roles API
 * - nomado24: Nomado24 DE/EU remote+hybrid API
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
    if (!res.ok) throw new Error(`BerlinStartupJobs HTTP ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items) || !items.length) break;

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

export async function fetchGermanyPortal(board, query, opts, market) {
  if (board === 'arbeitsagentur') return fetchArbeitsagentur(query, opts, market);
  if (board === 'arbeitnow') return fetchArbeitnow(query, opts, market);
  if (board === 'berlinstartupjobs') return fetchBerlinStartupJobs(query, opts, market);
  if (board === 'munichstartup') return fetchMunichStartup(query, opts, market);
  if (board === 'pegel') return fetchPegel(query, opts, market);
  if (board === 'nomado24') return fetchNomado24(query, opts, market);
  throw new Error(`No Germany portal fetcher for "${board}"`);
}
