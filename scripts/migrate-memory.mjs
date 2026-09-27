import { migrateMemory, planMemoryMigration } from './lib/memory-migration.mjs';
import { loadDotEnv } from './lib/common.mjs';
import { cleanupMemory } from './lib/memory-cleanup.mjs';
import { readMemory } from './lib/memory.mjs';
loadDotEnv();
const preview = process.argv.includes('--plan');
try {
  const memory = preview ? (await readMemory() || await planMemoryMigration()) : (await migrateMemory()).memory;
  console.log(`${preview ? 'Migration preview' : 'Local memory ready'}: ${memory.migration?.sources?.length || 0} source files; ${memory.migration?.conflicts?.length || 0} conflicts to review.`);
  console.log(preview ? 'Read-only preview; personal values withheld.' : 'Originals archived. Memory is the only active candidate source. Personal values withheld.');
  for (const source of memory.migration?.sources || []) console.log(`${source.path}: ${source.disposition}`);
  if (!preview && process.argv.includes('--cleanup')) {
    const result = await cleanupMemory();
    console.log(`Removed ${result.removed} retired files after archiving unique contents. See ${result.report}.`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
