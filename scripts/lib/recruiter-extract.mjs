/**
 * Pull recruiter name / email / LinkedIn URL from posting text and HTML.
 * Conservative: never invent addresses; skip board/noreply junk.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const LINKEDIN_IN_RE = /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/in\/[a-zA-Z0-9_%\-]+\/?/gi;
const LINKEDIN_IN_LOOSE_RE = /(?:https?:\/\/(?:[\w-]+\.)?)?linkedin\.com\/in\/[a-zA-Z0-9_%\-]+/gi;

const JUNK_LOCAL = /^(noreply|no-reply|donotreply|do-not-reply|unsubscribe|privacy|legal|bounce|mailer-daemon|postmaster|webmaster|support|notifications?|alerts?|sentry|github|gitlab)$/i;
const JUNK_DOMAIN = /(example\.com|example\.org|sentry\.io|wixpress\.com|indeedemail\.com|indeed\.com|glassdoor\.|linkedin\.com|jobvite\.com|myworkday\.com|greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workablemail\.com|personio\.de)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico)$/i;
const GENERIC_LOCAL = /^(jobs?|careers?|recruiting|recruitment|talent|hr|hello|info|contact|bewerbung|karriere|application|apply)$/i;

const NAME_LABEL_RE = new RegExp(
  String.raw`(?:hiring\s+manager|recruiter|talent\s+(?:acquisition|partner|manager|lead)|people\s+partner|ansprechpartner(?:in)?|kontaktperson|listed\s+by|posted\s+by|recruited\s+by|please\s+contact|reach\s+out\s+to|melden\s+sie\s+sich\s+bei)\s*[:\-–—]?\s*([A-ZÄÖÜ][a-zäöüß'’\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß'’\-]+){1,3})`,
  'gi',
);

const ROLE_NEAR_NAME_RE = /(?:talent|recruit|hiring|people\s+partner|hr\s+business)/i;

export function decodeHtmlEntities(text) {
  return String(text ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function stripTags(html) {
  return decodeHtmlEntities(
    String(html ?? '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export function normalizeEmail(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/^mailto:/i, '');
  if (!s || IMAGE_EXT.test(s) || s.length > 80) return null;
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(s)) return null;
  const [local, domain] = s.split('@');
  if (!local || !domain) return null;
  if (JUNK_LOCAL.test(local) || JUNK_DOMAIN.test(domain)) return null;
  if (local.includes('..') || s.includes(' ')) return null;
  return s;
}

export function isGenericEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  return GENERIC_LOCAL.test(local);
}

export function normalizeLinkedIn(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/linkedin\.com\/in\/([a-zA-Z0-9_%\-]+)/i);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).replace(/\/+$/, '');
  if (!slug || /^(pulse|company|school|jobs|feed)$/i.test(slug)) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

const ROLE_WORDS = /^(recruiter|manager|partner|lead|acquisition|talent|hiring|kontakt|ansprechpartner(?:in)?)$/i;

export function sanitizePersonName(value) {
  const parts = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((p) => p && !ROLE_WORDS.test(p));
  return parts.join(' ');
}

export function looksLikePersonName(value) {
  const s = sanitizePersonName(value);
  if (!s || s.length < 4 || s.length > 60) return false;
  if (/https?:|www\.|@|\d{3,}/i.test(s)) return false;
  const skip = /^(equal opportunity|data protection|privacy policy|terms of|all rights|gmbh|inc|ltd|ag|the team|our team|human resources|talent acquisition)$/i;
  if (skip.test(s)) return false;
  const parts = s.split(' ');
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((p) => /^[A-ZÄÖÜ][a-zäöüß'’\-]{1,30}$/.test(p));
}

export function extractEmails(text, { includeGeneric = true } = {}) {
  const found = [];
  const seen = new Set();
  const src = decodeHtmlEntities(String(text || ''));
  for (const m of src.matchAll(EMAIL_RE)) {
    const email = normalizeEmail(m[0]);
    if (!email || seen.has(email)) continue;
    if (!includeGeneric && isGenericEmail(email)) continue;
    seen.add(email);
    found.push({
      email,
      generic: isGenericEmail(email),
    });
  }
  found.sort((a, b) => Number(a.generic) - Number(b.generic));
  return found;
}

export function extractLinkedInUrls(text) {
  const found = [];
  const seen = new Set();
  const src = String(text || '');
  for (const re of [LINKEDIN_IN_RE, LINKEDIN_IN_LOOSE_RE]) {
    for (const m of src.matchAll(re)) {
      const url = normalizeLinkedIn(m[0]);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      found.push(url);
    }
  }
  return found;
}

export function extractRecruiterNames(text) {
  const found = [];
  const seen = new Set();
  const src = stripTags(text);
  for (const m of src.matchAll(NAME_LABEL_RE)) {
    const name = sanitizePersonName(m[1]);
    if (!looksLikePersonName(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(name);
  }
  return found;
}

function mailtoWithNames(html) {
  const out = [];
  const src = String(html || '');
  const re = /<a[^>]+href=["']mailto:([^"'>\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of src.matchAll(re)) {
    const email = normalizeEmail(decodeHtmlEntities(m[1]));
    if (!email) continue;
    const label = stripTags(m[2]);
    out.push({
      email,
      generic: isGenericEmail(email),
      name: looksLikePersonName(label) ? label : null,
    });
  }
  return out;
}

function linkedInAnchors(html) {
  const out = [];
  const src = String(html || '');
  const re = /<a[^>]+href=["']([^"']*linkedin\.com\/in\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of src.matchAll(re)) {
    const url = normalizeLinkedIn(m[1]);
    if (!url) continue;
    const label = stripTags(m[2]);
    out.push({
      linkedinUrl: url,
      name: looksLikePersonName(label) ? label : null,
    });
  }
  return out;
}

function walkJson(node, visit, depth = 0) {
  if (node == null || depth > 8) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJson(item, visit, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  visit(node);
  for (const v of Object.values(node)) walkJson(v, visit, depth + 1);
}

export function extractFromEmbeddedJson(html) {
  const hits = [];
  const blocks = String(html || '').matchAll(
    /<script[^>]*type=["']application\/(?:ld\+json|json)["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const extras = String(html || '').matchAll(
    /<(?:script)[^>]*>\s*(\{[\s\S]{20,8000}\})\s*<\/script>/gi,
  );
  const chunks = [];
  for (const m of blocks) chunks.push(m[1]);
  for (const m of extras) chunks.push(m[1]);

  const greenhouse = String(html || '').match(/window\.Grnhse\s*=\s*(\{[\s\S]*?\});\s*</);
  if (greenhouse) chunks.push(greenhouse[1]);

  for (const raw of chunks) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    walkJson(data, (obj) => {
      const keys = Object.keys(obj);
      const blob = JSON.stringify(obj);
      const emails = extractEmails(blob);
      const linkedin = extractLinkedInUrls(blob);
      let name = null;
      for (const key of keys) {
        if (!/name|fullName|full_name|recruiter|hiring|poster|contact/i.test(key)) continue;
        const val = obj[key];
        if (typeof val === 'string' && looksLikePersonName(val)) name = val;
        if (val && typeof val === 'object' && typeof val.name === 'string' && looksLikePersonName(val.name)) {
          name = val.name;
        }
      }
      const roleish = keys.some((k) => /recruiter|hiring|talent|poster/i.test(k))
        || ROLE_NEAR_NAME_RE.test(blob);
      if (!emails.length && !linkedin.length && !name) return;
      hits.push({ emails, linkedin, name, recruiterish: roleish });
    });
  }
  return hits;
}

/**
 * @returns {{ emails: {email:string,generic:boolean,name?:string|null}[], names: string[], linkedinUrls: string[], sources: object[] }}
 */
