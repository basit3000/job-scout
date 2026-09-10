#!/usr/bin/env node
// Local Job Scout web UI + API. Serves web/public and wraps existing scripts.
//
//   npm start          → http://localhost:4040

import { paginate, digestItems } from '../scripts/lib/list-pagination.mjs';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { createServer } from 'node:http';
import { writeFile, stat, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, extname } from 'node:path';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import {
  ROOT,
  loadJson,
  loadDotEnv,
  loadMarket,
  listMarketIds,
  workspaceDir,
  pickDescription,
} from '../scripts/lib/common.mjs';
import {
  loadDecisions,
  recordDecision,
  patchDecision,
  VALID_DECISIONS,
} from '../scripts/lib/decisions.mjs';
import { dedupeJobs, clusterByCompany } from '../scripts/lib/dedupe.mjs';
import { scoreJob } from '../scripts/lib/fit.mjs';
import { createScoreCache } from '../scripts/lib/score-cache.mjs';
const cachedScorer = createScoreCache(scoreJob);
import {
  writePrepPack,
  readPrepPack,
  loadCachedPrepPack,
  readPrepFile,
  hasCvPdf,
  loadPrepFlagsIndex,
  prepFlagsForJob,
  loadCvSettings,
  overleafStatus,
  exportPrepDownloads,
  revealDownloadsFolder,
  generateCoverLetterPack,
  prepDir,
  cursorAgentAvailable,
  listAgentModels,
  listAgentProvidersStatus,
  agentRunnerAvailable,
} from '../scripts/lib/prep.mjs';
import { cancelCvTailorAgent } from '../scripts/lib/cv-agent.mjs';
import { updateAgentSelection } from '../scripts/lib/agent-models.mjs';
import { loadSavedAnswers, saveSavedAnswers } from '../scripts/lib/saved-answers.mjs';
import { detectAts } from '../scripts/lib/ats.mjs';
import { buildApplyPack } from '../scripts/lib/apply-pack.mjs';
import {
  fillApplyInBrowser,
  fillAssistPayload,
  playwrightAvailable,
} from '../scripts/lib/apply-fill.mjs';
import {
  BOARD_CATALOG,
  BOARD_IDS,
  boardAvailableForMarket,
  mergeBoardSelection,
  selectedBoardIds,
} from '../scripts/lib/boards.mjs';
import { applySetup, getSetupStatus } from '../scripts/lib/setup-state.mjs';
import { compareFit, sortJobs, sortTrackerItems, trackerRecencyMs } from '../scripts/lib/job-sort.mjs';
import { detectPostingLanguage, detectGermanRequirement, postingWrittenLanguage, jobMatchesLanguageFilter } from '../scripts/lib/cv-keywords.mjs';
import { hydrateJobDescription } from '../scripts/lib/de-portals.mjs';
import {
  sheetsStatus,
  sheetsUrl,
  syncDecisionsToSheet,
  maybeSyncDecisionToSheet,
  pullRejectedFromSheet,
  SHEET_SYNC_DECISIONS,
} from '../scripts/lib/google-sheets.mjs';
import { appendRunHistory, batchRunTiming, formatDuration, loadRunHistory } from '../scripts/lib/run-history.mjs';
import { handleRecruiterApi } from './recruiter-routes.mjs';
import { handleTrackerApi } from './tracker-routes.mjs';
import { loadRecruiterStore } from '../scripts/lib/recruiter-contact.mjs';
import { assessPrep, loadPrepInputs, prepStatus } from '../scripts/lib/prep-state.mjs';
import { currentSearchState } from '../scripts/lib/current-search.mjs';
import { withMatchingAnswers } from '../scripts/lib/match-requirements.mjs';

loadDotEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = Number(process.env.PORT || 4040);
const SEARCH_PROFILE = join(ROOT, 'search-profile.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

const fetchState = {
  child: null,
  startedAt: null,
  lastCode: null,
  lastDurationMs: null,
  stopping: false,
  clients: new Set(),
  buffer: [],
};

const prepState = {
  running: false,
  jobId: null,
  startedAt: null,
  stopping: false,
  clients: new Set(),
  buffer: [],
  result: null,
  error: null,
};

/**
 * Batch Prep: run writePrepPack for many jobs one after another.
 * Never opens folders — files land in .workspace/prep/<id>/ and downloads/<Company>/<Role>-<JobID>/
 * and the Ready tab picks them up.
 */
const batchState = {
  running: false,
  stopping: false,
  startedAt: null,
  finishedAt: null,
  mode: 'agent',
  includeCoverLetter: true,
  skipExisting: true,
  replaceExisting: false,
  currentId: null,
  /** @type {Array<{id:string,title:string,company:string,status:string,error?:string|null,tailorMode?:string|null,note?:string|null,startedAt?:string|null,durationMs?:number|null}>} */
  items: [],
  clients: new Set(),
  buffer: [],
};

const BATCH_ITEM_STATUSES = ['pending', 'running', 'done', 'skipped', 'failed', 'cancelled'];

/** Decisions that mean "no longer worth applying to" — hidden from Ready. */
const READY_EXCLUDED = new Set(['applied', 'interviewing', 'offer', 'accepted', 'skipped', 'rejected', 'closed']);

function batchSnapshot({ withItems = true } = {}) {
  const counts = Object.fromEntries(BATCH_ITEM_STATUSES.map((s) => [s, 0]));
  for (const it of batchState.items) counts[it.status] = (counts[it.status] || 0) + 1;
  const current = batchState.items.find((it) => it.id === batchState.currentId) || null;
  const finished = counts.done + counts.skipped + counts.failed + counts.cancelled;
  const timing = batchRunTiming({
    startedAt: batchState.startedAt,
    finishedAt: batchState.finishedAt,
    items: batchState.items,
    running: batchState.running,
  });
  return {
    running: batchState.running,
    stopping: batchState.stopping,
    startedAt: batchState.startedAt,
    finishedAt: batchState.finishedAt,
    mode: batchState.mode,
    includeCoverLetter: batchState.includeCoverLetter,
    skipExisting: batchState.skipExisting,
    replaceExisting: batchState.replaceExisting,
    total: batchState.items.length,
    finished,
    counts,
    elapsedMs: timing.elapsedMs,
    avgMsPerJob: timing.avgMsPerJob,
    etaMs: timing.etaMs,
    timedCount: timing.timedCount,
    current: current ? { id: current.id, title: current.title, company: current.company } : null,
    ...(withItems ? { items: batchState.items } : {}),
  };
}

function broadcastBatch(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of [...batchState.clients]) {
    try {
      client.write(payload);
    } catch {
      batchState.clients.delete(client);
    }
  }
}

function markBatchItemDuration(item) {
  if (item?.startedAt && item.durationMs == null) {
    const start = Date.parse(item.startedAt);
    if (Number.isFinite(start)) item.durationMs = Math.max(0, Date.now() - start);
  }
}

function batchLog(line, stream = 'stdout') {
  const entry = { stream, line: String(line), t: Date.now() };
  batchState.buffer.push(entry);
  if (batchState.buffer.length > 1000) batchState.buffer.shift();
  broadcastBatch('log', entry);
}

