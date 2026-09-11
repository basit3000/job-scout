/**
 * German business-letter layout for cover letters, modelled on
 * cv/Daniyal Cover Letter.pdf: sender header, recipient block, place-and-date
 * line, bold Betreff, formal salutation, body, formal closing, signature.
 *
 * The markdown template supplies only the body prose. Everything structural
 * lives here, so the same body renders identically to LaTeX, HTML and DOCX.
 */

import { texEscape } from './latex-cv.mjs';

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export const LETTER_STRINGS = {
  de: {
    subjectPrefix: 'Bewerbung als',
    salutation: 'Sehr geehrte Damen und Herren,',
    // German convention takes no comma after the sign-off; English does.
    closing: 'Mit freundlichen Grüßen',
    recipientAttn: 'Personalabteilung',
    pastIntro: 'Der Weg dorthin begann früher.',
    projectIntro: 'Auch außerhalb der Arbeit habe ich solche Systeme von Anfang bis Ende gebaut.',
  },
  en: {
    subjectPrefix: 'Application for',
    salutation: 'Dear Hiring Team,',
    closing: 'Best regards,',
    recipientAttn: 'Hiring Team',
    pastIntro: 'That path started earlier.',
    projectIntro: 'Outside of work I have built the same kind of system end to end.',
  },
};

export function letterStrings(language) {
  return LETTER_STRINGS[language] ?? LETTER_STRINGS.en;
}

/** "3. September 2026" for de, "3 September 2026" for en. */
export function formatLetterDate(date = new Date(), language = 'en') {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  if (language === 'de') {
    return `${d.getDate()}. ${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`;
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const SUBJECT_RE = /^(application for|bewerbung|initiativbewerbung)\b/i;
const SALUTATION_RE = /^(dear\b|sehr geehrte)/i;
const GERMAN_LINE = /^(sehr geehrte|bewerbung|initiativbewerbung)/i;

/** Work arrangements and whole countries are not an address line. */
const NOT_A_CITY = /^(remote|hybrid|home[\s-]?office|homeoffice|bundesweit|deutschland|germany|europe|europa|eu|anywhere|various|verschiedene)$/i;

/**
 * A posting can list ten offices ("Karlsruhe, Berlin, Hamburg, …"). An address
 * block takes one city, so keep the first and drop the rest.
 */
export function firstCity(location) {
  const first = String(location ?? '')
    .split(/\s*[,;/|]\s*|\s+(?:und|and|or|oder)\s+/i)[0]
    .replace(/\((?:[^)]*)\)/g, '')
    .trim();
  if (!first || first.length > 60 || NOT_A_CITY.test(first)) return '';
  return first;
}

/**
 * Which language the letter is actually written in.
 *
 * The posting's language is not a safe proxy: a German ad often gets an English
 * letter, and wrapping English prose in a German frame produces "Dear Hiring
 * Team" above "Mit freundlichen Grüßen". The body decides; the posting only
 * breaks ties when the body gives no signal.
 */
export function detectLetterLanguage(letter, fallback = 'en') {
  const { subject, salutation } = splitLetterBody(letter);
  for (const line of [salutation, subject]) {
    if (line) return GERMAN_LINE.test(line) ? 'de' : 'en';
  }
  const text = String(letter ?? '');
  if (/\b(und|der|die|das|mit|für|nicht|ich habe)\b/i.test(text)) return 'de';
  return fallback === 'de' ? 'de' : 'en';
}

/** Keep a template's own wording only when it is already in the target language. */
function inLanguage(line, language) {
  if (!line) return false;
  return language === 'de' ? GERMAN_LINE.test(line) : !GERMAN_LINE.test(line);
}
const CLOSING_RE = /^(kind regards|best regards|yours sincerely|sincerely|mit freundlichen gr|mit besten gr)/i;

/**
 * Pull the body out of a rendered letter, dropping anything the layout now
 * owns. Templates written before this change still carry their own subject,
 * salutation and sign-off; those are recognised, not duplicated.
 */
export function splitLetterBody(letter) {
  const lines = String(letter ?? '').split('\n');
  let subject = '';
  let salutation = '';

  let i = 0;
  const skipBlank = () => {
    while (i < lines.length && !lines[i].trim()) i += 1;
  };

  skipBlank();
  // A bare date line ("12 September 2026") is layout, not prose.
  if (i < lines.length && /^\[?date\]?$|^\d{1,2}[ .].*\d{4}$/i.test(lines[i].trim())) i += 1;
  skipBlank();
  if (i < lines.length && SUBJECT_RE.test(lines[i].trim())) {
    subject = lines[i].trim();
    i += 1;
  }
  skipBlank();
  if (i < lines.length && SALUTATION_RE.test(lines[i].trim())) {
    salutation = lines[i].trim();
    i += 1;
  }

  const rest = lines.slice(i);
  let end = rest.length;
  for (let k = 0; k < rest.length; k += 1) {
    if (CLOSING_RE.test(rest[k].trim())) {
      end = k;
      break;
    }
  }

  const paragraphs = rest
    .slice(0, end)
    .join('\n')
    .split(/\n{2,}/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' '))
    .filter(Boolean);

  return { subject, salutation, paragraphs };
}

