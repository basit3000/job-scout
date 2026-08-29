#!/usr/bin/env node
// Local Job Scout web UI + API. Serves web/public and wraps existing scripts.
//
//   npm start          → http://localhost:4040

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
} from '../scripts/lib/common.mjs';
import {
  loadDecisions,
  recordDecision,
  patchDecision,
  VALID_DECISIONS,
} from '../scripts/lib/decisions.mjs';
import { dedupeJobs, clusterByCompany } from '../scripts/lib/dedupe.mjs';
import { scoreJob } from '../scripts/lib/fit.mjs';
import {
  writePrepPack,
  readPrepPack,
  readPrepFile,
  hasCachedPdfs,
  loadPrepFlagsIndex,
  prepFlagsForJob,
  loadCvSettings,
  overleafStatus,
  exportPrepDownloads,
  revealDownloadsFolder,
  cursorAgentAvailable,
  listAgentModels,
  listAgentProvidersStatus,
  agentRunnerAvailable,
} from '../scripts/lib/prep.mjs';
import { cancelCvTailorAgent } from '../scripts/lib/cv-agent.mjs';
import { loadSavedAnswers, saveSavedAnswers } from '../scripts/lib/saved-answers.mjs';
import {
  BOARD_CATALOG,
  BOARD_IDS,
  boardAvailableForMarket,
  mergeBoardSelection,
  selectedBoardIds,
} from '../scripts/lib/boards.mjs';
import { applySetup, getSetupStatus } from '../scripts/lib/setup-state.mjs';
import { compareFit, sortJobs } from '../scripts/lib/job-sort.mjs';
import {
  sheetsStatus,
  sheetsUrl,
  syncDecisionsToSheet,
  maybeSyncDecisionToSheet,
  SHEET_SYNC_DECISIONS,
} from '../scripts/lib/google-sheets.mjs';

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

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
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

async function getStatus() {
  const config = await loadSearchProfile();
  const profile = await loadJson(join(ROOT, 'profile.json'), null);
  let market = null;
  try {
    market = await loadMarket(config);
  } catch {
    market = { id: config.market ?? null, name: null };
  }
  const digest = await loadJson(join(workspaceDir(), 'digest.json'), null);
  const decisions = await loadDecisions();
  const today = new Date().toISOString().slice(0, 10);
  const followUpsDue = (decisions.decisions ?? []).filter(
    (d) => d.followUpDate && d.followUpDate <= today && ['applied', 'shortlisted', 'interviewing'].includes(d.decision),
  );
  const enabledBoards = selectedBoardIds(config.boards?.length ? config.boards : market?.boards);
  const titles = (profile?.search?.titles ?? []).filter((t) => t && !String(t).startsWith('YOUR_'));
  const configCities = (config.cities ?? []).filter((c) => c?.where);
  const marketCities = (market?.cities ?? []).filter((c) => c?.where);
  const cityCount = (configCities.length ? configCities : marketCities).length || 1;
  const titleCount = titles.length || 0;
  const boardCount = enabledBoards.length || 0;
  const queriesPerBoard = titleCount * cityCount;
  return {
    marketId: market?.id ?? config.market ?? null,
    marketName: market?.name ?? null,
    candidate: profile?.name ?? null,
    targetRole: profile?.targetRole ?? null,
    apifyTokenPresent: Boolean(process.env.APIFY_TOKEN?.trim()),
    cursorApiKeyPresent: cursorAgentAvailable(),
    agentProviders: await listAgentProvidersStatus(),
    fetchRunning: Boolean(fetchState.child),
    fetchStartedAt: fetchState.startedAt,
    lastFetchCode: fetchState.lastCode,
    prepRunning: Boolean(prepState.running),
    prepJobId: prepState.jobId,
    prepStartedAt: prepState.startedAt,
    digestNewCount: digest?.newCount ?? 0,
    followUpsDue: followUpsDue.length,
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

async function enrichJobs({ force = false } = {}) {
  const ttlMs = 3000;
  if (!force && jobsEnrichCache.data && Date.now() - jobsEnrichCache.at < ttlMs) {
    return jobsEnrichCache.data;
  }
  if (!force && jobsEnrichCache.inflight) return jobsEnrichCache.inflight;

  const run = (async () => {
    const data = await loadJson(join(workspaceDir(), 'jobs.json'), null);
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    const decisions = await loadDecisions();
    const byId = new Map((decisions.decisions ?? []).map((d) => [d.id, d]));
    const digest = await loadJson(join(workspaceDir(), 'digest.json'), null);
    const newSet = new Set(digest?.newIds ?? []);
    const prepIndex = await loadPrepFlagsIndex();

    if (!data) {
      return {
        jobs: [],
        meta: null,
        companies: [],
        digest,
        message: 'No fetch yet. Run a search from the UI or CLI.',
      };
    }

    const raw = data.jobs ?? [];
    const before = raw.length;
    const deduped = dedupeJobs(raw);
    const jobs = deduped.map((job) => {
      const fit = profile ? scoreJob(job, profile) : null;
      const decision = byId.get(job.id) ?? null;
      const flags = prepFlagsForJob(prepIndex, job.id);
      const tailoredCv = flags.tailoredCv;
      return {
        ...job,
        decision,
        fit,
        isNew: newSet.has(job.id),
        ...flags,
        prepPath:
          decision?.prepPath
          || (tailoredCv ? `.workspace/prep/${String(job.id).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)}` : null),
      };
    });

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

  jobsEnrichCache.inflight = run;
  try {
    const result = await run;
    jobsEnrichCache = { at: Date.now(), data: result, inflight: null };
    return result;
  } catch (err) {
    jobsEnrichCache.inflight = null;
    throw err;
  }
}

function paginate(items, url) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get('pageSize') || 10)));
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageSize,
    total,
    pages,
    items: items.slice(start, start + pageSize),
  };
}

