/**
 * One list of what a CV or cover letter may not sound like.
 *
 * Consumed by two things so they can never drift apart:
 *   - the agent briefs (cv-agent.mjs) print these rules to the model before it writes
 *   - the post-edit gate (cv-verify.mjs) checks the model's output against the same list
 *
 * Three tiers:
 *   FILLER       — adjectives/adverbs that add no fact. Safe to delete mechanically.
 *   AI_TELLS     — phrasing recruiters now read as generated. Reported line by line.
 *   WEAK_OPENERS — bullet starts that hide the verb. Reported.
 *   INFLATION    — seniority/scale words that are only allowed on real employment.
 */

/**
 * Safe to delete anywhere: removing them never changes a fact.
 * Deliberately excludes words that live inside real names ("Advanced Database Systems",
 * "Dynamic IP Updater", "strong typing") — those are only ever reported, never scrubbed.
 */
export const FILLER = [];

/** Phrases that read as generated. Matched case-insensitively as whole words/phrases. */
export const AI_TELLS = [];

/** Bullet openers that hide what was actually done. */
export const WEAK_OPENERS = [];

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

export const LETTER_LIMITS = { minWords: 0, maxWords: Infinity, minParagraphs: 0, maxParagraphs: Infinity, maxSentenceWords: Infinity };

export const CV_LIMITS = { maxBulletChars: Infinity, maxHeadlineChars: Infinity };

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseRe(list) {
  if (!list.length) return /(?!)/g;
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
const WEAK_OPENER_RE = /(?!)/;

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
  if (context === 'letter') {
  } else {
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
export function styleRulesMarkdown() {
  return "Use supported facts and the candidate-selected local wording and format settings.";
}