function contactLinks(profile) {
  const links = profile?.links ?? {};
  const out = [];
  if (profile?.phone) out.push({ kind: 'phone', text: profile.phone, url: null });
  if (links.email) out.push({ kind: 'email', text: links.email, url: `mailto:${links.email}` });
  if (links.linkedin) out.push({ kind: 'linkedin', text: 'LinkedIn', url: links.linkedin });
  if (links.github) out.push({ kind: 'github', text: 'GitHub', url: links.github });
  if (!links.linkedin && !links.github && links.portfolio) {
    out.push({ kind: 'portfolio', text: 'Portfolio', url: links.portfolio });
  }
  return out;
}

/** fontawesome5 command per contact kind. Unknown kinds simply get no icon. */
const CONTACT_ICON = {
  location: '\\faMapMarker*',
  phone: '\\faPhone*',
  email: '\\faEnvelope',
  linkedin: '\\faLinkedin',
  github: '\\faGithub',
  portfolio: '\\faGlobe',
};

/**
 * Everything the letter layout needs, resolved from the job and profile.
 * Postings carry only company and city, so the recipient block is those two —
 * no street or postcode line.
 */
export function buildLetterModel({
  job = {},
  profile = {},
  body = '',
  language = 'en',
  date = new Date(),
} = {}) {
  const s = letterStrings(language);
  const parsed = splitLetterBody(body);
  const role = job.title || profile.targetRole || '';

  return {
    language,
    sender: {
      name: profile.name || '',
      headline: profile.headline || '',
      location: profile.location?.current || '',
      contacts: contactLinks(profile),
    },
    recipient: {
      company: job.company && job.company !== 'unknown' ? job.company : '',
      city: firstCity(job.location),
    },
    place: firstCity(profile.location?.current),
    date: formatLetterDate(date, language),
    subject: inLanguage(parsed.subject, language)
      ? parsed.subject
      : (role ? `${s.subjectPrefix} ${role}` : ''),
    salutation: inLanguage(parsed.salutation, language) ? parsed.salutation : s.salutation,
    paragraphs: parsed.paragraphs,
    closing: s.closing,
    // Postings rarely name a person, so the recipient block is addressed to the team.
    recipientAttn: s.recipientAttn,
    signature: profile.name || '',
  };
}

function texLink(item) {
  if (!item.url) return texEscape(item.text);
  return `\\href{${item.url.replace(/([%#\\])/g, '\\$1')}}{${texEscape(item.text)}}`;
}

/**
 * Progressively tighter layouts, tried in order until the letter is one page.
 *
 * Step 0 is the reference layout and must stay byte-identical to it — a letter
 * that already fits is never touched. Later steps give up whitespace first and
 * only drop the body below 11pt as a last resort, because that is the one change
 * a reader actually notices.
 */
export const LETTER_FIT_STEPS = [
  { id: 'reference', stretch: null, bodyPt: 11, margin: 2.2, gap: 1 },
  { id: 'spacing', stretch: 1.3, bodyPt: 11, margin: 2.2, gap: 0.85 },
  { id: 'margins', stretch: 1.25, bodyPt: 11, margin: 1.9, gap: 0.75 },
  { id: 'leading', stretch: 1.15, bodyPt: 11, margin: 1.8, gap: 0.65 },
  { id: 'bodysize', stretch: 1.1, bodyPt: 10, margin: 1.8, gap: 0.6 },
];

