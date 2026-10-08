import { withMemorySnapshot, readMemory, candidateProfile, memoryAnswers } from './memory.mjs';
import { mkdir, writeFile, readFile, access, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { workspaceDir, loadJson, ROOT, prepDir } from './common.mjs';
import { buildTailoredCvAsync, tailoredRequirementsMarkdown, cvMarkdownToHtml } from './tailor-cv.mjs';

import { htmlFileToPdf } from './pdf.mjs';
import { ensureLocalCvFits } from './cv-html-fit.mjs';
import { overleafConfigured, overleafStatus, assembleOverleafAfterAgent, readOverleafAts } from './overleaf-cv.mjs';
import { overleafTexToHtml, overleafTexToMarkdown } from './tex-html.mjs';
import { exportCvDownloads, exportCoverLetterDownloads, cvFileBaseName, revealDownloadsFolder } from './cv-downloads.mjs';
import { buildCoverLetter, generateCoverLetterPack } from './cover-letter.mjs';
import { agentRunnerAvailable, currentEvidenceRel, runCvTailorAgent, seedPrepForAgent, loadAgentSession, resolveAgentModel } from './cv-agent.mjs';
import { verifyCvAfterAgent } from './cv-verify.mjs';
import { loadReviewSummary, runReviewerPass } from './cv-review.mjs';
import { WRITING_RULES_GENERIC } from './cv-style.mjs';
import { generateDocuments, prepStatus } from './prep-state.mjs';
import { currentCvTemplate, currentCvTemplateId } from './cv-template-context.mjs';
import { withJobTemplate } from './cv-template-packs.mjs';

export { prepDir };

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
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

/**
 * One-shot scan of `.workspace/prep/*` so list endpoints don't `access` per job.
 * Keys are safeId(jobId) folder names.
 */
export async function loadPrepFlagsIndex() {
  const root = join(workspaceDir(), 'prep');
  const index = new Map();
  let dirs;
  try {
    dirs = await readdir(root, { withFileTypes: true });
  } catch {
    return index;
  }
  // Bound filesystem work so a large prep folder cannot starve static-file reads.
  const folders = dirs.filter(ent => ent.isDirectory());
  for (let offset = 0; offset < folders.length; offset += 10) {
    await Promise.all(folders.slice(offset, offset + 10).map(async ent => {
      index.set(ent.name, await loadPrepFlagsForJob(ent.name));
    }));
  }
  return index;
}

/** Read only one requested posting's selected document folder. */
export async function loadPrepFlagsForJob(jobId) {
  const files = await withJobTemplate(jobId, null, () => readdir(prepDir(jobId))).catch(() => []);
  const set = new Set(files);
  const tailoredPdfAts = set.has('cv-ats.pdf');
  const tailoredPdfMain = set.has('cv-main.pdf');
  const tailoredPdf = set.has('cv.pdf') || tailoredPdfAts || tailoredPdfMain;
  return { tailoredCv: set.has('cv.html'), tailoredPdf, tailoredPdfAts, tailoredPdfMain,
    coverLetter: set.has('cover-letter.md'), prepCached: tailoredPdf };
}

export function prepFlagsForJob(index, jobId) {
  return index.get(safeId(jobId)) || {
    tailoredCv: false,
    tailoredPdf: false,
    tailoredPdfAts: false,
    tailoredPdfMain: false,
    coverLetter: false,
    prepCached: false,
  };
}

/** Read cv.* from search-profile.json */
export async function loadCvSettings() {
  const config = await loadJson(join(ROOT, 'search-profile.json'), {});
  const cv = config.cv || {};
  const source = !currentCvTemplate() && cv.source === 'overleaf' ? 'overleaf' : 'local';
  const tailorMode = 'agent';
  const agentProvider = 'goose';
  const agentModel = resolveAgentModel().id;
  return {
    source,
    tailorMode,
    agentProvider,
    agentModel,
  };
}

export { buildCoverLetter, generateCoverLetterPack };

export function buildJobPostingMd(job) {
  return `# ${job.title} — ${job.company}

- **URL:** ${job.url || '_none_'}
- **Location:** ${job.location || '_unknown_'}
- **Board:** ${job.board || '?'} via ${job.via || '?'}
- **ID:** \`${job.id}\`

## Description

${job.description || '_Job description unavailable. Continue with supported candidate evidence; record job-fit assessment limitations._'}
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
  if (hasAts) pdfLines.push('- Friendly export: `<Name> CV.pdf` (ATS) in downloads folder');
  if (hasMain || hasPdf) pdfLines.push('- Friendly export: `<Name> CV Main.pdf` in downloads folder');
  if (hasAts) pdfLines.push('- [CV PDF (ATS → named CV.pdf)](./cv-ats.pdf)');
  if (hasMain) pdfLines.push('- [CV PDF (Main)](./cv-main.pdf)');
  if (hasPdf && !hasAts && !hasMain) pdfLines.push('- [CV PDF](./cv.pdf)');
  if (!pdfLines.length) pdfLines.push('- _PDF: open HTML → Print, or enable Overleaf + LaTeX / Chrome_');
  if (downloadFolder) pdfLines.push(`- Download folder: \`${downloadFolder}\``);
  const fitPages = overleaf?.fit?.pages || overleaf?.pdf?.pages || {};
  const fitNote = overleaf?.fit
    ? `- Page check: ATS ${fitPages['ats.tex'] ?? fitPages.ats ?? '?'}p, Main ${fitPages['main.tex'] ?? fitPages.main ?? '?'}p${overleaf.fit.ok ? ' — within configured limit' : overleaf.fit.ok === false ? ' — needs review; complete documents preserved' : ''}`
    : null;
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
        ...(fitNote ? [fitNote] : []),
        ...(overleaf.pdf?.atsText
          ? [
              `- Text layer (what a parser reads, see cv-ats.txt): ${overleaf.pdf.atsText.ok ? 'clean' : `PROBLEMS — ${overleaf.pdf.atsText.problems.join('; ')}`}`,
              ...overleaf.pdf.atsText.warnings.map((w) => `  - note: ${w}`),
            ]
          : []),
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
- Agent runs only: [keyword gaps](./keyword-gaps.md), [agent report](./agent-report.md), [quality report](./quality-report.md), [reviewer](./review.md), [page check](./page-check.md) (read before sending)

Format: \`${WRITING_RULES_GENERIC}\`. Local mode edits from \`cv/resume.md\`.
${olLines.join('\n')}

## Apply

Job Scout **Fill** submits LinkedIn Easy Apply. Other boards are filled only — you confirm Submit.

${job.url || '_no url_'}
`;
}

