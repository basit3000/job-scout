/**
 * One list of what a CV or cover letter may not sound like.
 *
 * Consumed by two things so they can never drift apart:
 *   - the agent briefs (cv-agent.mjs) print these rules to the model before it writes
 *   - the post-edit gate (cv-verify.mjs) checks the model's output against the same list
 *
 * Four tiers:
 *   FILLER       — adjectives/adverbs that add no fact. Safe to delete mechanically.
 *   AI_TELLS     — phrasing recruiters now read as generated. Reported line by line.
 *   WEAK_OPENERS — bullet starts that hide the verb. Reported.
 *   INFLATION    — seniority/scale words that are only allowed on real employment.
 */

export const WRITING_RULES_GENERIC = '.agents/skills/cv-tailor/references/writing-rules.md';
export const WRITING_RULES_LOCAL = '.agents/skills/cv-tailor.local/references/writing-rules.md';

/**
 * Safe to delete anywhere: removing them never changes a fact.
 * Deliberately excludes words that live inside real names ("Advanced Database Systems",
 * "Dynamic IP Updater", "strong typing") — those are only ever reported, never scrubbed.
 */
export const FILLER = [
  'successfully', 'effectively', 'efficiently', 'seamlessly', 'highly', 'truly', 'genuinely',
  'deeply', 'meticulously', 'meticulous', 'robust', 'comprehensive', 'cutting-edge',
  'state-of-the-art', 'innovative', 'passionate', 'results-driven', 'proven',
  'extensive', 'exceptional', 'world-class', 'best-in-class', 'impactful', 'invaluable',
  'holistic', 'various', 'multiple', 'several', 'seamless', 'elegant', 'sophisticated',
  'high-quality', 'top-notch', 'next-level',
];

/** Phrases that read as generated. Matched case-insensitively as whole words/phrases. */
export const AI_TELLS = [
  // verbs
  'leverage', 'leveraged', 'leveraging', 'utilize', 'utilized', 'utilise', 'utilised',
  'spearhead', 'spearheaded', 'orchestrate', 'orchestrated', 'delve', 'delved', 'empower',
  'empowered', 'elevate', 'elevated', 'harness', 'harnessed', 'foster', 'fostered', 'unlock',
  'unlocked', 'unleash', 'showcase', 'showcased', 'showcasing', 'champion', 'championed',
  'pioneer', 'pioneered', 'revolutionize', 'revolutionise', 'supercharge', 'streamline',
  'streamlined', 'drive impact', 'driving impact', 'deliver value', 'delivering value',
  'add value', 'adding value',
  // adjectives and nouns
  'synergy', 'synergies', 'game-changer', 'game-changing', 'transformative', 'pivotal',
  'crucial', 'vital', 'paramount', 'unparalleled', 'unwavering', 'landscape', 'tapestry',
  'testament', 'journey', 'realm', 'paradigm', 'fast-paced', 'ever-evolving', 'ever-changing',
  'mission-critical', 'enterprise-grade', 'wide range of', 'variety of', 'array of', 'plethora',
  'myriad', 'numerous', 'powerful', 'extensive experience', 'strong background',
  'strong expertise', 'strong experience', 'solid understanding', 'solid experience',
  'deep understanding', 'proven track record', 'track record', 'team player', 'self-starter',
  'detail-oriented', 'highly motivated', 'go-getter', 'thought leader', 'valuable asset',
  'meaningful contribution', 'meaningful impact', 'hit the ground running', 'wear many hats',
  'outside the box', 'above and beyond', 'at the forefront', 'well-versed', 'adept at',
  'possess', 'possesses', 'possessing',
  // letter clichés
  'i am excited', "i'm excited", 'excited to', 'thrilled', 'i am confident that',
  "i'm confident that", 'i am eager', 'eager to', 'keen to', 'aligns with', 'align with my',
  'aligned with my', 'resonates', 'resonate with', 'i believe i would be', 'i bring', 'i would bring',
  'perfect fit', 'ideal candidate', 'ideal fit', 'great fit', 'look forward to hearing',
  'do not hesitate', "don't hesitate", 'please feel free', 'time and consideration',
  'contribute to your success', 'in today\'s', 'in the ever', 'not only', 'but also',
  'furthermore', 'moreover', 'it is worth noting', "it's worth noting", 'needless to say',
  'in conclusion', 'to summarize', 'to summarise', 'overall,', 'ultimately,',
  'as a passionate', 'as an experienced', 'as a dedicated', 'as a highly',
];

