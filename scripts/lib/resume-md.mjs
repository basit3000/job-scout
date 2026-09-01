/**
 * Load / parse / reorder cv/resume.md (source of truth for local CV mode).
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './common.mjs';

export function resumePaths() {
  return [
    join(ROOT, 'cv', 'resume.md'),
    join(ROOT, 'cv', 'resume.txt'),
  ];
}

export async function findResumePath() {
  for (const p of resumePaths()) {
    try {
      await access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function loadResumeText() {
  const path = await findResumePath();
  if (!path) return null;
  const text = await readFile(path, 'utf8');
  if (/\bYOUR_[A-Z0-9_]+\b/.test(text)) return null;
  return { path, text };
}

/**
 * Parse a simple markdown resume into structured parts.
 * Expects: # Name, contact line(s), optional headline, then ## Sections with ### entries.
 */
export function parseResumeMarkdown(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;

  let name = '';
  if (lines[i]?.startsWith('# ')) {
    name = lines[i].slice(2).trim();
    i += 1;
  }

  const preamble = [];
  while (i < lines.length && !lines[i].startsWith('## ')) {
    preamble.push(lines[i]);
    i += 1;
  }

  const preambleText = preamble.join('\n').trim();
  const preLines = preambleText.split('\n').map((l) => l.trim()).filter(Boolean);
  let contact = '';
  let headline = '';
  let targetRole = '';
  for (const line of preLines) {
    const role = line.match(/^Target role:\s*\*?\*?(.+?)\*?\*?$/i);
    if (role) {
      targetRole = role[1].trim();
      continue;
    }
    if (!contact && (/@/.test(line) || /https?:\/\//i.test(line) || /·/.test(line))) {
      contact = line;
      continue;
    }
    if (!headline) headline = line;
  }

  const sections = [];
  while (i < lines.length) {
    if (!lines[i].startsWith('## ')) {
      i += 1;
      continue;
    }
    const heading = lines[i].slice(3).trim();
    i += 1;
    const bodyLines = [];
    while (i < lines.length && !lines[i].startsWith('## ')) {
      bodyLines.push(lines[i]);
      i += 1;
    }
    sections.push({
      heading,
      ...parseSectionBody(heading, bodyLines.join('\n').trim()),
    });
  }

  return { name, contact, headline, targetRole, sections, raw: text };
}

function parseSectionBody(heading, body) {
  const h = heading.toLowerCase();
  if (h === 'skills') {
    const skills = body
      .split(/\n/)
      .flatMap((l) => l.split(/\s*[·|,]\s*/))
      .map((s) => s.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
    return { kind: 'skills', skills, entries: [] };
  }

  if (h === 'education') {
    const entries = [];
    for (const block of body.split(/\n\n+/)) {
      const t = block.trim();
      if (!t) continue;
      // **Degree** — School (dates)   OR   **School** · dates \n Degree
      const m = t.match(/^\*\*(.+?)\*\*\s*(?:—|–|-)?\s*(.*)$/m);
      if (m) {
        const left = m[1].trim();
        const right = (m[2] || '').trim();
        const looksLikeDegree = /master|bachelor|b\.?sc|m\.?sc|student|diploma|phd|doctor/i.test(left);
        const degree = looksLikeDegree ? left : right || left;
        const schoolPart = looksLikeDegree ? right : left;
        const dateInParens = schoolPart.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        entries.push({
          title: degree,
          org: dateInParens ? dateInParens[1].trim() : schoolPart,
          dates: dateInParens ? dateInParens[2].trim() : '',
          bullets: t.split('\n').slice(1).map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean),
          raw: t,
        });
      } else {
        entries.push({ title: t.split('\n')[0], org: '', dates: '', bullets: [], raw: t });
      }
    }
    return { kind: 'education', entries, skills: [] };
  }

  // Experience / Projects / other: ### Title — Org
  const entries = [];
  const chunks = body.split(/\n(?=### )/);
  for (const chunk of chunks) {
    const t = chunk.trim();
    if (!t) continue;
    if (!t.startsWith('### ')) {
      // loose paragraph
      entries.push({ title: t.split('\n')[0], org: '', dates: '', bullets: [], raw: t });
      continue;
    }
    const lines = t.split('\n');
    const head = lines[0].slice(4).trim();
    const em = head.match(/^(.+?)\s+[—–-]\s+(.+)$/);
    const title = em ? em[1].trim() : head;
    const org = em ? em[2].trim() : '';
    let dates = '';
    let bi = 1;
    if (lines[1] && !lines[1].startsWith('-') && !lines[1].startsWith('*')) {
      dates = lines[1].trim();
      bi = 2;
    }
    const bullets = lines
      .slice(bi)
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean);
    entries.push({ title, org, dates, bullets, raw: t });
  }
  return { kind: 'entries', entries, skills: [] };
}

function words(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]/i)
    .filter((w) => w.length >= 3);
}

function scoreText(text, keywords) {
  const set = new Set(words(text));
  let n = 0;
  for (const k of keywords) if (set.has(k)) n += 1;
  return n;
}

function isPersonalOrg(org) {
  return !org || /personal|portfolio|side|own|hobby|self/i.test(org);
}

