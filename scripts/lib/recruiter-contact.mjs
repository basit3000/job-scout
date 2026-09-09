/**
 * Recruiter contact lookup: posting + light HTTP scrape, then optional agent web search.
 * Contacts persist to state/recruiter-contacts.json as they are found.
 */

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { Agent, CursorAgentError } from '@cursor/sdk';
import { ROOT, loadJson, workspaceDir } from './common.mjs';
import { hydrateJobDescription } from './de-portals.mjs';
import {
  agentRunnerAvailable,
  DEFAULT_AGENT_MODEL,
  normalizeAgentProvider,
  resolveAgentModel,
  resolveProviderBinary,
} from './cv-agent.mjs';
import { formatAgentEvent } from './cv-agent-log.mjs';
import { loadCvSettings } from './prep.mjs';
import {
  companyKey,
  contactPagesFor,
  extractRecruiterHints,
  guessCompanySiteUrls,
  isGenericEmail,
  isJobBoardHost,
  normalizeEmail,
  normalizeLinkedIn,
  parseRecruiterAgentJson,
  pickBestEmail,
  looksLikePersonName,
  sanitizePersonName,
} from './recruiter-extract.mjs';

export const RECRUITER_LOOKUP_TIMEOUT_MS = 45_000;
export const RECRUITER_AGENT_TIMEOUT_MS = 180_000;

const UA = 'JobScout/1.0 (personal job search; recruiter contact lookup)';

export function recruiterContactsPath() {
  return join(ROOT, 'state', 'recruiter-contacts.json');
}

export function emptyContact(job = {}) {
  return {
    jobId: job.id || '',
    company: job.company || '',
    title: job.title || '',
    name: '',
    role: '',
    email: '',
    linkedinUrl: '',
    genericEmail: false,
    sources: [],
    attempts: [],
    notes: '',
    updatedAt: null,
    lookedUpAt: null,
    agentAt: null,
  };
}

export function publicContact(entry) {
  if (!entry) return emptyContact();
  return {
    jobId: entry.jobId || '',
    company: entry.company || '',
    title: entry.title || '',
    name: entry.name || '',
    role: entry.role || '',
    email: entry.email || '',
    linkedinUrl: entry.linkedinUrl || '',
    genericEmail: Boolean(entry.genericEmail),
    sources: Array.isArray(entry.sources) ? entry.sources.slice(-12) : [],
    notes: entry.notes || '',
    updatedAt: entry.updatedAt || null,
    lookedUpAt: entry.lookedUpAt || null,
    agentAt: entry.agentAt || null,
    foundEmail: Boolean(entry.email),
  };
}

export async function loadRecruiterStore() {
  const data = await loadJson(recruiterContactsPath(), null);
  if (!data || typeof data !== 'object') return { contacts: {}, updatedAt: null };
  return {
    contacts: data.contacts && typeof data.contacts === 'object' ? data.contacts : {},
    updatedAt: data.updatedAt || null,
  };
}

