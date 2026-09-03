/**
 * Per-job tailored CV — mirrors cv-tailor writing/format rules (see
 * references/cv-writing-rules.md). Prefers cv/resume.md when present; else profile.json.
 * Reorders true facts only; never invents.
 *
 * Layout (cv-tailor hard rule): Header → Experience → Education → Projects → Skills
 * No summary paragraph. ATS-friendly single column HTML.
 */

import {
  loadResumeText,
  parseResumeMarkdown,
  tailorParsedResume,
  serializeTailoredResume,
} from './resume-md.mjs';

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

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const WEAK_START = /^(responsible for|helped with|worked on|assisted|utilised|utilized)\b/i;

/** Prefer bullets that already read like cv-tailor (concrete verb, not filler). */
function rankBullets(bullets, keywords) {
  return [...(bullets ?? [])]
    .map((text) => ({
      text,
      score: scoreText(text, keywords) + (WEAK_START.test(text) ? -2 : 0),
    }))
    .sort((a, b) => b.score - a.score);
}

function isProjectEntry(exp) {
  const org = String(exp.org ?? '').toLowerCase();
  return !org
    || /personal|portfolio|side|own|hobby|freelance\s*project|self/.test(org);
}

function scoreEntry(exp, keywords, { keepAllBullets = false } = {}) {
  const bullets = rankBullets(exp.bullets, keywords);
  const chosen = keepAllBullets
    ? bullets.map((b) => b.text)
    : (
      bullets.filter((b) => b.score > 0).slice(0, 3).length
        ? bullets.filter((b) => b.score > 0).slice(0, 3)
        : bullets.slice(0, 2)
    ).map((b) => b.text);
  const score =
    scoreText(`${exp.title} ${exp.org}`, keywords)
    + chosen.reduce((n, t) => n + scoreText(t, keywords), 0);
  return { ...exp, bullets: chosen, score };
}

