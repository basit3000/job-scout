import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { prepDir } from './common.mjs';
import { listCvTemplates, resolveCvTemplates } from './cv-templates.mjs';
import { withCvTemplate } from './cv-template-context.mjs';
import { validateTemplateIds } from './cv-template-schema.mjs';

export function savedTemplateIds(jobId) {
  if (!jobId) return [];
  return withCvTemplate(null, () => {
    let raw;
    try {
      raw = readFileSync(join(prepDir(jobId), 'template-selection.json'), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    try { return validateTemplateIds(JSON.parse(raw).ids); }
    catch { throw new Error('Saved CV format selection is invalid. Choose the formats again in Prepare.'); }
  });
}

export async function saveTemplateSelection(jobId, ids) {
  const templates = resolveCvTemplates(ids);
  return withCvTemplate(null, async () => {
    const dir = prepDir(jobId);
    await mkdir(dir, { recursive: true });
    const temp = join(dir, `template-selection.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify({ ids: templates.map(t => t.id) }, null, 2) + '\n');
    await rename(temp, join(dir, 'template-selection.json'));
  });
}

export function withJobTemplate(jobId, requestedId, fn) {
  const id = requestedId || savedTemplateIds(jobId)[0] || 'default';
  const template = listCvTemplates().find(t => t.id === id);
  if (!template) throw new Error('Unknown CV template.');
  return withCvTemplate(id === 'default' ? null : template, fn);
}

export async function readTemplatePacks(jobId, readPack) {
  const ids = savedTemplateIds(jobId);
  if (!ids.length) return readPack(jobId);
  const variants = (await Promise.all(ids.map(id => withJobTemplate(jobId, id, () => readPack(jobId))))).filter(Boolean);
  return variants.length ? { ...variants[0], variants } : null;
}
