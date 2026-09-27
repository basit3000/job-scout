import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { MEMORY_ROOT, readMemory, updateMemory } from './memory.mjs';
import { extractPdfText } from './pdf-text.mjs';

const optional = async (path) => { try { return await readFile(path, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; } };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, clean(v)]));
  return value;
};
const mappings = {
  'cv/tech-stack.md': ['facts', 'background', 'techStack'],
  'cv/cover-letter-notes.md': ['facts', 'background', 'coverLetterNotes'],
  'cv/tailoring-notes.md': ['preferences', 'tailoringNotes'],
  '.agents/skills/cv-tailor.local/agent-rules.md': ['preferences', 'agentRules'],
  '.agents/skills/cv-tailor.local/references/writing-rules.md': ['preferences', 'writingRules'],
};

export async function planMemoryMigration(root = MEMORY_ROOT) {
  const profileText = await optional(join(root, 'profile.json'));
  const answersText = await optional(join(root, 'state', 'saved-answers.json'));
  const profile = profileText ? clean(JSON.parse(profileText.replace(/^\uFEFF/, ''))) : {};
  const saved = answersText ? JSON.parse(answersText.replace(/^\uFEFF/, '')) : {};
  const memory = { schemaVersion: 1, revision: 1, facts: profile,
    preferences: { agentRules: '', writingRules: '', tailoringNotes: '' }, answers: saved.answers || saved,
    migration: { createdAt: new Date().toISOString(), sources: [], reviewSources: [], conflicts: [], notes: [
      'Structured profile and saved answers are candidate-stated, not independently verified.',
      'Narrative sources are preserved with provenance. Contradictory prose requires candidate review; migration does not infer new facts.',
      'Generated evidence, PDFs, LaTeX copies, skills and logs are references, not new confirmed facts.',
    ] } };
  memory.facts.links ||= {};
  for (const key of ['phone', 'linkedin', 'github', 'portfolio']) {
    const answer = String(memory.answers[key] || '').trim(); const fact = String(memory.facts.links[key] || memory.facts[key] || '').trim();
    if (answer && fact && answer.replace(/\/$/, '') !== fact.replace(/\/$/, '')) memory.migration.conflicts.push({
      field: `facts.links.${key}`, status: 'needs_review', retainedSource: 'profile.json', alternativeSource: 'state/saved-answers.json', alternative: answer,
    });
    memory.facts.links[key] = fact || answer;
    delete memory.answers[key];
    if (key === 'phone') delete memory.facts.phone;
  }
  const sponsorship = memory.facts.constraints?.needsSponsorship;
  if (!String(memory.answers.needsSponsorship || '').trim() && typeof sponsorship === 'boolean') memory.answers.needsSponsorship = sponsorship ? 'Yes' : 'No';
  if (typeof sponsorship === 'boolean' && String(memory.answers.needsSponsorship || '').trim()) {
    const answer = String(memory.answers.needsSponsorship).trim().toLowerCase();
    if (answer !== (sponsorship ? 'yes' : 'no') && answer !== String(sponsorship)) memory.migration.conflicts.push({ field: 'answers.needsSponsorship', status: 'needs_review', retainedSource: 'state/saved-answers.json', alternativeSource: 'profile.json', alternative: sponsorship });
  }
  if (memory.facts.constraints) delete memory.facts.constraints.needsSponsorship;
  memory.answers = Object.fromEntries(Object.entries(memory.answers).map(([k, v]) => [k, v == null ? '' : String(v)]));
  for (const [path, keys] of Object.entries(mappings)) {
    const text = await optional(join(root, path)); if (!text) continue;
    let target = memory; for (const key of keys.slice(0, -1)) target = target[key] ||= {};
    target[keys.at(-1)] = text;
  }
  const optionalPath = '.agents/skills/cv-tailor.local/references/optional-lines.json';
  const optionalText = await optional(join(root, optionalPath));
  if (optionalText) { memory.facts.background ||= {}; memory.facts.background.optionalLines = JSON.parse(optionalText); }
  const paths = new Set(['profile.json', 'state/saved-answers.json', ...Object.keys(mappings),
    '.cv-workspace/evidence.md', '.cv-workspace/evidence.json', '.cv-workspace/ats-extract.txt',
    '.workspace/evidence.md', '.workspace/evidence.json']);
  async function inventory(dir, depth = 0) {
    if (depth > 4) return;
    for (const entry of await readdir(join(root, dir), { withFileTypes: true }).catch((e) => { if (e.code === 'ENOENT') return []; throw e; })) {
      if (entry.isSymbolicLink()) continue;
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await inventory(path, depth + 1);
      else if (/\.(md|json|tex|txt|pdf)$/i.test(path) && !/\.example\.|\/\.git\//.test(path)) paths.add(path);
    }
  }
  await inventory('cv'); await inventory('.agents/skills/cv-tailor.local');
  const seen = new Map();
  for (const path of paths) {
    let bytes; try { bytes = await readFile(join(root, path)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    const sha256 = hash(bytes);
    const disposition = path === 'profile.json' || path === 'state/saved-answers.json' || mappings[path] || path === optionalPath
      ? 'migrated; app no longer reads this legacy input'
      : /^cv\/(resume\.md|cover-letter\.md|main\.tex|ats\.tex)$/.test(path) ? 'keep: master document or template'
        : /evidence\.(md|json)$|ats-extract\.txt$/.test(path) ? 'generated reference: may regenerate; not promoted to facts'
          : 'reference: preserved for review; do not remove automatically';
    memory.migration.sources.push({ path, sha256, bytes: bytes.length, disposition,
      ...(seen.has(sha256) ? { duplicateOf: seen.get(sha256) } : {}) });
    if (!seen.has(sha256) && /\.(md|txt|tex)$/.test(path) && !mappings[path] &&
      !/README|format-benchmarks|overleaf\.md|\/assets\//.test(path)) {
      memory.migration.reviewSources.push({ source: path, status: 'reference_only', text: bytes.toString('utf8') });
    }
    if (/\.pdf$/i.test(path)) {
      try {
        const pdf = await extractPdfText(join(root, path));
        memory.migration.reviewSources.push({ source: path, status: 'reference_only', pages: pdf.pages, text: pdf.text });
      } catch { memory.migration.reviewSources.push({ source: path, status: 'not_extracted', reason: 'PDF extraction failed; original preserved.' }); }
    }
    seen.set(sha256, path);
  }
  // Read portfolio data as text, never execute a candidate's JavaScript modules.
  const portfolio = process.env.PORTFOLIO_ROOT ? resolve(root, process.env.PORTFOLIO_ROOT) : join(root, '..', 'portfolio');
  for (const name of ['profile.js', 'projects.js', 'certifications.js', 'now.js']) {
    const source = `portfolio/src/data/${name}`;
    const text = await optional(join(portfolio, 'src', 'data', name)); if (!text) continue;
    memory.migration.sources.push({ path: source, sha256: hash(text), bytes: Buffer.byteLength(text), disposition: 'portfolio reference: review before adding facts', inlineArchive: true });
    memory.migration.reviewSources.push({ source, status: 'reference_only', text });
  }
  return memory;
}

export async function migrateMemory(root = MEMORY_ROOT) {
  const existing = await readMemory(root); if (existing) return { memory: existing, migrated: false };
  const proposed = await planMemoryMigration(root);
  const archive = join(root, 'state', 'memory-migration', new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(archive, { recursive: true });
  for (const source of proposed.migration.sources) {
    const dest = join(archive, source.path); await mkdir(join(dest, '..'), { recursive: true });
    if (source.inlineArchive) await writeFile(dest, proposed.migration.reviewSources.find((s) => s.source === source.path).text);
    else await copyFile(join(root, source.path), dest);
    if (hash(await readFile(dest)) !== source.sha256) throw new Error(`Source changed during migration: ${source.path}; retry.`);
  }
  proposed.migration.archive = relative(root, archive).replace(/\\/g, '/');
  const memory = await updateMemory((current) => { if (current) throw new Error('Memory already exists; migration will not overwrite it.'); return proposed; }, { root });
  const report = ['# Local memory migration', '', 'Canonical source: state/memory.json. No original files were deleted.', '',
    `Archived source copies: ${memory.migration.archive}`, `Structured conflicts to review: ${memory.migration.conflicts.length}`, '',
    ...memory.migration.sources.map((s) => `- ${s.path}: ${s.disposition}${s.duplicateOf ? `; identical to ${s.duplicateOf}` : ''}`), '',
    'Do not remove CV/letter templates, LaTeX sources, application history, search-profile.json, .env, or skills required outside this app.',
    'Only state/memory.json is active. Run the migration command with --cleanup to archive and remove retired inputs.',
    'This version supports one-way upgrades only; see docs/upgrading.md.',
  ].join('\n');
  await writeFile(join(root, 'state', 'memory-migration-report.md'), report);
  return { memory, migrated: true };
}
