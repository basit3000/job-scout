// Experience is elapsed employment time, not time since the first job.
// Memory owns facts. CV-only dates can suggest a check, never silently add facts.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const OPTIONAL = /\b(preferred|preferably|ideally|optional|nice.to.have|a plus|beneficial|idealerweise|wünschenswert|von Vorteil)\b/i;
const NEGATED = /\b(no|without|not required|keine?|nicht erforderlich)\b/i;
const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ein: 1, eine: 1, einem: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10 };
const NUMBER = '(?:\\d+(?:[.,]\\d+)?|' + Object.keys(WORDS).join('|') + ')';
const RANGE = '(' + NUMBER + ')(?:\\s*(?:[-–—]|to|bis)\\s*(' + NUMBER + '))?\\s*\\+?';
const EXPERIENCE = new RegExp('\\b' + RANGE + "\\s*(?:years?['’]?|Jahre?n?|jährig\\w*)\\s+(?:[\\p{L}-]+\\s+){0,5}(?:experience|Berufserfahrung|Erfahrung)\\b", 'giu');
const REVERSED = new RegExp('\\b(?:experience|Berufserfahrung|Erfahrung)\\s*(?:of|von|:)?\\s*(?:at least|minimum(?: of)?|mindestens|über)?\\s*' + RANGE + '\\s*(?:years?|Jahre?n?)\\b', 'giu');
const SHORT_FORM = new RegExp('\\b' + RANGE + '\\s*years?\\s+(?:with|in|working|building|developing)\\b', 'giu');
const number = (s) => WORDS[String(s).toLowerCase()] ?? Number(String(s).replace(',', '.'));

