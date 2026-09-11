/**
 * Local LaTeX CV mode: turn the tailored CV markdown into a .tex file and
 * compile it with Tectonic — no Overleaf project and no paid git bridge.
 *
 *   <prep pack>/tex/main.tex → cv-ats.pdf
 *
 * The tailor (agent or keyword) still produces markdown; this module is the
 * rendering back end, so nothing upstream has to learn LaTeX. main.tex is left
 * in the pack to be edited by hand: edit it and the next run compiles your
 * version instead of regenerating it (delete the file to go back to generated).
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './common.mjs';
import { compileTexToPdf, countPdfPages } from './pdf.mjs';
import { applyNextFitPass } from './tex-fit.mjs';
import { sanitizeDashes } from './cv-text.mjs';

/** Escape a plain-text run for LaTeX. */
export function texEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}')
    // A literal ß in a T1 font lands in the PDF text layer as "SS", so an ATS
    // (and the reviewer pass) reads "GrüSSen". The macro maps back to ß.
    .replace(/ß/g, '\\ss{}')
    .replace(/–/g, '--')
    .replace(/—/g, '---')
    .replace(/·/g, '\\textperiodcentered{}')
    .replace(/“|”/g, '"')
    .replace(/‘|’/g, "'");
}

/** URL for \href — only #, % and \ need escaping inside the argument. */
function texUrl(url) {
  return String(url).replace(/([#%\\])/g, '\\$1');
}

/** Inline markdown (links, **bold**, *italic*) → LaTeX, escaping everything else. */
function texInline(text) {
  // Pull links out behind a sentinel first, so only the label reaches the page
  // (a bare URL wastes a line) and texEscape cannot mangle the \href we build.
  const hrefs = [];
  // Dash rule runs before escaping; URLs are already behind sentinels below.
  const linked = sanitizeDashes(String(text ?? '')).replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    (_, label, url) => {
      hrefs.push(`\\href{${texUrl(url)}}{${texEscape(label)}}`);
      return `\u0000${hrefs.length - 1}\u0000`;
    },
  );

  const parts = [];
  const re = /\*\*([^*]+)\*\*|(?:^|(?<=[\s(]))\*([^*\n]+)\*(?=[\s.,;:)]|$)/g;
  let last = 0;
  let m = re.exec(linked);
  while (m) {
    parts.push(texEscape(linked.slice(last, m.index)));
    parts.push(m[1] ? `\\textbf{${texEscape(m[1])}}` : `\\emph{${texEscape(m[2])}}`);
    last = m.index + m[0].length;
    m = re.exec(linked);
  }
  parts.push(texEscape(linked.slice(last)));
  return parts.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => hrefs[Number(i)]);
}

/**
 * Parse the tailored CV markdown into a structure both templates render from.
 * Section names are not assumed, so any heading wording works.
 */
export function parseCvMarkdown(markdown) {
  const doc = { name: '', headline: '', contact: [], sections: [] };
  let section = null;
  let entry = null;
  let seenSection = false;

  const pushEntry = () => { if (section && entry) { section.entries.push(entry); entry = null; } };

  for (const raw of String(markdown || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    let m = line.match(/^#\s+(.*)$/);
    if (m) { doc.name = m[1].trim(); continue; }

    m = line.match(/^##\s+(.*)$/);
    if (m) {
      pushEntry();
      section = { title: m[1].trim(), entries: [], loose: [] };
      doc.sections.push(section);
      seenSection = true;
      continue;
    }

    m = line.match(/^#{3,6}\s+(.*)$/);
    if (m) {
      pushEntry();
      entry = { title: m[1].trim(), meta: '', bullets: [], notes: [] };
      continue;
    }

    m = line.match(/^[-*+]\s+(.*)$/);
    if (m) {
      const text = m[1].trim();
      if (entry) entry.bullets.push(text);
      else if (section) section.loose.push({ kind: 'bullet', text });
      continue;
    }

    if (!seenSection) {
      // Header block: the row carrying separators plus an address is the contact line.
      if (/·|\|/.test(line) && /@|https?:/.test(line)) {
        doc.contact = line.split(/\s*[·|]\s*/).map((s) => s.trim()).filter(Boolean);
      } else if (!doc.headline) {
        doc.headline = line;
      }
      continue;
    }

    if (entry && !entry.meta && !entry.bullets.length) entry.meta = line;
    else if (entry) entry.notes.push(line);
    else if (section) section.loose.push({ kind: 'text', text: line });
  }
  pushEntry();
  return doc;
}

/** Split "Software Engineer — Dudaev Systems UG" into role + org. */
function splitTitleOrg(title) {
  const m = String(title).split(/\s+[—–-]\s+/);
  if (m.length >= 2) return { role: m[0].trim(), org: m.slice(1).join(' - ').trim() };
  return { role: String(title).trim(), org: '' };
}

/** Split "Mar 2026 – Present · Berlin, Germany" into dates + location. */
function splitMeta(meta) {
  const parts = String(meta || '').split(/\s*·\s*/);
  return { dates: (parts[0] || '').trim(), location: parts.slice(1).join(', ').trim() };
}

/**
 * Canonical CV layout, measured from cv/Daniyal CV.pdf so every generated CV
 * looks like the one the candidate already uses:
 *
 *   A4, 13mm margins (content 521.6pt wide)
 *   name 17.5pt bold centred, headline 11.5pt, contact 9.5pt with " | "
 *   sections 10.5pt bold uppercase, full-width rule 6.5pt below
 *   entry row: dates in a 90.7pt gutter, "Org, Role", location flush right
 *   bullets: marker at 90.7pt, text at 99.8pt from the margin
 *   body 9.5pt on 12.4pt leading
 */
export const CV_GEOMETRY = {
  margin: '13mm',
  bottom: '12mm',
  gutter: 90.7,
  // Minimum gap between the date column and the title beside it.
  gutterSep: 6,
  // Gap between a bullet glyph and its text.
  labelSep: 6.2,
  bulletText: 99.8,
  bodySize: 9.5,
  bodyLeading: 12.4,
  nameSize: 17.5,
  headlineSize: 11.5,
  sectionSize: 10.5,
  // Portrait column on the right of the header, measured from the reference.
  photoBox: 90.6,
  photoSize: 72,
};

/** Section headings the layout treats as full-width prose, not dated entries. */
const PROSE_SECTION = /skill|competenc|certificat|language|summary|profile|interest|kenntnis|sprach/i;

function contactTex(contact) {
  // texInline, not texEscape: "[LinkedIn](url)" must become a link, not literal text.
  return contact.map(texInline).join(' \\textbar{} ');
}

/** Name / headline / contact — identical with or without the portrait. */
function headerLines(doc, g) {
  return [
    `{\\fontsize{${g.nameSize}}{${g.nameSize + 3}}\\selectfont\\bfseries ${texEscape(doc.name || 'Candidate')}}\\\\[3.5pt]`,
    doc.headline ? `{\\fontsize{${g.headlineSize}}{${g.headlineSize + 2}}\\selectfont ${texInline(doc.headline)}}\\\\[4pt]` : '',
    doc.contact.length ? `{\\jsBody ${contactTex(doc.contact)}}` : '',
  ].filter(Boolean);
}

/** The one CV template. Both PDF and HTML output render this same structure. */
export function buildCvTex(doc, { photo = false } = {}) {
  const g = CV_GEOMETRY;
  const head = [
    '\\documentclass[10pt,a4paper]{article}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{graphicx}',
    '\\usepackage{helvet}',
    '\\renewcommand{\\familydefault}{\\sfdefault}',
    `\\usepackage[a4paper,left=${g.margin},right=${g.margin},top=${g.margin},bottom=${g.bottom}]{geometry}`,
    '\\usepackage{enumitem}',
    '\\usepackage[hidelinks]{hyperref}',
    '\\usepackage{needspace}',
    '\\pagenumbering{gobble}',
    '\\setlength{\\parindent}{0pt}',
    '\\setlength{\\parskip}{0pt}',
    // The reference CV is ragged right and never hyphenates — justification
    // would open rivers of space and split words across lines.
    '\\raggedright',
    '\\hyphenpenalty=10000',
    '\\exhyphenpenalty=10000',
    '\\tolerance=2000',
    '\\emergencystretch=2em',
    '% BEGIN job-scout layout',
    `\\newcommand{\\jsBody}{\\fontsize{${g.bodySize}}{${g.bodyLeading}}\\selectfont}`,
    `\\newcommand{\\jsGutter}{${g.gutter}pt}`,
    `\\newcommand{\\jsGutterSep}{${g.gutterSep}pt}`,
    '\\newcommand{\\jsSection}[1]{%',
    '  \\needspace{3\\baselineskip}%',
    '  \\vspace{1.05em}%',
    `  {\\fontsize{${g.sectionSize}}{${g.sectionSize + 2}}\\selectfont\\bfseries\\MakeUppercase{#1}}\\par`,
    '  \\vspace{1.6pt}\\hrule height 0.75pt\\vspace{6.5pt}%',
    '}',
    // A date wider than the gutter overprints the title beside it — education
    // ranges ("Oct 2022 to Aug 2026", 92.1pt at body size) are the ones that
    // reach it. Every date is measured up front and the column widens once to
    // the longest, so entries still line up instead of each starting somewhere
    // different. With no long date this is exactly the old geometry.
    '\\newlength{\\jsDateWidth}',
    '\\newlength{\\jsDateCol}',
    '\\newlength{\\jsBulletText}',
    '\\newlength{\\jsLabelW}',
    '\\setlength{\\jsDateCol}{\\jsGutter}',
    '\\newcommand{\\jsMeasure}[1]{%',
    '  \\settowidth{\\jsDateWidth}{#1}%',
    '  \\ifdim\\jsDateWidth>\\dimexpr\\jsDateCol-\\jsGutterSep\\relax',
    '    \\setlength{\\jsDateCol}{\\dimexpr\\jsDateWidth+\\jsGutterSep\\relax}%',
    '  \\fi',
    '}',
    // Bullets hang off the same column, so they move with it.
    `\\newcommand{\\jsSyncColumns}{%`,
    `  \\setlength{\\jsBulletText}{\\dimexpr\\jsDateCol+${(g.bulletText - g.gutter).toFixed(1)}pt\\relax}%`,
    `  \\setlength{\\jsLabelW}{\\dimexpr\\jsBulletText-\\jsDateCol-${g.labelSep}pt\\relax}%`,
    '}',
    '\\jsSyncColumns',
    '\\newcommand{\\jsEntry}[4]{%',
    '  \\needspace{2\\baselineskip}%',
    // hspace* after the hfill so a long title and a long location keep a gap
    // instead of touching when the line runs out of room.
    '  \\makebox[\\jsDateCol][l]{#1}\\textbf{#2}#3\\hfill\\hspace*{\\jsGutterSep}#4\\par',
    '  \\vspace{1.2pt}%',
    '}',
    `\\newlist{jsbullets}{itemize}{1}`,
    // labelwidth must be given explicitly, or enumitem derives its own and the
    // bullet column drifts left of the measured 90.7pt.
    `\\setlist[jsbullets]{label=\\textbullet,leftmargin=\\jsBulletText,labelindent=\\jsDateCol,`
      + `labelwidth=\\jsLabelW,labelsep=${g.labelSep}pt,`
      + 'itemsep=1.6pt,topsep=1.4pt,parsep=0pt,partopsep=0pt,align=left}',
    '% END job-scout layout',
    '',
    '\\begin{document}',
    '\\jsBody',
    // With a portrait the header text centres in the space left of it, exactly
    // as the reference CV does; without one it centres across the full width.
    ...(photo
      ? [
        `\\noindent\\begin{minipage}[c]{\\dimexpr\\textwidth-${g.photoBox}pt\\relax}`,
        '\\centering',
        ...headerLines(doc, g),
        '\\end{minipage}\\hfill',
        `\\begin{minipage}[c]{${g.photoBox}pt}`,
        `\\raggedleft\\includegraphics[width=${g.photoSize}pt]{photo.png}`,
        '\\end{minipage}',
        '\\par\\vspace{2pt}',
      ]
      : ['\\begin{center}', ...headerLines(doc, g), '\\end{center}']),
  ].filter(Boolean);

  // Widen the date column once, before the first entry is typeset. TeX measures
  // in the real body font, which JS cannot do.
  const dates = [];
  for (const sec of doc.sections) {
    if (PROSE_SECTION.test(sec.title) && !sec.entries.length) continue;
    for (const e of sec.entries) {
      const { dates: d } = splitMeta(e.meta);
      if (d) dates.push(sanitizeDashes(d));
    }
  }
  const measure = dates.length
    ? [...new Set(dates)].map((d) => `\\jsMeasure{${texEscape(d)}}`).concat(['\\jsSyncColumns'])
    : [];

  const body = [...measure];
  for (const sec of doc.sections) {
    body.push('', `\\jsSection{${texEscape(sec.title)}}`);
    const prose = PROSE_SECTION.test(sec.title) && !sec.entries.length;

    // Skills / certificates style: full-width "Label: values" lines, no gutter.
    if (prose) {
      for (const item of sec.loose) body.push(`${texInline(item.text)}\\par\\vspace{1.9pt}`);
      continue;
    }

    const looseBullets = sec.loose.filter((i) => i.kind === 'bullet').map((i) => i.text);
    for (const i of sec.loose) if (i.kind === 'text') body.push(`${texInline(i.text)}\\par`);
    if (looseBullets.length) body.push(bulletList(looseBullets));

    for (const e of sec.entries) {
      const { role, org } = splitTitleOrg(e.title);
      const { dates, location } = splitMeta(e.meta);
      // Reference order is "Org, Role" with the employer bold.
      const lead = org || role;
      const trail = org ? `, ${texInline(role)}` : '';
      body.push(
        // Dates and location skip texInline, so apply the dash rule here too.
        `\\jsEntry{${texEscape(sanitizeDashes(dates))}}{${texInline(lead)}}{${trail}}`
        + `{${texEscape(sanitizeDashes(location))}}`,
      );
      for (const n of e.notes) body.push(`\\makebox[\\jsDateCol][l]{}${texInline(n)}\\par`);
      const inner = bulletList(e.bullets);
      if (inner) body.push(inner);
      body.push('\\vspace{3.5pt}');
    }
  }

  return `${head.join('\n')}\n${body.join('\n')}\n\n\\end{document}\n`;
}

function bulletList(bullets) {
  if (!bullets.length) return '';
  return [
    '\\begin{jsbullets}',
    ...bullets.map((b) => `  \\item ${texInline(b)}`),
    '\\end{jsbullets}',
  ].join('\n');
}

/** Kept so callers that asked for the two old variants still get the canonical one. */
export const buildAtsTex = buildCvTex;
export const buildMainTex = buildCvTex;

/**
 * Extra squeeze passes for the templates in this file. The shared tex-fit passes
 * target the Overleaf document, so they run out before these layout knobs.
 * Each returns null when it cannot change anything further.
 */
const LOCAL_FIT_PASSES = [
  // Order matters: shave whitespace before touching type size, and never let a
  // pass go far enough to stop looking like the reference CV.
  ['sectionspace', (tex) => (tex.includes('\\vspace{1.05em}%')
    ? tex.replace('\\vspace{1.05em}%', '\\vspace{0.72em}%')
    : null)],
  ['entryspace', (tex) => (tex.includes('\\vspace{3.5pt}')
    ? tex.split('\\vspace{3.5pt}').join('\\vspace{2.2pt}')
    : null)],
  ['bulletspace', (tex) => (tex.includes('itemsep=1.6pt,topsep=1.4pt')
    ? tex.replace('itemsep=1.6pt,topsep=1.4pt', 'itemsep=0.8pt,topsep=0.8pt')
    : null)],
  ['margins', (tex) => {
    const m = tex.match(/left=(\d+)mm,right=(\d+)mm,top=(\d+)mm,bottom=(\d+)mm/);
    if (!m || Number(m[1]) <= 11) return null;
    const side = Number(m[1]) - 2;
    return tex.replace(m[0], `left=${side}mm,right=${side}mm,top=${Math.max(Number(m[3]) - 2, 10)}mm,bottom=${Math.max(Number(m[4]) - 2, 9)}mm`);
  }],
  ['leading', (tex) => {
    const m = tex.match(/\\newcommand\{\\jsBody\}\{\\fontsize\{([\d.]+)\}\{([\d.]+)\}/);
    if (!m || Number(m[2]) <= 11.4) return null;
    return tex.replace(m[0], `\\newcommand{\\jsBody}{\\fontsize{${m[1]}}{${(Number(m[2]) - 0.6).toFixed(1)}}`);
  }],
  ['bodysize', (tex) => {
    const m = tex.match(/\\newcommand\{\\jsBody\}\{\\fontsize\{([\d.]+)\}\{([\d.]+)\}/);
    if (!m || Number(m[1]) <= 8.8) return null;
    const size = (Number(m[1]) - 0.3).toFixed(1);
    return tex.replace(m[0], `\\newcommand{\\jsBody}{\\fontsize{${size}}{${m[2]}}`);
  }],
];

/**
 * Template-specific passes first. The shared tex-fit passes were written for the
 * Overleaf document and reset global list lengths, which shifts this template's
 * measured bullet column — so they are the last resort, not the first.
 */
function nextFit(tex, applied) {
  for (const [name, fn] of LOCAL_FIT_PASSES) {
    if (applied.includes(name)) continue;
    const out = fn(tex);
    if (out && out !== tex) return { tex: out, pass: name };
  }
  const shared = applyNextFitPass(tex, applied);
  if (shared && shared.tex !== tex) return shared;
  return null;
}

const TEX_NAME = 'main.tex';
const STAMP_NAME = '.main.tex.sha256';

function texFingerprint(tex) {
  return createHash('sha256').update(tex).digest('hex');
}

/**
 * Did the user edit main.tex since Job Scout wrote it? The stamp holds the hash
 * of what we generated last time, so anything else is their own work.
 */
async function readUserEditedTex(texPath, stampPath) {
  try {
    const [tex, stamp] = await Promise.all([
      readFile(texPath, 'utf8'),
      readFile(stampPath, 'utf8').catch(() => ''),
    ]);
    if (!tex.trim()) return null;
    return texFingerprint(tex) === stamp.trim() ? null : tex;
  } catch {
    return null;
  }
}

/**
 * Write main.tex from the tailored markdown and compile it,
 * squeezing each to one page with the shared tex-fit passes.
 */
export async function buildLatexCv({ markdown, prepDir, onEvent = null } = {}) {
  const emit = (line, stream = 'meta') => onEvent?.({ stream, line, t: Date.now() });
  const doc = parseCvMarkdown(markdown);
  if (!doc.sections.length) {
    return { ok: false, error: 'CV markdown had no ## sections to render' };
  }

  // compileTexToPdf runs with cwd=outDir, so the path must be absolute.
  const texDir = resolve(prepDir, 'tex');
  await mkdir(texDir, { recursive: true });

  // Tectonic runs with cwd=texDir, so the portrait has to sit beside the .tex.
  const photoSrc = join(ROOT, 'cv', 'photo.png');
  const photo = existsSync(photoSrc);
  if (photo) {
    await writeFile(join(texDir, 'photo.png'), await readFile(photoSrc));
    emit('Portrait: cv/photo.png');
  }

  // One template, one look — every CV comes out in the reference format.
  const texPath = join(texDir, TEX_NAME);
  const stampPath = join(texDir, STAMP_NAME);
  const edited = await readUserEditedTex(texPath, stampPath);
  let tex = edited || buildCvTex(doc, { photo });
  const applied = [];
  let compiled = null;
  let pages = null;

  if (edited) {
    // Their file, their layout: compile it as written, no fit passes.
    emit(`Using your edited ${TEX_NAME} — delete it to regenerate from cv.md`);
    compiled = await compileTexToPdf(texPath, texDir);
    if (compiled.ok) pages = await countPdfPages(compiled.path);
  } else {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      await writeFile(texPath, tex);
      compiled = await compileTexToPdf(texPath, texDir);
      if (!compiled.ok) break;
      pages = await countPdfPages(compiled.path);
      if (pages !== null && pages <= 1) break;
      const next = nextFit(tex, applied);
      if (!next || next.tex === tex) break;
      tex = next.tex;
      applied.push(next.pass);
      emit(`${TEX_NAME}: ${pages ?? '?'} pages — applying fit pass "${next.pass}"`);
    }
    // Remember exactly what we wrote, so a later hand-edit is recognisable.
    await writeFile(stampPath, texFingerprint(tex));
  }

  if (!compiled?.ok) {
    const error = compiled?.error || 'LaTeX compile failed';
    emit(error, 'stderr');
    return { ok: false, texDir, error };
  }

  // Same file under both names so the ATS and human exports never drift apart.
  const atsPath = join(prepDir, 'cv-ats.pdf');
  const pdf = await readFile(compiled.path);
  await writeFile(atsPath, pdf);
  if (pages !== null && pages > 1) {
    emit(
      edited
        ? `Your ${TEX_NAME} is ${pages} pages — Job Scout does not reflow an edited file`
        : `${TEX_NAME} still ${pages} pages after ${applied.length} fit passes — trim content`,
      'stderr',
    );
  }
  emit(`${TEX_NAME} → cv-ats.pdf (${compiled.via}${pages ? `, ${pages} page${pages > 1 ? 's' : ''}` : ''})`);

  return {
    ok: true,
    texDir,
    tex: texPath,
    texEdited: Boolean(edited),
    main: null,
    ats: atsPath,
    pages,
    error: null,
    note: `LaTeX (local) → ${pages === 1 ? 'one page' : `${pages ?? '?'} pages`}`,
  };
}

export function latexModeAvailable(prepDirPath) {
  return existsSync(prepDirPath);
}
