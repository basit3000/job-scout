/** Employer watchlists. Public ATS feeds where configured; BA employer search otherwise. */
import { jobId, normalise, pickDescription, isJobInMarket, detectMarketFlags } from './common.mjs';
import { fetchArbeitsagentur, hydrateJobDescription } from './de-portals.mjs';
import { normalizeCompany, dedupeJobs } from './dedupe.mjs';
import { mapLimit } from './fetch-pool.mjs';
import { expandSearchTitles, matchesTitlePatterns } from './title-matching.mjs';

const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (s, name) => decode(s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1]).trim();

export function matchesEmployer(name, company) {
  const key = s => normalizeCompany(String(s || '').toLowerCase().replace(/ü/g, 'ue').replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ß/g, 'ss'));
  const actual = key(name);
  return [company.name, ...(company.aliases || [])].some((alias) => {
    const wanted = key(alias);
    return wanted && (actual === wanted || actual.startsWith(wanted));
  });
}

export function companyQueries(config, profile, market = { name: 'Germany' }) {
  if (!config.companies?.length) throw new Error('Add a companies watchlist to search-profile.json before enabling Company careers');
  return (config.companies || []).map((company) => {
    if (!company.name) throw new Error('Each company needs a name in search-profile.json');
    return { what: company.name, where: market.name, company,
      titles: expandSearchTitles(profile.search?.titles || []),
      include: profile.search?.includeTitlePatterns || [], exclude: profile.search?.excludeTitlePatterns || [] };
  });
}

function wantedTitle(title, query) {
  return (!query.include?.length || matchesTitlePatterns(title, query.include.map(p => new RegExp(p, 'i'))))
    && !matchesTitlePatterns(title, (query.exclude || []).map(p => new RegExp(p, 'i')));
}

async function request(url, json = false) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Company sources require HTTPS');
  const res = await fetch(parsed, { signal: AbortSignal.timeout(20000), headers: { Accept: json ? 'application/json' : 'text/html, application/xml', 'User-Agent': 'JobScout/2' } });
  if (!res.ok) throw new Error(`Company source HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

export function parsePersonio(xml, company) {
  if (!/<workzag-jobs\b/.test(xml)) throw new Error('Invalid Personio jobs feed');
  return [...xml.matchAll(/<position>([\s\S]*?)<\/position>/g)].map(([, row]) => ({
    nativeId: tag(row, 'id'), title: tag(row, 'name'), company: company.name,
    location: [tag(row, 'office'), ...[...row.matchAll(/<additionalOffice>([\s\S]*?)<\/additionalOffice>/g)].map(m => tag(m[1], 'name'))].filter(Boolean).join('; '),
    url: `https://${company.tenant}.jobs.personio.${company.domain || 'de'}/job/${tag(row, 'id')}?language=en`,
    employmentType: tag(row, 'employmentType'), postedAt: tag(row, 'createdAt') || null,
    description: pickDescription([...row.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/g)]
      .map(m => `${tag(m[1], 'name')}\n${tag(m[1], 'value')}`).join('\n\n')),
  }));
}

export function parseJobPostings(html, pageUrl, company, now = Date.now()) {
  const jobs = [];
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if ([node['@type']].flat().includes('JobPosting')) {
      if (node.validThrough && Date.parse(node.validThrough) < now) return;
      const locations = [node.jobLocation || []].flat().map(loc => {
        const a = loc.address || {};
        return [a.addressLocality, a.addressRegion, typeof a.addressCountry === 'object' ? a.addressCountry.name : a.addressCountry].filter(Boolean).join(', ');
      });
      jobs.push({ title: node.title, company: node.hiringOrganization?.name || company.name,
        nativeId: node.identifier?.value || node.url || pageUrl, url: node.url || pageUrl,
        location: locations.join('; '), postedAt: node.datePosted || null,
        description: pickDescription(decode(node.description)), employmentType: [node.employmentType || []].flat().join(', ') || null,
        remote: node.jobLocationType === 'TELECOMMUTE' ? true : null });
    }
    if (node['@graph']) visit(node['@graph']);
  };
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Other schema blocks need not be job data. */ }
  }
  return jobs;
}

