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

const YEARS = {
  internship: 0,
  intern: 0,
  entry: 1,
  junior: 2,
  mid: 4,
  'mid-level': 4,
  senior: 6,
  lead: 8,
  principal: 8,
  executive: 12,
  any: 3,
};

export function yearsFromSeniority(seniority) {
  const key = String(seniority || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(YEARS, key) ? YEARS[key] : 3;
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
  if (/18 years|over 18|at least 18|volljährig/.test(b)) return 'yes';
  if (/previously (been )?employed|former employee|worked (for|at) (us|this company)|already work(ed)? (here|at)/.test(b)) {
    return 'no';
  }
  if (/do you have (experience|knowledge|skills)|hast du erfahrung|erfahrung mit/.test(b)) {
    const list = skills(pack);
    if (!list.length) return 'yes';
    return list.some((s) => b.includes(s)) ? 'yes' : 'no';
  }
  if (/willing to|comfortable|able to|can you|are you open|bereit/.test(b) && !/sponsor|visa/.test(b)) {
    return 'yes';
  }
  return null;
}

export function yearsForQuestion(label, pack = {}) {
  const b = String(label || '').toLowerCase();
  if (!/year|jahre|erfahrung|experience/.test(b)) return null;
  const base = yearsFromSeniority(pack.seniority);
  const list = skills(pack);
  const hit = list.find((s) => s.length > 1 && b.includes(s));
  if (hit) return base;
  if (/how many years|years of (work )?experience|anzahl der jahre|jahre (berufs)?erfahrung/.test(b)) return base;
  return base;
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
  if (/phd|doctor/.test(d)) return pick(/ph\.?d|doctor|doktor/i) || pick(/master/i);
  if (/master|msc|m\.sc/.test(d)) return pick(/master|msc|m\.sc/i);
  if (/bachelor|bsc|b\.sc|b\.eng/.test(d)) return pick(/bachelor|bsc|b\.sc/i);
  return pick(/bachelor/i) || pick(/master/i) || null;
}

function matchLanguage(options) {
  return (
    options.find((o) => /professional|fluent|fließend|verhandlungssicher|native|muttersprach/i.test(o))
    || options.find((o) => /full professional|business/i.test(o))
    || null
  );
}

export function answerAdditionalQuestion(label, options = [], pack = {}) {
  const opts = options.map((o) => String(o).trim()).filter((o) => o && !isPlaceholderValue(o));
  const b = String(label || '').toLowerCase();

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
    return matchLanguage(opts);
  }

  if (/hear about|how did you (find|hear)|woher hast|aufmerksam/.test(b) && opts.length) {
    return opts.find((o) => /linkedin/i.test(o)) || opts.find((o) => /other|sonst/i.test(o)) || opts[0];
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
