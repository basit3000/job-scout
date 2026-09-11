import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLetterModel,
  buildLetterTex,
  detectLetterLanguage,
  LETTER_FIT_STEPS,
  buildLetterText,
  firstCity,
  formatLetterDate,
  letterStrings,
  splitLetterBody,
} from './letter-tex.mjs';

const PROFILE = {
  name: 'Daniyal Bukhari',
  headline: 'M.Sc. Informatik',
  phone: '+49 173 1614951',
  location: { current: 'Mainz, Deutschland' },
  links: {
    email: 'daniyalbukhari6@gmail.com',
    linkedin: 'https://linkedin.com/in/example',
    github: 'https://github.com/example',
  },
};

const JOB = { title: 'Backend Engineer', company: 'Helsing GmbH', location: 'München' };

test('formatLetterDate matches the German long form', () => {
  assert.equal(formatLetterDate(new Date(2026, 8, 3), 'de'), '3. September 2026');
  assert.equal(formatLetterDate(new Date(2026, 2, 1), 'de'), '1. März 2026');
});

test('formatLetterDate falls back to the English long form', () => {
  assert.equal(formatLetterDate(new Date(2026, 8, 3), 'en'), '3 September 2026');
});

test('formatLetterDate returns empty for an invalid date', () => {
  assert.equal(formatLetterDate('not a date', 'de'), '');
});

test('letterStrings falls back to English for an unknown language', () => {
  assert.equal(letterStrings('fr').closing, 'Best regards,');
  assert.equal(letterStrings('de').closing, 'Mit freundlichen Grüßen');
});

test('splitLetterBody keeps only the prose', () => {
  const letter = [
    '12 September 2026',
    '',
    'Application for Backend Engineer',
    '',
    'Dear Hiring Team,',
    '',
    'First paragraph.',
    '',
    'Second paragraph.',
    '',
    'Kind regards,',
    'Daniyal Bukhari',
    'mail@example.com',
  ].join('\n');

  const out = splitLetterBody(letter);
  assert.equal(out.subject, 'Application for Backend Engineer');
  assert.equal(out.salutation, 'Dear Hiring Team,');
  assert.deepEqual(out.paragraphs, ['First paragraph.', 'Second paragraph.']);
});

test('splitLetterBody recognises the German structure', () => {
  const letter = [
    'Initiativbewerbung im Bereich Requirements Engineering',
    '',
    'Sehr geehrte Damen und Herren,',
    '',
    'Ich komme direkt auf den Punkt.',
    '',
    'Mit freundlichen Grüßen',
    'Daniyal Bukhari',
  ].join('\n');

  const out = splitLetterBody(letter);
  assert.equal(out.subject, 'Initiativbewerbung im Bereich Requirements Engineering');
  assert.equal(out.salutation, 'Sehr geehrte Damen und Herren,');
  assert.deepEqual(out.paragraphs, ['Ich komme direkt auf den Punkt.']);
});

test('splitLetterBody joins wrapped lines inside one paragraph', () => {
  const out = splitLetterBody('Dear Hiring Team,\n\nOne line\nwrapped here.\n\nNext.');
  assert.deepEqual(out.paragraphs, ['One line wrapped here.', 'Next.']);
});

test('splitLetterBody copes with a body that has no scaffolding at all', () => {
  const out = splitLetterBody('Just prose.\n\nMore prose.');
  assert.equal(out.subject, '');
  assert.equal(out.salutation, '');
  assert.deepEqual(out.paragraphs, ['Just prose.', 'More prose.']);
});

test('buildLetterModel fills German defaults and a company+city recipient', () => {
  const m = buildLetterModel({
    job: JOB,
    profile: PROFILE,
    body: 'Ich bewerbe mich.',
    language: 'de',
    date: new Date(2026, 8, 3),
  });

  assert.equal(m.subject, 'Bewerbung als Backend Engineer');
  assert.equal(m.salutation, 'Sehr geehrte Damen und Herren,');
  assert.equal(m.closing, 'Mit freundlichen Grüßen');
  assert.equal(m.date, '3. September 2026');
  assert.equal(m.place, 'Mainz');
  assert.deepEqual(m.recipient, { company: 'Helsing GmbH', city: 'München' });
  assert.equal(m.signature, 'Daniyal Bukhari');
});

test('buildLetterModel prefers a subject the template already wrote', () => {
  const m = buildLetterModel({
    job: JOB,
    profile: PROFILE,
    body: 'Initiativbewerbung, Kennziffer 6282\n\nEin Absatz.',
    language: 'de',
  });
  assert.equal(m.subject, 'Initiativbewerbung, Kennziffer 6282');
});

