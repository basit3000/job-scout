import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceDir } from './common.mjs';
import { detectAts } from './ats.mjs';
import { cvFileBaseName, downloadsRoot, safeFolderName } from './cv-downloads.mjs';

function unset(value) {
  const s = String(value ?? '').trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  if (/^YOUR_[A-Z0-9_]+/.test(s) || s.includes('YOUR_')) return '';
  return s;
}

export function splitName(fullName) {
  const parts = unset(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '', fullName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '', fullName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    fullName: parts.join(' '),
  };
}

function prepDir(jobId) {
  return join(workspaceDir(), 'prep', String(jobId).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120));
}

function pickExisting(...paths) {
  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

function readCoverLetter(path) {
  if (!path || !existsSync(path)) return '';
  try {
    return unset(readFileSync(path, 'utf8')).slice(0, 8000);
  } catch {
    return '';
  }
}

export function formatApplyPackText(pack) {
  const heading = pack.title || pack.company
    ? `Apply pack — ${pack.title || 'Role'} @ ${pack.company || 'Company'}`
    : 'Apply pack — profile + saved answers';
  const lines = [
    heading,
    `ATS: ${pack.ats?.label || 'Unknown'}${pack.ats?.fillable ? ' (Fill can try this form)' : ''}`,
    pack.applyUrl ? `URL: ${pack.applyUrl}` : '',
    '',
    `Name: ${pack.fullName || ''}`,
    `Email: ${pack.email || ''}`,
    `Phone: ${pack.phone || ''}`,
    `LinkedIn: ${pack.linkedin || ''}`,
    `GitHub: ${pack.github || ''}`,
    `Portfolio: ${pack.website || ''}`,
    '',
    `Work authorisation: ${pack.workAuthorization || ''}`,
    `Sponsorship: ${pack.needsSponsorship || ''}`,
    `Notice period: ${pack.noticePeriod || ''}`,
    `Salary: ${pack.salaryExpectation || ''}`,
    `Earliest start: ${pack.earliestStart || ''}`,
    `Cities: ${pack.citiesOpenTo || ''}`,
    `Remote: ${pack.remotePreference || ''}`,
    '',
    pack.files?.folderAbs ? `Files folder: ${pack.files.folderAbs}` : 'Files folder: (run Prep to export CV / letter)',
    pack.files?.cvPdf ? `CV: ${pack.files.cvPdf}` : '',
    pack.files?.coverLetterPdf ? `Cover letter PDF: ${pack.files.coverLetterPdf}` : '',
    pack.files?.coverLetterMd ? `Cover letter MD: ${pack.files.coverLetterMd}` : '',
    '',
    'LinkedIn Easy Apply: Fill submits. Other sites: Fill types fields; you confirm Submit.',
  ];
  return `${lines.filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n').trim()}\n`;
}

/** Slim pack for bookmarklets / Playwright (no filesystem paths). */
export function slimPackForFill(pack) {
  return {
    jobId: pack.jobId,
    title: pack.title,
    company: pack.company,
    applyUrl: pack.applyUrl,
    firstName: pack.firstName,
    lastName: pack.lastName,
    fullName: pack.fullName,
    email: pack.email,
    phone: pack.phone,
    linkedin: pack.linkedin,
    github: pack.github,
    website: pack.website,
    salaryExpectation: pack.salaryExpectation,
    noticePeriod: pack.noticePeriod,
    earliestStart: pack.earliestStart,
    workAuthorization: pack.workAuthorization,
    citiesOpenTo: pack.citiesOpenTo,
    remotePreference: pack.remotePreference,
    coverLetter: (pack.coverLetter || '').slice(0, 8000),
    needsSponsorship: pack.needsSponsorship,
    seniority: pack.seniority || '',
    skills: pack.skills || [],
    locationCurrent: pack.locationCurrent || '',
    willingToRelocate: pack.willingToRelocate,
    openToRemote: pack.openToRemote,
    educationDegree: pack.educationDegree || '',
    neverSubmit: true,
  };
}

export function buildApplyPack({ job = {}, profile = {}, answers = {} } = {}) {
  const names = splitName(profile.name);
  const links = profile.links || {};
  const ats = detectAts(job.url);
  const companyFolder = safeFolderName(job.company);
  const folderAbs = join(downloadsRoot(), companyFolder);
  const base = cvFileBaseName(profile.name);
  const prep = job.id ? prepDir(job.id) : null;

  const cvPdf = pickExisting(
    join(folderAbs, `${base} CV.pdf`),
    join(folderAbs, `${base} CV Main.pdf`),
    prep && join(prep, 'cv-ats.pdf'),
    prep && join(prep, 'cv-main.pdf'),
    prep && join(prep, 'cv.pdf'),
  );
  const coverLetterPdf = pickExisting(
    join(folderAbs, `${base} Cover Letter.pdf`),
    prep && join(prep, 'cover-letter.pdf'),
  );
  const coverLetterMd = pickExisting(
    join(folderAbs, `${base} Cover Letter.md`),
    prep && join(prep, 'cover-letter.md'),
  );
  const coverLetterDocx = pickExisting(join(folderAbs, `${base} Cover Letter.docx`));

  const pack = {
    jobId: job.id || null,
    title: unset(job.title),
    company: unset(job.company),
    applyUrl: unset(job.url),
    ats,
    ...names,
    email: unset(links.email) || unset(answers.email),
    phone: unset(answers.phone),
    linkedin: unset(answers.linkedin) || unset(links.linkedin),
    github: unset(answers.github) || unset(links.github),
    website: unset(answers.portfolio) || unset(links.portfolio) || unset(links.site),
    workAuthorization: unset(answers.workAuthorization),
    needsSponsorship: unset(answers.needsSponsorship),
    noticePeriod: unset(answers.noticePeriod),
    salaryExpectation: unset(answers.salaryExpectation),
    earliestStart: unset(answers.earliestStart),
    citiesOpenTo: unset(answers.citiesOpenTo),
    remotePreference: unset(answers.remotePreference),
    seniority: unset(profile.seniority),
    skills: [
      ...(profile.skills?.strong || []),
      ...(profile.skills?.familiar || []),
      ...(profile.skills?.learning || []),
    ]
      .map((s) => unset(s))
      .filter(Boolean),
    locationCurrent: unset(profile.location?.current),
    willingToRelocate: profile.location?.willingToRelocate,
    openToRemote: profile.location?.openToRemote,
    educationDegree: unset(profile.education?.[0]?.degree),
    coverLetter: readCoverLetter(coverLetterMd),
    files: {
      folderAbs: existsSync(folderAbs) ? folderAbs : null,
      cvPdf,
      coverLetterPdf,
      coverLetterMd,
      coverLetterDocx,
    },
    neverSubmit: true,
  };
  pack.text = formatApplyPackText(pack);
  return pack;
}
