import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ROOT } from './common.mjs';
import { defaultPromptSettings, promptSettings, validatePromptSettings, withPromptSettings } from './prompt-settings.mjs';
import { buildAgentBrief, buildCoverLetterAgentBrief, buildReviewerBrief, buildRepairBrief } from './cv-prompts.mjs';
import { verifyMarkdownCv, verifyLetter, numberTokens } from './cv-verify.mjs';
import { stageFinalDocumentText } from './review-documents.mjs';
import { loadPrepInputs } from './prep-state.mjs';

async function fixture(t) {
  const parent = join(ROOT, '.workspace', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'prompt-settings-'));
  t.after(async () => { assert.equal(dirname(root), parent); await rm(root, { recursive: true, force: true }); });
  await mkdir(join(root, 'prompts'));
  return root;
}

test('missing local settings use neutral defaults; invalid settings fail explicitly', async t => {
  const root = await fixture(t);
  assert.deepEqual(promptSettings(root), defaultPromptSettings());
  for (const config of [{ format: { cvMaxPages: 0 } }, { instructions: { unknown: '' } }, { style: { filler: [12] } }]) {
    assert.throws(() => validatePromptSettings(config));
  }
  await writeFile(join(root, 'prompts/local.json'), '{broken');
  assert.throws(() => promptSettings(root), /prompts\/local.json/);
});

test('one workflow keeps its prompt snapshot and a later run sees changes', async t => {
  const root = await fixture(t);
  const file = join(root, 'prompts/local.json');
  await writeFile(file, JSON.stringify({ instructions: { cv: 'First preference' } }));
  const before = await loadPrepInputs({}, root);
  await withPromptSettings(async () => {
    await writeFile(file, JSON.stringify({ instructions: { cv: 'Second preference' } }));
    assert.equal(promptSettings(root).instructions.cv, 'First preference');
    assert.deepEqual(await loadPrepInputs({}, root), before);
  }, root);
  assert.equal(promptSettings(root).instructions.cv, 'Second preference');
  assert.notEqual((await loadPrepInputs({}, root))['prompts/settings'], before['prompts/settings']);
});

test('local preferences reach writing, review and repair without leaking into defaults', () => {
  const settings = validatePromptSettings({ instructions: { cv: 'Use a compact profile introduction.' },
    format: { sectionOrder: ['Education', 'Experience'], letterSignoff: 'Sincerely,' } });
  for (const build of [buildAgentBrief, buildReviewerBrief, buildRepairBrief]) {
    const custom = build({ settings, localRules: '' });
    assert.match(custom, /compact profile introduction/);
    assert.match(custom, /Education > Experience/);
    assert.doesNotMatch(build({ localRules: '' }), /compact profile introduction|Education > Experience/);
  }
  assert.match(buildCoverLetterAgentBrief({ settings, localRules: '' }), /Sincerely,/);
});

test('alternative layouts and letter sign-offs pass while invented facts remain rejected', () => {
  const before = '## Education\n### Example University\n## Experience\n### Engineer at Example\n- Built APIs.\n';
  const corpus = { numbers: numberTokens(before), text: before.toLowerCase(), names: '' };
  assert.deepEqual(verifyMarkdownCv({ before, after: before, corpus }).hard, []);
  const custom = validatePromptSettings({ format: { sectionOrder: ['Experience', 'Education'], letterSignoff: 'Sincerely,' } });
  assert.match(verifyMarkdownCv({ before, after: before, corpus, settings: custom }).hard.join(), /configured order/);
  assert.match(verifyMarkdownCv({ before, after: before.replace('## Education', '## Training'), corpus, settings: custom }).hard.join(), /configured section heading/);
  assert.deepEqual(verifyLetter({ letter: 'Hello,\nBuilt APIs.\nSincerely,', corpus, settings: custom }).hard, []);
  assert.match(verifyLetter({ letter: 'Hello,\nBuilt APIs for 500 users.\nSincerely,', corpus, settings: custom }).hard.join(), /no source/);
});

test('a configured two-page CV survives final review validation without allowing overflow', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'cv.pdf'), 'synthetic input');
  const read = async () => ({ pages: 2, text: 'Complete CV' });
  await withPromptSettings(async () => {
    await assert.rejects(stageFinalDocumentText(root, 'cv', read), /one page/);
  }, ROOT, {});
  await withPromptSettings(async () => {
    assert.equal(await stageFinalDocumentText(root, 'cv', read), 'cv-final-text.md');
    await assert.rejects(stageFinalDocumentText(root, 'cv', async () => ({ pages: 3, text: 'Overflow' })), /at most 2/);
  }, ROOT, { format: { cvMaxPages: 2 } });
});
