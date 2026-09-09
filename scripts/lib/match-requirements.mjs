const OPTIONAL = /\b(preferred|optional|nice.to.have|a plus|beneficial|von Vorteil|wünschenswert)\b/i;
const REQUIRED = /\b(required|mandatory|must|essential|minimum|at least|erforderlich|mindestens|voraussetzung)\b/i;
const LEVELS = ['none', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'fluent', 'native'];

export function withMatchingAnswers(profile, answers = {}) {
  const raw = answers.needsSponsorship;
  if (raw == null || String(raw).trim() === '') return profile;
  const answer = String(raw).trim().toLowerCase();
  const needsSponsorship = /^(yes|true)$/.test(answer) ? true : /^(no|false)$/.test(answer) ? false : null;
  return { ...profile, constraints: { ...profile.constraints, needsSponsorship } };
}

function candidateLanguage(profile, evidence, name) {
  const configured = Array.isArray(profile.languages)
    ? profile.languages.find((l) => typeof l === 'object' && String(l.name).toLowerCase() === name)?.level
    : Object.entries(profile.languages || {}).find(([key]) => key.toLowerCase() === name)?.[1];
  if (configured != null) return String(configured).toLowerCase();
  const notes = (profile.constraints?.notes || []).join('\n');
  if (new RegExp(`\\bno ${name}\\b|\\b${name}\\s*[:=-]?\\s*(?:none|no knowledge)`, 'i').test(notes)
    || (name !== 'english' && /\benglish[- ]only\b/i.test(notes))) return 'none';
  const match = `${notes}\n${evidence}`.match(new RegExp(`\\b${name}\\s*[:(=-]?\\s*(a1|a2|b1|b2|c1|c2|fluent|native)\\b|\\b(fluent|native)\\s+(?:in\\s+)?${name}\\b`, 'i'));
  return match ? (match[1] || match[2]).toLowerCase() : null;
}

export function assessRequirements(job, profile, evidence = '') {
  const requirements = [];
  const lines = String(job.description || '').split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const name of ['german', 'english', 'french', 'spanish', 'arabic']) {
    const line = lines.find((s) => new RegExp(`\\b${name}\\b`, 'i').test(s) && !OPTIONAL.test(s)
      && (REQUIRED.test(s) || /\b(fluent|fluency|native|c1|c2|b2)\b/i.test(s)));
    if (!line) continue;
    if (/\b(?:english|german|french|spanish|arabic)\s+(?:or|oder)\s+(?:english|german|french|spanish|arabic)\b/i.test(line)) {
      if (!requirements.some((r) => r.posting === line)) requirements.push({ label: 'Alternative language requirement', status: 'needs-checking',
        evidence: 'Confirm one of the accepted languages and proficiency levels', posting: line });
      continue;
    }
    const level = line.match(new RegExp(`\\b${name}\\s*[:(=-]?\\s*(a1|a2|b1|b2|c1|c2)\\b|\\b(a1|a2|b1|b2|c1|c2)\\s+(?:in\\s+)?${name}\\b`, 'i'));
    const required = (level?.[1] || level?.[2] || (/\b(fluent|fluency|native)\b/i.test(line) ? 'c1' : '')).toLowerCase();
    const candidate = candidateLanguage(profile, evidence, name);
    const candidateLevel = candidate === 'fluent' ? 'c1' : candidate === 'native' ? 'c2' : candidate;
    const mismatch = candidate === 'none' || (required && candidateLevel && LEVELS.indexOf(candidateLevel) >= 0
      && LEVELS.indexOf(candidateLevel) < LEVELS.indexOf(required));
    requirements.push({ label: `${name}${required ? ` ${required.toUpperCase()}` : ''} required`,
      status: mismatch ? 'incompatible' : required && candidate && LEVELS.includes(candidate) ? 'matched' : 'needs-checking',
      evidence: candidate ? `Candidate: ${candidate}` : 'Candidate proficiency not recorded', posting: line });
  }
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  for (const line of lines) {
    if (OPTIONAL.test(line)) continue;
    const m = line.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\+|[-–]\s*\d+)?\s*years?\s+(?:of\s+)?(?:[\w-]+\s+){0,3}experience\b/i);
    if (!m) continue;
    const years = Number(m[1]) || words[m[1].toLowerCase()];
    const explicit = profile.experienceYears;
    const known = typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0;
    // Total experience cannot prove years in a particular skill; only a shortfall
    // establishes incompatibility. Relevant experience remains a human check.
    requirements.push({ label: `${years}+ years of relevant experience`,
      status: known && explicit < years ? 'incompatible' : 'needs-checking',
      evidence: known ? `Profile records ${explicit} total years; confirm relevance` : 'Relevant years not recorded', posting: line });
  }
  if (/\b(no (?:visa )?sponsorship|cannot sponsor|unable to sponsor)\b/i.test(job.description || '')) {
    const needs = profile.constraints?.needsSponsorship;
    requirements.push({ label: 'Employer does not sponsor', status: needs === true ? 'incompatible' : needs === false ? 'matched' : 'needs-checking',
      evidence: typeof needs === 'boolean' ? `Needs sponsorship: ${needs}` : 'Sponsorship need not recorded' });
  }
  if (!String(job.description || '').trim()) requirements.push({ label: 'Full job description unavailable', status: 'needs-checking', evidence: 'Open the posting to check requirements' });
  return { requirements, status: requirements.some((r) => r.status === 'incompatible') ? 'incompatible'
    : requirements.some((r) => r.status === 'needs-checking') ? 'needs-checking' : 'matched' };
}
