/**
 * Overleaf CV mode: clone/pull → reorder sections/entries, then lightly
 * re-emphasise Experience bullets (current CV is source of truth) and
 * optionally enrich Projects from portfolio facts → commit/push → compile.
 *
 * Credentials: OVERLEAF_GIT_TOKEN + OVERLEAF_PROJECT_ID in .env
 * (never logged). Mirror of cv-tailor git workflow.
 */

import { mkdir, readFile, writeFile, copyFile, readdir, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { run, loadDotEnv, workspaceDir } from './common.mjs';
import { compileTexToPdf, htmlFileToPdf, countPdfPages } from './pdf.mjs';
import { overleafTexToHtml } from './tex-html.mjs';
import {
  emphasizeItemizeInBody,
  enrichProjectsBody,
  loadPortfolioFacts,
} from './tex-bullets.mjs';
import { applyNextFitPass, experienceItemCount } from './tex-fit.mjs';

loadDotEnv();

export function overleafDir() {
  return join(workspaceDir(), 'overleaf');
}

export function overleafConfigured() {
  loadDotEnv();
  const token = process.env.OVERLEAF_GIT_TOKEN || '';
  const id = process.env.OVERLEAF_PROJECT_ID || '';
  return Boolean(token.trim() && id.trim());
}

export function overleafStatus() {
  const configured = overleafConfigured();
  return {
    configured,
    projectIdSet: Boolean((process.env.OVERLEAF_PROJECT_ID || '').trim()),
    tokenSet: Boolean((process.env.OVERLEAF_GIT_TOKEN || '').trim()),
    localClone: existsSync(join(overleafDir(), '.git')),
    hint: configured
      ? 'Overleaf credentials found in .env'
      : 'Set OVERLEAF_GIT_TOKEN and OVERLEAF_PROJECT_ID in .env (Menu → Sync → Git on Overleaf)',
  };
}

function gitUrl() {
  const token = process.env.OVERLEAF_GIT_TOKEN.trim();
  const id = process.env.OVERLEAF_PROJECT_ID.trim();
  return `https://git:${token}@git.overleaf.com/${id}`;
}

export async function syncOverleaf() {
  if (!overleafConfigured()) {
    throw new Error(
      'Overleaf not configured. Add OVERLEAF_GIT_TOKEN and OVERLEAF_PROJECT_ID to .env',
    );
  }
  const dest = overleafDir();
  await mkdir(workspaceDir(), { recursive: true });
  if (existsSync(join(dest, '.git'))) {
    try {
      await run('git', ['-C', dest, 'pull', '--rebase', '--autostash'], { timeout: 120000 });
    } catch {
      // Dirty tree from a prior failed run — stash, pull, keep going
      try {
        await run('git', ['-C', dest, 'stash', 'push', '-u', '-m', 'job-scout-sync'], {
          timeout: 30000,
        });
      } catch {
        /* ignore */
      }
      await run('git', ['-C', dest, 'pull', '--rebase'], { timeout: 120000 });
    }
    return { dest, action: 'pulled' };
  }
  if (existsSync(dest)) {
    // Incomplete dir — remove is dangerous; try clone into temp name
    throw new Error(
      `.workspace/overleaf exists but is not a git repo. Delete it and retry.`,
    );
  }
  await run('git', ['clone', '--depth', '1', gitUrl(), dest], { timeout: 180000 });
  return { dest, action: 'cloned' };
}

async function listTexFiles(dir) {
  const names = await readdir(dir);
  return names.filter((n) => n.endsWith('.tex'));
}

function words(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]/i)
    .filter((w) => w.length >= 3);
}

function scoreText(text, keywords) {
  const set = new Set(words(text));
  let n = 0;
  for (const k of keywords) if (set.has(k)) n += 1;
  return n;
}

/** Higher = more recent. Prefer \cventry / \role first date arg (MM/YYYY or Present). */
function experienceDateKey(entry) {
  const m = String(entry || '').match(
    /\\(?:cventry|role)\s*\{([^}]*)\}/i,
  );
  const raw = (m?.[1] || '').toLowerCase();
  if (/present|current|heute/.test(raw)) return 999999;
  const ym = raw.match(/(\d{2})\/(\d{4})/g);
  if (!ym?.length) return 0;
  const last = ym[ym.length - 1];
  const [mm, yyyy] = last.split('/').map(Number);
  return yyyy * 100 + mm;
}