async function runPrepBatch(jobsById, profile, saved, { extraInstructions }) {
  const total = batchState.items.length;
  batchLog(
    `Batch Prep: ${total} job(s) · ${batchState.mode}${batchState.includeCoverLetter ? ' + cover letter' : ''}${
      batchState.replaceExisting ? ' · replacing CVs and resetting selected role folders'
        : batchState.skipExisting ? ' · skipping jobs that already have files' : ''
    }`,
    'meta',
  );
  try {
    for (let i = 0; i < batchState.items.length; i += 1) {
      const item = batchState.items[i];
      if (batchState.stopping) {
        item.status = 'cancelled';
        continue;
      }
      const job = jobsById.get(item.id);
      if (!job) {
        item.status = 'failed';
        item.error = 'Job not found in archive';
        broadcastBatch('progress', batchSnapshot());
        continue;
      }

      item.status = 'running';
      item.startedAt = new Date().toISOString();
      item.durationMs = null;
      batchState.currentId = item.id;
      broadcastBatch('progress', batchSnapshot());
      batchLog(`[${i + 1}/${total}] ${job.company || '—'} — ${job.title}`, 'meta');

      try {
        if (batchState.skipExisting) {
          const flags = prepFlagsForJob(await loadPrepFlagsIndex(), job.id);
          const hasAll = flags.tailoredPdf && (!batchState.includeCoverLetter || flags.coverLetter);
          const freshness = await prepStatus(job, profile, await loadCvSettings(), {
            cv: true, letter: batchState.includeCoverLetter, instructions: extraInstructions, mode: batchState.mode,
          });
          if (hasAll && Object.values(freshness).every((s) => s === 'current')) {
            item.status = 'skipped';
            item.note = 'already has files';
            markBatchItemDuration(item);
            batchLog(`  skipped — CV${batchState.includeCoverLetter ? ' + letter' : ''} already exist`, 'meta');
            continue;
          }
        }
        const fit = job.fit || scoreJob(job, profile);
        const pack = await writePrepPack(job, profile, fit, saved, {
          recreate: true,
          useCache: false,
          extraInstructions,
          tailorMode: batchState.mode,
          includeCoverLetter: batchState.includeCoverLetter,
          replaceExisting: batchState.replaceExisting,
          onEvent: (entry) => batchLog(`  ${entry.line}`, entry.stream),
        });
        try {
          await attachPrepPath(job, pack);
        } catch {
          /* decision optional */
        }
        item.status = pack.needsReview ? 'failed' : 'done';
        if (pack.needsReview) item.error = `Needs review: complete draft at ${pack.draftDir || pack.dir}; previous documents preserved when available.`;
        item.tailorMode = pack?.tailorMode || batchState.mode;
        if (batchState.stopping && pack?.fallbackReason) {
          item.note = 'agent stopped — Fast fallback written';
        } else if (pack?.fallbackReason) {
          item.note = `Fast fallback (${pack.fallbackReason})`;
        }
        if (pack?.coverLetterError) item.note = `letter failed: ${pack.coverLetterError}`;
        markBatchItemDuration(item);
        batchLog(
          `  done (${item.tailorMode})${item.durationMs != null ? ` · ${formatDuration(item.durationMs)}` : ''}`,
          'ok',
        );
      } catch (err) {
        const message = err?.message || String(err);
        item.status = batchState.stopping ? 'cancelled' : 'failed';
        item.error = message;
        markBatchItemDuration(item);
        batchLog(`  ${item.status}: ${message}`, 'stderr');
      } finally {
        markBatchItemDuration(item);
        invalidateJobsCache();
        batchState.currentId = null;
        broadcastBatch('progress', batchSnapshot());
      }
    }
  } finally {
    batchState.running = false;
    batchState.finishedAt = new Date().toISOString();
    batchState.currentId = null;
    const snap = batchSnapshot();
    const avgBit = snap.avgMsPerJob != null
      ? ` · ${formatDuration(snap.avgMsPerJob)}/job (${snap.timedCount} timed)`
      : '';
    batchLog(
      `Batch Prep finished: ${snap.counts.done} done · ${snap.counts.skipped} skipped · ${snap.counts.failed} failed · ${snap.counts.cancelled} cancelled · ${formatDuration(snap.elapsedMs)}${avgBit}`,
      snap.counts.failed ? 'stderr' : 'ok',
    );
    try {
      await appendRunHistory('batch', {
        startedAt: batchState.startedAt,
        finishedAt: batchState.finishedAt,
        durationMs: snap.elapsedMs,
        avgMsPerJob: snap.avgMsPerJob,
        timedCount: snap.timedCount,
        mode: batchState.mode,
        includeCoverLetter: batchState.includeCoverLetter,
        skipExisting: batchState.skipExisting,
        replaceExisting: batchState.replaceExisting,
        total: snap.total,
        done: snap.counts.done,
        skipped: snap.counts.skipped,
        failed: snap.counts.failed,
        cancelled: snap.counts.cancelled,
      });
    } catch (err) {
      batchLog(`Could not save run history: ${err.message}`, 'stderr');
    }
    batchState.stopping = false;
    invalidateJobsCache();
    broadcastBatch('done', batchSnapshot());
  }
}

/** Save the prep folder on an existing ruling. Do not invent shortlisted. */
async function attachPrepPath(job, pack) {
  const current = job?.decision?.decision;
  if (!current || !pack?.relativeDir) return;
  await recordDecision(job.id, current, job.decision?.note || '', {
    prepPath: pack.relativeDir,
    followUpDate: job.decision?.followUpDate,
  });
}

function forceKillFetch(pid, child) {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
}

/**
 * Ask fetch-jobs to stop gracefully (saves jobs found so far), then force-kill
 * if it is still running after a grace period (stuck JobSpy/Apify call).
 */
async function stopFetch() {
  const child = fetchState.child;
  if (!child?.pid) return false;
  fetchState.stopping = true;
  const pid = child.pid;
  const flagPath = join(workspaceDir(), 'fetch.stop');
  try {
    await mkdir(workspaceDir(), { recursive: true });
    await writeFile(flagPath, `${new Date().toISOString()}\n`);
  } catch {
    /* still try signals */
  }

  // On Windows, child.kill() is forceful — rely on the flag file between queries.
  // On Unix, SIGTERM lets fetch-jobs flush after the current query.
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        /* flag file still works between queries */
      }
    }
  }

  // Allow current query to finish + persist; then force-kill if hung.
  setTimeout(() => {
    if (fetchState.child?.pid === pid) {
      broadcast('log', {
        stream: 'stderr',
        line: 'Still running after stop — force killing (jobs checkpointed so far are kept).',
        t: Date.now(),
      });
      forceKillFetch(pid, child);
    }
  }, 90_000);

  return true;
}

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

const CORS_APPLY = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const applyAssistState = { latest: null };

async function applyPackForJobId(id, jobHint = null) {
  const enriched = await enrichJobs();
  let job = enriched.jobs.find((j) => j.id === id) || null;
  if (!job && jobHint && typeof jobHint === 'object') {
    job = {
      id,
      title: jobHint.title || '',
      company: jobHint.company || '',
      url: jobHint.url || '',
      board: jobHint.board || '',
    };
  }
  if (!job) {
    const decisions = await loadDecisions();
    const entry = (decisions.decisions ?? []).find((d) => d.id === id);
    if (entry) {
      job = {
        id,
        title: entry.title || '',
        company: entry.company || '',
        url: entry.url || '',
        board: entry.board || '',
      };
    }
  }
  if (!job) return { error: 'Job not found' };
  const profile = await loadJson(join(ROOT, 'profile.json'), null);
  if (!profile) return { error: 'profile.json required' };
  const answers = await loadSavedAnswers();
  const pack = buildApplyPack({ job, profile, answers });
  const documentState = await prepStatus(job, profile, await loadCvSettings(), {
    cv: Boolean(pack.files.cvPdf), letter: Boolean(pack.files.coverLetterMd || pack.files.coverLetterPdf),
  });
  pack.documentState = documentState;
  pack.documentsNeedReview = Object.values(documentState).some((s) => s !== 'current');
  applyAssistState.latest = pack;
  return { pack };
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcastPrep(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of prepState.clients) {
    try {
      client.write(payload);
    } catch {
      prepState.clients.delete(client);
    }
  }
}

function prepLog(line, stream = 'stdout') {
  const entry = { stream, line: String(line), t: Date.now() };
  prepState.buffer.push(entry);
  if (prepState.buffer.length > 800) prepState.buffer.shift();
  broadcastPrep('log', entry);
  return entry;
}

