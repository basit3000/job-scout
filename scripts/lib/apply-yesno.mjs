/**
 * Map saved-answer text onto LinkedIn Easy Apply yes/no questions.
 * Returns 'yes' | 'no' | null (null = do not guess).
 */

export function yesNoFromText(text) {
  const v = String(text || '').trim().toLowerCase();
  if (!v) return null;
  if (/depends|confirm before|maybe|unsure|tbd|not sure/.test(v)) return null;
  if (
    /^(no|n|nein|false|not required)\b/.test(v)
    || /\bno sponsorship\b|\bdo not need\b|\bdon't need\b|\bohne\b/.test(v)
  ) {
    return 'no';
  }
  if (
    /^(yes|y|ja|true)\b/.test(v)
    || /\bneed(s)? sponsorship\b|\brequire(s)? sponsorship\b/.test(v)
  ) {
    return 'yes';
  }
  return null;
}

export function yesNoForQuestion(label, pack = {}) {
  const b = String(label || '').toLowerCase();
  if (/gender|race|ethnic|veteran|disability|sexual|lgbt|pronoun|criminal/.test(b)) return null;
  if (/sponsor|visa support|immigration/.test(b)) {
    return yesNoFromText(pack.needsSponsorship);
  }
  if (/authorized to work|work author|legally (allowed|authorised|authorized)|arbeitserlaubnis|berechtigt/.test(b)) {
    return yesNoFromText(pack.workAuthorization);
  }
  if (/relocat|umziehen|umzug/.test(b)) {
    const cities = String(pack.citiesOpenTo || '').toLowerCase();
    if (/\ball\b|relocat|open/.test(cities)) return 'yes';
  }
  return null;
}