test('buildLetterModel drops an unknown company from the recipient block', () => {
  const m = buildLetterModel({
    job: { title: 'Dev', company: 'unknown', location: 'Berlin' },
    profile: PROFILE,
    body: 'x',
  });
  assert.deepEqual(m.recipient, { company: '', city: 'Berlin' });
});

test('buildLetterModel orders contacts phone, email, LinkedIn, GitHub', () => {
  const m = buildLetterModel({ job: JOB, profile: PROFILE, body: 'x' });
  assert.deepEqual(m.sender.contacts.map((c) => c.text), [
    '+49 173 1614951',
    'daniyalbukhari6@gmail.com',
    'LinkedIn',
    'GitHub',
  ]);
});

test('buildLetterModel falls back to the portfolio when there is no social link', () => {
  const profile = { ...PROFILE, phone: '', links: { email: 'a@b.c', portfolio: 'https://example.com' } };
  const m = buildLetterModel({ job: JOB, profile, body: 'x' });
  assert.deepEqual(m.sender.contacts.map((c) => c.text), ['a@b.c', 'Portfolio']);
});

test('buildLetterTex lays out every block of the sample letter', () => {
  const tex = buildLetterTex(buildLetterModel({
    job: JOB,
    profile: PROFILE,
    body: 'Erster Absatz.\n\nZweiter Absatz.',
    language: 'de',
    date: new Date(2026, 8, 3),
  }));

  assert.match(tex, /\\documentclass\[11pt\]\{article\}/);
  assert.match(tex, /\\usepackage\{fontawesome5\}/);
  assert.match(tex, /\\definecolor\{accent\}\{RGB\}\{31,73,125\}/);
  assert.match(tex, /Personalabteilung/);
  assert.match(tex, /\\usepackage\[ngerman\]\{babel\}/);
  assert.match(tex, /Daniyal Bukhari/);
  assert.match(tex, /Helsing GmbH/);
  assert.match(tex, /Mainz, 3\. September 2026/);
  assert.match(tex, /\\textbf\{Bewerbung als Backend Engineer\}/);
  assert.match(tex, /Sehr geehrte Damen und Herren,/);
  assert.match(tex, /Erster Absatz\./);
  // ß is escaped to the macro: a literal ß lands in the PDF text layer as "SS".
  assert.match(tex, /Mit freundlichen Grü\\ss\{\}en/);
  assert.match(tex, /\\end\{document\}/);
});

test('the first fit step reproduces the reference layout exactly', () => {
  const model = buildLetterModel({ job: JOB, profile: PROFILE, body: 'x' });
  const tex = buildLetterTex(model);
  assert.match(tex, /\\documentclass\[11pt\]\{article\}/);
  assert.match(tex, /left=2\.2cm,right=2\.2cm,top=1\.8cm,bottom=1\.8cm/);
  assert.match(tex, /\\onehalfspacing/);
  assert.doesNotMatch(tex, /\\setstretch/);
  // Passing the step explicitly must be identical to passing nothing.
  assert.equal(buildLetterTex(model, LETTER_FIT_STEPS[0]), tex);
});

test('later fit steps tighten spacing before they shrink the body', () => {
  const model = buildLetterModel({ job: JOB, profile: PROFILE, body: 'x' });
  const byId = Object.fromEntries(LETTER_FIT_STEPS.map((s) => [s.id, buildLetterTex(model, s)]));

  // Whitespace goes first, and the body stays at 11pt while it does.
  assert.match(byId.spacing, /\\setstretch\{1\.3\}/);
  assert.match(byId.spacing, /\\documentclass\[11pt\]\{article\}/);
  assert.match(byId.margins, /left=1\.9cm/);
  assert.match(byId.margins, /\\documentclass\[11pt\]\{article\}/);
  // Only the last resort drops the point size.
  assert.match(byId.bodysize, /\\documentclass\[10pt\]\{article\}/);

  // Gaps shrink monotonically, and never collapse to nothing.
  const gap = (tex) => Number(tex.match(/\\vspace\{(\d+)pt\}\n\\hrule/)[1]);
  assert.ok(gap(byId.reference) > gap(byId.leading));
  assert.ok(gap(byId.bodysize) >= 2);
});

test('the letter language follows the prose, not the posting', () => {
  // A German ad answered in English must not get a German frame.
  const english = 'Application for Frontend Developer\n\nDear Hiring Team,\n\nI build dashboards.';
  assert.equal(detectLetterLanguage(english, 'de'), 'en');
  const m = buildLetterModel({ job: JOB, profile: PROFILE, body: english, language: detectLetterLanguage(english, 'de') });
  assert.equal(m.salutation, 'Dear Hiring Team,');
  assert.equal(m.closing, 'Best regards,');

  const german = 'Bewerbung als Entwickler\n\nSehr geehrte Damen und Herren,\n\nIch baue Dashboards.';
  assert.equal(detectLetterLanguage(german, 'en'), 'de');
});

