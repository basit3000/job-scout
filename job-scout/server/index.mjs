#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { loadJson, loadMarket, listMarketIds, workspaceDir } from '../scripts/lib/common.mjs';
import { rankJobs, summariseRanking } from '../scripts/lib/rank.mjs';
import { findPlaceholders } from '../scripts/lib/placeholders.mjs';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function runNode(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `exit ${code}`).trim().slice(-1200)));
    });
  });
}

function titlesFromRole(role, extra = []) {
  const base = String(role || '').trim();
  const extras = (extra || []).map(String).map((s) => s.trim()).filter(Boolean);
  const set = new Set([base, ...extras].filter(Boolean));
  return [...set];
}

function patternsFromTitles(titles) {
  const parts = [];
  for (const t of titles) {
    const words = String(t)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !['senior', 'junior', 'lead', 'staff', 'principal'].includes(w));
    if (words.length) parts.push(words.slice(0, 3).join('|'));
  }
  return [...new Set(parts)].slice(0, 6);
}

function buildProfile(body, existing = {}) {
  const name = String(body.name || existing.name || '').trim();
  const targetRole = String(body.targetRole || existing.targetRole || '').trim();
  const headline = String(body.headline || existing.headline || `${targetRole} seeking roles`).trim();
  const titles = titlesFromRole(targetRole, body.titles || existing.search?.titles);
  const skillsStrong = (body.skills || existing.skills?.strong || [])
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...existing,
    name,
    headline,
    targetRole,
    location: {
      current: body.currentLocation || existing.location?.current || 'Not specified',
      targets: body.cities || existing.location?.targets || [],
      openToRemote: body.openToRemote ?? existing.location?.openToRemote ?? true,
      willingToRelocate: body.willingToRelocate ?? existing.location?.willingToRelocate ?? true,
    },
    seniority: body.seniority || existing.seniority || 'any',
    skills: {
      strong: skillsStrong.length ? skillsStrong : (existing.skills?.strong || ['general']),
      familiar: existing.skills?.familiar || [],
      learning: existing.skills?.learning || [],
    },
    experience: existing.experience || [],
    education: existing.education || [],
    links: existing.links || {},
    search: {
      titles: titles.length ? titles : ['YOUR_JOB_TITLE_QUERY_1'],
      includeTitlePatterns: body.includeTitlePatterns?.length
        ? body.includeTitlePatterns
        : (patternsFromTitles(titles).length ? patternsFromTitles(titles) : ['YOUR_REGEX_THAT_MUST_MATCH_TITLE_1']),
      excludeTitlePatterns: body.excludeTitlePatterns || existing.search?.excludeTitlePatterns || [],
    },
    constraints: {
      dropNationalsOnly: body.dropNationalsOnly ?? existing.constraints?.dropNationalsOnly ?? true,
      maxAgeDays: Number(body.maxAgeDays || existing.constraints?.maxAgeDays || 30),
      excludeCompanies: existing.constraints?.excludeCompanies || [],
      notes: body.notes || existing.constraints?.notes || [],
    },
    githubUsername: body.githubUsername ?? existing.githubUsername ?? null,
  };
}

async function readCvText() {
  for (const name of ['resume.md', 'resume.txt', 'resume.tex']) {
    const p = join(ROOT, 'cv', name);
    if (await exists(p)) return readFile(p, 'utf8');
  }
  return '';
}

// --- API ---

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, root: ROOT });
});

