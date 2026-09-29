import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';
import { inspectAtsPdf } from '../lib/ats-check.mjs';

// Full UI with synthetic jobs and controlled events: never contacts a job board,
// candidate store or AI provider. Run with: npm run test:activity
test('activity remains visible and actionable through search and Prep lifecycles', { timeout: 90000 }, async (t) => {
  const root = resolve('web/public');
  const server = createServer(async (req, res) => {
    const path = resolve(root, '.' + (new URL(req.url, 'http://local').pathname === '/' ? '/index.html' : new URL(req.url, 'http://local').pathname));
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(path);
      res.setHeader('content-type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(path)] || 'text/plain');
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const browser = await chromium.launch({ channel: process.env.JOB_SCOUT_TEST_BROWSER || 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const jobs = Array.from({ length: 10 }, (_, index) => ({ id: `demo-${index}`, title: 'Software Developer', company: `Example Company ${index + 1}`, location: 'Berlin', description: 'Build useful software.', ageDays: 1 }));
  const pagination = { page: 1, pages: 1, pageSize: 10, total: jobs.length };
  const status = { marketId: 'DE', setup: { needsSetup: false }, cv: { source: 'local' }, sheets: { configured: false }, fetchRunning: false, prepRunning: false, digestNewCount: 0 };
  let failSearch = false;
  let prepStartedAt;
  let searches = 0;
  let personalCvOptions = false;
  let templates = [{ id: 'default', name: 'Current CV format' }];
  const prepRequests = [];
  const unexpected = [];
  const posts = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') posts.push(path);
    let data;
    let code = 200;
    if (path === '/api/status' || path === '/api/settings') data = status;
    else if (path === '/api/markets') data = { markets: [{ id: 'DE', name: 'Germany' }] };
    else if (path === '/api/jobs') data = { jobs, pagination };
    else if (path.startsWith('/api/jobs/')) data = { job: jobs[0] };
    else if (path === '/api/tracker') data = { items: [], counts: {} };
    else if (path === '/api/digest') data = { newJobs: jobs, candidates: jobs, pagination, count: 10 };
    else if (path === '/api/ready') data = { jobs, pagination, total: 10 };
    else if (path === '/api/run-history') data = {};
    else if (path === '/api/goose') data = { templates, status: { ok: true, detail: 'Ready' }, cvSource: status.cv.source, cvPreferences: personalCvOptions ? { enabled: true, allowExperienceSelection: true, summaryWhenHelpful: true, allowFillerWhenUseful: true } : {}, tools: [{ name: 'prepare_cv', label: 'Prepare CV', description: 'Prepare documents' }] };
    else if (path === '/api/ats-check') {
      const body = request.postDataJSON();
      data = await inspectAtsPdf(Buffer.from(body.pdf, 'base64'), body.keywords);
    }
    else if (path === '/api/fetch') {
      searches++;
      if (failSearch) { code = 500; data = { error: 'Search provider unavailable' }; }
      else { status.fetchRunning = true; status.fetchStartedAt = new Date().toISOString(); data = { startedAt: status.fetchStartedAt }; }
    } else if (path === '/api/fetch/stop' || path === '/api/prep/stop') data = { ok: true };
    else if (path === '/api/prep') {
      prepRequests.push(request.postDataJSON());
      prepStartedAt = new Date().toISOString(); status.prepStartedAt = prepStartedAt; status.prepJobId = jobs[0].id; status.prepRunning = true;
      data = { startedAt: prepStartedAt, jobId: jobs[0].id };
    } else { unexpected.push(path); data = {}; }
    await route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.addInitScript(() => {
    window.testStreams = [];
    window.EventSource = class extends EventTarget {
      static CLOSED = 2;
      constructor(url) { super(); this.url = url; this.readyState = 1; window.testStreams.push(this); }
      close() { this.readyState = 2; }
    };
  });
  const emit = (url, type, data) => page.evaluate(({ url, type, data }) => {
    const stream = window.testStreams.findLast((s) => s.url === url && s.readyState !== 2);
    if (!stream) throw new Error(`Missing stream: ${url}`);
    stream.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }, { url, type, data });
  const textIs = (selector, text) => page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent.includes(text), { selector, text });
  const waitReady = () => page.waitForFunction(() => !document.getElementById('runBtn').disabled);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await waitReady();
  await page.locator('#jobList .job').first().waitFor();
  assert.equal(await page.locator('#logPanel').count(), 0);

  await t.test('sticky search, tab navigation, completion, dismissal and focus', async () => {
    await page.locator('#runBtn').click();
    await textIs('#activityTitle', 'Searching job boards');
    await page.evaluate(() => window.scrollTo(0, 1200));
    const bounds = await page.locator('#activityStrip').boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y < 20, 'activity sticks at the viewport top');
    await page.locator('#activityOpenBtn').click();
    await page.locator('#activityDrawer[open]').waitFor();
    assert.equal(await page.locator('#technicalLogs').getAttribute('open'), null);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'activityOpenBtn');
    await page.locator('[data-view="tracker"]').click();
    assert.equal(await page.locator('#activityStrip').isVisible(), true);
    status.fetchRunning = false; status.digestNewCount = 10;
    await emit('/api/fetch/stream', 'done', { code: 0, startedAt: status.fetchStartedAt, durationMs: 2300 });
    await textIs('#activityTitle', 'Search complete');
    await textIs('#activityMessage', '10 new matches');
    await page.locator('#activityActions').getByRole('button', { name: 'View matches' }).click();
    await page.locator('#viewDigest:not([hidden])').waitFor();
    await page.locator('#activityActions').getByRole('button', { name: 'Dismiss' }).click();
    await textIs('#activityMessage', 'Search and document progress');
  });

  await t.test('failure stays visible, retry and cancellation use real controls', async () => {
    failSearch = true;
    await page.locator('#runBtn').click();
    await textIs('#activityTitle', 'Search could not start');
    await page.locator('[data-view="tracker"]').click();
    await textIs('#activityMessage', 'Search provider unavailable');
    failSearch = false;
    await page.locator('#activityActions').getByRole('button', { name: 'Try search again' }).click();
    await textIs('#activityTitle', 'Searching job boards');
    await page.locator('#activityActions').getByRole('button', { name: 'Stop', exact: true }).click();
    await textIs('#activityMessage', 'Stop requested');
    assert.ok(posts.includes('/api/fetch/stop'));
    status.fetchRunning = false;
    await emit('/api/fetch/stream', 'done', { code: null, stopped: true, startedAt: status.fetchStartedAt });
    await textIs('#activityTitle', 'Search stopped');
    await page.locator('#activityActions').getByRole('button', { name: 'Dismiss' }).click();
  });

  await t.test('Prep has inline status, persistent failure, and separate result panel', async () => {
    await page.locator('[data-view="results"]').click();
    await page.locator('#jobList [data-prep]').first().click();
    await page.locator('#prepModalRecreate').click();
    await textIs('#activityTitle', 'Preparing documents');
    await textIs('#jobList [data-prep-status]', 'Preparing documents');
    assert.equal(await page.locator('#jobList [data-prep]').first().isDisabled(), true);
    await emit('/api/prep/stream', 'log', { line: 'Working on documents', stream: 'stderr' });
    assert.equal(await page.locator('#activityStrip').getAttribute('data-state'), 'running', 'stderr alone is not a failed run');
    status.prepRunning = false;
    await emit('/api/prep/stream', 'done', { ok: false, startedAt: prepStartedAt, error: 'Review could not finish' });
    await textIs('#activityTitle', 'Preparation failed');
    await textIs('#jobList [data-prep-status]', 'Review could not finish');
    await page.locator('#activityActions').getByRole('button', { name: 'Try Prep again' }).click();
    await page.locator('#prepModalRecreate').click();
    await textIs('#activityTitle', 'Preparing documents');
    status.prepRunning = false;
    await emit('/api/prep/stream', 'done', { ok: true, startedAt: prepStartedAt, workflow: { status: 'completed', calls: [], summary: 'Documents reviewed.', auditPath: 'demo/run.json' }, pack: { jobId: jobs[0].id, relativeDir: 'Example Company', hasPdf: true } });
    await textIs('#activityTitle', 'Preparation complete');
    assert.equal(await page.locator('#prepResultsDialog').getAttribute('open'), null, 'completion does not steal focus');
    await page.locator('#activityActions').getByRole('button', { name: 'View results' }).click();
    await page.locator('#prepResultsDialog[open]').waitFor();
    await textIs('#prepView', 'Documents reviewed.');
    await page.locator('#backToLog').click();
    await page.locator('#activityDrawer[open]').waitFor();
    assert.equal(await page.locator('#prepResultsDialog').getAttribute('open'), null);
    await page.locator('#technicalLogs summary').click();
    await textIs('#logView', 'Working on documents');
    await page.keyboard.press('Escape');
  });

  await t.test('reloading reconnects Prep and mobile drawer fits the viewport', async () => {
    status.prepRunning = true; status.prepStartedAt = new Date().toISOString(); prepStartedAt = status.prepStartedAt;
    await page.reload();
    await textIs('#activityTitle', 'Preparing documents');
    await page.waitForFunction(() => window.testStreams.some((s) => s.url === '/api/prep/stream'));
    await emit('/api/prep/stream', 'status', { running: true, startedAt: prepStartedAt });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#activityOpenBtn').click();
    const bounds = await page.locator('#activityDrawer').boundingBox();
    assert.equal(bounds.width, 390);
    assert.equal(bounds.x, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mkdir(resolve('.workspace/activity-ui'), { recursive: true });
    await page.screenshot({ path: resolve('.workspace/activity-ui/mobile.png') });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.screenshot({ path: resolve('.workspace/activity-ui/desktop.png') });
    status.prepRunning = false;
    await emit('/api/prep/stream', 'done', { ok: false, cancelled: true, startedAt: prepStartedAt, error: 'Cancelled' });
    await textIs('#activityTitle', 'Preparation stopped');
  });
  await t.test('a missed completion is recovered from the search stream snapshot', async () => {
    await page.locator('#runBtn').click();
    await textIs('#activityTitle', 'Searching job boards');
    await page.evaluate(() => window.testStreams.find((s) => s.url === '/api/fetch/stream').onerror());
    await textIs('#activityMessage', 'Reconnecting');
    status.fetchRunning = false;
    await emit('/api/fetch/stream', 'status', { running: false, startedAt: status.fetchStartedAt, lastCode: 0, lastDurationMs: 2000 });
    await textIs('#activityTitle', 'Search complete');
    await waitReady();
  });

  await t.test('batch counts, inline states and failed items survive tab changes', async () => {
    status.prepStartedAt = null;
    status.batch = { startedAt: new Date().toISOString(), running: true, total: 3, finished: 1, counts: { done: 1, running: 1, pending: 1 }, current: jobs[1] };
    await page.reload();
    await textIs('#activityTitle', 'Preparing documents in batch');
    await page.waitForFunction(() => window.testStreams.some((s) => s.url === '/api/prep/batch/stream'));
    await emit('/api/prep/batch/stream', 'status', { ...status.batch, items: jobs.slice(0, 3).map((job, i) => ({ ...job, status: ['done', 'running', 'pending'][i] })) });
    await textIs('#activityMessage', '1 of 3 jobs processed');
    await page.locator('#activityActions').getByRole('button', { name: 'Details' }).click();
    await page.locator('#batchModal:not([hidden])').waitFor();
    assert.equal(await page.locator('#batchProgressFill').evaluate((el) => el.style.width), '33%');
    await page.locator('#batchClose').click();
    await page.locator('[data-view="tracker"]').click();
    status.batch = { ...status.batch, running: false, finished: 3, finishedAt: new Date().toISOString(), counts: { done: 2, failed: 1 }, current: null };
    await emit('/api/prep/batch/stream', 'done', { ...status.batch, items: jobs.slice(0, 3).map((job, i) => ({ ...job, status: i === 1 ? 'failed' : 'done', error: i === 1 ? 'Review needs attention' : null })) });
    await textIs('#activityTitle', 'Batch preparation needs attention');
    await page.locator('#activityActions').getByRole('button', { name: 'Review batch' }).click();
    await textIs('#batchProgressList', 'Review needs attention');
    await page.locator('#batchClose').click();
    await page.locator('[data-view="results"]').click();
    await textIs('[data-prep-job="demo-1"] [data-prep-status]', 'Preparation failed');
    await page.locator('#activityActions').getByRole('button', { name: 'Dismiss' }).click();
    await page.locator('[data-view="tracker"]').click();
    await textIs('#activityMessage', 'Search and document progress');
  });
  assert.equal(searches, 4);
  await t.test('every user chooses one or several formats and selection reaches Prep', async () => {
    templates.push({ id: 'compact', name: 'Compact resume', maxPages: 1, sectionOrder: ['Education', 'Experience'], layout: { font: 'Arial', bodyPt: 9 } });
    await page.locator('[data-view="results"]').click();
    await page.locator('#jobList [data-prep]').first().click();
    await page.locator('#cvTemplates').waitFor();
    assert.equal(await page.locator('#personalCvOptions').isVisible(), false);
    assert.equal(await page.locator('#prepModalRecreate').isDisabled(), true);
    await page.locator('#cvTemplateChoices input[value="compact"]').check();
    assert.equal(await page.locator('#prepModalRecreate').isEnabled(), true);
    await page.locator('#cvTemplateChoices input[value="default"]').check();
    await mkdir(resolve('.workspace/cv-ui'), { recursive: true });
    await page.screenshot({ path: resolve('.workspace/cv-ui/template-selector.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve('.workspace/cv-ui/template-selector-mobile.png') });
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.locator('#prepModalRecreate').click();
    await textIs('#activityTitle', 'Preparing documents');
    assert.deepEqual(prepRequests.at(-1).templateIds, ['default', 'compact']);
    status.prepRunning = false;
    await emit('/api/prep/stream', 'done', { ok: false, cancelled: true, startedAt: prepStartedAt, error: 'Synthetic run stopped' });
    await textIs('#activityTitle', 'Preparation stopped');
    await page.locator('#jobList [data-prep]').first().click();
    await page.locator('#cvTemplates').waitFor();
    assert.equal(await page.locator('#cvTemplateChoices input:checked').count(), 0);
    await page.locator('#prepModalCancel').click();
    templates = templates.slice(0, 1);
  });
  await t.test('personal choices are hidden by default and submitted independently for one application', async () => {
    await page.locator('[data-view="results"]').click();
    await page.locator('#jobList [data-prep]').first().click();
    await page.waitForFunction(() => document.getElementById('gooseOptions').dataset.ready === 'true');
    assert.equal(await page.locator('#personalCvOptions').isVisible(), false);
    assert.equal(await page.locator('#overleafPushOptions').isVisible(), false);
    await page.locator('#prepModalCancel').click();
    personalCvOptions = true;
    await page.locator('#jobList [data-prep]').first().click();
    await page.locator('#personalCvOptions').waitFor();
    assert.equal(await page.locator('#cvMatchHeadline').isChecked(), false);
    await page.locator('#cvMatchHeadline').check();
    await page.locator('#cvMatchKeywords').check();
    await page.locator('#cvEquivalentRole').check();
    await page.locator('#cvUseJobCity').click();
    assert.equal(await page.locator('#cvPreferredCity').inputValue(), 'Berlin');
    await mkdir(resolve('.workspace/cv-ui'), { recursive: true });
    await page.screenshot({ path: resolve('.workspace/cv-ui/options.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve('.workspace/cv-ui/options-mobile.png') });
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.locator('#prepModalRecreate').click();
    await textIs('#activityTitle', 'Preparing documents');
    assert.deepEqual(prepRequests.at(-1).cvOptions, { matchHeadline: true, matchKeywords: true, equivalentRoleTitle: true, city: 'Berlin' });
    status.prepRunning = false;
    await emit('/api/prep/stream', 'done', { ok: false, cancelled: true, startedAt: prepStartedAt, error: 'Synthetic run stopped' });
    await textIs('#activityTitle', 'Preparation stopped');
    await page.locator('#jobList [data-prep]').first().click();
    await page.locator('#personalCvOptions').waitFor();
    assert.equal(await page.locator('#cvMatchHeadline').isChecked(), false);
    assert.equal(await page.locator('#cvPreferredCity').inputValue(), '');
    await page.locator('#prepModalCancel').click();
  });
  await t.test('Overleaf recreation submits an explicit push choice and resets it each time', async () => {
    status.cv.source = 'overleaf';
    status.prepStartedAt = null;
    status.batch = null;
    jobs[0].tailoredCv = true;
    await page.reload();
    await page.locator('#jobList [data-prep]').first().click();
    await page.locator('#overleafPushOptions').waitFor();
    await textIs('#prepModalRecreate', 'Recreate CV');
    assert.equal(await page.locator('#pushToOverleaf').isChecked(), false);
    await page.locator('#pushToOverleaf').check();
    await page.locator('#gooseTools input[value="prepare_cv"]').uncheck();
    assert.equal(await page.locator('#overleafPushOptions').isVisible(), false);
    await page.locator('#gooseTools input[value="prepare_cv"]').check();
    assert.equal(await page.locator('#pushToOverleaf').isChecked(), false);
    await page.locator('#pushToOverleaf').check();
    await page.screenshot({ path: resolve('.workspace/cv-ui/overleaf-recreate.png') });
    await page.locator('#prepModalRecreate').click();
    await textIs('#activityTitle', 'Preparing documents');
    assert.equal(prepRequests.at(-1).pushToOverleaf, true);
    status.prepRunning = false;
    await emit('/api/prep/stream', 'done', { ok: false, cancelled: true, startedAt: prepStartedAt, error: 'Synthetic run stopped' });
    await textIs('#activityTitle', 'Preparation stopped');
    await page.locator('#jobList [data-prep]').first().click();
    await page.locator('#overleafPushOptions').waitFor();
    assert.equal(await page.locator('#pushToOverleaf').isChecked(), false);
    await page.locator('#prepModalCancel').click();
  });
  await t.test('a cancelled dialog cannot overwrite a later job when its request finishes late', async () => {
    const results = await page.evaluate(async () => {
      const { openPrepModal } = await import('/prep-modal.js');
      const states = [];
      for (const fails of [false, true]) {
        let resolveOld, rejectOld;
        const oldRequest = new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
        const oldDialog = openPrepModal({ title: 'Previous job' }, { api: () => oldRequest });
        document.getElementById('prepModalCancel').click();
        const currentState = { templates: [{ id: 'default', name: 'Current CV format' }], cvSource: 'local', status: { ok: true, detail: 'Current job ready' },
          tools: [{ name: 'prepare_cv', label: 'Prepare CV', description: 'Current job' }] };
        const currentDialog = openPrepModal({ title: 'Current job' }, { api: async () => currentState });
        await Promise.resolve();
        if (fails) rejectOld(new Error('Previous request failed'));
        else resolveOld({ ...currentState, cvSource: 'overleaf', status: { ok: false, detail: 'Previous job unavailable' } });
        await Promise.resolve(); await Promise.resolve();
        states.push({ status: document.getElementById('gooseStatus').textContent,
          pushHidden: document.getElementById('overleafPushOptions').hidden,
          disabled: document.getElementById('prepModalRecreate').disabled });
        document.getElementById('prepModalCancel').click();
        await Promise.all([oldDialog, currentDialog]);
      }
      return states;
    });
    for (const state of results) assert.deepEqual(state, { status: 'Current job ready', pushHidden: true, disabled: false });
  });
  await t.test('ATS button reads a selected PDF independently of generation', async () => {
    const before = prepRequests.length;
    await page.locator('#openAtsCheck').click();
    await page.locator('#atsPdf').setInputFiles({ name: 'example.pdf', mimeType: 'application/pdf', buffer: pdfFixture(['Example Candidate example@example.com Experience Education Projects Skills Python Docker']) });
    await page.locator('#atsKeywords').fill('Python, Java');
    await page.locator('#runAtsCheck').click();
    await textIs('#atsCheckStatus', '1 page');
    await textIs('#atsCheckResults', 'Python: found');
    await textIs('#atsCheckResults', 'Java: not found');
    await page.locator('#atsCheckResults summary').click();
    await textIs('#atsCheckResults pre', 'Example Candidate');
    await page.screenshot({ path: resolve('.workspace/cv-ui/ats-check.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve('.workspace/cv-ui/ats-mobile.png') });
    await page.locator('#closeAtsCheck').click();
    assert.equal(prepRequests.length, before);
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
});
