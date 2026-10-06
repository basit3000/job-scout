import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeResumeContent, importResumeContent } from './resume-import.mjs';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';
import { documentChanges, validateDocumentEdit } from './document-edit.mjs';
import { Document, Packer, Paragraph } from 'docx';

test('resume import proposes conflicts without mutating confirmed memory or inferring dates', async () => {
  const memory = { facts: { links: { email: 'confirmed@example.org' } }, answers: {} };
  const before = structuredClone(memory);
  const text = 'Fictional Candidate\nproposed@example.org\nEngineer — Example Employer. Dates unknown.';
  const proposals = proposeResumeContent(text, memory);
  assert.equal(proposals.find(p => p.path === 'facts.links.email').conflict, true);
  assert.equal(proposals[0].uncertain, true); assert.deepEqual(memory, before);
  assert.equal(proposals.some(p => /experience|sponsorship|salary/.test(p.path)), false);
  const imported = await importResumeContent({ filename: 'fictional.pdf', base64: pdfFixture([text]).toString('base64') }, memory);
  assert.ok(imported.proposals.length); assert.deepEqual(memory, before);
  assert.throws(() => proposeResumeContent('', memory), /readable/);
});
test('document change previews expose removed and added content', () => {
  assert.deepEqual(documentChanges('Original\nRetained', 'Changed\nRetained'), { removed: ['Original'], added: ['Changed'] });
  assert.throws(() => validateDocumentEdit(''), /Document/);
});
test('DOCX content import uses real local extraction without adding inferred fields', async () => {
  const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Fictional Candidate'), new Paragraph('candidate@example.org'), new Paragraph('Work dates and sponsorship are unknown.')] }] }));
  const imported = await importResumeContent({ filename: 'fictional.docx', base64: bytes.toString('base64') }, { facts: {}, answers: {} });
  assert.match(imported.text, /Work dates/); assert.equal(imported.proposals.length, 2);
});
