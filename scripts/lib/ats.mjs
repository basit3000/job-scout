/**
 * Classify an apply URL: listing board vs company ATS.
 * Used to label jobs and decide whether headed fill is worth trying.
 * Never submits — detection only.
 */

const RULES = [
  { id: 'greenhouse', label: 'Greenhouse', kind: 'ats', fillable: true, re: /greenhouse\.io/i },
  { id: 'lever', label: 'Lever', kind: 'ats', fillable: true, re: /jobs\.lever\.co|lever\.co\//i },
  { id: 'ashby', label: 'Ashby', kind: 'ats', fillable: true, re: /ashbyhq\.com/i },
  { id: 'personio', label: 'Personio', kind: 'ats', fillable: true, re: /personio\.(de|com|at)/i },
  { id: 'recruitee', label: 'Recruitee', kind: 'ats', fillable: true, re: /recruitee\.com/i },
  { id: 'workable', label: 'Workable', kind: 'ats', fillable: true, re: /apply\.workable\.com|jobs\.workable\.com/i },
  { id: 'smartrecruiters', label: 'SmartRecruiters', kind: 'ats', fillable: true, re: /smartrecruiters\.com/i },
  { id: 'teamtailor', label: 'Teamtailor', kind: 'ats', fillable: true, re: /teamtailor\.com/i },
  { id: 'breezy', label: 'Breezy', kind: 'ats', fillable: true, re: /breezy\.hr/i },
  { id: 'join', label: 'Join', kind: 'ats', fillable: true, re: /join\.com/i },
  { id: 'softgarden', label: 'softgarden', kind: 'ats', fillable: true, re: /softgarden\.(io|de|com)/i },
  { id: 'homerun', label: 'Homerun', kind: 'ats', fillable: true, re: /homerun\.co/i },
  { id: 'bamboohr', label: 'BambooHR', kind: 'ats', fillable: true, re: /bamboohr\.com/i },
  { id: 'jobvite', label: 'Jobvite', kind: 'ats', fillable: true, re: /jobvite\.com/i },
  { id: 'workday', label: 'Workday', kind: 'ats', fillable: false, re: /myworkdayjobs\.com|workday\.com/i },
  { id: 'icims', label: 'iCIMS', kind: 'ats', fillable: false, re: /icims\.com/i },
  { id: 'successfactors', label: 'SuccessFactors', kind: 'ats', fillable: false, re: /successfactors\.|sap\.com\/jobs/i },
  { id: 'taleo', label: 'Taleo', kind: 'ats', fillable: false, re: /taleo\.net/i },
  { id: 'linkedin', label: 'LinkedIn', kind: 'board', fillable: true, re: /linkedin\.com/i },
  { id: 'indeed', label: 'Indeed', kind: 'board', fillable: false, re: /indeed\.com/i },
  { id: 'xing', label: 'Xing', kind: 'board', fillable: false, re: /xing\.com/i },
  { id: 'stepstone', label: 'StepStone', kind: 'board', fillable: false, re: /stepstone\./i },
  { id: 'glassdoor', label: 'Glassdoor', kind: 'board', fillable: false, re: /glassdoor\./i },
  { id: 'arbeitnow', label: 'Arbeitnow', kind: 'aggregator', fillable: false, re: /arbeitnow\./i },
  { id: 'nomado', label: 'Nomado24', kind: 'aggregator', fillable: false, re: /nomado24\./i },
  { id: 'arbeitsagentur', label: 'Arbeitsagentur', kind: 'board', fillable: false, re: /arbeitsagentur\.de/i },
  { id: 'heise', label: 'Heise Jobs', kind: 'board', fillable: false, re: /jobs\.heise\.de/i },
  { id: 'germantechjobs', label: 'GermanTechJobs', kind: 'board', fillable: false, re: /germantechjobs\.de/i },
  { id: 'kimeta', label: 'Kimeta', kind: 'aggregator', fillable: false, re: /kimeta\.de/i },
];

const HINTS = {
  ats: 'Company application form — Fill can try known fields, then you submit.',
  board: 'Listing page — open Apply, then use Copy pack or the Fill bookmarklet on the form.',
  aggregator: 'Aggregator listing — usually bounces to the company site. Fill after the real form loads.',
  unknown: 'Unknown host — Copy pack, open the page, use the Fill bookmarklet on the form.',
};

const WORKDAY_HINT = 'Workday forms vary a lot — open the form, then use Copy pack / the Fill bookmarklet.';
const LINKEDIN_HINT = 'LinkedIn Easy Apply: Fill opens Chrome (stays logged in), completes the form, and submits. First run: log in if asked, then click Fill again.';

export function detectAts(url) {
  const raw = String(url || '').trim();
  if (!raw) {
    return {
      id: 'none',
      label: 'No URL',
      kind: 'unknown',
      fillable: false,
      hint: 'No apply link on this posting.',
      host: '',
    };
  }

  let host = '';
  try {
    host = new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }

  const hit = RULES.find((r) => r.re.test(raw) || (host && r.re.test(host)));
  if (!hit) {
    return {
      id: 'unknown',
      label: host || 'Unknown',
      kind: 'unknown',
      fillable: false,
      hint: HINTS.unknown,
      host,
    };
  }

  let hint = HINTS[hit.kind] || HINTS.unknown;
  if (hit.id === 'workday') hint = WORKDAY_HINT;
  if (hit.id === 'linkedin') hint = LINKEDIN_HINT;

  return {
    id: hit.id,
    label: hit.label,
    kind: hit.kind,
    fillable: hit.fillable,
    hint,
    host,
  };
}