function month(value, end = false) {
  const s = String(value ?? '').trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})(?:-(\d{2}))?$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) {
    const days = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
    if (m[3] && (+m[3] < 1 || +m[3] > days)) return null;
    return +m[1] * 12 + +m[2] - 1 + (m[3] ? (+m[3] - 1 + Number(end)) / days : Number(end));
  }
  m = s.match(/^(\d{1,2})[/.](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return +m[2] * 12 + +m[1] - 1 + Number(end);
  m = s.match(/^([a-zä]+)\.?\s+(\d{4})$/i);
  if (m) {
    const name = m[1].toLowerCase().replace(/^märz?/, 'mar').replace(/^mai/, 'may').replace(/^okt/, 'oct').replace(/^dez/, 'dec');
    const index = MONTHS.indexOf(name.slice(0, 3));
    if (index >= 0) return +m[2] * 12 + index + Number(end);
  }
  return null; // Year-only / ambiguous dates do not establish exact tenure.
}

function elapsedMonths(periods) {
  const sorted = periods.map(({ start, end }) => [start, end]).sort((a, b) => a[0] - b[0]);
  let total = 0, until = -Infinity;
  for (const [start, end] of sorted) {
    total += Math.max(0, end - Math.max(start, until));
    until = Math.max(until, end);
  }
  return total;
}

export function candidateExperience(profile = {}, { now = new Date() } = {}) {
  const date = new Date(now);
  const current = date.getUTCFullYear() * 12 + date.getUTCMonth()
    + (date.getUTCDate() - 1) / new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const periods = [], notes = [];
  let undated = 0, projects = 0;
  for (const role of profile.experience || []) {
    const label = [role.title, role.org, role.employmentType, role.type].filter(Boolean).join(' ');
    if (/\b(personal|hobby|side project|portfolio project)\b/i.test(label)
      || (/\bindependent developer\b/i.test(label) && !/\b(freelance|contractor|self.employed)\b/i.test(role.employmentType || ''))) { projects++; continue; }
    const start = month(role.from), finish = month(role.to, true);
    const present = /^(present|current|now|ongoing|heute|aktuell|bis heute)$/i.test(String(role.to || '').trim());
    const end = present ? current : finish == null ? null : Math.min(finish, current);
    if (start == null || end == null || start >= end) { undated++; continue; }
    periods.push({ start, end, title: role.title || '',
      student: /\b(student|werkstudent\w*|intern\w*|praktik\w*|part.time|teilzeit)\b/i.test(label),
      fullTime: /\b(full.time|vollzeit)\b/i.test(role.employmentType || '') });
  }
  const timelineYears = periods.length ? elapsedMonths(periods) / 12 : null;
  const declared = profile.experienceYears;
  const explicit = typeof declared === 'number' && Number.isFinite(declared) && declared >= 0 ? declared : null;
  const conflict = explicit != null && timelineYears != null && Math.abs(explicit - timelineYears) > 1;
  if (periods.some((p) => p.student)) notes.push('Includes student/part-time calendar duration; not full-time-equivalent years');
  if (undated) notes.push('Some roles have incomplete or ambiguous dates');
  if (projects) notes.push('Personal projects excluded from employment duration');
  if (conflict) notes.push('Declared total and dated work history differ; confirm the intended total');
  return { years: explicit ?? timelineYears, timelineYears, source: explicit != null ? 'declared total' : periods.length ? 'dated work history' : 'unknown',
    periods, notes, incomplete: undated > 0, conflict, asOf: date.toISOString().slice(0, 10) };
}

export function extractExperienceRequirements(job = {}) {
  const text = String(job.description || '').replace(/<[^>]*>/g, '\n').replace(/&nbsp;/g, ' ');
  const lines = text.split(/\n|[!?;]|[.](?=\s|$)/).map((s) => s.trim()).filter(Boolean);
  const results = [];
  for (const line of lines) {
    // Company age, customer track records, and benefits are not candidate tenure.
    if (/\b(we have|our company|our team|founded|seit über|wir haben|unser Unternehmen|dahinter stehen)\b/i.test(line)
      && !/\b(you|your|candidate|du|dein|Sie bringen|Sie haben)\b/i.test(line)) continue;
    const matches = [];
    for (const pattern of [EXPERIENCE, REVERSED, SHORT_FORM]) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        if (!matches.some((m) => m.index < match.index + match[0].length && match.index < m.index + m[0].length)) matches.push(match);
      }
    }
    matches.sort((a, b) => a.index - b.index);
    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        // Keep adjacent requirements separate: "5 years total, 2 years in Python".
        const end = matches[i + 1]?.index ?? line.length;
        const clause = line.slice(m.index, end).replace(/[, ]+$/, '');
        const prefix = line.slice(i > 0 ? matches[i - 1].index + matches[i - 1][0].length : 0, m.index).split(',').at(-1).slice(-40);
        if (NEGATED.test(prefix) || /\b(?:experience|Erfahrung)\s+(?:is\s+)?(?:not required|nicht erforderlich)\b/i.test(clause)) continue;
        const minYears = number(m[1]), maxYears = m[2] ? number(m[2]) : null;
        if (!Number.isFinite(minYears) || minYears < 0 || minYears > 60 || (maxYears != null && maxYears < minYears)) continue;
        // Flattened adverts can put unrelated preferred skills much later on the same line.
        const local = prefix + clause.slice(0, m[0].length + 65).split(',')[0];
        const optional = OPTIONAL.test(local) && !/\b(required|mandatory|must|erforderlich|zwingend)\b/i.test(local);
        if (!results.some((r) => r.minYears === minYears && r.posting === line && r.clause === clause)) {
          results.push({ minYears, maxYears, optional, posting: line, clause,
            alternative: /\b(or|oder)\b/i.test(line) && (matches.length > 1 || /\b(equivalent|gleichwertig|degree|education|Abschluss)\b/i.test(line)) });
        }
    }
    if (!matches.length && /\b(several years|mehrjährige[rn]?)\s+(?:of\s+)?(?:experience|Berufserfahrung|Erfahrung)\b/i.test(line)) {
      results.push({ minYears: null, maxYears: null, optional: OPTIONAL.test(line), posting: line, clause: line });
    }
  }
  // Board-provided values are useful when the full description omits the tenure.
  if (!results.length && job.yearsExperience != null && !NEGATED.test(text)) {
    const raw = job.yearsExperience;
    const m = String(raw).trim().match(new RegExp('^' + RANGE + '(?:\\s*years?)?$', 'i'));
    if (m && number(m[1]) <= 60 && (!m[2] || number(m[2]) >= number(m[1]))) results.push({ minYears: number(m[1]), maxYears: m[2] ? number(m[2]) : null,
      optional: false, posting: 'Board experience field: ' + raw, clause: 'years of relevant experience' });
  }
  return results;
}