export function extractRecruiterHints(htmlOrText, { sourceUrl = null, kind = 'text' } = {}) {
  const raw = String(htmlOrText || '');
  const isHtml = kind === 'html' || /<[a-z][\s\S]*>/i.test(raw.slice(0, 400));
  const text = isHtml ? stripTags(raw) : decodeHtmlEntities(raw);
  const emails = [];
  const names = [];
  const linkedinUrls = [];
  const sources = [];
  const seenEmail = new Set();
  const seenName = new Set();
  const seenLi = new Set();

  const addEmail = (item, note) => {
    const email = normalizeEmail(item?.email || item);
    if (!email || seenEmail.has(email)) return;
    seenEmail.add(email);
    const row = { email, generic: isGenericEmail(email), name: item?.name || null };
    emails.push(row);
    sources.push({ kind: note, url: sourceUrl, email, name: row.name || undefined });
  };
  const addName = (name, note) => {
    const n = sanitizePersonName(name);
    if (!looksLikePersonName(n)) return;
    const key = n.toLowerCase();
    if (seenName.has(key)) return;
    seenName.add(key);
    names.push(n);
    sources.push({ kind: note, url: sourceUrl, name: n });
  };
  const addLi = (url, note, name = null) => {
    const u = normalizeLinkedIn(url);
    if (!u || seenLi.has(u)) return;
    seenLi.add(u);
    linkedinUrls.push(u);
    sources.push({ kind: note, url: u, name: name || undefined });
    if (name) addName(name, `${note}-label`);
  };

  if (isHtml) {
    for (const row of mailtoWithNames(raw)) addEmail(row, 'mailto');
    for (const row of linkedInAnchors(raw)) addLi(row.linkedinUrl, 'linkedin-anchor', row.name);
    for (const hit of extractFromEmbeddedJson(raw)) {
      for (const e of hit.emails) addEmail(e, 'embedded-json');
      for (const u of hit.linkedin) addLi(u, 'embedded-json', hit.name);
      if (hit.name && (hit.recruiterish || hit.emails.length || hit.linkedin.length)) {
        addName(hit.name, 'embedded-json');
      }
    }
  }

  for (const e of extractEmails(text)) addEmail(e, 'text');
  for (const u of extractLinkedInUrls(text)) addLi(u, 'text');
  for (const n of extractRecruiterNames(text)) addName(n, 'label');

  emails.sort((a, b) => Number(a.generic) - Number(b.generic));
  return { emails, names, linkedinUrls, sources };
}

