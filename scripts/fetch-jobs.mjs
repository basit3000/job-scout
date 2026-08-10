#!/usr/bin/env node
// Country-configurable job fetch: Apify primary, JobSpy fallback.
//
//   node scripts/fetch-jobs.mjs
//   node scripts/fetch-jobs.mjs --market GB
//   node scripts/fetch-jobs.mjs --allow-paid          # enable Apify (Bayt where available)
//   node scripts/fetch-jobs.mjs --boards indeed,linkedin
//   node scripts/fetch-jobs.mjs --force-jobspy
//   node scripts/fetch-jobs.mjs --replace             # wipe archive instead of merging

import { mkdir, writeFile, mkdtemp, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  ROOT,
  flag,
  value,
  run,
  loadJson,
  loadMarket,
  loadDotEnv,
  jobId,
  normalise,
  detectMarketFlags,
  isMarketLocation,
  runApifyActor,
  workspaceDir,
  daysSince,
} from './lib/common.mjs';
import { assertNoPlaceholders, isPlaceholder } from './lib/placeholders.mjs';
import { renderJobs } from './lib/render.mjs';
import { dedupeJobs, mergeJobArchives, jobDedupeKey, urlDedupeKey } from './lib/dedupe.mjs';
import {
  BOARD_IDS,
  boardAvailableForMarket,
  getBoardMeta,
  normalizeBoardEntry,
} from './lib/boards.mjs';
import { fetchGermanyPortal } from './lib/de-portals.mjs';

loadDotEnv();

const ALLOW_PAID = flag('--allow-paid');
const FORCE_JOBSPY = flag('--force-jobspy');
const APIFY_FIRST = flag('--apify-first');
const INCLUDE_SEEN = flag('--include-seen');
/** Wipe previous .workspace jobs instead of merging (default is accumulate + dedupe). */
const REPLACE_RESULTS = flag('--replace');
const CONFIG_PATH = value('--config', join(ROOT, 'search-profile.json'));

function stopFlagPath() {
  return join(workspaceDir(), 'fetch.stop');
}

let stopRequested = false;

function isStopRequested() {
  if (stopRequested) return true;
  if (existsSync(stopFlagPath())) {
    stopRequested = true;
    return true;
  }
  return false;
}

async function clearStopFlag() {
  try {
    await unlink(stopFlagPath());
  } catch {
    /* missing is fine */
  }
}

function armStopHandlers() {
  const ask = () => {
    if (stopRequested) return;
    stopRequested = true;
    console.error('\nStop requested — finishing current query, then saving jobs found so far…');
  };
  process.on('SIGINT', ask);
  process.on('SIGTERM', ask);
}

/** factden/indeed-jobs-scraper only accepts "", "1", "3", "7", "14". */
function mapIndeedDatePosted(maxAgeDays) {
  const days = Number(maxAgeDays ?? 30);
  if (!Number.isFinite(days) || days <= 0) return '';
  if (days <= 1) return '1';
  if (days <= 3) return '3';
  if (days <= 7) return '7';
  return '14';
}

