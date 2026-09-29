/**
 * Answers for LinkedIn Easy Apply "additional questions" (page 3+):
 * Yes/No, years of experience, education, language, leftover selects.
 */

import { valueForField } from './apply-fill-match.mjs';
import { yesNoForQuestion as yesNoBase } from './apply-yesno.mjs';

export function isPlaceholderValue(value) {
  const s = String(value || '').trim().toLowerCase();
  return !s || /^(select an option|select|please select|choose|bitte wählen|wählen sie|wählen|-|n\/a)$/i.test(s);
}

export function savedQuestionAnswer(label, pack = {}) {
  const key = String(label || '').trim().toLowerCase();
  const entry = Object.entries(pack.savedAnswers || {}).find(([question]) => question.trim().toLowerCase() === key);
  return entry ? String(entry[1]).trim() : null;
}

function skills(pack) {
  return (pack.skills || []).map((s) => String(s).toLowerCase()).filter(Boolean);
}

export function yesNoForQuestion(label, pack = {}) {
  const known = yesNoBase(label, pack);
  if (known) return known;
  const b = String(label || '').toLowerCase();
  if (/gender|race|ethnic|veteran|disability|sexual|lgbt|pronoun|criminal|conviction/.test(b)) return null;
  if (/sponsor|visa support|immigration/.test(b)) return null;

  if (/commute|on-?site|this (job'?s )?location|this office|this city|vor ort|bereit.*standort/.test(b)) {
    const cities = String(pack.citiesOpenTo || '').toLowerCase();
    const remote = String(pack.remotePreference || '').toLowerCase();
    if (/\ball\b|relocat|open|yes|ja/.test(cities) || /hybrid|on-?site|open/.test(remote)) return 'yes';
    if (pack.willingToRelocate === true || /true|yes/i.test(String(pack.willingToRelocate || ''))) return 'yes';
  }
  if (/relocat|umziehen/.test(b)) {
    if (pack.willingToRelocate === true || /true|yes/i.test(String(pack.willingToRelocate || ''))) return 'yes';
    if (/\ball\b|relocat|open/.test(String(pack.citiesOpenTo || '').toLowerCase())) return 'yes';
  }
  if (/remote/.test(b) && /open|yes|true/i.test(String(pack.openToRemote ?? pack.remotePreference ?? ''))) {
    return 'yes';
  }
  if (/do you have (experience|knowledge|skills)|hast du erfahrung|erfahrung mit/.test(b)) {
    return skills(pack).some(skill => b.includes(skill)) ? 'yes' : null;
  }
  return null;
}

export function yearsForQuestion(label, pack = {}) {
  const answer = savedQuestionAnswer(label, pack);
  return answer != null && /^\d+(?:\.\d+)?$/.test(answer) ? Number(answer) : null;
}

export function matchYesNoOption(options, yn) {
  const want = yn === 'yes' ? /^(yes|ja|true|y)$/i : /^(no|nein|false|n)$/i;
  return options.find((o) => want.test(String(o).trim())) || null;
}

export function matchYearOption(options, years) {
  const y = Number(years);
  if (!Number.isFinite(y)) return null;
  const trimmed = options.map((o) => String(o).trim()).filter((o) => !isPlaceholderValue(o));
  const exact = trimmed.find((o) => o === String(y) || o === `${y}+` || o === `${y}+ years`);
  if (exact) return exact;
  const word = trimmed.find((o) => new RegExp(`^${y}\\s*(\\+|\\+?\\s*years?|jahre?)?$`, 'i').test(o));
  if (word) return word;
  const nums = trimmed
    .map((o) => ({ o, n: parseInt(o, 10) }))
    .filter((x) => Number.isFinite(x.n));
  if (!nums.length) return String(y);
  nums.sort((a, b) => Math.abs(a.n - y) - Math.abs(b.n - y));
  return nums[0].o;
}

function matchEducation(options, degree) {
  const d = String(degree || '').toLowerCase();
  const pick = (re) => options.find((o) => re.test(o));
  if (/phd|doctor/.test(d)) return pick(/ph\.?d|doctor|doktor/i);
  if (/master|msc|m\.sc/.test(d)) return pick(/master|msc|m\.sc/i);
  if (/bachelor|bsc|b\.sc|b\.eng/.test(d)) return pick(/bachelor|bsc|b\.sc/i);
  return null;
}

export function answerAdditionalQuestion(label, options = [], pack = {}) {
  const opts = options.map((o) => String(o).trim()).filter((o) => o && !isPlaceholderValue(o));
  const b = String(label || '').toLowerCase();
  const saved = savedQuestionAnswer(label, pack);
  if (saved) return opts.length ? opts.find(option => option.toLowerCase() === saved.toLowerCase()) || null : saved;

  const yn = yesNoForQuestion(label, pack);
  if (yn && opts.length) {
    const hit = matchYesNoOption(opts, yn);
    if (hit) return hit;
  }

  if (/how many years|years of|jahre/.test(b)) {
    const y = yearsForQuestion(label, pack);
    if (y == null) return null;
    if (opts.length) return matchYearOption(opts, y);
    return String(y);
  }

  if (/education|degree|abschluss|highest level/.test(b) && opts.length) {
    return matchEducation(opts, pack.educationDegree);
  }

  if (/english|deutsch|german|language|sprache|proficiency|sprachkennt/.test(b) && !/years/.test(b) && opts.length) {
    return null;
  }

  if (/hear about|how did you (find|hear)|woher hast|aufmerksam/.test(b) && opts.length) {
    return null;
  }

  if (/country|land/.test(b) && /phone|telefon/.test(b) && opts.length) {
    const phone = String(pack.phone || '');
    if (phone.startsWith('+49') || phone.startsWith('0049')) {
      return opts.find((o) => /germany|deutschland|\+49/i.test(o)) || null;
    }
  }

  const fromPack = valueForField({ label, type: 'text' }, pack);
  if (fromPack && opts.length) {
    const want = fromPack.toLowerCase();
    return opts.find((o) => o.toLowerCase().includes(want) || want.includes(o.toLowerCase())) || fromPack;
  }
  return fromPack || (yn && opts.length ? matchYesNoOption(opts, yn) : null);
}
