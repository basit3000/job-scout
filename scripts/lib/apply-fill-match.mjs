/**
 * Pure field matching for application forms.
 * Each export is self-contained so it can be serialized into a bookmarklet.
 * Never returns a value for submit/legal/diversity fields.
 */

export function fieldBlob(meta = {}) {
  const parts = [meta.name, meta.id, meta.label, meta.placeholder, meta.autocomplete, meta.ariaLabel]
    .filter(Boolean);
  const fromIds = [meta.name, meta.id]
    .filter(Boolean)
    .map((s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2'))
    .join(' ');
  return [...parts, fromIds]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shouldSkipField(meta = {}) {
  const type = String(meta.type || '').toLowerCase();
  if (['password', 'hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(type)) return true;
  if (type === 'checkbox' || type === 'radio') return true;

  const b = fieldBlob(meta);
  if (!b) return true;
  if (/captcha|password|honeypot|one time|otp/.test(b)) return true;
  if (/agree|terms of|privacy policy|datenschutz|consent|newsletter|marketing|gdpr|dsgvo/.test(b)) return true;
  if (/gender|sex |race|ethnic|veteran|disability|sexual orientation|lgbt|pronoun/.test(b)) return true;
  if (/equal opportunity|eeo|affirmative action|protected veteran/.test(b)) return true;
  if (
    /\bcompany\b/.test(b)
    && !/current company|employer|previous employer|letzte[r]? arbeitgeber/.test(b)
    && !/first name|last name|vorname|nachname|given name|family name/.test(b)
  ) {
    return true;
  }
  return false;
}

export function valueForField(meta, pack = {}) {
  if (shouldSkipField(meta)) return null;
  const b = fieldBlob(meta);
  if (!b) return null;

  const rules = [
    [/first name|vorname|given name|given-name|first-name|firstname/, 'firstName'],
    [/last name|nachname|surname|family name|family-name|last-name|lastname/, 'lastName'],
    [/full name|legal name|candidate name|your name|completename/, 'fullName'],
    [/e-?mail|autocomplete email/, 'email'],
    [/phone|telefon|mobile|handy|tel\b|autocomplete tel/, 'phone'],
    [/linkedin/, 'linkedin'],
    [/github/, 'github'],
    [/portfolio|personal (site|url|website)|homepage|website|webseite/, 'website'],
    [/salary|gehalt|compensation|expected pay|gehaltsvorstellung|erwartung/, 'salaryExpectation'],
    [/notice|k[uü]ndigungsfrist|notice period/, 'noticePeriod'],
    [/earliest|start date|availability|verf[uü]gbar|eintritt|notice to start/, 'earliestStart'],
    [/sponsor|visa|work auth|work permit|arbeitserlaubnis|berechtigt/, 'workAuthorization'],
    [/cities|city preference|standorte|locations? open|where can you/, 'citiesOpenTo'],
    [/remote|hybrid|onsite|wfh|work from/, 'remotePreference'],
    [/cover letter|anschreiben|motivation letter|motivationsschreiben/, 'coverLetter'],
  ];

  for (const [re, key] of rules) {
    if (re.test(b)) {
      const v = pack[key];
      return v ? String(v) : null;
    }
  }

  if (/(?:^| )name(?: |$)/.test(b) && !/user name|username|company|file/.test(b)) {
    return pack.fullName ? String(pack.fullName) : null;
  }
  return null;
}
