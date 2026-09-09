/**
 * Optional CV lines (courses, spoken languages, certificates) that may be
 * restored from a gitignored overlay, dropped when the posting does not
 * need them, or dropped to keep the CV on one page.
 *
 * Experience is never touched. Overlay path:
 *   .agents/skills/cv-tailor.local/references/optional-lines.json
 * Clonees without that file skip restore; drop rules still run on whatever
 * is already in the .tex.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './common.mjs';
import { detectGermanRequirement } from './cv-keywords.mjs';

export const OPTIONAL_LINES_REL = '.agents/skills/cv-tailor.local/references/optional-lines.json';

const EXPERIENCE_RE = /\\section\*?\{[^}]*(?:Experience|Employment)[^}]*\}[\s\S]*?(?=\\section|\s*\\end\{document\})/i;

export function loadOptionalLines() {
  const path = join(ROOT, OPTIONAL_LINES_REL);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

function jobText(job) {
  return `${job?.title || ''}\n${job?.description || ''}`.toLowerCase();
}

function protectExperience(tex, mutate) {
  const src = String(tex ?? '');
  const m = src.match(EXPERIENCE_RE);
  if (!m) return mutate(src);
  const token = `%%JS_EXPERIENCE_${m.index}%%`;
  const swapped = src.slice(0, m.index) + token + src.slice(m.index + m[0].length);
  return mutate(swapped).replace(token, m[0]);
}

export function dropSpokenLanguages(tex) {
  return protectExperience(tex, (src) => {
    let out = src;
    out = out.replace(/\\textbf\{Languages?:\s*\}[^\\\n]*\\\\[ \t]*\n?/gi, '');
    out = out.replace(/\\cvitem\{Languages?:\s*\}\{[^}]*\}[ \t]*\n?/gi, '');
    return out.replace(/\n{3,}/g, '\n\n');
  });
}

export function dropCertificates(tex) {
  return protectExperience(tex, (src) => {
    let out = src;
    out = out.replace(/\\textbf\{Certificates?:\s*\}[^\\\n]*(?:\\\\[ \t]*\n)?/gi, '');
    out = out.replace(/^[ \t]*Learning Docker[^\n]*\n/gim, '');
    out = out.replace(/\\cvitem\{[^}]*Certificates?:\s*\}\{[^}]*\}[ \t]*\n?/gi, '');
    return out.replace(/\n{3,}/g, '\n\n');
  });
}

export function dropCourseLines(tex) {
  return protectExperience(tex, (src) => {
    let out = src.replace(/^[ \t]*Courses:[^\n]+\n?/gim, '');
    out = out.replace(/(\\cventry\{[^{}]*\}\{[^{}]*\}\{[^{}]*\}\{[^{}]*\}\{[^{}]*\})\{Courses:[^{}]*\}/gi, '$1{}');
    return out.replace(/\n{3,}/g, '\n\n');
  });
}

function courseRelevant(line, text) {
  const body = String(line || '').replace(/^courses:\s*/i, '');
  const bits = body.split(/[,;/]/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 2);
  if (!bits.length) return false;
  return bits.some((bit) => {
    if (text.includes(bit)) return true;
    if (/database/.test(bit) && /\b(sql|postgres|mongodb|datenbank|database)\b/.test(text)) return true;
    if (/deep learning/.test(bit) && /\b(machine learning|neural|deep learning|\bml\b|\bki\b)\b/.test(text)) return true;
    if (/network/.test(bit) && /\b(network|netzwerk|tcp|distributed)\b/.test(text)) return true;
    if (/software engineering/.test(bit) && /\bsoftware engineering\b/.test(text)) return true;
    if (/object oriented|oop/.test(bit) && /\b(oop|object[- ]oriented|objektorient)/.test(text)) return true;
    if (/data structures|algorithms/.test(bit) && /\b(algorithm|datenstruktur|data structure)/.test(text)) return true;
    return false;
  });
}

function certRelevant(block, text) {
  if (/\b(certificate|zertifikat|certification)\b/i.test(text)) return true;
  if (/\bdocker\b/i.test(block) && /\bdocker\b/i.test(text)) return true;
  return false;
}

export function languagesNeeded(job) {
  const need = detectGermanRequirement(job);
  return need === 'required' || need === 'optional';
}

