/**
 * LLM fallback for Easy Apply questions heuristics could not answer.
 * Snapshot → JSON prompt → sanitize → Playwright applies values.
 * Never invents visa/sponsorship/salary when the pack is empty or "depends".
 */

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPlaceholderValue, answerAdditionalQuestion } from './apply-questions.mjs';
import { yesNoFromText } from './apply-yesno.mjs';
import { agentRunnerAvailable } from './cv-agent.mjs';
import { runGoose } from './goose-runtime.mjs';

export const FILL_LLM_TIMEOUT_MS = 90_000;
export const FILL_LLM_MAX_STEPS = 3;

function packFacts(pack = {}) {
  const empty = '(empty — do not invent)';
  const mark = (v) => {
    const s = String(v ?? '').trim();
    return s || empty;
  };
  return {
    jobTitle: pack.title || '',
    company: pack.company || '',
    name: pack.fullName || '',
    email: pack.email || '',
    phone: pack.phone || '',
    linkedin: pack.linkedin || '',
    github: pack.github || '',
    website: pack.website || '',
    salaryExpectation: mark(pack.salaryExpectation),
    noticePeriod: pack.noticePeriod || '',
    earliestStart: pack.earliestStart || '',
    workAuthorization: mark(pack.workAuthorization),
    needsSponsorship: mark(pack.needsSponsorship),
    citiesOpenTo: pack.citiesOpenTo || '',
    remotePreference: pack.remotePreference || '',
    savedAnswers: pack.savedAnswers || {},
    skills: pack.skills || [],
    locationCurrent: pack.locationCurrent || '',
    willingToRelocate: pack.willingToRelocate,
    openToRemote: pack.openToRemote,
    educationDegree: pack.educationDegree || '',
  };
}

export function buildFillFallbackPrompt({ fields = [], pack = {} } = {}) {
  return `You fill unanswered LinkedIn Easy Apply questions for this candidate.
Reply with JSON only. Do not call tools. Do not edit files. Do not write markdown.

Schema:
{"answers":[{"id":"f0","value":"exact option or text","skip":false}]}

Rules:
- Use PROFILE only. If you would have to guess, set skip true and omit value.
- When the field lists options, value MUST be one of those option strings (same spelling).
- NEVER invent visa/sponsorship, work authorization, or salary when PROFILE says empty / do not invent / depends / maybe / unsure.
- NEVER answer gender, race, ethnicity, disability, veteran, criminal record, sexual orientation, or pronouns.
- Years of experience: use an explicit saved answer for this question; never infer a number from seniority or a skill name.
- Yes/No: pick the matching option (Yes/Ja or No/Nein).
- Cover letters / extra essays: skip unless PROFILE has a coverLetter.

PROFILE:
${JSON.stringify(packFacts(pack), null, 2)}

UNANSWERED FIELDS:
${JSON.stringify(fields, null, 2)}
`;
}

export function parseFillFallbackJson(text) {
  const s = String(text || '');
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : s;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { answers: [] };
  let obj;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { answers: [] };
  }
  const list = Array.isArray(obj?.answers) ? obj.answers : Array.isArray(obj) ? obj : [];
  return {
    answers: list
      .map((a) => ({
        id: String(a?.id ?? a?.fieldId ?? '').trim(),
        value: a?.value == null ? '' : String(a.value).trim(),
        skip: Boolean(a?.skip),
      }))
      .filter((a) => a.id),
  };
}

export function matchListedOption(options, value) {
  const opts = (options || []).map((o) => String(o).trim()).filter((o) => o && !isPlaceholderValue(o));
  const want = String(value || '').trim();
  if (!want) return null;
  if (!opts.length) return want;
  const low = want.toLowerCase();
  const exact = opts.find((o) => o.toLowerCase() === low);
  if (exact) return exact;
  return opts.find((o) => o.toLowerCase().includes(low) || low.includes(o.toLowerCase())) || null;
}

export function isUnsafeToGuess(field = {}, pack = {}) {
  const b = String(field.label || '').toLowerCase();
  if (/gender|sex\b|race|ethnic|veteran|disability|sexual|lgbt|pronoun|criminal|conviction/.test(b)) {
    return true;
  }
  if (/sponsor|visa support|immigration/.test(b) && yesNoFromText(pack.needsSponsorship) == null) {
    return true;
  }
  if (
    /authorized to work|work author|legally (allowed|authorised|authorized)|arbeitserlaubnis|berechtigt/.test(b)
    && yesNoFromText(pack.workAuthorization) == null
  ) {
    return true;
  }
  if (/salary|gehalt|compensation|expected pay|gehaltsvorstellung/.test(b) && !String(pack.salaryExpectation || '').trim()) {
    return true;
  }
  return false;
}

export function sanitizeLlmAnswers(answers = [], fields = [], pack = {}) {
  const byId = new Map(fields.map((f) => [String(f.id), f]));
  const out = [];
  for (const a of answers) {
    if (!a || a.skip) continue;
    const field = byId.get(String(a.id));
    if (!field) continue;
    if (isUnsafeToGuess(field, pack)) continue;
    let value = String(a.value || '').trim();
    if (!value) continue;
    if (/years?|jahre|proficiency|sprachkennt|degree|abschluss|over 18|previously employed|willing to|comfortable/i.test(field.label || '')) {
      const known = answerAdditionalQuestion(field.label, field.options || [], pack);
      if (!known || known.toLowerCase() !== value.toLowerCase()) continue;
    }
    if (field.options?.length) {
      const match = matchListedOption(field.options, value);
      if (!match) continue;
      value = match;
    }
    out.push({
      id: field.id,
      kind: field.kind,
      label: field.label,
      value,
    });
  }
  return out;
}

export async function askAgentText({ prompt } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'js-fill-'));
  return runGoose({ prompt: prompt + '\nReturn JSON only. Do not use tools.', cwd,
    timeoutMs: FILL_LLM_TIMEOUT_MS, maxTurns: FILL_LLM_MAX_STEPS, builtins: false });
}

/**
 * @returns {{ answers: object[], used: boolean, reason: string|null }}
 */
export async function askFillFallback({ fields, pack, provider, model } = {}) {
  if (!fields?.length) return { answers: [], used: false, reason: 'no-fields' };
  const avail = await agentRunnerAvailable(provider);
  if (!avail.ok) return { answers: [], used: false, reason: avail.detail || 'agent unavailable' };
  const prompt = buildFillFallbackPrompt({ fields, pack });
  const text = await askAgentText({ prompt, provider, model });
  const parsed = parseFillFallbackJson(text);
  return {
    answers: sanitizeLlmAnswers(parsed.answers, fields, pack),
    used: true,
    reason: null,
  };
}