function scopeOf(requirement) {
  const text = requirement.clause;
  const core = [...text.matchAll(EXPERIENCE)][0]?.[0] || '';
  const qualifiers = core.replace(new RegExp('^' + RANGE + "\\s*(?:years?['’]?|Jahre?n?|jährig\\w*)\\s*", 'iu'), '')
    .replace(/\b(?:of|professional|work|working|relevant|practical|hands-on|experience|Berufserfahrung|Erfahrung|einschlägige[rn]?|praktische[rn]?)\b/gi, '').trim();
  const tail = text.replace(EXPERIENCE, '').replace(REVERSED, '')
    .replace(/\b(required|mandatory|minimum|preferred|ideally|erforderlich)\b/gi, '').trim().replace(/^[, ]+|[, ]+$/g, '');
  const generic = !qualifiers && !tail;
  const software = !qualifiers && /^(?:in|as|as a|in der)\s+(?:professional\s+)?(?:software (?:development|engineering|developer|engineer)|Softwareentwicklung)$/i.test(tail);
  const fullTime = /\b(full.time|vollzeit)\b/i.test(text)
    && !/\b(in|with|mit|als|as)\b/i.test(tail);
  return { generic, software, fullTime };
}

export function assessExperience(job, profile, evidence = '', options = {}) {
  const candidate = candidateExperience(profile, options);
  const requirements = extractExperienceRequirements(job).map((r) => {
    const scope = scopeOf(r);
    const years = candidate.years;
    const shortfall = years == null ? null : Math.max(0, r.minYears - years);
    let status = 'needs-checking';
    let detail = years == null ? 'Employment duration is not recorded with usable dates'
      : 'About ' + years.toFixed(1) + ' total calendar years from ' + candidate.source;
    if (years == null && /\b(?:19|20)\d{2}\b/.test(evidence)) detail += '; CV dates need confirmation in Memory';
    if (candidate.notes.length) detail += '. ' + candidate.notes.join('. ');
    if (years != null && !candidate.conflict && r.minYears != null && !r.alternative) {
      if (shortfall > 0 && !candidate.incomplete) {
        status = 'shortfall';
        detail += '. About ' + shortfall.toFixed(1) + ' years below the requested minimum';
      } else if (shortfall === 0 && scope.generic) status = 'matched';
      else if (shortfall === 0 && scope.fullTime && elapsedMonths(candidate.periods.filter((p) => p.fullTime)) / 12 >= r.minYears) {
        status = 'matched';
        detail += '. Explicitly full-time roles cover the requested duration';
      }
      else if (shortfall === 0 && scope.software
        && elapsedMonths(candidate.periods.filter((p) => /\b(software|developer|programmer|full.stack|backend|frontend|entwickler)\b/i.test(p.title))) / 12 >= r.minYears) {
        status = 'matched';
        detail += '. Dated software roles cover the requested duration';
      } else detail += '. Confirm the duration in the specific skill, role or employment type requested';
    }
    // Preferred tenure influences ordering but is never an eligibility rejection.
    if (r.alternative) detail += '. Posting offers alternative qualifications; check the accepted route';
    return { ...r, category: 'experience', label: (r.minYears == null ? 'Several years of experience (minimum unspecified)'
      : r.minYears + (r.maxYears != null ? '–' + r.maxYears : '+') + ' years of experience')
      + (r.optional ? ' preferred' : ' requested'), status, evidence: detail,
      candidateYears: years, shortfall, specific: !scope.generic };
  });
  return { candidate: { years: candidate.years, source: candidate.source, asOf: candidate.asOf, notes: candidate.notes }, requirements };
}