export function companyKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(gmbh|ag|ltd|llc|inc|se|kg|ug|co|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 80);
}

export function guessCompanySiteUrls(job = {}) {
  const urls = [];
  const push = (u) => {
    try {
      const parsed = new URL(u);
      if (!/^https?:$/.test(parsed.protocol)) return;
      const href = parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, ''));
      if (!urls.includes(href)) urls.push(href);
    } catch {
      /* ignore */
    }
  };
  if (job.companyUrl) push(job.companyUrl);
  const apply = String(job.url || '');
  try {
    const host = new URL(apply).hostname.replace(/^www\./, '');
    const path = new URL(apply).pathname;
    if (/greenhouse\.io$/i.test(host)) {
      const slug = path.split('/').filter(Boolean)[0];
      if (slug && !/jobs?|embed/i.test(slug)) urls.push(`https://boards.greenhouse.io/${slug}`);
    } else if (/jobs\.lever\.co$/i.test(host)) {
      const slug = path.split('/').filter(Boolean)[0];
      if (slug) urls.push(`https://jobs.lever.co/${slug}`);
    } else if (/ashbyhq\.com$/i.test(host)) {
      const slug = path.split('/').filter(Boolean)[0];
      if (slug) urls.push(`https://jobs.ashbyhq.com/${slug}`);
    } else if (!isJobBoardHost(host)) {
      push(`${new URL(apply).origin}`);
    }
  } catch {
    /* ignore */
  }
  return urls;
}

export function isJobBoardHost(host) {
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  return /linkedin\.com$|indeed\.com$|glassdoor\.|xing\.com$|stepstone\.|arbeitsagentur\.de$|kimeta\.de$|arbeitnow\.|nomado24\.|jobs\.heise\.de$|germantechjobs\.de$|greenhouse\.io$|lever\.co$|ashbyhq\.com$|personio\.(de|com)|smartrecruiters\.com$|workable\.com$|myworkdayjobs\.com$|workday\.com$/.test(h);
}

export function contactPagesFor(origin) {
  const base = String(origin || '').replace(/\/+$/, '');
  if (!base) return [];
  return [
    base,
    `${base}/impressum`,
    `${base}/imprint`,
    `${base}/legal-notice`,
    `${base}/contact`,
    `${base}/kontakt`,
    `${base}/about`,
    `${base}/team`,
    `${base}/about-us`,
    `${base}/ueber-uns`,
  ];
}

export function pickBestEmail(emails = []) {
  const list = emails.filter((e) => e?.email);
  return list.find((e) => !e.generic)?.email || list[0]?.email || null;
}

export function parseRecruiterAgentJson(text) {
  const s = String(text || '');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : s;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (!obj || typeof obj !== 'object') return null;
    const email = obj.invented === true ? null : normalizeEmail(obj.email);
    const name = looksLikePersonName(obj.name) ? String(obj.name).trim() : (obj.name ? String(obj.name).trim().slice(0, 80) : '');
    return {
      name: name || '',
      role: String(obj.role || obj.title || '').trim().slice(0, 80),
      email,
      linkedinUrl: normalizeLinkedIn(obj.linkedinUrl || obj.linkedin || ''),
      notes: String(obj.notes || obj.reason || '').trim().slice(0, 500),
      invented: obj.invented === true,
      sources: Array.isArray(obj.sources)
        ? obj.sources
          .map((x) => ({
            kind: 'agent',
            url: String(x?.url || '').slice(0, 300),
            note: String(x?.note || x || '').slice(0, 200),
          }))
          .filter((x) => x.url || x.note)
        : [],
    };
  } catch {
    return null;
  }
}
