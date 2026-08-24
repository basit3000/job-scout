/** Known job portals Job Scout can use (JobSpy and/or Apify). */

export const BOARD_CATALOG = [
  {
    id: 'indeed',
    label: 'Indeed',
    jobspy: true,
    apify: true,
    regions: '60+ countries',
    free: true,
    note: 'Strong free JobSpy coverage.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    jobspy: true,
    apify: true,
    regions: 'Global',
    free: true,
    note: 'JobSpy free; Apify optional.',
  },
  {
    id: 'glassdoor',
    label: 'Glassdoor',
    jobspy: true,
    apify: false,
    regions: '20+ countries',
    free: true,
    note: 'JobSpy only — often blocked (location HTTP 400). Prefer Indeed/Arbeitsagentur for DE.',
    flaky: true,
  },
  {
    id: 'google',
    label: 'Google Jobs',
    jobspy: true,
    apify: false,
    regions: 'Global',
    free: true,
    note: 'JobSpy only — frequently returns 0 results. Prefer Indeed/LinkedIn.',
    flaky: true,
  },
  {
    id: 'zip_recruiter',
    label: 'ZipRecruiter',
    jobspy: true,
    apify: false,
    regions: 'US & Canada',
    free: true,
    note: 'Best for US/CA markets.',
  },
  {
    id: 'naukri',
    label: 'Naukri',
    jobspy: true,
    apify: false,
    regions: 'India',
    free: true,
    note: 'Best with market IN.',
  },
  {
    id: 'bdjobs',
    label: 'BDJobs',
    jobspy: true,
    apify: false,
    regions: 'Bangladesh',
    free: true,
    note: 'Bangladesh-focused.',
  },
  {
    id: 'bayt',
    label: 'Bayt',
    jobspy: false,
    apify: true,
    regions: 'MENA',
    free: false,
    note: 'Apify only. Needs market with baytCountry (AE, SA, …).',
    needsBaytCountry: true,
  },
  {
    id: 'arbeitsagentur',
    label: 'Arbeitsagentur',
    jobspy: false,
    apify: false,
    api: true,
    regions: 'Germany',
    free: true,
    note: 'Bundesagentur für Arbeit — free Jobsuche API. Market DE only.',
    needsGermanyMarket: true,
  },
  {
    id: 'arbeitnow',
    label: 'Arbeitnow',
    jobspy: false,
    apify: false,
    api: true,
    regions: 'Germany / EU remote',
    free: true,
    note: 'Free Germany-focused tech board API. Best with market DE.',
    needsGermanyMarket: true,
  },
  {
    id: 'berlinstartupjobs',
    label: 'Berlin Startup Jobs',
    jobspy: false,
    apify: false,
    api: true,
    regions: 'Berlin startups',
    free: true,
    note: 'https://berlinstartupjobs.com — WordPress REST. Market DE only.',
    needsGermanyMarket: true,
  },
  {
    id: 'munichstartup',
    label: 'Munich Startup',
    jobspy: false,
    apify: false,
    api: true,
    regions: 'Munich startups',
    free: true,
    note: 'https://www.munich-startup.de/en/jobs — HTML listing scrape. Market DE only.',
    needsGermanyMarket: true,
  },
  {
    id: 'pegel',
    label: 'Pegel',
    jobspy: false,
    apify: false,
    api: true,
    regions: 'Berlin startups',
    free: true,
    note: 'https://pegel.berlin — free Berlin startup ATS feed API. Market DE only.',
    needsGermanyMarket: true,
  },
  {
    id: 'nomado24',
    label: 'Nomado24',
    jobspy: false,
    apify: false,
    api: true,
    regions: 'Germany / EU remote+hybrid',
    free: true,
    note: 'https://www.nomado24.de — free remote/hybrid API (attribution). Market DE only.',
    needsGermanyMarket: true,
  },
];

export const BOARD_IDS = new Set(BOARD_CATALOG.map((b) => b.id));

export function getBoardMeta(id) {
  return BOARD_CATALOG.find((b) => b.id === id) ?? null;
}

export function normalizeBoardEntry(entry) {
  if (typeof entry === 'string') return { board: entry, queriesFromProfile: true };
  if (entry && typeof entry === 'object' && entry.board) {
    return { queriesFromProfile: true, ...entry, board: String(entry.board) };
  }
  return null;
}

/** Build search-profile boards array from selected ids, keeping prior input blocks. */
export function mergeBoardSelection(selectedIds, previousBoards = []) {
  const prevById = new Map();
  for (const raw of previousBoards) {
    const e = normalizeBoardEntry(raw);
    if (e) prevById.set(e.board, e);
  }
  const out = [];
  for (const id of selectedIds) {
    if (!BOARD_IDS.has(id)) continue;
    const prev = prevById.get(id);
    out.push(prev ? { ...prev, board: id } : { board: id, queriesFromProfile: true });
  }
  return out;
}

export function selectedBoardIds(boards) {
  return (boards ?? [])
    .map((b) => (typeof b === 'string' ? b : b?.board))
    .filter((id) => id && BOARD_IDS.has(id));
}

/** Whether a catalog board can run for this market (Bayt / Germany gates). */
export function boardAvailableForMarket(meta, market) {
  if (!meta) return false;
  if (meta.needsBaytCountry && !market?.baytCountry) return false;
  if (meta.needsGermanyMarket && String(market?.id || '').toUpperCase() !== 'DE') return false;
  return true;
}