async function writeRecruiterStore(store) {
  const path = recruiterContactsPath();
  await mkdir(dirname(path), { recursive: true });
  const body = {
    updatedAt: new Date().toISOString(),
    contacts: store.contacts || {},
  };
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`);
  return body;
}

export function mergeContact(prev, patch = {}, { replace = false } = {}) {
  const next = { ...emptyContact(), ...prev };
  if (patch.jobId) next.jobId = patch.jobId;
  if (patch.company) next.company = patch.company;
  if (patch.title) next.title = patch.title;
  if (patch.name && looksLikePersonName(patch.name)) next.name = sanitizePersonName(patch.name);
  else if (patch.name && (!next.name || replace)) next.name = String(patch.name).trim().slice(0, 80);
  if (patch.role || (replace && patch.role === '')) next.role = String(patch.role || '').trim().slice(0, 80);
  const email = normalizeEmail(patch.email);
  if (email) {
    if (replace || !next.email || (isGenericEmail(next.email) && !isGenericEmail(email))) {
      next.email = email;
      next.genericEmail = isGenericEmail(email);
    }
  } else if (replace && patch.email === '') {
    next.email = '';
    next.genericEmail = false;
  }
  const li = normalizeLinkedIn(patch.linkedinUrl);
  if (li && (!next.linkedinUrl || replace)) next.linkedinUrl = li;
  else if (replace && patch.linkedinUrl === '') next.linkedinUrl = '';
  if (patch.notes) next.notes = String(patch.notes).trim().slice(0, 500);
  const extra = Array.isArray(patch.sources) ? patch.sources : [];
  const sources = [...(next.sources || [])];
  for (const s of extra) {
    const row = {
      kind: String(s?.kind || 'unknown').slice(0, 40),
      url: String(s?.url || '').slice(0, 400) || undefined,
      note: String(s?.note || '').slice(0, 200) || undefined,
      email: s?.email || undefined,
      name: s?.name || undefined,
      at: s?.at || new Date().toISOString(),
    };
    const key = `${row.kind}|${row.email || ''}|${row.name || ''}|${row.url || ''}`;
    if (!sources.some((x) => `${x.kind}|${x.email || ''}|${x.name || ''}|${x.url || ''}` === key)) {
      sources.push(row);
    }
  }
  next.sources = sources.slice(-40);
  if (Array.isArray(patch.attempts) && patch.attempts.length) {
    next.attempts = [...(next.attempts || []), ...patch.attempts].slice(-12);
  }
  if (patch.lookedUpAt) next.lookedUpAt = patch.lookedUpAt;
  if (patch.agentAt) next.agentAt = patch.agentAt;
  next.updatedAt = new Date().toISOString();
  return next;
}

export async function getRecruiterContact(jobId) {
  const store = await loadRecruiterStore();
  return store.contacts[jobId] ? publicContact(store.contacts[jobId]) : null;
}

export function contactsForCompany(store, company) {
  const key = companyKey(company);
  if (!key) return [];
  return Object.values(store.contacts || {}).filter((c) => companyKey(c.company) === key && (c.email || c.name || c.linkedinUrl));
}

export async function saveRecruiterContact(jobId, patch, job = {}, { replace = false } = {}) {
  const store = await loadRecruiterStore();
  const prev = store.contacts[jobId] || emptyContact({ id: jobId, ...job });
  const next = mergeContact(prev, { jobId, company: job.company || prev.company, title: job.title || prev.title, ...patch }, { replace });
  store.contacts[jobId] = next;
  await writeRecruiterStore(store);
  return publicContact(next);
}

export async function loadJobRecord(id) {
  const data = await loadJson(join(workspaceDir(), 'jobs.json'), { jobs: [] });
  const job = (data.jobs || []).find((j) => j.id === id) || null;
  if (!job) {
    const decisions = await loadJson(join(ROOT, 'state', 'decisions.json'), { decisions: [] });
    const entry = (decisions.decisions || []).find((d) => d.id === id);
    if (!entry) return null;
    return {
      id,
      title: entry.title || '',
      company: entry.company || '',
      url: entry.url || '',
      board: entry.board || '',
      description: '',
    };
  }
  if (!String(job.description || '').trim()) {
    const text = await hydrateJobDescription(job);
    if (text) job.description = text;
  }
  return job;
}

async function fetchHtml(url, { timeoutMs = 10_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': UA,
        'Accept-Language': 'en,de;q=0.9',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || url, text: text.slice(0, 600_000) };
  } catch (err) {
    return { ok: false, status: 0, url, text: '', error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function applyHints(job, hints, kind) {
  const email = pickBestEmail(hints.emails);
  const named = hints.emails.find((e) => e.name && !e.generic);
  return {
    name: named?.name || hints.names[0] || '',
    email: email || '',
    linkedinUrl: hints.linkedinUrls[0] || '',
    sources: (hints.sources || []).map((s) => ({ ...s, kind: s.kind || kind })),
  };
}

async function scrapeWithBrowser(url, emit) {
  try {
    const { playwrightAvailable, peekChromeContext } = await import('./apply-fill.mjs');
    if (!(await playwrightAvailable())) return null;
    const ctx = peekChromeContext();
    if (!ctx) {
      emit('Chrome is not open from Fill — using HTTP scrape only.');
      return null;
    }
    emit('Reading the posting from the open Chrome window…');
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForTimeout(800);
      const html = await page.content();
      const text = await page.locator('body').innerText().catch(() => '');
      return { html, text, url: page.url() };
    } finally {
      await page.close().catch(() => null);
    }
  } catch (err) {
    const msg = err.message || String(err);
    if (/already in use|ProcessSingleton/i.test(msg)) {
      emit('Chrome is busy with Fill — skipped live portal tab.');
      return null;
    }
    emit(`Portal tab skipped: ${msg.slice(0, 160)}`);
    return null;
  }
}

export const recruiterRun = {
  running: false,
  jobId: null,
  mode: null,
  startedAt: null,
  logs: [],
  error: null,
  stopping: false,
  cancel: null,
};

export function recruiterRunSnapshot() {
  return {
    running: recruiterRun.running,
    jobId: recruiterRun.jobId,
    mode: recruiterRun.mode,
    startedAt: recruiterRun.startedAt,
    error: recruiterRun.error,
    logs: recruiterRun.logs.slice(-40),
  };
}

function emitToRun(line, stream = 'stdout') {
  const entry = { line: String(line), stream, t: Date.now() };
  recruiterRun.logs.push(entry);
  if (recruiterRun.logs.length > 80) recruiterRun.logs.splice(0, recruiterRun.logs.length - 80);
}

/**
 * Fast path: stored posting, HTTP scrape of the apply URL + company/impressum pages,
 * LinkedIn/Indeed via Chrome tab when HTTP is empty. Saves after each source.
 */
export async function lookupRecruiter(job, { emit = () => {} } = {}) {
  const started = new Date().toISOString();
  const store = await loadRecruiterStore();
  let contact = await saveRecruiterContact(job.id, {
    lookedUpAt: started,
    attempts: [{ at: started, mode: 'lookup' }],
  }, job);

  const absorb = async (hints, kind) => {
    const patch = applyHints(job, hints, kind);
    if (!patch.email && !patch.name && !patch.linkedinUrl) return contact;
    contact = await saveRecruiterContact(job.id, patch, job);
    if (patch.email) emit(`Found email (${kind}): ${patch.email}`);
    else if (patch.name) emit(`Found name (${kind}): ${patch.name}`);
    else if (patch.linkedinUrl) emit(`Found LinkedIn (${kind})`);
    return contact;
  };

  const prior = contactsForCompany(store, job.company).filter((c) => c.jobId !== job.id);
  if (prior.length) {
    const best = prior.find((c) => c.email && !c.genericEmail) || prior.find((c) => c.email) || prior[0];
    emit(`Reusing earlier find at ${job.company}: ${[best.name, best.email].filter(Boolean).join(' · ')}`);
    contact = await saveRecruiterContact(job.id, {
      name: best.name,
      role: best.role,
      email: best.email,
      linkedinUrl: best.linkedinUrl,
      sources: [{ kind: 'previous-job', note: `Saved from ${best.title || best.jobId}`, url: undefined }],
    }, job);
  }

  const jobEmails = Array.isArray(job.emails) ? job.emails.join(' ') : String(job.emails || '');
  const postingText = [job.description, jobEmails, job.title, job.company].filter(Boolean).join('\n');
  emit('Scanning the stored posting…');
  await absorb(extractRecruiterHints(postingText, { sourceUrl: job.url, kind: 'text' }), 'posting');

  const applyUrl = String(job.url || '');
  if (applyUrl) {
    emit('Fetching the apply page…');
    const page = await fetchHtml(applyUrl);
    if (page.ok && page.text) {
      await absorb(extractRecruiterHints(page.text, { sourceUrl: page.url, kind: 'html' }), 'portal');
    } else {
      emit(`Apply page HTTP ${page.status || 'failed'}${page.error ? ` (${page.error})` : ''}`);
    }
    let host = '';
    try { host = new URL(applyUrl).hostname; } catch { /* ignore */ }
    if (!contact.email && isJobBoardHost(host)) {
      const browser = await scrapeWithBrowser(applyUrl, emit);
      if (browser?.html || browser?.text) {
        await absorb(
          extractRecruiterHints(`${browser.html || ''}\n${browser.text || ''}`, {
            sourceUrl: browser.url || applyUrl,
            kind: 'html',
          }),
          'portal-browser',
        );
      }
    }
  }

  if (!contact.email) {
    const origins = guessCompanySiteUrls(job).filter((o) => {
      try {
        return !isJobBoardHost(new URL(o).hostname);
      } catch {
        return false;
      }
    });
    const pages = origins.flatMap((o) => contactPagesFor(o)).slice(0, 8);
    for (const url of pages) {
      if (recruiterRun.stopping) break;
      if (contact.email) break;
      emit(`Checking ${url.replace(/^https?:\/\//, '')}…`);
      const page = await fetchHtml(url, { timeoutMs: 8000 });
      if (!page.ok || !page.text) continue;
      await absorb(extractRecruiterHints(page.text, { sourceUrl: page.url, kind: 'html' }), 'company-site');
    }
  }

  contact = await saveRecruiterContact(job.id, {
    attempts: [{ at: new Date().toISOString(), mode: 'lookup-done', foundEmail: Boolean(contact.email) }],
  }, job);
  if (contact.email) emit(`Saved ${contact.email}`);
  else if (contact.name) emit(`Saved name ${contact.name} — no email on the posting or company pages.`);
  else emit('No recruiter email on the posting or simple scrape.');
  return contact;
}

