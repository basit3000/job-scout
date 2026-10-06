import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { findBrowser } from '../lib/pdf.mjs';
import { previewMemory } from '../lib/memory.mjs';
import { importResumeContent } from '../lib/resume-import.mjs';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';

test('fictional demo: structured Memory, import proposals, editing, discovery and email review', { timeout: 60000 }, async t => {
  const root = resolve('web/public');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture');
    const path = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(path)] || 'text/plain'); res.end(await readFile(path)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ executablePath: await findBrowser(), headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } }); page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let memory = { schemaVersion: 1, revision: 1, facts: { name: 'Fictional Candidate', targetRole: 'Backend Engineer', links: { email: 'candidate@example.org' }, skills: { strong: ['Python', 'SQL'] }, experience: [], education: [] }, preferences: {}, answers: { needsSponsorship: '' } };
  let schedules = [], confirmed = 0, imported = 0, emailExports = 0;
  const templates = [{ id: 'default', name: 'Current CV format' }];
  const job = { id: 'fictional-job', company: 'Example Workshop', title: 'Backend Engineer', location: 'London', url: 'https://jobs.example.org/fictional', ageDays: 5, postedAtApproximate: true,
    applicants: { count: 25, relation: 'less-than', label: 'Under 25 applicants', source: 'linkedin', observedAt: '2026-10-06T12:00:00Z' },
    fit: { verdict: 'Worth a shot', score: 60, opportunity: { bonus: 7, reasons: ['Posted about 5 days ago', 'Low reported applicant count'] } } };
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const body = req.postData() ? req.postDataJSON() : {};
    let data = {};
    switch (url.pathname) {
      case '/api/status': data = { candidate: memory.facts.name, marketId: 'GB', setup: { needsSetup: false }, cv: { source: 'local' }, sheets: { configured: false }, fetchRunning: false, prepRunning: false }; break;
      case '/api/markets': data = { markets: [{ id: 'GB', name: 'United Kingdom' }] }; break;
      case '/api/jobs': data = { jobs: [job], pagination: { page: 1, pages: 1, total: 1, pageSize: 20 } }; break;
      case '/api/memory':
        if (req.method() === 'PUT') { assert.equal(previewMemory(memory, body).confirmation, body.confirmation); memory = { ...memory, facts: body.facts, preferences: body.preferences, answers: body.answers, revision: memory.revision + 1 }; confirmed++; }
        data = { memory }; break;
      case '/api/memory/preview': { const p = previewMemory(memory, body); data = { ...p, before: memory, after: p.proposed }; break; }
      case '/api/memory/import': imported++; data = await importResumeContent(body, memory); break;
      case '/api/cv-templates': data = { templates }; break;
      case '/api/document-editor': data = req.method() === 'GET' ? { base: 'fictional-fingerprint', text: '# Fictional Candidate\n\n## Skills\nPython, SQL\n' } : { text: '# Fictional Candidate\n\n## Skills\nPython, SQL\n', html: '<h1>Fictional Candidate</h1><p>Python, SQL</p>', changes: { added: ['Suggested wording'], removed: [] }, message: 'Fixture preview: no model call' }; break;
      case '/api/discovery':
        if (body.schedule) schedules = [{ ...body.schedule, id: 'fixture-schedule', status: 'scheduled', nextRun: '2026-10-07T09:00:00Z' }];
        data = { schedules, notifications: [], externalEnabled: false }; break;
      case '/api/semantic-search': data = { mode: 'deterministic', reason: 'Local embeddings unavailable; deterministic fallback.', results: [{ job, fit: { verdict: 'Worth a shot', gaps: ['Sponsorship unknown'] }, similarity: null }] }; break;
      case '/api/application-email':
        if (body.action === 'export') { emailExports++; data = { eml: 'X-Unsent: 1\r\nTo: \r\nSubject: Fixture\r\n\r\nDraft only' }; }
        else data = { draft: { recipient: '', subject: 'Application: Backend Engineer', body: 'Please find my reviewed CV attached.' }, attachments: [{ filename: 'CV.pdf', hash: 'fictional-version', size: 123 }], confirmation: 'fixture-confirmation', gmailConfigured: false }; break;
      case '/api/fetch/stream': return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
      case '/api/tracker': data = { items: [], counts: {} }; break;
      case '/api/ready': data = { jobs: [], total: 0 }; break;
      case '/api/digest': data = { newJobs: [], candidates: [], count: 0 }; break;
      case '/api/saved-answers': data = { answers: {} }; break;
      case '/api/boards': data = { boards: [], enabled: [] }; break;
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await mkdir(resolve('.workspace/demo'), { recursive: true });
  await page.goto(base);
  await page.waitForSelector('.job .job-facts');
  assert.match(await page.locator('.job .job-facts').first().textContent(), /Posted about 5d ago/);
  assert.match(await page.locator('.job .job-facts').first().textContent(), /Under 25 applicants/);
  assert.match(await page.getByText('Opportunity +7', { exact: true }).first().getAttribute('title'), /not views/);
  await page.getByRole('tab', { name: 'Memory', exact: true }).click();
  await page.getByRole('button', { name: 'Add experience', exact: true }).click();
  const entry = page.getByRole('button', { name: 'Add experience', exact: true }).locator('..').locator('fieldset').last();
  await entry.locator('input').first().fill('Fictional role');
  assert.equal(await entry.locator('input').count(), 4);
  await entry.getByRole('button', { name: 'Remove entry' }).click();
  await page.locator('#memoryStructured > fieldset').first().locator('label > input').first().fill('Fictional Demo Candidate');
  await page.locator('#memoryPreviewBtn').click(); await page.locator('#memoryConfirm').click();
  await page.waitForFunction(() => document.querySelector('#memoryMessage').textContent.includes('Saved revision'));
  assert.equal(confirmed, 1); assert.equal(memory.facts.name, 'Fictional Demo Candidate'); assert.equal(memory.answers.needsSponsorship, '');
  await page.locator('#memoryImport').setInputFiles({ name: 'fictional.pdf', mimeType: 'application/pdf', buffer: pdfFixture(['Fictional Resume candidate@example.org Experience dates unknown.']) });
  await page.waitForSelector('#memoryImportProposals summary'); assert.equal(imported, 1); assert.equal(confirmed, 1);
  await page.locator('#viewMemory h2').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve('.workspace/demo/memory.png') });
  await page.locator('#openDiscovery').click(); await page.locator('#scheduleZone').fill('Europe/London'); await page.locator('#scheduleCreate').click();
  await page.waitForSelector('#scheduleList button'); assert.equal(schedules[0].allowPaid, false);
  await page.locator('#semanticQuery').fill('Reliable backend services'); await page.locator('#semanticSearch').click(); await page.waitForSelector('#semanticResults p');
  await page.screenshot({ path: resolve('.workspace/demo/discovery.png') }); await page.locator('#discoveryClose').click();
  await page.evaluate(async job => { (await import('/document-editor.js')).openDocumentEditor(job); }, job);
  await page.waitForSelector('#editTemplate option', { state: 'attached' }); await page.locator('#editLoad').click(); await page.waitForFunction(() => document.querySelector('#editText').value.includes('Fictional')); await page.locator('#editText').fill('# Fictional Candidate\n\n## Skills\nPython and SQL\n');
  await page.locator('#editPropose').click(); await page.waitForSelector('#editReject:not([hidden])'); await page.locator('#editReject').click();
  assert.match(await page.locator('#editText').inputValue(), /Python and SQL/);
  await page.locator('#editPreview').click(); await page.waitForFunction(() => document.querySelector('#editFrame').srcdoc.includes('Fictional'));
  await page.screenshot({ path: resolve('.workspace/demo/document-edit.png') }); await page.locator('#editClose').click();
  assert.equal(await page.locator('#editClose').count(), 0);
  await page.evaluate(async job => { (await import('/preparation-extras.js')).openPreparationExtras(job); }, job);
  await page.waitForSelector('#extraTemplate option', { state: 'attached' }); await page.locator('#emailLoad').click(); await page.waitForFunction(() => document.querySelector('#emailSubject').value.length > 0);
  await page.locator('#emailExport').click(); assert.equal(emailExports, 0);
  await page.locator('#emailReviewed').check(); const download = page.waitForEvent('download'); await page.locator('#emailExport').click(); await download;
  assert.equal(emailExports, 1); assert.equal(await page.locator('#emailGmail').isDisabled(), true);
  await page.screenshot({ path: resolve('.workspace/demo/email.png') }); assert.deepEqual(errors, []);
});
