/**
 * Dismiss cookie / consent overlays (LinkedIn, OneTrust, Cookiebot).
 * Uses in-page JS clicks so Playwright does not scroll behind the banner.
 */

export const COOKIE_BUTTON_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#accept-recommended-btn-handler',
  'button[action-type="ACCEPT"]',
  'button[data-control-name="ga-cookie.consent.accept.v4"]',
  'button[data-control-name="ga-cookie.consent.accept.v3"]',
  'button[data-control-name="ga-cookie.consent.accept"]',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '#didomi-notice-agree-button',
  'button.osano-cm-accept-all',
];

/** Runs in the browser. Returns a short reason or null. */
export function dismissCookiesInWindow() {
  const ACCEPT_RE =
    /^(accept all cookies|accept all|allow all|allow all cookies|accept|agree|allow|alle akzeptieren|alle zulassen|akzeptieren|zustimmen|ich stimme zu|einverstanden|ok,? got it|got it)$/i;

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    return true;
  }

  function textOf(el) {
    return (el.innerText || el.textContent || el.getAttribute?.('aria-label') || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cookieContext(el) {
    let n = el;
    for (let i = 0; i < 14 && n; i++, n = n.parentElement) {
      const blob = `${n.id || ''} ${n.className || ''} ${n.getAttribute?.('data-control-name') || ''}`.toLowerCase();
      if (/cookie|consent|onetrust|ot-sdk|didomi|cookiebot|qc-cmp|global-alert/.test(blob)) return true;
      const t = textOf(n).slice(0, 320).toLowerCase();
      if (
        /cookie|datenschutz|we use cookies|diese website verwendet|cookies on linkedin|cookies auf linkedin/.test(t)
        && n.querySelector?.('button')
      ) {
        return true;
      }
    }
    return false;
  }

  function collect(root, acc = []) {
    if (!root) return acc;
    if (root.querySelectorAll) {
      acc.push(...root.querySelectorAll('button, [role="button"], a.artdeco-button, a[role="button"]'));
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) collect(el.shadowRoot, acc);
      }
    }
    return acc;
  }

  if (window.OneTrust) {
    try {
      window.OneTrust.AllowAll();
      return 'onetrust-api';
    } catch {
      /* fall through */
    }
  }

  const byId = [
    'onetrust-accept-btn-handler',
    'accept-recommended-btn-handler',
    'didomi-notice-agree-button',
    'CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    'CybotCookiebotDialogBodyButtonAccept',
  ];
  for (const id of byId) {
    const el = document.getElementById(id);
    if (el && visible(el)) {
      el.click();
      return `id:${id}`;
    }
  }

  const named = document.querySelectorAll(
    'button[action-type="ACCEPT"], button[data-control-name*="cookie.consent.accept"], button[data-control-name="ga-cookie.consent.accept.v4"]',
  );
  for (const el of named) {
    if (visible(el)) {
      el.click();
      return 'named-accept';
    }
  }

  const buttons = collect(document);
  for (const el of buttons) {
    if (!visible(el)) continue;
    if (el.closest?.('.jobs-easy-apply-modal')) continue;
    const name = (el.getAttribute('data-control-name') || '').toLowerCase();
    if (name.includes('cookie.consent.accept')) {
      el.click();
      return 'control-accept';
    }
    const t = textOf(el);
    if (!ACCEPT_RE.test(t)) continue;
    if (cookieContext(el) || /all|alle|cookie/i.test(t)) {
      el.click();
      return `text:${t.slice(0, 40)}`;
    }
  }

  for (const el of buttons) {
    if (!visible(el) || el.closest?.('.jobs-easy-apply-modal')) continue;
    if (!ACCEPT_RE.test(textOf(el))) continue;
    const overlay = el.closest('dialog, [role="dialog"], [class*="modal"], [class*="overlay"], [class*="alert"]');
    if (overlay && visible(overlay)) {
      el.click();
      return `overlay:${textOf(el).slice(0, 40)}`;
    }
  }
  return null;
}

