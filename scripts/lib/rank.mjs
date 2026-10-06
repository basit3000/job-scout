import { FIT_VERDICTS, scoreJob } from './fit.mjs';
import { compareFit } from './job-sort.mjs';

/** CV content only: style instructions, saved answers and LaTeX comments are not skill evidence. */
export function rankingEvidence(inputs = {}) {
  const names = ['.workspace/overleaf/ats.tex', '.workspace/overleaf/main.tex', 'cv/resume.md', 'cv/resume.txt'];
  const name = names.find((key) => inputs[key]?.trim());
  if (!name) return '';
  return String(inputs[name]).replace(/(?<!\\)%[^\n]*/g, '')
    .split('\n').filter((line) => !/\b(?:do not invent|no experience (?:in|with)|currently learning|not yet experienced)\b/i.test(line)).join('\n');
}

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

export function rankJobs(jobs, profile, cvText = '', options = {}) {
  return (jobs ?? []).map((job) => {
    const fit = scoreJob(job, profile, cvText, options);
    return {
      ...job,
      score: fit.score,
      priorityScore: fit.priorityScore,
      opportunity: fit.opportunity,
      ageDays: fit.opportunity.ageDays,
      fit: fit.verdict,
      blurb: shortDescription(job.description),
      why: (fit.reasons ?? []).slice(0, 3),
      matched: fit.matched,
      gaps: fit.gaps,
      eligibility: fit.eligibility,
      experience: fit.experience,
      relevantExperience: fit.relevantExperience,
    };
  }).sort((a, b) => {
    const byFit = compareFit(
      { fit: { verdict: a.fit, score: a.score, priorityScore: a.priorityScore } },
      { fit: { verdict: b.fit, score: b.score, priorityScore: b.priorityScore } },
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
