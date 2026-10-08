import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { findBrowser } from '../lib/pdf.mjs';

test('connection UI requires selection, preview and confirmation on desktop and mobile', { timeout: 60000 }, async t => {
  const root = resolve('web/public');
  const server = createServer(async (req, res) => {
    const file = resolve(root, '.' + new URL(req.url, 'http://fixture').pathname);
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/plain');
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const browser = await chromium.launch({ executablePath: await findBrowser(), headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  let paired = false, confirmed = 0, previewed = 0;
  const status = () => ({ configured: true, origin: 'https://tracker.example.com', paired, optionalFields: ['note'], pending: 0, issues: [],
    local: [{ id: 'fictional-local', title: '<img src=x onerror=alert(1)>', company: 'Example Workshop', status: 'applied' }],
    remote: [{ id: 'fictional-cloud', title: 'Online role', company: 'Example Cloud', status: 'interviewing', version: 2 }] });
  await page.route('**/api/cloud-tracker**', async route => {
    const path = new URL(route.request().url()).pathname, body = route.request().postDataJSON();
    let data = status();
    if (path.endsWith('/pair')) data = { userCode: 'ABCD-EFGH', approvalUrl: 'https://tracker.example.com/integrations' };
    if (path.endsWith('/redeem')) { paired = true; data = status(); }
    if (path.endsWith('/preview')) {
      assert.deepEqual(body.ids, ['fictional-local']); assert.deepEqual(body.selectedOptional, ['note']); previewed++;
      data = { id: 'preview-fixture', direction: 'push', items: [{ localId: 'fictional-local', current: null,
        mutation: { fields: { title: 'Fictional role', company: 'Example Workshop', status: 'applied', note: 'Fictional selected note', appliedDate: null } } }] };
    }
    if (path.endsWith('/confirm')) { assert.equal(body.previewId, 'preview-fixture'); confirmed++; }
    await route.fulfill({ json: data });
  });
  await page.goto(base + '/cloud-tracker.html');
  await page.waitForFunction(() => document.getElementById('feedback').textContent === 'Choose applications to connect.');
  assert.equal(await page.locator('#pushPreview').isDisabled(), true);
  await page.locator('#pairButton').click(); await page.locator('#pairing a').waitFor();
  assert.equal(await page.locator('#pairing a').getAttribute('href'), 'https://tracker.example.com/integrations');
  await page.locator('#redeem').click();
  await page.waitForFunction(() => !document.getElementById('pushPreview').disabled);
  await page.locator('#localList input').check(); await page.locator('#optional input').check();
  await page.locator('#pushPreview').click(); await page.locator('#previewSection').waitFor();
  assert.equal(previewed, 1); assert.equal(confirmed, 0);
  assert.equal(await page.locator('#localList img').count(), 0);
  assert.match(await page.locator('#previewItems').innerText(), /Fictional selected note/);
  await mkdir('.workspace/tests', { recursive: true });
  await page.screenshot({ path: '.workspace/tests/cloud-tracker-desktop.png', fullPage: true });
  await page.locator('#confirm').click();
  await page.waitForFunction(() => document.getElementById('previewSection').hidden);
  assert.equal(confirmed, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '.workspace/tests/cloud-tracker-mobile.png', fullPage: true });
  await page.evaluate(async () => {
    const { openApplicationEditor } = await import('/application-editor.js');
    openApplicationEditor({ id: 'fictional-import', company: 'Example', title: 'Imported role', decision: 'applied',
      cloudImport: { deletedAt: '2026-10-08T12:00:00Z' },
      statusHistory: [{ to: 'applied', at: null, recordedAt: '2026-10-08T12:00:00Z' }] }, { api: async () => {}, onSaved() {} });
  });
  assert.match(await page.locator('.application-history').innerText(), /Occurrence time unknown.*recorded/s);
  assert.ok(!(await page.locator('.application-history').innerText()).includes('1970'));
  assert.match(await page.locator('dialog').innerText(), /Deleted in the connected Job Tracker/);
  assert.deepEqual(errors, []);
});
