export function renderJobs(jobs, meta) {
  const lines = [];
  const push = (s = '') => lines.push(s);
  const marketLabel = meta.marketName || meta.market || 'target market';

  push(`# ${meta.market || 'Job'} candidates`);
  push();
  push(`Fetched ${meta.generatedAt}. Strategy: ${meta.strategy}.`);
  if (meta.candidate) push(`Candidate: **${meta.candidate}**${meta.targetRole ? ` — target: ${meta.targetRole}` : ''}.`);
  push(`Market: **${marketLabel}**${meta.marketId ? ` (${meta.marketId})` : ''}.`);
  push(`${jobs.length} posting(s) survived the country filters.`);
  push();
  push('These are **candidates, not recommendations**. Rank them against `.workspace/evidence.md` next.');
  push();

  if (meta.sourceStatus?.length) {
    push('## Board status');
    push();
    for (const s of meta.sourceStatus) {
      if (s.ok) push(`- **${s.board}** — ${s.count} via ${s.via}`);
      else push(`- **${s.board}** — FAILED: ${s.error}`);
    }
    push();
  }

  push('## Dropped by filters');
  push();
  const dropped = Object.entries(meta.dropped ?? {}).filter(([, n]) => n > 0);
  if (!dropped.length && !meta.duplicatesRemoved) push('- nothing dropped');
  else {
    for (const [reason, count] of dropped) push(`- ${reason}: ${count}`);
    if (meta.duplicatesRemoved) push(`- deduplicated: ${meta.duplicatesRemoved}`);
  }
  push();

  push('## Postings');
  push();
  if (!jobs.length) {
    push('_None. Check board status (Bayt needs Apify where enabled). Or widen profile.search.includeTitlePatterns._');
    return lines.join('\n');
  }

  for (const job of jobs) {
    push(`### ${job.title} — ${job.company}`);
    push();
    const facts = [
      job.location && `Location: ${job.location}`,
      job.remote === true && 'Remote',
      job.employmentType && `Type: ${job.employmentType}`,
      job.seniority && `Seniority: ${job.seniority}`,
      job.yearsExperience && `Experience asked: ${job.yearsExperience}`,
      job.salary && `Salary: ${job.salary}`,
      job.ageDays != null && `Posted ${job.ageDays}d ago`,
      `Board: ${job.board} via ${job.via}`,
      job.flags?.length && `Flags: ${job.flags.join(', ')}`,
      `ID: \`${job.id}\``,
    ].filter(Boolean);
    for (const f of facts) push(`- ${f}`);
    push(`- ${job.url}`);
    push();
    if (job.description) {
      push(job.description);
      push();
    } else {
      push('_No description — open the URL before judging._');
      push();
    }
  }

  return lines.join('\n');
}
