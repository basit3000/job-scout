import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { ROOT, prepDir } from './common.mjs';
import { importCvTemplate, listCvTemplates, resolveCvTemplates } from './cv-templates.mjs';
import { validateCvTemplate, validateTemplateIds } from './cv-template-schema.mjs';
import { withCvTemplate } from './cv-template-context.mjs';
import { cvMarkdownToHtml } from './tailor-cv.mjs';
import { loadPrepInputs } from './prep-state.mjs';
import { pageLimit, withPromptSettings } from './prompt-settings.mjs';
import { saveTemplateSelection, savedTemplateIds, withJobTemplate } from './cv-template-packs.mjs';

const sampleTemplate = { id: 'compact', name: 'Compact', maxPages: 2, sectionOrder: [],
  layout: { widthMm: 210, heightMm: 297, marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10,
    font: 'Arial', color: '282828', bodyPt: 9, namePt: 24, headingPt: 10, contactPt: 10,
    headerAlign: 'left', headingUppercase: true, headingRule: true, lineHeight: 1.15,
    paragraphAfterPt: 0, sectionBeforePt: 8, bulletIndentPt: 24 } };

test('DOCX import keeps reference bytes privately and extracts style without candidate prose', async t => {
  const parent = join(ROOT, '.workspace', 'tests'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'templates-'));
  t.after(async () => { assert.equal(dirname(root), parent); await rm(root, { recursive: true, force: true }); });
  const bytes = await Packer.toBuffer(new Document({ styles: { default: { document: { paragraph: { spacing: { line: 288 } } } } }, sections: [{ properties: { page: {
    size: { width: 11906, height: 16838 }, margin: { top: 567, bottom: 567, left: 567, right: 567 } } }, children: [
    new Paragraph({ children: [new TextRun({ text: 'Private Example Identity', font: 'Arial', size: 48 })] }),
    new Paragraph({ children: [new TextRun({ text: 'private@example.test', font: 'Arial', size: 20 })] }),
    new Paragraph({ children: [new TextRun({ text: 'EDUCATION', font: 'Arial', size: 20, bold: true })] }),
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Private qualification not candidate evidence', font: 'Arial', size: 18 })] }),
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Another supported format sample', font: 'Arial', size: 18 })] }),
  ] }] }));
  const input = { name: 'My format', filename: 'reference.docx', base64: bytes.toString('base64') };
  const results = await Promise.all([importCvTemplate(input, root), importCvTemplate(input, root)]);
  const template = results[0].template;
  assert.equal(template.layout.namePt, 24); assert.equal(template.layout.bodyPt, 9);
  assert.equal(template.layout.marginLeftMm, 10); assert.deepEqual(template.sectionOrder, ['Education']);
  assert.equal(template.layout.lineHeight, 1.2, 'direct paragraph spacing preserves inherited line height');
  const config = await readFile(join(root, 'prompts/local.json'), 'utf8');
  assert.doesNotMatch(config, /Private|private@example|qualification/);
  assert.equal(listCvTemplates(root).length, 3, 'concurrent imports are both retained');
  assert.deepEqual(await readFile(join(root, 'cv/templates', template.id, 'reference.docx')), bytes);
  assert.throws(() => resolveCvTemplates(undefined, root), /Choose/);
  assert.equal(resolveCvTemplates([template.id, 'default'], root)[0].id, template.id);
  await assert.rejects(importCvTemplate({ ...input, base64: 'invalid!' }, root), /DOCX/);
  await assert.rejects(importCvTemplate({ ...input, base64: Buffer.from('PK\x03\x04broken').toString('base64') }, root), /extract/);
});

test('saved selections are atomic and do not silently fall back to a different CV', async t => {
  const jobId = `template-selection-test-${randomUUID()}`;
  const dir = prepDir(jobId);
  t.after(async () => { assert.equal(dirname(dir), join(ROOT, '.workspace', 'prep')); await rm(dir, { recursive: true, force: true }); });
  await withPromptSettings(async () => {
    await saveTemplateSelection(jobId, ['compact', 'default']);
    assert.deepEqual(savedTemplateIds(jobId), ['compact', 'default']);
    assert.equal(withJobTemplate(jobId, null, () => prepDir(jobId)), join(dir, 'templates', 'compact'));
    await writeFile(join(dir, 'template-selection.json'), '{broken');
    assert.throws(() => savedTemplateIds(jobId), /selection is invalid/);
    await writeFile(join(dir, 'template-selection.json'), JSON.stringify({ ids: ['removed-template'] }));
    assert.throws(() => withJobTemplate(jobId, null, () => {}), /Unknown CV template/);
  }, ROOT, { templates: [sampleTemplate] });
});

test('template selection rejects missing, unsafe and unknown IDs and unsafe CSS', () => {
  for (const ids of [[], ['../escape'], ['Default'], 'compact']) assert.throws(() => validateTemplateIds(ids));
  assert.throws(() => validateCvTemplate({ ...sampleTemplate, layout: { ...sampleTemplate.layout, font: 'Arial";color:red' } }));
  assert.throws(() => validateCvTemplate({ ...sampleTemplate, layout: { ...sampleTemplate.layout, bodyPt: NaN } }));
  assert.deepEqual(validateTemplateIds(['compact', 'compact', 'default']), ['compact', 'default']);
});

test('selected format changes render, page gate, paths and fingerprint without leaking into another run', async () => {
  const template = validateCvTemplate({ ...sampleTemplate, sectionOrder: ['Education', 'Experience'] });
  const md = '# Sample Candidate\n\n## Experience\n### Engineer | 2024–Present\n- Built a service.\n\n## Education\nDegree\n';
  const baseline = prepDir('template-test');
  const before = await loadPrepInputs({});
  await withCvTemplate(template, async () => {
    const html = cvMarkdownToHtml(md);
    assert.match(html, /font-size: 24pt/); assert.match(html, /margin: 10mm 10mm 10mm 10mm/);
    assert.ok(html.indexOf('<h2>Education') < html.indexOf('<h2>Experience'));
    assert.match(html, /class="dates">2024/);
    assert.match(html, /template=compact/);
    assert.equal(pageLimit('cv'), 2);
    assert.equal(prepDir('template-test'), join(baseline, 'templates', 'compact'));
    assert.notEqual((await loadPrepInputs({}))['cv-template'], before['cv-template']);
  });
  assert.equal(prepDir('template-test'), baseline);
  assert.equal((await loadPrepInputs({}))['cv-template'], before['cv-template']);
});
