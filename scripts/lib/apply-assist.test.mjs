import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAts } from './ats.mjs';
import { buildApplyPack, formatApplyPackText, slimPackForFill, splitName } from './apply-pack.mjs';
import { shouldSkipField, valueForField } from './apply-fill-match.mjs';
import { bookmarkletForPack } from './apply-fill-page.mjs';
import { yesNoForQuestion as yesNoBase, yesNoFromText } from './apply-yesno.mjs';
import {
  answerAdditionalQuestion,
  isPlaceholderValue,
  matchYearOption,
  yearsForQuestion,
  yearsFromSeniority,
  yesNoForQuestion,
} from './apply-questions.mjs';
import { COOKIE_BUTTON_SELECTORS, dismissCookiesInWindow } from './accept-cookies.mjs';
import {
  buildFillFallbackPrompt,
  isUnsafeToGuess,
  matchListedOption,
  parseFillFallbackJson,
  sanitizeLlmAnswers,
} from './apply-llm-fallback.mjs';
import { COLLECT_UNANSWERED_FIELDS_SRC } from './apply-form-snapshot.mjs';

test('cookie accept selectors are banner-specific, not generic Accept', () => {
  assert.ok(COOKIE_BUTTON_SELECTORS.includes('#onetrust-accept-btn-handler'));
  assert.ok(COOKIE_BUTTON_SELECTORS.some((s) => /action-type="ACCEPT"/.test(s)));
  assert.equal(COOKIE_BUTTON_SELECTORS.some((s) => s === 'button:has-text("Accept")'), false);
});

test('cookie dismiss function targets OneTrust and LinkedIn accept controls', () => {
  const src = dismissCookiesInWindow.toString();
  assert.match(src, /onetrust-accept-btn-handler/);
  assert.match(src, /action-type/);
  assert.match(src, /alle akzeptieren/i);
});

test('detectAts labels common boards and fillable ATS hosts', () => {
  assert.equal(detectAts('https://job-boards.eu.greenhouse.io/acme/jobs/1').id, 'greenhouse');
  assert.equal(detectAts('https://job-boards.eu.greenhouse.io/acme/jobs/1').fillable, true);
  assert.equal(detectAts('https://jobs.ashbyhq.com/moss/uuid').id, 'ashby');
  assert.equal(detectAts('https://jobs.lever.co/ppro/uuid').id, 'lever');
  assert.equal(detectAts('https://gridx.jobs.personio.de/job/1').id, 'personio');
  assert.equal(detectAts('https://www.linkedin.com/jobs/view/123').id, 'linkedin');
  assert.equal(detectAts('https://www.linkedin.com/jobs/view/123').fillable, true);
  assert.equal(detectAts('https://zalando.wd3.myworkdayjobs.com/job').id, 'workday');
  assert.equal(detectAts('https://zalando.wd3.myworkdayjobs.com/job').fillable, false);
  assert.equal(detectAts('https://www.arbeitnow.com/jobs/x').kind, 'aggregator');
  assert.equal(detectAts('https://example.com/careers/1').id, 'unknown');
  assert.equal(detectAts('').id, 'none');
});

test('splitName and pack omit YOUR_ placeholders', () => {
  assert.deepEqual(splitName('Ada Lovelace'), {
    firstName: 'Ada',
    lastName: 'Lovelace',
    fullName: 'Ada Lovelace',
  });
  const pack = buildApplyPack({
    job: { id: 't:1', title: 'Engineer', company: 'Acme', url: 'https://jobs.ashbyhq.com/acme/1' },
    profile: {
      name: 'Ada Lovelace',
      links: { email: 'ada@example.com', linkedin: 'YOUR_LINKEDIN', github: 'https://github.com/ada' },
    },
    answers: { phone: '+49 123', salaryExpectation: 'YOUR_SALARY', earliestStart: 'Flexible' },
  });
  assert.equal(pack.firstName, 'Ada');
  assert.equal(pack.email, 'ada@example.com');
  assert.equal(pack.github, 'https://github.com/ada');
  assert.equal(pack.linkedin, '');
  assert.equal(pack.salaryExpectation, '');
  assert.equal(pack.earliestStart, 'Flexible');
  assert.equal(pack.phone, '+49 123');
  assert.equal(pack.ats.id, 'ashby');
  assert.match(formatApplyPackText(pack), /Easy Apply/i);
  assert.match(bookmarkletForPack(slimPackForFill(pack)), /^javascript:/);
});

