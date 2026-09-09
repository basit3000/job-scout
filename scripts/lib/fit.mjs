/** Heuristic fit score against profile.json (and optional evidence text). */
import { analyzeKeywordGaps } from './cv-keywords.mjs';
import { assessRequirements } from './match-requirements.mjs';
export const FIT_VERDICTS = ['Strong', 'Worth a shot', 'Stretch', 'No'];


/** Rank for profile.seniority. `any` / unknown / YOUR_* → no title penalty. */
export const SENIORITY_RANK = {
  internship: 0,
  intern: 0,
  entry: 1,
  junior: 2,
  mid: 3,
  'mid-level': 3,
  senior: 4,
  staff: 5,
  lead: 5,
  principal: 6,
  executive: 7,
  any: Number.POSITIVE_INFINITY,
};

export function profileSeniorityRank(seniority) {
  const key = String(seniority ?? '').trim().toLowerCase();
  if (!key || key.startsWith('your_')) return null;
  return Object.prototype.hasOwnProperty.call(SENIORITY_RANK, key) ? SENIORITY_RANK[key] : null;
}

export function jobTitleSeniorityRank(title) {
  const t = String(title ?? '');
  if (/\b(principal|partner|distinguished|fellow)\b/i.test(t)) return 6;
  if (/\b(staff|director|head of)\b/i.test(t)) return 5;
  if (/\b(lead|leiterin|leiter|leitung)\b/i.test(t)) return 5;
  if (/\bsenior\b|\bsr\.?\b/i.test(t)) return 4;
  if (/\bmid[- ]level\b|\bmidlevel\b/i.test(t)) return 3;
  if (/\b(junior|entry[- ]level|graduate|werkstudent|working student|intern)\b/i.test(t)) return 2;
  return null;
}

export function jobTitleAboveProfileSeniority(title, seniority) {
  const want = profileSeniorityRank(seniority);
  if (want == null || !Number.isFinite(want)) return false;
  const got = jobTitleSeniorityRank(title);
  if (got == null) return false;
  return got > want;
}

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
  const re = new RegExp(`(?<![a-z0-9])${escapeRe(skill.toLowerCase())}(?![a-z0-9+#])`, 'i');
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
  const candidateEvidence = `${evidenceText}\n${(profile.experience || []).flatMap((e) => e.bullets || []).join('\n')}`;
  const jobText = `${job.title}\n${job.description ?? ''}`;
  const skills = skillList(profile);
  const target = String(profile?.targetRole ?? '');
  const titles = (profile?.search?.titles ?? []).map(String);

  const matched = [];
  const gaps = [];
  const reasons = [];
  let score = 40;

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

  for (const sk of unique(skills.strong)) {
    if (mentions(jobText, sk)) {
      matched.push(sk);
      score += 8;
    }
  }
  for (const sk of unique(skills.familiar)) {
    if (mentions(jobText, sk) && !matched.some((m) => m.toLowerCase() === sk.toLowerCase())) {
      matched.push(sk);
      score += 4;
    }
  }

  const evidenceMatches = analyzeKeywordGaps({ job, cvText: candidateEvidence, profile });
  for (const skill of unique([...evidenceMatches.onCv, ...evidenceMatches.promote])) {
    if (!matched.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      matched.push(skill);
      score += 4;
      reasons.push(`${skill} evidenced in ${evidenceMatches.onCv.includes(skill) ? 'CV / experience' : 'profile skills'}`);
    }
  }

  // Common stack terms asked but missing from strong/familiar
  const asked = unique(tokens(jobText)).filter((t) => t.length > 2);
  const known = new Set(
    [...skills.strong, ...skills.familiar, ...skills.learning, ...evidenceMatches.onCv, ...evidenceMatches.promote].map((s) => s.toLowerCase()),
  );
  const interesting = asked.filter((t) =>
    /^(python|java|kotlin|react|fastapi|django|docker|postgres|sql|typescript|javascript|aws|azure|kubernetes|node)$/i.test(t),
  );
  for (const t of interesting) {
    if (!known.has(t) && !known.has({ postgres: 'postgresql', node: 'node.js' }[t]) && !matched.map((m) => m.toLowerCase()).includes(t)) {
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
  }

  if (jobTitleAboveProfileSeniority(job.title, profile?.seniority)) {
    score -= 12;
    score = Math.min(score, 71);
    gaps.push('Seniority looks above profile target');
  }

  score = Math.max(0, Math.min(100, score));

  let verdict = 'Worth a shot';
  const nationalsOnly = flags.some((f) => f === 'nationals-only' || f === 'uae-nationals-only');
  if (nationalsOnly) { score = Math.min(score, 34); verdict = 'No'; }
  else if (score >= 72 && matched.length >= 2) verdict = 'Strong';
  else if (score < 35) verdict = 'No';
  else if (score < 50 || gaps.length >= 4) verdict = 'Stretch';

  const eligibility = assessRequirements(job, profile, candidateEvidence);
  for (const skill of evidenceMatches.gaps) {
    if (eligibility.requirements.some((r) => r.status === 'matched' && r.label.toLowerCase().startsWith(`${skill.toLowerCase()} `))) continue;
    const requiredLine = String(job.description || '').split(/[\n.!?]+/).find((line) =>
      mentions(line, skill) && /\b(required|mandatory|must|essential)\b/i.test(line)
      && !/\b(preferred|optional|a plus|nice.to.have)\b/i.test(line));
    if (requiredLine && !matched.some((m) => m.toLowerCase() === skill.toLowerCase())) {
      eligibility.requirements.push({ label: `${skill} required`, status: 'needs-checking', evidence: 'Not evidenced in profile or CV', posting: requiredLine });
      if (eligibility.status !== 'incompatible') eligibility.status = 'needs-checking';
    }
  }
  for (const requirement of eligibility.requirements) {
    if (requirement.status !== 'matched') gaps.push(`${requirement.status === 'incompatible' ? 'Mismatch' : 'Needs checking'}: ${requirement.label} — ${requirement.evidence}`);
    else reasons.push(`Requirement met: ${requirement.label} (${requirement.evidence})`);
  }
  if (eligibility.status === 'incompatible') { score = Math.min(score, 34); verdict = 'No'; }
  else if (eligibility.status === 'needs-checking') {
    score = Math.min(score, 71);
    if (verdict === 'Strong') verdict = 'Worth a shot';
  }

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
    eligibility,
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
