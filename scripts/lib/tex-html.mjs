/**
 * Turn Overleaf ats.tex / moderncv main.tex into printable HTML / markdown.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function photoDataUri(photoPath) {
  if (!photoPath || !existsSync(photoPath)) return null;
  try {
    const buf = readFileSync(photoPath);
    const ext = String(photoPath).toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    return `data:image/${ext};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function stripTexComments(tex) {
  return String(tex || '')
    .split('\n')
    .map((line) => line.replace(/(^|[^\\])%.*/, '$1'))
    .join('\n');
}

/** Read `{...}` starting at openIdx (must point at `{`). Returns { arg, end }. */
function readBraceGroup(src, openIdx) {
  if (src[openIdx] !== '{') return null;
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\\') {
      i += 1; // skip escaped char
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { arg: src.slice(openIdx + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** Parse `\cmd[opt]{a}{b}...` into args array (skips [optional] args). */
function parseCmdArgs(src, cmd, start = 0) {
  const re = new RegExp(`\\\\${cmd}\\b`);
  const m = re.exec(src.slice(start));
  if (!m) return null;
  let i = start + m.index + m[0].length;
  while (/\s/.test(src[i])) i += 1;
  // skip [optional] arguments
  while (src[i] === '[') {
    const close = src.indexOf(']', i);
    if (close === -1) break;
    i = close + 1;
    while (/\s/.test(src[i])) i += 1;
  }
  const args = [];
  while (i < src.length && src[i] === '{') {
    const g = readBraceGroup(src, i);
    if (!g) break;
    args.push(g.arg);
    i = g.end;
    while (/\s/.test(src[i])) i += 1;
  }
  return { args, end: i, index: start + m.index };
}

export function texInlineToText(s) {
  let t = String(s ?? '');
  t = t.replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '$2');
  t = t.replace(/\\mbox\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\textbf\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\textit\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\emph\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\&/g, '&');
  t = t.replace(/\\cdot/g, '·');
  t = t.replace(/---/g, '—').replace(/--/g, '–');
  t = t.replace(/\\"([aouAOU])/g, (_, c) => ({ a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' }[c] || c));
  t = t.replace(/\\ss\{\}?/g, 'ß');
  t = t.replace(/\\(?:LARGE|large|bfseries|centering|noindent|raggedright|raggedleft)\s*/g, '');
  t = t.replace(/\\\\(?:\[[^\]]*\])?/g, '\n');
  t = t.replace(/\\hfill/g, ' ');
  t = t.replace(/\\[a-zA-Z]+\*?/g, '');
  t = t.replace(/[{}]/g, '');
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

/** Like texInlineToText but keeps \\href as clickable <a> tags. */
function texInlineToLinkedHtml(s) {
  const src = String(s ?? '');
  const chunks = [];
  const re = /\\href\{([^}]*)\}\{([^}]*)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    const before = texInlineToText(src.slice(last, m.index));
    if (before) chunks.push(escapeHtml(before));
    chunks.push(linkHtml(ensureHttpUrl(m[1]), texInlineToText(m[2])));
    last = m.index + m[0].length;
  }
  const after = texInlineToText(src.slice(last));
  if (after) chunks.push(escapeHtml(after));
  return chunks.join('') || escapeHtml(texInlineToText(src));
}

function extractItems(chunk) {
  return [...chunk.matchAll(/\\item\s+([\s\S]*?)(?=\\item|\\end\{itemize\}|\\entrygap|\\role\{|\\edu\{|\\cventry\{|$)/g)].map((m) =>
    texInlineToText(m[1]),
  );
}

function linkHtml(href, label) {
  if (!href || !label) return escapeHtml(label || '');
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function ensureHttpUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^mailto:/i.test(s) || /^tel:/i.test(s)) return s;
  return `https://${s.replace(/^\/+/, '')}`;
}

function cvShell({
  name,
  headline,
  contact,
  contactHtml = null,
  sectionsHtml,
  note,
  prepBase,
  photoUri = null,
  variant = 'ats',
}) {
  const isMain = variant === 'main';
  const contactBlock = contactHtml || (contact ? escapeHtml(contact) : '');
  const header = isMain
    ? `<header class="mcv-header">
  <div class="mcv-text">
    <h1>${escapeHtml(name)}</h1>
    ${headline ? `<p class="headline">${escapeHtml(headline)}</p>` : ''}
    ${contactBlock ? `<p class="contact">${contactBlock}</p>` : ''}
  </div>
  ${photoUri ? `<img class="mcv-photo" src="${photoUri}" alt="" />` : ''}
</header>`
    : `<h1>${escapeHtml(name)}</h1>
  ${headline ? `<p class="headline">${escapeHtml(headline)}</p>` : ''}
  ${contactBlock ? `<p class="contact">${contactBlock}</p>` : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(name)} — CV</title>
  <style>
    @page { size: A4; margin: 12mm 14mm; }
    body { font-family: "Calibri", "Segoe UI", Arial, sans-serif; font-size: 10pt; max-width: ${isMain ? '780px' : '720px'}; margin: 1.1rem auto; padding: 0 0.75rem 1.5rem; color: #111; line-height: 1.26; }
    h1 { margin: 0; font-size: ${isMain ? '22pt' : '20pt'}; color: ${isMain ? '#006699' : '#111'}; letter-spacing: -0.01em; font-weight: 700; }
    .headline { margin: 0.2rem 0 0.15rem; color: #333; font-size: 11pt; }
    .contact { margin: 0; color: #444; font-size: 9.5pt; }
    .contact a, .cvitem a, a.cv-link { color: ${isMain ? '#006699' : '#0645ad'}; text-decoration: none; }
    .contact a:hover, .cvitem a:hover { text-decoration: underline; }
    .mcv-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.55rem; border-bottom: 1.5px solid #006699; padding-bottom: 0.45rem; }
    .mcv-text { flex: 1; min-width: 0; }
    .mcv-photo { width: 95px; height: 95px; object-fit: cover; border: 0.5pt solid #99b; flex-shrink: 0; }
    h2 { margin: 0.65rem 0 0.25rem; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.04em; color: ${isMain ? '#006699' : '#111'}; border-bottom: 1px solid ${isMain ? '#006699' : '#444'}; padding-bottom: 2px; }
    .entry { margin: 0.35rem 0 0.25rem; ${isMain ? 'display: grid; grid-template-columns: 7.2rem 1fr; gap: 0.55rem; align-items: start;' : ''} }
    .entry-head { display: flex; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
    .entry-head .role { font-weight: 700; }
    .entry-head .org { color: #333; }
    .dates { color: ${isMain ? '#006699' : '#444'}; font-size: 9pt; white-space: nowrap; ${isMain ? 'text-align: right; padding-top: 0.1rem;' : ''} }
    .entry-body { min-width: 0; }
    .cvitem { margin: 0.25rem 0; display: grid; grid-template-columns: ${isMain ? '7.2rem' : '8.5rem'} 1fr; gap: 0.55rem; }
    .cvitem strong { color: ${isMain ? '#006699' : '#222'}; font-weight: 600; text-align: ${isMain ? 'right' : 'left'}; }
    ul { margin: 0.08rem 0 0; padding-left: 1.05em; }
    li { margin: 0.05rem 0; }
    .toolbar { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .toolbar a, .toolbar button {
      font: inherit; font-size: 10pt; font-weight: 600; border: 1px solid #889; background: #f3f5f6;
      border-radius: 6px; padding: 0.4rem 0.75rem; cursor: pointer; text-decoration: none; color: #111;
    }
    .toolbar .primary { background: #111; color: #fff; border-color: #111; }
    .pack-note { font-size: 9pt; color: #555; }
    @media print { .toolbar, .pack-note { display: none !important; } body { margin: 0; padding: 0; max-width: none; font-size: 10pt; line-height: 1.22; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" class="primary" onclick="window.print()">Print / Save as PDF</button>
    ${prepBase ? `<a href="${prepBase}/cv-main.pdf?download=1">Download PDF</a>` : ''}
  </div>
  ${note || ''}
  ${header}
  ${sectionsHtml}
</body>
</html>
`;
}

function renderAtsSectionBody(raw) {
  let html = '';
  const roles = [...raw.matchAll(/\\role\{([^{}]*)\}\{([^{}]*)\}\{([^{}]*)\}/g)];
  if (roles.length) {
    for (let r = 0; r < roles.length; r += 1) {
      const start = roles[r].index + roles[r][0].length;
      const stop = r + 1 < roles.length ? roles[r + 1].index : raw.length;
      const items = extractItems(raw.slice(start, stop));
      html += `<section class="entry"><div class="entry-head"><strong>${escapeHtml(
        `${texInlineToText(roles[r][1])}, ${texInlineToText(roles[r][2])}`,
      )}</strong><span class="dates">${escapeHtml(texInlineToText(roles[r][3]))}</span></div>`;
      if (items.length) html += `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
      html += '</section>\n';
    }
  }

  for (const edu of raw.matchAll(/\\edu\{([^{}]*)\}\{([^{}]*)\}\{([^{}]*)\}/g)) {
    html += `<section class="entry"><div class="entry-head"><strong>${escapeHtml(texInlineToText(edu[1]))}</strong><span class="dates">${escapeHtml(texInlineToText(edu[2]))}</span></div>`;
    html += `<p>${escapeHtml(texInlineToText(edu[3]))}</p></section>\n`;
  }

  if (!roles.length) {
    const items = extractItems(raw);
    if (items.length) {
      html += `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>\n`;
    } else {
      const plain = texInlineToText(raw.replace(/\\entrygap/g, '\n'));
      if (plain) html += `<p>${escapeHtml(plain).replace(/\n/g, '<br/>')}</p>\n`;
    }
  }

  return html;
}

/** Split on \\section / \\section* with nested braces in the title. */
function splitSections(doc) {
  const sections = [];
  const re = /\\section\*?\{/g;
  let match;
  const starts = [];
  while ((match = re.exec(doc))) {
    starts.push(match.index);
  }
  if (!starts.length) return { preamble: doc, sections: [] };

  const preamble = doc.slice(0, starts[0]);
  for (let s = 0; s < starts.length; s += 1) {
    const openBrace = doc.indexOf('{', starts[s]);
    const titleG = readBraceGroup(doc, openBrace);
    if (!titleG) continue;
    const bodyEnd = s + 1 < starts.length ? starts[s + 1] : doc.length;
    sections.push({
      title: texInlineToText(titleG.arg),
      body: doc.slice(titleG.end, bodyEnd),
    });
  }
  return { preamble, sections };
}

const SOCIAL_URL = {
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  github: (h) => `https://github.com/${h}`,
  twitter: (h) => `https://twitter.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  gitlab: (h) => `https://gitlab.com/${h}`,
};

function moderncvHeader(preamblePlusPreambleDoc, fullTex) {
  const src = fullTex;
  const first = parseCmdArgs(src, 'name')?.args || [];
  const name = [first[0], first[1]].filter(Boolean).map(texInlineToText).join(' ') || 'CV';
  const title = texInlineToText(parseCmdArgs(src, 'title')?.args?.[0] || '');
  const email = texInlineToText(parseCmdArgs(src, 'email')?.args?.[0] || '');
  const phoneParsed = parseCmdArgs(src, 'phone');
  const phone = phoneParsed ? texInlineToText(phoneParsed.args[phoneParsed.args.length - 1] || '') : '';
  const homepage = texInlineToText(parseCmdArgs(src, 'homepage')?.args?.[0] || '');
  const address = (parseCmdArgs(src, 'address')?.args || []).map(texInlineToText).filter(Boolean).join(', ');

  const parts = [];
  if (address) parts.push(escapeHtml(address));
  if (email) parts.push(linkHtml(`mailto:${email}`, email));
  if (phone) {
    const tel = phone.replace(/[^\d+]/g, '');
    parts.push(tel ? linkHtml(`tel:${tel}`, phone) : escapeHtml(phone));
  }
  if (homepage) {
    const url = ensureHttpUrl(homepage);
    parts.push(linkHtml(url, homepage.replace(/^https?:\/\//i, '')));
  }

  let idx = 0;
  while (idx < src.length) {
    const m = src.slice(idx).match(/\\social\[([^\]]*)\]\{([^}]*)\}/);
    if (!m) break;
    const kind = m[1].toLowerCase().trim();
    const handle = m[2].trim();
    const build = SOCIAL_URL[kind];
    if (build && handle) {
      parts.push(linkHtml(build(handle), handle));
    } else if (handle) {
      parts.push(escapeHtml(handle));
    }
    idx += m.index + m[0].length;
  }

  return {
    name,
    headline: title,
    contact: parts.map((p) => p.replace(/<[^>]+>/g, '')).join(' · '),
    contactHtml: parts.join(' · '),
  };
}

function renderModerncvSection(body) {
  let html = '';
  let i = 0;
  while (i < body.length) {
    const cv = parseCmdArgs(body, 'cventry', i);
    const item = parseCmdArgs(body, 'cvitem', i);
    const next = [cv, item].filter(Boolean).sort((a, b) => a.index - b.index)[0];
    if (!next || next.index > i + 200 && html) {
      // skip junk until next cmd
      const again = body.slice(i).search(/\\(?:cventry|cvitem)\s*\{/);
      if (again === -1) break;
      i += again;
      continue;
    }
    if (next.index > i) i = next.index;

    if (cv && cv.index === next.index) {
      const [dates, role, org, loc, , detail] = cv.args;
      const where = [texInlineToText(org || ''), texInlineToText(loc || '')].filter(Boolean).join(', ');
      const items = extractItems(detail || '');
      // moderncv classic: dates in left hint column
      html += `<section class="entry"><div class="dates">${escapeHtml(texInlineToText(dates || ''))}</div><div class="entry-body"><div class="entry-head"><div><span class="role">${escapeHtml(
        texInlineToText(role || ''),
      )}</span>${where ? ` <span class="org">— ${escapeHtml(where)}</span>` : ''}</div></div>`;
      if (items.length) html += `<ul>${items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
      else if (detail && !/\\begin\{itemize\}/.test(detail)) {
        const plain = texInlineToText(detail);
        if (plain) html += `<p>${escapeHtml(plain)}</p>`;
      }
      html += '</div></section>\n';
      i = cv.end;
      continue;
    }

    if (item && item.index === next.index) {
      const labelHtml = texInlineToLinkedHtml(item.args[0] || '');
      const desc = texInlineToText(item.args[1] || '');
      html += `<div class="cvitem"><strong>${labelHtml}</strong><span>${escapeHtml(desc)}</span></div>\n`;
      i = item.end;
      continue;
    }
    break;
  }
  return html;
}

/** Experience always first (cv-tailor hard rule). */
function sectionSortKey(title) {
  const t = String(title || '').toLowerCase();
  if (/\b(experience|employment)\b/.test(t)) return 0;
  if (/\beducation\b/.test(t)) return 1;
  if (/\bprojects?\b/.test(t)) return 2;
  if (/\bskills?\b/.test(t)) return 3;
  return 50;
}

function moderncvToHtml(tex, { jobTitle = '', company = '', prepBase = '', photoPath = null } = {}) {
  const body = stripTexComments(tex);
  const doc = body.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/i)?.[1] || body;
  const { preamble, sections } = splitSections(doc);
  const header = moderncvHeader(preamble, body);
  const ordered = [...sections].sort(
    (a, b) => sectionSortKey(a.title) - sectionSortKey(b.title),
  );
  let sectionsHtml = '';
  for (const sec of ordered) {
    sectionsHtml += `<h2>${escapeHtml(sec.title)}</h2>\n`;
    sectionsHtml += renderModerncvSection(sec.body);
  }
  // photoPath may be the image file, or the .tex path (resolve \photo{file} beside it)
  let photoUri = null;
  if (photoPath && /\.(jpe?g|png|webp)$/i.test(photoPath)) {
    photoUri = photoDataUri(photoPath);
  }
  if (!photoUri && photoPath) {
    const photoCmd = parseCmdArgs(body, 'photo');
    const photoFile = photoCmd?.args?.[photoCmd.args.length - 1] || 'basit.jpg';
    const baseDir = /\.tex$/i.test(photoPath) ? dirname(photoPath) : photoPath;
    photoUri = photoDataUri(join(baseDir, photoFile));
  }
  const note = jobTitle
    ? `<p class="pack-note">From Overleaf <code>main.tex</code> (moderncv layout) for <strong>${escapeHtml(jobTitle)}</strong> @ <strong>${escapeHtml(company)}</strong>.</p>`
    : '';
  return cvShell({
    name: header.name,
    headline: header.headline,
    contact: header.contact,
    contactHtml: header.contactHtml,
    sectionsHtml,
    note,
    prepBase,
    photoUri,
    variant: 'main',
  });
}

function atsToHtml(tex, { jobTitle = '', company = '', prepBase = '' } = {}) {
  const body = stripTexComments(tex);
  const doc = body.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/i)?.[1] || body;
  let content = doc.replace(/\\begin\{minipage\}[\s\S]*?\\end\{minipage\}/gi, (block) =>
    /includegraphics/i.test(block) ? '' : block,
  );

  const { preamble, sections } = splitSections(content);
  const headerLines = texInlineToText(preamble || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const name = headerLines[0] || 'CV';
  const headline = headerLines[1] || '';
  const contact = headerLines.slice(2).join(' · ');

  const ordered = [...sections].sort(
    (a, b) => sectionSortKey(a.title) - sectionSortKey(b.title),
  );
  let sectionsHtml = '';
  for (const sec of ordered) {
    sectionsHtml += `<h2>${escapeHtml(sec.title)}</h2>\n`;
    sectionsHtml += renderAtsSectionBody(sec.body);
  }

  const note = jobTitle
    ? `<p class="pack-note">From Overleaf <code>ats.tex</code> for <strong>${escapeHtml(jobTitle)}</strong> @ <strong>${escapeHtml(company)}</strong>.</p>`
    : '';

  return cvShell({ name, headline, contact, sectionsHtml, note, prepBase, variant: 'ats' });
}

export function overleafTexToHtml(tex, opts = {}) {
  const head = String(tex || '').slice(0, 2500);
  if (/\\documentclass[\[{][^\]}]*moderncv/i.test(head) || /\\cventry\s*\{/.test(tex)) {
    return moderncvToHtml(tex, opts);
  }
  return atsToHtml(tex, opts);
}

export function overleafTexToMarkdown(tex) {
  const body = stripTexComments(tex);
  const doc = body.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/i)?.[1] || body;
  const isModern = /\\cventry\s*\{/.test(doc) || /\\documentclass[\[{][^\]}]*moderncv/i.test(tex);

  if (isModern) {
    const { sections } = splitSections(doc);
    const header = moderncvHeader('', body);
    const lines = [`# ${header.name}`, '', header.headline, '', header.contact, ''];
    for (const sec of sections) {
      lines.push(`## ${sec.title}`, '');
      let i = 0;
      while (i < sec.body.length) {
        const cv = parseCmdArgs(sec.body, 'cventry', i);
        const item = parseCmdArgs(sec.body, 'cvitem', i);
        const next = [cv, item].filter(Boolean).sort((a, b) => a.index - b.index)[0];
        if (!next) break;
        i = next.index;
        if (cv && cv.index === next.index) {
          const [dates, role, org, loc, , detail] = cv.args;
          lines.push(`### ${texInlineToText(role)} — ${texInlineToText(org)}${loc ? `, ${texInlineToText(loc)}` : ''}`);
          if (dates) lines.push(texInlineToText(dates));
          lines.push('');
          for (const it of extractItems(detail || '')) lines.push(`- ${it}`);
          lines.push('');
          i = cv.end;
        } else if (item) {
          lines.push(`- **${texInlineToText(item.args[0] || '')}** ${texInlineToText(item.args[1] || '')}`);
          i = item.end;
        } else break;
      }
      lines.push('');
    }
    return `${lines.join('\n').trim()}\n`;
  }

  let content = doc.replace(/\\begin\{minipage\}[\s\S]*?\\end\{minipage\}/gi, (block) =>
    /includegraphics/i.test(block) ? '' : block,
  );
  const { preamble, sections } = splitSections(content);
  const pre = texInlineToText(preamble || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lines = [];
  if (pre[0]) lines.push(`# ${pre[0]}`, '');
  if (pre[1]) lines.push(pre[1], '');
  if (pre.slice(2).length) lines.push(pre.slice(2).join(' · '), '');

  for (const sec of sections) {
    lines.push(`## ${sec.title}`, '');
    const raw = sec.body;
    const roles = [...raw.matchAll(/\\role\{([^{}]*)\}\{([^{}]*)\}\{([^{}]*)\}/g)];
    if (roles.length) {
      for (let r = 0; r < roles.length; r += 1) {
        const start = roles[r].index + roles[r][0].length;
        const stop = r + 1 < roles.length ? roles[r + 1].index : raw.length;
        lines.push(`### ${texInlineToText(roles[r][1])} — ${texInlineToText(roles[r][2])}`);
        lines.push(texInlineToText(roles[r][3]), '');
        for (const item of extractItems(raw.slice(start, stop))) lines.push(`- ${item}`);
        lines.push('');
      }
    }
    for (const edu of raw.matchAll(/\\edu\{([^{}]*)\}\{([^{}]*)\}\{([^{}]*)\}/g)) {
      lines.push(`**${texInlineToText(edu[1])}** · ${texInlineToText(edu[2])}`);
      lines.push(texInlineToText(edu[3]), '');
    }
    if (!roles.length && !/\\edu\{/.test(raw)) {
      const items = extractItems(raw);
      if (items.length) {
        for (const item of items) lines.push(`- ${item}`);
        lines.push('');
      } else {
        const plain = texInlineToText(raw.replace(/\\entrygap/g, '\n'));
        if (plain) lines.push(plain, '');
      }
    }
  }
  return `${lines.join('\n').trim()}\n`;
}