function buildApifyBoards(market) {
  return {
    bayt: {
      actor: 'unfenced-group/bayt-scraper',
      enabled: Boolean(market.baytCountry) && market.boards.includes('bayt'),
      buildInput: (query, { limit, maxAgeDays, boardConfig }) => ({
        searchQuery: query.what,
        location: query.where ?? '',
        country: market.baytCountry || market.shortName,
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
        location: j.location || [j.city, j.country || market.shortName].filter(Boolean).join(', '),
        country: market.shortName,
        remote: j.isRemote ?? null,
        url: j.applyUrl || j.url,
        postedAt: j.postedDate ?? null,
        employmentType: j.employmentType ?? null,
        salary: j.salaryText
          || (j.salaryMin != null
            ? `${j.salaryMin}${j.salaryMax != null ? `–${j.salaryMax}` : ''} ${j.salaryCurrency ?? market.currency} ${j.salaryPeriod ?? ''}`.trim()
            : null),
        seniority: j.careerLevel ?? null,
        yearsExperience: j.yearsOfExperience ?? null,
        nationality: j.nationality ?? null,
        description: j.descriptionText || j.descriptionMarkdown || j.descriptionHtml || null,
      }),
    },
    linkedin: {
      actor: 'sourabhbgp/linkedin-jobs-scraper',
      enabled: true,
      buildInput: (query, { limit, boardConfig }) => ({
        mode: 'search',
        keywords: query.what,
        location: query.where || market.name,
        maxResults: limit,
        // enrichDetails is expensive on Apify — off by default; opt in via boardConfig.input
        enrichDetails: false,
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
        country: market.shortName,
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
      enabled: true,
      buildInput: (query, { limit, maxAgeDays, boardConfig }) => {
        const { datePosted: datePostedOverride, ...extra } = boardConfig.input ?? {};
        const allowed = new Set(['', '1', '3', '7', '14']);
        const datePosted =
          datePostedOverride != null && allowed.has(String(datePostedOverride))
            ? String(datePostedOverride)
            : mapIndeedDatePosted(maxAgeDays);
        return {
          query: query.what,
          location: query.where || market.defaultLocation,
          country: market.indeedCountryCode,
          maxItems: limit,
          radius: query.radiusKm ?? market.defaultRadiusKm ?? 50,
          datePosted,
          ...extra,
        };
      },
      mapItem: (j) => ({
        board: 'indeed',
        via: 'apify',
        nativeId: j.id ?? j.jobKey ?? j.url ?? j.jobUrl,
        title: j.title ?? j.jobTitle,
        company: j.company ?? j.companyName,
        location: j.location ?? j.formattedLocation ?? [j.city, market.shortName].filter(Boolean).join(', '),
        country: market.shortName,
        remote: j.remote ?? j.isRemote ?? null,
        url: j.url ?? j.jobUrl ?? j.link,
        postedAt: j.datePosted ?? j.postedAt ?? j.pubDate ?? null,
        employmentType: j.jobType ?? j.employmentType ?? null,
        salary: j.salary ?? j.salaryText ?? null,
        description: j.description ?? j.jobDescription ?? null,
      }),
    },
  };
}

async function fetchViaApify(board, query, opts, market, apifyBoards) {
  const spec = apifyBoards[board];
  if (!spec) throw new Error(`No Apify Actor for "${board}"`);
  if (spec.enabled === false) throw new Error(`Board "${board}" is disabled for market ${market.id}`);
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN is not set');
  if (!ALLOW_PAID) throw new Error('Apify costs money — re-run with --allow-paid');

  const items = await runApifyActor(spec.actor, spec.buildInput(query, opts), { token });
  const source = `${market.slug}:${board}`;
  return items.map(spec.mapItem).map((raw) => {
    const job = normalise({ ...raw, id: jobId(source, raw.nativeId), source }, market);
    job.flags = detectMarketFlags(job, market);
    return job;
  });
}

async function fetchViaJobspy(boards, query, { limit, maxAgeDays }, market) {
  const where = query.where || market.defaultLocation;
  const payload = {
    boards,
    what: query.what,
    where,
    limit,
    hoursOld: (maxAgeDays ?? 30) * 24,
    linkedinFetchDescription: true,
    countryIndeed: market.jobspyCountryIndeed,
    country: market.shortName,
    currency: market.currency,
    googleSearchTerm: `${query.what} jobs near ${where}`,
  };
  const dir = await mkdtemp(join(tmpdir(), 'jobspy-'));
  const cfgPath = join(dir, 'cfg.json');
  await writeFile(cfgPath, JSON.stringify(payload));

  const script = join(ROOT, 'scripts', 'jobspy_fallback.py');
  // Windows often has a Store stub for `python3` while real Python is `python` / `py`.
  const pyBins = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  let stdout;
  let lastErr;
  let stderr = '';
  for (const bin of pyBins) {
    try {
      ({ stdout, stderr } = await run(bin, [script, '--config', cfgPath], {
        maxBuffer: 32 * 1024 * 1024,
        env: process.env,
      }));
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const msg = String(err.stderr || err.message);
      // Missing binary / Store alias — try next. Real script failures stop here.
      if (/not found|ENOENT|App execution aliases/i.test(msg) && bin !== pyBins[pyBins.length - 1]) {
        continue;
      }
      break;
    }
  }
  if (lastErr || stdout == null) {
    const detail = String(lastErr?.stderr || lastErr?.message || 'Python not found')
      .trim()
      .split('\n')
      .slice(-3)
      .join(' | ');
    throw new Error(detail);
  }

  const result = JSON.parse(stdout);
  if (!result.ok) throw new Error(result.error || 'JobSpy returned ok:false');

  const jobs = (result.jobs ?? []).map((raw) => {
    const source = `${market.slug}:${raw.board}`;
    const job = normalise({
      ...raw,
      id: jobId(source, raw.nativeId),
      source,
    }, market);
    job.flags = detectMarketFlags(job, market);
    return job;
  });

  // Attach soft failure reason (Glassdoor/Google often return empty without throwing).
  if (!jobs.length && (result.error || result.warnings?.length)) {
    const hint = result.error
      || result.warnings.slice(-3).join(' | ')
      || String(stderr || '').trim().split('\n').slice(-2).join(' | ');
    const err = new Error(hint || 'JobSpy returned 0 jobs');
    err.code = 'JOBSPY_EMPTY';
    err.jobs = jobs;
    throw err;
  }

  return jobs;
}

const toRegexes = (patterns) => (patterns ?? []).map((p) => new RegExp(p, 'i'));

function applyFilters(jobs, filters, decided, market) {
  const mustMatch = toRegexes(filters.titleMustMatch);
  const mustNotMatch = toRegexes(filters.titleMustNotMatch);
  const excludeCompanies = toRegexes(filters.excludeCompanies);
  const dropped = {
    tooOld: 0, titleExcluded: 0, titleNotMatched: 0, company: 0,
    wrongCountry: 0, nationalsOnly: 0, alreadyDecided: 0, noUrl: 0,
  };

  const countryOnly = filters.countryOnly ?? filters.uaeOnly ?? true;

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
    const looksLocal =
      isMarketLocation(job.location, market)
      || job.country === market.shortName
      || job.country === market.name
      || job.country === market.id
      || job.remote === true;
    if (countryOnly && !looksLocal) return (dropped.wrongCountry++, false);
    if (filters.dropNationalsOnly && job.flags?.includes('nationals-only')) {
      return (dropped.nationalsOnly++, false);
    }
    // Back-compat with older flag name from UAE-only runs
    if (filters.dropNationalsOnly && job.flags?.includes('uae-nationals-only')) {
      return (dropped.nationalsOnly++, false);
    }
    if (!INCLUDE_SEEN && decided.has(job.id)) return (dropped.alreadyDecided++, false);
    return true;
  });

  return { kept, dropped };
}

