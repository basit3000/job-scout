import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ROOT, loadJson } from './common.mjs';

export const DEFAULT_SAVED_ANSWERS = {
  workAuthorization: '',
  noticePeriod: '',
  salaryExpectation: '',
  earliestStart: '',
  citiesOpenTo: '',
  remotePreference: '',
  linkedin: '',
  github: '',
  portfolio: '',
  phone: '',
  needsSponsorship: '',
};

export function savedAnswersPath() {
  return join(ROOT, 'state', 'saved-answers.json');
}

export async function loadSavedAnswers() {
  const data = await loadJson(savedAnswersPath(), null);
  return { ...DEFAULT_SAVED_ANSWERS, ...(data?.answers ?? data ?? {}) };
}

export async function saveSavedAnswers(answers) {
  const merged = { ...DEFAULT_SAVED_ANSWERS, ...answers };
  const path = savedAnswersPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ answers: merged, updatedAt: new Date().toISOString() }, null, 2)}\n`);
  return merged;
}
