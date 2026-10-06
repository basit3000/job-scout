import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceIndex, validateInterview, createEml, createGmailDraft } from './preparation-extras.mjs';
test('interview examples expose exact confirmed evidence and reject invented citations', () => {
  const evidence = evidenceIndex({ experience: [{ bullets: ['Built a fictional service.'] }] });
  const output = { questions: ['How would you test it?'], knowledgeGaps: ['Prepare scaling concepts'], employerQuestions: ['How is success measured?'], examples: [{ evidenceId: evidence[0].id, preparationQuestion: 'Explain your contribution' }] };
  const result = validateInterview(output, evidence); assert.equal(result.examples[0].supportedQuote, 'Built a fictional service.');
  assert.throws(() => validateInterview({ ...output, examples: [{ evidenceId: 'invented', preparationQuestion: 'Invent a story' }] }, evidence), /missing/);
});
test('EML keeps missing recipients blank, includes exact attachments and Gmail creates drafts only', async () => {
  const eml = createEml({ recipient: '', subject: 'Fictional application', body: 'Please review my application.' }, [{ filename: 'CV.pdf', bytes: Buffer.from('fictional-pdf') }]);
  assert.match(eml, /To: \r\n/); assert.match(eml, /X-Unsent: 1/); assert.match(eml, /ZmljdGlvbmFsLXBkZg==/);
  assert.throws(() => createEml({ recipient: 'a@example.org\r\nBcc: b@example.org', subject: 'x', body: 'x' }, []), /headers/);
  await assert.rejects(createGmailDraft(eml, { token: '', consent: true }), /configured/);
  let calls = 0;
  await createGmailDraft(eml, { token: 'fictional-test-token', consent: true, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'); assert.equal(options.method, 'POST'); assert.ok(JSON.parse(options.body).message.raw); return Response.json({ id: 'fixture-draft' });
  } }); assert.equal(calls, 1);
});