/** Bullet openers that hide what was actually done. */
export const WEAK_OPENERS = [
  'responsible for', 'helped with', 'helped to', 'helped', 'assisted', 'assisted with',
  'worked on', 'worked with', 'involved in', 'participated in', 'tasked with', 'duties included',
  'in charge of', 'contributed to', 'supported', 'exposure to', 'familiar with',
];

/** Only allowed on real employment bullets, never on personal projects. */
export const INFLATION = [
  'led', 'leading', 'lead', 'mentored', 'mentoring', 'managed', 'managing', 'oversaw',
  'overseeing', 'supervised', 'directed', 'headed', 'architected', 'owned the roadmap',
  'owned', 'for thousands', 'thousands of users', 'at scale', 'production traffic',
  'enterprise', 'clients', 'customers', 'stakeholders', 'cross-functional', 'team of',
];

/** Verbs that pass. Printed in the brief so the model has a menu, not a ban list only. */
export const CONCRETE_VERBS = [
  'built', 'shipped', 'designed', 'wrote', 'replaced', 'migrated', 'automated', 'integrated',
  'added', 'extended', 'debugged', 'fixed', 'refactored', 'deployed', 'containerised',
  'containerized', 'implemented', 'modelled', 'modeled', 'tested', 'reviewed', 'maintained',
  'scaled', 'split', 'moved', 'wired', 'exposed', 'stored', 'queued', 'cached', 'documented',
];

/**
 * Quantified claims that models like to invent. The verifier requires the exact phrase
 * to exist in the evidence corpus; a bare "7" being somewhere in a date is not enough.
 */
export const SUSPECT_CLAIM_RE = /\b\d+(?:[.,]\d+)?\s*\+?\s*(?:%|percent|prozent|years?|yrs|jahren?|months?|engineers?|developers?|people|members?|users?|customers?|clients?|teams?|services?|microservices|requests?|rps|qps|ms|tps|countries|markets|stores?|projects?|repositories|repos|commits?|stars?|downloads?|installs?|million|billion|thousand|k|m|x)(?![a-z0-9])|\bteam of \d+|\b\d+[.,]\d{3}\b/gi;

export const LETTER_LIMITS = {
  minWords: 200,
  maxWords: 400,
  minParagraphs: 3,
  maxParagraphs: 7,
  maxSentenceWords: 38,
};

export const CV_LIMITS = {
  maxBulletChars: 230,
  maxHeadlineChars: 110,
};

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseRe(list) {
  const alts = [...list]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|');
  // \b does not sit well before an apostrophe or after a comma; handle both ends loosely.
  return new RegExp(`(?<![A-Za-z0-9-])(?:${alts})(?![A-Za-z0-9-])`, 'gi');
}

const FILLER_RE = phraseRe(FILLER);
const AI_RE = phraseRe(AI_TELLS);
const INFLATION_RE = phraseRe(INFLATION);
const WEAK_OPENER_RE = new RegExp(
  `^\\s*(?:${[...WEAK_OPENERS].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})\\b`,
  'i',
);