function buildQueriesFromProfile(profile, config, boardConfig, market) {
  if (Array.isArray(boardConfig.queries) && boardConfig.queries.length) return boardConfig.queries;
  if (boardConfig.queriesFromProfile === false && Array.isArray(config.queries)) return config.queries;

  const titles = (profile.search?.titles ?? []).filter((t) => t && !isPlaceholder(t));
  const configCities = (config.cities ?? []).filter((c) => c?.where && !isPlaceholder(c.where));
  const marketCities = (market.cities ?? []).filter((c) => c?.where && !isPlaceholder(c.where));
  const cities = configCities.length ? configCities : marketCities;
  const targets = (profile.location?.targets ?? []).filter((t) => t && !isPlaceholder(t));

  const wheres = cities.length
    ? cities
    : targets.map((t) => ({ where: t, radiusKm: market.defaultRadiusKm ?? 50 }));

  if (!titles.length) {
    console.error('profile.search.titles is empty or still full of YOUR_* placeholders.');
    console.error('Add real job titles for this person\'s field, e.g. ["Staff Nurse", "Registered Nurse"].');
    process.exit(1);
  }
  if (!wheres.length) {
    console.error(`No cities to search for ${market.name}. Set search-profile.json cities, markets/${market.id}.json cities, or profile.location.targets.`);
    process.exit(1);
  }

  const queries = [];
  for (const title of titles) {
    for (const city of wheres) {
      queries.push({
        what: title,
        where: city.where,
        radiusKm: city.radiusKm ?? market.defaultRadiusKm,
      });
    }
  }
  return queries;
}

