import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { findBrowser } from './pdf.mjs';

test('PATH browser discovery returns an existing absolute executable for Playwright', async () => {
  const calls = [];
  const executable = '/usr/bin/google-chrome';
  const browser = await findBrowser({ platform: 'linux', env: {}, exists: path => path === executable,
    runImpl: async (command, args) => { calls.push([command, args]); return { stdout: executable + '\n' }; } });
  assert.equal(browser, executable);
  assert.deepEqual(calls, [['which', ['google-chrome']]]);
});

test('browser discovery skips missing paths and respects an explicit executable', async () => {
  const executable = '/opt/chromium/browser';
  assert.equal(await findBrowser({ platform: 'linux', env: {}, exists: path => path === executable,
    runImpl: async (_command, [name]) => ({ stdout: name === 'chromium' ? `/missing/browser\n${executable}\n` : 'google-chrome\n' }) }), executable);
  const configured = resolve('fictional browser.exe');
  assert.equal(await findBrowser({ env: { CHROME_PATH: configured }, exists: path => path === configured,
    runImpl: async () => { throw new Error('PATH lookup must not replace the configured browser'); } }), configured);
});
