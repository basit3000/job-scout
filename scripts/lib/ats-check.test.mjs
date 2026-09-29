import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectAtsPdf, MAX_ATS_PDF_BYTES } from './ats-check.mjs';
import { handleAtsApi } from '../../web/ats-routes.mjs';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';

test('standalone ATS inspection extracts the complete PDF and reports keyword presence without a fabricated score', async () => {
  const report = await inspectAtsPdf(pdfFixture(['Example Candidate example@example.com Experience Education Projects Skills JavaScript Docker']), ['Java', 'Docker']);
  assert.equal(report.pages, 1);
  assert.match(report.text, /Example Candidate/);
  assert.equal(report.status, 'clear');
  assert.deepEqual(report.keywords, [{ keyword: 'Java', found: false }, { keyword: 'Docker', found: true }]);
  assert.equal(report.score, undefined);
  assert.match(report.explanation, /not an employer ATS test/);
});

test('ATS check rejects invalid or excessive input and exposes missing text', async () => {
  await assert.rejects(inspectAtsPdf(Buffer.from('not PDF')), /not a PDF/);
  await assert.rejects(inspectAtsPdf(Buffer.alloc(MAX_ATS_PDF_BYTES + 1)), /10 MB/);
  await assert.rejects(inspectAtsPdf(pdfFixture(Array(11).fill('Text'))), /at most 10 pages/);
  await assert.rejects(inspectAtsPdf(pdfFixture(['Text']), Array(51).fill('SQL')), /50 keywords/);
  assert.equal((await inspectAtsPdf(pdfFixture(['']))).status, 'problems');
  const twoPages = await inspectAtsPdf(pdfFixture(['Experience', 'Education Projects Skills']));
  assert.equal(twoPages.pages, 2);
  assert.match(twoPages.text, /Skills/);
});

test('standalone ATS inspection accepts other section names and order', async () => {
  const report = await inspectAtsPdf(pdfFixture(['example@example.com Skills Employment Education Publications']));
  assert.equal(report.status, 'clear');
  assert.deepEqual(report.warnings, []);
});

test('ATS route operates without a job, memory or Goose and rejects cross-origin requests', async () => {
  const req = { method: 'POST', headers: { host: 'localhost:4040' } };
  let output;
  const deps = { json: (_res, status, body) => { output = { status, body }; },
    readBody: async () => ({ pdf: pdfFixture(['Experience Education Projects Skills example@example.com']).toString('base64') }) };
  assert.equal(await handleAtsApi(req, {}, new URL('http://localhost/api/ats-check'), deps), true);
  assert.equal(output.status, 200);
  assert.equal(output.body.pages, 1);
  await handleAtsApi({ ...req, headers: { ...req.headers, origin: 'https://example.com' } }, {}, new URL('http://localhost/api/ats-check'), deps);
  assert.equal(output.status, 403);
});
