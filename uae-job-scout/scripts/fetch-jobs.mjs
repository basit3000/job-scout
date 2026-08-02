#!/usr/bin/env node
// UAE-only job fetch: Apify primary, JobSpy fallback.
//
//   node scripts/fetch-jobs.mjs
//   node scripts/fetch-jobs.mjs --allow-paid          # enable Apify (Bayt)
//   node scripts/fetch-jobs.mjs --boards indeed,linkedin
//   node scripts/fetch-jobs.mjs --force-jobspy

import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  ROOT,
  flag,
  value,
  run,
  loadJson,
  jobId,
  normalise,
  detectUaeFlags,
  isUaeLocation,
  runApifyActor,
  workspaceDir,
} from './lib/common.mjs';
import { assertNoPlaceholders, isPlaceholder } from './lib/placeholders.mjs';
import { renderJobs } from './lib/render.mjs';

const ALLOW_PAID = flag('--allow-paid');
const FORCE_JOBSPY = flag('--force-jobspy');
const INCLUDE_SEEN = flag('--include-seen');
const CONFIG_PATH = value('--config', join(ROOT, 'search-profile.json'));

const APIFY_BOARDS = {
  bayt: {
    actor: 'unfenced-group/bayt-scraper',
    buildInput: (query, { limit, maxAgeDays, boardConfig }) => ({
      searchQuery: query.what,
      location: query.where ?? '',
      country: 'UAE',
      maxItems: limit,
      daysOld: maxAgeDays ?? 0,
      fetchDetails: true,
      ...(boardConfig.input ?? {}),
    }),
    mapItem: (j) => ({
      board: 'bayt',
      via: 'apify',
      nativeId: j.jobId ?? j.url,
      title: j.title,
      company: j.company,
      location: j.location || [j.city, j.country || 'UAE'].filter(Boolean).join(', '),
      country: 'UAE',
      remote: j.isRemote ?? null,
      url: j.applyUrl || j.url,
      postedAt: j.postedDate ?? null,
      employmentType: j.employmentType ?? null,
      salary: j.salaryText
        || (j.salaryMin != null
          ? `${j.salaryMin}${j.salaryMax != null ? `–${j.salaryMax}` : ''} ${j.salaryCurrency ?? 'AED'} ${j.salaryPeriod ?? ''}`.trim()
          : null),
      seniority: j.careerLevel ?? null,
      yearsExperience: j.yearsOfExperience ?? null,
      nationality: j.nationality ?? null,
      description: j.descriptionText || j.descriptionMarkdown || j.descriptionHtml || null,
    }),
  },
  linkedin: {
    actor: 'sourabhbgp/linkedin-jobs-scraper',
    buildInput: (query, { limit, boardConfig }) => ({
      mode: 'search',
      keywords: query.what,
      location: query.where || 'United Arab Emirates',
      maxResults: limit,
      enrichDetails: true,
      datePosted: 'pastMonth',
      sortBy: 'recent',
      ...(boardConfig.input ?? {}),
    }),
    mapItem: (j) => ({
      board: 'linkedin',
      via: 'apify',
      nativeId: j.jobId ?? j.jobUrl ?? j.url,
      title: j.title,
      company: j.company,
      location: j.location,
      country: 'UAE',
      remote: /remote/i.test(String(j.workplaceType ?? j.location ?? '')) || null,
      url: j.applyUrl || j.jobUrl || j.url,
      postedAt: j.postedDate ?? null,
      employmentType: j.employmentType ?? null,
      salary: j.salary ?? null,
      seniority: j.seniorityLevel ?? null,
      description: j.description ?? null,
    }),
  },
  indeed: {
    actor: 'factden/indeed-jobs-scraper',
    buildInput: (query, { limit, maxAgeDays, boardConfig }) => ({
      query: query.what,
      location: query.where || 'Dubai',
      country: 'AE',
      maxItems: limit,
      radius: query.radiusKm ?? 50,
      datePosted: String(maxAgeDays ?? 30),
      ...(boardConfig.input ?? {}),
    }),
    mapItem: (j) => ({
      board: 'indeed',
      via: 'apify',
      nativeId: j.id ?? j.jobKey ?? j.url ?? j.jobUrl,
      title: j.title ?? j.jobTitle,
      company: j.company ?? j.companyName,
      location: j.location ?? j.formattedLocation ?? [j.city, 'UAE'].filter(Boolean).join(', '),
      country: 'UAE',
      remote: j.remote ?? j.isRemote ?? null,
      url: j.url ?? j.jobUrl ?? j.link,
      postedAt: j.datePosted ?? j.postedAt ?? j.pubDate ?? null,
      employmentType: j.jobType ?? j.employmentType ?? null,
      salary: j.salary ?? j.salaryText ?? null,
      description: j.description ?? j.jobDescription ?? null,
    }),
  },
};

