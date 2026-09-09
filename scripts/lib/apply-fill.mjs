/**
 * Headed Chrome fill via Playwright (persistent profile).
 * LinkedIn Easy Apply is filled and submitted. Other sites are filled; you confirm Submit.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceDir } from './common.mjs';
import { bookmarkletForPack, browserFillFunction } from './apply-fill-page.mjs';
import { slimPackForFill } from './apply-pack.mjs';
import { runLinkedInEasyApply } from './linkedin-easy-apply.mjs';
import {
  dismissCookieWall,
  attachCookieHandler,
  installCookieAutoAccept,
  installSameTab,
  mainTab,
  seedConsentCookies,
} from './accept-cookies.mjs';

let sharedContext = null;

export function peekChromeContext() {
  if (!sharedContext) return null;
  try {
    sharedContext.pages();
    return sharedContext;
  } catch {
    sharedContext = null;
    return null;
  }
}

export async function playwrightAvailable() {
  try {
    await import('playwright-core');
    return true;
  } catch {
    return false;
  }
}

function chromeProfileDir() {
  return join(workspaceDir(), 'chrome-profile');
}

async function launchPersistent() {
  const { chromium } = await import('playwright-core');
  const userDataDir = chromeProfileDir();
  await mkdir(userDataDir, { recursive: true });
  const base = {
    headless: false,
    viewport: { width: 1280, height: 920 },
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  };
  const attempts = [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
  let lastErr = null;
  for (const extra of attempts) {
    try {
      return await chromium.launchPersistentContext(userDataDir, { ...base, ...extra });
    } catch (err) {
      lastErr = err;
      const msg = err.message || String(err);
      if (/ProcessSingleton|already in use/i.test(msg)) {
        throw new Error('Close the Job Scout Chrome window from the last Fill, then try again.');
      }
    }
  }
  throw lastErr || new Error('Could not launch Chrome/Edge');
}

export async function getChromeContext() {
  if (sharedContext) {
    try {
      sharedContext.pages();
      await installCookieAutoAccept(sharedContext);
      await installSameTab(sharedContext);
      return sharedContext;
    } catch {
      sharedContext = null;
    }
  }
  sharedContext = await launchPersistent();
  sharedContext.on('close', () => {
    sharedContext = null;
  });
  await installCookieAutoAccept(sharedContext);
  await installSameTab(sharedContext);
  return sharedContext;
}

async function activePage(context) {
  return mainTab(context);
}

async function uploadFiles(page, pack) {
  const cv = pack.files?.cvPdf;
  const letter = pack.files?.coverLetterPdf || pack.files?.coverLetterDocx;
  if (!cv && !letter) return { uploaded: 0 };

  const inputs = page.locator('input[type="file"]');
  const n = await inputs.count();
  let uploaded = 0;
  for (let i = 0; i < n; i++) {
    const input = inputs.nth(i);
    const name = `${(await input.getAttribute('name')) || ''} ${(await input.getAttribute('id')) || ''} ${(await input.getAttribute('accept')) || ''}`;
    const wantLetter = /cover|letter|anschreiben/i.test(name);
    const file = wantLetter ? letter || cv : cv || letter;
    if (!file) continue;
    try {
      await input.setInputFiles(file);
      uploaded += 1;
    } catch {
      /* some portals replace the input after click */
    }
  }
  return { uploaded };
}

async function genericFill(page, pack) {
  const slim = slimPackForFill(pack);
  const fillSrc = browserFillFunction().toString();
  const result = await page.evaluate(({ src, data }) => {
    const fn = eval(`(${src})`);
    return fn(data, document);
  }, { src: fillSrc, data: slim });
  const files = await uploadFiles(page, pack);
  return {
    filled: result?.filled ?? 0,
    skipped: result?.skipped ?? 0,
    uploaded: files.uploaded,
  };
}

async function clickListingApply(page) {
  const names = /easy apply|einfach bewerben|apply now|jetzt bewerben|^apply$|^bewerben$/i;
  const btn = page.getByRole('button', { name: names }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.evaluate((el) => el.click()).catch(() => null);
    return true;
  }
  const link = page.getByRole('link', { name: names }).first();
  if (await link.isVisible().catch(() => false)) {
    await link.evaluate((el) => el.click()).catch(() => null);
    return true;
  }
  return false;
}

export async function fillApplyInBrowser(pack, options = {}) {
  const url = pack?.applyUrl;
  if (!url) {
    return { ok: false, error: 'No apply URL', filled: 0, uploaded: 0, submitted: false };
  }
  if (!(await playwrightAvailable())) {
    return {
      ok: false,
      error: 'playwright-core is not installed.',
      filled: 0,
      uploaded: 0,
      submitted: false,
    };
  }

  const context = await getChromeContext();
  const page = await activePage(context);
  await page.bringToFront().catch(() => null);
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = '';
  }
  await seedConsentCookies(context, hostname);
  await attachCookieHandler(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await dismissCookieWall(page);
  await page.waitForTimeout(400);
  await dismissCookieWall(page);

  const board = pack.ats?.id || '';
  if (board === 'linkedin') {
    const li = await runLinkedInEasyApply(page, pack, options);
    if (li.external) {
      await dismissCookieWall(page);
      const gen = await genericFill(page, pack);
      return {
        ok: true,
        ...li,
        filled: (li.filled || 0) + gen.filled,
        uploaded: (li.uploaded || 0) + gen.uploaded,
        message: (li.notes || []).join(' '),
      };
    }
    return {
      ok: li.ok !== false,
      ...li,
      message: (li.notes || []).join(' '),
    };
  }

  await clickListingApply(page);
  await dismissCookieWall(page);
  await page.waitForTimeout(600);
  const gen = await genericFill(page, pack);
  return {
    ok: true,
    submitted: false,
    ...gen,
    message: 'Filled known fields in Chrome. Review and submit if the form looks right.',
  };
}

export function fillAssistPayload(pack) {
  return {
    pack,
    text: pack.text,
    bookmarklet: bookmarkletForPack(slimPackForFill(pack)),
  };
}
