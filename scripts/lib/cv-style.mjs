// Optional style preferences are advisory; factual validation lives in cv-verify.mjs.
import { defaultPromptSettings } from './prompt-settings.mjs';

export const WRITING_RULES_GENERIC = '.agents/skills/cv-tailor/references/writing-rules.md';

export const SUSPECT_CLAIM_RE = /\b\d+(?:[.,]\d+)?\s*\+?\s*(?:%|percent|prozent|years?|yrs|jahren?|months?|engineers?|developers?|people|members?|users?|customers?|clients?|teams?|services?|microservices|requests?|rps|qps|ms|tps|countries|markets|stores?|projects?|repositories|repos|commits?|stars?|downloads?|installs?|million|billion|thousand|k|m|x)(?![a-z0-9])|\bteam of \d+|\b\d+[.,]\d{3}\b/gi;

const escapeRe = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function phraseRe(words) {
  return new RegExp(`(?<![A-Za-z0-9-])(?:${words.map(escapeRe).join('|')})(?![A-Za-z0-9-])`, 'gi');
}

export function findStyleIssues(text, { context = 'cv', bullet = false, settings = defaultPromptSettings() } = {}) {
  const src = String(text ?? '');
  const style = settings.style;
  const issues = [];
  const add = (kind, phrase) => issues.push({ kind, severity: 'soft', phrase, excerpt: src.slice(0, 140) });
  for (const [kind, words] of [['filler', style.filler], ['wording', style.discouragedPhrases]]) {
    if (words.length) for (const match of src.matchAll(phraseRe(words))) add(kind, match[0]);
  }
  if (bullet) {
    if (style.weakOpeners.length) {
      const opener = src.match(new RegExp(`^\\s*(?:${style.weakOpeners.map(escapeRe).join('|')})\\b`, 'i'));
      if (opener) add('weak-opener', opener[0].trim());
    }
    if (style.maxBulletChars && src.length > style.maxBulletChars) add('length', `${src.length} chars (target ${style.maxBulletChars})`);
  }
  if (style.avoidDashes) for (const m of src.matchAll(context === 'letter' ? /[\u2014\u2013]|\s-\s/g : /\u2014/g)) add('dash', m[0]);
  return issues;
}

// Explicitly opt-in: word removal can change meaning, so the default is no deletion.
export function scrubFiller(text, words = []) {
  const src = String(text ?? '');
  if (!words.length) return { text: src, removed: [] };
  const removed = [];
  let out = src.replace(phraseRe(words), match => { removed.push(match); return ''; });
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/,\s*,/g, ',').trim();
  if (!out) return { text: src, removed: [] };
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (match, lead, char) => lead + char.toUpperCase());
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


export function styleRulesMarkdown({ context = 'cv', settings = defaultPromptSettings() } = {}) {
  const s = settings.style;
  const lines = [];
  if (s.discouragedPhrases.length) lines.push(`Prefer alternatives to these configured phrases when appropriate: ${s.discouragedPhrases.join(', ')}.`);
  if (s.filler.length) lines.push(`Review these configured filler words in context: ${s.filler.join(', ')}.`);
  if (s.avoidDashes) lines.push('Prefer sentences without em dashes or spaced hyphen asides.');
  if (context === 'cv') {
    if (s.weakOpeners.length) lines.push(`Prefer more specific openings where supported: ${s.weakOpeners.join(', ')}.`);
    if (s.maxBulletChars) lines.push(`Aim for bullets within ${s.maxBulletChars} characters.`);
    if (s.maxHeadlineChars) lines.push(`Aim for a headline within ${s.maxHeadlineChars} characters.`);
  } else {
    if (s.minLetterWords) lines.push(`Aim for at least ${s.minLetterWords} body words.`);
    if (s.maxLetterWords) lines.push(`Aim for at most ${s.maxLetterWords} body words.`);
    if (s.maxSentenceWords) lines.push(`Prefer sentences within ${s.maxSentenceWords} words.`);
  }
  return lines.join('\n');
}