test('buildLetterTex selects the English babel option', () => {
  const tex = buildLetterTex(buildLetterModel({ job: JOB, profile: PROFILE, body: 'x' }));
  assert.match(tex, /\\usepackage\[english\]\{babel\}/);
});

test('buildLetterTex escapes LaTeX specials coming from a posting', () => {
  const tex = buildLetterTex(buildLetterModel({
    job: { title: 'C# & R&D', company: 'A_B 100% GmbH', location: 'Köln' },
    profile: PROFILE,
    body: 'Kosten: 50% mehr.',
  }));
  assert.match(tex, /A\\_B 100\\% GmbH/);
  assert.match(tex, /50\\% mehr/);
  assert.doesNotMatch(tex, /[^\\]&/);
});

test('buildLetterTex links email and profiles', () => {
  const tex = buildLetterTex(buildLetterModel({ job: JOB, profile: PROFILE, body: 'x' }));
  assert.match(tex, /\\href\{mailto:daniyalbukhari6@gmail\.com\}/);
  assert.match(tex, /\\href\{https:\/\/linkedin\.com\/in\/example\}\{LinkedIn\}/);
});

test('buildLetterTex still compiles-shaped output with no recipient at all', () => {
  const tex = buildLetterTex(buildLetterModel({
    job: { title: 'Dev' },
    profile: PROFILE,
    body: 'x',
  }));
  // A posting with no company still addresses the team, and the block stays balanced.
  assert.match(tex, /\\begin\{minipage\}\[t\]\{0\.6\\textwidth\}\nHiring Team\n\\end\{minipage\}/);
  assert.match(tex, /\\end\{document\}/);
});

test('buildLetterText renders the same blocks as plain text', () => {
  const text = buildLetterText(buildLetterModel({
    job: JOB,
    profile: PROFILE,
    body: 'Erster Absatz.',
    language: 'de',
    date: new Date(2026, 8, 3),
  }));

  const lines = text.split('\n').filter(Boolean);
  assert.equal(lines[0], 'Daniyal Bukhari');
  assert.ok(text.includes('Helsing GmbH'));
  assert.ok(text.includes('Mainz, 3. September 2026'));
  assert.ok(text.includes('Bewerbung als Backend Engineer'));
  assert.ok(text.trimEnd().endsWith('Daniyal Bukhari'));
});

test('firstCity keeps one city out of a multi-office posting', () => {
  assert.equal(firstCity('Karlsruhe , Berlin , Hamburg , München'), 'Karlsruhe');
  assert.equal(firstCity('Berlin (hybrid)'), 'Berlin');
  assert.equal(firstCity('Munich and Frankfurt'), 'Munich');
  assert.equal(firstCity(''), '');
  assert.equal(firstCity(null), '');
});

test('firstCity drops a value too long to be a city', () => {
  assert.equal(firstCity('a'.repeat(80)), '');
});

test('buildLetterModel keeps a German salutation out of an English letter', () => {
  const m = buildLetterModel({
    job: JOB,
    profile: PROFILE,
    body: 'Sehr geehrte Damen und Herren,\n\nEin Absatz.',
    language: 'en',
  });
  assert.equal(m.salutation, 'Dear Hiring Team,');
});

test('buildLetterModel keeps an English salutation out of a German letter', () => {
  const m = buildLetterModel({
    job: JOB,
    profile: PROFILE,
    body: 'Application for Backend Engineer\n\nDear Hiring Team,\n\nA paragraph.',
    language: 'de',
  });
  assert.equal(m.salutation, 'Sehr geehrte Damen und Herren,');
  assert.equal(m.subject, 'Bewerbung als Backend Engineer');
});

test('buildLetterModel trims the recipient city to one place', () => {
  const m = buildLetterModel({
    job: { title: 'Dev', company: 'Workwise GmbH', location: 'Karlsruhe , Berlin , Hamburg' },
    profile: PROFILE,
    body: 'x',
  });
  assert.equal(m.recipient.city, 'Karlsruhe');
});

test('firstCity rejects work arrangements and countries', () => {
  for (const v of ['Remote', 'remote', 'Hybrid', 'Home Office', 'bundesweit', 'Deutschland', 'Germany']) {
    assert.equal(firstCity(v), '', `${v} must not become an address line`);
  }
  assert.equal(firstCity('Remote, Berlin'), '', 'first segment decides');
  assert.equal(firstCity('Berlin, Remote'), 'Berlin');
});

test('buildLetterModel leaves the city out when the posting only says Remote', () => {
  const m = buildLetterModel({
    job: { title: 'Dev', company: 'x1F GmbH', location: 'Remote' },
    profile: PROFILE,
    body: 'x',
  });
  assert.deepEqual(m.recipient, { company: 'x1F GmbH', city: '' });
});