export function cookieWallPresentInWindow() {
  const sels = [
    '#onetrust-banner-sdk',
    '#onetrust-pc-sdk',
    '#onetrust-consent-sdk',
    'button[action-type="ACCEPT"]',
    '[data-control-name*="cookie.consent"]',
    '.artdeco-global-alert-container',
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (r.width > 8 && r.height > 8 && style.display !== 'none' && style.visibility !== 'hidden') return true;
  }
  const nodes = document.querySelectorAll(
    'dialog, [role="dialog"], [class*="modal"], [class*="artdeco-global-alert"], [id*="cookie"]',
  );
  for (const el of nodes) {
    const t = (el.innerText || '').slice(0, 500).toLowerCase();
    if (!/cookie|wir verwenden cookies|we use cookies|datenschutz/.test(t)) continue;
    if (!el.querySelector('button, [role="button"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 40 && r.width > 40) return true;
  }
  return false;
}

function stripCookieDom() {
  for (const sel of [
    '#onetrust-banner-sdk',
    '#onetrust-pc-sdk',
    '#onetrust-consent-sdk',
    '.artdeco-global-alert-container',
  ]) {
    document.querySelector(sel)?.remove();
  }
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

async function runInWorld(target, fn) {
  try {
    return await target.evaluate(fn);
  } catch {
    return null;
  }
}

export async function cookieWallPresent(page) {
  if (await runInWorld(page, cookieWallPresentInWindow)) return true;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    if (await runInWorld(frame, cookieWallPresentInWindow)) return true;
  }
  return false;
}

export async function dismissCookieWall(page, { timeoutMs = 14000 } = {}) {
  const start = Date.now();
  let via = null;
  while (Date.now() - start < timeoutMs) {
    via = (await runInWorld(page, dismissCookiesInWindow)) || via;
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      via = (await runInWorld(frame, dismissCookiesInWindow)) || via;
    }
    if (!(await cookieWallPresent(page))) return { ok: true, via };
    await page.waitForTimeout(350);
  }
  await runInWorld(page, stripCookieDom);
  const gone = !(await cookieWallPresent(page));
  return { ok: gone, via: via || (gone ? 'stripped' : null) };
}

function consentCookie(domain) {
  const now = new Date().toISOString();
  return [
    {
      name: 'OptanonAlertBoxClosed',
      value: now,
      domain,
      path: '/',
    },
    {
      name: 'OptanonConsent',
      value: `isGpcEnabled=0&datestamp=${encodeURIComponent(now)}&version=202401.1.0&isIABGlobal=false&hosts=&consentId=job-scout&interactionCount=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1`,
      domain,
      path: '/',
    },
  ];
}

export async function seedConsentCookies(context, hostname = '') {
  const host = String(hostname || '').replace(/^www\./, '');
  const domains = new Set(['.linkedin.com']);
  if (host) domains.add(`.${host}`);
  const cookies = [];
  for (const domain of domains) cookies.push(...consentCookie(domain));
  try {
    await context.addCookies(cookies);
  } catch {
    /* ignore */
  }
}

const patchedCookies = new WeakSet();
const patchedSameTab = new WeakSet();
const pageHandlers = new WeakSet();

export async function installCookieAutoAccept(context) {
  if (patchedCookies.has(context)) return;
  patchedCookies.add(context);
  const boot = `(() => {
    const dismissCookiesInWindow = ${dismissCookiesInWindow.toString()};
    const tick = () => { try { dismissCookiesInWindow(); } catch (e) {} };
    tick();
    const id = setInterval(tick, 500);
    setTimeout(() => clearInterval(id), 15000);
  })();`;
  await context.addInitScript({ content: boot });
}

/**
 * Playwright 1.44+ overlay handler: if the accept button appears mid-flow, click it
 * without scrolling the job page.
 */
export async function attachCookieHandler(page) {
  if (pageHandlers.has(page) || page.isClosed()) return;
  pageHandlers.add(page);
  const overlay = page.locator(
    '#onetrust-accept-btn-handler, button[action-type="ACCEPT"], button[data-control-name*="cookie.consent.accept"]',
  );
  try {
    await page.addLocatorHandler(overlay, async () => {
      await page.evaluate(dismissCookiesInWindow).catch(() => {});
    });
  } catch {
    /* older playwright-core */
  }
}

export async function installSameTab(context) {
  if (patchedSameTab.has(context)) return;
  patchedSameTab.add(context);
  await context.addInitScript(() => {
    const orig = window.open;
    window.open = function (url) {
      if (url && String(url) !== 'about:blank') {
        window.location.href = String(url);
        return window;
      }
      return orig ? orig.apply(window, arguments) : window;
    };
  });
  context.on('page', async (opened) => {
    const pages = context.pages().filter((p) => !p.isClosed());
    const main = pages[0];
    if (!main || opened === main) return;
    try {
      await opened.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
      const url = opened.url();
      await opened.close().catch(() => {});
      if (url && url !== 'about:blank' && url !== main.url()) {
        await main.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
      }
    } catch {
      await opened.close().catch(() => {});
    }
  });
}

export async function mainTab(context) {
  const open = context.pages().filter((p) => !p.isClosed());
  const page = open[0] || await context.newPage();
  for (const extra of open.slice(1)) {
    await extra.close().catch(() => {});
  }
  return page;
}