function buildAgentPrompt({ job, contact, prior, postingExcerpt }) {
  return `Find the recruiter (or hiring manager) for this job posting. Use web search and fetch public pages. Work around login walls, cookie banners, and ATS by trying company site, Impressum/Imprint, team/about, LinkedIn public snippets, press, and previous finds below.

Return JSON only at the end (no markdown besides an optional json fence):
{"name":"","role":"","email":"","linkedinUrl":"","notes":"","invented":false,"sources":[{"url":"","note":""}]}

Rules:
- NEVER invent an email or LinkedIn URL. If you did not see it on a page or search snippet, leave it empty and set invented true only if you were tempted to guess.
- Prefer a named recruiter / talent partner / hiring manager over jobs@ or careers@.
- German companies: Impressum often lists a real person + email.
- If you find a name but not an email, search "Name" + company + email.
- Do not edit files. Do not run destructive shell commands.

JOB:
${JSON.stringify({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    board: job.board,
  }, null, 2)}

ALREADY FOUND (from posting / scrape — treat as leads, verify):
${JSON.stringify({
    name: contact.name || '',
    email: contact.email || '',
    linkedinUrl: contact.linkedinUrl || '',
    sources: (contact.sources || []).slice(-8),
  }, null, 2)}

PREVIOUS FINDS AT THIS COMPANY:
${JSON.stringify(prior.map((c) => ({
    title: c.title,
    name: c.name,
    email: c.email,
    linkedinUrl: c.linkedinUrl,
  })), null, 2)}

POSTING EXCERPT:
${String(postingExcerpt || '').slice(0, 2500)}
`;
}

