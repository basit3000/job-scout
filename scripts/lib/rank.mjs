import { FIT_VERDICTS, scoreJob } from './fit.mjs';
import { compareFit } from './job-sort.mjs';

export function shortDescription(description, max = 220) {
  const clean = String(description ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'No description available — open the posting to judge fit.';

  const parts = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = parts.slice(0, 2).join(' ') || clean;
  if (out.length <= max) return out;
  return `${out.slice(0, max - 1).trimEnd()}…`;
}

export function rankJobs(jobs, profile, cvText = '') {
  return (jobs ?? []).map((job) => {
    const fit = scoreJob(job, profile, cvText);
    return {
      ...job,
      score: fit.score,
      fit: fit.verdict,
      blurb: shortDescription(job.description),
      why: (fit.reasons ?? []).slice(0, 3),
      matched: fit.matched,
      gaps: fit.gaps,
    };
  }).sort((a, b) => {
    const byFit = compareFit(
      { fit: { verdict: a.fit, score: a.score } },
      { fit: { verdict: b.fit, score: b.score } },
    );
    if (byFit !== 0) return byFit;
    return (a.ageDays ?? 999) - (b.ageDays ?? 999);
  });
}

export function summariseRanking(ranked) {
  const counts = Object.fromEntries(FIT_VERDICTS.map((v) => [v, 0]));
  for (const j of ranked) {
    if (Object.prototype.hasOwnProperty.call(counts, j.fit)) counts[j.fit] += 1;
  }
  return {
    total: ranked.length,
    counts,
    topScore: ranked[0]?.score ?? null,
  };
}