function broadcast(event, data) {
  for (const client of [...fetchState.clients]) {
    try {
      sseSend(client, event, data);
    } catch {
      fetchState.clients.delete(client);
    }
  }
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('Request exceeds the upload size limit');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function loadSearchProfile() {
  return (
    (await loadJson(SEARCH_PROFILE, null))
    || (await loadJson(join(ROOT, 'search-profile.example.json'), null))
    || {}
  );
}

async function getStatus({ light = false } = {}) {
  const config = await loadSearchProfile();
  const profile = await loadJson(join(ROOT, 'profile.json'), null);
  let market = null;
  try {
    market = await loadMarket(config);
  } catch {
    market = { id: config.market ?? null, name: null };
  }
  const digest = await loadJson(join(workspaceDir(), 'digest.json'), null);
  const enabledBoards = selectedBoardIds(config.boards?.length ? config.boards : market?.boards);
  const titles = (profile?.search?.titles ?? []).filter((t) => t && !String(t).startsWith('YOUR_'));
  const configCities = (config.cities ?? []).filter((c) => c?.where);
  const marketCities = (market?.cities ?? []).filter((c) => c?.where);
  const cityCount = (configCities.length ? configCities : marketCities).length || 1;
  const titleCount = titles.length || 0;
  const boardCount = enabledBoards.length || 0;
  const queriesPerBoard = titleCount * cityCount;
  let readyCount = light ? null : 0;
  try {
    if (!light) readyCount = (await enrichJobs()).jobs.filter(jobIsReady).length;
  } catch {
    /* archive unreadable — badge stays 0 */
  }
  return {
    marketId: market?.id ?? config.market ?? null,
    marketName: market?.name ?? null,
    candidate: profile?.name ?? null,
    targetRole: profile?.targetRole ?? null,
    apifyTokenPresent: Boolean(process.env.APIFY_TOKEN?.trim()),
    cursorApiKeyPresent: cursorAgentAvailable(),
    agentProviders: light ? [] : await listAgentProvidersStatus(),
    fetchRunning: Boolean(fetchState.child),
    fetchStartedAt: fetchState.startedAt,
    lastFetchCode: fetchState.lastCode,
    lastFetchDurationMs: fetchState.lastDurationMs,
    prepRunning: Boolean(prepState.running),
    prepJobId: prepState.jobId,
    prepStartedAt: prepState.startedAt,
    batch: batchSnapshot({ withItems: false }),
    readyCount,
    digestNewCount: digest?.newCount ?? 0,
    enabledBoards,
    limitPerQuery: Number(config.limitPerQuery ?? 25),
    maxApifyRuns: Number(config.maxApifyRuns ?? 8),
    maxAgeDays: Number(config.filters?.maxAgeDays ?? profile?.constraints?.maxAgeDays ?? 30),
    titleCount,
    cityCount,
    boardCount,
    queriesPerBoard,
    estimatedJobsPerBoard: queriesPerBoard * Number(config.limitPerQuery ?? 25),
    setup: await getSetupStatus(),
    cv: await loadCvSettings(),
    overleaf: overleafStatus(),
    sheets: await sheetsStatus(),
  };
}

function jobIsReady(job) {
  if (job.prepOutdated || job.prepNeedsReview || !job.currentSearch?.current) return false;
  if (!(job.tailoredCv || job.tailoredPdf || job.coverLetter)) return false;
  return !READY_EXCLUDED.has(job.decision?.decision || '');
}

/** List responses must stay small — full archive+descriptions made every filter change ~1.5MB. */
function toJobListItem(job) {
  const { description, ...rest } = job;
  return {
    ...rest,
    hasDescription: Boolean(description && String(description).trim()),
  };
}

function companySummaries(companies) {
  return (companies ?? []).map((c) => ({
    companyKey: c.companyKey,
    company: c.company,
    count: c.count,
  }));
}

let jobsEnrichCache = { at: 0, data: null, inflight: null };

function invalidateJobsCache() {
  jobsEnrichCache = { at: 0, data: null, inflight: null };
}

async function persistJobDescription(id, description) {
  const path = join(workspaceDir(), 'jobs.json');
  const data = await loadJson(path, null);
  if (!data?.jobs) return false;
  const job = data.jobs.find((j) => j.id === id);
  if (!job) return false;
  job.description = pickDescription(description);
  if (!job.description) return false;
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  invalidateJobsCache();
  return true;
}

async function enrichJobs({ force = false } = {}) {
  const ttlMs = 15000;
  if (!force && jobsEnrichCache.data && Date.now() - jobsEnrichCache.at < ttlMs) {
    return jobsEnrichCache.data;
  }
  if (!force && jobsEnrichCache.inflight) return jobsEnrichCache.inflight;

  const cache = jobsEnrichCache;
  const run = (async () => {
    const data = await loadJson(join(workspaceDir(), 'jobs.json'), null);
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    const decisions = await loadDecisions();
    const byId = new Map((decisions.decisions ?? []).map((d) => [d.id, d]));
    const digest = await loadJson(join(workspaceDir(), 'digest.json'), null);
    const newSet = new Set(digest?.newIds ?? []);
    const prepIndex = await loadPrepFlagsIndex();
    const cvSettings = await loadCvSettings();
    const prepInputs = await loadPrepInputs(cvSettings);
    const evidenceText = Object.entries(prepInputs).filter(([name]) => !name.includes('cover-letter')).map(([, text]) => text).join('\n');
    const matchingProfile = profile ? withMatchingAnswers(profile, await loadSavedAnswers()) : null;
    const searchConfig = await loadSearchProfile();
    const currentMarket = await loadMarket(searchConfig);
    const recruiterStore = await loadRecruiterStore();

    if (!data) {
      return {
        jobs: [],
        meta: null,
        companies: [],
        digest,
        message: 'No fetch yet. Run a search from the UI or CLI.',
      };
    }

    const score = matchingProfile ? cachedScorer(matchingProfile, evidenceText) : () => null;
    const raw = data.jobs ?? [];
    const before = raw.length;
    const deduped = dedupeJobs(raw);
    const jobs = [];
    // Yield between small groups so cold archive scoring cannot freeze status/navigation.
    for (let offset = 0; offset < deduped.length; offset += 25) {
      const chunk = await Promise.all(deduped.slice(offset, offset + 25).map(async (job) => {
        const fit = score(job);
        const decision = byId.get(job.id) ?? null;
        const flags = prepFlagsForJob(prepIndex, job.id);
        const manifest = flags.tailoredCv || flags.tailoredPdf || flags.coverLetter
          ? await loadJson(join(prepDir(job.id), 'generation.json'), null) : null;
        const freshness = assessPrep(manifest, { job, profile, settings: cvSettings, inputs: prepInputs },
          { cv: flags.tailoredCv || flags.tailoredPdf, letter: flags.coverLetter });
        const currentSearch = currentSearchState(job, profile || {}, searchConfig, currentMarket);
        const tailoredCv = flags.tailoredCv;
        const recruiter = recruiterStore.contacts[job.id] || null;
        return {
          ...job,
          language: detectPostingLanguage(job),
          writtenLanguage: postingWrittenLanguage(job),
          germanRequired: detectGermanRequirement(job) === 'required',
          decision,
          fit,
          isNew: newSet.has(job.id),
          ...flags,
          ageDays: currentSearch.ageDays,
          currentSearch,
          prepFreshness: freshness,
          prepOutdated: Object.values(freshness).includes('outdated'),
          prepNeedsReview: Object.values(freshness).includes('needs-review'),
          recruiter: recruiter
            ? {
                name: recruiter.name || '',
                email: recruiter.email || '',
                linkedinUrl: recruiter.linkedinUrl || '',
                foundEmail: Boolean(recruiter.email),
            }
            : null,
          ats: detectAts(job.url),
          prepPath:
            decision?.prepPath
            || (tailoredCv ? `.workspace/prep/${String(job.id).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)}` : null),
        };
      }));

      jobs.push(...chunk);
      await yieldEventLoop();
    }
    jobs.sort(compareFit);

    const { jobs: _j, ...meta } = data;
    meta.duplicatesRemovedExtra = Math.max(0, before - deduped.length);

    return {
      jobs,
      meta,
      companies: clusterByCompany(jobs),
      digest,
      decisions: decisions.decisions ?? [],
    };
  })();

  cache.inflight = run;
  try {
    const result = await run;
    if (jobsEnrichCache === cache) jobsEnrichCache = { at: Date.now(), data: result, inflight: null };
    return result;
  } catch (err) {
    if (jobsEnrichCache === cache) cache.inflight = null;
    throw err;
  }
}

async function handleApi(req, res, url) {
  const path = url.pathname;
  if (await handleTrackerApi(req, res, url, { readBody, json, invalidate: invalidateJobsCache, sync: maybeSyncDecisionToSheet })) return;

  if (await handleRecruiterApi(req, res, url, { json, readBody })) return;

  if (req.method === 'OPTIONS' && path.startsWith('/api/apply-assist')) {
    res.writeHead(204, CORS_APPLY);
    return res.end();
  }

  if (req.method === 'GET' && path === '/api/status') {
    return json(res, 200, await getStatus({ light: url.searchParams.get('light') === '1' }));
  }

  if (req.method === 'GET' && path === '/api/setup') {
    return json(res, 200, await getSetupStatus());
  }

  if (req.method === 'POST' && path === '/api/setup') {
    try {
      const body = await readBody(req);
      const status = await applySetup(body);
      return json(res, 200, { ok: true, setup: status, status: await getStatus() });
    } catch (err) {
      return json(res, 400, { error: err.message || 'Setup failed' });
    }
  }

  if (req.method === 'GET' && path === '/api/markets') {
    const ids = await listMarketIds();
    const markets = [];
    for (const id of ids) {
      const m = await loadJson(join(ROOT, 'markets', `${id}.json`), null);
      if (m) markets.push({ id: m.id, name: m.name, shortName: m.shortName });
    }
    return json(res, 200, { markets });
  }

  if (req.method === 'GET' && path === '/api/profile') {
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    if (!profile) return json(res, 404, { error: 'No profile.json' });
    return json(res, 200, {
      name: profile.name ?? null,
      headline: profile.headline ?? null,
      targetRole: profile.targetRole ?? null,
      seniority: profile.seniority ?? null,
      location: profile.location ?? null,
      skills: profile.skills ?? null,
      search: { titles: profile.search?.titles ?? [] },
      links: profile.links ?? {},
      constraints: profile.constraints ?? {},
    });
  }

  if (req.method === 'GET' && path === '/api/jobs') {
    const enriched = await enrichJobs();
    let list = enriched.jobs;
    if (url.searchParams.get('scope') !== 'history') list = list.filter((j) => j.currentSearch.current);

    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (q) {
      list = list.filter((j) =>
        `${j.title} ${j.company} ${j.location || ''}`.toLowerCase().includes(q),
      );
    }
    // Multi-hide: ?hide=applied,skipped  (comma-separated decision keys; "none" = undecided)
    const hideParam = (url.searchParams.get('hide') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const hideSet = new Set(hideParam);
    if (hideSet.size) {
      list = list.filter((j) => {
        const key = j.decision?.decision || 'none';
        return !hideSet.has(key);
      });
    }

    // Legacy single decision filter (still supported)
    const decision = url.searchParams.get('decision');
    if (decision && decision !== 'all') {
      if (decision === 'none') {
        list = list.filter((j) => !j.decision);
      } else if (decision.startsWith('not:') || decision.startsWith('-')) {
        const hide = decision.startsWith('not:')
          ? decision.slice(4)
          : decision.slice(1);
        if (hide === 'none') list = list.filter((j) => j.decision);
        else list = list.filter((j) => j.decision?.decision !== hide);
      } else if (decision.includes(',')) {
        const allow = new Set(decision.split(',').map((s) => s.trim()).filter(Boolean));
        list = list.filter((j) => allow.has(j.decision?.decision || 'none'));
      } else {
        list = list.filter((j) => j.decision?.decision === decision);
      }
    }
    const fit = url.searchParams.get('fit');
    if (fit && fit !== 'all') list = list.filter((j) => j.fit?.verdict === fit);
    const lang = (url.searchParams.get('lang') || 'all').trim().toLowerCase();
    if (lang && lang !== 'all') list = list.filter((j) => jobMatchesLanguageFilter(j, lang));
    if (url.searchParams.get('new') === '1') list = list.filter((j) => j.isNew);

    list = sortJobs(list, url.searchParams.get('sort') || 'fit');
    const page = paginate(list, url);
    return json(res, 200, {
      jobs: page.items.map(toJobListItem),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        pages: page.pages,
      },
      meta: enriched.meta,
      ...(url.searchParams.get('companies') === '1' ? { companies: companySummaries(enriched.companies) } : {}),
      digest: enriched.digest
        ? {
            generatedAt: enriched.digest.generatedAt,
            previousFetchAt: enriched.digest.previousFetchAt,
            newCount: (enriched.digest.newIds ?? []).length,
          }
        : null,
      message: enriched.message,
    });
  }

  if (req.method === 'GET' && path.startsWith('/api/jobs/')) {
    const id = decodeURIComponent(path.slice('/api/jobs/'.length));
    if (!id || id.includes('/')) return json(res, 404, { error: 'Not found' });
    const enriched = await enrichJobs();
    const job = enriched.jobs.find((j) => j.id === id);
    if (!job) return json(res, 404, { error: 'Job not found' });
    if (!String(job.description || '').trim()) {
      const text = await hydrateJobDescription(job);
      if (text) {
        await persistJobDescription(job.id, text).catch(() => false);
        job.description = text;
      }
    }
    return json(res, 200, { job });
  }

  if (req.method === 'GET' && path === '/api/digest') {
    const enriched = await enrichJobs();
    const newJobs = digestItems(enriched.jobs, url);
    if (url.searchParams.get('selection') === '1') {
      return json(res, 200, { candidates: newJobs.map(({ id, title, company, fit, tailoredCv, tailoredPdf, coverLetter }) => ({ id, title, company, fit: fit ? { verdict: fit.verdict } : null, tailoredCv, tailoredPdf, coverLetter })) });
    }
    const { items, ...pagination } = paginate(newJobs, url);
    const history = await loadRunHistory();
    return json(res, 200, {
      digest: enriched.digest,
      newJobs: items.map(toJobListItem),
      pagination,
      count: newJobs.length,
      history: history.fetch,
    });
  }

  if (req.method === 'GET' && path === '/api/run-history') {
    return json(res, 200, await loadRunHistory());
  }

  // Jobs with a tailored CV and/or cover letter that are still open to apply to.
  if (req.method === 'GET' && path === '/api/ready') {
    const enriched = await enrichJobs();
    let list = enriched.jobs.filter(jobIsReady);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (q) {
      list = list.filter((j) => `${j.title} ${j.company} ${j.location || ''}`.toLowerCase().includes(q));
    }
    const counts = { both: 0, cvOnly: 0, letterOnly: 0 };
    for (const j of list) {
      if (j.tailoredCv && j.coverLetter) counts.both += 1;
      else if (j.tailoredCv) counts.cvOnly += 1;
      else counts.letterOnly += 1;
    }
    const { items, ...pagination } = paginate(list, url);
    return json(res, 200, { jobs: items.map(toJobListItem), pagination, total: list.length, counts });
  }

  if (req.method === 'GET' && path === '/api/tracker') {
    const decisions = await loadDecisions();
    const counts = Object.fromEntries(VALID_DECISIONS.map((d) => [d, 0]));
    const missing = [];
    for (const d of decisions.decisions ?? []) {
      if (!VALID_DECISIONS.includes(d.decision)) continue;
      counts[d.decision] += 1;
      if (!d.title || !d.company) missing.push(d.id);
    }

    let snippets = new Map();
    if (missing.length) {
      const jobsData = await loadJson(join(workspaceDir(), 'jobs.json'), { jobs: [] });
      const want = new Set(missing);
      for (const j of jobsData.jobs || []) {
        if (!want.has(j.id)) continue;
        snippets.set(j.id, {
          title: j.title || '',
          company: j.company || '',
          url: j.url || '',
          board: j.board || '',
        });
        if (snippets.size === want.size) break;
      }
    }

    const items = [];
    for (const [i, d] of (decisions.decisions ?? []).entries()) {
      if (!VALID_DECISIONS.includes(d.decision)) continue;
      const extra = snippets.get(d.id) || {};
      const date = d.date || '';
      const updatedAt = d.updatedAt || null;
      items.push({
        ...d,
        id: d.id,
        decision: d.decision,
        date,
        updatedAt,
        at: trackerRecencyMs({ date, updatedAt, order: i }),
        title: d.title || extra.title || '',
        company: d.company || extra.company || '',
        url: d.url || extra.url || '',
        board: d.board || extra.board || '',
        ats: detectAts(d.url || extra.url || ''),
        prepPath: d.prepPath || null,
      });
    }

    return json(res, 200, {
      items: sortTrackerItems(items, true),
      counts,
      total: items.length,
      valid: VALID_DECISIONS,
    });
  }

  if (req.method === 'GET' && path === '/api/decisions') {
    return json(res, 200, await loadDecisions());
  }

  if (req.method === 'POST' && path === '/api/decisions') {
    const body = await readBody(req);
    try {
      const result = await recordDecision(body.id, body.decision, body.note ?? '', {
        followUpDate: body.followUpDate,
        prepPath: body.prepPath,
        job: body.job && typeof body.job === 'object' ? body.job : null,
      });
      invalidateJobsCache();
      const sheets = await maybeSyncDecisionToSheet(result.entry, body.job);
      return json(res, 200, { ok: true, ...result, valid: VALID_DECISIONS, sheets });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === 'PATCH' && path === '/api/decisions') {
    const body = await readBody(req);
    try {
      if (body.decision && !VALID_DECISIONS.includes(body.decision)) {
        return json(res, 400, { error: `Unknown decision "${body.decision}"` });
      }
      const entry = await patchDecision(body.id, {
        ...(body.followUpDate !== undefined ? { followUpDate: body.followUpDate || null } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.prepPath !== undefined ? { prepPath: body.prepPath } : {}),
        ...(body.decision ? { decision: body.decision } : {}),
      });
      invalidateJobsCache();
      const sheets = await maybeSyncDecisionToSheet(entry, body.job);
      return json(res, 200, { ok: true, entry, sheets });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === 'GET' && path === '/api/sheets') {
    return json(res, 200, await sheetsStatus());
  }

  if (req.method === 'POST' && path === '/api/sheets/sync') {
    try {
      const result = await syncDecisionsToSheet();
      if (!result.ok && result.error && !result.synced) {
        return json(res, 400, result);
      }
      invalidateJobsCache();
      return json(res, 200, {
        ...result,
        syncStatuses: SHEET_SYNC_DECISIONS,
      });
    } catch (err) {
      return json(res, 500, { error: err.message || String(err), url: sheetsUrl() });
    }
  }

  if (req.method === 'POST' && path === '/api/sheets/pull') {
    try {
      const result = await pullRejectedFromSheet();
      if (result.skipped) return json(res, 200, result);
      if (!result.ok && result.error) return json(res, 400, result);
      invalidateJobsCache();
      return json(res, 200, result);
    } catch (err) {
      return json(res, 500, { error: err.message || String(err), url: sheetsUrl() });
    }
  }

  if (req.method === 'GET' && path === '/api/saved-answers') {
    return json(res, 200, { answers: await loadSavedAnswers() });
  }

  if (req.method === 'PUT' && path === '/api/saved-answers') {
    const body = await readBody(req);
    const answers = await saveSavedAnswers(body.answers ?? body);
    return json(res, 200, { ok: true, answers });
  }

  if (req.method === 'GET' && path === '/api/apply-assist/latest') {
    if (!applyAssistState.latest) {
      return json(res, 404, { error: 'No apply pack yet — Copy pack or Fill on a job first.' }, CORS_APPLY);
    }
    return json(res, 200, fillAssistPayload(applyAssistState.latest), CORS_APPLY);
  }

  if (req.method === 'GET' && path === '/api/apply-assist/answers') {
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    if (!profile) return json(res, 400, { error: 'profile.json required' });
    const answers = await loadSavedAnswers();
    const pack = buildApplyPack({ job: {}, profile, answers });
    return json(res, 200, { ok: true, text: pack.text, pack });
  }

  if (req.method === 'GET' && path === '/api/apply-assist') {
    const id = (url.searchParams.get('id') || '').trim();
    if (!id) return json(res, 400, { error: 'id is required' });
    const loaded = await applyPackForJobId(id);
    if (loaded.error) return json(res, 404, { error: loaded.error });
    return json(res, 200, {
      ok: true,
      ...fillAssistPayload(loaded.pack),
      playwright: await playwrightAvailable(),
    }, CORS_APPLY);
  }

  if (req.method === 'POST' && path === '/api/apply-assist') {
    const body = await readBody(req);
    const id = String(body.id || '').trim();
    if (!id) return json(res, 400, { error: 'id is required' });
    const loaded = await applyPackForJobId(id, body.job);
    if (loaded.error) return json(res, 404, { error: loaded.error });
    return json(res, 200, {
      ok: true,
      ...fillAssistPayload(loaded.pack),
      playwright: await playwrightAvailable(),
    }, CORS_APPLY);
  }

  if (req.method === 'POST' && path === '/api/apply-assist/fill') {
    const body = await readBody(req);
    const id = String(body.id || '').trim();
    if (!id) return json(res, 400, { error: 'id is required' });
    const loaded = await applyPackForJobId(id, body.job);
    if (loaded.error) return json(res, 404, { error: loaded.error });
    const payload = fillAssistPayload(loaded.pack);
    if (loaded.pack.documentsNeedReview) return json(res, 409, {
      error: 'Documents are outdated or need review. Recreate Prep before using Fill.',
    });
    if (!(await playwrightAvailable())) {
      return json(res, 200, {
        ok: true,
        launched: false,
        reason: 'playwright-core is missing — run npm install, then retry Fill.',
        playwright: false,
        ...payload,
      });
    }
    try {
      const settings = await loadCvSettings();
      const fill = await fillApplyInBrowser(loaded.pack, {
        agentProvider: settings.agentProvider,
        agentModel: settings.agentModel,
      });
      return json(res, 200, {
        ok: fill.ok !== false,
        launched: true,
        fill,
        playwright: true,
        ...payload,
      });
    } catch (err) {
      return json(res, 200, {
        ok: false,
        launched: false,
        reason: err.message || String(err),
        playwright: true,
        ...payload,
      });
    }
  }

  if (req.method === 'POST' && path === '/api/prep') {
    if (prepState.running) return json(res, 409, { error: 'Preparation is running; wait for it to finish.' });
    if (batchState.running) {
      return json(res, 409, { error: 'Batch Prep is running — wait for it to finish or cancel it first' });
    }
    const body = await readBody(req);
    const enriched = await enrichJobs();
    const job = enriched.jobs.find((j) => j.id === body.id);
    if (!job) return json(res, 404, { error: 'Job not found in current results' });
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    if (!profile) return json(res, 400, { error: 'profile.json required' });
    const saved = await loadSavedAnswers();
    const fit = job.fit || scoreJob(job, profile);
    const extraInstructions = typeof body.extraInstructions === 'string'
      ? body.extraInstructions.trim().slice(0, 500)
      : '';
    const mode = body.mode === 'fast' ? 'fast' : 'agent';
    const includeCoverLetter = body.includeCoverLetter !== false;

    const replaceExisting = body.replaceExisting === true;
    if (replaceExisting && body.recreate === false) {
      return json(res, 400, { error: 'Replace existing CV requires creating a new CV.' });
    }

    // Cached pack: skip rebuild unless recreate (sync)
    if (body.recreate === false) {
      const freshness = await prepStatus(job, profile, await loadCvSettings(), {
        cv: true, letter: includeCoverLetter, instructions: extraInstructions || undefined,
      });
      if (!(await hasCvPdf(job.id)) || Object.values(freshness).some((s) => s !== 'current')) {
        return json(res, 409, { error: 'Documents are missing, outdated, or need review. Choose Recreate to generate replacements.' });
      }
      const pack = await loadCachedPrepPack(job.id, fit, job, profile);
      invalidateJobsCache();
      return json(res, 200, { ok: true, cached: true, pack, fit });
    }

    // Fast mode stays synchronous
    if (prepState.running || batchState.running) return json(res, 409, { error: 'Preparation is already running.' });
    if (mode === 'fast') {
      prepState.running = true;
      try {
        const pack = await writePrepPack(job, profile, fit, saved, {
          recreate: true,
          useCache: false,
          extraInstructions,
          tailorMode: 'fast',
          includeCoverLetter,
          replaceExisting,
        });
        try {
          await attachPrepPath(job, pack);
        } catch {
          /* decision optional */
        }
        invalidateJobsCache();
        return json(res, 200, { ok: true, cached: false, pack, fit, mode: 'fast' });
      } finally { prepState.running = false; }
    }

    if (prepState.running) {
      return json(res, 409, {
        error: 'An agent run is already in progress',
        jobId: prepState.jobId,
      });
    }

    prepState.running = true;
    prepState.jobId = job.id;
    prepState.startedAt = new Date().toISOString();
    prepState.stopping = false;
    prepState.buffer = [];
    prepState.result = null;
    prepState.error = null;

    // Background agent (default) — client listens on /api/prep/stream
    void (async () => {
      try {
        prepLog(`Prep starting for ${job.title} @ ${job.company} — staging first, then the agent`, 'meta');
        if (!cursorAgentAvailable()) {
          prepLog('CURSOR_API_KEY missing — will fall back to Fast after attempt check.', 'stderr');
        }
        const pack = await writePrepPack(job, profile, fit, saved, {
          recreate: true,
          useCache: false,
          extraInstructions,
          tailorMode: 'agent',
          includeCoverLetter,
          replaceExisting,
          onEvent: (entry) => {
            prepState.buffer.push(entry);
            if (prepState.buffer.length > 800) prepState.buffer.shift();
            broadcastPrep('log', entry);
          },
        });
        try {
          await attachPrepPath(job, pack);
        } catch {
          /* optional */
        }
        prepState.result = {
          ok: true,
          cached: false,
          pack,
          fit,
          mode: pack.tailorMode || 'agent',
          jobId: job.id,
          startedAt: prepState.startedAt,
        };
        prepLog(
          pack.fallbackReason
            ? `Prep finished via Fast fallback (${pack.fallbackReason}).`
            : `Prep finished (${pack.tailorMode || 'agent'}).`,
        );
        broadcastPrep('done', prepState.result);
      } catch (err) {
        const message = err?.message || String(err);
        prepState.error = message;
        prepLog(`Prep failed: ${message}`, 'stderr');
        broadcastPrep('done', {
          ok: false,
          error: message,
          jobId: job.id,
          startedAt: prepState.startedAt,
        });
      } finally {
        prepState.running = false;
        prepState.stopping = false;
        invalidateJobsCache();
      }
    })();

    return json(res, 202, {
      ok: true,
      started: true,
      mode: 'agent',
      jobId: job.id,
      startedAt: prepState.startedAt,
      stream: '/api/prep/stream',
    });
  }

  if (req.method === 'GET' && path === '/api/prep/models') {
    const settings = await loadCvSettings();
    const provider = String(
      new URL(req.url, 'http://localhost').searchParams.get('provider')
        || settings.agentProvider
        || 'cursor',
    );
    const refresh = new URL(req.url, 'http://localhost').searchParams.get('refresh') === '1';
    const catalog = await listAgentModels(provider, { refresh });
    const availability = await agentRunnerAvailable(provider);
    return json(res, 200, {
      ...catalog,
      selected: provider === settings.agentProvider ? settings.agentModel : '',
      selectedProvider: settings.agentProvider,
      providers: await listAgentProvidersStatus(),
      availability,
      cursorApiKeyPresent: cursorAgentAvailable(),
    });
  }

  // ---- Batch Prep -------------------------------------------------------
  if (req.method === 'GET' && path === '/api/prep/batch') {
    return json(res, 200, batchSnapshot());
  }

  if (req.method === 'POST' && path === '/api/prep/batch') {
    const body = await readBody(req);
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.map((x) => String(x || '').trim()).filter(Boolean))]
      : [];
    if (!ids.length) return json(res, 400, { error: 'Select at least one job' });
    if (ids.length > 200) return json(res, 400, { error: 'At most 200 jobs per batch' });
    if (batchState.running) {
      return json(res, 409, { error: 'A batch is already running', batch: batchSnapshot({ withItems: false }) });
    }
    if (prepState.running) {
      return json(res, 409, { error: 'A single Prep run is in progress — wait for it to finish', jobId: prepState.jobId });
    }
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    if (!profile) return json(res, 400, { error: 'profile.json required' });
    const enriched = await enrichJobs();
    const jobsById = new Map(enriched.jobs.map((j) => [j.id, j]));
    const missing = ids.filter((id) => !jobsById.has(id));
    if (missing.length === ids.length) return json(res, 404, { error: 'None of the selected jobs are in the archive' });
    const saved = await loadSavedAnswers();
    const extraInstructions = typeof body.extraInstructions === 'string'
      ? body.extraInstructions.trim().slice(0, 500)
      : '';

    if (prepState.running || batchState.running) return json(res, 409, { error: 'Preparation is already running.' });
    batchState.running = true;
    batchState.stopping = false;
    batchState.startedAt = new Date().toISOString();
    batchState.finishedAt = null;
    batchState.mode = body.mode === 'fast' ? 'fast' : 'agent';
    batchState.includeCoverLetter = body.includeCoverLetter !== false;
    batchState.replaceExisting = body.replaceExisting === true;
    batchState.skipExisting = !batchState.replaceExisting && body.skipExisting !== false;
    batchState.currentId = null;
    batchState.buffer = [];
    batchState.items = ids.map((id) => {
      const j = jobsById.get(id);
      return {
        id,
        title: j?.title || '',
        company: j?.company || '',
        status: 'pending',
        error: null,
        tailorMode: null,
        note: null,
        startedAt: null,
        durationMs: null,
      };
    });

    void runPrepBatch(jobsById, profile, saved, { extraInstructions });
    return json(res, 202, { ok: true, started: true, stream: '/api/prep/batch/stream', batch: batchSnapshot() });
  }

  if (req.method === 'POST' && path === '/api/prep/batch/stop') {
    if (!batchState.running) {
      return json(res, 200, { ok: true, stopped: false, message: 'No batch running', batch: batchSnapshot({ withItems: false }) });
    }
    batchState.stopping = true;
    const cancelled = await cancelCvTailorAgent();
    batchLog(
      cancelled
        ? 'Stop requested — cancelling the current agent run; remaining jobs will be skipped.'
        : 'Stop requested — finishing the current job, then stopping.',
      'stderr',
    );
    broadcastBatch('progress', batchSnapshot());
    return json(res, 200, { ok: true, stopped: true, cancelledAgent: cancelled, batch: batchSnapshot({ withItems: false }) });
  }

  if (req.method === 'GET' && path === '/api/prep/batch/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    sseSend(res, 'status', batchSnapshot());
    for (const entry of batchState.buffer) sseSend(res, 'log', entry);
    if (!batchState.running && batchState.finishedAt) sseSend(res, 'done', batchSnapshot());
    batchState.clients.add(res);
    req.on('close', () => batchState.clients.delete(res));
    return;
  }

  if (req.method === 'POST' && path === '/api/prep/stop') {
    if (!prepState.running) {
      return json(res, 200, { ok: true, stopped: false, message: 'No prep run in progress' });
    }
    prepState.stopping = true;
    const cancelled = await cancelCvTailorAgent();
    prepLog(
      cancelled
        ? 'Stop requested — cancelling agent run…'
        : 'Stop requested — agent cancel not supported; waiting for current step…',
      'stderr',
    );
    return json(res, 200, { ok: true, stopped: cancelled });
  }

  if (req.method === 'GET' && path === '/api/prep/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    sseSend(res, 'status', {
      running: Boolean(prepState.running),
      jobId: prepState.jobId,
      startedAt: prepState.startedAt,
    });
    for (const entry of prepState.buffer) sseSend(res, 'log', entry);
    // Replay done only for an in-flight or just-finished run matching current jobId/startedAt
    if (!prepState.running && prepState.result?.startedAt === prepState.startedAt) {
      sseSend(res, 'done', prepState.result);
    } else if (
      !prepState.running
      && prepState.error
      && prepState.startedAt
    ) {
      sseSend(res, 'done', {
        ok: false,
        error: prepState.error,
        jobId: prepState.jobId,
        startedAt: prepState.startedAt,
      });
    }
    prepState.clients.add(res);
    req.on('close', () => prepState.clients.delete(res));
    return;
  }

  // POST /api/cover-letter { id, mode, extraInstructions }
  if (req.method === 'POST' && path === '/api/cover-letter') {
    if (prepState.running) return json(res, 409, { error: 'Preparation is running; wait for it to finish.' });
    if (batchState.running) {
      return json(res, 409, { error: 'Batch Prep is running — wait for it to finish or cancel it first' });
    }
    const body = await readBody(req);
    const enriched = await enrichJobs();
    const job = enriched.jobs.find((j) => j.id === body.id);
    if (!job) return json(res, 404, { error: 'Job not found in current results' });
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    if (!profile) return json(res, 400, { error: 'profile.json required' });
    const fit = job.fit || scoreJob(job, profile);
    const extraInstructions = typeof body.extraInstructions === 'string'
      ? body.extraInstructions.trim().slice(0, 500)
      : '';
    const mode = body.mode === 'fast' ? 'fast' : 'agent';
    const settings = await loadCvSettings();
    const dir = prepDir(job.id);

    if (prepState.running || batchState.running) return json(res, 409, { error: 'Preparation is already running.' });

    const packResult = (result) => ({
      ok: true,
      letter: result.letter,
      included: result.included,
      extraInstructions: result.extraInstructions || extraInstructions || null,
      tailorMode: result.tailorMode,
      fallbackReason: result.fallbackReason || null,
      folder: result.export?.absoluteDir || null,
      relativeDir: result.export?.relativeDir || null,
      files: result.export?.files || [],
      pdfError: result.pdfError || null,
      needsReview: result.needsReview || false,
      draftDir: result.draftDir || (result.needsReview ? result.dir : null),
    });

    if (mode === 'fast') {
      prepState.running = true;
      try {
        const result = await generateCoverLetterPack(job, profile, fit, {
          prepDir: dir,
          extraInstructions,
          tailorMode: 'fast',
          settings,
        });
        invalidateJobsCache();
        const payload = packResult(result);
        if (body.open !== false && payload.folder) revealDownloadsFolder(payload.folder);
        return json(res, 200, payload);
      } catch (err) {
        return json(res, 500, { error: err.message || String(err) });
      } finally { prepState.running = false; }
    }

    if (prepState.running) {
      return json(res, 409, {
        error: 'An agent run is already in progress',
        jobId: prepState.jobId,
      });
    }

    prepState.running = true;
    prepState.jobId = job.id;
    prepState.startedAt = new Date().toISOString();
    prepState.stopping = false;
    prepState.buffer = [];
    prepState.result = null;
    prepState.error = null;

    void (async () => {
      try {
        prepLog(`Cover letter agent starting for ${job.title} @ ${job.company}`, 'meta');
        const result = await generateCoverLetterPack(job, profile, fit, {
          prepDir: dir,
          extraInstructions,
          tailorMode: 'agent',
          provider: settings.agentProvider,
          model: settings.agentModel,
          settings,
          onEvent: (entry) => {
            prepState.buffer.push(entry);
            if (prepState.buffer.length > 800) prepState.buffer.shift();
            broadcastPrep('log', entry);
          },
        });
        const payload = {
          ...packResult(result),
          jobId: job.id,
          startedAt: prepState.startedAt,
          mode: result.tailorMode || 'agent',
        };
        if (body.open !== false && payload.folder) revealDownloadsFolder(payload.folder);
        prepState.result = payload;
        prepLog(
          result.fallbackReason
            ? `Cover letter finished via Fast fallback (${result.fallbackReason}).`
            : `Cover letter finished (${result.tailorMode || 'agent'}).`,
        );
        broadcastPrep('done', payload);
      } catch (err) {
        const message = err?.message || String(err);
        prepState.error = message;
        prepLog(`Cover letter failed: ${message}`, 'stderr');
        broadcastPrep('done', {
          ok: false,
          error: message,
          jobId: job.id,
          startedAt: prepState.startedAt,
        });
      } finally {
        prepState.running = false;
        prepState.stopping = false;
        invalidateJobsCache();
      }
    })();

    return json(res, 202, {
      ok: true,
      started: true,
      mode: 'agent',
      jobId: job.id,
      startedAt: prepState.startedAt,
      stream: '/api/prep/stream',
    });
  }

  // POST /api/prep/open-folder { id } — export into project downloads/<Company>/<Role>-<JobID>/ + open Explorer
  if (req.method === 'POST' && path === '/api/prep/open-folder') {
    const body = await readBody(req);
    const enriched = await enrichJobs();
    const job = enriched.jobs.find((j) => j.id === body.id);
    if (!job) return json(res, 404, { error: 'Job not found' });
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    const exported = await exportPrepDownloads(job, profile);
    if (exported?.error) return json(res, 400, { error: exported.error });
    const openDir = exported.absoluteDir;
    const revealed = revealDownloadsFolder(openDir);
    return json(res, 200, {
      ok: revealed.ok,
      folder: openDir,
      relativeDir: exported.relativeDir,
      files: exported.files || [],
      error: revealed.error || null,
    });
  }

  // GET /api/prep/:id/cv.html|cv.md|…  or  GET /api/prep/:id
  if (req.method === 'GET' && path.startsWith('/api/prep/')) {
    const rest = decodeURIComponent(path.slice('/api/prep/'.length));
    const slash = rest.lastIndexOf('/');
    if (slash > 0) {
      const id = rest.slice(0, slash);
      const file = rest.slice(slash + 1);
      const payload = await readPrepFile(id, file);
      if (payload == null) return json(res, 404, { error: 'File not found — generate Prep & CV first' });
      const download = url.searchParams.get('download') === '1';
      if (payload.binary) {
        const profile = await loadJson(join(ROOT, 'profile.json'), null);
        const nice = String(profile?.name || 'Candidate')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const short =
          nice.length >= 3
            ? `${nice[nice.length - 2]} ${nice[nice.length - 1]}`
            : nice.join(' ') || 'Candidate';
        const friendly =
          file === 'cv-ats.pdf'
            ? `${short} CV.pdf`
            : file === 'cv-main.pdf'
              ? `${short} CV Main.pdf`
              : file === 'cv.pdf'
                ? `${short} CV.pdf`
                : file;

        // Also write into <project>/downloads/<Company>/<Role>-<JobID>/
        let folderHint = '';
        if (download) {
          try {
            const enriched = await enrichJobs();
            const job = enriched.jobs.find((j) => j.id === id);
            if (job) {
              const exported = await exportPrepDownloads(job, profile);
              folderHint = exported?.absoluteDir || '';
              if (url.searchParams.get('open') === '1' && folderHint) {
                revealDownloadsFolder(folderHint);
              }
            }
          } catch {
            /* export best-effort */
          }
        }

        const headers = {
          'content-type': 'application/pdf',
          'cache-control': 'no-store',
          'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${friendly}"`,
        };
        if (folderHint) headers['x-job-scout-folder'] = folderHint;
        res.writeHead(200, headers);
        return createReadStream(payload.path).pipe(res);
      }
      const type =
        file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : file.endsWith('.md')
            ? 'text/markdown; charset=utf-8'
            : 'text/plain; charset=utf-8';
      const headers = {
        'content-type': type,
        'cache-control': 'no-store',
      };
      if (download) {
        headers['content-disposition'] = `attachment; filename="${file}"`;
      }
      res.writeHead(200, headers);
      return res.end(payload.body);
    }
    const pack = await readPrepPack(rest);
    if (!pack) return json(res, 404, { error: 'No prep pack yet — generate Prep & CV first' });
    return json(res, 200, pack);
  }

  if (req.method === 'GET' && path === '/api/boards') {
    const config = await loadSearchProfile();
    let market = null;
    try {
      market = await loadMarket(config);
    } catch {
      /* ignore */
    }
    const enabled = selectedBoardIds(
      config.boards?.length ? config.boards : market?.boards ?? ['indeed', 'linkedin'],
    );
    const boards = BOARD_CATALOG.map((b) => ({
      ...b,
      enabled: enabled.includes(b.id),
      available: boardAvailableForMarket(b, market),
    }));
    return json(res, 200, { boards, enabled });
  }

  if (req.method === 'PUT' && path === '/api/settings') {
    const body = await readBody(req);
    const config = await loadSearchProfile();
    if (body.limitPerQuery != null) {
      const n = Number(body.limitPerQuery);
      if (!Number.isFinite(n) || n < 1 || n > 100) {
        return json(res, 400, { error: 'limitPerQuery must be 1–100' });
      }
      config.limitPerQuery = Math.round(n);
    }
    if (body.maxApifyRuns != null) {
      const n = Number(body.maxApifyRuns);
      if (!Number.isFinite(n) || n < 0 || n > 200) {
        return json(res, 400, { error: 'maxApifyRuns must be 0–200 (0 = unlimited)' });
      }
      config.maxApifyRuns = Math.round(n);
    }
    if (body.maxAgeDays != null) {
      const n = Number(body.maxAgeDays);
      if (!Number.isFinite(n) || n < 1 || n > 365) {
        return json(res, 400, { error: 'maxAgeDays must be 1–365' });
      }
      config.filters = { ...(config.filters ?? {}), maxAgeDays: Math.round(n) };
    }
    if (
      body.cvSource != null
      || body.overleafPush != null
      || body.updateMaster != null
      || body.tailorMode != null
      || body.agentModel != null
      || body.agentProvider != null
    ) {
      config.cv = { ...(config.cv ?? {}) };
      if (body.cvSource != null) {
        const src = String(body.cvSource);
        if (src !== 'local' && src !== 'latex' && src !== 'overleaf') {
          return json(res, 400, { error: 'cvSource must be local, latex or overleaf' });
        }
        config.cv.source = src;
      }
      if (body.overleafPush != null) config.cv.overleafPush = Boolean(body.overleafPush);
      if (body.updateMaster != null) config.cv.updateMaster = Boolean(body.updateMaster);
      if (body.tailorMode != null) {
        const tm = String(body.tailorMode);
        if (tm !== 'agent' && tm !== 'fast') {
          return json(res, 400, { error: 'tailorMode must be agent or fast' });
        }
        config.cv.tailorMode = tm;
      }
      if (body.agentProvider != null || body.agentModel != null) {
        try { config.cv = updateAgentSelection(config.cv, body); }
        catch (error) { return json(res, 400, { error: error.message }); }
      }
    }
    await writeFile(SEARCH_PROFILE, `${JSON.stringify(config, null, 2)}\n`);
    invalidateJobsCache();
    return json(res, 200, await getStatus());
  }

  if (req.method === 'PUT' && path === '/api/boards') {
    const body = await readBody(req);
    const ids = Array.isArray(body.boards) ? body.boards.map(String) : [];
    const unknown = ids.filter((id) => !BOARD_IDS.has(id));
    if (unknown.length) {
      return json(res, 400, { error: `Unknown board(s): ${unknown.join(', ')}` });
    }
    if (!ids.length) {
      return json(res, 400, { error: 'Select at least one portal' });
    }
    const config = await loadSearchProfile();
    config.boards = mergeBoardSelection(ids, config.boards ?? []);
    await writeFile(SEARCH_PROFILE, `${JSON.stringify(config, null, 2)}\n`);
    return json(res, 200, await getStatus());
  }

  if (req.method === 'PATCH' && path === '/api/market') {
    const body = await readBody(req);
    const marketId = String(body.market || '').toUpperCase();
    if (!marketId) return json(res, 400, { error: 'market is required' });
    const ids = await listMarketIds();
    if (!ids.includes(marketId)) {
      return json(res, 400, { error: `Unknown market "${marketId}". Known: ${ids.join(', ')}` });
    }
    const config = await loadSearchProfile();
    config.market = marketId;
    await writeFile(SEARCH_PROFILE, `${JSON.stringify(config, null, 2)}\n`);
    return json(res, 200, await getStatus());
  }

  if (req.method === 'POST' && path === '/api/fetch') {
    if (fetchState.child) {
      return json(res, 409, { error: 'A fetch is already running' });
    }
    const body = await readBody(req);
    const args = [join(ROOT, 'scripts', 'fetch-jobs.mjs')];
    if (body.market) args.push('--market', String(body.market).toUpperCase());
    if (body.allowPaid) {
      args.push('--allow-paid');
      args.push('--apify-first');
    }
    if (body.forceJobspy) args.push('--force-jobspy');
    if (body.replace) args.push('--replace');
    if (body.limit != null && Number(body.limit) > 0) {
      args.push('--limit', String(Math.round(Number(body.limit))));
    }
    if (body.maxApifyRuns != null && Number(body.maxApifyRuns) >= 0) {
      args.push('--max-apify', String(Math.round(Number(body.maxApifyRuns))));
    }
    if (body.maxAgeDays != null && Number(body.maxAgeDays) > 0) {
      args.push('--max-age-days', String(Math.round(Number(body.maxAgeDays))));
    }

    fetchState.buffer = [];
    fetchState.startedAt = new Date().toISOString();
    fetchState.lastCode = null;
    fetchState.lastDurationMs = null;
    fetchState.stopping = false;

    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      // So Unix can signal the whole group (JobSpy python child).
      detached: process.platform !== 'win32',
    });
    fetchState.child = child;

    const onChunk = (stream) => (buf) => {
      const text = buf.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        if (!line && !text.endsWith('\n')) continue;
        const entry = { stream, line, t: Date.now() };
        fetchState.buffer.push(entry);
        if (fetchState.buffer.length > 500) fetchState.buffer.shift();
        broadcast('log', entry);
      }
    };
    child.stdout.on('data', onChunk('stdout'));
    child.stderr.on('data', onChunk('stderr'));
    child.on('close', (code) => {
      const stopped = fetchState.stopping;
      fetchState.stopping = false;
      fetchState.child = null;
      fetchState.lastCode = stopped ? null : (code ?? 1);
      fetchState.lastDurationMs = fetchState.startedAt
        ? Math.max(0, Date.now() - Date.parse(fetchState.startedAt))
        : null;
      invalidateJobsCache();
      const entry = {
        stream: stopped ? 'stderr' : 'stdout',
        line: stopped ? 'Search stopped by user.' : `Fetch finished (exit ${code ?? 1}).`,
        t: Date.now(),
      };
      if (stopped) {
        fetchState.buffer.push(entry);
        broadcast('log', entry);
      }
      broadcast('done', {
        code: fetchState.lastCode,
        stopped,
        at: new Date().toISOString(),
        startedAt: fetchState.startedAt,
        durationMs: fetchState.lastDurationMs,
      });
    });
    child.on('error', (err) => {
      fetchState.stopping = false;
      fetchState.child = null;
      fetchState.lastCode = 1;
      invalidateJobsCache();
      broadcast('log', { stream: 'stderr', line: err.message, t: Date.now() });
      fetchState.lastDurationMs = fetchState.startedAt
        ? Math.max(0, Date.now() - Date.parse(fetchState.startedAt))
        : null;
      broadcast('done', {
        code: 1,
        stopped: false,
        at: new Date().toISOString(),
        startedAt: fetchState.startedAt,
        durationMs: fetchState.lastDurationMs,
      });
    });

    return json(res, 202, { ok: true, startedAt: fetchState.startedAt, args: args.slice(1) });
  }

  if (req.method === 'POST' && path === '/api/fetch/stop') {
    if (!fetchState.child) {
      return json(res, 200, { ok: true, stopped: false, message: 'No fetch running' });
    }
    const ok = await stopFetch();
    broadcast('log', {
      stream: 'stderr',
      line: 'Stopping search — will save jobs found so far after the current query…',
      t: Date.now(),
    });
    return json(res, 200, { ok, stopped: ok });
  }

  if (req.method === 'GET' && path === '/api/fetch/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    sseSend(res, 'status', {
      running: Boolean(fetchState.child),
      startedAt: fetchState.startedAt,
      lastCode: fetchState.lastCode,
      lastDurationMs: fetchState.lastDurationMs,
    });
    for (const entry of fetchState.buffer) sseSend(res, 'log', entry);
    fetchState.clients.add(res);
    req.on('close', () => fetchState.clients.delete(res));
    return;
  }

  return json(res, 404, { error: 'Not found' });
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel.includes('..')) {
    res.writeHead(400);
    return res.end('Bad path');
  }
  const filePath = join(PUBLIC, rel);
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(400);
    return res.end('Bad path');
  }
  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error('not a file');
  } catch {
    // Unknown asset (has an extension, e.g. /favicon.ico) → real 404.
    // Unknown route (no extension) → index.html so the SPA can load.
    if (rel !== '/index.html' && !extname(rel)) return serveFile(res, join(PUBLIC, 'index.html'));
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  return serveFile(res, filePath);
}

function serveFile(res, filePath) {
  const type = MIME[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: err.message || String(err) });
    else res.end();
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — Job Scout may already be running at http://localhost:${PORT}`);
    console.error(`Stop the other process, or use:  $env:PORT=4041; npm start`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Job Scout UI → ${url}`);
  console.log(`ROOT: ${ROOT}`);
  openBrowser(url);
});

function openBrowser(url) {
  if (process.env.NO_OPEN === '1') return;
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
