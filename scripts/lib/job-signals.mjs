/** Source observations, separate from candidate fit. Missing data is never zero. */
const DAY = 86_400_000;
const validTime = value => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

export function postingDate(value, observedAt = new Date().toISOString()) {
  if (typeof value !== 'string' || !value.trim()) return { postedAt: null, postedAtApproximate: false };
  const text = value.trim();
  const relative = text.match(/^(?:posted\s+|reposted\s+)?(?:about\s+|over\s+)?(\d+)\+?\s*(minute|hour|day|week|month|year)s?\s+ago$/i)
    || text.match(/^vor\s+(\d+)\s+(Minute|Stunde|Tag|Woche|Monat|Jahr)(?:n|en|e)?$/i);
  let days = null;
  if (relative) {
    const unit = relative[2].toLowerCase();
    const scale = { minute: 1 / 1440, hour: 1 / 24, stunde: 1 / 24, day: 1, tag: 1, week: 7, woche: 7, month: 30, monat: 30, year: 365, jahr: 365 };
    days = Number(relative[1]) * scale[unit];
  } else if (/^(today|just posted|just now|heute)$/i.test(text)) days = 0;
  else if (/^(yesterday|gestern)$/i.test(text)) days = 1;
  if (days != null) {
    const observed = validTime(observedAt);
    const timestamp = observed == null ? NaN : observed - days * DAY;
    return { postedAt: Number.isFinite(timestamp) && Math.abs(timestamp) <= 8.64e15 ? new Date(timestamp).toISOString() : null, postedAtApproximate: true };
  }
  // Do not let Date.parse interpret counts or arbitrary labels as calendar dates.
  const calendarDate = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(text)
    || /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i.test(text) && /\b\d{4}\b/.test(text);
  const timestamp = calendarDate ? validTime(text) : null;
  return { postedAt: timestamp == null ? null : new Date(timestamp).toISOString(), postedAtApproximate: false };
}

export function postingAge(job, now = Date.now()) {
  const timestamp = validTime(job?.postedAt);
  if (timestamp != null) return timestamp > Number(now) + DAY ? null : Math.max(0, Math.floor((Number(now) - timestamp) / DAY));
  // Old archives may only have an age. Anchor it to the actual scrape, never lastSeenAt.
  if (job?.ageDays == null || job.ageDays === '' || !Number.isFinite(Number(job.ageDays)) || Number(job.ageDays) < 0) return null;
  const observed = validTime(job.scrapedAt);
  return Math.floor(Number(job.ageDays) + (observed == null ? 0 : Math.max(0, (Number(now) - observed) / DAY)));
}

export function parseApplicants(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? { count: value, relation: 'exact', label: `${value} applicants` } : null;
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  const match = text.match(/^(?:(over|more than|at least|under|fewer than|less than|be among the first|among the first|über|mehr als|weniger als|unter)\s+)?(\d{1,3}(?:,\d{3})+|\d+)(\+)?(?:\s+(?:applicants?|applications?|people clicked apply|bewerber(?:innen)?))?$/i);
  if (!match) return null;
  const count = Number(match[2].replaceAll(',', ''));
  if (!Number.isSafeInteger(count)) return null;
  const prefix = (match[1] || '').toLowerCase();
  const relation = /under|fewer|less|first|weniger|unter/.test(prefix) ? 'less-than'
    : match[3] || prefix === 'at least' ? 'at-least' : prefix ? 'more-than' : 'exact';
  const label = /applicant|application|people clicked apply|bewerber/i.test(text) ? text : `${text} applicants`;
  return { count, relation, label };
}

export function sourceSignals(raw, now = new Date().toISOString()) {
  const observedAt = raw.scrapedAt || now;
  let dateRaw = null;
  let date = postingDate(null, observedAt);
  for (const value of [raw.postedAt, raw.postedDate, raw.datePosted, raw.date_posted, raw.postedTimeAgo]) {
    const parsed = postingDate(value, observedAt);
    if (parsed.postedAt) { date = parsed; dateRaw = value; break; }
  }
  if (!date.postedAt && raw.ageDays != null && raw.ageDays !== '' && typeof raw.ageDays !== 'boolean' && Number.isFinite(Number(raw.ageDays)) && Number(raw.ageDays) >= 0) {
    date = postingDate(`${raw.ageDays} days ago`, observedAt);
  }
  let applicants = null;
  const existing = raw.applicants;
  if (existing && typeof existing === 'object' && parseApplicants(existing.count)
    && ['exact', 'less-than', 'more-than', 'at-least'].includes(existing.relation)) applicants = existing;
  for (const value of [raw.applicantCountText, raw.applicants, raw.applicantCount, raw.applicantsCount, raw.numApplicants, raw.num_applicants, raw.applicants_count, raw.applicant_count]) {
    if (applicants) break;
    if ((applicants = parseApplicants(value))) break;
  }
  return {
    ...date,
    postedAtApproximate: date.postedAtApproximate || raw.postedAtApproximate === true,
    postedAtText: raw.postedAtText || (typeof dateRaw === 'string' ? dateRaw : null),
    scrapedAt: observedAt,
    applicants: applicants ? { source: raw.board || raw.source || 'source', url: raw.applicantSourceUrl || raw.url || null, observedAt, ...applicants } : null,
  };
}

/** Small priority bonus within the existing verdict. Counts do not measure views. */
export function opportunityFor(job, now = Date.now()) {
  const ageDays = postingAge(job, now);
  const reasons = [];
  let bonus = ageDays == null ? 0 : ageDays <= 3 ? 3 : ageDays <= 7 ? 2 : ageDays <= 14 ? 1 : 0;
  if (bonus) reasons.push(`Posted ${job.postedAtApproximate ? 'about ' : ''}${ageDays} days ago`);
  const a = job.applicants;
  const observed = validTime(a?.observedAt);
  const fresh = observed != null && Number(now) >= observed && Number(now) - observed <= 7 * DAY;
  const low = a && Number.isSafeInteger(a.count) && a.count >= 0 && ((a.relation === 'exact' && a.count <= 25) || (a.relation === 'less-than' && a.count <= 26));
  if (fresh && low && ageDays != null && ageDays <= 30) {
    bonus += ageDays >= 3 ? 5 : 3;
    reasons.push(`Low reported applicant count: ${a.label} (${a.source}); observed ${a.observedAt.slice(0, 10)}`);
  }
  return { bonus, reasons, ageDays };
}

/** Keep the latest count observation together with its source and timestamp. */
export function latestApplicants(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return (validTime(b.observedAt) ?? -Infinity) > (validTime(a.observedAt) ?? -Infinity) ? b : a;
}