async function fetchViaApify(board, query, opts) {
  const spec = APIFY_BOARDS[board];
  if (!spec) throw new Error(`No Apify Actor for "${board}"`);
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN is not set');
  if (!ALLOW_PAID) throw new Error('Apify costs money — re-run with --allow-paid');

  const items = await runApifyActor(spec.actor, spec.buildInput(query, opts), { token });
  return items.map(spec.mapItem).map((raw) => {
    const job = normalise({ ...raw, id: jobId(`uae:${raw.board}`, raw.nativeId), source: `uae:${raw.board}` });
    job.flags = detectUaeFlags(job);
    return job;
  });
}

async function fetchViaJobspy(boards, query, { limit, maxAgeDays }) {
  const payload = {
    boards,
    what: query.what,
    where: query.where || 'Dubai',
    limit,
    hoursOld: (maxAgeDays ?? 30) * 24,
    linkedinFetchDescription: true,
  };
  const dir = await mkdtemp(join(tmpdir(), 'uae-jobspy-'));
  const cfgPath = join(dir, 'cfg.json');
  await writeFile(cfgPath, JSON.stringify(payload));

  const script = join(ROOT, 'scripts', 'jobspy_fallback.py');
  let stdout;
  try {
    ({ stdout } = await run('python3', [script, '--config', cfgPath], {
      maxBuffer: 32 * 1024 * 1024,
      env: process.env,
    }));
  } catch (err) {
    const detail = String(err.stderr || err.message).trim().split('\n').slice(-3).join(' | ');
    throw new Error(detail);
  }

  const result = JSON.parse(stdout);
  if (!result.ok) throw new Error(result.error || 'JobSpy returned ok:false');

  return (result.jobs ?? []).map((raw) => {
    const job = normalise({
      ...raw,
      id: jobId(`uae:${raw.board}`, raw.nativeId),
      source: `uae:${raw.board}`,
    });
    job.flags = detectUaeFlags(job);
    return job;
  });
}

const toRegexes = (patterns) => (patterns ?? []).map((p) => new RegExp(p, 'i'));

function applyFilters(jobs, filters, decided) {
  const mustMatch = toRegexes(filters.titleMustMatch);
  const mustNotMatch = toRegexes(filters.titleMustNotMatch);
  const excludeCompanies = toRegexes(filters.excludeCompanies);
  const dropped = {
    tooOld: 0, titleExcluded: 0, titleNotMatched: 0, company: 0,
    notUae: 0, nationalsOnly: 0, alreadyDecided: 0, noUrl: 0,
  };

  const kept = jobs.filter((job) => {
    if (!job.url) return (dropped.noUrl++, false);
    if (filters.maxAgeDays != null && job.ageDays != null && job.ageDays > filters.maxAgeDays) {
      return (dropped.tooOld++, false);
    }
    if (mustNotMatch.some((re) => re.test(job.title))) return (dropped.titleExcluded++, false);
    if (excludeCompanies.some((re) => re.test(job.company))) return (dropped.company++, false);
    if (mustMatch.length && !mustMatch.some((re) => re.test(job.title))) {
      return (dropped.titleNotMatched++, false);
    }
    const looksUae = isUaeLocation(job.location) || job.country === 'UAE' || job.remote === true;
    if (filters.uaeOnly !== false && !looksUae) return (dropped.notUae++, false);
    if (filters.dropNationalsOnly && job.flags?.includes('uae-nationals-only')) {
      return (dropped.nationalsOnly++, false);
    }
    if (!INCLUDE_SEEN && decided.has(job.id)) return (dropped.alreadyDecided++, false);
    return true;
  });

  return { kept, dropped };
}

