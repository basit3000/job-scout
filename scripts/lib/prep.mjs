import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceDir, loadJson, ROOT } from './common.mjs';
import {
  buildTailoredCvAsync,
  tailoredCvHtml,
  tailoredCvMarkdown,
  tailoredRequirementsMarkdown,
} from './tailor-cv.mjs';
import { writeMasterResume } from './resume-md.mjs';
import { htmlFileToPdf } from './pdf.mjs';
import {
  overleafConfigured,
  overleafStatus,
  runOverleafTailor,
  readOverleafAts,
} from './overleaf-cv.mjs';
import { overleafTexToHtml, overleafTexToMarkdown } from './tex-html.mjs';
import {
  exportCvDownloads,
  cvFileBaseName,
  revealDownloadsFolder,
} from './cv-downloads.mjs';

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export function prepDir(jobId) {
  return join(workspaceDir(), 'prep', safeId(jobId));
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function hasTailoredCv(jobId) {
  return fileExists(join(prepDir(jobId), 'cv.html'));
}

export async function hasCvPdf(jobId) {
  const dir = prepDir(jobId);
  return (
    (await fileExists(join(dir, 'cv.pdf')))
    || (await fileExists(join(dir, 'cv-ats.pdf')))
    || (await fileExists(join(dir, 'cv-main.pdf')))
  );
}

export async function hasCvPdfAts(jobId) {
  return fileExists(join(prepDir(jobId), 'cv-ats.pdf'));
}

export async function hasCvPdfMain(jobId) {
  return fileExists(join(prepDir(jobId), 'cv-main.pdf'));
}

/** True if pack already has downloadable PDF(s) — skip compile unless recreate. */
export async function hasCachedPdfs(jobId) {
  return hasCvPdf(jobId);
}

/** Read cv.source from search-profile.json */
export async function loadCvSettings() {
  const config = await loadJson(join(ROOT, 'search-profile.json'), {});
  const cv = config.cv || {};
  const source = cv.source === 'overleaf' ? 'overleaf' : 'local';
  return {
    source,
    overleafPush: cv.overleafPush !== false,
    updateMaster: cv.updateMaster === true,
  };
}

export function buildCoverLetter(job, profile, fit) {
  const name = profile?.name ?? 'Candidate';
  const role = profile?.targetRole ?? 'the role';
  const skills = (fit?.matched?.length ? fit.matched : profile?.skills?.strong ?? []).slice(0, 5);
  const site = profile?.links?.portfolio || profile?.links?.site || profile?.links?.github || '';

  return `Dear Hiring Team,

I am writing to apply for the ${job.title} position at ${job.company}. I am a ${profile?.headline || role} and this posting aligns with my target role (${role}).

${skills.length ? `Relevant strengths I can bring: ${skills.join(', ')}.` : 'I have attached my CV with project and education detail.'}

${fit?.reasons?.[0] ? `${fit.reasons[0]}.` : ''}

I would welcome the chance to discuss how I can contribute at ${job.company}. Thank you for your consideration.

Kind regards,
${name}
${profile?.links?.email ?? ''}
${site}
`.trim() + '\n';
}

export function buildJobPostingMd(job) {
  return `# ${job.title} — ${job.company}

- **URL:** ${job.url || '_none_'}
- **Location:** ${job.location || '_unknown_'}
- **Board:** ${job.board || '?'} via ${job.via || '?'}
- **ID:** \`${job.id}\`

## Description

${job.description || '_No description captured — open the URL._'}
`;
}

export function buildChecklistMd(job, fit, savedAnswers = {}, { hasCv = false, hasPdf = false } = {}) {
  const lines = [
    `# Application checklist — ${job.title}`,
    '',
    `Company: **${job.company}**`,
    `Fit: **${fit?.verdict ?? '?'}** (${fit?.score ?? '?'} / 100)`,
    '',
    '## Before you submit',
    '',
  ];
  for (const item of fit?.checklist ?? []) {
    let ok = item.ok;
    let detail = item.detail;
    if (item.id === 'cv') {
      ok = hasCv;
      detail = hasCv
        ? (hasPdf ? 'CV PDF(s) + cv.html in this pack' : 'cv.html / cv.md in this pack')
        : detail;
    }
    if (item.id === 'letter') ok = true;
    const mark = ok === true ? '[x]' : ok === false ? '[ ]' : '[ ]';
    lines.push(`- ${mark} ${item.label}${detail ? ` — ${detail}` : ''}`);
  }
  lines.push('', '## Saved answers to reuse', '');
  const entries = Object.entries(savedAnswers).filter(([, v]) => v);
  if (!entries.length) lines.push('_None yet — fill Saved answers in the UI._');
  else for (const [k, v] of entries) lines.push(`- **${k}:** ${v}`);
  lines.push('', `Apply link: ${job.url || '_none_'}`, '');
  return lines.join('\n');
}

export function buildPrepIndex(job, fit, {
  hasCv = false,
  hasPdf = false,
  hasAts = false,
  hasMain = false,
  cvSource = 'local',
  overleaf = null,
  extraInstructions = null,
  downloadFolder = null,
} = {}) {
  const pdfLines = [];
  if (hasMain || hasPdf) pdfLines.push('- Friendly export: `<Name> CV.pdf` in downloads folder');
  if (hasAts) pdfLines.push('- [CV PDF (ATS)](./cv-ats.pdf)');
  if (hasMain) pdfLines.push('- [CV PDF (Main)](./cv-main.pdf)');
  if (hasPdf && !hasAts && !hasMain) pdfLines.push('- [CV PDF](./cv.pdf)');
  if (!pdfLines.length) pdfLines.push('- _PDF: open HTML → Print, or enable Overleaf + LaTeX / Chrome_');
  if (downloadFolder) pdfLines.push(`- Download folder: \`${downloadFolder}\``);
  const olLines = overleaf
    ? [
        '',
        '## Overleaf',
        '',
        `- Sync: ${overleaf.sync?.action || overleaf.sync || '?'}`,
        `- Edited: ${(overleaf.tailor?.edited || overleaf.edited || []).join(', ') || '_no reorder applied_'}`,
        `- Push: ${(overleaf.push?.pushed ?? overleaf.pushed) ? 'yes' : overleaf.push?.reason || overleaf.pushReason || 'no'}`,
        `- ATS PDF: ${overleaf.pdf?.hasAts ? overleaf.pdf.via || 'yes' : overleaf.pdf?.ats?.error || 'n/a'}`,
        `- Main PDF: ${overleaf.pdf?.hasMain ? overleaf.pdf.via || 'yes' : overleaf.pdf?.main?.error || 'n/a'}`,
      ]
    : [];

  const instr = extraInstructions
    ? `\n- Extra instructions: ${extraInstructions}\n`
    : '\n- Extra instructions: _none_\n';

  return `# Prep pack — ${job.title} @ ${job.company}

- Fit: **${fit.verdict}** (${fit.score}/100)
- CV source: **${cvSource}**${instr}- Matched: ${(fit.matched || []).join(', ') || '_none_'}
- Gaps: ${(fit.gaps || []).join('; ') || '_none_'}

## Files

- [Tailored CV (HTML)](./cv.html)${hasCv ? '' : ' _(generate)_'}
- [Tailored CV (Markdown)](./cv.md)
${pdfLines.join('\n')}
- [Requirement → evidence map](./requirements.md)
- [Job posting](./job-posting.md)
- [Cover letter](./cover-letter.md)
- [Checklist](./checklist.md)

Format: \`references/cv-writing-rules.md\`. Local mode edits from \`cv/resume.md\`.
${olLines.join('\n')}

## Apply

Open the job URL and submit yourself. This pack does **not** auto-apply.

${job.url || '_no url_'}
`;
}

function packDownloads(jobId, { hasPdf, hasAts, hasMain }, profileName = 'Candidate') {
  const base = `/api/prep/${encodeURIComponent(jobId)}`;
  const nice = cvFileBaseName(profileName);
  return {
    downloadCvHtml: `${base}/cv.html`,
    downloadCvMd: `${base}/cv.md`,
    downloadCvPdf: hasPdf ? `${base}/cv.pdf` : null,
    downloadCvPdfAts: hasAts ? `${base}/cv-ats.pdf?download=1` : null,
    downloadCvPdfMain: hasMain ? `${base}/cv-main.pdf?download=1` : (hasPdf ? `${base}/cv.pdf?download=1` : null),
    downloadLabelMain: `${nice} CV.pdf`,
    downloadLabelAts: `${nice} CV ATS.pdf`,
  };
}

async function publishDownloads(job, profile, dir, { hasAts, hasMain, hasPdf }) {
  const atsPath = hasAts ? join(dir, 'cv-ats.pdf') : null;
  const mainPath = hasMain
    ? join(dir, 'cv-main.pdf')
    : hasPdf
      ? join(dir, 'cv.pdf')
      : null;
  if (!atsPath && !mainPath) return null;
  try {
    return await exportCvDownloads({
      company: job.company,
      profileName: profile?.name,
      atsPdfPath: atsPath,
      mainPdfPath: hasMain ? mainPath : null,
      jobTitle: job.title,
    });
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

async function pdfFlags(jobId) {
  const dir = prepDir(jobId);
  const hasAts = await fileExists(join(dir, 'cv-ats.pdf'));
  const hasMain = await fileExists(join(dir, 'cv-main.pdf'));
  const hasPdf =
    hasAts || hasMain || (await fileExists(join(dir, 'cv.pdf')));
  return { hasAts, hasMain, hasPdf };
}

/** Return existing pack without rebuilding (cache hit). */
export async function loadCachedPrepPack(jobId, fit = null, job = null, profile = null) {
  const hasCv = await hasTailoredCv(jobId);
  const flags = await pdfFlags(jobId);
  if (!hasCv && !flags.hasPdf) return null;

  let coverLetter = '';
  try {
    coverLetter = await readFile(join(prepDir(jobId), 'cover-letter.md'), 'utf8');
  } catch {
    /* ignore */
  }

  const settings = await loadCvSettings();
  let downloadExport = null;
  if (job && profile) {
    downloadExport = await publishDownloads(job, profile, prepDir(jobId), flags);
  }

  return {
    dir: prepDir(jobId),
    relativeDir: `.workspace/prep/${safeId(jobId)}`,
    files: [],
    coverLetter,
    checklist: fit?.checklist,
    hasCv,
    ...flags,
    pdfNote: 'cached (not recompiled)',
    cvSource: settings.source,
    cvContentSource: settings.source === 'overleaf' ? 'overleaf (cached)' : 'cached',
    overleaf: null,
    cached: true,
    applyUrl: job?.url || null,
    jobId,
    downloadFolder: downloadExport?.relativeDir || null,
    downloadFolderAbs: downloadExport?.absoluteDir || null,
    downloadError: downloadExport?.error || null,
    ...packDownloads(jobId, flags, profile?.name),
  };
}

/** Write prep files + tailored CV under .workspace/prep/<id>/ */
export async function writePrepPack(job, profile, fit, savedAnswers = {}, options = {}) {
  const dir = prepDir(job.id);
  await mkdir(dir, { recursive: true });

  const settings = { ...(await loadCvSettings()), ...options };
  const extraInstructions = String(options.extraInstructions || '').trim();
  const recreate = options.recreate !== false; // caller controls cache; default rebuild when invoked

  // Cache short-circuit (explicit)
  if (options.useCache === true || (options.recreate === false && (await hasCachedPdfs(job.id)))) {
    const cached = await loadCachedPrepPack(job.id, fit, job, profile);
    if (cached) return cached;
  }

  void recreate;

  const model = await buildTailoredCvAsync(job, profile, fit);
  // Merge instruction keywords into model keywords for local path too
  if (extraInstructions) {
    const extra = extraInstructions
      .toLowerCase()
      .split(/[^a-z0-9+#.]/i)
      .filter((w) => w.length >= 3);
    model.keywords = [...new Set([...(model.keywords || []), ...extra])];
  }

  let cvMd = model.resumeMarkdown || tailoredCvMarkdown(model);
  let cvHtml = tailoredCvHtml(model);
  const requirementsMd = tailoredRequirementsMarkdown(model);

  if (settings.source === 'local' && settings.updateMaster && model.resumeMarkdown) {
    await writeMasterResume(model.resumeMarkdown);
  }

  let overleafResult = null;
  let hasAts = false;
  let hasMain = false;

  if (settings.source === 'overleaf') {
    if (!overleafConfigured()) {
      throw new Error(
        'CV source is Overleaf but OVERLEAF_GIT_TOKEN / OVERLEAF_PROJECT_ID are empty in .env',
      );
    }
    overleafResult = await runOverleafTailor({
      push: settings.overleafPush !== false,
      keywords: model.keywords || [],
      job,
      prepDir: dir,
      extraInstructions,
    });
    hasAts = Boolean(overleafResult.pdf?.hasAts);
    hasMain = Boolean(overleafResult.pdf?.hasMain);

    const ats = await readOverleafAts();
    if (ats?.text) {
      const prepBase = `/api/prep/${encodeURIComponent(job.id)}`;
      cvHtml = overleafTexToHtml(ats.text, {
        jobTitle: job.title,
        company: job.company,
        prepBase,
      });
      cvMd = overleafTexToMarkdown(ats.text);
    }
  }

  const files = {
    'job-posting.md': buildJobPostingMd(job),
    'cover-letter.md': buildCoverLetter(job, profile, fit),
    'cv.md': cvMd,
    'cv.html': cvHtml,
    'requirements.md': requirementsMd,
  };
  if (extraInstructions) {
    files['instructions.md'] = `# Extra instructions\n\n${extraInstructions}\n`;
  }

  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body.endsWith('\n') ? body : `${body}\n`);
  }

  let hasPdf = hasAts || hasMain;
  let pdfNote = '';
  if (overleafResult?.pdf?.ok) {
    hasPdf = true;
    const parts = [];
    if (hasAts) parts.push('ats');
    if (hasMain) parts.push('main');
    pdfNote = `Overleaf LaTeX ${parts.join('+')} (${overleafResult.pdf.via})`;
  } else if (settings.source === 'overleaf') {
    const pdfPath = join(dir, 'cv.pdf');
    const printed = await htmlFileToPdf(join(dir, 'cv.html'), pdfPath);
    if (printed.ok) {
      hasPdf = true;
      pdfNote = `Overleaf content → PDF via browser (LaTeX: ${overleafResult?.pdf?.error || 'n/a'})`;
    } else {
      pdfNote = printed.error || overleafResult?.pdf?.error || 'no PDF';
    }
  } else {
    const pdfPath = join(dir, 'cv.pdf');
    const printed = await htmlFileToPdf(join(dir, 'cv.html'), pdfPath);
    if (printed.ok) {
      hasPdf = true;
      pdfNote = 'HTML→PDF via browser';
    } else {
      pdfNote = printed.error || 'no PDF';
    }
  }

  // Refresh flags from disk
  const flags = await pdfFlags(job.id);
  hasAts = flags.hasAts;
  hasMain = flags.hasMain;
  hasPdf = flags.hasPdf;

  const downloadExport = await publishDownloads(job, profile, dir, flags);

  files['checklist.md'] = buildChecklistMd(job, fit, savedAnswers, { hasCv: true, hasPdf });
  files['README.md'] = buildPrepIndex(job, fit, {
    hasCv: true,
    hasPdf,
    hasAts,
    hasMain,
    cvSource: settings.source,
    overleaf: overleafResult,
    extraInstructions: extraInstructions || null,
    downloadFolder: downloadExport?.relativeDir || null,
  });
  await writeFile(join(dir, 'checklist.md'), `${files['checklist.md'].trim()}\n`);
  await writeFile(join(dir, 'README.md'), `${files['README.md'].trim()}\n`);

  const pdfFiles = [
    ...(hasAts ? ['cv-ats.pdf'] : []),
    ...(hasMain ? ['cv-main.pdf'] : []),
    ...(hasPdf ? ['cv.pdf'] : []),
  ];

  return {
    dir,
    relativeDir: `.workspace/prep/${safeId(job.id)}`,
    files: [...Object.keys(files), ...pdfFiles],
    coverLetter: files['cover-letter.md'],
    checklist: fit.checklist,
    hasCv: true,
    hasPdf,
    hasAts,
    hasMain,
    pdfNote,
    cvSource: settings.source,
    cvContentSource: settings.source === 'overleaf' ? 'overleaf/ats.tex' : model.meta?.source,
    extraInstructions: extraInstructions || null,
    cached: false,
    jobId: job.id,
    downloadFolder: downloadExport?.relativeDir || null,
    downloadFolderAbs: downloadExport?.absoluteDir || null,
    downloadError: downloadExport?.error || null,
    overleaf: overleafResult
      ? {
          edited: overleafResult.tailor?.edited || [],
          pushed: Boolean(overleafResult.push?.pushed),
          pushReason: overleafResult.push?.reason,
          sync: overleafResult.sync?.action,
          status: overleafStatus(),
          pdf: overleafResult.pdf,
        }
      : null,
    applyUrl: job.url || null,
    ...packDownloads(job.id, { hasPdf, hasAts, hasMain }, profile?.name),
  };
}

export async function readPrepPack(jobId) {
  const dir = prepDir(jobId);
  try {
    const readme = await readFile(join(dir, 'README.md'), 'utf8');
    const coverLetter = await readFile(join(dir, 'cover-letter.md'), 'utf8');
    const checklist = await readFile(join(dir, 'checklist.md'), 'utf8');
    const jobPosting = await readFile(join(dir, 'job-posting.md'), 'utf8');
    const hasCv = await hasTailoredCv(jobId);
    const flags = await pdfFlags(jobId);
    let cvMd = null;
    if (hasCv) {
      try {
        cvMd = await readFile(join(dir, 'cv.md'), 'utf8');
      } catch {
        /* ignore */
      }
    }
    return {
      relativeDir: `.workspace/prep/${safeId(jobId)}`,
      readme,
      coverLetter,
      checklist,
      jobPosting,
      hasCv,
      ...flags,
      cvMd,
      ...packDownloads(jobId, flags),
    };
  } catch {
    return null;
  }
}

export { cvFileBaseName };

export async function readPrepFile(jobId, filename) {
  const allowed = new Set([
    'cv.html',
    'cv.md',
    'cv.pdf',
    'cv-ats.pdf',
    'cv-main.pdf',
    'requirements.md',
    'cover-letter.md',
    'job-posting.md',
    'checklist.md',
    'README.md',
    'instructions.md',
  ]);
  if (!allowed.has(filename)) return null;
  const path = join(prepDir(jobId), filename);
  try {
    if (filename.endsWith('.pdf')) {
      await access(path);
      return { path, binary: true };
    }
    const body = await readFile(path, 'utf8');
    return { body, binary: false };
  } catch {
    return null;
  }
}

/** Re-export PDFs into <project-root>/downloads/<Company>/. */
export async function exportPrepDownloads(job, profile) {
  if (!job?.id) return { error: 'job required' };
  const flags = await pdfFlags(job.id);
  return publishDownloads(job, profile, prepDir(job.id), flags);
}

export { overleafStatus, overleafConfigured, revealDownloadsFolder };