/** Read `{...}` starting at openIdx. Returns { arg, end } or null. */
function readBraceGroup(src, openIdx) {
  if (src[openIdx] !== '{') return null;
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { arg: src.slice(openIdx + 1, i), end: i + 1 };
    }
  }
  return null;
}

function plainSectionTitle(rawTitle) {
  return String(rawTitle || '')
    .replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/gi, '$1')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sectionCanonicalKey(title) {
  const t = plainSectionTitle(title).toLowerCase();
  if (/\beducation\b/.test(t)) return 'education';
  if (/\bprojects?\b/.test(t)) return 'projects';
  if (/\bskills?\b/.test(t)) return 'skills';
  if (/\b(experience|employment|work experience)\b/.test(t)) return 'experience';
  return null;
}

/**
 * Split document body into preamble + \section blocks (handles \section{\href{...}{Projects}}).
 */
function splitDocumentSections(tex) {
  const docMatch = tex.match(/(\\begin\{document\})([\s\S]*?)(\\end\{document\})/i);
  if (!docMatch) return null;
  const before = tex.slice(0, docMatch.index);
  const begin = docMatch[1];
  const body = docMatch[2];
  const end = docMatch[3];
  const after = tex.slice(docMatch.index + docMatch[0].length);

  const starts = [];
  const re = /\\section\*?\{/g;
  let m;
  while ((m = re.exec(body))) starts.push(m.index);
  if (!starts.length) {
    return { before, begin, preamble: body, sections: [], end, after };
  }

  const preamble = body.slice(0, starts[0]);
  const sections = [];
  for (let s = 0; s < starts.length; s += 1) {
    const openBrace = body.indexOf('{', starts[s]);
    const titleG = readBraceGroup(body, openBrace);
    if (!titleG) continue;
    const headerEnd = titleG.end;
    // keep trailing junk on the \section line (rare)
    let lineEnd = body.indexOf('\n', headerEnd);
    if (lineEnd < 0) lineEnd = headerEnd;
    else lineEnd += 1;
    const bodyEnd = s + 1 < starts.length ? starts[s + 1] : body.length;
    const header = body.slice(starts[s], lineEnd);
    const secBody = body.slice(lineEnd, bodyEnd);
    sections.push({
      header,
      body: secBody,
      titleRaw: titleG.arg,
      key: sectionCanonicalKey(titleG.arg),
    });
  }
  return { before, begin, preamble, sections, end, after };
}

function joinDocumentSections(parts) {
  const body = parts.preamble + parts.sections.map((s) => s.header + s.body).join('');
  return parts.before + parts.begin + body + parts.end + parts.after;
}

/** Hard rule (cv-tailor): Experience → Education → Projects → Skills — both main and ats. */
const CV_SECTION_ORDER = ['experience', 'education', 'projects', 'skills'];

/**
 * Reorder top-level \section blocks. `order` is a list of canonical keys.
 */
function reorderTopLevelSections(tex, order = CV_SECTION_ORDER) {
  const parts = splitDocumentSections(tex);
  if (!parts || parts.sections.length < 2) return { tex, changed: false };

  const byKey = new Map();
  const unknown = [];
  for (const sec of parts.sections) {
    if (sec.key && order.includes(sec.key) && !byKey.has(sec.key)) byKey.set(sec.key, sec);
    else unknown.push(sec);
  }
  const next = [];
  for (const k of order) {
    if (byKey.has(k)) next.push(byKey.get(k));
  }
  // Keep unknowns after Skills if present, else at end
  const skillsIdx = next.findIndex((s) => s.key === 'skills');
  if (skillsIdx >= 0) next.splice(skillsIdx + 1, 0, ...unknown);
  else next.push(...unknown);

  const same =
    next.length === parts.sections.length
    && next.every((s, i) => s === parts.sections[i]);
  if (same) return { tex, changed: false };
  return { tex: joinDocumentSections({ ...parts, sections: next }), changed: true };
}

/**
 * Reorder entry blocks inside Projects / Experience.
 * Matches section titles that wrap the name (e.g. \section{\href{...}{Projects}}).
 * Supports \cventry, \cvitem, \resumeSubheading, % BEGIN PROJECT.
 */
function reorderSection(tex, sectionKeys, keywords) {
  const keys = new Set(sectionKeys.map((k) => k.toLowerCase()));
  const parts = splitDocumentSections(tex);
  if (!parts) return { tex, changed: false };
  const idx = parts.sections.findIndex((s) => s.key && keys.has(s.key));
  if (idx < 0) return { tex, changed: false };

  const sec = parts.sections[idx];
  // Keep leading comments / spacing; only rank real entry blocks
  const entryStart = Math.min(
    ...['\\\\cventry\\s*\\{', '\\\\cvitem\\s*\\{', '\\\\role\\s*\\{', '\\\\resumeSubheading']
      .map((p) => {
        const m = sec.body.search(new RegExp(p));
        return m < 0 ? Infinity : m;
      }),
  );
  const prefix = Number.isFinite(entryStart) && entryStart > 0 ? sec.body.slice(0, entryStart) : '';
  const entryBody = prefix ? sec.body.slice(prefix.length) : sec.body;
  const entries = splitEntries(entryBody);
  if (entries.length < 2) return { tex, changed: false };

  // Experience: keep reverse-chronological (Present / later dates first), then keyword score
  const isExperience = keys.has('experience');
  const ranked = entries
    .map((e, i) => ({ e, score: scoreText(e, keywords), i, dateKey: experienceDateKey(e) }))
    .sort((a, b) => {
      if (isExperience && a.dateKey !== b.dateKey) return b.dateKey - a.dateKey;
      return b.score - a.score || a.i - b.i;
    });
  const newBody = prefix + ranked.map((r) => r.e).join('');
  if (newBody === sec.body) return { tex, changed: false };

  const nextSections = parts.sections.slice();
  nextSections[idx] = { ...sec, body: newBody };
  return { tex: joinDocumentSections({ ...parts, sections: nextSections }), changed: true };
}

function splitEntries(body) {
  // Prefer explicit markers
  if (/%\s*BEGIN PROJECT/i.test(body)) {
    const parts = body.split(/(?=%\s*BEGIN PROJECT)/i).filter((p) => p.trim());
    if (parts.length >= 2) return parts;
  }
  // moderncv \cventry
  if (/\\cventry\s*\{/.test(body)) {
    const parts = body.split(/(?=\\cventry\s*\{)/).filter((p) => p.trim());
    if (parts.length >= 2) return parts;
  }
  // moderncv project / skill lines
  if (/\\cvitem\s*\{/.test(body)) {
    const parts = body.split(/(?=\\cvitem\s*\{)/).filter((p) => p.trim());
    if (parts.length >= 2) return parts;
  }
  // Jake's resume style
  if (/\\resumeSubheading/.test(body)) {
    const parts = body.split(/(?=\\resumeSubheading)/).filter((p) => p.trim());
    if (parts.length >= 2) return parts;
  }
  // ATS \role
  if (/\\role\s*\{/.test(body)) {
    const parts = body.split(/(?=\\role\s*\{)/).filter((p) => p.trim());
    if (parts.length >= 2) return parts;
  }
  // Blank-line separated blocks
  const blocks = body.split(/\n(?=\n)/).filter((p) => p.trim());
  if (blocks.length >= 2) return blocks;
  return [body];
}

/**
 * Reorder a flat skills line only. Never touch \textbf{Category:} lines — those
 * broke previously and corrupted Overleaf.
 */
function reorderSkills(tex, keywords) {
  const parts = splitDocumentSections(tex);
  if (!parts) return { tex, changed: false };
  const idx = parts.sections.findIndex((s) => s.key === 'skills');
  if (idx < 0) return { tex, changed: false };
  const sec = parts.sections[idx];
  const body = sec.body;
  // Structured category CVs (ats \textbf{…} or moderncv \cvitem) — leave untouched
  if (/\\textbf\{/.test(body) || /\\cvitem\s*\{/.test(body)) {
    return { tex, changed: false };
  }

  const lines = body.split('\n');
  let changed = false;
  const nextLines = lines.map((line) => {
    if (!/[·|,]/.test(line) || line.length < 12) return line;
    if (/\\/.test(line)) return line;
    const sep = line.includes('·') ? ' · ' : ', ';
    const skillParts = line.split(/\s*[·|,]\s*/).map((s) => s.trim()).filter(Boolean);
    if (skillParts.length < 3) return line;
    const ranked = [...skillParts].sort(
      (a, b) => scoreText(b, keywords) - scoreText(a, keywords) || a.localeCompare(b),
    );
    const joined = ranked.join(sep);
    if (joined === skillParts.join(sep)) return line;
    changed = true;
    return joined;
  });
  if (!changed) return { tex, changed: false };
  const nextSections = parts.sections.slice();
  nextSections[idx] = { ...sec, body: `${nextLines.join('\n')}` };
  return { tex: joinDocumentSections({ ...parts, sections: nextSections }), changed: true };
}

function skillsLookCorrupted(tex) {
  const m = tex.match(/\\section\*?\{Skills\}([\s\S]*?)(?=\\section\*?\{|\\end\{document\})/i);
  if (!m) return false;
  const body = m[1];
  // Hallmarks of bad skill reorders (ats \textbf and moderncv \cvitem)
  if (/JavaScript \(React\), Programming:/.test(body)) return true;
  if (/Kotlin\}\s*Python/.test(body)) return true;
  if (/\\cvitem\{[^}]*\}\{\s*cvitem\{/.test(body)) return true;
  if (/\\cvitem\{Programming:[^}]*\}\{[^}]*\\cvitem/.test(body)) return true;
  const opens = (body.match(/\{/g) || []).length;
  const closes = (body.match(/\}/g) || []).length;
  return opens !== closes;
}

function extractSkillsBlock(tex) {
  return tex.match(
    /(\\section\*?\{Skills\}[\s\S]*?)(?=\\section\*?\{|\\end\{document\})/i,
  );
}

/** Restore Skills from an older git commit that is not corrupted. */
async function repairSkillsIfNeeded(dir, filename) {
  const path = join(dir, filename);
  let tex = await readFile(path, 'utf8');
  if (!skillsLookCorrupted(tex)) return false;
  const curSkills = extractSkillsBlock(tex);
  if (!curSkills) return false;
  try {
    const { stdout: log } = await run('git', [
      '-C',
      dir,
      'log',
      '--pretty=format:%H',
      '-20',
      '--',
      filename,
    ]);
    const shas = String(log || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sha of shas) {
      try {
        const { stdout: old } = await run('git', ['-C', dir, 'show', `${sha}:${filename}`]);
        if (skillsLookCorrupted(String(old))) continue;
        const oldSkills = extractSkillsBlock(String(old));
        if (!oldSkills) continue;
        tex = tex.replace(curSkills[1], oldSkills[1]);
        await writeFile(path, tex);
        return true;
      } catch {
        /* try older */
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

function instructionKeywords(extraInstructions) {
  return words(String(extraInstructions || '').slice(0, 500));
}

function stampComments(jobTitle, company, extraInstructions) {
  const day = new Date().toISOString().slice(0, 10);
  let stamp = `% job-scout tailored for ${jobTitle} @ ${company} · ${day}\n`;
  const instr = String(extraInstructions || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  if (instr) {
    stamp += `% job-scout instructions: ${instr.replace(/%/g, '')}\n`;
  }
  return stamp;
}

/**
 * Experience: reorder/re-emphasise existing bullets only.
 * Projects: same, plus at most one portfolio tag the posting already names.
 */
function emphasizeAndEnrich(tex, keywords, projects) {
  const parts = splitDocumentSections(tex);
  if (!parts) return { tex, changed: false };
  let changed = false;
  const next = parts.sections.map((sec) => {
    if (sec.key === 'experience') {
      const r = emphasizeItemizeInBody(sec.body, keywords);
      if (r.changed) changed = true;
      return { ...sec, body: r.body };
    }
    if (sec.key === 'projects') {
      const r1 = emphasizeItemizeInBody(sec.body, keywords);
      const r2 = enrichProjectsBody(r1.body, keywords, projects);
      if (r1.changed || r2.changed) changed = true;
      return { ...sec, body: r2.body };
    }
    return sec;
  });
  if (!changed) return { tex, changed: false };
  return { tex: joinDocumentSections({ ...parts, sections: next }), changed: true };
}

/**
 * Edit ats.tex + main.tex (or any .tex).
 * Reorder sections/entries, then lightly re-emphasise Experience bullets
 * (current CV is source of truth). Never invent facts.
 */
export async function tailorOverleafTex(
  keywords,
  { jobTitle = '', company = '', extraInstructions = '', portfolio = null } = {},
) {
  const dir = overleafDir();
  const texFiles = await listTexFiles(dir);
  const preferred = ['ats.tex', 'main.tex', 'cv.tex', 'resume.tex'];
  const targets = [
    ...preferred.filter((n) => texFiles.includes(n)),
    ...texFiles.filter((n) => !preferred.includes(n)),
  ];
  if (!targets.length) {
    throw new Error('No .tex files in Overleaf clone');
  }

  const repaired = [];
  for (const name of targets.slice(0, 4)) {
    if (await repairSkillsIfNeeded(dir, name)) repaired.push(name);
  }

  const facts = portfolio || (await loadPortfolioFacts());
  const kw = [...new Set([...keywords, ...instructionKeywords(extraInstructions)])];
  const edited = [...repaired];
  for (const name of targets.slice(0, 4)) {
    const path = join(dir, name);
    let tex = await readFile(path, 'utf8');
    const before = tex;
    // 1) Experience always first (cv-tailor hard rule — main + ats)
    let r = reorderTopLevelSections(tex, CV_SECTION_ORDER);
    tex = r.tex;
    // 2) Best-fit entries first inside Projects / Experience
    r = reorderSection(tex, ['projects'], kw);
    tex = r.tex;
    r = reorderSection(tex, ['experience'], kw);
    tex = r.tex;
    r = reorderSkills(tex, kw);
    tex = r.tex;
    // 3) Light-touch Experience (and Projects) bullets — keep current text
    r = emphasizeAndEnrich(tex, kw, facts.projects || []);
    tex = r.tex;
    const stamp = stampComments(jobTitle, company, extraInstructions);
    const needsStamp =
      tex !== before
      || (extraInstructions && !/% job-scout instructions:/.test(tex.slice(0, 400)));
    if (needsStamp) {
      tex = tex
        .replace(/^% job-scout tailored[^\n]*\n/, '')
        .replace(/^% job-scout instructions:[^\n]*\n/, '');
      tex = stamp + tex;
      await writeFile(path, tex);
      if (!edited.includes(name)) edited.push(name);
    }
  }
  return { edited, repaired, targets };
}

async function pageCountForTex(dir, texName) {
  const texPath = join(dir, texName);
  if (!existsSync(texPath)) return { pages: null, error: `${texName} not found` };
  const outDir = join(dir, '.cv-build');
  await mkdir(outDir, { recursive: true });
  const compiled = await compileTexToPdf(texPath, outDir);
  if (!compiled.ok) return { pages: null, error: compiled.error };
  const pages = await countPdfPages(compiled.path);
  return { pages, path: compiled.path, via: compiled.via };
}

async function fitOneTexToOnePage(dir, name) {
  const path = join(dir, name);
  let tex = await readFile(path, 'utf8');
  const expBefore = experienceItemCount(tex);
  const applied = [];
  let last = await pageCountForTex(dir, name);
  if (last.pages == null) {
    return { ok: false, skipped: true, reason: last.error, pages: null, applied };
  }
  if (last.pages === 1) {
    return { ok: true, pages: 1, applied: [], already: true };
  }

  while (last.pages > 1) {
    const next = applyNextFitPass(tex, applied);
    if (!next.changed) break;
    if (experienceItemCount(next.tex) < expBefore) {
      break;
    }
    tex = next.tex;
    applied.push(next.pass);
    await writeFile(path, tex);
    last = await pageCountForTex(dir, name);
    if (last.pages == null) {
      return { ok: false, skipped: true, reason: last.error, pages: null, applied };
    }
  }

  return {
    ok: last.pages === 1,
    pages: last.pages,
    applied,
    overflow: last.pages > 1,
  };
}

/**
 * Compile-check main.tex and ats.tex. If either is over one page, squeeze
 * spacing/typography/filler wording (never drop Experience bullets).
 */
export async function fitOverleafCvsToOnePage() {
  const dir = overleafDir();
  const files = await listTexFiles(dir);
  const targets = ['ats.tex', 'main.tex'].filter((n) => files.includes(n));
  const perFile = {};
  for (const name of targets) {
    perFile[name] = await fitOneTexToOnePage(dir, name);
  }
  const pages = Object.fromEntries(
    Object.entries(perFile).map(([k, v]) => [k, v.pages]),
  );
  const ok = targets.length > 0 && targets.every((n) => perFile[n]?.pages === 1);
  return { ok, files: perFile, pages, targets };
}

async function cleanOverleafArtifacts(dir) {
  await rm(join(dir, '.cv-build'), { recursive: true, force: true });
  for (const n of ['main.pdf', 'ats.pdf', 'cv.pdf', 'resume.pdf']) {
    try {
      await unlink(join(dir, n));
    } catch {
      /* missing is fine */
    }
  }
}

export async function readOverleafAts() {
  const dir = overleafDir();
  for (const name of ['ats.tex', 'main.tex', 'cv.tex', 'resume.tex']) {
    try {
      return { name, text: await readFile(join(dir, name), 'utf8') };
    } catch {
      /* next */
    }
  }
  return null;
}

export async function pushOverleaf(message) {
  const dir = overleafDir();
  await cleanOverleafArtifacts(dir);
  const { stdout: status } = await run('git', ['-C', dir, 'status', '--porcelain']);
  if (!String(status || '').trim()) {
    return { pushed: false, reason: 'no changes' };
  }
  await run('git', ['-C', dir, 'add', '-A']);
  await run('git', [
    '-C',
    dir,
    'commit',
    '-m',
    message || 'Tailor CV via Job Scout',
  ]);
  await run('git', ['-C', dir, 'push'], { timeout: 120000 });
  return { pushed: true };
}

/**
 * Compile one named .tex into destPdf.
 */
export async function compileOverleafTex(texName, destPdf) {
  const dir = overleafDir();
  const texPath = join(dir, texName);
  if (!existsSync(texPath)) {
    return { ok: false, error: `${texName} not found`, source: texName };
  }
  const result = await compileTexToPdf(texPath, dir);
  if (!result.ok) return { ...result, source: texName };
  await mkdir(dirname(destPdf), { recursive: true });
  await copyFile(result.path, destPdf);
  const pages = await countPdfPages(destPdf);
  return { ok: true, path: destPdf, via: result.via, source: texName, pages };
}

/** When LaTeX fails (e.g. moderncv + tectonic on Windows), print tex→HTML→PDF. */
async function compileTexViaHtmlFallback(texName, destPdf, prepDir) {
  try {
    // Repair corrupted Skills before rendering (main.tex often still broken from older runs)
    await repairSkillsIfNeeded(overleafDir(), texName);
    const texPath = join(overleafDir(), texName);
    const tex = await readFile(texPath, 'utf8');
    const html = overleafTexToHtml(tex, {
      jobTitle: texName.replace(/\.tex$/i, ''),
      company: 'Overleaf',
      photoPath: texPath,
    });
    const htmlPath = join(prepDir, `${texName.replace(/\.tex$/i, '')}.print.html`);
    await writeFile(htmlPath, html);
    const printed = await htmlFileToPdf(htmlPath, destPdf);
    if (!printed.ok) return { ok: false, error: printed.error, source: texName };
    // Sanity: empty / tiny PDF means the HTML converter failed
    const { stat } = await import('node:fs/promises');
    const size = (await stat(destPdf)).size;
    if (size < 4000) {
      return {
        ok: false,
        error: `HTML fallback PDF too small (${size} bytes) — converter likely missed content`,
        source: texName,
      };
    }
    return { ok: true, path: destPdf, via: `html-fallback:${printed.via}`, source: texName, bytes: size };
  } catch (err) {
    return { ok: false, error: err.message || String(err), source: texName };
  }
}

/**
 * Compile ats.tex and/or main.tex into prep dir as cv-ats.pdf / cv-main.pdf.
 * Also writes cv.pdf as alias of ATS (else Main).
 */
export async function compileOverleafPdfs(prepDir) {
  const dir = overleafDir();
  const files = await listTexFiles(dir);
  await mkdir(prepDir, { recursive: true });
  const results = { ats: null, main: null, alias: null };

  async function compileOne(texName, destName) {
    let result = await compileOverleafTex(texName, join(prepDir, destName));
    if (!result.ok) {
      result = await compileTexViaHtmlFallback(texName, join(prepDir, destName), prepDir);
    }
    return result;
  }

  if (files.includes('ats.tex')) {
    results.ats = await compileOne('ats.tex', 'cv-ats.pdf');
  }
  if (files.includes('main.tex')) {
    results.main = await compileOne('main.tex', 'cv-main.pdf');
  }

  // Fallback single-file projects
  if (!results.ats && !results.main) {
    const order = ['cv.tex', 'resume.tex'];
    const tex = order.find((n) => files.includes(n)) || files[0];
    if (tex) {
      results.ats = await compileOne(tex, 'cv-ats.pdf');
    }
  }

  const aliasSrc = results.ats?.ok
    ? join(prepDir, 'cv-ats.pdf')
    : results.main?.ok
      ? join(prepDir, 'cv-main.pdf')
      : null;
  if (aliasSrc) {
    await copyFile(aliasSrc, join(prepDir, 'cv.pdf'));
    results.alias = 'cv.pdf';
  }

  const ok = Boolean(results.ats?.ok || results.main?.ok);
  const viaParts = [results.ats?.ok && results.ats.via, results.main?.ok && results.main.via].filter(Boolean);
  const via = viaParts.join(' + ') || null;
  const error = ok
    ? null
    : [results.ats?.error, results.main?.error].filter(Boolean).join(' | ') || 'No PDF compiled';
  const pages = {
    ats: results.ats?.pages ?? null,
    main: results.main?.pages ?? null,
  };

  return {
    ok,
    via,
    error,
    hasAts: Boolean(results.ats?.ok),
    hasMain: Boolean(results.main?.ok),
    ats: results.ats,
    main: results.main,
    alias: results.alias,
    pages,
  };
}

/** @deprecated use compileOverleafPdfs */
export async function compileOverleafPdf(destPdf) {
  const dir = dirname(destPdf);
  const compiled = await compileOverleafPdfs(dir);
  if (!compiled.ok) return { ok: false, error: compiled.error };
  return {
    ok: true,
    path: destPdf,
    via: compiled.via,
    source: compiled.hasAts ? 'ats.tex' : 'main.tex',
  };
}

/**
 * Full Overleaf tailor pipeline for one job.
 * @param {{ push?: boolean, keywords: string[], job: object, prepDir: string, extraInstructions?: string }} opts
 */
export async function runOverleafTailor({
  push = true,
  keywords,
  job,
  prepDir,
  extraInstructions = '',
  portfolio = null,
}) {
  const sync = await syncOverleaf();
  const tailor = await tailorOverleafTex(keywords, {
    jobTitle: job.title,
    company: job.company,
    extraInstructions,
    portfolio,
  });
  const fit = await fitOverleafCvsToOnePage();
  let pushResult = { pushed: false, reason: 'skipped' };
  if (push) {
    pushResult = await pushOverleaf(
      `Tailor CV for ${job.title || 'role'} @ ${job.company || 'company'}`,
    );
  }
  const pdf = await compileOverleafPdfs(prepDir);
  return {
    sync,
    tailor,
    fit,
    push: pushResult,
    pdf,
    overleafDir: overleafDir(),
    extraInstructions: String(extraInstructions || '').trim() || null,
  };
}

/**
 * After a Cursor agent edited Overleaf: sync (optional push leftover), compile PDFs.
 * Does not run keyword reorder — the agent already tailored the .tex.
 */
export async function assembleOverleafAfterAgent({
  push = false,
  job,
  prepDir,
}) {
  const sync = await syncOverleaf();
  const fit = await fitOverleafCvsToOnePage();
  let pushResult = { pushed: false, reason: 'agent handled edits' };
  if (push) {
    pushResult = await pushOverleaf(
      `Tailor CV for ${job.title || 'role'} @ ${job.company || 'company'} (agent)`,
    );
  }
  const pdf = await compileOverleafPdfs(prepDir);
  return {
    sync,
    tailor: { edited: ['agent'], changed: true },
    fit,
    push: pushResult,
    pdf,
    overleafDir: overleafDir(),
    via: 'agent',
  };
}
