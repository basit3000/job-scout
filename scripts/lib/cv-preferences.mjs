import { readMemorySync } from './memory.mjs';

// Opt-in candidate preferences. An absent setting preserves the shared defaults.
export function cvPreferences(memory = readMemorySync()) {
  const saved = memory?.preferences?.cvCustomization;
  if (saved?.enabled !== true) return {};
  return {
    enabled: true,
    allowExperienceSelection: saved.allowExperienceSelection === true,
    summaryWhenHelpful: saved.summaryWhenHelpful === true,
    allowFillerWhenUseful: saved.allowFillerWhenUseful === true,
  };
}

export function validateCvOptions(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid CV options.');
  const keys = ['matchHeadline', 'matchKeywords', 'equivalentRoleTitle', 'city'];
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unknown CV option.');
  for (const key of keys.filter(key => key !== 'city')) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`Invalid ${key} option.`);
  }
  if (value.city !== undefined && (typeof value.city !== 'string' || value.city.length > 100 || /[\r\n\x00-\x1f]/.test(value.city))) throw new Error('Enter a city of up to 100 characters.');
  const city = (value.city || '').trim();
  return { matchHeadline: value.matchHeadline === true, matchKeywords: value.matchKeywords === true,
    equivalentRoleTitle: value.equivalentRoleTitle === true, city };
}

export function cvOptionsInstructions(options, memory) {
  if (!options) return '';
  if (!cvPreferences(memory).enabled) throw new Error('Personal CV options are not enabled in Memory.');
  const choices = validateCvOptions(options);
  return [
    '## Selected CV options for this application (override saved style defaults)',
    choices.matchHeadline
      ? 'Match the CV headline to the posting title only where the duties and seniority are supported. Do not invent qualifications or copy gender markers, location, or requisition codes.'
      : 'Keep the existing CV headline title. Do not rename it to match the posting.',
    choices.matchKeywords
      ? 'Place relevant, evidenced posting keywords naturally in matching Experience or Projects bullets, then Skills. Avoid stuffing, repetition, and unsupported terms.'
      : 'Do not run a keyword-insertion pass. Preserve existing supported terminology; normal relevance edits are allowed.',
    choices.equivalentRoleTitle
      ? 'You may add a truthful functional role label beside an Experience entry when its duties support an equivalent posting title. Keep the official title unchanged in its original heading or LaTeX role macro; show the functional label separately. Never upgrade seniority.'
      : 'Keep Experience titles unchanged; do not add alternative role labels.',
    choices.city
      ? `Use this target work city in the header as "Preferred location: <city>": ${JSON.stringify(choices.city)}. No relocation wording is needed. This is a work-location preference, not confirmed residence. Do not change employment locations or persist it as a home-address fact.`
      : 'Keep the saved contact-location preference. Do not infer residence from the job location.',
  ].join('\n');
}

export function personalCvRules(policy = {}) {
  if (!policy.enabled) return '';
  return ['## Personal CV policy (overrides generic style rules)',
    policy.allowExperienceSelection
      ? 'Experience selection is enabled. Condensing, combining, reordering or excluding a source bullet requires an existing copy in the Memory experience library. Retain all employment identities, official titles, dates and qualifications. Keep any unarchived bullet in the document and report the missing archive entry. This workflow must not edit Memory.' : '',
    policy.summaryWhenHelpful ? 'If the candidate enables a summary, include one only when it provides supported context beyond the existing headline and experience bullets.' : '',
    policy.allowFillerWhenUseful ? 'Avoid filler and stock phrases, but allow them when they fit naturally and help the sentence. Judge in context; do not remove them mechanically or fail a review for their presence alone.' : '',
    'Per-application title, keyword and preferred-city choices take priority over saved defaults. Changes must remain factually supported.',
  ].filter(Boolean).join('\n');
}

// The LaTeX extractor spaces dashes and retains escaped punctuation; Memory
// imports may hold plain text. Keep words, numbers and punctuation significant.
export const normalizeExperience = text => String(text)
  .replace(/\\([%&#$_])/g, '$1')
  .replace(/--|[–—]/g, '-')
  .replace(/\s*-\s*/g, ' - ')
  .replace(/\s+/g, ' ').trim().toLowerCase();
export function experienceIsArchived(bullets, memory) {
  const library = memory?.facts?.experienceLibrary;
  if (!Array.isArray(library?.documents) || !bullets.length) return false;
  const saved = new Set(library.documents.flatMap(doc => doc.bullets || []).map(normalizeExperience));
  return bullets.every(bullet => saved.has(normalizeExperience(bullet)));
}
