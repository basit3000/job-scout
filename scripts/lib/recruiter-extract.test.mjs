import assert from 'node:assert/strict';
import test from 'node:test';
import {
  companyKey,
  extractEmails,
  extractLinkedInUrls,
  extractRecruiterHints,
  extractRecruiterNames,
  isGenericEmail,
  normalizeEmail,
  normalizeLinkedIn,
  parseRecruiterAgentJson,
} from './recruiter-extract.mjs';
import { mergeContact, emptyContact } from './recruiter-contact.mjs';

test('normalizeEmail drops noreply, images, and board domains', () => {
  assert.equal(normalizeEmail('Jane.Doe@Acme.com'), 'jane.doe@acme.com');
  assert.equal(normalizeEmail('mailto:jobs@acme.com'), 'jobs@acme.com');
  assert.equal(normalizeEmail('noreply@acme.com'), null);
  assert.equal(normalizeEmail('photo@cdn.com.png'), null);
  assert.equal(normalizeEmail('x@linkedin.com'), null);
  assert.equal(normalizeEmail('a@indeedemail.com'), null);
});

test('generic vs person emails', () => {
  assert.equal(isGenericEmail('jobs@acme.com'), true);
  assert.equal(isGenericEmail('karriere@acme.de'), true);
  assert.equal(isGenericEmail('jane.doe@acme.com'), false);
  const emails = extractEmails('Write to jobs@acme.com or jane.doe@acme.com');
  assert.equal(emails[0].email, 'jane.doe@acme.com');
  assert.equal(emails[1].email, 'jobs@acme.com');
});

test('extracts labelled recruiter names and LinkedIn URLs', () => {
  const text = `
    Hiring Manager: Anna Schmidt
    Recruiter:  Equal Opportunity
    Apply via https://www.linkedin.com/in/anna-schmidt-talent/
    Reach out to Peter Klein
  `;
  const names = extractRecruiterNames(text);
  assert.ok(names.includes('Anna Schmidt'));
  assert.ok(names.includes('Peter Klein'));
  assert.equal(extractLinkedInUrls(text)[0], 'https://www.linkedin.com/in/anna-schmidt-talent');
  assert.equal(normalizeLinkedIn('linkedin.com/in/anna-schmidt-talent/'), 'https://www.linkedin.com/in/anna-schmidt-talent');
});

test('HTML mailto and greenhouse-style blob', () => {
  const html = `
    <a href="mailto:anna.schmidt@acme.de">Anna Schmidt</a>
    <a href="https://linkedin.com/in/anna-schmidt-talent">Anna Schmidt</a>
    <p>Talent Partner: Anna Schmidt</p>
  `;
  const hints = extractRecruiterHints(html, { kind: 'html', sourceUrl: 'https://jobs.example/1' });
  assert.equal(hints.emails[0].email, 'anna.schmidt@acme.de');
  assert.equal(hints.emails[0].name, 'Anna Schmidt');
  assert.ok(hints.linkedinUrls[0].includes('/in/anna-schmidt-talent'));
  assert.ok(hints.names.includes('Anna Schmidt'));
});

test('parseRecruiterAgentJson rejects invented emails', () => {
  const parsed = parseRecruiterAgentJson(`
    Here we go
    {"name":"Anna Schmidt","email":"guess@acme.com","linkedinUrl":"","invented":true,"sources":[]}
  `);
  assert.equal(parsed.name, 'Anna Schmidt');
  assert.equal(parsed.email, null);
  assert.equal(parsed.invented, true);
});

test('mergeContact prefers a person email over jobs@', () => {
  const first = mergeContact(emptyContact({ id: 'j1', company: 'Acme' }), {
    email: 'jobs@acme.com',
    name: 'Anna Schmidt',
  });
  assert.equal(first.genericEmail, true);
  const next = mergeContact(first, { email: 'anna.schmidt@acme.com' });
  assert.equal(next.email, 'anna.schmidt@acme.com');
  assert.equal(next.genericEmail, false);
  assert.equal(next.name, 'Anna Schmidt');
});

test('companyKey ignores legal suffixes', () => {
  assert.equal(companyKey('Acme GmbH'), companyKey('ACME'));
});
