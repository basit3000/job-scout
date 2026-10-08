// Archive parsing/ranking stays in a worker; expensive document checks are page-scoped.
import { join } from 'node:path';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { ROOT, loadJson, loadMarket, workspaceDir } from '../scripts/lib/common.mjs';
import { loadCandidateProfile } from '../scripts/lib/memory.mjs';
import { loadDecisions } from '../scripts/lib/decisions.mjs';
import { loadSavedAnswers } from '../scripts/lib/saved-answers.mjs';
import { loadRecruiterStore } from '../scripts/lib/recruiter-contact.mjs';
import { loadPrepFlagsIndex, loadPrepFlagsForJob, prepFlagsForJob, loadCvSettings, prepDir } from '../scripts/lib/prep.mjs';
import { withJobTemplate, savedTemplateIds } from '../scripts/lib/cv-template-packs.mjs';
import { assessPrep, loadPrepInputs, prepStatus } from '../scripts/lib/prep-state.mjs';
import { scoreJob } from '../scripts/lib/fit.mjs';
import { rankingEvidence } from '../scripts/lib/rank.mjs';
import { createScoreCache } from '../scripts/lib/score-cache.mjs';
import { currentSearchState } from '../scripts/lib/current-search.mjs';
import { withMatchingAnswers } from '../scripts/lib/match-requirements.mjs';
import { detectPostingLanguage, detectGermanRequirement, postingWrittenLanguage, jobMatchesLanguageFilter } from '../scripts/lib/cv-keywords.mjs';
import { detectAts } from '../scripts/lib/ats.mjs';
import { compareFit, sortJobs } from '../scripts/lib/job-sort.mjs';
import { clusterByCompany } from '../scripts/lib/dedupe.mjs';
import { paginate, digestItems } from '../scripts/lib/list-pagination.mjs';
import { loadRunHistory } from '../scripts/lib/run-history.mjs';
const cachedScorer = createScoreCache(scoreJob);
const SEARCH_PROFILE = join(ROOT, 'search-profile.json');
const READY_EXCLUDED = new Set(['applied', 'interviewing', 'offer', 'accepted', 'skipped', 'rejected', 'closed']);
async function loadSearchProfile() {
  return (
    (await loadJson(SEARCH_PROFILE, null))
    || (await loadJson(join(ROOT, 'search-profile.example.json'), null))
    || {}
  );
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

export function invalidateJobsCache() {
  jobsEnrichCache = { at: 0, data: null, inflight: null };
}

async function loadIndex({ force = false } = {}) {
  const ttlMs = 15000;
  if (!force && jobsEnrichCache.data && Date.now() - jobsEnrichCache.at < ttlMs) {
    return jobsEnrichCache.data;
  }
  if (!force && jobsEnrichCache.inflight) return jobsEnrichCache.inflight;

  const cache = jobsEnrichCache;
  const run = (async () => {
    const data = await loadJson(join(workspaceDir(), 'jobs.json'), null);
    const profile = await loadCandidateProfile();
    const decisions = await loadDecisions();
    const byId = new Map((decisions.decisions ?? []).map((d) => [d.id, d]));
    const digest = await loadJson(join(workspaceDir(), 'digest.json'), null);
    const newSet = new Set(digest?.newIds ?? []);
    const cvSettings = await loadCvSettings();
    const prepInputs = await loadPrepInputs(cvSettings);
    const evidenceText = rankingEvidence(prepInputs);
    const matchingProfile = profile ? withMatchingAnswers(profile, await loadSavedAnswers()) : null;
    const searchConfig = await loadSearchProfile();
    const currentMarket = await loadMarket(searchConfig);
    const recruiterStore = await loadRecruiterStore();

    if (!data) {
      return {
        jobs: [],
        decisions: decisions.decisions ?? [],
        detail: async job => job,
        meta: null,
        companies: [],
        digest,
        message: 'No fetch yet. Run a search from the UI or CLI.',
      };
    }

    const score = matchingProfile ? cachedScorer(matchingProfile, evidenceText) : () => null;
    const raw = data.jobs ?? [];
    const before = raw.length;
    // Keep historical rows addressable: they may own distinct documents/decisions.
    const deduped = raw;
    const jobs = [];
    // Let invalidation and newer page requests reach the worker between groups.
    for (let offset = 0; offset < deduped.length; offset += 25) {
      const chunk = deduped.slice(offset, offset + 25).map((job) => {
        const fit = score(job);
        const decision = byId.get(job.id) ?? null;
        const currentSearch = currentSearchState(job, profile || {}, searchConfig, currentMarket);
        const recruiter = recruiterStore.contacts[job.id] || null;
        return {
          ...job,
          language: detectPostingLanguage(job),
          writtenLanguage: postingWrittenLanguage(job),
          germanRequired: detectGermanRequirement(job) === 'required',
          decision,
          fit,
          isNew: newSet.has(job.id),
          ageDays: currentSearch.ageDays,
          currentSearch,
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
            || null,
        };
      });

      jobs.push(...chunk);
      await yieldEventLoop();
    }
    jobs.sort(compareFit);
    const rawById = new Map(raw.map(job => [job.id, job]));
    const details = new Map();
    const detail = job => {
      if (!details.has(job.id)) details.set(job.id, (async () => {
        const flags = { ...job, ...await loadPrepFlagsForJob(job.id) };
        flags.prepPath ||= flags.tailoredCv ? `.workspace/prep/${String(job.id).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)}` : null;
        const rawJob = rawById.get(job.id);
        const manifest = flags.tailoredCv || flags.tailoredPdf || flags.coverLetter
          ? await loadJson(join(prepDir(job.id), 'generation.json'), null) : null;
        const freshnessOptions = { cv: flags.tailoredCv || flags.tailoredPdf, letter: flags.coverLetter };
        const freshness = (flags.tailoredCv || flags.tailoredPdf || flags.coverLetter) && (savedTemplateIds(job.id).length || cvSettings.source === 'overleaf')
          ? await withJobTemplate(job.id, null, async () => prepStatus(rawJob, profile, await loadCvSettings(), freshnessOptions))
          : assessPrep(manifest, { job: rawJob, profile, settings: cvSettings, inputs: prepInputs }, freshnessOptions);
        return { ...flags, prepFreshness: freshness,
          prepOutdated: Object.values(freshness).includes('outdated'),
          prepNeedsReview: Object.values(freshness).includes('needs-review') };
      })().catch(error => { details.delete(job.id); throw error; }));
      return details.get(job.id);
    };

    const { jobs: _j, ...meta } = data;
    meta.duplicatesRemovedExtra = Math.max(0, before - deduped.length);

    return {
      jobs,
      meta,
      companies: clusterByCompany(jobs),
      digest,
      decisions: decisions.decisions ?? [],
      detail,
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

export async function queryCatalog(kind, search = '') {
  const enriched = await loadIndex();
  const { detail, ...snapshot } = enriched;
  const url = new URL('http://local/?' + search);
  if (kind === 'observations') return {
    jobs: enriched.jobs.map(job => ({ id: job.id, meaningful: ['Strong', 'Worth a shot'].includes(job.fit?.verdict) })),
    followUps: enriched.decisions.filter(item => item.followUpDate && !['closed', 'rejected', 'accepted', 'skipped'].includes(item.decision)),
  };
  if (kind === 'job') {
    const job = enriched.jobs.find(job => job.id === search);
    return job ? await detail(job) : null;
  }
  if (kind === 'all') return { ...snapshot, jobs: await detailed(enriched.jobs, detail) };
  if (kind === 'jobs') {
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
    const { items, ...pagination } = paginate(list, url);
    return { jobs: (await detailed(items, detail)).map(toJobListItem), pagination, meta: enriched.meta,
      ...(url.searchParams.get('companies') === '1' ? { companies: companySummaries(enriched.companies) } : {}),
      digest: enriched.digest ? { generatedAt: enriched.digest.generatedAt,
        previousFetchAt: enriched.digest.previousFetchAt, newCount: (enriched.digest.newIds ?? []).length } : null,
      message: enriched.message };
  }
  if (kind === 'digest') {
    const newJobs = digestItems(enriched.jobs, url);
    if (url.searchParams.get('selection') === '1') {
      const prepIndex = await loadPrepFlagsIndex();
      return { candidates: newJobs.map(job => ({ ...job, ...prepFlagsForJob(prepIndex, job.id) })).map(({ id, title, company, fit, tailoredCv, tailoredPdf, coverLetter }) =>
        ({ id, title, company, fit: fit ? { verdict: fit.verdict } : null, tailoredCv, tailoredPdf, coverLetter })) };
    }
    const { items, ...pagination } = paginate(newJobs, url);
    const history = await loadRunHistory();
    return { digest: enriched.digest, newJobs: (await detailed(items, detail)).map(toJobListItem),
      pagination, count: newJobs.length, history: history.fetch };
  }
  if (kind === 'ready') {
    // Only prepared candidates need freshness checks to compute an accurate Ready total.
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const prepIndex = await loadPrepFlagsIndex();
    const candidates = enriched.jobs.map(job => ({ ...job, ...prepFlagsForJob(prepIndex, job.id) })).filter(job => jobIsReady(job)
      && (!q || `${job.title} ${job.company} ${job.location || ''}`.toLowerCase().includes(q)));
    const list = (await detailed(candidates, detail)).filter(jobIsReady);
    const counts = { both: 0, cvOnly: 0, letterOnly: 0 };
    for (const job of list) {
      if (job.tailoredCv && job.coverLetter) counts.both++;
      else if (job.tailoredCv) counts.cvOnly++;
      else counts.letterOnly++;
    }
    const { items, ...pagination } = paginate(list, url);
    return { jobs: items.map(toJobListItem), pagination, total: list.length, counts };
  }
  throw new Error('Unknown catalog request');
}

async function detailed(jobs, detail) {
  const result = [];
  for (let offset = 0; offset < jobs.length; offset += 10) {
    result.push(...await Promise.all(jobs.slice(offset, offset + 10).map(detail)));
    await yieldEventLoop();
  }
  return result;
}