function dedupe(jobs) {
  const key = (j) =>
    `${j.company.toLowerCase().replace(/\b(llc|ltd|fz|fzco|dmcc|l\.l\.c)\b/g, '').replace(/[^a-z0-9]/g, '')}|` +
    `${j.title.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')}`;
  const byKey = new Map();
  for (const job of jobs) {
    const k = key(job);
    const existing = byKey.get(k);
    if (!existing) { byKey.set(k, job); continue; }
    const better = (job.description?.length ?? 0) > (existing.description?.length ?? 0) ? job : existing;
    const other = better === job ? existing : job;
    better.alsoOn = [...new Set([...(better.alsoOn ?? []), ...(other.alsoOn ?? []), other.source])];
    if (better.via !== 'apify' && other.via === 'apify') {
      other.alsoOn = better.alsoOn;
      byKey.set(k, other);
    } else byKey.set(k, better);
  }
  return [...byKey.values()];
}

function buildQueriesFromProfile(profile, config, boardConfig) {
  // Prefer explicit per-board queries; otherwise title × city from the profile.
  if (Array.isArray(boardConfig.queries) && boardConfig.queries.length) return boardConfig.queries;
  if (boardConfig.queriesFromProfile === false && Array.isArray(config.queries)) return config.queries;

  const titles = (profile.search?.titles ?? []).filter((t) => t && !isPlaceholder(t));
  const cities = (config.cities ?? [{ where: 'Dubai' }]).filter((c) => c?.where && !isPlaceholder(c.where));
  const targets = (profile.location?.targets ?? []).filter((t) => t && !isPlaceholder(t));

  const wheres = cities.length
    ? cities
    : targets.map((t) => ({ where: t, radiusKm: 50 }));

  if (!titles.length) {
    console.error('profile.search.titles is empty or still full of YOUR_* placeholders.');
    console.error('Add real job titles for this person\'s field, e.g. ["Staff Nurse", "Registered Nurse"].');
    process.exit(1);
  }
  if (!wheres.length) {
    console.error('No UAE cities to search. Set search-profile.json cities or profile.location.targets.');
    process.exit(1);
  }

  const queries = [];
  for (const title of titles) {
    for (const city of wheres) {
      queries.push({
        what: title,
        where: city.where,
        radiusKm: city.radiusKm,
      });
    }
  }
  return queries;
}