async function directJobs(company, query, market) {
  if (company.provider === 'amazon') {
    const jobs = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const country = { DE: 'DEU', GB: 'GBR', US: 'USA', AE: 'ARE', SA: 'SAU', IN: 'IND' }[market.id];
      if (!country) throw new Error(`Amazon country mapping unsupported: ${market.id}`);
      const params = new URLSearchParams({ base_query: company.searchTerm || '', country, result_limit: '100', offset: String(offset) });
      const data = await request(`https://www.amazon.jobs/en/search.json?${params}`, true);
      if (!Array.isArray(data.jobs)) throw new Error('Invalid Amazon jobs response');
      jobs.push(...data.jobs.filter(j => j.country_code === country).map(j => ({
        nativeId: String(j.id), title: j.title, company: j.company_name || company.name,
        location: `${j.city}, ${market.name}`, url: new URL(j.job_path, 'https://www.amazon.jobs').href,
        postedAt: j.posted_date && Number.isFinite(Date.parse(`${j.posted_date} UTC`)) ? new Date(`${j.posted_date} UTC`).toISOString() : null,
        description: pickDescription([j.description, 'Basic qualifications', j.basic_qualifications,
          'Preferred qualifications', j.preferred_qualifications].filter(Boolean).join('\n\n')),
        employmentType: j.job_schedule_type,
      })));
      if (!data.jobs.length || offset + data.jobs.length >= data.hits) return jobs;
    }
    throw new Error('Amazon result cap reached; narrow companies[].searchTerm');
  }
  if (company.provider === 'personio') {
    if (!/^[a-z0-9-]+$/i.test(company.tenant)) throw new Error('Invalid Personio tenant');
    const domain = company.domain || 'de';
    if (!['de', 'com'].includes(domain)) throw new Error('Personio domain must be de or com');
    return parsePersonio(await request(`https://${company.tenant}.jobs.personio.${domain}/xml?language=en`), company);
  }
  if (company.provider === 'greenhouse') {
    if (!/^[a-z0-9-]+$/i.test(company.tenant)) throw new Error('Invalid Greenhouse tenant');
    const data = await request(`https://boards-api.greenhouse.io/v1/boards/${company.tenant}/jobs?content=true`, true);
    if (!Array.isArray(data.jobs)) throw new Error('Invalid Greenhouse jobs response');
    return data.jobs.map(j => ({ nativeId: String(j.id), title: j.title, company: company.name,
      location: j.location?.name, url: j.absolute_url, description: pickDescription(decode(j.content)),
      postedAt: j.first_published || null })); // updated_at is not the original publication date.
  }
  if (company.provider === 'jsonld') {
    const html = await request(company.careersUrl);
    const pattern = new RegExp(company.jobLinkPattern);
    const links = [...new Set([...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .filter(m => pattern.test(m[1]) && wantedTitle(pickDescription(m[2]) || '', query))
      .map(m => new URL(decode(m[1]), company.careersUrl).href))]
      .filter(url => new URL(url).origin === new URL(company.careersUrl).origin);
    const jobs = parseJobPostings(html, company.careersUrl, company);
    await mapLimit(links, 3, async url => { jobs.push(...parseJobPostings(await request(url), url, company)); });
    return jobs;
  }
  throw new Error(`Unsupported company provider: ${company.provider}`);
}

export async function fetchCompanyCareers(query, opts, market) {
  const company = query.company;
  if (!company?.name) throw new Error('Configure companies in search-profile.json');
  let jobs;
  if (company.provider) {
    const source = `${market.slug}:companycareers`;
    if (company.markets && !company.markets.includes(market.id)) throw new Error(`Employer watchlist entry does not support market ${market.id}`);
    jobs = (await directJobs(company, query, market)).filter(raw => matchesEmployer(raw.company, company)).map(raw => normalise({ ...raw, board: 'companycareers', via: company.provider,
      id: jobId(source, `${company.name}:${raw.nativeId}`), source }, market));
  } else {
    if (market.id !== 'DE') throw new Error(`Arbeitsagentur employer search unsupported for ${market.id}; configure a direct employer feed.`);
    // Employer filter is advisory at the portal: verify the returned company as well.
    jobs = [];
    for (const employer of [...new Set([company.searchName || company.name, ...(company.aliases || [])])]) {
      for (const what of [...new Set(query.titles)]) {
        jobs.push(...await fetchArbeitsagentur({ what, where: 'Deutschland', employer }, { ...opts, hydrate: false }, market));
      }
    }
    jobs = jobs.filter(j => matchesEmployer(j.company, company));
  }
  // A multi-location advert is eligible when one explicitly listed location is in DE.
  // Preserve only those locations so the host's country gate doesn't discard it.
  jobs = jobs.map(j => ({ ...j, location: String(j.location || '').split(';')
    .map(s => s.trim()).filter(location => isJobInMarket({ location }, market)).join('; ') }));
  jobs = dedupeJobs(jobs.filter(j => {
    let safeUrl = false;
    try { safeUrl = ['https:', 'http:'].includes(new URL(j.url).protocol); } catch { /* Invalid listing link. */ }
    return j.title && safeUrl && wantedTitle(j.title, query) && isJobInMarket(j, market);
  }));
  await mapLimit(jobs, 3, async job => {
    if (!job.description) job.description = await hydrateJobDescription(job);
    job.flags = detectMarketFlags(job, market);
  });
  return jobs;
}
