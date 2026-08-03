#!/usr/bin/env node
// Builds a generic evidence pack from profile.json + whatever is in cv/.
// Optional: public GitHub repos if profile.githubUsername is set and `gh` works.
//
//   node scripts/build-evidence.mjs
//
// Writes .workspace/evidence.md and evidence.json for the agent to read.

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadJson, run, workspaceDir, listFilesRecursive } from './lib/common.mjs';
import { assertNoPlaceholders, findPlaceholders } from './lib/placeholders.mjs';

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadCvText() {
  const cvDir = join(ROOT, 'cv');
  const preferred = ['resume.md', 'resume.txt', 'resume.tex'];
  for (const name of preferred) {
    const p = join(cvDir, name);
    if (await exists(p)) {
      return { path: p, text: await readFile(p, 'utf8'), kind: name.split('.').pop() };
    }
  }

  const overleafDir = join(cvDir, 'overleaf');
  if (await exists(overleafDir)) {
    const texFiles = (await listFilesRecursive(overleafDir, (p) => p.endsWith('.tex')))
      .filter((p) => !p.includes('/.git/'))
      .sort();
    // Prefer common entrypoints, then the rest
    const rank = (p) => {
      const base = p.split('/').pop().toLowerCase();
      if (base === 'main.tex' || base === 'cv.tex' || base === 'resume.tex' || base === 'ats.tex') return 0;
      return 1;
    };
    texFiles.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const chunks = [];
    for (const p of texFiles.slice(0, 6)) {
      chunks.push(`% --- ${p.replace(overleafDir + '/', '')} ---\n${await readFile(p, 'utf8')}`);
    }
    if (chunks.length) {
      return { path: overleafDir, text: chunks.join('\n\n'), kind: 'overleaf-tex' };
    }
  }

  return null;
}