async function withTimeout(promise, ms, onTimeout) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          try { onTimeout?.(); } catch { /* ignore */ }
          reject(new Error(`Recruiter agent timed out after ${Math.round(ms / 1000)}s`));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function askCursorRecruiter(prompt, modelId, emit) {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) throw new Error('CURSOR_API_KEY is missing');
  const cwd = await mkdtemp(join(tmpdir(), 'js-recruiter-'));
  let agent;
  let run;
  try {
    agent = await Agent.create({
      apiKey,
      model: { id: modelId || DEFAULT_AGENT_MODEL },
      local: { cwd, settingSources: [] },
    });
    run = await agent.send(
      `${prompt}\n\nUse web search and fetch tools. Keep going through dead ends until you have a public email or are sure it is not published.`,
    );
    recruiterRun.cancel = () => run.cancel?.().catch(() => null);
    const stats = { tools: 0, started: new Set(), usage: null };
    if (run.supports?.('stream')) {
      void (async () => {
        try {
          for await (const event of run.stream()) {
            const formatted = formatAgentEvent(event, stats);
            if (formatted) emit(formatted.line, formatted.stream);
          }
        } catch {
          /* stream ended */
        }
      })();
    }
    const result = await withTimeout(
      run.wait(),
      RECRUITER_AGENT_TIMEOUT_MS,
      () => { run.cancel?.().catch(() => null); },
    );
    if (result?.status === 'error') {
      throw new Error(result.error?.message || 'Cursor agent error');
    }
    return String(result?.result || '');
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor agent error: ${err.message}`);
    }
    throw err;
  } finally {
    recruiterRun.cancel = null;
    try {
      await agent?.[Symbol.asyncDispose]?.();
    } catch {
      try { agent?.close?.(); } catch { /* ignore */ }
    }
  }
}

async function askCliRecruiter({ bin, args, emit }) {
  const cwd = await mkdtemp(join(tmpdir(), 'js-recruiter-'));
  let child;
  const stdout = await withTimeout(
    new Promise((resolve, reject) => {
      child = spawn(bin, args, {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
      recruiterRun.cancel = () => {
        if (!child?.pid) return;
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          } else {
            child.kill('SIGTERM');
          }
        } catch { /* ignore */ }
      };
      let out = '';
      const onChunk = (stream) => (buf) => {
        const text = buf.toString('utf8');
        if (stream === 'stdout') out += text;
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) emit(line.slice(0, 240), stream);
        }
      };
      child.stdout.on('data', onChunk('stdout'));
      child.stderr.on('data', onChunk('stderr'));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(out);
        else reject(new Error((out || `exit ${code}`).slice(0, 400)));
      });
    }),
    RECRUITER_AGENT_TIMEOUT_MS,
    () => recruiterRun.cancel?.(),
  );
  recruiterRun.cancel = null;
  return stdout;
}

export async function searchRecruiterWithAgent(job, { emit = () => {}, provider, model } = {}) {
  const settings = await loadCvSettings();
  const prov = normalizeAgentProvider(provider || settings.agentProvider);
  const modelSel = resolveAgentModel(model || settings.agentModel, prov);
  const avail = await agentRunnerAvailable(prov);
  if (!avail.ok) {
    throw new Error(avail.detail || 'Agent unavailable — set CURSOR_API_KEY or switch Agent in Prep settings.');
  }

  const store = await loadRecruiterStore();
  const prior = contactsForCompany(store, job.company).filter((c) => c.jobId !== job.id);
  let contact = (await getRecruiterContact(job.id)) || emptyContact(job);
  const started = new Date().toISOString();
  contact = await saveRecruiterContact(job.id, {
    agentAt: started,
    attempts: [{ at: started, mode: 'agent' }],
  }, job);

  const prompt = buildAgentPrompt({
    job,
    contact,
    prior,
    postingExcerpt: String(job.description || '').slice(0, 2500),
  });
  emit(`Agent search (${prov}${modelSel.id ? ` · ${modelSel.id}` : ''})…`);

  let text = '';
  if (prov === 'cursor') {
    text = await askCursorRecruiter(prompt, modelSel.id || DEFAULT_AGENT_MODEL, emit);
  } else if (prov === 'claude-code') {
    const bin = await resolveProviderBinary('claude-code');
    if (!bin) throw new Error('Claude Code CLI not found');
    const args = ['-p', prompt, '--output-format', 'text'];
    if (modelSel.id) args.push('--model', modelSel.id);
    text = await askCliRecruiter({ bin, args, emit });
  } else if (prov === 'codex') {
    const bin = await resolveProviderBinary('codex');
    if (!bin) throw new Error('Codex CLI not found');
    const args = ['exec', '--sandbox', 'workspace-write', '--ask-for-approval', 'never'];
    if (modelSel.id) args.push('--model', modelSel.id);
    args.push(prompt);
    text = await askCliRecruiter({ bin, args, emit });
  } else {
    throw new Error(`Unknown agent provider: ${prov}`);
  }

  const parsed = parseRecruiterAgentJson(text);
  if (!parsed) {
    emit('Agent finished without usable JSON.');
    contact = await saveRecruiterContact(job.id, {
      notes: 'Agent ran but did not return a parseable result.',
      attempts: [{ at: new Date().toISOString(), mode: 'agent-done', foundEmail: Boolean(contact.email) }],
    }, job);
    return contact;
  }
  if (parsed.invented) {
    emit('Agent marked the result as guessed — keeping only verified fields.');
  }
  const patch = {
    name: parsed.name,
    role: parsed.role,
    email: parsed.invented ? '' : parsed.email,
    linkedinUrl: parsed.invented ? '' : parsed.linkedinUrl,
    notes: parsed.notes,
    sources: parsed.sources,
    attempts: [{ at: new Date().toISOString(), mode: 'agent-done', foundEmail: Boolean(parsed.email && !parsed.invented) }],
  };
  contact = await saveRecruiterContact(job.id, patch, job);
  if (contact.email) emit(`Saved ${contact.email}`);
  else emit(parsed.notes || 'Agent did not find a public email.');
  return contact;
}

export async function startRecruiterJob(id, mode = 'lookup') {
  if (recruiterRun.running) {
    const err = new Error(recruiterRun.jobId === id
      ? 'Already looking up this recruiter.'
      : 'Another recruiter lookup is running.');
    err.code = 'BUSY';
    throw err;
  }
  const job = await loadJobRecord(id);
  if (!job) throw new Error('Job not found');
  const useAgent = mode === 'agent';
  recruiterRun.running = true;
  recruiterRun.jobId = id;
  recruiterRun.mode = useAgent ? 'agent' : 'lookup';
  recruiterRun.startedAt = new Date().toISOString();
  recruiterRun.logs = [];
  recruiterRun.error = null;
  recruiterRun.stopping = false;
  recruiterRun.cancel = null;

  const emit = (line, stream = 'stdout') => emitToRun(line, stream);
  void (async () => {
    try {
      if (useAgent) await searchRecruiterWithAgent(job, { emit });
      else await lookupRecruiter(job, { emit });
    } catch (err) {
      recruiterRun.error = err.message || String(err);
      emit(recruiterRun.error, 'stderr');
    } finally {
      recruiterRun.running = false;
      recruiterRun.cancel = null;
      recruiterRun.stopping = false;
    }
  })();

  return { ok: true, jobId: id, mode: recruiterRun.mode, contact: await getRecruiterContact(id) };
}

export async function stopRecruiterJob() {
  if (!recruiterRun.running) return { ok: true, stopped: false };
  recruiterRun.stopping = true;
  try { await recruiterRun.cancel?.(); } catch { /* ignore */ }
  return { ok: true, stopped: true };
}