function excerpt(text, index, width = 70) {
  const start = Math.max(0, index - width / 2);
  const end = Math.min(text.length, index + width / 2);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Find style problems in prose.
 * @param {string} text
 * @param {{ context?: 'cv'|'letter', personalProject?: boolean, bullet?: boolean }} opts
 * @returns {Array<{ kind: string, severity: 'hard'|'soft', phrase: string, excerpt: string }>}
 */
export function findStyleIssues(text, { context = 'cv', personalProject = false, bullet = false } = {}) {
  const src = String(text ?? '');
  const issues = [];
  const seen = new Set();
  const add = (kind, severity, phrase, index) => {
    const key = `${kind}:${phrase.toLowerCase()}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ kind, severity, phrase, excerpt: excerpt(src, index) });
  };

  for (const m of src.matchAll(AI_RE)) add('ai-tell', 'soft', m[0], m.index);
  for (const m of src.matchAll(FILLER_RE)) add('filler', 'soft', m[0], m.index);
  if (personalProject) {
    for (const m of src.matchAll(INFLATION_RE)) add('inflation', 'hard', m[0], m.index);
  }
  if (bullet) {
    const w = src.match(WEAK_OPENER_RE);
    if (w) add('weak-opener', 'soft', w[0].trim(), 0);
    if (src.length > CV_LIMITS.maxBulletChars) {
      add('length', 'soft', `${src.length} chars (max ${CV_LIMITS.maxBulletChars})`, 0);
    }
  }
  for (const m of src.matchAll(/(?<!<)!(?!--)/g)) add('exclamation', 'hard', '!', m.index); // not <!-- -->
  if (context === 'letter') {
    for (const m of src.matchAll(/—|–|\s-\s/g)) add('dash', 'soft', m[0].trim() || '-', m.index);
    for (const m of src.matchAll(/\?/g)) add('rhetorical-question', 'soft', '?', m.index);
    for (const m of src.matchAll(/\brole at\b[^.\n]{0,80}\bis for\b/gi)) {
      add('job-restatement', 'hard', m[0].trim(), m.index);
    }
  } else {
    for (const m of src.matchAll(/—/g)) add('dash', 'soft', '—', m.index);
  }
  return issues;
}

/**
 * Delete filler adjectives/adverbs. Facts survive; tone tightens.
 * Leaves the first word of a sentence alone when it is the only word (never empties text).
 */
export function scrubFiller(text) {
  const src = String(text ?? '');
  const removed = [];
  let out = src.replace(FILLER_RE, (m) => {
    removed.push(m);
    return '';
  });
  out = out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/,\s*,/g, ',')
    .replace(/^\s+|\s+$/g, '');
  if (!out.trim()) return { text: src, removed: [] };
  // Re-capitalise a sentence whose first word was deleted.
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (m, lead, ch) => lead + ch.toUpperCase());
  return { text: out, removed };
}

/** Word count of prose, ignoring markdown/LaTeX noise. */
export function wordCount(text) {
  return String(text ?? '')
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/**
 * Human-readable rules for the agent brief. One source; the verifier enforces the same.
 */
export function styleRulesMarkdown({ context = 'cv' } = {}) {
  const lines = [
    '## Reads human, not generated (checked after you finish)',
    '',
    'Write simple English. Grammatically correct. Short sentences, one idea each. Common words.',
    'Do not sound like a native copywriter or like ChatGPT. Do not polish the text into fluent idiom.',
    'Correct grammar only. Name the system (the service, the table, the API), not how good the work is.',
    'Never stack adjectives. Do not summarise what the bullets already say.',
    '',
    `- Banned filler (deleted mechanically if you use them): ${FILLER.join(', ')}.`,
    `- Banned generated-sounding phrases (reported line by line): ${AI_TELLS.join('; ')}.`,
    `- Bullets never start with: ${WEAK_OPENERS.join(', ')}.`,
    `- Personal projects never carry: ${INFLATION.join(', ')}. "Designed and built, sole author" is the ceiling.`,
    `- Good verbs: ${CONCRETE_VERBS.join(', ')}.`,
    '- No exclamation marks. No em dashes. No rhetorical questions.',
    '- A number goes on the page only if it is already in the evidence pack, the current CV, or the candidate profile.',
  ];
  if (context === 'letter') {
    lines.push(
      `- Body ${LETTER_LIMITS.minWords}–${LETTER_LIMITS.maxWords} words, ${LETTER_LIMITS.minParagraphs}–${LETTER_LIMITS.maxParagraphs} paragraphs, no sentence over ${LETTER_LIMITS.maxSentenceWords} words.`,
      '- Do not open with "I am writing to apply". Do not close with "I look forward to hearing from you".',
      '- Do not praise the company. Do not state a company fact that is not in the posting.',
      '- Do not write "The [role] at [company] is for [work]". The subject line already names the role.',
      '- Do not restate the CV; pick the two or three facts this posting asks for and say them in simple sentences.',
      '- Sound like the candidate: clear, basic, correct. Not a native-speaker cover letter and not an LLM.',
    );
  } else {
    lines.push(
      `- One line per bullet where possible; hard ceiling ${CV_LIMITS.maxBulletChars} characters.`,
      '- Name the technology inside the sentence, not as a trailing "(Python, Docker)" tag.',
      '- Same voice as a careful non-native: correct grammar, simple words. Do not upgrade into native idiom.',
    );
  }
  lines.push('');
  return lines.join('\n');
}