function resolveBoards(config, market, requested) {
  const fromConfig = config.boards;
  const fromMarket = (market.boards ?? ['indeed', 'linkedin']).map((board) =>
    typeof board === 'string' ? { board } : board,
  );

  const entries = (Array.isArray(fromConfig) && fromConfig.length
    ? fromConfig
    : fromMarket
  )
    .map(normalizeBoardEntry)
    .filter(Boolean);

  const unknown = entries.filter((e) => !BOARD_IDS.has(e.board)).map((e) => e.board);
  if (unknown.length) {
    console.error(`Unknown board(s): ${unknown.join(', ')}. Known: ${[...BOARD_IDS].join(', ')}`);
    process.exit(1);
  }

  // Drop boards that don't apply to this market; honor --boards filter
  return entries.filter((entry) => {
    const meta = getBoardMeta(entry.board);
    if (!boardAvailableForMarket(meta, market)) return false;
    if (requested && !requested.includes(entry.board)) return false;
    return true;
  });
}

async function main() {
  let config = await loadJson(CONFIG_PATH, null);
  if (!config) {
    const example = join(ROOT, 'search-profile.example.json');
    config = await loadJson(example, null);
    if (!config) {
      console.error(`No search profile at ${CONFIG_PATH}`);
      console.error('  cp search-profile.example.json search-profile.json');
      process.exit(1);
    }
    console.error(`No search-profile.json — using ${example} (copy it to customize; it is gitignored).`);
  }

  let market;
  try {
    market = await loadMarket(config);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const profile = await loadJson(join(ROOT, 'profile.json'), null);
  if (!profile) {
    console.error('No profile.json found.');
    console.error('  cp profile.example.json profile.json');
    console.error('Then replace every YOUR_* placeholder with real values for this person.');
    process.exit(1);
  }

  assertNoPlaceholders('profile.json', {
    name: profile.name,
    targetRole: profile.targetRole,
    search: profile.search,
  });

  const outDir = workspaceDir();
  await mkdir(outDir, { recursive: true });
  await clearStopFlag();
  armStopHandlers();

  const decisions = await loadJson(join(ROOT, 'state', 'decisions.json'), { decisions: [] });
  const decided = new Set((decisions.decisions ?? []).map((d) => d.id));

  const filters = {
    ...config.filters,
    maxAgeDays: Number(value('--max-age-days', profile.constraints?.maxAgeDays ?? config.filters?.maxAgeDays ?? 30)),
    dropNationalsOnly: profile.constraints?.dropNationalsOnly
      ?? config.filters?.dropNationalsOnly
      ?? market.dropNationalsOnlyDefault
      ?? false,
    countryOnly: config.filters?.countryOnly ?? config.filters?.uaeOnly ?? true,
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
  const boards = resolveBoards(config, market, requested);
  const apifyBoards = buildApifyBoards(market);

  const sourceStatus = [];
  const collected = [];

  const boardPlans = boards.map((entry) => {
    const boardConfig = typeof entry === 'string' ? { board: entry } : entry;
    return {
      boardConfig,
      board: boardConfig.board,
      queries: buildQueriesFromProfile(profile, config, boardConfig, market),
    };
  });
  const totalQueries = boardPlans.reduce((n, b) => n + b.queries.length, 0);
  const useApify = Boolean(!FORCE_JOBSPY && process.env.APIFY_TOKEN && ALLOW_PAID);
  // Free → JobSpy. Allow paid → Apify first (JobSpy fallback). --force-jobspy overrides.
  const preferJobspy = FORCE_JOBSPY
    ? true
    : (ALLOW_PAID || APIFY_FIRST)
      ? false
      : config.preferJobspy !== false;
  const maxApifyRuns = Number(value('--max-apify', config.maxApifyRuns ?? 8));
  let apifyRunsUsed = 0;
  const strategy = FORCE_JOBSPY
    ? 'jobspy-only'
    : useApify
      ? (preferJobspy ? 'jobspy-primary-apify-fallback' : 'apify-primary-jobspy-fallback')
      : 'jobspy-fallback';

  console.log(`Market: ${market.name} (${market.id})`);
  console.log(`Strategy: ${strategy}`);
  console.log(`Plan: ${boards.length} board(s), ${totalQueries} query(ies), limit ${limit}/query`);
  if (useApify) {
    console.log(`Apify: enabled (cap ${maxApifyRuns === 0 ? 'unlimited' : maxApifyRuns} runs)${preferJobspy ? ' — JobSpy first' : ' — Apify first'}`);
    console.log(`Cost tip: uncheck Allow paid / omit --allow-paid for $0 via JobSpy.\n`);
  } else {
    console.log(`Apify: off (free JobSpy path)\n`);
  }

  const baseline = REPLACE_RESULTS ? null : await loadJson(join(outDir, 'jobs.json'), null);
  const baselineJobs = baseline?.jobs ?? [];
  const baselineIds = baselineJobs.map((j) => j.id).filter(Boolean);
  const baselineKeys = new Set([
    ...baselineIds,
    ...baselineJobs.map((j) => urlDedupeKey(j.url)).filter(Boolean),
    ...baselineJobs.map((j) => jobDedupeKey(j)),
  ]);

  await writeFile(join(outDir, 'prev-fetch-ids.json'), `${JSON.stringify({
    savedAt: baseline?.generatedAt ?? null,
    ids: baselineIds,
  }, null, 2)}\n`);

  /** First persist with --replace wipes; later checkpoints merge into what we wrote. */
  let wipeOnce = REPLACE_RESULTS;

  async function persistResults({ quiet = false, stopped = false } = {}) {
    const { kept, dropped } = applyFilters(collected, filters, decided, market);
    const fresh = dedupeJobs(kept);
    const previous = wipeOnce ? null : await loadJson(join(outDir, 'jobs.json'), null);
    const previousJobs = previous?.jobs ?? [];
    if (wipeOnce) wipeOnce = false;

    const fetchedAt = new Date().toISOString();
    const merged = mergeJobArchives(previousJobs, fresh, {
      fetchedAt,
      previousFetchedAt: previous?.generatedAt ?? baseline?.generatedAt ?? null,
    })
      .map((job) => ({
        ...job,
        ageDays: job.postedAt ? daysSince(job.postedAt) : job.ageDays ?? null,
      }))
      .sort((a, b) => (a.ageDays ?? 999) - (b.ageDays ?? 999));

    const newIds = fresh
      .filter((j) => {
        if (baselineIds.includes(j.id)) return false;
        const uk = urlDedupeKey(j.url);
        if (uk && baselineKeys.has(uk)) return false;
        if (baselineKeys.has(jobDedupeKey(j))) return false;
        return true;
      })
      .map((j) => j.id);

    const duplicatesRemoved = (kept.length - fresh.length)
      + Math.max(0, previousJobs.length + fresh.length - merged.length);

    const meta = {
      market: market.shortName,
      marketId: market.id,
      marketName: market.name,
      candidate: profile.name ?? null,
      targetRole: profile.targetRole ?? null,
      generatedAt: fetchedAt,
      strategy,
      apifyRunsUsed,
      fetched: collected.length,
      fetchedKept: fresh.length,
      retainedFromPrevious: REPLACE_RESULTS && !previousJobs.length ? 0 : previousJobs.length,
      replaced: REPLACE_RESULTS,
      stopped,
      dropped,
      duplicatesRemoved,
      sourceStatus,
      newSinceLastFetch: newIds.length,
    };

    await writeFile(join(outDir, 'jobs.json'), `${JSON.stringify({ ...meta, jobs: merged }, null, 2)}\n`);
    await writeFile(join(outDir, 'jobs.md'), `${renderJobs(merged, meta)}\n`);
    await writeFile(join(outDir, 'digest.json'), `${JSON.stringify({
      generatedAt: meta.generatedAt,
      previousFetchAt: baseline?.generatedAt ?? null,
      newCount: newIds.length,
      newIds,
    }, null, 2)}\n`);

    if (quiet) {
      console.log(
        `  checkpoint: ${fresh.length} from this run → archive ${merged.length}`
        + (stopped ? ' (stopped — saved)' : ''),
      );
      return meta;
    }

    console.log(`Wrote ${join(outDir, 'jobs.json')}`);
    console.log(`Wrote ${join(outDir, 'jobs.md')}`);
    console.log(`Candidate: ${meta.candidate ?? '(no profile.json — filters only)'}`);
    console.log(`Strategy: ${meta.strategy}${stopped ? ' (stopped early)' : ''}`);
    if (stopped) {
      console.log(
        `Stopped after partial fetch: ${collected.length} pulled, ${newIds.length} new unique, archive ${merged.length}.`,
      );
    } else if (REPLACE_RESULTS) {
      console.log(`Fetched ${collected.length}, kept ${merged.length} (replaced previous archive).`);
    } else {
      console.log(
        `Fetched ${collected.length}, new unique ${newIds.length}, archive ${merged.length}`
        + ` (merged with previous; duplicates collapsed).`,
      );
    }
    for (const s of sourceStatus) {
      console.log(
        s.ok
          ? `  ✓ ${s.board}: ${s.count} via ${s.via}`
          : `  ✗ ${s.board}: ${s.error || '0 jobs'}`,
      );
    }
    const droppedSummary = Object.entries(dropped).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(', ');
    if (droppedSummary) console.log(`  dropped: ${droppedSummary}`);
    if (!process.env.APIFY_TOKEN && market.baytCountry) {
      console.log('\nTip: export APIFY_TOKEN=... and re-run with --allow-paid to enable Bayt.');
    }
    return meta;
  }

  let queryIndex = 0;
  let stoppedEarly = false;
  boardLoop: for (const { boardConfig, board, queries } of boardPlans) {
    if (isStopRequested()) {
      stoppedEarly = true;
      break boardLoop;
    }

    let count = 0;
    let via = null;
    let failure = null;

    console.log(`[${board}] ${queries.length} quer${queries.length === 1 ? 'y' : 'ies'}`);

    for (const query of queries) {
      if (isStopRequested()) {
        stoppedEarly = true;
        console.log('  stop requested — skipping remaining queries');
        break;
      }

      queryIndex += 1;
      const opts = { limit, maxAgeDays: filters.maxAgeDays, boardConfig };
      let usedApify = false;
      let queryGotJobs = false;
      const label = `"${query.what}" @ ${query.where || market.defaultLocation}`;
      const meta = getBoardMeta(board);
      const canApify = useApify && apifyBoards[board]?.enabled !== false && apifyBoards[board];
      const canJobspy = Boolean(meta?.jobspy);
      const canApi = Boolean(meta?.api);
      const jobspyBoards = canJobspy ? [board] : [];

      const runApi = async () => {
        if (!canApi) return false;
        process.stdout.write(`  (${queryIndex}/${totalQueries}) ${label} via api… `);
        try {
          const jobs = await fetchGermanyPortal(board, query, opts, market);
          for (const job of jobs) collected.push(job);
          count += jobs.length;
          if (jobs.length) {
            queryGotJobs = true;
            via = 'api';
          }
          console.log(`${jobs.length} job(s)`);
          return jobs.length > 0;
        } catch (err) {
          failure = failure ? `${failure}; api: ${err.message}` : `api: ${err.message}`;
          console.log(`failed (${err.message})`);
          return false;
        }
      };

      const runApify = async () => {
        if (!canApify) return false;
        if (maxApifyRuns > 0 && apifyRunsUsed >= maxApifyRuns) {
          failure = `apify: hit maxApifyRuns (${maxApifyRuns})`;
          console.log(`  (${queryIndex}/${totalQueries}) ${label} apify skipped — cap ${maxApifyRuns} reached`);
          return false;
        }
        process.stdout.write(`  (${queryIndex}/${totalQueries}) ${label} via apify… `);
        apifyRunsUsed += 1;
        try {
          const jobs = await fetchViaApify(board, query, opts, market, apifyBoards);
          for (const job of jobs) collected.push(job);
          count += jobs.length;
          if (jobs.length) queryGotJobs = true;
          via = 'apify';
          usedApify = true;
          console.log(`${jobs.length} job(s) [${apifyRunsUsed}${maxApifyRuns ? `/${maxApifyRuns}` : ''} paid]`);
          return true;
        } catch (err) {
          failure = `apify: ${err.message}`;
          console.log(`failed (${err.message})`);
          return false;
        }
      };

      const runJobspy = async () => {
        if (!jobspyBoards.length) return false;
        const prefix = usedApify ? 'fallback ' : '';
        process.stdout.write(`  (${queryIndex}/${totalQueries}) ${label} via ${prefix}jobspy… `);
        try {
          const jobs = await fetchViaJobspy(jobspyBoards, query, opts, market);
          if (!usedApify || !queryGotJobs) {
            for (const job of jobs) collected.push(job);
            count += jobs.length;
            if (jobs.length) {
              queryGotJobs = true;
              via = usedApify ? via : 'jobspy';
              failure = failure ? `${failure}; fell back to jobspy` : null;
            }
          }
          console.log(`${jobs.length} job(s)`);
          return jobs.length > 0;
        } catch (err) {
          const msg = err.message || 'JobSpy failed';
          failure = failure ? `${failure}; jobspy: ${msg}` : `jobspy: ${msg}`;
          console.log(err.code === 'JOBSPY_EMPTY' ? `0 job(s) — ${msg}` : `failed (${msg})`);
          return false;
        }
      };

      if (!FORCE_JOBSPY && !canApify && apifyBoards[board]) {
        if (!process.env.APIFY_TOKEN) failure = 'apify: APIFY_TOKEN not set';
        else if (!ALLOW_PAID) failure = 'apify: need --allow-paid';
      }

      if (canApi) {
        await runApi();
      } else if (board === 'bayt') {
        // Bayt has no JobSpy — Apify only
        if (!(await runApify()) && !usedApify) {
          failure = `${failure ? `${failure}; ` : ''}bayt has no JobSpy fallback (403) — set APIFY_TOKEN and pass --allow-paid`;
          console.log(`  (${queryIndex}/${totalQueries}) ${label} skipped — Bayt needs APIFY_TOKEN + --allow-paid`);
        }
      } else if (preferJobspy || !canApify) {
        const ok = await runJobspy();
        if (!ok && canApify) await runApify();
      } else {
        await runApify();
        if (!queryGotJobs && jobspyBoards.length) await runJobspy();
      }

      // Save after each query so Stop (or a hang/kill) keeps jobs found so far.
      if (collected.length) {
        await persistResults({ quiet: true, stopped: isStopRequested() });
      }
    }

    const statusError = failure
      || (count === 0 ? '0 jobs (board returned nothing or is blocked)' : null);
    sourceStatus.push({
      board,
      ok: count > 0,
      count,
      via,
      ...(statusError ? { error: statusError } : {}),
      ...(stoppedEarly ? { stopped: true } : {}),
    });
    console.log(`  → ${board} total so far: ${count}\n`);
    if (stoppedEarly) break boardLoop;
  }

  if (isStopRequested()) stoppedEarly = true;
  if (useApify) console.log(`Apify runs used this fetch: ${apifyRunsUsed}${maxApifyRuns ? ` / ${maxApifyRuns}` : ''}\n`);

  await persistResults({ quiet: false, stopped: stoppedEarly });
  await clearStopFlag();
  if (stoppedEarly) process.exitCode = 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
