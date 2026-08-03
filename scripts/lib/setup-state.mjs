/**
 * First-run setup: template copies + readiness checks + apply wizard payload.
 * Personal files stay gitignored.
 */

import { access, copyFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPlaceholders, isPlaceholder } from './placeholders.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

const TEMPLATE_COPIES = [
  ['profile.example.json', 'profile.json'],
  ['search-profile.example.json', 'search-profile.json'],
  ['cv/resume.example.md', 'cv/resume.md'],
  ['.env.example', '.env'],
  ['state/decisions.example.json', 'state/decisions.json'],
];

export async function ensureLocalTemplates({ quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  let created = 0;

  for (const [fromRel, toRel] of TEMPLATE_COPIES) {
    const from = join(ROOT, fromRel);
    const to = join(ROOT, toRel);
    await mkdir(dirname(to), { recursive: true });
    if (await exists(to)) continue;
    if (!(await exists(from))) continue;
    await copyFile(from, to);
    log(`  create ${toRel}`);
    created += 1;
  }

  const answersPath = join(ROOT, 'state', 'saved-answers.json');
  if (!(await exists(answersPath))) {
    await mkdir(join(ROOT, 'state'), { recursive: true });
    await writeFile(
      answersPath,
      `${JSON.stringify({
        answers: {
          workAuthorization: '',
          needsSponsorship: '',
          noticePeriod: '',
          salaryExpectation: '',
          earliestStart: '',
          citiesOpenTo: '',
          remotePreference: '',
          phone: '',
          linkedin: '',
          github: '',
          portfolio: '',
        },
        updatedAt: null,
      }, null, 2)}\n`,
    );
    log('  create state/saved-answers.json');
    created += 1;
  }

  return created;
}

function splitList(value) {
  return String(value ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function titlesToIncludePatterns(titles) {
  return titles.map((t) => {
    const parts = t
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean);
    return parts.join('\\s*');
  });
}

export async function getSetupStatus() {
  await ensureLocalTemplates({ quiet: true });

  const profile = await loadJson(join(ROOT, 'profile.json'), null);
  const search = await loadJson(join(ROOT, 'search-profile.json'), null);
  const resumePath = join(ROOT, 'cv', 'resume.md');
  const hasResume = await exists(resumePath);
  let resumeHasPlaceholders = false;
  if (hasResume) {
    const text = await readFile(resumePath, 'utf8');
    resumeHasPlaceholders = /\bYOUR_[A-Z0-9_]+\b/.test(text);
  }

  const profileHits = profile ? findPlaceholders(profile) : [{ path: 'profile.json', value: 'missing' }];
  const criticalPaths = new Set([
    'name',
    'targetRole',
    'search.titles[0]',
    'links.email',
  ]);
  const criticalMissing = profileHits
    .filter((h) => [...criticalPaths].some((p) => h.path === p || h.path.startsWith('search.titles')))
    .map((h) => h.path);

  const nameOk = profile?.name && !isPlaceholder(profile.name);
  const roleOk = profile?.targetRole && !isPlaceholder(profile.targetRole);
  const titles = (profile?.search?.titles ?? []).filter((t) => t && !isPlaceholder(t));
  const marketOk = Boolean(search?.market && !String(search.market).startsWith('YOUR_'));

  const needsSetup = !(nameOk && roleOk && titles.length >= 1 && marketOk);

  return {
    needsSetup,
    ready: !needsSetup,
    nameOk,
    roleOk,
    marketOk,
    titleCount: titles.length,
    hasResume,
    resumeHasPlaceholders,
    criticalMissing,
    placeholderCount: profileHits.length,
    market: search?.market ?? null,
    candidate: nameOk ? profile.name : null,
    targetRole: roleOk ? profile.targetRole : null,
  };
}

/** Apply first-run wizard answers → local profile + search-profile (+ light CV stub). */
export async function applySetup(body = {}) {
  await ensureLocalTemplates({ quiet: true });

  const name = String(body.name || '').trim();
  const targetRole = String(body.targetRole || '').trim();
  const market = String(body.market || 'DE').trim().toUpperCase();
  const email = String(body.email || '').trim();
  const headline = String(body.headline || '').trim() || `${targetRole}`;
  const currentLocation = String(body.currentLocation || '').trim() || market;
  const seniority = String(body.seniority || 'entry').trim() || 'entry';
  const titles = (
    Array.isArray(body.titles) && body.titles.length
      ? body.titles.map((t) => String(t).trim()).filter(Boolean)
      : splitList(body.searchTitles || targetRole)
  );
  const skillsStrong = splitList(body.skills || body.skillsStrong);
  const cities = splitList(body.cities);
  const linkedin = String(body.linkedin || '').trim();
  const github = String(body.github || '').trim();
  const portfolio = String(body.portfolio || '').trim();
  const openToRemote = body.openToRemote !== false && body.openToRemote !== 'false';

  if (!name) throw new Error('Name is required');
  if (!targetRole) throw new Error('Target role is required');
  if (!titles.length) throw new Error('Add at least one search title');
  if (!market) throw new Error('Market is required');

  const profilePath = join(ROOT, 'profile.json');
  const existingProfile = (await loadJson(profilePath, null)) || {};
  const profile = {
    ...existingProfile,
    _README: 'Created by Job Scout first-run setup. Local only (gitignored).',
    name,
    headline,
    targetRole,
    location: {
      ...(existingProfile.location ?? {}),
      current: currentLocation,
      targets: cities.length ? cities : (existingProfile.location?.targets ?? []),
      openToRemote,
      willingToRelocate: body.willingToRelocate !== false && body.willingToRelocate !== 'false',
    },
    seniority,
    skills: {
      strong: skillsStrong.length ? skillsStrong : (existingProfile.skills?.strong ?? [targetRole]),
      familiar: existingProfile.skills?.familiar ?? [],
      learning: existingProfile.skills?.learning ?? [],
    },
    experience: Array.isArray(existingProfile.experience) && existingProfile.experience.length
      && !findPlaceholders(existingProfile.experience).length
      ? existingProfile.experience
      : [
          {
            title: targetRole,
            org: 'Personal / education',
            from: null,
            to: 'present',
            bullets: [
              `Looking for ${targetRole} roles in ${market}`,
              'Update this section in profile.json or cv/resume.md with real experience',
            ],
          },
        ],
    education: Array.isArray(existingProfile.education) && existingProfile.education.length
      && !findPlaceholders(existingProfile.education).length
      ? existingProfile.education
      : [],
    links: {
      ...(existingProfile.links ?? {}),
      email: email || existingProfile.links?.email || '',
      linkedin: linkedin || existingProfile.links?.linkedin || '',
      github: github || existingProfile.links?.github || '',
      portfolio: portfolio || existingProfile.links?.portfolio || '',
      site: portfolio || existingProfile.links?.site || '',
    },
    search: {
      ...(existingProfile.search ?? {}),
      titles,
      includeTitlePatterns: titlesToIncludePatterns(titles),
      excludeTitlePatterns: existingProfile.search?.excludeTitlePatterns?.length
        && !findPlaceholders(existingProfile.search.excludeTitlePatterns).length
        ? existingProfile.search.excludeTitlePatterns
        : ['sales|recruiter|account\\s+executive'],
    },
    constraints: {
      dropNationalsOnly: true,
      maxAgeDays: 30,
      excludeCompanies: [],
      notes: [
        `Target market: ${market}`,
        currentLocation ? `Based in ${currentLocation}` : '',
      ].filter(Boolean),
    },
  };

  const searchPath = join(ROOT, 'search-profile.json');
  const existingSearch = (await loadJson(searchPath, null)) || {};
  const searchProfile = {
    ...existingSearch,
    market,
    boards: existingSearch.boards?.length
      ? existingSearch.boards
      : [
          { board: 'indeed', queriesFromProfile: true },
          { board: 'linkedin', queriesFromProfile: true },
        ],
    limitPerQuery: existingSearch.limitPerQuery ?? 15,
    preferJobspy: existingSearch.preferJobspy !== false,
    maxApifyRuns: existingSearch.maxApifyRuns ?? 8,
    cities: cities.length
      ? cities.map((where) => ({ where, radiusKm: 50 }))
      : existingSearch.cities,
    filters: {
      ...(existingSearch.filters ?? {}),
      maxAgeDays: existingSearch.filters?.maxAgeDays ?? 14,
      countryOnly: true,
      dropNationalsOnly: true,
    },
  };

  // Germany: enable free DE APIs when market is DE and boards look like defaults.
  if (market === 'DE') {
    const ids = new Set(
      (searchProfile.boards ?? []).map((b) => (typeof b === 'string' ? b : b.board)),
    );
    for (const board of ['arbeitsagentur', 'arbeitnow']) {
      if (!ids.has(board)) {
        searchProfile.boards.push({ board, queriesFromProfile: true });
      }
    }
  }

  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  await writeFile(searchPath, `${JSON.stringify(searchProfile, null, 2)}\n`);

  const resumePath = join(ROOT, 'cv', 'resume.md');
  const resumeExists = await exists(resumePath);
  let resumeText = resumeExists ? await readFile(resumePath, 'utf8') : '';
  if (!resumeExists || /\bYOUR_[A-Z0-9_]+\b/.test(resumeText)) {
    resumeText = buildResumeMarkdown(profile);
    await mkdir(join(ROOT, 'cv'), { recursive: true });
    await writeFile(resumePath, resumeText);
  }

  const answersPath = join(ROOT, 'state', 'saved-answers.json');
  const answersDoc = (await loadJson(answersPath, null)) || { answers: {} };
  answersDoc.answers = {
    ...(answersDoc.answers ?? {}),
    linkedin: linkedin || answersDoc.answers?.linkedin || '',
    github: github || answersDoc.answers?.github || '',
    portfolio: portfolio || answersDoc.answers?.portfolio || '',
    citiesOpenTo: cities.join(', ') || answersDoc.answers?.citiesOpenTo || '',
    remotePreference: openToRemote ? 'Open to remote' : answersDoc.answers?.remotePreference || '',
  };
  answersDoc.updatedAt = new Date().toISOString();
  await writeFile(answersPath, `${JSON.stringify(answersDoc, null, 2)}\n`);

  return getSetupStatus();
}

export function buildResumeMarkdown(profile) {
  const links = profile.links ?? {};
  const skills = [
    ...(profile.skills?.strong ?? []),
    ...(profile.skills?.familiar ?? []),
  ];
  const lines = [];
  lines.push(`# ${profile.name}`);
  lines.push('');
  lines.push(
    [
      profile.location?.current,
      links.email,
      links.linkedin,
      links.github,
      links.portfolio || links.site,
    ]
      .filter(Boolean)
      .join(' · '),
  );
  lines.push('');
  if (profile.headline) {
    lines.push(profile.headline);
    lines.push('');
  }
  lines.push(`Target role: **${profile.targetRole}**`);
  lines.push('');

  if (profile.experience?.length) {
    lines.push('## Experience');
    lines.push('');
    for (const job of profile.experience) {
      lines.push(`### ${job.title}${job.org ? ` — ${job.org}` : ''}`);
      const dates = [job.from, job.to].filter(Boolean).join(' – ');
      if (dates) lines.push(dates);
      lines.push('');
      for (const b of job.bullets ?? []) lines.push(`- ${b}`);
      lines.push('');
    }
  }

  if (profile.education?.length) {
    lines.push('## Education');
    lines.push('');
    for (const ed of profile.education) {
      lines.push(`**${ed.degree}** — ${ed.school}${ed.to ? ` (${ed.to})` : ''}`);
      lines.push('');
    }
  }

  if (skills.length) {
    lines.push('## Skills');
    lines.push('');
    lines.push(skills.join(' · '));
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}
