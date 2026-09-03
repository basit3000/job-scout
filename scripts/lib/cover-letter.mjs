/**
 * Tailor cv/cover-letter.md to a posting: keep the core letter, insert optional
 * past-job / project blocks only when the job text mentions their keywords.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT } from './common.mjs';
import { htmlFileToPdf } from './pdf.mjs';
import { cvFileBaseName, exportCoverLetterDownloads } from './cv-downloads.mjs';
import {
  agentRunnerAvailable,
  runCvTailorAgent,
  seedPrepForAgent,
} from './cv-agent.mjs';
import {
  Document, Packer, Paragraph, TextRun,
  convertInchesToTwip,
} from 'docx';

const OPTIONAL_DELIM = /<!--\s*optional-blocks[\s\S]*?-->/;
const BLOCK_RE = /^:::(\S+)\s+(\S+)[ \t]*([^\n]*)\n([\s\S]*?)^:::/gm;
const INCLUDE_PAST = '<!-- include:past -->';
const INCLUDE_PROJECTS = '<!-- include:projects -->';

function fillPlaceholders(template, job, profile) {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const company = job?.company || 'the company';
  const role = job?.title || profile?.targetRole || 'the role';
  return template
    .replaceAll('[Company]', company)
    .replaceAll('[Role]', role)
    .replaceAll('[Date]', date);
}

function parseKeywords(raw) {
  const out = [];
  const re = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(raw || '')))) {
    const token = (m[1] || m[2] || m[3] || '').trim().toLowerCase();
    if (token) out.push(token);
  }
  return out;
}

export function parseCoverLetterTemplate(text) {
  const parts = String(text || '').split(OPTIONAL_DELIM);
  const core = (parts[0] || '').trimEnd();
  const rest = parts.slice(1).join('\n');
  const blocks = [];
  BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = BLOCK_RE.exec(rest))) {
    blocks.push({
      slot: m[1].toLowerCase(),
      id: m[2].toLowerCase(),
      keywords: parseKeywords(m[3]),
      body: m[4].trim(),
    });
  }
  return { core, blocks };
}

function jobHaystack(job) {
  return `${job?.title || ''}\n${job?.company || ''}\n${job?.description || ''}`.toLowerCase();
}

function keywordHits(haystack, keywords) {
  let n = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    if (kw.includes(' ')) {
      if (haystack.includes(kw)) n += 1;
      continue;
    }
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(haystack)) n += 1;
  }
  return n;
}

function pickBlocks(blocks, slot, haystack, limit = 2) {
  return blocks
    .filter((b) => b.slot === slot && b.body)
    .map((b) => ({ ...b, score: keywordHits(haystack, b.keywords) }))
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function joinBlocks(picked, intro) {
  if (!picked.length) return '';
  const sentences = picked.map((b) => b.body.replace(/\s+/g, ' ').trim());
  return `${intro} ${sentences.join(' ')}`.trim();
}

export function assembleCoverLetter(templateText, job, profile) {
  const { core, blocks } = parseCoverLetterTemplate(templateText);
  if (/\bYOUR_[A-Z0-9_]+\b/.test(core)) {
    return { letter: '', included: [], skipped: 'template still has YOUR_* placeholders' };
  }
  const haystack = jobHaystack(job);
  const past = pickBlocks(blocks, 'past', haystack, 2);
  const projects = pickBlocks(blocks, 'project', haystack, 2);

  const pastPara = joinBlocks(past, 'That path started earlier.');
  const projectPara = joinBlocks(
    projects,
    'Outside of work I have built the same kind of system end to end.',
  );

  let letter = core
    .replace(INCLUDE_PAST, pastPara)
    .replace(INCLUDE_PROJECTS, projectPara);
  letter = fillPlaceholders(letter, job, profile);
  letter = polishCoverLetter(letter);

  return {
    letter,
    included: [...past, ...projects].map((b) => ({ id: b.id, slot: b.slot, score: b.score })),
  };
}

/** Strip em dashes / spaced-hyphen asides after template or LLM edits. */
export function polishCoverLetter(text) {
  let letter = String(text || '');
  letter = letter.replace(/\s*—\s*/g, ', ');
  letter = letter.replace(/\s+-\s+(?=[A-Za-z])/g, ', ');
  return letter.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

async function loadSavedInstructions(dir) {
  try {
    const raw = await readFile(join(dir, 'instructions.md'), 'utf8');
    return raw.replace(/^#\s*Extra instructions\s*/i, '').trim();
  } catch {
    return '';
  }
}

function fallbackCoverLetter(job, profile, fit) {
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

export async function loadCoverLetterTemplate() {
  try {
    return await readFile(join(ROOT, 'cv', 'cover-letter.md'), 'utf8');
  } catch {
    return '';
  }
}

export async function buildCoverLetter(job, profile, fit) {
  const template = await loadCoverLetterTemplate();
  if (template.trim()) {
    const assembled = assembleCoverLetter(template, job, profile);
    if (assembled.letter) return assembled.letter;
  }
  return fallbackCoverLetter(job, profile, fit);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the plain-text letter as a properly formatted HTML page.
 *
 * Expected structure (no sender header or date):
 *   "Application for [Role]"   ← subject line
 *   blank line
 *   Body paragraphs (blank-line separated)
 *   ...
 *   Sign-off block (Kind regards, / name / email / url — each on its own line)
 */
export function coverLetterToHtml(letter, { title = 'Cover letter' } = {}) {
  const lines = letter.split('\n');
  let i = 0;

  // Subject line ("Application for …")
  while (i < lines.length && !lines[i].trim()) i++;
  let subjectLine = '';
  if (i < lines.length && /^application for/i.test(lines[i].trim())) {
    subjectLine = lines[i].trim();
    i++;
  }
  while (i < lines.length && !lines[i].trim()) i++;

  // Remaining text: split on blank lines into paragraphs
  const bodyText = lines.slice(i).join('\n').trim();
  // Split into paragraph groups; within each group preserve line breaks for the sign-off
  const groups = bodyText.split(/\n{2,}/);

  const bodyHtml = groups.map((group) => {
    const groupLines = group.split('\n').map((l) => escapeHtml(l.trim())).filter(Boolean);
    if (groupLines.length === 1) return `<p>${groupLines[0]}</p>`;
    // Multi-line group (e.g. sign-off): render each line separately inside one block
    return `<p>${groupLines.join('<br />')}</p>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title || 'Cover Letter')}</title>
  <style>
    @page { size: A4; margin: 2.5cm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #111;
      max-width: 720px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    @media print {
      body { margin: 0; padding: 0; max-width: none; }
      .no-print { display: none !important; }
    }
    .subject { font-weight: 600; margin-bottom: 1.4rem; font-size: 11pt; }
    p { margin: 0 0 0.95rem; }
    p:last-child { margin-bottom: 0; }
    .toolbar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .toolbar button {
      font-family: sans-serif; font-size: 10pt; font-weight: 600;
      border: 1px solid #999; background: #111; color: #fff;
      border-radius: 6px; padding: 0.35rem 0.75rem; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  ${subjectLine ? `<div class="subject">${escapeHtml(subjectLine)}</div>` : ''}
  ${bodyHtml}
</body>
</html>
`;
}

/**
 * Build a properly formatted .docx cover letter.
 * Calibri 11pt body, A4, standard margins.
 * No sender header or date - starts with the subject line.
 * Sign-off lines are each on their own paragraph.
 */
export async function coverLetterToDocx(letter) {
  const lines = letter.split('\n');
  const FONT = 'Times New Roman';
  const SIZE = 24;   // half-points -> 12pt
  const DARK = '111111';

  function textRun(text) {
    return new TextRun({ text, font: FONT, size: SIZE, color: DARK });
  }

  function bodyPara(text, { after = 160, bold = false } = {}) {
    return new Paragraph({
      children: [new TextRun({ text, font: FONT, size: SIZE, color: DARK, bold })],
      spacing: { line: 276, after },
    });
  }

  // Parse: subject line then body groups
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;

  let subjectLine = '';
  if (i < lines.length && /^application for/i.test(lines[i].trim())) {
    subjectLine = lines[i].trim();
    i++;
  }
  while (i < lines.length && !lines[i].trim()) i++;

  const bodyText = lines.slice(i).join('\n').trim();
  // Split on blank lines; keep internal newlines so sign-off stays multi-line
  const groups = bodyText.split(/\n{2,}/);

  const docParas = [];

  // Subject line
  if (subjectLine) {
    docParas.push(bodyPara(subjectLine, { bold: true, after: 220 }));
  }

  // Body groups
  for (const group of groups) {
    const groupLines = group.split('\n').map((l) => l.trim()).filter(Boolean);
    if (groupLines.length === 1) {
      docParas.push(bodyPara(groupLines[0]));
    } else {
      // Multi-line group (sign-off): each line its own paragraph, tightly spaced
      for (const l of groupLines) {
        docParas.push(new Paragraph({
          children: [textRun(l)],
          spacing: { line: 240, after: 0 },
        }));
      }
      // Add a small gap after the group
      docParas.push(new Paragraph({ children: [textRun('')], spacing: { after: 80 } }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: convertInchesToTwip(8.27), height: convertInchesToTwip(11.69) },
          margin: {
            top:    convertInchesToTwip(1.1),
            bottom: convertInchesToTwip(1.0),
            left:   convertInchesToTwip(1.2),
            right:  convertInchesToTwip(1.0),
          },
        },
      },
      children: docParas,
    }],
  });

  return Packer.toBuffer(doc);
}

/**
 * Write tailored letter into the prep pack and the company downloads folder.
 * Produces: cover-letter.md, cover-letter.html, cover-letter.pdf, cover-letter.docx
 */
/**
 * Convert a .docx file to .pdf using MS Word COM automation.
 * Falls back to HTML-based PDF if Word is unavailable.
 */
function docxToPdfViaWord(docxAbsPath, pdfAbsPath) {
  // PowerShell script that opens the docx in Word and saves as PDF (formatType 17)
  const ps = `
    $word = $null
    try {
      $word = New-Object -ComObject Word.Application
      $word.Visible = $false
      $doc = $word.Documents.Open('${docxAbsPath.replace(/'/g, "''")}')
      $doc.SaveAs2([ref]'${pdfAbsPath.replace(/'/g, "''")}', [ref]17)
      $doc.Close([ref]$false)
    } finally {
      if ($word) { $word.Quit() }
      [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    }
  `.trim();
  try {
    execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
      timeout: 30000,
      stdio: 'pipe',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function writeCoverLetterArtifacts(dir, letter, htmlTitle) {
  let pdfPath = null;
  let docxPath = null;
  let pdfError = null;

  await writeFile(join(dir, 'cover-letter.md'), letter);

  try {
    const docxBuf = await coverLetterToDocx(letter);
    docxPath = join(dir, 'cover-letter.docx');
    await writeFile(docxPath, docxBuf);
  } catch (err) {
    pdfError = `docx: ${err.message || err}`;
  }

  if (docxPath && existsSync(docxPath)) {
    const absDocx = resolve(docxPath);
    const absPdf = resolve(join(dir, 'cover-letter.pdf'));
    const wordResult = docxToPdfViaWord(absDocx, absPdf);
    if (wordResult.ok && existsSync(absPdf)) {
      pdfPath = absPdf;
    } else {
      const html = coverLetterToHtml(letter, { title: htmlTitle });
      const htmlPath = join(dir, 'cover-letter.html');
      await writeFile(htmlPath, html);
      const pdfResult = await htmlFileToPdf(htmlPath, join(dir, 'cover-letter.pdf'));
      if (pdfResult.ok) pdfPath = join(dir, 'cover-letter.pdf');
      else pdfError = (pdfError ? `${pdfError}; ` : '') + `pdf: ${pdfResult.error}`;
    }
  } else {
    const html = coverLetterToHtml(letter, { title: htmlTitle });
    const htmlPath = join(dir, 'cover-letter.html');
    await writeFile(htmlPath, html);
    const pdfResult = await htmlFileToPdf(htmlPath, join(dir, 'cover-letter.pdf'));
    if (pdfResult.ok) pdfPath = join(dir, 'cover-letter.pdf');
    else pdfError = (pdfError ? `${pdfError}; ` : '') + `pdf: ${pdfResult.error}`;
  }

  return { pdfPath, docxPath, pdfError };
}

export async function generateCoverLetterPack(job, profile, fit, {
  prepDir: dir,
  extraInstructions = '',
  tailorMode = 'fast',
  onEvent = null,
  provider = null,
  model = null,
} = {}) {
  const assembled = assembleCoverLetter(await loadCoverLetterTemplate(), job, profile);
  let letter = assembled.letter || fallbackCoverLetter(job, profile, fit);
  const htmlTitle = `Cover letter — ${job.title || ''} @ ${job.company || ''}`;
  const emit = typeof onEvent === 'function'
    ? onEvent
    : () => {};

  let agent = null;
  let usedMode = 'fast';
  let fallbackReason = null;
  let instr = String(extraInstructions || '').trim();
  let pdfPath = null;
  let docxPath = null;
  let pdfError = null;

  if (dir) {
    await mkdir(dir, { recursive: true });
    if (!instr) instr = await loadSavedInstructions(dir);
    await writeFile(join(dir, 'cover-letter.md'), letter);
    await writeFile(join(dir, 'cover-letter.draft.md'), letter);

    const wantAgent = tailorMode !== 'fast';
    if (wantAgent) {
      await seedPrepForAgent(dir, job, instr);
      const avail = await agentRunnerAvailable(provider);
      if (!avail.ok) {
        fallbackReason = avail.detail;
        emit({
          stream: 'stderr',
          line: `Agent unavailable (${avail.detail}) — using the keyword draft.`,
          t: Date.now(),
        });
      } else {
        try {
          emit({
            stream: 'meta',
            line: 'Cover letter agent — same evidence and instructions as Prep & CV',
            t: Date.now(),
          });
          agent = await runCvTailorAgent({
            job,
            prepDir: dir,
            profile,
            extraInstructions: instr,
            cvSource: 'local',
            overleafPush: false,
            provider,
            model,
            onEvent,
            task: 'cover-letter',
          });
          const edited = await readFile(join(dir, 'cover-letter.md'), 'utf8');
          if (edited.trim()) {
            letter = polishCoverLetter(edited);
            usedMode = 'agent';
          }
        } catch (err) {
          fallbackReason = err?.message || String(err);
          emit({
            stream: 'stderr',
            line: `Cover letter agent failed (${fallbackReason}) — using the keyword draft.`,
            t: Date.now(),
          });
        }
      }
    }

    const artifacts = await writeCoverLetterArtifacts(dir, letter, htmlTitle);
    pdfPath = artifacts.pdfPath;
    docxPath = artifacts.docxPath;
    pdfError = artifacts.pdfError;
  }

  const exported = await exportCoverLetterDownloads({
    company: job.company,
    profileName: profile?.name,
    jobTitle: job.title,
    mdText: letter,
    pdfPath: pdfPath && existsSync(pdfPath) ? pdfPath : null,
    docxPath: docxPath && existsSync(docxPath) ? docxPath : null,
  });

  return {
    letter,
    included: assembled.included,
    extraInstructions: instr || null,
    tailorMode: usedMode,
    fallbackReason,
    agent,
    pdfError: pdfError || exported?.error || null,
    export: exported,
    baseName: cvFileBaseName(profile?.name),
  };
}
