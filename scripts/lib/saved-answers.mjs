import { readMemory, memoryAnswers, updateMemory } from './memory.mjs';

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

export async function loadSavedAnswers() {
  const memory = await readMemory();
  if (memory) return { ...DEFAULT_SAVED_ANSWERS, ...memoryAnswers(memory) };
  return { ...DEFAULT_SAVED_ANSWERS };
}

export async function saveSavedAnswers(answers) {
  if (await readMemory()) {
    const memory = await updateMemory((current) => {
      for (const [key, value] of Object.entries(answers)) {
        if (!(key in DEFAULT_SAVED_ANSWERS) || typeof value !== 'string') throw new Error('Invalid saved answer.');
        if (['phone', 'linkedin', 'github', 'portfolio'].includes(key)) {
          current.facts.links ||= {}; current.facts.links[key] = value;
        } else current.answers[key] = value;
      }
      return current;
    });
    return { ...DEFAULT_SAVED_ANSWERS, ...memoryAnswers(memory) };
  }
  throw new Error('Complete Memory setup first.');
}
