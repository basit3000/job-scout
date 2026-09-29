import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from './common.mjs';
import { promptSettings, validatePromptSettings, PROMPT_SETTINGS_PATH } from './prompt-settings.mjs';
import { validateCvTemplate, validateTemplateIds } from './cv-template-schema.mjs';
import { runPython } from './python-runtime.mjs';
import { withCvTemplate } from './cv-template-context.mjs';

export function listCvTemplates(root = ROOT) {
  return [{ id: 'default', name: 'Current CV format', description: 'Use your configured local or Overleaf CV.' }, ...promptSettings(root).templates];
}

export function resolveCvTemplates(ids, root = ROOT) {
  const templates = listCvTemplates(root);
  if (ids === undefined) {
    if (templates.length > 1) throw new Error('Choose the CV templates for this run.');
    ids = ['default'];
  }
  return validateTemplateIds(ids).map(id => {
    const template = templates.find(t => t.id === id);
    if (!template) throw new Error('A selected CV template no longer exists. Open the selector again.');
    return template;
  });
}

export function templateInstructions(template) {
  if (template.id === 'default') return '';
  return ['## Selected CV formatting', `Use formatting profile ${JSON.stringify(template.name)}.`,
    `Prefer section order: ${template.sectionOrder.join(', ')}. Preserve other supported sections.`,
    `Page budget: ${template.maxPages}. The host applies typography and page geometry.`,
    'Write normal CV Markdown. Use ### entry headings with dates after a | separator for right alignment.',
    'Formatting references are never evidence of candidate skills, employers, dates, education or achievements.',
    'Do not add facts to fill template slots. Preserve supported content; shorten only within the candidate policy.'].join('\n');
}

export function templateFormattingRules(template, warnings = []) {
  if (template.id === 'default') return 'Use the configured local or Overleaf CV format and current prompt settings.\n';
  const l = template.layout;
  return templateInstructions(template) + '\n\n## Formatting rules\n\n'
    + `- Page: ${l.widthMm} × ${l.heightMm} mm; top/right/bottom/left margins ${l.marginTopMm}/${l.marginRightMm}/${l.marginBottomMm}/${l.marginLeftMm} mm.\n`
    + `- Typeface: ${l.font}; body ${l.bodyPt} pt, name ${l.namePt} pt, contact ${l.contactPt} pt, headings ${l.headingPt} pt.\n`
    + `- Text color: #${l.color}; header aligned ${l.headerAlign}; line spacing ${l.lineHeight}.\n`
    + `- Headings: ${l.headingUppercase ? 'uppercase' : 'source case'}, ${l.headingRule ? 'with a bottom rule' : 'without a rule'}; ${l.sectionBeforePt} pt before sections.\n`
    + `- Paragraph spacing after: ${l.paragraphAfterPt} pt; bullet indent ${l.bulletIndentPt} pt.\n`
    + '- Keep entry headings with the following text and dates aligned right. Preserve readable text and complete content; report overflow.\n'
    + '\n## Extracted measurements\n\n' + JSON.stringify(template.layout, null, 2)
    + '\n\n## Import notes\n\n'
    + ['This profile controls HTML/PDF output; complex Word layouts are approximated.', 'Source prose is not candidate evidence.', ...warnings].join('\n') + '\n';
}

let saving = Promise.resolve();
export async function importCvTemplate({ name, filename, base64, maxPages = 1 }, root = ROOT) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw new Error('Enter a template name of 1–100 characters.');
  if (typeof filename !== 'string' || !/\.docx$/i.test(filename)) throw new Error('Choose a Word .docx file.');
  if (typeof base64 !== 'string' || base64.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Choose a DOCX up to 8 MB.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 8 * 1024 * 1024 || bytes.subarray(0, 4).toString('hex') !== '504b0304') throw new Error('Invalid DOCX file.');
  const id = `template-${randomUUID()}`;
  const folder = join(root, 'cv', 'templates', id);
  await mkdir(folder, { recursive: true });
  const reference = join(folder, 'reference.docx');
  await writeFile(reference, bytes, { flag: 'wx' });
  let extracted;
  try {
    const result = await runPython([join(ROOT, 'scripts', 'extract-cv-format.py'), reference], { timeout: 20_000, maxBuffer: 1024 * 1024, windowsHide: true });
    extracted = JSON.parse(result.stdout);
  } catch (error) { throw new Error(`Could not extract Word formatting: ${String(error.stderr || error.message).slice(0, 400)}`); }
  const template = validateCvTemplate({ id, name, ...extracted, maxPages });
  await writeFile(join(folder, 'formatting-rules.md'), templateFormattingRules(template, extracted.warnings));
  const save = saving.catch(() => {}).then(async () => {
    // Preserve existing user settings; serialize concurrent imports.
    const path = join(root, PROMPT_SETTINGS_PATH);
    const raw = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return '{}'; throw error; });
    const settings = JSON.parse(raw.replace(/^\uFEFF/, ''));
    settings.templates = [...(settings.templates || []), template];
    validatePromptSettings(settings);
    await mkdir(join(root, 'prompts'), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(settings, null, 2) + '\n');
    await rename(temp, path);
  });
  saving = save;
  await save;
  return { template, warnings: extracted.warnings };
}

export async function withSelectedTemplate(id, fn) {
  const [template] = resolveCvTemplates([id || 'default']);
  return withCvTemplate(template.id === 'default' ? null : template, fn);
}