test('valueForField maps labels and refuses legal / submit fields', () => {
  const pack = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+49',
    linkedin: 'https://linkedin.com/in/ada',
    coverLetter: 'Hello',
  };
  assert.equal(valueForField({ label: 'First name', name: 'first_name', type: 'text' }, pack), 'Ada');
  assert.equal(valueForField({ label: 'Vorname', name: 'vorname', type: 'text' }, pack), 'Ada');
  assert.equal(valueForField({ id: 'easyApplyFormElement-1-firstName', type: 'text' }, pack), 'Ada');
  assert.equal(valueForField({ id: 'easyApplyFormElement-1-lastName', type: 'text' }, pack), 'Lovelace');
  assert.equal(valueForField({ autocomplete: 'given-name', type: 'text' }, pack), 'Ada');
  assert.equal(valueForField({ autocomplete: 'family-name', type: 'text' }, pack), 'Lovelace');
  assert.equal(valueForField({ label: 'Email', type: 'email', autocomplete: 'email' }, pack), 'ada@example.com');
  assert.equal(valueForField({ label: 'LinkedIn profile', type: 'url' }, pack), pack.linkedin);
  assert.equal(valueForField({ label: 'Cover letter', type: 'textarea' }, pack), 'Hello');
  assert.equal(valueForField({ label: 'I agree to the terms', type: 'checkbox' }, pack), null);
  assert.equal(shouldSkipField({ label: 'Password', type: 'password' }), true);
  assert.equal(shouldSkipField({ label: 'Gender', type: 'text' }), true);
  assert.equal(valueForField({ label: 'Company', name: 'company', type: 'text' }, pack), null);
});

test('additional Easy Apply questions map years, yes/no, and placeholders', () => {
  const pack = {
    seniority: 'senior',
    skills: ['Python', 'FastAPI'],
    citiesOpenTo: 'All',
    educationDegree: 'Bachelor of Science',
  };
  assert.equal(isPlaceholderValue('Select an option'), true);
  assert.equal(isPlaceholderValue('3'), false);
  assert.equal(yearsFromSeniority('senior'), 6);
  assert.equal(yearsForQuestion('How many years of work experience do you have with Python?', pack), 6);
  assert.equal(yesNoForQuestion('Are you comfortable commuting to this location?', pack), 'yes');
  assert.equal(
    answerAdditionalQuestion('Do you have experience with Python?', ['Yes', 'No'], pack),
    'Yes',
  );
  assert.equal(
    matchYearOption(['Select an option', '1', '3', '6', '10+'], 6),
    '6',
  );
});

test('yes/no answers refuse depends-style sponsorship text', () => {
  assert.equal(yesNoFromText('No'), 'no');
  assert.equal(yesNoFromText('Yes'), 'yes');
  assert.equal(yesNoFromText('Depends on role / contract type — confirm before applying'), null);
  assert.equal(
    yesNoBase('Will you need sponsorship?', { needsSponsorship: 'Depends on role' }),
    null,
  );
  assert.equal(
    yesNoBase('Will you need sponsorship?', { needsSponsorship: 'No' }),
    'no',
  );
});

test('LLM fill fallback parses JSON and refuses unsafe guesses', () => {
  const parsed = parseFillFallbackJson(`
Sure.
\`\`\`json
{"answers":[{"id":"f0","value":"6"},{"id":"f1","value":"Yes","skip":false},{"id":"f2","skip":true}]}
\`\`\`
`);
  assert.deepEqual(parsed.answers.map((a) => a.id), ['f0', 'f1', 'f2']);
  assert.equal(parsed.answers[2].skip, true);

  const fields = [
    { id: 'f0', kind: 'select', label: 'Years of Python experience', options: ['Select an option', '3', '6', '10+'] },
    { id: 'f1', kind: 'radio', label: 'Will you need visa sponsorship?', options: ['Yes', 'No'] },
    { id: 'f2', kind: 'radio', label: 'Gender', options: ['Male', 'Female', 'Decline'] },
    { id: 'f3', kind: 'text', label: 'Expected salary', options: [] },
  ];
  const pack = {
    seniority: 'senior',
    needsSponsorship: 'Depends on role / contract type — confirm before applying',
    salaryExpectation: '',
  };
  assert.equal(isUnsafeToGuess(fields[1], pack), true);
  assert.equal(isUnsafeToGuess(fields[2], pack), true);
  assert.equal(isUnsafeToGuess(fields[3], pack), true);
  assert.equal(
    isUnsafeToGuess(fields[1], { needsSponsorship: 'No' }),
    false,
  );
  assert.equal(matchListedOption(fields[0].options, '6 years'), '6');

  const cleaned = sanitizeLlmAnswers(
    [
      { id: 'f0', value: '6 years' },
      { id: 'f1', value: 'No' },
      { id: 'f2', value: 'Male' },
      { id: 'f3', value: '80000' },
    ],
    fields,
    pack,
  );
  assert.deepEqual(cleaned, [{
    id: 'f0',
    kind: 'select',
    label: 'Years of Python experience',
    value: '6',
  }]);

  const prompt = buildFillFallbackPrompt({ fields, pack });
  assert.match(prompt, /do not invent/i);
  assert.match(prompt, /NEVER invent visa/);
  assert.match(COLLECT_UNANSWERED_FIELDS_SRC, /data-jobscout-id/);
});
