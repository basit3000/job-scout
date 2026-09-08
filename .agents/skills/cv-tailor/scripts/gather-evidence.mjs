#!/usr/bin/env node
// Collects CV evidence and writes it to <out-dir>/evidence.{json,md}:
//   - the candidate's portfolio repo (projects, certifications, profile, blog posts
//     with their full text — the blog is usually the richest account of what a
//     project actually does)
//   - the public GitHub account (repos, languages, commit activity)
//   - optionally a Job Scout profile.json (employment, skills, constraints)
//
// Every fact carries a confidence label so the CV writer can tell the
// difference between "GitHub says this" and "the portfolio copy claims this".
//
// Usage:
//   node .agents/skills/cv-tailor/scripts/gather-evidence.mjs [--username <login>] [--no-github]
//     [--portfolio-root /path/to/portfolio] [--out-dir .cv-workspace] [--profile profile.json]
//
// Portfolio root resolution: --portfolio-root, then PORTFOLIO_ROOT, then the current git
// root if it has src/data/projects.js, then a sibling ./portfolio directory.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const USERNAME =
  value('--username', null) ||
  process.env.GITHUB_USERNAME ||
  process.env.GH_USERNAME ||
  '';
if (!USERNAME && !flag('--no-github')) {
  console.error(
    'Pass --username <github-login>, set GITHUB_USERNAME, or use --no-github.',
  );
  process.exit(1);
}
const USE_GITHUB = !flag('--no-github');
const PORTFOLIO_ROOT_ARG = value('--portfolio-root', process.env.PORTFOLIO_ROOT || '');
const OUT_DIR_ARG = value('--out-dir', '');
const PROFILE_ARG = value('--profile', '');
const RECENT_REPO_COUNT = 6;
const COMMIT_SAMPLE = 8;
const YEARS_BACK = 4;
const BLOG_BODY_MAX = 6000;

const warnings = [];

async function gitRoot() {
  try {
    const { stdout } = await run('git', ['rev-parse', '--show-toplevel']);
    return stdout.trim();
  } catch {
    return process.cwd();
  }
}

function looksLikePortfolio(root) {
  return Boolean(root) && existsSync(join(root, 'src', 'data', 'projects.js'));
}

async function resolvePortfolioRoot(repo) {
  if (PORTFOLIO_ROOT_ARG) {
    const abs = resolve(PORTFOLIO_ROOT_ARG);
    if (!looksLikePortfolio(abs)) {
      warnings.push(`Portfolio root ${abs} has no src/data/projects.js — portfolio sections will be thin.`);
    }
    return abs;
  }
  if (looksLikePortfolio(repo)) return repo;
  const sibling = join(dirname(repo), 'portfolio');
  if (looksLikePortfolio(sibling)) return sibling;
  warnings.push(
    'No portfolio found (no src/data/projects.js here, no PORTFOLIO_ROOT, no ../portfolio). '
    + 'Portfolio projects, certifications, and blog narratives are missing from this pack.',
  );
  return repo;
}

