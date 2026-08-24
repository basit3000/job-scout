/**
 * Light-touch TeX bullet edits for Job Scout Fast / Overleaf tailor.
 *
 * Existing Experience bullets are the source of truth: never invent duties,
 * never drop a bullet, never change employers / titles / dates.
 * Portfolio facts may only enrich Projects (stack already listed there).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadJson } from './common.mjs';

export function tokenizeWords(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]/i)
    .filter((w) => w.length >= 3);
}

export function scoreText(text, keywords) {
  const set = new Set(tokenizeWords(text));
  let n = 0;
  for (const k of keywords ?? []) {
    const w = String(k).toLowerCase();
    if (w.length >= 3 && set.has(w)) n += 1;
  }
  return n;
}

/** Split an itemize body into \item chunks, preserving leading non-item text. */
export function splitItemizeItems(body) {
  const parts = String(body ?? '').split(/(?=\\item\b)/);
  const prefix = [];
  const items = [];
  for (const p of parts) {
    if (/\\item\b/.test(p)) items.push(p);
    else prefix.push(p);
  }
  return { prefix: prefix.join(''), items };
}

/**
 * Split a bullet into clauses on `;` or `---` / `—`, keeping separators.
 * Does not split on colons (URLs, "end to end:").
 */
export function splitClauses(text) {
  const re = /(\s*;\s*|\s+---+|\s+—\s+)/g;
  const parts = [];
  const seps = [];
  let last = 0;
  let m;
  const src = String(text ?? '');
  while ((m = re.exec(src))) {
    parts.push(src.slice(last, m.index));
    seps.push(m[0]);
    last = m.index + m[0].length;
  }
  parts.push(src.slice(last));
  return { parts, seps };
}

/**
 * Reorder trailing clauses so JD-matching ones come sooner.
 * Clause 0 (the verb / lead) stays put so the voice does not jump.
 */
export function emphasizeBulletClauses(text, keywords) {
  const { parts, seps } = splitClauses(text);
  if (parts.length < 2) return { text, changed: false };
  const head = parts[0];
  const rest = parts.slice(1).map((p, i) => ({ p, i, score: scoreText(p, keywords) }));
  const restSorted = [...rest].sort((a, b) => b.score - a.score || a.i - b.i);
  const same = rest.every((r, idx) => r.p === restSorted[idx].p);
  if (same) return { text, changed: false };
  const newParts = [head, ...restSorted.map((r) => r.p)];
  let out = newParts[0];
  for (let i = 0; i < seps.length; i += 1) out += seps[i] + newParts[i + 1];
  return { text: out, changed: out !== text };
}

/** Reorder \item lines by keyword score. Never drop items. */
export function reorderItemizeItems(items, keywords) {
  if (!items || items.length < 2) return { items: items || [], changed: false };
  const ranked = items.map((e, i) => ({ e, i, score: scoreText(e, keywords) }));
  ranked.sort((a, b) => b.score - a.score || a.i - b.i);
  const next = ranked.map((r) => r.e);
  const changed = next.some((e, i) => e !== items[i]);
  return { items: next, changed };
}

export function emphasizeItemizeBlock(block, keywords) {
  const m = String(block ?? '').match(
    /^(\\begin\{itemize\}[^\n]*\n?)([\s\S]*?)(\\end\{itemize\})/,
  );
  if (!m) return { block, changed: false };
  const { prefix, items } = splitItemizeItems(m[2]);
  if (!items.length) return { block, changed: false };
  let changed = false;
  const emphasized = items.map((item) => {
    const mm = item.match(/^(\s*\\item\s*)([\s\S]*)$/);
    if (!mm) return item;
    const r = emphasizeBulletClauses(mm[2], keywords);
    if (r.changed) changed = true;
    return mm[1] + r.text;
  });
  const reordered = reorderItemizeItems(emphasized, keywords);
  if (reordered.changed) changed = true;
  if (!changed) return { block, changed: false };
  return {
    block: m[1] + prefix + reordered.items.join('') + m[3],
    changed: true,
  };
}

