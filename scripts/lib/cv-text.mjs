/**
 * Text rules applied to every rendered CV, whatever wrote the markdown.
 *
 * Em and en dashes are the clearest "written by a model" tell a recruiter can
 * spot, so they never reach the page. This runs at render time rather than as a
 * prompt instruction, so it holds even when the agent forgets.
 *
 * Hyphens inside words stay: "real-time", "AI-native" and "SAT-based" are
 * ordinary English compounds, not asides.
 */

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|'
  + 'Mär|Mai|Okt|Dez|January|February|March|April|June|July|August|September|'
  + 'October|November|December)';
const OPEN_END = '(?:Present|present|Now|now|Today|today|Heute|heute|Current|current)';

// "Mar 2026 – Present", "2022–2026", "Oct 2022 - Aug 2026"
const DATE_RANGE = new RegExp(
  `(${MONTH}\\.?\\s+\\d{4}|\\b\\d{4})\\s*[\\u2012-\\u2015\\u2212-]\\s*(${MONTH}\\.?\\s+\\d{4}|\\b\\d{4}|${OPEN_END})`,
  'g',
);

/**
 * Replace dash punctuation with something a human would have typed.
 * @param {string} text one field of CV prose — never a URL
 */
export function sanitizeDashes(text) {
  let s = String(text ?? '');

  // Date ranges read naturally with "to".
  s = s.replace(DATE_RANGE, '$1 to $2');

  // "**Project name** — description" is a definition, so a colon fits.
  s = s.replace(/(\*\*[^*]+\*\*)\s*[‒-―−]\s*/g, '$1: ');
  s = s.replace(/(\*\*[^*]+\*\*)\s+-\s+/g, '$1: ');

  // A leading dash is a bullet the renderer already drew.
  s = s.replace(/^\s*[‒-―−-]\s+/, '');

  // Any other aside becomes a comma. Avoid doubling punctuation.
  s = s.replace(/\s*[‒-―−]\s*/g, ', ');
  s = s.replace(/(\S)\s+-\s+(\S)/g, '$1, $2');
  s = s.replace(/,\s*,/g, ',').replace(/([,;:])\s*,/g, '$1');
  s = s.replace(/\s+,/g, ',');

  return s.trim();
}

/**
 * Same rule for a label/value pair where the value already carries its own
 * separator, e.g. "English — Fluent · German — B1".
 */
export function sanitizeInline(text) {
  return sanitizeDashes(text).replace(/,\s*·/g, ' ·');
}
