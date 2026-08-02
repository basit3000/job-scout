#!/usr/bin/env node
// Rank .workspace/jobs.json against profile + CV and write shortlist files.
//
//   node scripts/rank-jobs.mjs
//   node scripts/rank-jobs.mjs --limit 15

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadJson, workspaceDir, value } from './lib/common.mjs';
import { rankJobs, summariseRanking } from './lib/rank.mjs';

async function loadCvText() {
  for (const name of ['resume.md', 'resume.txt', 'resume.tex']) {
    try {
      return await readFile(join(ROOT, 'cv', name), 'utf8');
    } catch {
      /* try next */
    }
  }
  return '';
}

function renderShortlist(ranked, meta, summary) {
  const lines = [];
  const push = (s = '') => lines.push(s);
  push(`# ${meta.market || 'Market'} shortlist — ${new Date().toISOString().slice(0, 10)}`);
  push();
  push(`Candidate: **${meta.candidate || '—'}** — target: **${meta.targetRole || '—'}**`);
  push(`Market: **${meta.marketName || meta.market || '—'}**`);
  push(`${summary.total} ranked · Strong ${summary.counts.Strong ?? 0} · Worth a shot ${summary.counts['Worth a shot'] ?? 0} · Stretch ${summary.counts.Stretch ?? 0}`);
  push();
  push('These are relevance-ranked candidates with short blurbs. Open Apply yourself — nothing is submitted for you.');
  push();

  let i = 1;
  for (const job of ranked) {
    push(`## ${i}. ${job.title} — ${job.company}`);
    push();
    push(`**${job.fit}** · score ${job.score} · ${job.location || '—'} · ${job.ageDays != null ? `${job.ageDays}d ago` : 'date unknown'}`);
    push();
    push(job.blurb);
    push();
    if (job.why?.length) push(`Why: ${job.why.join(' · ')}`);
    if (job.flags?.length) push(`Flags: ${job.flags.join(', ')}`);
    push(`Apply: ${job.url}`);
    push(`ID: \`${job.id}\``);
    push();
    i += 1;
  }
  return lines.join('\n');
}

async function main() {
  const outDir = workspaceDir();
  const bundle = await loadJson(join(outDir, 'jobs.json'), null);
  if (!bundle?.jobs) {
    console.error('No .workspace/jobs.json — run fetch-jobs.mjs first.');
    process.exit(1);
  }
  const profile = await loadJson(join(ROOT, 'profile.json'), null);
  if (!profile) {
    console.error('No profile.json');
    process.exit(1);
  }

  const limit = Number(value('--limit', 25));
  const cvText = await loadCvText();
  const ranked = rankJobs(bundle.jobs, profile, cvText).slice(0, limit);
  const summary = summariseRanking(ranked);
  const meta = {
    market: bundle.market,
    marketId: bundle.marketId,
    marketName: bundle.marketName,
    candidate: bundle.candidate,
    targetRole: bundle.targetRole,
    generatedAt: new Date().toISOString(),
    strategy: bundle.strategy,
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, 'shortlist.json'),
    `${JSON.stringify({ ...meta, summary, jobs: ranked }, null, 2)}\n`,
  );
  await writeFile(join(outDir, 'shortlist.md'), `${renderShortlist(ranked, meta, summary)}\n`);

  console.log(`Wrote ${join(outDir, 'shortlist.json')}`);
  console.log(`Wrote ${join(outDir, 'shortlist.md')}`);
  console.log(`Ranked ${ranked.length}: Strong=${summary.counts.Strong} Worth=${summary.counts['Worth a shot']} Stretch=${summary.counts.Stretch}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