/** Apply light-touch itemize edits inside one section body. */
export function emphasizeItemizeInBody(body, keywords) {
  let changed = false;
  const next = String(body ?? '').replace(
    /\\begin\{itemize\}[\s\S]*?\\end\{itemize\}/g,
    (block) => {
      const r = emphasizeItemizeBlock(block, keywords);
      if (r.changed) changed = true;
      return r.block;
    },
  );
  return { body: next, changed };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function projectMatchesTitle(haystack, title) {
  if (!title) return false;
  return new RegExp(escapeRegExp(title), 'i').test(haystack);
}

/**
 * At most one missing portfolio tag per Projects bullet, and only when the
 * posting already names that tag. Never used on Experience.
 */
export function enrichProjectBullet(bullet, project, keywords) {
  if (!project) return { text: bullet, changed: false };
  const kw = new Set((keywords ?? []).map((k) => String(k).toLowerCase()));
  const src = String(bullet ?? '');
  if (src.length > 240) return { text: src, changed: false };
  for (const tag of project.tags || []) {
    const t = String(tag).trim();
    if (t.length < 3) continue;
    const key = t.toLowerCase();
    if (!kw.has(key) && !kw.has(key.replace(/\s+/g, ''))) continue;
    if (new RegExp(escapeRegExp(t), 'i').test(src)) continue;
    const trimmed = src.replace(/\s+$/, '');
    const needsPeriod = /\.\s*$/.test(trimmed);
    const text = needsPeriod
      ? `${trimmed.replace(/\.\s*$/, '')}, ${t}.`
      : `${trimmed}, ${t}`;
    return { text, changed: true };
  }
  return { text: src, changed: false };
}

function readBraceGroup(src, openIdx) {
  if (src[openIdx] !== '{') return null;
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\\') {
      i += 1;
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

export function enrichProjectsBody(body, keywords, projects) {
  if (!projects?.length) return { body, changed: false };
  let src = String(body ?? '');
  let changed = false;

  const cvitemRe = /\\cvitem\s*\{/g;
  const cvReplacements = [];
  let m;
  while ((m = cvitemRe.exec(src))) {
    const labelG = readBraceGroup(src, m.index + m[0].length - 1);
    if (!labelG || src[labelG.end] !== '{') continue;
    const bulletG = readBraceGroup(src, labelG.end);
    if (!bulletG) continue;
    const project = projects.find((p) => projectMatchesTitle(labelG.arg, p.title));
    if (!project) continue;
    const r = enrichProjectBullet(bulletG.arg, project, keywords);
    if (!r.changed) continue;
    cvReplacements.push({ start: labelG.end + 1, end: bulletG.end - 1, text: r.text });
  }
  for (const r of cvReplacements.reverse()) {
    src = src.slice(0, r.start) + r.text + src.slice(r.end);
    changed = true;
  }

  src = src.replace(
    /(\\item\s*)([\s\S]*?)(?=\\item\b|\\end\{itemize\}|$)/g,
    (full, lead, rest) => {
      const project = projects.find((p) => projectMatchesTitle(rest.slice(0, 180), p.title));
      if (!project) return full;
      const r = enrichProjectBullet(rest, project, keywords);
      if (!r.changed) return full;
      changed = true;
      return lead + r.text;
    },
  );

  return { body: src, changed };
}

export async function loadPortfolioFacts({ extraRoots = [] } = {}) {
  const roots = [
    process.env.PORTFOLIO_ROOT,
    join(ROOT, '..', 'portfolio'),
    join(ROOT, '.cv-workspace', 'portfolio'),
    ...extraRoots,
  ].filter(Boolean);

  for (const root of roots) {
    const file = join(root, 'src/data/projects.js');
    if (!existsSync(file)) continue;
    try {
      const mod = await import(pathToFileURL(file).href);
      const projects = mod.projects || mod.default || [];
      if (Array.isArray(projects) && projects.length) {
        return {
          projects,
          techStack: mod.techStack || [],
          source: file,
        };
      }
    } catch {
      /* try next */
    }
  }

  const evidencePaths = [
    join(ROOT, '.workspace', 'evidence.json'),
    join(ROOT, '.cv-workspace', 'evidence.json'),
  ];
  for (const p of evidencePaths) {
    const ev = await loadJson(p, null);
    const projects = ev?.portfolio?.projects;
    if (Array.isArray(projects) && projects.length) {
      return {
        projects,
        techStack: ev.portfolio.techStack || [],
        source: p,
      };
    }
  }
  return { projects: [], techStack: [], source: null };
}