function packDownloads(jobId, { hasPdf, hasAts, hasMain }, profileName = 'Candidate') {
  const base = `/api/prep/${encodeURIComponent(jobId)}`;
  const nice = cvFileBaseName(profileName);
  const links = {
    downloadCvHtml: `${base}/cv.html`,
    downloadCvMd: `${base}/cv.md`,
    downloadCvPdf: hasPdf ? `${base}/cv.pdf` : null,
    downloadCvPdfAts: hasAts ? `${base}/cv-ats.pdf?download=1` : null,
    downloadCvPdfMain: hasMain ? `${base}/cv-main.pdf?download=1` : (hasPdf ? `${base}/cv.pdf?download=1` : null),
    downloadCoverLetter: `${base}/cover-letter.md`,
    downloadCoverLetterPdf: `${base}/cover-letter.pdf?download=1`,
    downloadLabelMain: `${nice} CV Main.pdf`,
    downloadLabelAts: `${nice} CV.pdf`,
  };
  for (const key of Object.keys(links).filter(k => k.startsWith('downloadCv'))) {
    if (links[key]) links[key] += `${links[key].includes('?') ? '&' : '?'}template=${currentCvTemplateId()}`;
  }
  return { ...links, templateId: currentCvTemplateId(), templateName: currentCvTemplate()?.name || 'Current CV format' };
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
      jobId: job.id,
      company: job.company,
      profileName: profile?.name,
      atsPdfPath: atsPath || (!hasMain ? mainPath : null),
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
async function finalizePrepPack({
  job,
  profile,
  fit,
  savedAnswers,
  dir,
  settings,
  extraInstructions,
  model,
  cvMd,
  cvHtml,
  requirementsMd,
  overleafResult,
  tailorMode,
  agentMeta = null,
}) {
  const files = {
    'job-posting.md': buildJobPostingMd(job),
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

  const agent = agentMeta || (await loadAgentSession(dir));

  let hasAts = Boolean(overleafResult?.pdf?.hasAts);
  let hasMain = Boolean(overleafResult?.pdf?.hasMain);
  let hasPdf = hasAts || hasMain;
  let pdfNote = '';
  if (overleafResult?.pdf?.ok) {
    hasPdf = true;
    const parts = [];
    if (hasAts) parts.push('ats');
    if (hasMain) parts.push('main');
    pdfNote = `Overleaf LaTeX ${parts.join('+')} (${overleafResult.pdf.via})`;
    if (tailorMode === 'agent') pdfNote = `Agent + ${pdfNote}`;
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
    const fitted = await ensureLocalCvFits({
      html: cvHtml,
      markdown: cvMd,
      job,
      profile,
      meta: { ...(model?.meta || {}), source: model?.meta?.source || 'agent/cv.md' },
      htmlPath: join(dir, 'cv.html'),
      pdfPath,
      onEvent: settings.onEvent || null,
    });
    cvHtml = fitted.html;
    files['cv.html'] = cvHtml;
    if (fitted.printed?.ok) {
      hasPdf = true;
      pdfNote = tailorMode === 'agent' ? 'Agent CV → PDF via browser' : 'HTML→PDF via browser';
      if (fitted.pages > 1) pdfNote += ` (${fitted.pages} pages)`;
    } else {
      pdfNote = fitted.printed?.error || 'no PDF';
    }
  }

  const flags = {
    hasAts: await fileExists(join(dir, 'cv-ats.pdf')),
    hasMain: await fileExists(join(dir, 'cv-main.pdf')),
    hasPdf: hasPdf || await fileExists(join(dir, 'cv.pdf')),
  };
  hasAts = flags.hasAts;
  hasMain = flags.hasMain;
  hasPdf = flags.hasAts || flags.hasMain || flags.hasPdf;

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
    ...(hasPdf && !hasAts && !hasMain ? ['cv.pdf'] : []),
    ...(hasPdf && (hasAts || hasMain) ? ['cv.pdf'] : []),
  ];

  return {
    dir,
    relativeDir: relative(ROOT, dir).replace(/\\/g, '/'),
    files: [...new Set([...Object.keys(files), ...pdfFiles])],
    coverLetter: files['cover-letter.md'],
    checklist: fit.checklist,
    hasCv: true,
    hasPdf,
    hasAts,
    hasMain,
    pdfNote,
    cvSource: settings.source,
    cvContentSource:
      settings.source === 'overleaf'
        ? (tailorMode === 'agent' ? 'overleaf/agent' : 'overleaf/ats.tex')
        : model.meta?.source,
    tailorMode,
    agent: agent || null,
    review: await loadReviewSummary(dir),
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

async function assembleCvFromDisk(job, profile, fit, settings, dir, onEvent = null) {
  const model = await buildTailoredCvAsync(job, profile, fit);
  let cvMd;
  let cvHtml;
  const requirementsMd = tailoredRequirementsMarkdown(model);

  let overleafResult = null;
  if (settings.source === 'overleaf') {
    if (!overleafConfigured()) {
      throw new Error(
        'CV source is Overleaf but OVERLEAF_GIT_TOKEN / OVERLEAF_PROJECT_ID are empty in .env',
      );
    }
    overleafResult = await assembleOverleafAfterAgent({
      job,
      prepDir: dir,
      onEvent: onEvent || settings.onEvent || null,
    });
    const ats = await readOverleafAts();
    if (!ats?.text) throw new Error('Goose did not produce an Overleaf CV source');
    if (ats?.text) {
      const prepBase = `/api/prep/${encodeURIComponent(job.id)}`;
      cvHtml = overleafTexToHtml(ats.text, {
        jobTitle: job.title,
        company: job.company,
        prepBase,
      });
      cvMd = overleafTexToMarkdown(ats.text);
    }
  } else {
    try {
      const agentCv = await readFile(join(dir, 'cv.md'), 'utf8');
      if (!agentCv || agentCv.trim().length < 40 || /\bYOUR_[A-Z0-9_]+\b/.test(agentCv)) throw new Error('Goose did not produce a complete CV');
      {
        cvMd = agentCv;
        cvHtml = cvMarkdownToHtml(agentCv, {
          job,
          profile,
          meta: { ...(model.meta || {}), source: 'agent/cv.md' },
        });
        model.meta = { ...(model.meta || {}), source: 'agent/cv.md' };
      }
    } catch (error) { throw new Error(`Goose CV could not be read: ${error.message}`); }
  }

  return { model, cvMd, cvHtml, requirementsMd, overleafResult };
}

async function writePrepPackAgent(job, profile, fit, savedAnswers, settings, extraInstructions, onEvent) {
  const dir = prepDir(job.id);
  await mkdir(dir, { recursive: true });
  await seedPrepForAgent(dir, job, extraInstructions);

  const agentMeta = await runCvTailorAgent({
    job,
    signal: settings.signal,
    prepDir: dir,
    profile,
    extraInstructions,
    cvSource: settings.source,
    provider: 'goose',
    model: settings.agentModel || null,
    signal: settings.signal,
    onEvent,
  });

  onEvent?.({
    stream: 'meta',
    line: 'Agent done — running the quality gate…',
    t: Date.now(),
  });
  const gate = await verifyCvAfterAgent({
    prepDir: dir,
    cvSource: settings.source,
    job,
    profile,
    evidencePath: currentEvidenceRel(),
    extraInstructions,
    emit: (line, stream = 'meta') => onEvent?.({ stream, line, t: Date.now() }),
  });
  if (gate.reverted) {
    const more = gate.hard.length > 1 ? ` (+${gate.hard.length - 1} more in quality-report.md)` : '';
    throw new Error(`quality gate: ${gate.hard[0]}${more}`);
  }

  let pack;
  const prepare = async () => {
    // Fit, render, then check any changes made by fitting. A scrub needs a new render.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const assembled = await assembleCvFromDisk(job, profile, fit, settings, dir, onEvent);
      const finalGate = await verifyCvAfterAgent({ prepDir: dir, cvSource: settings.source,
        job, profile, evidencePath: currentEvidenceRel(), extraInstructions });
      if (!finalGate.ok) throw new Error(`Final CV validation failed: ${finalGate.hard.join('; ')}`);
      if (finalGate.fixes.length) continue;
      pack = await finalizePrepPack({ job, profile, fit, savedAnswers, dir, settings,
        extraInstructions, ...assembled, overleafResult: assembled.overleafResult,
        tailorMode: 'agent', agentMeta });
      return;
    }
    throw new Error('CV content kept changing during final validation');
  };
  await runReviewerPass({ scope: 'cv', job, prepDir: dir, profile, extraInstructions,
    cvSource: settings.source, provider: 'goose',
    model: settings.agentModel || null, onEvent, prepare });
  if (!pack) throw new Error('CV could not be rendered for review');
  pack.review = await loadReviewSummary(dir);
  pack.agent = await loadAgentSession(dir);
  return pack;
}

/** Write prep files + tailored CV under .workspace/prep/<id>/ */
export async function writePrepPack(job, profile, fit, savedAnswers = {}, options = {}) {
  return withMemorySnapshot(async () => {
    const memory = await readMemory();
    return writePrepPackWithMemory(job, memory ? candidateProfile(memory) : profile, fit,
      memory ? memoryAnswers(memory) : savedAnswers, options);
  });
}

async function writePrepPackWithMemory(job, profile, fit, savedAnswers = {}, options = {}) {
  const settings = { ...(await loadCvSettings()), ...options };
  const pack = await generateDocuments({ job, profile, settings,
    instructions: options.extraInstructions || '', mode: 'agent', scopes: ['cv'] },
  () => writePrepPackUncached(job, profile, fit, savedAnswers, options));
  pack.relativeDir = relative(ROOT, pack.dir).replace(/\\/g, '/');
  if (!pack.needsReview) {
    const exported = await exportPrepDownloads(job, profile);
    pack.downloadFolderAbs = exported.absoluteDir || null;
    pack.downloadFolder = exported.relativeDir || null;
    pack.downloadError = exported.error || null;
  }
  return pack;
}

async function writePrepPackUncached(job, profile, fit, savedAnswers = {}, options = {}) {
  const dir = prepDir(job.id);
  await mkdir(dir, { recursive: true });

  const settings = { ...(await loadCvSettings()), ...options };
  const extraInstructions = String(options.extraInstructions || '').trim();
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  settings.onEvent = onEvent;

  const avail = await agentRunnerAvailable();
  if (!avail.ok) throw new Error(avail.detail);
  const pack = await writePrepPackAgent(job, profile, fit, savedAnswers, settings, extraInstructions, onEvent);
  return pack;
}

export { agentRunnerAvailable } from './cv-agent.mjs';

export async function readPrepPack(jobId) {
  const dir = prepDir(jobId);
  try {
    const readme = await readFile(join(dir, 'README.md'), 'utf8');
    const coverLetter = await readFile(join(dir, 'cover-letter.md'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    const checklist = await readFile(join(dir, 'checklist.md'), 'utf8');
    const jobPosting = await readFile(join(dir, 'job-posting.md'), 'utf8');
    const hasCv = await hasTailoredCv(jobId);
    const flags = await pdfFlags(jobId);
    const publication = JSON.parse(await readFile(join(dir, 'overleaf-push.json'), 'utf8').catch(() => 'null'));
    let cvMd = null;
    if (hasCv) {
      try {
        cvMd = await readFile(join(dir, 'cv.md'), 'utf8');
      } catch {
        /* ignore */
      }
    }
    return {
      relativeDir: relative(ROOT, dir).replace(/\\/g, '/'),
      readme,
      coverLetter,
      checklist,
      jobPosting,
      hasCv,
      ...(publication ? { cvSource: 'overleaf', overleaf: { pushRequested: publication.requested,
        pushed: publication.pushed, pushReason: publication.reason } } : {}),
      ...flags,
      cvMd,
      review: await loadReviewSummary(dir),
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
    'agent-report.md',
    'agent-session.json',
    'quality-report.md',
    'keyword-gaps.md',
    'cover-letter-report.md',
    'review.md',
    'cover-letter-review.md',
    'review-summary.json',
    'page-check.md',
    'cv-ats.txt',
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

/** Re-export PDFs + cover letter into <project-root>/downloads/<Company>/<Role>-<JobID>/. */
export async function exportPrepDownloads(job, profile) {
  if (!job?.id) return { error: 'job required' };
  const flags = await pdfFlags(job.id);
  const dir = prepDir(job.id);
  const freshness = await prepStatus(job, profile, await loadCvSettings());
  const cvExport = freshness.cv === 'current' ? await publishDownloads(job, profile, dir, flags) : null;

  let letterMd = '';
  try {
    letterMd = await readFile(join(dir, 'cover-letter.md'), 'utf8');
  } catch {
    /* none yet */
  }
  const letterPdf = join(dir, 'cover-letter.pdf');
  const letterDocx = join(dir, 'cover-letter.docx');
  let letterExport = null;
  if (letterMd && freshness.letter === 'current') {
    letterExport = await exportCoverLetterDownloads({
      jobId: job.id,
      company: job.company,
      profileName: profile?.name,
      jobTitle: job.title,
      mdText: letterMd,
      pdfPath: await fileExists(letterPdf) ? letterPdf : null,
      docxPath: await fileExists(letterDocx) ? letterDocx : null,
    });
  }

  if (cvExport?.error && !letterExport) return cvExport;
  const files = [...(cvExport?.files || []), ...(letterExport?.files || [])];
  return {
    ...(cvExport && !cvExport.error ? cvExport : {}),
    ...(letterExport || {}),
    files,
    absoluteDir: letterExport?.absoluteDir || cvExport?.absoluteDir,
    relativeDir: letterExport?.relativeDir || cvExport?.relativeDir,
    error: !files.length ? (cvExport?.error || 'Documents are outdated or need review; recreate Prep before exporting.') : null,
  };
}

export { overleafStatus, overleafConfigured, revealDownloadsFolder };
