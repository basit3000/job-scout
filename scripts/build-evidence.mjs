import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readMemory, memoryEvidence } from './lib/memory.mjs';
import { workspaceDir } from './lib/common.mjs';
const memory = await readMemory();
if (!memory) throw new Error('Complete setup or run npm run memory:migrate first.');
await mkdir(workspaceDir(), { recursive: true });
await writeFile(join(workspaceDir(), 'memory-evidence.md'), memoryEvidence(memory));
console.log(`Evidence rebuilt from local memory revision ${memory.revision}.`);
