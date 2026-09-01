/**
 * First-screen keyword gap (Rezi / Jobscan style).
 * Classifies posting phrases as already on the CV, evidenced but missing,
 * or not evidenced (must not be invented).
 */

const INFLATED_TITLE = /\b(senior|staff|principal|lead|head|director|architect)\b/i;

/** Longest aliases first when matching. */
const PHRASES = [
  { canon: 'REST API', aliases: ['rest apis', 'rest api', 'rest-api', 'rest-apis', 'rest-schnittstellen', 'rest-schnittstelle'] },
  { canon: 'Spring Boot', aliases: ['spring boot', 'springboot'] },
  { canon: 'Next.js', aliases: ['next.js', 'nextjs', 'next js'] },
  { canon: 'Node.js', aliases: ['node.js', 'nodejs', 'node'] },
  { canon: 'CI/CD', aliases: ['ci/cd', 'ci-cd', 'continuous integration'] },
  { canon: 'PostgreSQL', aliases: ['postgresql', 'postgres'] },
  { canon: 'TypeScript', aliases: ['typescript'] },
  { canon: 'JavaScript', aliases: ['javascript'] },
  { canon: 'LiteLLM', aliases: ['litellm'] },
  { canon: 'OpenAI', aliases: ['openai', 'openai api'] },
  { canon: 'FastAPI', aliases: ['fastapi'] },
  { canon: 'MongoDB', aliases: ['mongodb'] },
  { canon: 'ArgoCD', aliases: ['argocd', 'argo cd'] },
  { canon: 'Jenkins', aliases: ['jenkins'] },
  { canon: 'Docker', aliases: ['docker'] },
  { canon: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { canon: 'React', aliases: ['react'] },
  { canon: 'Python', aliases: ['python'] },
  { canon: 'Flask', aliases: ['flask'] },
  { canon: 'Django', aliases: ['django'] },
  { canon: 'Java', aliases: ['java'] },
  { canon: 'Kotlin', aliases: ['kotlin'] },
  { canon: 'SQL', aliases: ['sql'] },
  { canon: 'MySQL', aliases: ['mysql'] },
  { canon: 'AWS', aliases: ['aws'] },
  { canon: 'LLM', aliases: ['llms', 'llm', 'large language model'] },
  { canon: 'code review', aliases: ['code reviews', 'code review', 'code-review'] },
  { canon: 'testing', aliases: ['unit tests', 'unit testing', 'end-to-end', 'e2e', 'pytest'] },
  { canon: 'monitoring', aliases: ['production monitoring', 'observability', 'monitoring'] },
  { canon: 'microservices', aliases: ['microservices', 'microservice'] },
  { canon: 'full-stack', aliases: ['full-stack', 'fullstack', 'full stack', 'vollstack'] },
  { canon: 'back-end', aliases: ['back-end', 'backend', 'back end'] },
  { canon: 'front-end', aliases: ['front-end', 'frontend', 'front end'] },
  { canon: 'Softwareentwickler', aliases: ['softwareentwickler', 'softwareentwicklerin'] },
];

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPhrase(haystack, phrase) {
  const aliases = [phrase.canon, ...(phrase.aliases || [])];
  const text = String(haystack || '').toLowerCase();
  return aliases.some((a) => {
    const needle = a.toLowerCase();
    if (needle.length <= 3) return new RegExp(`\\b${escapeRe(needle)}\\b`, 'i').test(text);
    return text.includes(needle);
  });
}

export function isGermanPosting(job) {
  const text = `${job?.title || ''} ${job?.description || ''}`;
  return /[äöüÄÖÜß]/.test(text)
    || /\b(m\/w\/d|w\/m\/d|d\/m\/w|kenntnisse|berufserfahrung|bewerbung|vollzeit|festanstellung|softwareentwickler|anforderungen|aufgaben)\b/i.test(text);
}

/** Posting language for Results filters: `de` or `en`. */
export function detectPostingLanguage(job) {
  return isGermanPosting(job) ? 'de' : 'en';
}

export function jobMatchesLanguageFilter(job, lang) {
  if (!lang || lang === 'all') return true;
  const detected = job?.language || detectPostingLanguage(job);
  return detected === lang;
}

export function honestHeadlineTitle(jobTitle, targetRole = 'Software Developer') {
  const raw = String(jobTitle || '').trim();
  const fallback = String(targetRole || 'Software Developer').trim() || 'Software Developer';
  if (!raw) return fallback;
  if (INFLATED_TITLE.test(raw)) {
    return fallback;
  }
  if (/\b(software\s*(developer|engineer)|full[-\s]?stack|backend|front[-\s]?end|python|java|typescript)\b/i.test(raw)) {
    return raw.replace(/\s+/g, ' ').slice(0, 48);
  }
  return fallback;
}

export function extractPostingPhrases(job) {
  const text = `${job?.title || ''}\n${job?.description || ''}`;
  const found = [];
  const seen = new Set();
  for (const phrase of PHRASES) {
    if (!hasPhrase(text, phrase)) continue;
    const key = phrase.canon.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(phrase);
  }
  return found;
}

/**
 * @returns {{
 *   onCv: string[],
 *   promote: string[],
 *   gaps: string[],
 *   headline: string,
 *   german: boolean,
 * }}
 */
export function analyzeKeywordGaps({ job, cvText = '', evidenceText = '', profile = {} } = {}) {
  const phrases = extractPostingPhrases(job);
  const cv = String(cvText || '');
  const evidence = `${evidenceText}\n${(profile.skills?.strong || []).join(' ')}\n${(profile.skills?.familiar || []).join(' ')}`;
  const onCv = [];
  const promote = [];
  const gaps = [];

  for (const phrase of phrases) {
    if (hasPhrase(cv, phrase)) onCv.push(phrase.canon);
    else if (hasPhrase(evidence, phrase)) promote.push(phrase.canon);
    else gaps.push(phrase.canon);
  }

  const headlineSkills = [...onCv, ...promote].slice(0, 5);
  const title = honestHeadlineTitle(job?.title, profile.targetRole || profile.headline);
  const headline = headlineSkills.length
    ? `${title} — ${headlineSkills.join(', ')}`
    : title;

  return {
    onCv,
    promote,
    gaps,
    headline,
    german: isGermanPosting(job),
    postingPhraseCount: phrases.length,
  };
}

export function formatKeywordGapsMarkdown(analysis, job = {}) {
  const a = analysis || {};
  const lines = [
    '# First-screen keyword gaps',
    '',
    `Job: ${job.title || '?'} @ ${job.company || '?'}`,
    a.german ? 'Posting language: German — pair English tech names with the German role noun when true.' : 'Posting language: English.',
    '',
    `Suggested headline (honest title + evidenced JD skills): **${a.headline || ''}**`,
    '',
    '## Already on the CV (keep / lead with these)',
    '',
    ...(a.onCv?.length ? a.onCv.map((s) => `- ${s}`) : ['- _(none matched)_']),
    '',
    '## Evidenced but missing from the current CV (promote into headline, skills, or a bullet)',
    '',
    ...(a.promote?.length ? a.promote.map((s) => `- ${s}`) : ['- _(none)_']),
    '',
    '## In the posting, not evidenced (do not invent)',
    '',
    ...(a.gaps?.length ? a.gaps.map((s) => `- ${s}`) : ['- _(none)_']),
    '',
    'Every **Already** / **Promote** phrase that you claim must appear in a bullet, not only the Skills line.',
    'AI screeners (Ashby, Greenhouse, Workday copilots) quote an evidence sentence — Skills-only hits often score “does not meet”.',
    '',
  ];
  return lines.join('\n');
}
