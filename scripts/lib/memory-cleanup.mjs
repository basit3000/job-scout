// One-way cleanup after migration. Unique private data is archived before removal.
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { MEMORY_ROOT, readMemory, updateMemory } from './memory.mjs';

const retired = ['profile.json', 'state/saved-answers.json', 'state/memory-compat.json',
  'state/memory-compat-backups', 'state/memory-migration-report.md',
  'cv/tech-stack.md', 'cv/cover-letter-notes.md', 'cv/tailoring-notes.md',
  '.agents/skills/cv-tailor.local', '.cv-workspace/evidence.md', '.cv-workspace/evidence.json',
  '.cv-workspace/ats-extract.txt', '.workspace/evidence.md', '.workspace/evidence.json'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function cleanupMemory(root = MEMORY_ROOT) {
  const memory = await readMemory(root);
  if (!memory) throw new Error('Migrate candidate memory before cleanup.');
  const base = resolve(root);
  const archive = join(base, 'state', 'memory-migration', 'retired-inputs');
  async function checkPath(path) {
    if (!path.startsWith(base + sep)) throw new Error('Cleanup path escaped the repository.');
    let current = base;
    for (const part of relative(base, path).split(sep)) {
      current = join(current, part);
      const stat = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (stat?.isSymbolicLink()) throw new Error('Cleanup refuses symbolic links; review the legacy path manually.');
    }
  }
  const report = join(base, 'state', 'memory-cleanup-report.json');
  await checkPath(archive);
  await checkPath(report);
  for (const rel of retired) await checkPath(resolve(base, rel));
  await mkdir(archive, { recursive: true });
  const hashes = new Set();
  const inventory = [];
  async function walk(path, consume) {
    const stat = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new Error('Cleanup refuses symbolic links; review the legacy path manually.');
    if (stat.isDirectory()) for (const name of await readdir(path)) await walk(join(path, name), consume);
    else await consume(path, await readFile(path));
  }
  await walk(join(base, 'state', 'memory-migration'), async (_, bytes) => hashes.add(digest(bytes)));
  for (const rel of retired) {
    const path = resolve(base, rel);
    await checkPath(path);
    await walk(path, async (file, bytes) => {
      const hash = digest(bytes);
      if (!hashes.has(hash)) {
        await writeFile(join(archive, `${hash}-${basename(file)}`), bytes, { mode: 0o600 });
        hashes.add(hash);
      }
      inventory.push({ source: file.slice(base.length + 1), sha256: hash });
    });
    // The resolved target has been checked above, and every file is preserved.
    await rm(path, { recursive: true, force: true });
  }
  if (memory.migration?.reviewSources) {
    await writeFile(join(archive, 'reference-material.json'), JSON.stringify(memory.migration.reviewSources, null, 2), { mode: 0o600 });
    await updateMemory(current => {
      delete current.migration.reviewSources;
      current.migration.referencesArchive = 'state/memory-migration/retired-inputs/reference-material.json';
      return current;
    }, { root });
  }
  if (inventory.length) {
    const previous = await readFile(report, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error; });
    const entries = new Map([...(previous.removed || []), ...inventory].map(item => [`${item.source}:${item.sha256}`, item]));
    await writeFile(report, JSON.stringify({ removed: [...entries.values()], archive: 'state/memory-migration/' }, null, 2));
  }
  return { removed: inventory.length, report: 'state/memory-cleanup-report.json' };
}