// gh returns non-zero for 404s and empty repos; callers decide what that means.
async function gh(endpoint, { cache = '1h' } = {}) {
  const ghArgs = ['api', endpoint];
  if (cache) ghArgs.push('--cache', cache);
  const { stdout } = await run('gh', ghArgs, { maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function ghSafe(endpoint, fallback, label) {
  try {
    return await gh(endpoint);
  } catch (err) {
    warnings.push(`GitHub request failed (${label}): ${String(err.stderr || err.message).trim().split('\n')[0]}`);
    return fallback;
  }
}

async function importModule(root, rel, { quiet = false } = {}) {
  const file = join(root, rel);
  if (!existsSync(file)) {
    if (!quiet) warnings.push(`Missing ${rel} under ${root}`);
    return null;
  }
  try {
    return await import(pathToFileURL(file).href);
  } catch (err) {
    if (!quiet) warnings.push(`Could not import ${rel}: ${String(err.message).split('\n')[0]}`);
    return null;
  }
}

/** Minimal front-matter parser: `--- key: value ---` then body. */
function parseFrontMatter(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text.trim() };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    meta[kv[1]] = v;
  }
  return { meta, body: m[2].trim() };
}

/** Strip markdown syntax so the evidence reads as plain prose. */
function markdownToProse(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function collectBlogPosts(root) {
  // 1) A plain data module (works when the site does not use bundler-only globs).
  for (const rel of ['src/data/blogPosts.js', 'src/pages/blogPosts.js']) {
    const mod = await importModule(root, rel, { quiet: true });
    const posts = mod?.posts;
    if (Array.isArray(posts) && posts.length) {
      return posts.map((p) => ({
        title: p.title,
        date: p.date,
        category: p.category,
        excerpt: p.excerpt,
        link: p.link ?? null,
        slug: p.slug ?? null,
        body: markdownToProse(p.content || p.body || '').slice(0, BLOG_BODY_MAX),
      }));
    }
  }
  // 2) Markdown files with front matter (Vite `import.meta.glob` sites end up here).
  for (const rel of ['src/content/blog', 'content/blog', 'src/posts', 'posts', 'blog']) {
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    let files;
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
    } catch {
      continue;
    }
    if (!files.length) continue;
    const posts = [];
    for (const f of files) {
      const raw = await readFile(join(dir, f), 'utf8');
      const { meta, body } = parseFrontMatter(raw);
      posts.push({
        title: meta.title || basename(f, '.md'),
        date: meta.date || null,
        category: meta.category || null,
        excerpt: meta.excerpt || null,
        link: meta.link || null,
        slug: basename(f).replace(/\.mdx?$/, ''),
        body: markdownToProse(body).slice(0, BLOG_BODY_MAX),
      });
    }
    posts.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return posts;
  }
  warnings.push('No blog posts found (looked for src/data/blogPosts.js and src/content/blog/*.md).');
  return [];
}

async function collectPortfolio(root) {
  const projectsMod = await importModule(root, 'src/data/projects.js');
  const certsMod = await importModule(root, 'src/data/certifications.js');
  const profileMod = await importModule(root, 'src/data/profile.js');
  const blogPosts = await collectBlogPosts(root);

  return {
    root,
    profile: profileMod?.profile ?? null,
    roles: profileMod?.roles ?? [],
    contact: profileMod?.connectLinks ?? [],
    techStack: projectsMod?.techStack ?? [],
    projects: (projectsMod?.projects ?? []).map((p) => ({
      title: p.title,
      description: p.description,
      tags: p.tags ?? [],
      link: p.link ?? null,
      note: p.note ?? null,
    })),
    certifications: certsMod?.certifications ?? [],
    blogPosts,
  };
}

async function collectProfile(path) {
  if (!path) return null;
  const abs = resolve(path);
  if (!existsSync(abs)) {
    warnings.push(`Profile ${abs} not found — skipped.`);
    return null;
  }
  try {
    return JSON.parse(await readFile(abs, 'utf8'));
  } catch (err) {
    warnings.push(`Profile ${abs} unreadable: ${String(err.message).split('\n')[0]}`);
    return null;
  }
}

async function collectGitHub() {
  const repos = await ghSafe(
    `users/${USERNAME}/repos?per_page=100&sort=pushed`,
    [],
    'repo list',
  );

  const owned = repos
    .filter((r) => !r.fork && !r.archived)
    .map((r) => ({
      name: r.name,
      description: r.description,
      url: r.html_url,
      primaryLanguage: r.language,
      topics: r.topics ?? [],
      stars: r.stargazers_count,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
      sizeKb: r.size,
    }));

  // Language bytes across every non-fork repo, aggregated into a ranked list.
  const languageBytes = {};
  for (const repo of owned) {
    const langs = await ghSafe(`repos/${USERNAME}/${repo.name}/languages`, {}, `${repo.name} languages`);
    repo.languages = langs;
    for (const [lang, bytes] of Object.entries(langs)) {
      languageBytes[lang] = (languageBytes[lang] ?? 0) + bytes;
    }
  }
  const totalBytes = Object.values(languageBytes).reduce((a, b) => a + b, 0) || 1;
  const languageRanking = Object.entries(languageBytes)
    .sort((a, b) => b[1] - a[1])
    .map(([language, bytes]) => ({
      language,
      bytes,
      share: `${((bytes / totalBytes) * 100).toFixed(1)}%`,
    }));

  // Recent commit messages show what the work actually was, not just that it happened.
  const recentWork = [];
  for (const repo of owned.slice(0, RECENT_REPO_COUNT)) {
    const commits = await ghSafe(
      `repos/${USERNAME}/${repo.name}/commits?per_page=${COMMIT_SAMPLE}`,
      [],
      `${repo.name} commits`,
    );
    if (!Array.isArray(commits) || commits.length === 0) continue;
    recentWork.push({
      repo: repo.name,
      url: repo.url,
      commits: commits.map((c) => ({
        message: c.commit?.message?.split('\n')[0] ?? '',
        date: c.commit?.author?.date ?? null,
      })),
    });
  }

  const totalCommits = (await ghSafe(
    `search/commits?q=author:${USERNAME}&per_page=1`,
    { total_count: null },
    'commit total',
  )).total_count;

  const thisYear = new Date().getFullYear();
  const commitsByYear = {};
  for (let y = thisYear; y > thisYear - YEARS_BACK; y--) {
    const res = await ghSafe(
      `search/commits?q=author:${USERNAME}+author-date:${y}-01-01..${y}-12-31&per_page=1`,
      { total_count: null },
      `commits ${y}`,
    );
    commitsByYear[y] = res.total_count;
  }

  return { username: USERNAME, repos: owned, languageRanking, recentWork, totalCommits, commitsByYear };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Surfaces things worth putting on a CV that the portfolio hasn't caught up with,
// and portfolio claims that have no public repo to back them.
function crossReference(portfolio, github) {
  if (!github) return null;

  const linkedRepoNames = new Set(
    portfolio.projects
      .map((p) => p.link)
      .filter((l) => l && l.includes('github.com/'))
      .map((l) => l.split('github.com/')[1].split('/')[1])
      .filter(Boolean)
      .map((n) => n.toLowerCase()),
  );

  const titleWords = portfolio.projects.map((p) => norm(p.title));
  const onPortfolio = (repoName) => {
    const normalized = norm(repoName);
    return linkedRepoNames.has(repoName.toLowerCase()) || titleWords.some((t) => t === normalized);
  };

  return {
    reposMissingFromPortfolio: github.repos
      .filter((r) => !onPortfolio(r.name))
      .map((r) => ({ name: r.name, url: r.url, language: r.primaryLanguage, pushedAt: r.pushedAt })),
    projectsWithoutPublicRepo: portfolio.projects
      .filter((p) => !p.link || !p.link.includes('github.com/'))
      .map((p) => ({ title: p.title, note: p.link ? `linked to ${p.link}` : 'no public link' })),
  };
}

/** Which portfolio projects a blog post talks about (title match in body or title). */
function postProjects(post, projects) {
  const hay = norm(`${post.title} ${post.excerpt || ''} ${post.body || ''}`);
  return projects
    .filter((p) => {
      const t = norm(p.title);
      return t.length >= 5 && hay.includes(t);
    })
    .map((p) => p.title);
}

function toMarkdown({ generatedAt, portfolio, github, profile, crossRef, warnings }) {
  const lines = [];
  const push = (s = '') => lines.push(s);

  push('# CV evidence pack');
  push();
  push(`Generated ${generatedAt}. Regenerate before every CV edit — do not trust a stale pack.`);
  push();
  push('Confidence labels: **[verified]** comes from the GitHub API or git history and can be');
  push('checked by a recruiter. **[self-reported]** comes from portfolio or blog copy the candidate');
  push('wrote about themselves — usable, but never phrase it as an independently measured result.');
  push('**[candidate-stated]** comes from the candidate\'s own profile file: employment, skills,');
  push('and constraints they typed in. The current CV file stays the source of truth for wording.');
  push();
  push('How to use it: Projects bullets may quote any build detail below (stack, features,');
  push('architecture). Employment bullets may only re-emphasise what the current CV or the');
  push('candidate profile already states. Numbers appear on the CV only if they appear here.');
  push();

  if (warnings.length) {
    push('## Collection warnings');
    push();
    for (const w of warnings) push(`- ${w}`);
    push();
  }

  push('## Identity [self-reported]');
  push();
  if (portfolio.profile) {
    push(`- Name: ${portfolio.profile.name}`);
    if (portfolio.profile.status || portfolio.profile.university) {
      push(`- Status: ${[portfolio.profile.status, portfolio.profile.university].filter(Boolean).join(' at ')}`);
    }
    if (portfolio.profile.employer) push(`- Employer: ${portfolio.profile.employer}`);
    if (portfolio.profile.site) push(`- Site: ${portfolio.profile.site}`);
  }
  for (const c of portfolio.contact) push(`- ${c.label}: ${c.href}`);
  if (!portfolio.profile && !portfolio.contact.length) push('_none collected_');
  push();

  push('## Claimed tech stack [self-reported]');
  push();
  push(portfolio.techStack.join(', ') || '_none_');
  push();

  if (profile) {
    push('## Candidate profile [candidate-stated]');
    push();
    if (profile.name) push(`- Name: ${profile.name}`);
    if (profile.headline) push(`- Headline: ${profile.headline}`);
    if (profile.targetRole) push(`- Target role: ${profile.targetRole}`);
    if (profile.seniority) push(`- Seniority: ${profile.seniority}`);
    if (profile.location?.cvDisplay || profile.location?.current) {
      push(`- Location on CV: ${profile.location.cvDisplay || profile.location.current}`);
    }
    const sk = profile.skills || {};
    if (sk.strong?.length) push(`- Skills (strong): ${sk.strong.join(', ')}`);
    if (sk.familiar?.length) push(`- Skills (familiar): ${sk.familiar.join(', ')}`);
    if (sk.learning?.length) push(`- Skills (learning): ${sk.learning.join(', ')}`);
    push();
    const jobs = (profile.experience || []).filter((e) => e.org && !/^personal$/i.test(e.org));
    if (jobs.length) {
      push('### Employment and independent work [candidate-stated]');
      push();
      for (const e of jobs) {
        push(`- **${e.title}** — ${e.org} (${e.from ?? '?'} – ${e.to ?? '?'})${e._org ? ` — note: ${e._org}` : ''}`);
        for (const b of e.bullets ?? []) push(`  - ${b}`);
      }
      push();
    }
    if (profile.education?.length) {
      push('### Education [candidate-stated]');
      push();
      for (const e of profile.education) {
        push(`- ${e.degree ?? ''} — ${e.school ?? ''} (${e.from ?? '?'} – ${e.to ?? '?'})`);
      }
      push();
    }
    const notes = profile.constraints?.notes || [];
    if (notes.length) {
      push('### Candidate notes [candidate-stated]');
      push();
      for (const n of notes) push(`- ${n}`);
      push();
    }
  }

  if (github) {
    push('## Language footprint [verified]');
    push();
    push('Bytes of code across all non-fork public repos:');
    push();
    for (const l of github.languageRanking.slice(0, 12)) {
      push(`- ${l.language}: ${l.share} (${l.bytes.toLocaleString()} bytes)`);
    }
    push();

    push('## Commit activity [verified]');
    push();
    push(`- Total public commits authored: ${github.totalCommits ?? 'unknown'}`);
    for (const [year, count] of Object.entries(github.commitsByYear).reverse()) {
      push(`- ${year}: ${count ?? 'unknown'}`);
    }
    push();

    push('## Public repositories [verified]');
    push();
    for (const r of github.repos) {
      const langs = Object.keys(r.languages ?? {}).slice(0, 4).join(', ') || r.primaryLanguage || 'n/a';
      push(`- **${r.name}** (${langs}) — pushed ${r.pushedAt?.slice(0, 10)}, created ${r.createdAt?.slice(0, 10)}, ${r.stars} star(s)`);
      if (r.description) push(`  - ${r.description}`);
      push(`  - ${r.url}`);
    }
    push();

    push('## Recent work sample [verified]');
    push();
    for (const w of github.recentWork) {
      push(`### ${w.repo}`);
      for (const c of w.commits) push(`- ${c.date?.slice(0, 10)} — ${c.message}`);
      push();
    }
  }

  push('## Portfolio projects [self-reported]');
  push();
  if (!portfolio.projects.length) push('_none collected — see collection warnings_');
  for (const p of portfolio.projects) {
    push(`- **${p.title}** — ${p.description}`);
    push(`  - Tags: ${p.tags.join(', ')}`);
    if (p.link) push(`  - ${p.link}`);
    if (p.note) push(`  - Note: ${p.note}`);
  }
  push();

  const narratives = portfolio.blogPosts.filter((b) => b.body && b.body.length > 200);
  if (narratives.length) {
    push('## Project narratives [self-reported — blog posts, full text]');
    push();
    push('The candidate\'s own account of what each project does, how it is built, and why.');
    push('Best source for Projects bullets: architecture, features, stack, constraints. Describe the');
    push('build, not the outcome; only numbers written here may reach the CV.');
    push();
    for (const b of narratives) {
      const related = postProjects(b, portfolio.projects);
      push(`### ${b.title}${b.date ? ` (${b.date})` : ''}`);
      if (related.length) push(`Projects: ${related.join(', ')}`);
      if (b.link) push(`Link: ${b.link}`);
      push();
      push(b.body);
      push();
    }
  }

  push('## Certifications [verified via credential URL]');
  push();
  if (!portfolio.certifications.length) push('_none collected_');
  for (const c of portfolio.certifications) push(`- ${c.title} — ${c.issuer} (${c.href})`);
  push();

  push('## Writing [verified — published]');
  push();
  if (!portfolio.blogPosts.length) push('_none collected_');
  for (const b of portfolio.blogPosts) push(`- ${b.date} — ${b.title}${b.link ? ` (${b.link})` : ''}`);
  push();

  if (crossRef) {
    push('## Gaps worth asking about');
    push();
    push('Public repos with no matching portfolio project (possible missing CV material):');
    for (const r of crossRef.reposMissingFromPortfolio) {
      push(`- ${r.name} (${r.language ?? 'n/a'}, pushed ${r.pushedAt?.slice(0, 10)}) — ${r.url}`);
    }
    push();
    push('Portfolio projects with no public repo (cannot be verified by a recruiter):');
    for (const p of crossRef.projectsWithoutPublicRepo) push(`- ${p.title} — ${p.note}`);
    push();
  }

  return lines.join('\n');
}

async function main() {
  const repo = await gitRoot();
  const portfolioRoot = await resolvePortfolioRoot(repo);
  const outDir = OUT_DIR_ARG ? resolve(OUT_DIR_ARG) : join(portfolioRoot, '.cv-workspace');
  await mkdir(outDir, { recursive: true });

  const portfolio = await collectPortfolio(portfolioRoot);
  const profile = await collectProfile(PROFILE_ARG);
  const github = USE_GITHUB ? await collectGitHub() : null;
  if (!USE_GITHUB) warnings.push('GitHub collection skipped (--no-github).');

  const crossRef = crossReference(portfolio, github);
  const evidence = {
    generatedAt: new Date().toISOString(),
    portfolio,
    profile,
    github,
    crossRef,
    warnings,
  };

  await writeFile(join(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(join(outDir, 'evidence.md'), `${toMarkdown(evidence)}\n`);

  console.log(`Portfolio root: ${portfolioRoot}`);
  console.log(`Wrote ${join(outDir, 'evidence.json')}`);
  console.log(`Wrote ${join(outDir, 'evidence.md')}`);
  console.log(`Projects: ${portfolio.projects.length}, certifications: ${portfolio.certifications.length}, posts: ${portfolio.blogPosts.length}`);
  if (github) {
    console.log(`GitHub repos: ${github.repos.length}, commits: ${github.totalCommits ?? 'unknown'}`);
  }
  if (profile) console.log(`Profile: ${profile.name ?? '(unnamed)'} (${(profile.experience || []).length} experience entries)`);
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
