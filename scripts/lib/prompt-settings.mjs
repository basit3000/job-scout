import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './common.mjs';
import { validateCvTemplate } from './cv-template-schema.mjs';
import { currentCvTemplate } from './cv-template-context.mjs';

const snapshots = new AsyncLocalStorage();
export const PROMPT_SETTINGS_PATH = 'prompts/local.json';

export function defaultPromptSettings() {
  return {
    templates: [],
    instructions: { all: '', cv: '', letter: '', review: '', repair: '', coordinator: '' },
    format: { sectionOrder: [], cvMaxPages: 1, letterMaxPages: 1,
      letterSubjectPrefix: '', letterSignoff: '', dropOptionalSections: false },
    style: { filler: [], discouragedPhrases: [], weakOpeners: [], scrubFiller: false,
      avoidDashes: false, maxBulletChars: 0, maxHeadlineChars: 0,
      minLetterWords: 0, maxLetterWords: 0, maxSentenceWords: 0 },
  };
}

export function validatePromptSettings(input) {
  const result = defaultPromptSettings();
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(input)) throw new Error('Prompt settings must be an object.');
  for (const [group, values] of Object.entries(input)) {
    if (group === 'templates') {
      if (!Array.isArray(values) || values.length > 30) throw new Error('At most 30 CV templates are supported.');
      result.templates = values.map(validateCvTemplate);
      if (new Set(result.templates.map(t => t.id)).size !== values.length) throw new Error('Duplicate CV template ID.');
      continue;
    }
    if (!Object.hasOwn(result, group) || !object(values)) throw new Error(`Unknown or invalid prompt settings group: ${group}`);
    for (const [key, value] of Object.entries(values)) {
      if (!Object.hasOwn(result[group], key)) throw new Error(`Unknown prompt setting: ${group}.${key}`);
      const expected = result[group][key];
      const valid = Array.isArray(expected)
        ? Array.isArray(value) && value.length <= 150 && value.every(v => typeof v === 'string' && v.trim() && v.length <= 200)
        : typeof value === typeof expected;
      if (!valid) throw new Error(`Invalid prompt setting: ${group}.${key}`);
      if (typeof value === 'string' && value.length > 12000) throw new Error(`Prompt setting too long: ${group}.${key}`);
      if (typeof value === 'number' && (!Number.isInteger(value) || value < 0 || value > 10000)) throw new Error(`Invalid limit: ${group}.${key}`);
      result[group][key] = structuredClone(value);
    }
  }
  for (const key of ['cvMaxPages', 'letterMaxPages']) {
    if (result.format[key] < 1 || result.format[key] > 10) throw new Error(`${key} must be 1–10.`);
  }
  if (result.style.maxLetterWords && result.style.minLetterWords > result.style.maxLetterWords) throw new Error('Minimum letter words exceeds maximum.');
  return result;
}

export function promptSettings(root = ROOT) {
  const effective = settings => currentCvTemplate() ? { ...settings, format: { ...settings.format,
    sectionOrder: currentCvTemplate().sectionOrder, cvMaxPages: currentCvTemplate().maxPages } } : settings;
  const snapshot = snapshots.getStore();
  if (snapshot?.root === root) return effective(structuredClone(snapshot.settings));
  try { return effective(validatePromptSettings(JSON.parse(readFileSync(join(root, PROMPT_SETTINGS_PATH), 'utf8').replace(/^\uFEFF/, '')))); }
  catch (error) {
    if (error.code === 'ENOENT') return effective(defaultPromptSettings());
    throw new Error(`${PROMPT_SETTINGS_PATH}: ${error.message}`);
  }
}

export function withPromptSettings(fn, root = ROOT, settings) {
  if (snapshots.getStore()?.root === root && settings === undefined) return fn();
  return snapshots.run({ root, settings: settings === undefined ? promptSettings(root) : validatePromptSettings(settings) }, fn);
}

export function pageLimit(scope) {
  if (scope === 'cv' && currentCvTemplate()) return currentCvTemplate().maxPages;
  return promptSettings().format[scope === 'letter' ? 'letterMaxPages' : 'cvMaxPages'];
}

export function localPromptInstructions(scope, settings = promptSettings()) {
  return [settings.instructions.all, settings.instructions[scope]].filter(Boolean).join('\n');
}