async function loadGithub(username) {
  if (!username) return null;
  try {
    const { stdout } = await run(
      'gh',
      ['api', `users/${username}/repos?per_page=100&sort=pushed`, '--cache', '1h'],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const repos = JSON.parse(stdout)
      .filter((r) => !r.fork && !r.archived)
      .map((r) => ({
        name: r.name,
        description: r.description,
        url: r.html_url,
        language: r.language,
        pushedAt: r.pushed_at,
        stars: r.stargazers_count,
      }));
    return { username, repos };
  } catch (err) {
    return { username, repos: [], error: String(err.stderr || err.message).split('\n')[0] };
  }
}

function toMarkdown({ profile, cv, github, generatedAt }) {
  const lines = [];
  const push = (s = '') => lines.push(s);

  push('# Candidate evidence pack');
  push();
  push(`Generated ${generatedAt} for **${profile.name ?? 'unnamed candidate'}**.`);
  push('Regenerate after every CV or profile edit — do not trust a stale pack.');
  push();
  push('Labels: **[profile]** comes from profile.json. **[cv]** comes from files in cv/.');
  push('**[github]** comes from the public GitHub API when githubUsername is set.');
  push();

  push('## Identity [profile]');
  push();
  push(`- Name: ${profile.name ?? '_'}`);
  push(`- Headline: ${profile.headline ?? '_'}`);
  if (profile.location) {
    push(`- Current: ${profile.location.current ?? '_'}`);
    push(`- Target cities: ${(profile.location.targets ?? []).join(', ') || '_'}`);
    const openRemote = profile.location.openToRemote ?? profile.location.openToRemoteUae;
    push(`- Open to remote: ${openRemote ?? '_'}`);
    push(`- Willing to relocate: ${profile.location.willingToRelocate ?? '_'}`);
  }
  push(`- Seniority target: ${profile.seniority ?? '_'}`);
  const links = profile.links ?? {};
  for (const [k, v] of Object.entries(links)) if (v) push(`- ${k}: ${v}`);
  push();

  push('## Skills [profile]');
  push();
  push(`- Strong: ${(profile.skills?.strong ?? []).join(', ') || '_'}`);
  push(`- Familiar: ${(profile.skills?.familiar ?? []).join(', ') || '_'}`);
  push(`- Learning: ${(profile.skills?.learning ?? []).join(', ') || '_'}`);
  push();

  if (profile.experience?.length) {
    push('## Experience [profile]');
    push();
    for (const e of profile.experience) {
      push(`### ${e.title}${e.org ? ` — ${e.org}` : ''}`);
      push(`${e.from ?? '?'} – ${e.to ?? '?'}`);
      for (const b of e.bullets ?? []) push(`- ${b}`);
      push();
    }
  }

  if (profile.education?.length) {
    push('## Education [profile]');
    push();
    for (const e of profile.education) {
      push(`- ${e.degree ?? ''} — ${e.school ?? ''} (${e.from ?? '?'}–${e.to ?? '?'})`);
    }
    push();
  }

  if (profile.constraints) {
    push('## Constraints [profile]');
    push();
    push(`- Drop nationals-only postings: ${profile.constraints.dropNationalsOnly ?? true}`);
    for (const n of profile.constraints.notes ?? []) push(`- ${n}`);
    push();
  }

  if (cv) {
    push(`## CV text [cv — ${cv.kind} from ${cv.path.replace(ROOT + '/', '')}]`);
    push();
    push('```');
    push(cv.text.slice(0, 20000));
    push('```');
    push();
  } else {
    push('## CV text');
    push();
    push('_No CV found in cv/. Add resume.md / resume.txt / resume.tex, or complete first-run setup in the UI._');
    push();
  }

  if (github) {
    push(`## Public GitHub [github — ${github.username}]`);
    push();
    if (github.error) push(`Warning: ${github.error}`);
    for (const r of github.repos ?? []) {
      push(`- **${r.name}** (${r.language ?? 'n/a'}) — pushed ${r.pushedAt?.slice(0, 10) ?? '?'}, ${r.stars}★`);
      if (r.description) push(`  - ${r.description}`);
      push(`  - ${r.url}`);
    }
    push();
  }

  push('## How to use this pack');
  push();
  push('When judging a job posting, only claim skills/experience that appear above.');
  push('If a requirement is missing, it is a gap — not a stretch of the imagination.');
  push('Visa, nationality, and local-years-of-experience are never inferred.');
  push('The target country comes from search-profile.json → market (or --market).');

  return lines.join('\n');
}

async function main() {
  const profilePath = join(ROOT, 'profile.json');
  const examplePath = join(ROOT, 'profile.example.json');
  let profile = await loadJson(profilePath, null);
  if (!profile) {
    if (await exists(examplePath)) {
      console.error('No profile.json found.');
      console.error('  cp profile.example.json profile.json');
      console.error('Replace every YOUR_* placeholder, add a CV under cv/, and re-run.');
      process.exit(1);
    }
    console.error('No profile.json or profile.example.json found.');
    process.exit(1);
  }

  assertNoPlaceholders('profile.json (identity)', {
    name: profile.name,
    headline: profile.headline,
    targetRole: profile.targetRole,
  });

  const soft = findPlaceholders({
    skills: profile.skills,
    experience: profile.experience,
    search: profile.search,
  });
  if (soft.length) {
    console.warn(`Warning: ${soft.length} YOUR_* placeholders still in skills/experience/search.`);
    console.warn('Fill them before matching — the agent must not invent replacements.');
  }

  const cv = await loadCvText();
  if (cv && /YOUR_[A-Z0-9_]+/.test(cv.text)) {
    console.error('cv/ still contains YOUR_* placeholders. Replace them with the real CV text.');
    process.exit(1);
  }
  const github = await loadGithub(profile.githubUsername);
  const pack = {
    generatedAt: new Date().toISOString(),
    profile,
    cv: cv ? { path: cv.path, kind: cv.kind, chars: cv.text.length } : null,
    github,
  };

  const out = workspaceDir();
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'evidence.json'), `${JSON.stringify(pack, null, 2)}\n`);
  await writeFile(join(out, 'evidence.md'), `${toMarkdown({ ...pack, cv })}\n`);

  console.log(`Wrote ${join(out, 'evidence.md')}`);
  console.log(`Profile: ${profile.name ?? '(unnamed)'}`);
  console.log(`CV: ${cv ? `${cv.kind} (${cv.text.length} chars)` : 'MISSING'}`);
  if (github) console.log(`GitHub: ${github.repos?.length ?? 0} public repos${github.error ? ` (${github.error})` : ''}`);
  if (!cv) console.log('\nWarning: matching without a CV is weak. Add cv/resume.md or pull Overleaf.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