async function handleApi(req, res, url) {
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/status') {
    return json(res, 200, await getStatus());
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
      companies: companySummaries(enriched.companies),
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
    return json(res, 200, { job });
  }

  if (req.method === 'GET' && path === '/api/digest') {
    const enriched = await enrichJobs();
    const newJobs = enriched.jobs.filter((j) => j.isNew);
    return json(res, 200, {
      digest: enriched.digest,
      newJobs: newJobs.map(toJobListItem),
      count: newJobs.length,
    });
  }

  if (req.method === 'GET' && path === '/api/tracker') {
    const decisions = await loadDecisions();
    const enriched = await enrichJobs();
    const byId = new Map(enriched.jobs.map((j) => [j.id, j]));
    const hideParam = (url.searchParams.get('hide') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const hideSet = new Set(hideParam);
    const visible = VALID_DECISIONS.filter((d) => !hideSet.has(d));
    const columns = Object.fromEntries(visible.map((d) => [d, []]));
    for (const d of decisions.decisions ?? []) {
      if (!columns[d.decision]) continue; // hidden column
      columns[d.decision].push({
        ...d,
        job: byId.get(d.id) ?? null,
      });
    }
    const today = new Date().toISOString().slice(0, 10);
    const followUps = (decisions.decisions ?? []).filter(
      (d) => d.followUpDate && d.followUpDate <= today && !hideSet.has(d.decision),
    );
    return json(res, 200, {
      columns,
      followUps,
      valid: visible,
      allValid: VALID_DECISIONS,
      hidden: [...hideSet],
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
      });
      invalidateJobsCache();
      const sheets = await maybeSyncDecisionToSheet(result.entry);
      return json(res, 200, { ok: true, ...result, valid: VALID_DECISIONS, sheets });
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === 'PATCH' && path === '/api/decisions') {
    const body = await readBody(req);
    try {
      const entry = await patchDecision(body.id, {
        ...(body.followUpDate !== undefined ? { followUpDate: body.followUpDate || null } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.prepPath !== undefined ? { prepPath: body.prepPath } : {}),
        ...(body.decision ? { decision: body.decision } : {}),
      });
      invalidateJobsCache();
      const sheets = await maybeSyncDecisionToSheet(entry);
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
      return json(res, 200, {
        ...result,
        syncStatuses: SHEET_SYNC_DECISIONS,
      });
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

  if (req.method === 'POST' && path === '/api/prep') {
    const body = await readBody(req);
    const enriched = await enrichJobs();
    const job = enriched.jobs.find((j) => j.id === body.id);
    if (!job) return json(res, 404, { error: 'Job not found in current results' });
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    if (!profile) return json(res, 400, { error: 'profile.json required' });
    const saved = await loadSavedAnswers();
    const fit = job.fit || scoreJob(job, profile);
    const recreate = body.recreate === true;
    const extraInstructions = typeof body.extraInstructions === 'string'
      ? body.extraInstructions.trim().slice(0, 500)
      : '';
    const mode = body.mode === 'fast' ? 'fast' : 'agent';

    // Cached pack: skip rebuild unless recreate (sync)
    if (!recreate && (await hasCachedPdfs(job.id))) {
      const pack = await writePrepPack(job, profile, fit, saved, {
        useCache: true,
        recreate: false,
        extraInstructions,
        tailorMode: mode,
      });
      invalidateJobsCache();
      return json(res, 200, { ok: true, cached: true, pack, fit });
    }

    // Fast mode stays synchronous
    if (mode === 'fast') {
      const pack = await writePrepPack(job, profile, fit, saved, {
        recreate: true,
        useCache: false,
        extraInstructions,
        tailorMode: 'fast',
      });
      try {
        await recordDecision(job.id, job.decision?.decision || 'shortlisted', job.decision?.note || '', {
          prepPath: pack.relativeDir,
          followUpDate: job.decision?.followUpDate,
        });
      } catch {
        /* decision optional */
      }
      invalidateJobsCache();
      return json(res, 200, { ok: true, cached: false, pack, fit, mode: 'fast' });
    }

    if (prepState.running) {
      return json(res, 409, {
        error: 'A Prep & CV agent run is already in progress',
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
        prepLog(`Prep & CV agent starting for ${job.title} @ ${job.company}`);
        if (!cursorAgentAvailable()) {
          prepLog('CURSOR_API_KEY missing — will fall back to Fast after attempt check.', 'stderr');
        }
        const pack = await writePrepPack(job, profile, fit, saved, {
          recreate: true,
          useCache: false,
          extraInstructions,
          tailorMode: 'agent',
          onEvent: (entry) => {
            prepState.buffer.push(entry);
            if (prepState.buffer.length > 800) prepState.buffer.shift();
            broadcastPrep('log', entry);
          },
        });
        try {
          await recordDecision(job.id, job.decision?.decision || 'shortlisted', job.decision?.note || '', {
            prepPath: pack.relativeDir,
            followUpDate: job.decision?.followUpDate,
          });
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
    const catalog = await listAgentModels(provider);
    const availability = await agentRunnerAvailable(provider);
    return json(res, 200, {
      ...catalog,
      selected: settings.agentModel,
      selectedProvider: settings.agentProvider,
      providers: await listAgentProvidersStatus(),
      availability,
      cursorApiKeyPresent: cursorAgentAvailable(),
    });
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

  // POST /api/prep/open-folder { id } — export into project downloads/<Company>/ + open Explorer
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

        // Also write into <project>/downloads/<Company>/
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
        if (src !== 'local' && src !== 'overleaf') {
          return json(res, 400, { error: 'cvSource must be local or overleaf' });
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
      if (body.agentProvider != null) {
        const ap = String(body.agentProvider).trim().toLowerCase();
        if (!['cursor', 'claude-code', 'codex'].includes(ap)) {
          return json(res, 400, { error: 'agentProvider must be cursor, claude-code, or codex' });
        }
        config.cv.agentProvider = ap;
      }
      if (body.agentModel != null) {
        const mid = String(body.agentModel).trim().slice(0, 80);
        if (mid && !/^[a-zA-Z0-9._+-]+$/.test(mid)) {
          return json(res, 400, { error: 'agentModel must be a model id (letters, digits, ._+-)' });
        }
        config.cv.agentModel = mid;
      }
    }
    await writeFile(SEARCH_PROFILE, `${JSON.stringify(config, null, 2)}\n`);
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
      });
    });
    child.on('error', (err) => {
      fetchState.stopping = false;
      fetchState.child = null;
      fetchState.lastCode = 1;
      invalidateJobsCache();
      broadcast('log', { stream: 'stderr', line: err.message, t: Date.now() });
      broadcast('done', { code: 1, stopped: false, at: new Date().toISOString() });
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
    if (rel !== '/index.html') return serveFile(res, join(PUBLIC, 'index.html'));
    res.writeHead(404);
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