export function applyJobAwareOptionalDrops(tex, job) {
  const src = String(tex ?? '');
  const actions = [];
  let out = src;
  const text = jobText(job);

  if (job && !languagesNeeded(job) && /\\(?:textbf|cvitem)\{Languages?:/i.test(out)) {
    const next = dropSpokenLanguages(out);
    if (next !== out) {
      out = next;
      actions.push('dropped spoken-languages line (German not required)');
    }
  }

  if (job && /Certificates?/i.test(out)) {
    const certBlock = out.match(/\\textbf\{Certificates?:\s*\}[^\\\n]*/i)
      || out.match(/\\cvitem\{[^}]*Certificates?:\s*\}\{[^}]*\}/i);
    if (certBlock && !certRelevant(certBlock[0], text)) {
      const next = dropCertificates(out);
      if (next !== out) {
        out = next;
        actions.push('dropped certificates (not named in the posting)');
      }
    }
  }

  if (job && /Courses:/i.test(out)) {
    const before = out;
    out = protectExperience(out, (body) => {
      let next = body.replace(/^[ \t]*Courses:[^\n]+\n?/gim, (line) => (courseRelevant(line, text) ? line : ''));
      next = next.replace(
        /(\\cventry\{[^{}]*\}\{[^{}]*\}\{[^{}]*\}\{[^{}]*\}\{[^{}]*\})\{(Courses:[^{}]*)\}/gi,
        (full, pre, courses) => (courseRelevant(courses, text) ? full : `${pre}{}`),
      );
      return next;
    });
    if (out !== before) actions.push('dropped course lines that do not match the posting');
  }

  return { tex: out.replace(/\n{3,}/g, '\n\n'), changed: out !== src, actions };
}

const SPACE_PASSES = [
  { id: 'courses', apply: dropCourseLines, label: 'dropped course lists to fit one page' },
  { id: 'certificates', apply: dropCertificates, label: 'dropped certificates to fit one page' },
  { id: 'languages', apply: dropSpokenLanguages, label: 'dropped spoken-languages line to fit one page' },
];

export function applyNextOptionalSpaceDrop(tex, already = []) {
  const done = new Set(already);
  for (const pass of SPACE_PASSES) {
    if (done.has(pass.id)) continue;
    const next = pass.apply(tex);
    if (next !== tex) return { tex: next, changed: true, pass: pass.id, label: pass.label };
  }
  return { tex, changed: false, pass: null, label: null };
}

function insertAfterMatch(src, re, line) {
  const m = src.match(re);
  if (!m) return src;
  const at = m.index + m[0].length;
  const after = src.slice(at);
  if (/^\s*Courses:/i.test(after) || /\{Courses:/i.test(m[0])) return src;
  return `${src.slice(0, at)}\n${line}\n${src.slice(at)}`;
}

export function ensureOptionalLines(tex, extras = loadOptionalLines()) {
  if (!extras) return { tex: String(tex ?? ''), changed: false, added: [] };
  let out = String(tex ?? '');
  const added = [];

  for (const course of extras.courses || []) {
    const match = String(course.match || '');
    const line = String(course.line || '').trim();
    if (!match || !line) continue;
    if (out.includes(line)) continue;
    const esc = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const cventryRe = new RegExp(
      `(\\\\cventry\\{[^{}]*\\}\\{[^{}]*\\}\\{[^}]*${esc}[^}]*\\}\\{[^{}]*\\}\\{[^{}]*\\})\\{\\}`,
      'i',
    );
    if (cventryRe.test(out)) {
      out = out.replace(cventryRe, `$1{${line}}`);
      added.push(line);
      continue;
    }
    const eduRe = new RegExp(`\\\\edu\\{[^}]*${esc}[^}]*\\}\\{[^{}]*\\}\\{[^{}]*\\}[^\\n]*\\n`, 'i');
    const before = out;
    out = insertAfterMatch(out, eduRe, line);
    if (out !== before) added.push(line);
  }

  if (extras.languages && !/\\(?:textbf|cvitem)\{Languages?:/i.test(out)) {
    if (/\\textbf\{Tech stack:/i.test(out)) {
      out = out.replace(
        /(\\textbf\{Tech stack:[^\\\n]*\\\\[ \t]*\n?)/i,
        `$1\\textbf{Languages:} ${extras.languages}\\\\\n`,
      );
      added.push('Languages');
    } else if (/\\cvitem\{Tech stack:/i.test(out)) {
      out = out.replace(
        /(\\cvitem\{Tech stack:\s*\}\{[^}]*\}[ \t]*\n?)/i,
        `$1\\cvitem{Language: }{${extras.languages}}\n`,
      );
      added.push('Languages');
    }
  }

  if (extras.certificates && !/Certificates?/i.test(out)) {
    if (/\\textbf\{Languages?:/i.test(out)) {
      out = out.replace(
        /(\\textbf\{Languages?:[^\\\n]*\\\\[ \t]*\n?)/i,
        `$1\\textbf{Certificates:} ${extras.certificates}\n`,
      );
      added.push('Certificates');
    } else if (/\\cvitem\{Languages?:/i.test(out)) {
      out = out.replace(
        /(\\cvitem\{Languages?:\s*\}\{[^}]*\}[ \t]*\n?)/i,
        `$1\\cvitem{Certificates: }{${extras.certificates}}\n`,
      );
      added.push('Certificates');
    }
  }

  return { tex: out, changed: added.length > 0, added };
}