async function main() {
  const config = await loadJson(CONFIG_PATH, null);
  if (!config) {
    console.error(`No search profile at ${CONFIG_PATH}`);
    process.exit(1);
  }

  const profile = await loadJson(join(ROOT, 'profile.json'), null);
  if (!profile) {
    console.error('No profile.json found.');
    console.error('  cp profile.example.json profile.json');
    console.error('Then replace every YOUR_* placeholder with real values for this person.');
    process.exit(1);
  }

  // Block runs that would literally search for "YOUR_JOB_TITLE_QUERY_1"
  assertNoPlaceholders('profile.json', {
    name: profile.name,
    targetRole: profile.targetRole,
    search: profile.search,
  });

  const outDir = workspaceDir();
  await mkdir(outDir, { recursive: true });

  const decisions = await loadJson(join(ROOT, 'state', 'decisions.json'), { decisions: [] });
  const decided = new Set((decisions.decisions ?? []).map((d) => d.id));

  const filters = {
    ...config.filters,
    maxAgeDays: Number(value('--max-age-days', profile.constraints?.maxAgeDays ?? config.filters?.maxAgeDays ?? 30)),
    dropNationalsOnly: profile.constraints?.dropNationalsOnly ?? config.filters?.dropNationalsOnly ?? true,
    titleMustMatch: (profile.search?.includeTitlePatterns ?? []).filter((p) => p && !isPlaceholder(p)),
    titleMustNotMatch: [
      ...(config.filters?.titleMustNotMatch ?? []),
      ...((profile.search?.excludeTitlePatterns ?? []).filter((p) => p && !isPlaceholder(p))),
    ],
    excludeCompanies: [
      ...(config.filters?.excludeCompanies ?? []),
      ...(profile.constraints?.excludeCompanies ?? []),
    ],
  };

  if (!filters.titleMustMatch.length) {
    console.error('profile.search.includeTitlePatterns has no real patterns.');
    console.error('Add regexes that describe THIS person\'s field (e.g. ["nurse|nursing"] or ["accountant|accounting"]).');
    process.exit(1);
  }

  const limit = Number(value('--limit', config.limitPerQuery ?? 25));
  const requested = value('--boards', null)?.split(',').map((s) => s.trim()).filter(Boolean);
  const boards = (config.boards ?? ['bayt', 'indeed', 'linkedin']).filter(
    (b) => !requested || requested.includes(typeof b === 'string' ? b : b.board),
  );

  const sourceStatus = [];
  const collected = [];

  for (const entry of boards) {
    const boardConfig = typeof entry === 'string' ? { board: entry } : entry;
    const board = boardConfig.board;
    const queries = buildQueriesFromProfile(profile, config, boardConfig);
    let count = 0;
    let via = null;
    let failure = null;

    for (const query of queries) {
      const opts = { limit, maxAgeDays: filters.maxAgeDays, boardConfig };
      let usedApify = false;

      if (!FORCE_JOBSPY && process.env.APIFY_TOKEN && ALLOW_PAID && APIFY_BOARDS[board]) {
        try {
          const jobs = await fetchViaApify(board, query, opts);
          for (const job of jobs) collected.push(job);
          count += jobs.length;
          via = 'apify';
          usedApify = true;
        } catch (err) {
          failure = `apify: ${err.message}`;
        }
      } else if (!FORCE_JOBSPY && APIFY_BOARDS[board] && !process.env.APIFY_TOKEN) {
        failure = 'apify: APIFY_TOKEN not set';
      } else if (!FORCE_JOBSPY && APIFY_BOARDS[board] && !ALLOW_PAID) {
        failure = 'apify: need --allow-paid';
      }

      const jobspyBoards = board === 'bayt' ? [] : [board];
      if ((!usedApify || count === 0) && jobspyBoards.length) {
        try {
          const jobs = await fetchViaJobspy(jobspyBoards, query, opts);
          if (!usedApify) {
            for (const job of jobs) collected.push(job);
            count += jobs.length;
            via = 'jobspy';
            failure = failure ? `${failure}; fell back to jobspy` : null;
          }
        } catch (err) {
          failure = failure ? `${failure}; jobspy: ${err.message}` : `jobspy: ${err.message}`;
        }
      } else if (!usedApify && board === 'bayt') {
        failure = `${failure ? `${failure}; ` : ''}bayt has no JobSpy fallback (403) — set APIFY_TOKEN and pass --allow-paid`;
      }
    }

    sourceStatus.push({ board, ok: count > 0, count, via, ...(failure ? { error: failure } : {}) });
  }

  const { kept, dropped } = applyFilters(collected, filters, decided);
  const deduped = dedupe(kept).sort((a, b) => (a.ageDays ?? 999) - (b.ageDays ?? 999));

  const meta = {
    market: 'UAE',
    candidate: profile.name ?? null,
    targetRole: profile.targetRole ?? null,
    generatedAt: new Date().toISOString(),
    strategy: FORCE_JOBSPY ? 'jobspy-only' : 'apify-primary-jobspy-fallback',
    fetched: collected.length,
    dropped,
    duplicatesRemoved: kept.length - deduped.length,
    sourceStatus,
  };

  await writeFile(join(outDir, 'jobs.json'), `${JSON.stringify({ ...meta, jobs: deduped }, null, 2)}\n`);
  await writeFile(join(outDir, 'jobs.md'), `${renderJobs(deduped, meta)}\n`);

  console.log(`Wrote ${join(outDir, 'jobs.json')}`);
  console.log(`Wrote ${join(outDir, 'jobs.md')}`);
  console.log(`Candidate: ${meta.candidate ?? '(no profile.json — filters only)'}`);
  console.log(`Strategy: ${meta.strategy}`);
  console.log(`Fetched ${collected.length}, kept ${deduped.length}.`);
  for (const s of sourceStatus) {
    console.log(`  ${s.ok ? '✓' : '✗'} ${s.board}: ${s.ok ? `${s.count} via ${s.via}` : s.error}`);
  }
  const droppedSummary = Object.entries(dropped).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(', ');
  if (droppedSummary) console.log(`  dropped: ${droppedSummary}`);
  if (!process.env.APIFY_TOKEN) {
    console.log('\nTip: export APIFY_TOKEN=... and re-run with --allow-paid to enable Bayt.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
