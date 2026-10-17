/**
 * Classify an apply URL: listing board vs company ATS.
 * Used to label jobs and decide whether headed fill is worth trying.
 * Never submits — detection only.
 */

const RULES = [
  { id: 'greenhouse', label: 'Greenhouse', kind: 'ats', fillable: true },
  { id: 'lever', label: 'Lever', kind: 'ats', fillable: true },
  { id: 'ashby', label: 'Ashby', kind: 'ats', fillable: true },
  { id: 'personio', label: 'Personio', kind: 'ats', fillable: true },
  { id: 'recruitee', label: 'Recruitee', kind: 'ats', fillable: true },
  { id: 'workable', label: 'Workable', kind: 'ats', fillable: true },
  { id: 'smartrecruiters', label: 'SmartRecruiters', kind: 'ats', fillable: true },
  { id: 'teamtailor', label: 'Teamtailor', kind: 'ats', fillable: true },
  { id: 'breezy', label: 'Breezy', kind: 'ats', fillable: true },
  { id: 'join', label: 'Join', kind: 'ats', fillable: true },
  { id: 'softgarden', label: 'softgarden', kind: 'ats', fillable: true },
  { id: 'homerun', label: 'Homerun', kind: 'ats', fillable: true },
  { id: 'bamboohr', label: 'BambooHR', kind: 'ats', fillable: true },
  { id: 'jobvite', label: 'Jobvite', kind: 'ats', fillable: true },
  { id: 'workday', label: 'Workday', kind: 'ats', fillable: false },
  { id: 'icims', label: 'iCIMS', kind: 'ats', fillable: false },
  { id: 'successfactors', label: 'SuccessFactors', kind: 'ats', fillable: false },
  { id: 'taleo', label: 'Taleo', kind: 'ats', fillable: false },
  { id: 'linkedin', label: 'LinkedIn', kind: 'board', fillable: true },
  { id: 'indeed', label: 'Indeed', kind: 'board', fillable: false },
  { id: 'xing', label: 'Xing', kind: 'board', fillable: false },
  { id: 'stepstone', label: 'StepStone', kind: 'board', fillable: false },
  { id: 'glassdoor', label: 'Glassdoor', kind: 'board', fillable: false },
  { id: 'arbeitnow', label: 'Arbeitnow', kind: 'aggregator', fillable: false },
  { id: 'nomado', label: 'Nomado24', kind: 'aggregator', fillable: false },
  { id: 'arbeitsagentur', label: 'Arbeitsagentur', kind: 'board', fillable: false },
  { id: 'heise', label: 'Heise Jobs', kind: 'board', fillable: false },
  { id: 'germantechjobs', label: 'GermanTechJobs', kind: 'board', fillable: false },
  { id: 'kimeta', label: 'Kimeta', kind: 'aggregator', fillable: false },
];

const HINTS = {
  ats: 'Company application form — Fill can try known fields, then you submit.',
  board: 'Listing page — open Apply, then use Copy pack or the Fill bookmarklet on the form.',
  aggregator: 'Aggregator listing — usually bounces to the company site. Fill after the real form loads.',
  unknown: 'Unknown host — Copy pack, open the page, use the Fill bookmarklet on the form.',
};

const WORKDAY_HINT = 'Workday forms vary a lot — open the form, then use Copy pack / the Fill bookmarklet.';
const DOMAINS = {
  greenhouse: ['greenhouse.io'], lever: ['lever.co'], ashby: ['ashbyhq.com'], personio: ['personio.de','personio.com','personio.at'],
  recruitee: ['recruitee.com'], workable: ['workable.com'], smartrecruiters: ['smartrecruiters.com'], teamtailor: ['teamtailor.com'],
  breezy: ['breezy.hr'], join: ['join.com'], softgarden: ['softgarden.io','softgarden.de','softgarden.com'], homerun: ['homerun.co'],
  bamboohr: ['bamboohr.com'], jobvite: ['jobvite.com'], workday: ['myworkdayjobs.com','workday.com'], icims: ['icims.com'],
  successfactors: ['successfactors.com','successfactors.eu','sap.com'], taleo: ['taleo.net'], linkedin: ['linkedin.com'],
  indeed: ['indeed.com'], xing: ['xing.com'], stepstone: ['stepstone.de','stepstone.com'], glassdoor: ['glassdoor.com','glassdoor.de'],
  arbeitnow: ['arbeitnow.com'], nomado: ['nomado24.com'], arbeitsagentur: ['arbeitsagentur.de'], heise: ['heise.de'], germantechjobs: ['germantechjobs.de'], kimeta: ['kimeta.de'],
};

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

  const hit = /^https?:\/\//i.test(raw) && RULES.find(r => (DOMAINS[r.id] || []).some(domain => host === domain || host.endsWith('.' + domain)));
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
  if (hit.id === 'linkedin') hint = 'Fill starts a dry run. Review the form and explicitly choose Submit LinkedIn application. Live compatibility is unverified.';

  return {
    id: hit.id,
    label: hit.label,
    kind: hit.kind,
    fillable: hit.fillable,
    hint,
    host,
  };
}