/**
 * Reorder a parsed resume for a job (cv-tailor: Experience first).
 * Does not invent content — only reorders and re-weights bullets/skills.
 */
export function tailorParsedResume(parsed, keywords, profile = {}) {
  const kw = [...new Set(keywords.filter(Boolean))];
  const byHeading = Object.fromEntries(
    parsed.sections.map((s) => [s.heading.toLowerCase(), s]),
  );

  const exp = byHeading.experience;
  const projSec = byHeading.projects;
  const edu = byHeading.education;
  const skillsSec = byHeading.skills;

  const fromExp = (exp?.entries ?? []).map((e) => ({ ...e, _personal: isPersonalOrg(e.org) }));
  const projects = [
    ...(projSec?.entries ?? []),
    ...fromExp.filter((e) => e._personal),
  ]
    .map((e) => ({
      ...e,
      score: scoreText(`${e.title} ${e.org} ${(e.bullets || []).join(' ')}`, kw),
      bullets: rankBullets(e.bullets, kw, { limit: 3 }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const experience = fromExp
    .filter((e) => !e._personal)
    .map((e) => ({
      ...e,
      score: scoreText(`${e.title} ${e.org} ${(e.bullets || []).join(' ')}`, kw),
      bullets: rankBullets(e.bullets, kw), // keep every experience bullet
    }));

  let skillLine = skillsSec?.skills?.length
    ? [...skillsSec.skills].sort(
        (a, b) => scoreText(b, kw) - scoreText(a, kw) || a.localeCompare(b),
      )
    : [
        ...(profile.skills?.strong ?? []),
        ...(profile.skills?.familiar ?? []),
      ];
  const highlighted = skillLine.filter((s) => scoreText(s, kw) > 0);
  skillLine = [...new Set([...highlighted, ...skillLine])].slice(0, 8);

  const role =
    parsed.targetRole
    || profile.targetRole
    || 'Software Developer';
  const techHint = (highlighted.length ? highlighted : skillLine).slice(0, 4).join(', ');
  const headline = techHint
    ? `${role} — ${techHint}`
    : (parsed.headline || profile.headline || role);

  const education = edu?.entries?.length
    ? edu.entries
    : (profile.education ?? []).map((ed) => ({
        title: ed.degree || '',
        org: ed.school || '',
        dates: [ed.from, ed.to].filter(Boolean).join(' – '),
        bullets: [],
      }));

  return {
    name: parsed.name || profile.name || '',
    contact: parsed.contact
      || [
          profile.links?.email,
          profile.links?.linkedin,
          profile.links?.github,
          profile.links?.portfolio || profile.links?.site,
          profile.location?.showOnCv === false
            ? null
            : (profile.location?.cvDisplay || profile.location?.current),
        ]
          .filter(Boolean)
          .join(' · '),
    headline,
    education,
    projects,
    experience,
    skillLine,
    source: 'resume.md',
  };
}

function rankBullets(bullets, keywords, { limit = Infinity } = {}) {
  const weak = /^(responsible for|helped with|worked on|assisted|utilised|utilized)\b/i;
  const ranked = [...(bullets ?? [])]
    .map((text) => ({
      text,
      score: scoreText(text, keywords) + (weak.test(text) ? -2 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const capped = Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
  return capped.map((b) => b.text);
}

/** Serialize tailored resume back to markdown (cv-tailor section order). */
export function serializeTailoredResume(model) {
  const lines = [];
  lines.push(`# ${model.name}`, '');
  if (model.contact) lines.push(model.contact, '');
  if (model.headline) lines.push(model.headline, '');

  // Experience always first (cv-tailor hard rule)
  if (model.experience?.length) {
    lines.push('## Experience', '');
    for (const e of model.experience) {
      lines.push(`### ${e.title}${e.org ? ` — ${e.org}` : ''}`);
      if (e.dates) lines.push(e.dates);
      lines.push('');
      for (const b of e.bullets ?? []) lines.push(`- ${b}`);
      lines.push('');
    }
  }

  if (model.education?.length) {
    lines.push('## Education', '');
    for (const ed of model.education) {
      if (ed.org || ed.title) {
        const school = ed.org || '';
        const degree = ed.title || '';
        if (school) lines.push(`**${school}**${ed.dates ? ` · ${ed.dates}` : ''}`);
        if (degree) lines.push(degree);
      } else if (ed.raw) {
        lines.push(ed.raw);
      }
      for (const b of ed.bullets ?? []) lines.push(`- ${b}`);
      lines.push('');
    }
  }

  if (model.projects?.length) {
    lines.push('## Projects', '');
    for (const p of model.projects) {
      lines.push(`### ${p.title}`);
      if (p.dates) lines.push(p.dates);
      lines.push('');
      for (const b of p.bullets ?? []) lines.push(`- ${b}`);
      lines.push('');
    }
  }

  if (model.skillLine?.length) {
    lines.push('## Skills', '');
    lines.push(model.skillLine.join(' · '), '');
  }

  return `${lines.join('\n').trim()}\n`;
}

/** Optionally refresh the master cv/resume.md with tailored order (local mode). */
export async function writeMasterResume(markdown) {
  const path = join(ROOT, 'cv', 'resume.md');
  await writeFile(path, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
  return path;
}
