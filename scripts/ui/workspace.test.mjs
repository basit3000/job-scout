import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { findBrowser } from '../lib/pdf.mjs';

test('every workspace page: navigation, paging, drafts, tools, empty states and responsive layouts', { timeout: 90000 }, async t => {
  const root = resolve('web/public');
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://fixture').pathname;
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/plain'); res.end(await readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done)); t.after(() => new Promise(done => server.close(done)));
  const browser = await chromium.launch({ executablePath: await findBrowser(), headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(5000);
  const errors = [], writes = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jobs = Array.from({ length: 73 }, (_, i) => ({ id: `fictional-${i + 1}`, title: `Software Engineer ${i + 1}`, company: `Example Company ${i + 1}`, location: 'Berlin, Germany', url: `https://example.org/jobs/${i + 1}`,
    description: 'Build and maintain reliable applications.', board: 'linkedin', ageDays: 2, fit: { score: 76, verdict: 'Worth a shot', gaps: [] }, language: 'en' }));
  const records = jobs.map(job => ({ ...job, decision: 'applied', appliedDate: '2026-10-01', updatedAt: '2026-10-08T09:00:00Z' }));
  const memory = { schemaVersion: 1, revision: 1, facts: { name: 'Fictional Candidate', targetRole: 'Software Engineer', headline: 'Backend systems', links: { email: 'candidate@example.org' }, skills: { strong: ['Python', 'SQL'] },
    experience: [{ title: 'Engineer', org: 'Example Workshop', from: '2023-01', to: '2025-12', bullets: ['Built internal tools.'] }], education: [], background: {}, location: { current: 'Example City', cvDisplay: 'Example Country', showOnCv: true, targets: [], openToRemote: true, willingToRelocate: false } }, preferences: { writingRules: 'Use clear language.' }, answers: { noticePeriod: 'One month' } };
  const boards = [{ id: 'linkedin', label: 'LinkedIn', enabled: true, available: true, jobspy: true, regions: 'All markets', note: 'Professional opportunities' },
    { id: 'companies', label: 'Company careers', enabled: true, available: true, api: true, regions: 'Configured employers' }];
  let empty = false;
  let holdFirstJobs = true;
  const firstJobs = Promise.withResolvers();
  t.after(() => firstJobs.resolve());
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/jobs' && holdFirstJobs) { holdFirstJobs = false; await firstJobs.promise; }
    requests.push(url.pathname + url.search);
    if (req.method() !== 'GET') writes.push({ path: url.pathname, body: req.postDataJSON() });
    const pageSize = Number(url.searchParams.get('pageSize')) || 10;
    const total = empty ? 0 : jobs.length, pages = Math.max(1, Math.ceil(total / pageSize));
    const number = Math.max(1, Math.min(pages, Number(url.searchParams.get('page')) || 1));
    const pagination = { page: number, pageSize, total, pages };
    const items = empty ? [] : jobs.slice((number - 1) * pageSize, number * pageSize);
    let data = {};
    switch (url.pathname) {
      case '/api/status': data = { candidate: 'Fictional Candidate', marketId: 'DE', setup: { needsSetup: false }, cv: { source: 'local' }, sheets: { configured: false }, fetchRunning: false, prepRunning: false }; break;
      case '/api/markets': data = { markets: [{ id: 'DE', name: 'Germany' }] }; break;
      case '/api/jobs': data = { jobs: items, pagination, meta: { fetchedAt: '2026-10-08T09:00:00Z' } }; break;
      case '/api/digest': data = { newJobs: items, candidates: empty ? [] : jobs, pagination, count: total, digest: { generatedAt: '2026-10-08T09:00:00Z' } }; break;
      case '/api/ready': data = { jobs: items, pagination, total, counts: { both: total } }; break;
      case '/api/tracker': data = { items: empty ? [] : records, counts: { applied: total } }; break;
      case '/api/memory':
        if (req.method() === 'PUT') memory.answers = req.postDataJSON().answers;
        data = { memory }; break;
      case '/api/memory/preview': data = { before: memory, after: req.postDataJSON(), changes: ['answers.noticePeriod'], confirmation: 'fictional-confirmation' }; break;
      case '/api/saved-answers': data = { answers: memory.answers }; break;
      case '/api/boards': data = { boards }; break;
      case '/api/discovery': data = { schedules: [], notifications: [], externalEnabled: false }; break;
      case '/api/cloud-tracker': data = { configured: false, paired: false, pending: 0, optionalFields: [], local: [], remote: [], issues: [] }; break;
      case '/api/fetch/stream': return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
    }
    return route.fulfill({ json: data });
  });
  await mkdir('.workspace/ux-audit', { recursive: true });
  await page.goto(base + '/#results');
  await page.locator('#jobList[aria-busy="true"]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-feedback="jobList"]').isVisible(), true);
  assert.equal(await page.locator('#workspaceNav').isVisible(), true);
  await page.locator('.tab[data-view="tools"]').click();
  await page.locator('#viewTools').waitFor();
  assert.equal(await page.locator('#jobList .job').count(), 0, 'navigation works before any job response');
  firstJobs.resolve();
  const views = ['results', 'digest', 'ready', 'tracker', 'discovery', 'memory', 'answers', 'portals', 'tools'];
  const navigate = async view => {
    await page.locator(`.tab[data-view="${view}"]`).click();
    await page.waitForFunction(key => document.querySelector(`.tab[data-view="${key}"]`).getAttribute('aria-selected') === 'true', view);
    const panel = page.locator(`#view${view[0].toUpperCase()}${view.slice(1)}`);
    await panel.waitFor(); return panel;
  };
  await navigate('results'); await page.locator('#jobList .job').first().waitFor();
  for (const [view, label] of [['results', 'Find jobs'], ['digest', 'New matches'], ['ready', 'Ready to apply'], ['tracker', 'Applications']]) {
    await navigate(view);
    const top = page.getByRole('navigation', { name: `${label} pages top`, exact: true });
    const bottom = page.getByRole('navigation', { name: `${label} pages bottom`, exact: true });
    await top.waitFor(); assert.equal(await bottom.count(), 1);
    await top.getByRole('button', { name: 'Page 2', exact: true }).click();
    await page.waitForFunction(name => [...document.querySelectorAll('nav[aria-label]')].find(el => el.getAttribute('aria-label') === name)?.querySelector('[aria-current="page"]')?.textContent === '2', `${label} pages top`);
    assert.equal(await bottom.locator('[aria-current="page"]').textContent(), '2');
    await top.getByRole('spinbutton', { name: 'Go to page' }).fill('3'); await top.getByRole('button', { name: 'Go', exact: true }).click();
    await page.waitForFunction(name => [...document.querySelectorAll('nav[aria-label]')].find(el => el.getAttribute('aria-label') === name)?.querySelector('[aria-current="page"]')?.textContent === '3', `${label} pages top`);
    await top.getByRole('combobox', { name: 'Items per page' }).selectOption('20');
    await page.waitForFunction(name => [...document.querySelectorAll('nav[aria-label]')].find(el => el.getAttribute('aria-label') === name)?.querySelector('[aria-current="page"]')?.textContent === '1', `${label} pages top`);
    assert.match(await top.locator('.page-range').textContent(), /1–20 of 73/);
  }
  // Navigating and changing result pages must never search, submit or write candidate data.
  assert.deepEqual(writes, []);
  await navigate('memory'); await page.locator('#memoryStructured input').first().waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#themeSelect').selectOption('dark');
    const location = page.getByRole('checkbox', { name: 'Facts / Location / Show location on CV', exact: true }).locator('..').locator('..');
    await location.screenshot({ path: `.workspace/ux-audit/memory-location-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Writing preferences', exact: true }).click();
  assert.equal(await page.locator('fieldset.memory-section:visible').getAttribute('data-section'), 'preferences');
  await page.locator('fieldset.memory-section:visible textarea').first().fill('Fictional draft preference');
  await navigate('tools'); await page.goBack(); await page.locator('#viewMemory').waitFor();
  assert.equal(await page.locator('fieldset.memory-section:visible textarea').first().inputValue(), 'Fictional draft preference');
  await navigate('answers'); await page.locator('#answersForm input[name="noticePeriod"]').fill('Two months');
  await navigate('tools'); await navigate('answers'); assert.equal(await page.locator('#answersForm input[name="noticePeriod"]').inputValue(), 'Two months');
  await navigate('portals'); await page.locator('input[name="portal"]').first().uncheck();
  await navigate('tools'); await navigate('portals'); assert.equal(await page.locator('input[name="portal"]').first().isChecked(), false);
  await page.locator('#savePortalsBtn').click(); await page.waitForFunction(() => document.getElementById('portalsFeedback').textContent.includes('saved for your next search'));
  assert.equal(writes.length, 1); assert.equal(writes[0].path, '/api/boards');
  await navigate('answers'); await page.locator('#saveAnswersBtn').click();
  const answerPreview = page.locator('.answer-preview-dialog'); await answerPreview.waitFor();
  assert.match(await answerPreview.locator('pre').textContent(), /One month/);
  assert.match(await answerPreview.locator('pre').textContent(), /Two months/);
  assert.doesNotMatch(await answerPreview.locator('pre').textContent(), /Fictional Candidate/);
  await answerPreview.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(writes.filter(item => item.path === '/api/memory').length, 0);
  await page.locator('#saveAnswersBtn').click();
  await page.locator('.answer-preview-dialog').getByRole('button', { name: 'Confirm and save', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('answersFeedback').textContent.includes('Answers saved locally'));
  const saved = writes.filter(item => item.path === '/api/memory');
  assert.equal(saved.length, 1); assert.equal(saved[0].body.confirmation, 'fictional-confirmation');
  assert.equal(saved[0].body.answers.noticePeriod, 'Two months');
  await navigate('tools'); await page.locator('[data-launch="openAtsCheck"]').click();
  await page.locator('#atsCheckDialog').waitFor(); await page.locator('#closeAtsCheck').click();
  await page.locator('.tab[data-view="tools"]').focus(); await page.keyboard.press('Home');
  assert.equal(await page.locator('.tab[aria-selected="true"]').getAttribute('data-view'), 'results');
  // Capture every page at desktop, narrow-mobile and tablet widths in both themes.
  for (const [width, height, theme] of [[1440, 1000, 'light'], [390, 844, 'light'], [768, 1024, 'dark'], [1440, 1000, 'dark'], [390, 844, 'dark']]) {
    await page.setViewportSize({ width, height }); await page.locator('#themeSelect').selectOption(theme);
    for (const view of views) {
      const panel = await navigate(view);
      await page.screenshot({ path: `.workspace/ux-audit/${width}-${theme}-${view}.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${view} overflows ${width}px by ${overflow}px`);
      assert.equal(await panel.locator('h2').first().isVisible(), true);
    }
  }
  await page.goto(base + '/#discovery'); await page.locator('#viewDiscovery').waitFor();
  assert.equal(await page.locator('.tab[aria-selected="true"]').getAttribute('data-view'), 'discovery');
  empty = true;
  for (const view of ['results', 'digest', 'ready', 'tracker']) {
    const panel = await navigate(view);
    await panel.locator('.empty:visible').first().waitFor();
    assert.equal(await panel.locator('.list-pagination:visible').count(), 0);
  }
  await page.locator('.connection-shortcut').click(); await page.locator('#connectionHeading').waitFor();
  assert.equal(await page.locator('#pairButton').isVisible(), true);
  await page.screenshot({ path: '.workspace/ux-audit/connection.png' });
  assert.deepEqual(errors, []);
  assert.ok(requests.some(path => path.startsWith('/api/digest?') && path.includes('page=3')));
});
