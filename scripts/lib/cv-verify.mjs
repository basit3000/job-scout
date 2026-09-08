/**
 * Post-edit quality gate for agent-tailored CVs and cover letters.
 *
 * The agent is trusted to write; it is not trusted to be right. After it finishes,
 * this module compares its output with a snapshot taken before the run and with the
 * evidence corpus, then:
 *
 *   HARD failures  → the edit is reverted and Prep falls back to Fast mode.
 *                    (employer / title / date changed, a number nobody measured,
 *                     section order broken, Experience bullet dropped, Senior/Lead
 *                     headline, LaTeX that cannot compile, YOUR_ placeholders)
 *   AUTO fixes     → filler adjectives are deleted in place (facts survive).
 *   SOFT warnings  → generated-sounding phrases, weak openers, over-long bullets,
 *                    main.tex vs ats.tex drift, keywords that only live in Skills.
 *
 * Everything is written to <prep>/quality-report.md so the user sees exactly what
 * was checked before they send anything.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './common.mjs';
import { experienceItemCount } from './tex-fit.mjs';
import {
  findStyleIssues,
  scrubFiller,
  wordCount,
  LETTER_LIMITS,
  CV_LIMITS,
  SUSPECT_CLAIM_RE,
  WRITING_RULES_GENERIC,
} from './cv-style.mjs';
import { analyzeKeywordGaps } from './cv-keywords.mjs';
import { readBraceGroup } from './tex-parse.mjs';

export const SNAPSHOT_DIR = 'before';
const INFLATED_HEADLINE = /\b(senior|staff|principal|lead|head of|director|architect)\b/i;

/** Read N consecutive `{...}` groups starting at `idx` (skipping whitespace / [opt]). */
function readArgs(src, idx, n) {
  const args = [];
  let i = idx;
  for (let k = 0; k < n; k += 1) {
    while (i < src.length && /\s/.test(src[i])) i += 1;
    if (src[i] === '[') {
      const close = src.indexOf(']', i);
      if (close < 0) return null;
      i = close + 1;
      while (i < src.length && /\s/.test(src[i])) i += 1;
    }
    const g = readBraceGroup(src, i);
    if (!g) return null;
    args.push(g.arg);
    i = g.end;
  }
  return { args, end: i };
}

function stripComments(tex) {
  return String(tex ?? '').replace(/(^|[^\\])%[^\n]*/gm, '$1');
}

/** LaTeX → plain prose: href text kept, URLs dropped, macros and lengths removed. */
export function texToProse(tex) {
  let s = stripComments(tex);
  const doc = s.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  if (doc) s = doc[1];
  s = s
    .replace(/\\([%&#$_])/g, '$1')
    .replace(/\\\\\s*\[[^\]]*\]/g, ' ')
    .replace(/\\(?:vspace|hspace|setlength|includegraphics|linespread|titlespacing|rule|fbox|photo|moderncvstyle|moderncvcolor)\*?\s*(?:\[[^\]]*\])*\s*\{[^{}]*\}(?:\s*\{[^{}]*\})*/g, ' ')
    .replace(/\\begin\{minipage\}\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}/g, ' ')
    .replace(/\\(?:begin|end)\{[^{}]*\}/g, ' ')
    .replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:url|social)\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}/g, ' ')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

const NUMBER_RE = /[+]?\d[\d.,/:\-–]*\d|\d/g;

/**
 * Digit tokens as a normalised set: "05/2026", "82", "3.2", "+49" …
 * With `expand`, the bare digit runs inside composites are indexed too (for the corpus),
 * so "05/2026" also licenses "2026".
 */
export function numberTokens(text, { expand = false } = {}) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(NUMBER_RE)) {
    const tok = m[0].replace(/[.,:\-–/]+$/g, '');
    if (!tok) continue;
    out.add(tok);
    if (expand) for (const part of tok.split(/[^\d]+/)) if (part) out.add(part);
  }
  return out;
}

function canonicalSection(title) {
  const t = String(title || '')
    .replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/gi, '$1')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/[{}]/g, ' ')
    .toLowerCase();
  if (/\beducation\b/.test(t)) return 'education';
  if (/\bprojects?\b/.test(t)) return 'projects';
  if (/\bskills?\b/.test(t)) return 'skills';
  if (/\b(experience|employment|work experience)\b/.test(t)) return 'experience';
  return null;
}

