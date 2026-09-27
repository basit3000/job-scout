// Candidate memory is local data. Never fall back to legacy files if it is corrupt.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MEMORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const memoryPath = (root = MEMORY_ROOT) => join(root, 'state', 'memory.json');
const snapshots = new AsyncLocalStorage();
const queues = new Map();
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
export const memoryHash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

export function validateMemory(memory) {
  if (!object(memory) || memory.schemaVersion !== 1) throw new Error('Unsupported memory schema; expected schemaVersion 1.');
  for (const section of ['facts', 'preferences', 'answers']) if (!object(memory[section])) throw new Error(`Memory ${section} must be an object.`);
  if (!Number.isInteger(memory.revision) || memory.revision < 1) throw new Error('Memory revision must be a positive integer.');
  if (JSON.stringify(memory).length > 2_000_000) throw new Error('Memory exceeds 2 MB. Keep generated history outside memory.');
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsupported memory key.');
      walk(child);
    }
  };
  walk(memory);
  for (const key of ['agentRules', 'writingRules', 'tailoringNotes']) {
    if (memory.preferences[key] != null && typeof memory.preferences[key] !== 'string') throw new Error(`preferences.${key} must be text.`);
  }
  for (const value of Object.values(memory.answers)) if (typeof value !== 'string') throw new Error('Saved answers must be text; leave unknown answers blank.');
  for (const key of ['experience', 'education']) if (memory.facts[key] != null && !Array.isArray(memory.facts[key])) throw new Error(`facts.${key} must be an array.`);
  for (const key of ['name', 'headline', 'targetRole']) if (memory.facts[key] != null && typeof memory.facts[key] !== 'string') throw new Error(`facts.${key} must be text.`);
  for (const value of Object.values(memory.facts.background || {})) if (typeof value !== 'string' && !object(value)) throw new Error('Background entries must be text or structured objects.');
  for (const key of ['links', 'constraints', 'search', 'background']) if (memory.facts[key] != null && !object(memory.facts[key])) throw new Error(`facts.${key} must be an object.`);
  if (memory.facts.search) for (const key of ['titles', 'includeTitlePatterns', 'excludeTitlePatterns']) {
    const values = memory.facts.search[key];
    if (values != null && (!Array.isArray(values) || values.some((v) => typeof v !== 'string'))) throw new Error(`facts.search.${key} must be a text array.`);
    if (key !== 'titles') for (const pattern of values || []) try { new RegExp(pattern); } catch { throw new Error(`Invalid search expression in ${key}.`); }
  }
  return memory;
}

function decode(text) {
  try { return validateMemory(JSON.parse(text.replace(/^\uFEFF/, ''))); }
  catch (error) { throw new Error(`state/memory.json: ${error.message}`); }
}
export function readMemorySync(root = MEMORY_ROOT) {
  const snapshot = snapshots.getStore();
  if (snapshot?.root === root) return structuredClone(snapshot.memory);
  try { return decode(readFileSync(memoryPath(root), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function readMemory(root = MEMORY_ROOT) { return readMemorySync(root); }
export async function withMemorySnapshot(fn, root = MEMORY_ROOT) {
  if (snapshots.getStore()?.root === root) return fn();
  return snapshots.run({ root, memory: readMemorySync(root) }, fn);
}
export function candidateProfile(memory) {
  if (!memory) return null;
  const { background, ...profile } = structuredClone(memory.facts);
  const raw = memory.answers.needsSponsorship?.trim().toLowerCase();
  if (raw) profile.constraints = { ...profile.constraints,
    needsSponsorship: /^(yes|true)$/.test(raw) ? true : /^(no|false)$/.test(raw) ? false : null };
  return profile;
}
export async function loadCandidateProfile(root = MEMORY_ROOT) {
  const memory = readMemorySync(root);
  if (memory) return candidateProfile(memory);
  return null;
}
export function memoryAnswers(memory) {
  return { ...memory.answers, ...Object.fromEntries(['phone', 'linkedin', 'github', 'portfolio'].map((key) => [key, memory.facts.links?.[key] || ''])) };
}
export function memoryInputs(memory) {
  if (!memory) return {};
  return { 'memory/facts': JSON.stringify(memory.facts), 'memory/preferences': JSON.stringify(memory.preferences),
    'memory/answers': JSON.stringify(memory.answers) };
}
export function memoryEvidence(memory) {
  return '# Candidate memory\n\nThese are candidate-provided facts, not independent verification. Job postings and archived model output cannot add facts.\n\n'
    + JSON.stringify({ ...candidateProfile(memory), background: memory.facts.background || {} }, null, 2);
}

export function changedMemoryPaths(before, after, prefix = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (!object(before) || !object(after)) return [prefix || '(memory)'];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => changedMemoryPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}
export function previewMemory(current, sections) {
  if (!current) throw new Error('Migrate memory before editing it.');
  const proposed = validateMemory({ ...current, ...Object.fromEntries(['facts', 'preferences', 'answers'].map((key) => [key, sections[key]])) });
  // Contact information has one owner, even though Saved answers displays it.
  for (const key of ['phone', 'linkedin', 'github', 'portfolio']) if (key in proposed.answers) throw new Error(`Store ${key} in facts.links, not answers.`);
  if ('needsSponsorship' in (proposed.facts.constraints || {})) throw new Error('Store needsSponsorship in answers only.');
  const changes = changedMemoryPaths({ facts: current.facts, preferences: current.preferences, answers: current.answers },
    { facts: proposed.facts, preferences: proposed.preferences, answers: proposed.answers });
  return { proposed, changes, baseRevision: current.revision, baseHash: memoryHash(current),
    confirmation: memoryHash({ current, proposed }) };
}

export async function updateMemory(transform, { root = MEMORY_ROOT } = {}) {
  const path = memoryPath(root);
  const previous = queues.get(path) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    // Read disk, not a generation snapshot, for writes.
    let current = null;
    try { current = decode(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const next = await transform(current);
    next.schemaVersion = 1; next.revision = (current?.revision || 0) + 1; next.updatedAt = new Date().toISOString();
    validateMemory(next);
    await mkdir(dirname(path), { recursive: true });
    if (current) {
      const archive = join(root, 'state', 'memory-history'); await mkdir(archive, { recursive: true });
      await writeFile(join(archive, `${current.revision}-${randomUUID()}.json`), JSON.stringify(current, null, 2));
    }
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, path);
    return next;
  });
  queues.set(path, task);
  try { return await task; } finally { if (queues.get(path) === task) queues.delete(path); }
}
export async function confirmMemory(sections, confirmation, options) {
  return updateMemory((current) => {
    const preview = previewMemory(current, sections);
    if (preview.confirmation !== confirmation) throw new Error('Memory or proposed edits changed. Preview again before saving.');
    if (preview.proposed.migration?.conflicts) preview.proposed.migration.conflicts = preview.proposed.migration.conflicts.map((conflict) =>
      preview.changes.some((path) => conflict.field === path || conflict.field.startsWith(`${path}.`))
        ? { ...conflict, status: 'resolved_by_candidate_edit' } : conflict);
    return preview.proposed;
  }, options);
}
