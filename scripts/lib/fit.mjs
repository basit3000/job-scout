/**
 * Heuristic fit score against profile.json (and optional evidence text).
 * Verdicts: Strong | Worth a shot | Stretch | No
 */

function tokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]/i)
    .filter((t) => t.length > 1);
}

function unique(arr) {
  return [...new Set(arr)];
}

function skillList(profile) {
  const s = profile?.skills ?? {};
  return {
    strong: (s.strong ?? []).map(String),
    familiar: (s.familiar ?? []).map(String),
    learning: (s.learning ?? []).map(String),
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(haystack, skill) {
  const re = new RegExp(`\\b${escapeRe(skill.toLowerCase())}\\b`, 'i');
  return re.test(haystack);
}

/**
 * @returns {{
 *   verdict: 'Strong'|'Worth a shot'|'Stretch'|'No',
 *   score: number,
 *   matched: string[],
 *   gaps: string[],
 *   reasons: string[],
 *   checklist: { id: string, label: string, ok: boolean|null, detail?: string }[]
 * }}
 */
export function scoreJob(job, profile, evidenceText = '') {
  const hay = `${job.title}\n${job.description ?? ''}\n${evidenceText}`.toLowerCase();
  const jobText = `${job.title}\n${job.description ?? ''}`;
  const skills = skillList(profile);
  const target = String(profile?.targetRole ?? '');
  const titles = (profile?.search?.titles ?? []).map(String);

  const matched = [];
  const gaps = [];
  const reasons = [];
  let score = 40;

  // Title alignment
  const titleHit =
    (target && new RegExp(escapeRe(target), 'i').test(job.title))
    || titles.some((t) => t.length > 2 && new RegExp(escapeRe(t), 'i').test(job.title));
  if (titleHit) {
    score += 18;
    reasons.push('Title aligns with target role / search titles');
  } else {
    score -= 8;
    gaps.push('Title is not an obvious match to target role');
  }

  for (const sk of skills.strong) {
    if (mentions(jobText, sk)) {
      matched.push(sk);
      score += 8;
    }
  }
  for (const sk of skills.familiar) {
    if (mentions(jobText, sk)) {
      matched.push(sk);
      score += 4;
    }
  }

  // Common stack terms asked but missing from strong/familiar
  const asked = unique(tokens(jobText)).filter((t) => t.length > 2);
  const known = new Set(
    [...skills.strong, ...skills.familiar, ...skills.learning].map((s) => s.toLowerCase()),
  );
  const interesting = asked.filter((t) =>
    /^(python|java|kotlin|react|fastapi|django|docker|postgres|sql|typescript|javascript|aws|azure|kubernetes|node)$/i.test(t),
  );
  for (const t of interesting) {
    if (!known.has(t) && !matched.map((m) => m.toLowerCase()).includes(t)) {
      gaps.push(`Posting mentions ${t}`);
      score -= 3;
    }
  }

  const flags = job.flags ?? [];
  if (flags.includes('nationals-only') || flags.includes('uae-nationals-only')) {
    score -= 40;
    gaps.push('Nationals-only posting');
    reasons.push('Hard gate: nationals-only');
  }
  if (flags.includes('local-experience-required') || flags.includes('uae-experience-required')) {
    score -= 15;
    gaps.push('Local/country experience required — confirm before applying');
  }
  if (flags.includes('immediate-joiner')) {
    score -= 5;
    gaps.push('Immediate joiner preferred');
  }
  if (flags.includes('mentions-visa')) {
    reasons.push('Posting mentions visa/sponsorship');
    score += 3;
  }

  const seniority = String(profile?.seniority ?? '').toLowerCase();
  if (/senior|staff|principal|lead/i.test(job.title) && ['internship', 'entry', 'junior'].includes(seniority)) {
    score -= 12;
    gaps.push('Seniority looks above profile target');
  }

  score = Math.max(0, Math.min(100, score));

  let verdict = 'Worth a shot';
  if (score >= 72 && matched.length >= 2 && !flags.includes('nationals-only')) verdict = 'Strong';
  else if (score < 35 || flags.includes('nationals-only')) verdict = 'No';
  else if (score < 50 || gaps.length >= 4) verdict = 'Stretch';

  if (matched.length) reasons.push(`Matched skills: ${unique(matched).slice(0, 6).join(', ')}`);
  if (!reasons.length) reasons.push('Limited signal — open the posting and judge manually');

  const checklist = buildChecklist(job, profile, { matched: unique(matched), gaps: unique(gaps), verdict });

  return {
    verdict,
    score,
    matched: unique(matched),
    gaps: unique(gaps),
    reasons,
    checklist,
  };
}

function buildChecklist(job, profile, { matched, gaps, verdict }) {
  const authNote = (profile?.constraints?.notes ?? []).join(' ') || '';
  return [
    {
      id: 'fit',
      label: 'Fit verdict acceptable',
      ok: verdict === 'Strong' || verdict === 'Worth a shot',
      detail: verdict,
    },
    {
      id: 'skills',
      label: 'Core skills evidenced',
      ok: matched.length >= 1,
      detail: matched.length ? matched.slice(0, 5).join(', ') : 'None auto-matched',
    },
    {
      id: 'location',
      label: 'Location / remote OK',
      ok: null,
      detail: job.location || (job.remote ? 'Remote' : 'Check posting'),
    },
    {
      id: 'visa',
      label: 'Work authorisation clear',
      ok: /visa|sponsor|eu|blue card|arbeit/i.test(`${job.description ?? ''} ${authNote}`) ? null : null,
      detail: gaps.find((g) => /visa|national/i.test(g)) || 'Confirm before applying',
    },
    {
      id: 'salary',
      label: 'Salary / expectations set',
      ok: Boolean(job.salary) ? null : null,
      detail: job.salary || 'Not listed — use saved answers',
    },
    {
      id: 'cv',
      label: 'Tailored CV ready',
      ok: null,
      detail: 'Prep & CV → download cv.html (Print → PDF)',
    },
    {
      id: 'letter',
      label: 'Cover letter drafted',
      ok: null,
      detail: 'Cover letter button → agent (same instructions as CV) → company folder',
    },
  ];
}