/** Round a scaled gap to whole points — LaTeX takes fractions, humans read points. */
const gapPt = (base, fit) => `${Math.max(2, Math.round(base * (fit.gap ?? 1)))}pt`;

/**
 * The letter as a standalone .tex document, compiled by tectonic.
 *
 * Layout follows the reference letter the candidate signs off on: a centred-left
 * name over an accent-coloured subtitle, one rule-separated contact row with
 * fontawesome5 icons, then recipient and place-and-date side by side.
 *
 * @param {object} model  from buildLetterModel
 * @param {object} [fit]  one of LETTER_FIT_STEPS; defaults to the reference layout
 */
export function buildLetterTex(model, fit = LETTER_FIT_STEPS[0]) {
  const { sender, recipient } = model;

  // Location is not a link, so it joins the row as a plain first item.
  const contactRow = [
    ...(sender.location ? [{ kind: 'location', text: sender.location, url: null }] : []),
    ...sender.contacts,
  ]
    .map((item) => {
      const icon = CONTACT_ICON[item.kind];
      return `\\mbox{${icon ? `${icon} \\; ` : ''}${texLink(item)}}`;
    })
    .join('\\hspace{6pt}\\textbullet\\hspace{6pt}%\n');

  const recipientLines = [recipient.company, model.recipientAttn, recipient.city]
    .filter(Boolean)
    .map(texEscape)
    .join('\\\\\n');

  const dateLine = [model.place, model.date].filter(Boolean).join(', ');

  const body = model.paragraphs.map((p) => texEscape(p)).join('\n\n');

  return `\\documentclass[${fit.bodyPt}pt]{article}
\\usepackage[a4paper,left=${fit.margin}cm,right=${fit.margin}cm,top=${(fit.margin - 0.4).toFixed(1)}cm,bottom=${(fit.margin - 0.4).toFixed(1)}cm]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{lmodern}
\\usepackage[${model.language === 'de' ? 'ngerman' : 'english'}]{babel}
\\usepackage{fontawesome5}
\\usepackage[hidelinks]{hyperref}
\\usepackage{setspace}
\\usepackage{xcolor}
\\usepackage{parskip}

\\definecolor{accent}{RGB}{31,73,125}
\\hypersetup{colorlinks=true, urlcolor=accent, linkcolor=accent}

\\setlength{\\parindent}{0pt}
${fit.stretch === null ? '\\onehalfspacing' : `\\setstretch{${fit.stretch}}`}

\\begin{document}

{\\Huge\\bfseries ${texEscape(sender.name)}}\\\\[4pt]
${sender.headline ? `{\\color{accent}\\large ${texEscape(sender.headline)}}\\\\[6pt]` : ''}
{\\footnotesize
${contactRow}
}

\\vspace{${gapPt(6, fit)}}
\\hrule
\\vspace{${gapPt(14, fit)}}

\\begin{minipage}[t]{0.6\\textwidth}
${recipientLines || '~'}
\\end{minipage}
\\hfill
\\begin{minipage}[t]{0.35\\textwidth}
\\raggedleft ${texEscape(dateLine)}
\\end{minipage}

\\vspace{${gapPt(16, fit)}}

\\textbf{${texEscape(model.subject)}}

\\vspace{${gapPt(10, fit)}}

${texEscape(model.salutation)}

\\vspace{${gapPt(6, fit)}}

${body}

\\vspace{${gapPt(10, fit)}}

${texEscape(model.closing)}\\\\[4pt]
${texEscape(model.signature)}

\\end{document}
`;
}

/** Plain-text rendering, for cover-letter.md and the agent to edit. */
export function buildLetterText(model) {
  const { sender, recipient } = model;
  const head = [
    sender.name,
    sender.headline,
    sender.location,
    ...sender.contacts.map((c) => c.text),
  ].filter(Boolean);
  const to = [recipient.company, recipient.city].filter(Boolean);
  const dateLine = [model.place, model.date].filter(Boolean).join(', ');

  return [
    head.join('\n'),
    to.join('\n'),
    dateLine,
    model.subject,
    model.salutation,
    ...model.paragraphs,
    model.closing,
    model.signature,
  ].filter(Boolean).join('\n\n').trim() + '\n';
}