/** Extract rough requirement phrases from a job description for the evidence map. */
function extractRequirements(job) {
  const text = String(job.description || '');
  const lines = text
    .split(/\n|(?<=[.:;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 140);
  const hit = lines.filter((l) =>
    /\b(experience|knowledge|proficien|require|must|should|familiar|skill|python|java|react|docker|sql|api|degree|german|english)\b/i.test(
      l,
    ),
  );
  return unique(hit).slice(0, 12);
}

function evidenceForRequirement(req, profile, projects, skills) {
  const kw = words(req);
  const skillHits = skills.filter((s) => scoreText(s, kw) > 0);
  const projectHits = projects
    .filter((p) => scoreText(`${p.title} ${p.org} ${(p.bullets || []).join(' ')}`, kw) > 0)
    .map((p) => p.title);
  const eduHits = (profile.education ?? [])
    .filter((e) => scoreText(`${e.degree} ${e.school}`, kw) > 0)
    .map((e) => e.school || e.degree);
  const evidence = unique([...skillHits, ...projectHits, ...eduHits]);
  return {
    requirement: req,
    evidence: evidence.slice(0, 4),
    confidence: evidence.length ? (skillHits.length || projectHits.length ? 'profile' : 'weak') : 'none',
    action: evidence.length ? 'Lead / keep on CV' : 'Do not claim — gap',
  };
}

function jobKeywords(job, fit = {}) {
  const desc = `${job.title || ''} ${job.company || ''} ${job.description || ''}`;
  return unique([
    ...words(desc),
    ...(fit.matched || []).flatMap((m) => words(m)),
  ]);
}

function fromProfile(job, profile, fit, keywords) {
  const strong = profile.skills?.strong ?? [];
  const familiar = profile.skills?.familiar ?? [];
  const allSkills = [...strong, ...familiar];
  const rankedSkills = [...allSkills].sort(
    (a, b) => scoreText(b, keywords) - scoreText(a, keywords) || a.localeCompare(b),
  );
  const highlighted = rankedSkills.filter((s) => scoreText(s, keywords) > 0);
  const skillLine = unique([...highlighted, ...rankedSkills]).slice(0, 8);

  const scored = (profile.experience ?? []).map((e) =>
    scoreEntry(e, keywords, { keepAllBullets: !isProjectEntry(e) }),
  );
  const projects = scored
    .filter((e) => isProjectEntry(e))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const experience = scored.filter((e) => !isProjectEntry(e));

  const role = profile.targetRole || 'Software Developer';
  const techHint = (highlighted.length ? highlighted : skillLine).slice(0, 4).join(', ');
  const headline = techHint ? `${role} — ${techHint}` : (profile.headline || role);
  const links = profile.links ?? {};
  const contact = [
    links.email,
    links.linkedin,
    links.github,
    links.portfolio || links.site,
    profile.location?.showOnCv === false
      ? null
      : (profile.location?.cvDisplay || profile.location?.current),
  ].filter(Boolean);

  return {
    name: profile.name,
    headline,
    skillLine,
    projects,
    experience,
    education: (profile.education ?? []).map((ed) => ({
      school: ed.school,
      degree: ed.degree,
      from: ed.from,
      to: ed.to,
      org: ed.school,
      title: ed.degree,
      dates: [ed.from, ed.to].filter(Boolean).join(' – '),
      bullets: [],
    })),
    contact,
    allSkills,
    highlighted,
    source: 'profile.json',
  };
}

function fromResume(job, profile, fit, keywords, resumeText) {
  const parsed = parseResumeMarkdown(resumeText);
  const tailored = tailorParsedResume(parsed, keywords, profile);
  const allSkills = tailored.skillLine;
  const highlighted = allSkills.filter((s) => scoreText(s, keywords) > 0);
  return {
    name: tailored.name || profile.name,
    headline: tailored.headline,
    skillLine: tailored.skillLine,
    projects: tailored.projects,
    experience: tailored.experience,
    education: tailored.education.map((ed) => ({
      school: ed.org,
      degree: ed.title,
      from: '',
      to: ed.dates || '',
      org: ed.org,
      title: ed.title,
      dates: ed.dates,
      bullets: ed.bullets || [],
    })),
    contact: typeof tailored.contact === 'string'
      ? tailored.contact.split(/\s*·\s*/).filter(Boolean)
      : tailored.contact,
    allSkills,
    highlighted,
    source: 'cv/resume.md',
    resumeModel: tailored,
    resumeMarkdown: serializeTailoredResume(tailored),
  };
}

/**
 * Rank skills/projects against the posting; never invent content.
 * Pass resumeText (from cv/resume.md) to edit that CV instead of profile-only rebuild.
 */
export function buildTailoredCv(job, profile, fit = {}, { resumeText = null } = {}) {
  const keywords = jobKeywords(job, fit);
  const core = resumeText
    ? fromResume(job, profile, fit, keywords, resumeText)
    : fromProfile(job, profile, fit, keywords);

  const requirements = extractRequirements(job).map((r) =>
    evidenceForRequirement(r, profile, core.projects, core.allSkills),
  );
  const gaps = unique([
    ...requirements.filter((r) => r.confidence === 'none').map((r) => r.requirement),
    ...(fit.gaps || []),
  ]);

  const meta = {
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    generatedAt: new Date().toISOString(),
    matchedSkills: (core.highlighted || []).slice(0, 8),
    source: core.source,
    rules: 'references/cv-writing-rules.md (mirrored from cv-tailor)',
  };

  return {
    ...core,
    keywords,
    requirements,
    gaps,
    profile,
    job,
    fit,
    meta,
  };
}

/** Async: load cv/resume.md when present, then tailor. */
export async function buildTailoredCvAsync(job, profile, fit = {}) {
  const resume = await loadResumeText();
  return buildTailoredCv(job, profile, fit, {
    resumeText: resume?.text || null,
  });
}

function renderEntriesMd(entries, heading) {
  if (!entries?.length) return [];
  const lines = [`## ${heading}`, ''];
  for (const exp of entries) {
    lines.push(`### ${exp.title}${exp.org && !isProjectEntry(exp) ? ` — ${exp.org}` : ''}`);
    const dates = exp.dates || [exp.from, exp.to].filter(Boolean).join(' – ');
    if (dates) lines.push(dates);
    // Tech hint from title scoring — optional italic line like cv-template \entry second arg
    lines.push('');
    for (const b of exp.bullets ?? []) lines.push(`- ${b}`);
    lines.push('');
  }
  return lines;
}

export function tailoredCvMarkdown(model) {
  const { profile, headline, skillLine, projects, experience, education, contact, meta, job } = model;
  const contactLine = Array.isArray(contact) ? contact.join(' · ') : String(contact || '');
  const lines = [];
  lines.push(`# ${model.name || profile.name}`);
  lines.push('');
  lines.push(headline);
  lines.push('');
  lines.push(contactLine);
  lines.push('');
  // Non-body note for the pack (not a CV "Summary" section)
  lines.push(`<!-- Tailored for ${job.title} @ ${job.company} · ${meta.generatedAt.slice(0, 10)} · source ${meta.source} · ${meta.rules} -->`);
  lines.push('');

  lines.push(...renderEntriesMd(experience, 'Experience'));

  if (education.length) {
    lines.push('## Education');
    lines.push('');
    for (const ed of education) {
      const dates = ed.dates || [ed.from, ed.to].filter(Boolean).join(' – ');
      lines.push(`**${ed.school || ed.org || ''}**${dates ? ` · ${dates}` : ''}`);
      lines.push(`${ed.degree || ed.title || ''}`.trim());
      lines.push('');
    }
  }

  lines.push(...renderEntriesMd(projects, 'Projects'));
  if (skillLine.length) {
    lines.push('## Skills');
    lines.push('');
    lines.push(skillLine.join(' · '));
    lines.push('');
  }

  lines.push('---');
  lines.push(`_Facts from ${meta.source || 'profile'} — reordered for this posting. No invented metrics or employment._`);
  lines.push('');
  return lines.join('\n');
}

export function tailoredRequirementsMarkdown(model) {
  const { job, requirements, gaps, meta, fit } = model;
  const lines = [
    `# Requirement map — ${job.title} @ ${job.company}`,
    '',
    `Generated ${meta.generatedAt}. Same idea as cv-tailor’s requirement-to-evidence table.`,
    '',
    '| Requirement | Evidence | Confidence | Action |',
    '| --- | --- | --- | --- |',
  ];
  for (const r of requirements) {
    const ev = r.evidence.length ? r.evidence.join('; ') : '_none_';
    lines.push(`| ${r.requirement.replace(/\|/g, '/')} | ${ev.replace(/\|/g, '/')} | ${r.confidence} | ${r.action} |`);
  }
  if (!requirements.length) {
    lines.push('| _(little structured text in posting)_ | Use fit matched skills | — | Reorder projects by keywords |');
  }
  lines.push('');
  lines.push('## Gaps / open questions');
  lines.push('');
  if (gaps.length) for (const g of gaps.slice(0, 15)) lines.push(`- ${g}`);
  else lines.push('- _None auto-detected._');
  lines.push('');
  if (fit?.matched?.length) {
    lines.push('## Matched from fit scorer');
    lines.push('');
    lines.push(fit.matched.join(', '));
    lines.push('');
  }
  lines.push('Do **not** add gap items to the CV. Ask the candidate, or leave them off.');
  lines.push('');
  return lines.join('\n');
}

function renderEntriesHtml(entries, asProjects) {
  return (entries || [])
    .map((exp) => {
      const dates = exp.dates || [exp.from, exp.to].filter(Boolean).join(' – ');
      const bullets = (exp.bullets ?? []).map((b) => `<li>${escapeHtml(b)}</li>`).join('');
      const title = asProjects
        ? escapeHtml(exp.title)
        : `${escapeHtml(exp.title)}${exp.org ? ` — ${escapeHtml(exp.org)}` : ''}`;
      return `<section class="entry">
  <div class="entry-head"><strong>${title}</strong>${dates ? `<span class="dates">${escapeHtml(dates)}</span>` : ''}</div>
  <ul>${bullets}</ul>
</section>`;
    })
    .join('\n');
}

export function tailoredCvHtml(model) {
  const { profile, headline, skillLine, projects, experience, education, contact, meta, job } = model;
  const displayName = model.name || profile.name || 'CV';
  const contactList = Array.isArray(contact)
    ? contact
    : String(contact || '').split(/\s*·\s*/).filter(Boolean);
  const filenameBase = `${displayName.replace(/\s+/g, '_')}_${(job.company || 'role')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 40)}`;
  const prepBase = `/api/prep/${encodeURIComponent(job.id)}`;

  const eduHtml = education
    .map((ed) => {
      const dates = ed.dates || [ed.from, ed.to].filter(Boolean).join(' – ');
      return `<section class="entry">
  <div class="entry-head"><strong>${escapeHtml(ed.school || ed.org || '')}</strong>${dates ? `<span class="dates">${escapeHtml(dates)}</span>` : ''}</div>
  <p class="sub">${escapeHtml(ed.degree || ed.title || '')}</p>
</section>`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(profile.name)} — CV</title>
  <style>
    /* ATS-friendly single column — mirrors cv-tailor ats.tex intent */
    @page { size: A4; margin: 12mm 14mm; }
    body { font-family: "Calibri", "Segoe UI", Arial, sans-serif; font-size: 10.5pt; max-width: 720px; margin: 1.5rem auto; padding: 0 1rem 2.5rem; color: #111; line-height: 1.28; }
    h1 { margin: 0; font-size: 16pt; text-align: center; letter-spacing: -0.01em; }
    .headline { text-align: center; margin: 0.25rem 0 0.15rem; font-size: 10.5pt; }
    .contact { text-align: center; color: #333; font-size: 9.5pt; margin: 0 0 0.45rem; word-break: break-word; }
    h2 { margin: 0.55rem 0 0.2rem; font-size: 10.5pt; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #444; padding-bottom: 2px; }
    .entry { margin: 0.28rem 0 0.18rem; }
    .entry-head { display: flex; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    .dates, .sub { color: #333; font-size: 10pt; font-style: italic; }
    .sub { margin: 0.1rem 0 0; font-style: normal; }
    ul { margin: 0.15rem 0 0; padding-left: 1.1em; }
    li { margin: 0.1rem 0; }
    .toolbar { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .toolbar button, .toolbar a {
      font: inherit; font-size: 10pt; font-weight: 600; border: 1px solid #889; background: #f3f5f6;
      border-radius: 6px; padding: 0.4rem 0.75rem; cursor: pointer; text-decoration: none; color: #111;
    }
    .toolbar .primary { background: #111; color: #fff; border-color: #111; }
    .pack-note { font-size: 9pt; color: #555; margin: 0 0 0.75rem; }
    .foot { margin-top: 1.25rem; font-size: 8.5pt; color: #666; }
    @media print {
      .toolbar, .pack-note, .foot { display: none !important; }
      body { margin: 0; padding: 0; max-width: none; font-size: 10pt; line-height: 1.22; }
      h2 { margin: 0.4rem 0 0.12rem; }
      .entry { margin: 0.18rem 0 0.1rem; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" class="primary" onclick="window.print()">Print / Save as PDF</button>
    <a href="${prepBase}/cv.md?download=1" download="${escapeHtml(filenameBase)}.md">Download Markdown</a>
    <a href="${prepBase}/cv.pdf?download=1" download="${escapeHtml(filenameBase)}.pdf">Download PDF</a>
    <a href="${prepBase}/requirements.md" target="_blank" rel="noopener">Requirement map</a>
  </div>
  <p class="pack-note">Pack for <strong>${escapeHtml(job.title)}</strong> @ <strong>${escapeHtml(job.company)}</strong> — source <strong>${escapeHtml(meta.source || '')}</strong>. Not printed.</p>

  <h1>${escapeHtml(displayName)}</h1>
  <p class="headline">${escapeHtml(headline)}</p>
  <p class="contact">${contactList.map(escapeHtml).join(' · ')}</p>

  ${experience.length ? `<h2>Experience</h2>\n${renderEntriesHtml(experience, false)}` : ''}
  ${eduHtml ? `<h2>Education</h2>\n${eduHtml}` : ''}
  ${projects.length ? `<h2>Projects</h2>\n${renderEntriesHtml(projects, true)}` : ''}
  ${skillLine.length ? `<h2>Skills</h2>\n<p>${skillLine.map(escapeHtml).join(' · ')}</p>` : ''}

  <p class="foot">Generated ${escapeHtml(meta.generatedAt.slice(0, 10))} from ${escapeHtml(meta.source || 'profile')}. No invented metrics. Submit applications yourself.</p>
</body>
</html>
`;
}