/** Split body into { key, body } sections in document order. */
function texSections(tex) {
  const src = stripComments(tex);
  const doc = src.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  const body = doc ? doc[1] : src;
  const out = [];
  const re = /\\section\*?\{/g;
  const starts = [];
  let m;
  while ((m = re.exec(body))) starts.push(m.index);
  for (let i = 0; i < starts.length; i += 1) {
    const open = body.indexOf('{', starts[i]);
    const g = readBraceGroup(body, open);
    if (!g) continue;
    const end = i + 1 < starts.length ? starts[i + 1] : body.length;
    out.push({ key: canonicalSection(g.arg), title: g.arg, body: body.slice(g.end, end) });
  }
  return out;
}

function normText(s) {
  return String(s ?? '')
    .replace(/\\mbox\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ')
    .replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\textbf\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/--|–|—/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim()
    .toLowerCase();
}

/** Entry facts: employers, titles, dates, degrees — the lines that must never change. */
export function extractTexFacts(tex) {
  const src = stripComments(tex);
  const facts = [];
  const push = (kind, parts) => {
    const norm = parts.map(normText).filter(Boolean).join(' | ');
    if (norm) facts.push({ kind, text: norm });
  };
  for (const m of src.matchAll(/\\role\s*\{/g)) {
    const r = readArgs(src, m.index + m[0].length - 1, 3);
    if (r) push('role', r.args);
  }
  for (const m of src.matchAll(/\\edu\s*\{/g)) {
    const r = readArgs(src, m.index + m[0].length - 1, 3);
    if (r) push('education', r.args);
  }
  for (const m of src.matchAll(/\\cventry\s*\{/g)) {
    const r = readArgs(src, m.index + m[0].length - 1, 4);
    if (r) push('entry', r.args);
  }
  return facts;
}

/**
 * ats.tex project lines are `\textbf{Name} -- \mbox{\href{..}{..}} -- sentence`.
 * Returns { label, body } so the sentence can be compared with main.tex's \cvitem body.
 */
function splitProjectLine(raw) {
  const m = String(raw).match(/^\\textbf\s*\{([^{}]*)\}\s*(?:--|–)\s*(?:\\mbox\s*\{[\s\S]*?\}\}\s*(?:--|–)\s*)?([\s\S]*)$/);
  if (!m) return null;
  return { label: m[1], body: m[2].trim() };
}

/**
 * Bullets per section: `\item …` and `\cvitem{label}{text}`.
 * `text` is the whole normalised bullet; `body` is the sentence without label/link so
 * main.tex and ats.tex can be compared.
 */
export function extractTexBullets(tex) {
  const sections = texSections(tex);
  const out = [];
  for (const sec of sections) {
    if (!sec.key || sec.key === 'skills') continue;
    const body = sec.body;
    for (const m of body.matchAll(/\\item\b\s*([\s\S]*?)(?=\\item\b|\\end\{itemize\}|$)/g)) {
      const raw = m[1].trim();
      if (!raw) continue;
      const proj = sec.key === 'projects' ? splitProjectLine(raw) : null;
      out.push({
        section: sec.key,
        raw,
        text: normText(raw),
        body: normText(proj ? proj.body : raw),
        label: proj ? normText(proj.label) : undefined,
        prose: proj ? proj.body : raw,
      });
    }
    for (const m of body.matchAll(/\\cvitem\s*\{/g)) {
      const r = readArgs(body, m.index + m[0].length - 1, 2);
      if (!r) continue;
      const raw = r.args[1].trim();
      if (raw && !/\\begin\{itemize\}/.test(raw)) {
        out.push({
          section: sec.key,
          raw,
          text: normText(raw),
          body: normText(raw),
          label: normText(r.args[0]),
          prose: raw,
        });
      }
    }
  }
  return out;
}

export function extractHeadline(tex) {
  const src = stripComments(tex);
  const title = src.match(/\\title\s*\{([^{}]*)\}/);
  if (title) return normText(title[1]);
  // ats layout: the line after the {\LARGE\bfseries Name} line is the headline.
  const doc = src.match(/\\begin\{document\}([\s\S]*?)\\section/);
  if (!doc) return '';
  const large = doc[1].match(/\\LARGE[^\n]*\n\s*([^\n\\]+)/);
  return normText(large ? large[1] : '');
}

function braceBalance(tex) {
  // `\\}` is a line break followed by a real brace; `\{` is a literal brace.
  const s = stripComments(tex).replace(/\\\\/g, ' ').replace(/\\[{}]/g, '');
  const opens = (s.match(/\{/g) || []).length;
  const closes = (s.match(/\}/g) || []).length;
  return opens - closes;
}

async function readIf(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Everything a number or a name may legitimately come from. The job posting is
 * deliberately excluded — that is where "5 years" and "thousands of users" leak in.
 */
export async function buildFactCorpus({
  beforeTexts = [],
  extraTexts = [],
  evidencePath = '',
  job = null,
} = {}) {
  const texts = [
    ...beforeTexts,
    ...extraTexts,
    evidencePath ? await readIf(evidencePath) : '',
    await readIf(join(ROOT, 'cv', 'tech-stack.md')),
    await readIf(join(ROOT, 'cv', 'resume.md')),
    await readIf(join(ROOT, 'cv', 'cover-letter.md')),
    await readIf(join(ROOT, 'profile.json')),
    await readIf(join(ROOT, '.agents', 'skills', 'cv-tailor.local', 'agent-rules.md')),
    await readIf(join(ROOT, '.agents', 'skills', 'cv-tailor.local', 'references', 'tech-stack.md')),
  ];
  const numbers = new Set();
  let lower = '';
  for (const t of texts) {
    if (!t) continue;
    for (const n of numberTokens(t, { expand: true })) numbers.add(n);
    lower += `\n${t.toLowerCase()}`;
  }
  // Company / role names from the posting are fine in a letter; posting numbers are not.
  const names = `${job?.company || ''}\n${job?.title || ''}`.toLowerCase();
  return { numbers, text: lower, names };
}

export function newNumbers(text, corpus) {
  const out = [];
  for (const tok of numberTokens(text)) {
    if (corpus.numbers.has(tok)) continue;
    // A composite like "05/2026" is fine when both halves are known.
    const parts = tok.split(/[^\d]+/).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => corpus.numbers.has(p))) continue;
    out.push(tok);
  }
  // "7 years", "team of 12", "40%": the whole phrase must exist somewhere in the corpus,
  // because the bare digit almost always does (dates, phone numbers).
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const m of String(text ?? '').matchAll(SUSPECT_CLAIM_RE)) {
    const phrase = norm(m[0]);
    if (corpus.text.includes(phrase)) continue;
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out;
}

/**
 * @returns {{ tex: string, hard: string[], soft: string[], fixes: string[], changedBullets: number }}
 */
export function verifyTexEdit({ before, after, corpus, fileName = 'cv.tex' }) {
  const hard = [];
  const soft = [];
  const fixes = [];
  let tex = String(after ?? '');
  const prefix = `${fileName}: `;

  if (!/\\begin\{document\}/.test(tex) || !/\\end\{document\}/.test(tex)) {
    hard.push(`${prefix}missing \\begin{document} / \\end{document}`);
    return { tex, hard, soft, fixes, changedBullets: 0 };
  }
  const bal = braceBalance(tex);
  if (bal !== 0) hard.push(`${prefix}unbalanced braces (${bal > 0 ? `${bal} unclosed` : `${-bal} extra closing`})`);
  if (/\bYOUR_[A-Z0-9_]+\b/.test(tex)) hard.push(`${prefix}YOUR_* placeholder left in the document`);

  // Section order
  const order = texSections(tex).map((s) => s.key).filter(Boolean);
  const want = ['experience', 'education', 'projects', 'skills'].filter((k) => order.includes(k));
  const got = order.filter((k) => want.includes(k));
  if (got.join('>') !== want.join('>')) {
    hard.push(`${prefix}section order is ${got.join(' → ')} (must be Experience → Education → Projects → Skills)`);
  }

  // Headline honesty
  const headline = extractHeadline(tex);
  if (headline && INFLATED_HEADLINE.test(headline)) {
    hard.push(`${prefix}headline claims a level the candidate does not hold: "${headline}"`);
  }
  if (headline.length > CV_LIMITS.maxHeadlineChars) {
    soft.push(`${prefix}headline is ${headline.length} chars — keep it to one line`);
  }

  // Facts that must not move
  const beforeFacts = before ? extractTexFacts(before) : null;
  const afterFacts = extractTexFacts(tex);
  if (beforeFacts) {
    const afterSet = new Set(afterFacts.map((f) => f.text));
    const beforeSet = new Set(beforeFacts.map((f) => f.text));
    for (const f of beforeFacts) {
      if (!afterSet.has(f.text)) hard.push(`${prefix}${f.kind} line changed or removed: "${f.text}"`);
    }
    for (const f of afterFacts) {
      if (!beforeSet.has(f.text)) hard.push(`${prefix}new ${f.kind} line not on the original CV: "${f.text}"`);
    }
    const expBefore = experienceItemCount(before);
    const expAfter = experienceItemCount(tex);
    if (expAfter < expBefore) {
      hard.push(`${prefix}Experience bullets dropped from ${expBefore} to ${expAfter}`);
    }
  }

  // Numbers
  const fresh = newNumbers(texToProse(tex), corpus);
  if (fresh.length) {
    const line = `${prefix}numbers with no source in the evidence: ${fresh.join(', ')}`;
    // Without a pre-agent snapshot the master CV's own numbers are not in the corpus,
    // so this can only be a warning.
    if (before) hard.push(line);
    else soft.push(`${line} (no snapshot — not enforced)`);
  }

  // Bullets: style on what changed, filler scrub in place
  const beforeBullets = new Set(before ? extractTexBullets(before).map((b) => b.text) : []);
  const bullets = extractTexBullets(tex);
  let changedBullets = 0;
  for (const b of bullets) {
    const changed = !beforeBullets.has(b.text);
    if (changed) changedBullets += 1;

    // Style is judged on the sentence only (label and link markup excluded).
    const plain = b.prose.replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, '$1').replace(/\\[a-zA-Z]+\*?|[{}]/g, ' ');
    const issues = findStyleIssues(plain, {
      context: 'cv',
      bullet: true,
      personalProject: b.section === 'projects',
    });
    for (const is of issues) {
      if (is.kind === 'filler') continue; // handled by scrub below
      const line = `${prefix}${b.section} bullet — ${is.kind} "${is.phrase}": ${is.excerpt}`;
      if (is.severity === 'hard' && changed) hard.push(line);
      else if (changed || is.kind === 'inflation') soft.push(line);
    }
    if (changed && !/https?:\/\//.test(b.prose)) {
      const scrubbed = scrubFiller(b.prose);
      if (scrubbed.removed.length && tex.includes(b.prose)) {
        tex = tex.replace(b.prose, scrubbed.text);
        fixes.push(`${prefix}removed filler ${scrubbed.removed.map((w) => `"${w}"`).join(', ')} from: ${scrubbed.text.slice(0, 90)}`);
      }
    }
  }

  return { tex, hard, soft, fixes, changedBullets, headline, bullets };
}

/** main.tex and ats.tex must state the same Experience / Projects facts. */
export function compareTexPair(mainTex, atsTex) {
  const soft = [];
  const main = extractTexBullets(mainTex);
  const ats = extractTexBullets(atsTex);
  const key = (b) => b.body.replace(/[.\s]+$/, '');
  const mainKeys = new Set(main.map(key));
  const atsKeys = new Set(ats.map(key));
  for (const b of main) {
    const k = key(b);
    if (!atsKeys.has(k)) soft.push(`main.tex ${b.section} bullet has no twin in ats.tex: "${k.slice(0, 110)}"`);
  }
  for (const b of ats) {
    const k = key(b);
    if (!mainKeys.has(k)) soft.push(`ats.tex ${b.section} bullet has no twin in main.tex: "${k.slice(0, 110)}"`);
  }
  const hm = extractHeadline(mainTex);
  const ha = extractHeadline(atsTex);
  if (hm && ha && hm !== ha) soft.push(`headline differs: main "${hm}" vs ats "${ha}"`);
  return soft;
}

/** Which posting phrases live in Experience/Projects bullets vs Skills only vs nowhere. */
export function keywordCoverage({ job, tex, evidenceText = '', profile = {} }) {
  const analysis = analyzeKeywordGaps({ job, cvText: texToProse(tex), evidenceText, profile });
  const bullets = extractTexBullets(tex).map((b) => b.text).join('\n');
  const inBullets = [];
  const skillsOnly = [];
  const claimable = [...analysis.onCv, ...analysis.promote];
  for (const phrase of claimable) {
    const re = new RegExp(`(?<![a-z0-9])${phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
    if (re.test(bullets)) inBullets.push(phrase);
    else if (analysis.onCv.includes(phrase)) skillsOnly.push(phrase);
  }
  const missing = analysis.promote.filter((p) => !inBullets.includes(p));
  return { inBullets, skillsOnly, missing, notEvidenced: analysis.gaps, requirements: analysis.requirements || [] };
}

export function verifyMarkdownCv({ before, after, corpus }) {
  const hard = [];
  const soft = [];
  const fixes = [];
  let md = String(after ?? '');
  if (/\bYOUR_[A-Z0-9_]+\b/.test(md)) hard.push('cv.md: YOUR_* placeholder left in the document');
  const fresh = newNumbers(md, corpus);
  if (fresh.length) hard.push(`cv.md: numbers with no source in the evidence: ${fresh.join(', ')}`);

  const headings = (md.match(/^##\s+([^\n]+)/gm) || []).map((h) => h.replace(/^##\s+/, '').trim().toLowerCase());
  const want = ['experience', 'education', 'projects', 'skills'].filter((k) => headings.includes(k));
  const got = headings.filter((h) => want.includes(h));
  if (got.join('>') !== want.join('>')) {
    hard.push(`cv.md: section order is ${got.join(' → ')} (must be Experience → Education → Projects → Skills)`);
  }

  const beforeHeads = new Set((String(before || '').match(/^###\s+[^\n]+/gm) || []).map((s) => s.toLowerCase().trim()));
  if (beforeHeads.size) {
    const afterHeads = (md.match(/^###\s+[^\n]+/gm) || []).map((s) => s.toLowerCase().trim());
    for (const h of afterHeads) {
      if (!beforeHeads.has(h)) hard.push(`cv.md: entry heading not on the original CV: "${h.replace(/^###\s+/, '')}"`);
    }
  }

  const beforeBullets = new Set((String(before || '').match(/^\s*[-*]\s+.+$/gm) || []).map((s) => s.replace(/^\s*[-*]\s+/, '').trim().toLowerCase()));
  let section = '';
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.+)/);
    if (h) {
      section = h[1].trim().toLowerCase();
      continue;
    }
    const b = line.match(/^\s*[-*]\s+(.+)$/);
    if (!b) continue;
    const text = b[1].trim();
    const changed = !beforeBullets.has(text.toLowerCase());
    const issues = findStyleIssues(text, { context: 'cv', bullet: true, personalProject: section === 'projects' });
    for (const is of issues) {
      if (is.kind === 'filler') continue;
      const l = `cv.md ${section} bullet — ${is.kind} "${is.phrase}": ${is.excerpt}`;
      if (is.severity === 'hard' && changed) hard.push(l);
      else if (changed || is.kind === 'inflation') soft.push(l);
    }
    if (changed) {
      const s = scrubFiller(text);
      if (s.removed.length) {
        md = md.replace(text, s.text);
        fixes.push(`cv.md: removed filler ${s.removed.map((w) => `"${w}"`).join(', ')} from: ${s.text.slice(0, 90)}`);
      }
    }
  }
  return { md, hard, soft, fixes };
}

function letterBody(letter) {
  const lines = String(letter ?? '').split('\n');
  let start = 0;
  while (start < lines.length && !lines[start].trim()) start += 1;
  if (/^application for/i.test(lines[start] || '')) start += 1;
  let end = lines.findIndex((l) => /^kind regards,?$/i.test(l.trim()));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join('\n').trim();
}

export function verifyLetter({ letter, corpus, job = null }) {
  const hard = [];
  const soft = [];
  const text = String(letter ?? '');
  const body = letterBody(text);

  if (!/^\s*application for/i.test(text)) hard.push('letter: must start with "Application for <Role>"');
  if (!/^kind regards,?\s*$/im.test(text)) hard.push('letter: sign-off must be exactly "Kind regards,"');
  if (/\bYOUR_[A-Z0-9_]+\b/.test(text)) hard.push('letter: YOUR_* placeholder left in the letter');
  if (/\[(Company|Role|Date)\]/.test(text)) hard.push('letter: unfilled [Company] / [Role] / [Date] placeholder');

  const fresh = newNumbers(body, corpus);
  if (fresh.length) hard.push(`letter: numbers with no source in the evidence: ${fresh.join(', ')}`);

  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const words = wordCount(body);
  if (words < LETTER_LIMITS.minWords) soft.push(`letter: body is ${words} words (aim for ${LETTER_LIMITS.minWords}–${LETTER_LIMITS.maxWords})`);
  if (words > LETTER_LIMITS.maxWords) soft.push(`letter: body is ${words} words (aim for ${LETTER_LIMITS.minWords}–${LETTER_LIMITS.maxWords})`);
  if (paragraphs.length < LETTER_LIMITS.minParagraphs || paragraphs.length > LETTER_LIMITS.maxParagraphs) {
    soft.push(`letter: ${paragraphs.length} body paragraphs (aim for ${LETTER_LIMITS.minParagraphs}–${LETTER_LIMITS.maxParagraphs})`);
  }
  for (const sentence of body.split(/(?<=[.!?])\s+/)) {
    const n = wordCount(sentence);
    if (n > LETTER_LIMITS.maxSentenceWords) soft.push(`letter: ${n}-word sentence — split it: "${sentence.slice(0, 80)}…"`);
  }
  if (/^\s*(dear[^\n]*\n\s*)?i am writing to apply/im.test(body)) soft.push('letter: opens with "I am writing to apply" — say what you build instead');

  for (const is of findStyleIssues(body, { context: 'letter' })) {
    const line = `letter — ${is.kind} "${is.phrase}": ${is.excerpt}`;
    if (is.severity === 'hard') hard.push(line);
    else soft.push(line);
  }

  // Employers named in the letter must exist somewhere in the evidence (or be the target company).
  for (const m of body.matchAll(/\b[Aa]t ([A-Z][\w.&'-]+(?: [A-Z][\w.&'-]+){0,2})/g)) {
    const name = m[1].replace(/[.,;:]+$/, '');
    const low = name.toLowerCase();
    if (corpus.text.includes(low) || corpus.names.includes(low)) continue;
    if (/^(the|my|your|this|that|a|an|i)$/i.test(name.split(' ')[0])) continue;
    soft.push(`letter: "${name}" is not in the evidence pack or the posting — check it is a real employer/project`);
  }

  return { hard, soft, words, paragraphs: paragraphs.length };
}

export function formatQualityReport({
  job,
  cv = null,
  letter = null,
  coverage = null,
  pair = [],
  reverted = false,
  revertReason = '',
} = {}) {
  const lines = [`# Quality report — ${job?.title || '?'} @ ${job?.company || '?'}`, ''];
  lines.push(`Checked ${new Date().toISOString().slice(0, 16).replace('T', ' ')}. Deterministic checks (no model) run after the agent finished.`, '');

  if (cv) {
    const verdict = cv.hard.length ? 'REVERTED' : cv.soft.length ? 'PASS with warnings' : 'PASS';
    lines.push(`## CV — ${verdict}`, '');
    if (reverted) lines.push(`Agent edit reverted; Prep fell back to Fast mode. ${revertReason}`, '');
    if (cv.hard.length) {
      lines.push('### Hard failures (edit reverted)', '');
      for (const h of cv.hard) lines.push(`- ${h}`);
      lines.push('');
    }
    if (cv.fixes.length) {
      lines.push('### Auto-fixed', '');
      for (const f of cv.fixes) lines.push(`- ${f}`);
      lines.push('');
    }
    if (cv.soft.length) {
      lines.push('### Warnings (read before sending)', '');
      for (const s of cv.soft) lines.push(`- ${s}`);
      lines.push('');
    }
    if (pair.length) {
      lines.push('### main.tex vs ats.tex', '');
      for (const p of pair) lines.push(`- ${p}`);
      lines.push('');
    }
    if (typeof cv.changedBullets === 'number') {
      lines.push(`Bullets changed by the agent: ${cv.changedBullets}.`, '');
    }
  }

  if (coverage) {
    lines.push('## Posting keywords on the CV', '');
    lines.push(`- In Experience/Projects bullets (what AI screeners quote): ${coverage.inBullets.join(', ') || '_none_'}`);
    lines.push(`- Only on the Skills line (weak signal): ${coverage.skillsOnly.join(', ') || '_none_'}`);
    lines.push(`- Evidenced but still missing: ${coverage.missing.join(', ') || '_none_'}`);
    lines.push(`- In the posting, not evidenced (correctly absent): ${coverage.notEvidenced.join(', ') || '_none_'}`);
    lines.push('');
  }

  if (letter) {
    const verdict = letter.hard.length ? 'REJECTED (keyword draft used)' : letter.soft.length ? 'PASS with warnings' : 'PASS';
    lines.push(`## Cover letter — ${verdict}`, '');
    lines.push(`${letter.words} words, ${letter.paragraphs} paragraphs.`, '');
    if (letter.hard.length) {
      lines.push('### Hard failures', '');
      for (const h of letter.hard) lines.push(`- ${h}`);
      lines.push('');
    }
    if (letter.soft.length) {
      lines.push('### Warnings', '');
      for (const s of letter.soft) lines.push(`- ${s}`);
      lines.push('');
    }
  }

  lines.push(`Rules: \`${WRITING_RULES_GENERIC}\`; banned phrases: \`scripts/lib/cv-style.mjs\`.`, '');
  return lines.join('\n');
}

/** Copy the pre-agent CV files into <prep>/before/ so the gate can diff later. */
export async function snapshotCvSources({ prepDir, cvSource }) {
  const dir = join(prepDir, SNAPSHOT_DIR);
  await mkdir(dir, { recursive: true });
  const saved = [];
  if (cvSource === 'overleaf') {
    for (const name of ['main.tex', 'ats.tex']) {
      const src = join(ROOT, '.workspace', 'overleaf', name);
      if (!existsSync(src)) continue;
      await writeFile(join(dir, name), await readFile(src, 'utf8'));
      saved.push(name);
    }
  } else {
    const src = join(ROOT, 'cv', 'resume.md');
    if (existsSync(src)) {
      await writeFile(join(dir, 'resume.md'), await readFile(src, 'utf8'));
      saved.push('resume.md');
    }
  }
  return saved;
}

async function loadSnapshot(prepDir, name) {
  return readIf(join(prepDir, SNAPSHOT_DIR, name));
}

/**
 * Run the gate after the CV agent. Reverts `.workspace/overleaf/*.tex` (or leaves cv.md
 * untouched but flagged) on hard failures. Returns a summary and writes quality-report.md.
 */
export async function verifyCvAfterAgent({
  prepDir,
  cvSource,
  job,
  profile = {},
  evidencePath = '',
  extraInstructions = '',
  emit = () => {},
}) {
  const overleafDir = join(ROOT, '.workspace', 'overleaf');
  const before = {};
  const beforeTexts = [];
  const names = cvSource === 'overleaf' ? ['main.tex', 'ats.tex'] : ['resume.md'];
  for (const n of names) {
    before[n] = await loadSnapshot(prepDir, n);
    if (before[n]) beforeTexts.push(before[n]);
  }
  const corpus = await buildFactCorpus({
    beforeTexts,
    extraTexts: [String(extraInstructions || '')],
    evidencePath: evidencePath ? join(ROOT, evidencePath) : '',
    job,
  });
  let evidenceText = '';
  if (evidencePath) evidenceText = await readIf(join(ROOT, evidencePath));

  const cv = { hard: [], soft: [], fixes: [], changedBullets: 0 };
  let pair = [];
  let coverage = null;
  let reverted = false;

  if (cvSource === 'overleaf') {
    const after = {};
    for (const n of ['main.tex', 'ats.tex']) after[n] = await readIf(join(overleafDir, n));
    const results = {};
    for (const n of ['main.tex', 'ats.tex']) {
      if (!after[n]) continue;
      results[n] = verifyTexEdit({ before: before[n] || null, after: after[n], corpus, fileName: n });
      cv.hard.push(...results[n].hard);
      cv.soft.push(...results[n].soft);
      cv.fixes.push(...results[n].fixes);
      cv.changedBullets += results[n].changedBullets;
    }
    if (results['main.tex'] && results['ats.tex']) {
      pair = compareTexPair(results['main.tex'].tex, results['ats.tex'].tex);
    }
    if (cv.hard.length) {
      for (const n of ['main.tex', 'ats.tex']) {
        if (before[n]) await writeFile(join(overleafDir, n), before[n]);
      }
      reverted = true;
      emit(`Quality gate: ${cv.hard.length} hard failure(s) — agent edit reverted`, 'stderr');
      for (const h of cv.hard.slice(0, 6)) emit(`  ✗ ${h}`, 'stderr');
    } else {
      for (const n of ['main.tex', 'ats.tex']) {
        if (results[n] && results[n].tex !== after[n]) await writeFile(join(overleafDir, n), results[n].tex);
      }
      const texForCoverage = results['ats.tex']?.tex || results['main.tex']?.tex || '';
      if (texForCoverage) coverage = keywordCoverage({ job, tex: texForCoverage, evidenceText, profile });
      emit(
        `Quality gate: pass — ${cv.changedBullets} bullet(s) changed, ${cv.fixes.length} filler fix(es), ${cv.soft.length + pair.length} warning(s)`,
        'ok',
      );
    }
  } else {
    const path = join(prepDir, 'cv.md');
    const after = await readIf(path);
    if (after) {
      const r = verifyMarkdownCv({ before: before['resume.md'] || '', after, corpus });
      cv.hard.push(...r.hard);
      cv.soft.push(...r.soft);
      cv.fixes.push(...r.fixes);
      if (r.hard.length) {
        // Leave the file for inspection but make sure Prep does not ship it.
        await writeFile(join(prepDir, 'cv.rejected.md'), after);
        await writeFile(path, '');
        reverted = true;
        emit(`Quality gate: ${r.hard.length} hard failure(s) — agent cv.md rejected`, 'stderr');
        for (const h of r.hard.slice(0, 6)) emit(`  ✗ ${h}`, 'stderr');
      } else {
        if (r.md !== after) await writeFile(path, r.md);
        emit(`Quality gate: pass — ${r.fixes.length} filler fix(es), ${r.soft.length} warning(s)`, 'ok');
      }
    }
  }

  const report = formatQualityReport({
    job,
    cv,
    coverage,
    pair,
    reverted,
    revertReason: reverted ? 'See hard failures below.' : '',
  });
  await writeFile(join(prepDir, 'quality-report.md'), report);
  return { ok: !reverted, reverted, hard: cv.hard, soft: [...cv.soft, ...pair], fixes: cv.fixes, coverage };
}

/** Run the gate on an agent-edited letter; append to quality-report.md. */
export async function verifyLetterAfterAgent({
  prepDir,
  letter,
  job,
  evidencePath = '',
  extraInstructions = '',
  emit = () => {},
}) {
  const beforeTexts = [];
  for (const n of ['main.tex', 'ats.tex', 'resume.md']) {
    const t = await loadSnapshot(prepDir, n);
    if (t) beforeTexts.push(t);
  }
  // Without a snapshot (letter-only run) the live CV files are the fact source.
  if (!beforeTexts.length) {
    for (const n of ['main.tex', 'ats.tex']) {
      const t = await readIf(join(ROOT, '.workspace', 'overleaf', n));
      if (t) beforeTexts.push(t);
    }
  }
  const draft = await readIf(join(prepDir, 'cover-letter.draft.md'));
  const corpus = await buildFactCorpus({
    beforeTexts,
    extraTexts: [String(extraInstructions || ''), draft],
    evidencePath: evidencePath ? join(ROOT, evidencePath) : '',
    job,
  });
  const result = verifyLetter({ letter, corpus, job });
  if (result.hard.length) {
    emit(`Quality gate (letter): ${result.hard.length} hard failure(s) — keyword draft used instead`, 'stderr');
    for (const h of result.hard.slice(0, 6)) emit(`  ✗ ${h}`, 'stderr');
  } else {
    emit(`Quality gate (letter): pass — ${result.words} words, ${result.soft.length} warning(s)`, 'ok');
  }

  const reportPath = join(prepDir, 'quality-report.md');
  const existing = await readIf(reportPath);
  const section = formatQualityReport({ job, letter: result })
    .split('\n')
    .filter((l, i) => i > 2) // drop the title + timestamp; keep the letter section + footer
    .join('\n');
  const merged = existing
    ? `${existing.replace(/\n## Cover letter[\s\S]*$/, '').replace(/\nRules: [^\n]*\n?$/, '').trimEnd()}\n\n${section}`
    : formatQualityReport({ job, letter: result });
  await writeFile(reportPath, `${merged.trim()}\n`);
  return { ok: result.hard.length === 0, ...result };
}
