import { browserFillFunction } from './apply-fill-page.mjs';
import { slimPackForFill } from './apply-pack.mjs';
import { getChromeContext } from './apply-fill.mjs';

const ACTIONS = {
  next: /^(next|continue|review|review your application|weiter|prüfen)$/i,
  submit: /^(submit application|submit|send application|apply|bewerbung absenden|absenden)$/i,
  open: /^(easy apply|apply now|einfach bewerben|apply for this job)$/i,
};
const CONFIRMED = /^\s*(?:your )?application (?:has been )?(?:submitted|sent|received)[.!]?\s*$|^\s*thank you for applying[.!]?\s*$|^\s*bewerbung gesendet[.!]?\s*$/i;
const pages = new Map();

export async function createApplicationAdapter(pack, suppliedPage, fingerprint) {
  const previous = pages.get(pack.jobId);
  const resumed = !suppliedPage && fingerprint && previous?.fingerprint === fingerprint && !previous.page.isClosed();
  const page = suppliedPage || (resumed ? previous.page : await (await getChromeContext()).newPage());
  if (!suppliedPage) pages.set(pack.jobId, { page, fingerprint });
  let action;
  const button = async name => {
    const matches = page.getByRole('button', { name });
    for (let i = 0; i < await matches.count(); i++) if (await matches.nth(i).isVisible()) return matches.nth(i);
    return null;
  };
  return {
    page,
    async open() {
      if (!suppliedPage && !resumed) await page.goto(pack.applyUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const open = await button(ACTIONS.open);
      if (open) await open.click();
    },
    async fillAndInspect() {
      if (/\/(login|checkpoint|authwall|signin)\b/i.test(page.url()) || await page.locator('input[type=password]').isVisible().catch(() => false)) return { login: true };
      if (await this.confirmation(false)) return { confirmed: true };
      await page.evaluate(({ src, pack }) => (0, eval)(`(${src})`)(pack, document), { src: browserFillFunction().toString(), pack: slimPackForFill(pack) });
      // Only exact saved answers for additional questions. Never derive legal answers.
      await page.evaluate(answers => {
        for (const el of document.querySelectorAll('input,select,textarea')) {
          const label = [...(el.labels || [])].map(l => { const copy = l.cloneNode(true); copy.querySelectorAll('input,select,textarea').forEach(n => n.remove()); return copy.textContent.trim(); }).join(' ') || el.getAttribute('aria-label') || '';
          const value = answers[label];
          if (!value || el.disabled || ['file','password','hidden','submit','button'].includes(el.type)) continue;
          if (['radio','checkbox'].includes(el.type)) {
            if (value === el.value || (el.type === 'checkbox' && /^(yes|true)$/i.test(value))) el.checked = true;
          } else if (!el.value && (el.tagName !== 'SELECT' || [...el.options].some(o => o.value === value || o.text === value))) {
            el.value = el.tagName === 'SELECT' ? [...el.options].find(o => o.value === value || o.text === value).value : value;
          }
          el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, pack.savedAnswers || {});
      const uploads = page.locator('input[type=file]');
      for (let i = 0; i < await uploads.count(); i++) {
        const input = uploads.nth(i);
        const meta = await input.evaluate(el => [el.name, el.id, ...(el.labels || [])].map(v => typeof v === 'string' ? v : v.textContent).join(' '));
        const file = /cover|letter/i.test(meta) ? pack.files?.coverLetterPdf : /resume|cv/i.test(meta) ? pack.files?.cvPdf : null;
        if (file) await input.setInputFiles(file);
      }
      const missing = await page.evaluate(() => {
        const fields = [...document.querySelectorAll('input,select,textarea,[role=combobox],[role=checkbox],[role=radio]')];
        return fields.filter(el => !el.disabled && (el.offsetParent !== null || el.type === 'file') &&
          (el.required || el.getAttribute('aria-required') === 'true') &&
          (el.getAttribute('role') || (el.type === 'file' ? !el.files.length : !el.checkValidity() || !el.value)))
          .map(el => el.getAttribute('aria-label') || [...(el.labels || [])].map(l => { const copy = l.cloneNode(true); copy.querySelectorAll('input,select,textarea').forEach(n => n.remove()); return copy.textContent.trim(); }).join(' ') || el.name || 'Unsupported required control');
      });
      action = await button(ACTIONS.submit);
      if (action) return { action: 'submit', missing };
      action = await button(ACTIONS.next);
      return { action: action ? 'next' : null, missing };
    },
    async next() { await action.click(); await page.waitForTimeout(300); },
    async submit() { await action.click({ timeout: 10000 }); },
    async confirmation(wait = true) {
      const confirmation = page.getByText(CONFIRMED).first();
      if (wait) await confirmation.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      return confirmation.isVisible().catch(() => false);
    },
  };
}
