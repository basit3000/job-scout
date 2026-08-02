// Rank fetched jobs against a profile + optional CV text.
// Pure scoring — no LLM. Returns short blurbs + fit labels.

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'at',
  'by', 'from', 'as', 'is', 'are', 'be', 'this', 'that', 'your', 'our', 'we',
  'you', 'their', 'job', 'role', 'position', 'senior', 'junior', 'mid', 'lead',
]);

export function tokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+\s#.]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function shortDescription(description, max = 220) {
  const clean = String(description ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'No description available — open the posting to judge fit.';

  // Prefer first 1–2 sentence-like chunks.
  const parts = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = parts.slice(0, 2).join(' ');
  if (!out) out = clean;
  if (out.length <= max) return out;
  return `${out.slice(0, max - 1).trimEnd()}…`;
}

function patternScore(title, patterns) {
  if (!patterns?.length) return 0;
  let hits = 0;
  for (const p of patterns) {
    try {
      if (new RegExp(p, 'i').test(title)) hits += 1;
    } catch {
      /* ignore bad regex */
    }
  }
  if (!hits) return -25;
  return Math.min(40, hits * 20);
}

function overlapScore(haystackTokens, needleTokens, weight = 4, cap = 28) {
  if (!needleTokens.length) return 0;
  const set = new Set(haystackTokens);
  let hits = 0;
  for (const t of needleTokens) if (set.has(t)) hits += 1;
  return Math.min(cap, hits * weight);
}

function flagPenalty(flags = []) {
  let p = 0;
  if (flags.includes('nationals-only') || flags.includes('uae-nationals-only')) p -= 50;
  if (flags.includes('local-experience-required') || flags.includes('uae-experience-required')) p -= 12;
  if (flags.includes('immediate-joiner')) p -= 4;
  return p;
}

function ageBonus(ageDays) {
  if (ageDays == null) return 0;
  if (ageDays <= 3) return 8;
  if (ageDays <= 7) return 5;
  if (ageDays <= 14) return 2;
  if (ageDays > 30) return -6;
  return 0;
}

export function fitLabel(score) {
  if (score >= 55) return 'Strong';
  if (score >= 30) return 'Worth a shot';
  if (score >= 10) return 'Stretch';
  return 'Weak';
}

/**
 * @param {object[]} jobs
 * @param {object} profile
 * @param {string} [cvText]
 */
export function rankJobs(jobs, profile, cvText = '') {
  const titles = (profile.search?.titles ?? []).map(String);
  const include = profile.search?.includeTitlePatterns ?? [];
  const skills = [
    ...(profile.skills?.strong ?? []),
    ...(profile.skills?.familiar ?? []),
  ].map(String);
  const role = String(profile.targetRole ?? '');
  const evidenceTokens = tokens([
    role,
    titles.join(' '),
    skills.join(' '),
    cvText.slice(0, 12000),
  ].join(' '));
  const skillTokens = tokens(skills.join(' '));
  const roleTokens = tokens(role);

  return jobs.map((job) => {
    const title = job.title || '';
    const blob = `${title}\n${job.description ?? ''}`;
    const jobTokens = tokens(blob);

    const reasons = [];
    let score = 0;

    const titlePts = patternScore(title, include);
    score += titlePts;
    if (titlePts >= 20) reasons.push('Title matches your field filters');
    else if (titlePts < 0) reasons.push('Title missed your include filters');

    const rolePts = overlapScore(tokens(title), roleTokens, 8, 24);
    score += rolePts;
    if (rolePts >= 8) reasons.push('Close to your target role');

    const skillPts = overlapScore(jobTokens, skillTokens.length ? skillTokens : evidenceTokens, 5, 30);
    score += skillPts;
    if (skillPts >= 10) reasons.push('Skills from your CV/profile show up');

    const evidencePts = overlapScore(jobTokens, evidenceTokens, 1, 12);
    score += evidencePts;

    const flags = job.flags ?? [];
    const penalty = flagPenalty(flags);
    score += penalty;
    if (penalty <= -50) reasons.push('Nationals-only flag');
    else if (penalty <= -12) reasons.push('Asks for local market experience');

    const agePts = ageBonus(job.ageDays);
    score += agePts;
    if (agePts >= 5) reasons.push('Posted recently');

    if (job.remote === true) {
      score += 3;
      reasons.push('Remote-friendly');
    }

    const blurb = shortDescription(job.description);
    const fit = fitLabel(score);

    return {
      ...job,
      score,
      fit,
      blurb,
      why: reasons.slice(0, 3),
    };
  }).sort((a, b) => b.score - a.score || (a.ageDays ?? 999) - (b.ageDays ?? 999));
}

export function summariseRanking(ranked) {
  const counts = { Strong: 0, 'Worth a shot': 0, Stretch: 0, Weak: 0 };
  for (const j of ranked) counts[j.fit] = (counts[j.fit] ?? 0) + 1;
  return {
    total: ranked.length,
    counts,
    topScore: ranked[0]?.score ?? null,
  };
}
