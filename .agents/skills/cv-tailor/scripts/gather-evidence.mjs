#!/usr/bin/env node
// Collects CV evidence from two sources and writes it to .cv-workspace/:
//   - this portfolio repo (projects, certifications, profile, blog posts)
//   - the public GitHub account (repos, languages, commit activity)
//
// Every fact carries a confidence label so the CV writer can tell the
// difference between "GitHub says this" and "the portfolio copy claims this".
//
// Usage:
//   node .agents/skills/cv-tailor/scripts/gather-evidence.mjs [--username <login>] [--no-github]

import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';

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
const RECENT_REPO_COUNT = 6;
const COMMIT_SAMPLE = 8;
const YEARS_BACK = 4;

const warnings = [];

async function repoRoot() {
  const { stdout } = await run('git', ['rev-parse', '--show-toplevel']);
  return stdout.trim();
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

async function collectPortfolio(root) {
  const load = async (rel) => {
    try {
      return await import(new URL(`file://${join(root, rel)}`).href);
    } catch (err) {
      warnings.push(`Could not import ${rel}: ${err.message}`);
      return null;
    }
  };

  const projectsMod = await load('src/data/projects.js');
  const certsMod = await load('src/data/certifications.js');
  const profileMod = await load('src/data/profile.js');
  const blogMod = await load('src/pages/blogPosts.js');

  return {
    profile: profileMod?.profile ?? null,
    contact: profileMod?.connectLinks ?? [],
    techStack: projectsMod?.techStack ?? [],
    projects: projectsMod?.projects ?? [],
    certifications: certsMod?.certifications ?? [],
    blogPosts: (blogMod?.posts ?? []).map((p) => ({
      title: p.title,
      date: p.date,
      category: p.category,
      excerpt: p.excerpt,
      link: p.link ?? null,
    })),
  };
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

  const titleWords = portfolio.projects.map((p) => p.title.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const onPortfolio = (repoName) => {
    const normalized = repoName.toLowerCase().replace(/[^a-z0-9]/g, '');
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

function toMarkdown({ generatedAt, portfolio, github, crossRef, warnings }) {
  const lines = [];
  const push = (s = '') => lines.push(s);

  push('# CV evidence pack');
  push();
  push(`Generated ${generatedAt}. Regenerate before every CV edit — do not trust a stale pack.`);
  push();
  push('Confidence labels: **[verified]** comes from the GitHub API or git history and can be');
  push('checked by a recruiter. **[self-reported]** comes from portfolio or blog copy the candidate');
  push('wrote about himself — usable, but never phrase it as an independently measured result.');
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
    push(`- Status: ${portfolio.profile.status} at ${portfolio.profile.university}`);
    push(`- Site: ${portfolio.profile.site}`);
  }
  for (const c of portfolio.contact) push(`- ${c.label}: ${c.href}`);
  push();

  push('## Claimed tech stack [self-reported]');
  push();
  push(portfolio.techStack.join(', ') || '_none_');
  push();

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
  for (const p of portfolio.projects) {
    push(`- **${p.title}** — ${p.description}`);
    push(`  - Tags: ${p.tags.join(', ')}`);
    if (p.link) push(`  - ${p.link}`);
  }
  push();

  push('## Certifications [verified via credential URL]');
  push();
  for (const c of portfolio.certifications) push(`- ${c.title} — ${c.issuer} (${c.href})`);
  push();

  push('## Writing [verified — published]');
  push();
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
  const root = await repoRoot();
  const outDir = join(root, '.cv-workspace');
  await mkdir(outDir, { recursive: true });

  const portfolio = await collectPortfolio(root);
  const github = USE_GITHUB ? await collectGitHub() : null;
  if (!USE_GITHUB) warnings.push('GitHub collection skipped (--no-github).');

  const crossRef = crossReference(portfolio, github);
  const evidence = {
    generatedAt: new Date().toISOString(),
    portfolio,
    github,
    crossRef,
    warnings,
  };

  await writeFile(join(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(join(outDir, 'evidence.md'), `${toMarkdown(evidence)}\n`);

  console.log(`Wrote ${join(outDir, 'evidence.json')}`);
  console.log(`Wrote ${join(outDir, 'evidence.md')}`);
  console.log(`Projects: ${portfolio.projects.length}, certifications: ${portfolio.certifications.length}, posts: ${portfolio.blogPosts.length}`);
  if (github) {
    console.log(`GitHub repos: ${github.repos.length}, commits: ${github.totalCommits ?? 'unknown'}`);
  }
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
