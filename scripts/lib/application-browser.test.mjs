import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findBrowser } from './pdf.mjs';
import { createApplicationAdapter } from './application-portal.mjs';

test('four portal browser fixtures: steps, uploads, required answers, login and confirmation', async t => {
  const executablePath = await findBrowser();
  if (!executablePath) { if (process.env.CI) assert.fail('CI must install a browser'); return t.skip('Chrome/Edge unavailable'); }
  const browser = await chromium.launch({ executablePath, headless: true }); t.after(() => browser.close());
  for (const portal of ['linkedin', 'greenhouse', 'lever', 'ashby']) {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort()); // Fixtures can never access a real portal.
    await page.setContent(`<form onsubmit="event.preventDefault()"><label>First name<input name="first_name" required></label>
      <label>Sponsorship<select required><option value="">Choose</option><option>Yes</option><option>No</option></select></label>
      <button type="button" onclick="this.textContent='Submit application'">Next</button></form>`);
    const pack = { ats: { id: portal }, firstName: 'Fictional', savedAnswers: {} };
    const adapter = await createApplicationAdapter(pack, page); await adapter.open();
    assert.deepEqual((await adapter.fillAndInspect()).missing, ['Sponsorship']);
    pack.savedAnswers.Sponsorship = 'Yes';
    assert.equal((await adapter.fillAndInspect()).action, 'next'); await adapter.next();
    assert.equal((await adapter.fillAndInspect()).action, 'submit');
    assert.equal(await page.locator('input').inputValue(), 'Fictional');
    assert.equal(await adapter.confirmation(false), false);
    await page.setContent('<label>Resume<input name="resume" type="file" required></label><button>Submit application</button>');
    assert.deepEqual((await adapter.fillAndInspect()).missing, ['Resume']);
    pack.files = { cvPdf: { name: 'CV.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Fictional PDF bytes') } };
    assert.deepEqual((await adapter.fillAndInspect()).missing, []);
    assert.equal(await page.locator('input[type=file]').evaluate(el => el.files[0].name), 'CV.pdf');
    await page.setContent('<p>Application submitted</p>'); assert.equal(await adapter.confirmation(false), true);
    await page.setContent('<input type="password">'); assert.equal((await adapter.fillAndInspect()).login, true);
    await page.setContent('<div role="combobox" aria-required="true" aria-label="Custom question"></div>');
    assert.deepEqual((await adapter.fillAndInspect()).missing, ['Custom question']);
    await page.close();
  }
});