app.get('/api/markets', async (_req, res) => {
  try {
    const ids = await listMarketIds();
    const markets = [];
    for (const id of ids) {
      const m = await loadJson(join(ROOT, 'markets', `${id}.json`), null);
      if (m) {
        markets.push({
          id: m.id,
          name: m.name,
          shortName: m.shortName,
          defaultLocation: m.defaultLocation,
          boards: m.boards,
          currency: m.currency,
        });
      }
    }
    const config = await loadJson(join(ROOT, 'search-profile.json'), {});
    res.json({ market: config.market || 'AE', markets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    const profile = await loadJson(join(ROOT, 'profile.json'), null);
    const config = await loadJson(join(ROOT, 'search-profile.json'), {});
    const shortlist = await loadJson(join(workspaceDir(), 'shortlist.json'), null);
    const jobs = await loadJson(join(workspaceDir(), 'jobs.json'), null);
    const cvText = await readCvText();
    const placeholders = profile ? findPlaceholders({
      name: profile.name,
      targetRole: profile.targetRole,
      search: profile.search,
    }) : [];
    res.json({
      hasProfile: Boolean(profile) && placeholders.length === 0,
      hasCv: Boolean(cvText.trim()),
      cvPreview: cvText.slice(0, 400),
      cvChars: cvText.length,
      market: config.market || 'AE',
      profile: profile && {
        name: profile.name,
        headline: profile.headline,
        targetRole: profile.targetRole,
        skills: profile.skills?.strong || [],
        titles: profile.search?.titles || [],
        currentLocation: profile.location?.current,
        openToRemote: profile.location?.openToRemote,
      },
      shortlist,
      jobCount: jobs?.jobs?.length ?? 0,
      placeholders,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/market', async (req, res) => {
  try {
    const market = String(req.body.market || '').toUpperCase();
    await loadMarket({ market }); // validates
    const config = await loadJson(join(ROOT, 'search-profile.json'), {});
    config.market = market;
    await writeFile(join(ROOT, 'search-profile.json'), `${JSON.stringify(config, null, 2)}\n`);
    res.json({ ok: true, market });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    const existing = await loadJson(join(ROOT, 'profile.json'), {});
    const profile = buildProfile(req.body || {}, existing);
    const hits = findPlaceholders({
      name: profile.name,
      targetRole: profile.targetRole,
      search: profile.search,
    });
    if (hits.length) {
      return res.status(400).json({
        error: 'Profile still has unset fields',
        placeholders: hits,
      });
    }
    await writeFile(join(ROOT, 'profile.json'), `${JSON.stringify(profile, null, 2)}\n`);
    res.json({ ok: true, profile: {
      name: profile.name,
      targetRole: profile.targetRole,
      titles: profile.search.titles,
      skills: profile.skills.strong,
    }});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cv', upload.single('cv'), async (req, res) => {
  try {
    await mkdir(join(ROOT, 'cv'), { recursive: true });
    let text = '';
    let savedAs = 'resume.md';

    if (req.file) {
      const ext = extname(req.file.originalname || '').toLowerCase();
      if (ext === '.pdf') {
        const parsed = await pdfParse(req.file.buffer);
        text = parsed.text || '';
        savedAs = 'resume.txt';
      } else if (['.md', '.txt', '.tex', '.markdown'].includes(ext) || !ext) {
        text = req.file.buffer.toString('utf8');
        savedAs = ext === '.tex' ? 'resume.tex' : ext === '.txt' ? 'resume.txt' : 'resume.md';
      } else {
        return res.status(400).json({ error: 'Supported CV types: .pdf, .md, .txt, .tex' });
      }
    } else if (req.body?.text) {
      text = String(req.body.text);
      savedAs = 'resume.md';
    } else {
      return res.status(400).json({ error: 'Upload a file or paste CV text' });
    }

    text = text.replace(/\u0000/g, '').trim();
    if (text.length < 40) {
      return res.status(400).json({ error: 'CV text looks too short — paste more detail' });
    }

    // Prefer a single active CV file so build-evidence cannot pick a stale sibling.
    const { unlink } = await import('node:fs/promises');
    for (const name of ['resume.md', 'resume.txt', 'resume.tex']) {
      if (name === savedAs) continue;
      try { await unlink(join(ROOT, 'cv', name)); } catch { /* absent */ }
    }
    await writeFile(join(ROOT, 'cv', savedAs), `${text}\n`);
    res.json({ ok: true, savedAs, chars: text.length, preview: text.slice(0, 400) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scout', async (req, res) => {
  try {
    const body = req.body || {};
    if (body.market) {
      const market = String(body.market).toUpperCase();
      await loadMarket({ market });
      const config = await loadJson(join(ROOT, 'search-profile.json'), {});
      config.market = market;
      await writeFile(join(ROOT, 'search-profile.json'), `${JSON.stringify(config, null, 2)}\n`);
    }

    const existing = await loadJson(join(ROOT, 'profile.json'), {});
    const profile = buildProfile(body, existing);
    const hits = findPlaceholders({
      name: profile.name,
      targetRole: profile.targetRole,
      search: profile.search,
    });
    if (hits.length) {
      return res.status(400).json({ error: 'Fill name and target role before scouting', placeholders: hits });
    }
    await writeFile(join(ROOT, 'profile.json'), `${JSON.stringify(profile, null, 2)}\n`);

    const cvText = await readCvText();
    if (!cvText.trim()) {
      return res.status(400).json({ error: 'Upload or paste a CV first' });
    }

    const allowPaid = Boolean(body.allowPaid) && Boolean(process.env.APIFY_TOKEN);
    const marketId = body.market
      ? String(body.market).toUpperCase()
      : (await loadJson(join(ROOT, 'search-profile.json'), {})).market || 'AE';
    const marketMeta = await loadMarket({ market: marketId });
    const limit = Number(body.limit || 20);

    // Keep UI fetches snappy: default location + country name, Indeed+LinkedIn unless paid Bayt requested.
    const config = await loadJson(join(ROOT, 'search-profile.json'), {});
    const previousCities = config.cities;
    config.market = marketId;
    config.cities = [
      { where: marketMeta.defaultLocation, radiusKm: marketMeta.defaultRadiusKm ?? 50 },
      { where: marketMeta.name, radiusKm: 100 },
    ];
    await writeFile(join(ROOT, 'search-profile.json'), `${JSON.stringify(config, null, 2)}\n`);

    const fetchArgs = ['--market', marketId, '--boards', body.boards || 'indeed,linkedin'];
    if (allowPaid) {
      fetchArgs.length = 0;
      fetchArgs.push('--market', marketId, '--allow-paid');
    }

    try {
      await runNode(join(ROOT, 'scripts', 'build-evidence.mjs'));
      await runNode(join(ROOT, 'scripts', 'fetch-jobs.mjs'), fetchArgs);
    } finally {
      // Restore explicit city overrides if the user had any; otherwise clear back to market defaults.
      const cfg = await loadJson(join(ROOT, 'search-profile.json'), {});
      if (previousCities) cfg.cities = previousCities;
      else delete cfg.cities;
      cfg.market = marketId;
      await writeFile(join(ROOT, 'search-profile.json'), `${JSON.stringify(cfg, null, 2)}\n`);
    }

    const bundle = await loadJson(join(workspaceDir(), 'jobs.json'), { jobs: [] });
    const ranked = rankJobs(bundle.jobs || [], profile, cvText).slice(0, limit);
    const summary = summariseRanking(ranked);
    const meta = {
      market: bundle.market,
      marketId: bundle.marketId,
      marketName: bundle.marketName,
      candidate: profile.name,
      targetRole: profile.targetRole,
      generatedAt: new Date().toISOString(),
      strategy: bundle.strategy,
      fetched: bundle.fetched,
      sourceStatus: bundle.sourceStatus,
      dropped: bundle.dropped,
    };

    await mkdir(workspaceDir(), { recursive: true });
    const shortlist = { ...meta, summary, jobs: ranked };
    await writeFile(join(workspaceDir(), 'shortlist.json'), `${JSON.stringify(shortlist, null, 2)}\n`);

    res.json({
      ok: true,
      ...shortlist,
      note: 'Apply opens the employer posting in a new tab. Nothing is submitted for you.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/shortlist', async (_req, res) => {
  const shortlist = await loadJson(join(workspaceDir(), 'shortlist.json'), null);
  if (!shortlist) return res.status(404).json({ error: 'No shortlist yet — run a scout' });
  res.json(shortlist);
});

app.post('/api/decision', async (req, res) => {
  try {
    const { id, decision, note } = req.body || {};
    if (!id || !decision) return res.status(400).json({ error: 'id and decision required' });
    await runNode(join(ROOT, 'scripts', 'record-decision.mjs'), [
      '--id', String(id),
      '--decision', String(decision),
      '--note', String(note || ''),
    ]);
    res.json({ ok: true, id, decision });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (IS_PROD) {
  const dist = join(ROOT, 'ui', 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Job Scout API on http://localhost:${PORT}`);
  if (!IS_PROD) console.log('UI: run npm run dev (Vite proxies /api here)');
});
