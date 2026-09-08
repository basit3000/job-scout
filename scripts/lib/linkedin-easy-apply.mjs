/**
 * LinkedIn Easy Apply: open the modal, fill known fields, step Next, submit.
 * Uses the caller's headed Playwright page (persistent Chrome profile).
 */

import { valueForField } from './apply-fill-match.mjs';
import { slimPackForFill } from './apply-pack.mjs';
import { dismissCookieWall, attachCookieHandler, cookieWallPresent } from './accept-cookies.mjs';
import {
  answerAdditionalQuestion,
  isPlaceholderValue,
  yearsForQuestion,
  yesNoForQuestion,
} from './apply-questions.mjs';
import { snapshotUnansweredFields } from './apply-form-snapshot.mjs';
import {
  FILL_LLM_MAX_STEPS,
  askFillFallback,
} from './apply-llm-fallback.mjs';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function firstVisible(locator) {
  const n = await locator.count();
  for (let i = 0; i < n; i++) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function clickIfVisible(page, selector, timeout = 1800) {
  const loc = page.locator(selector).first();
  try {
    if (await loc.isVisible({ timeout })) {
      await loc.click({ timeout: 3000 });
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function linkedInNeedsLogin(page) {
  const url = page.url();
  if (/\/login|\/checkpoint|\/authwall|\/uas\/|\/signup/i.test(url)) return true;
  const user = page.locator('input#username, input[name="session_key"]');
  return user.first().isVisible().catch(() => false);
}

async function waitForLinkedInSession(page) {
  if (!(await linkedInNeedsLogin(page))) return { loggedIn: true, waited: false };
  await clickIfVisible(page, 'a[href*="/login"]');
  await clickIfVisible(page, 'button:has-text("Sign in")');
  await clickIfVisible(page, 'a:has-text("Sign in")');
  await page.waitForSelector(
    'button.jobs-apply-button, .jobs-unified-top-card, .job-view-layout, a.global-nav__primary-link',
    { timeout: 120_000 },
  ).catch(() => null);
  return { loggedIn: !(await linkedInNeedsLogin(page)), waited: true };
}

async function alreadyApplied(page) {
  const applied = page.getByText(/^\s*applied\s*$|beworben|application submitted/i).first();
  if (await applied.isVisible().catch(() => false)) return true;
  const disabled = page.locator('button.jobs-apply-button[disabled], button.jobs-apply-button[aria-label*="Applied"]');
  return disabled.first().isVisible().catch(() => false);
}

async function clickEasyApply(page) {
  const easy = await firstVisible(
    page.getByRole('button', { name: /easy apply|einfach bewerben/i }),
  );
  if (easy) {
    await easy.evaluate((el) => el.click());
    await pause(800);
    return 'easy';
  }
  const apply = await firstVisible(
    page.locator('button.jobs-apply-button, .jobs-apply-button--top-card button'),
  );
  if (apply) {
    const label = `${await apply.innerText().catch(() => '')} ${await apply.getAttribute('aria-label') || ''}`;
    await apply.evaluate((el) => el.click());
    await pause(800);
    if (/easy apply|einfach bewerben/i.test(label)) return 'easy';
    return 'external';
  }
  return null;
}

async function modalRoot(page) {
  const modal = page.locator('.jobs-easy-apply-modal, .jobs-easy-apply-content, [data-test-modal-id="easy-apply-modal"]').first();
  if (await modal.isVisible().catch(() => false)) return modal;
  return page;
}

async function describeInput(locator) {
  return locator.evaluate((el) => {
    const id = el.id || '';
    let label = '';
    if (id) {
      const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lab) label = lab.innerText || '';
    }
    if (!label) label = el.closest('label')?.innerText || '';
    if (!label) {
      const wrap = el.closest(
        '.artdeco-text-input, .fb-dash-form-element, .jobs-easy-apply-form-element, .jobs-easy-apply-form-section__grouping',
      ) || el.parentElement;
      const nearby = wrap?.querySelector('label, .fb-dash-form-element__label, .artdeco-text-input--label');
      label = nearby?.innerText || '';
    }
    return {
      name: el.getAttribute('name') || '',
      id,
      type: (el.getAttribute('type') || el.tagName || '').toLowerCase(),
      label,
      placeholder: el.getAttribute('placeholder') || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
    };
  });
}

async function fillTextInput(input, value) {
  if (!value) return false;
  try {
    await input.click({ force: true, timeout: 1500 });
    await input.fill('');
    await input.fill(String(value));
    return true;
  } catch {
    try {
      await input.evaluate((el, v) => {
        el.focus();
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
          || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        if (desc?.set) desc.set.call(el, v);
        else el.value = v;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: v, inputType: 'insertText' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, String(value));
      return true;
    } catch {
      return false;
    }
  }
}

async function fillNamedContactFields(page, pack) {
  const slim = slimPackForFill(pack);
  const root = await modalRoot(page);
  let filled = 0;
  const labeled = [
    { name: /first name|given name|vorname/i, value: slim.firstName },
    { name: /last name|family name|surname|nachname/i, value: slim.lastName },
    { name: /e-?mail|e-mail/i, value: slim.email },
  ];
  for (const { name, value } of labeled) {
    if (!value) continue;
    const box = root.getByRole('textbox', { name }).first();
    if (!(await box.isVisible().catch(() => false))) continue;
    const current = await box.inputValue().catch(() => '');
    if (!isPlaceholderValue(current)) continue;
    if (await fillTextInput(box, value)) filled += 1;
  }
  const bySelector = [
    ['input[autocomplete="given-name"], input[id*="firstName" i], input[id*="first-name" i]', slim.firstName],
    ['input[autocomplete="family-name"], input[id*="lastName" i], input[id*="last-name" i]', slim.lastName],
    ['input[autocomplete="email"], input[type="email"]', slim.email],
  ];
  for (const [selector, value] of bySelector) {
    if (!value) continue;
    const box = root.locator(selector).first();
    if (!(await box.isVisible().catch(() => false))) continue;
    if (await box.isDisabled().catch(() => false)) continue;
    const current = await box.inputValue().catch(() => '');
    if (!isPlaceholderValue(current)) continue;
    if (await fillTextInput(box, value)) filled += 1;
  }
  return filled;
}

async function hasEasyApplyErrors(page) {
  const root = await modalRoot(page);
  const err = root.locator(
    '.artdeco-inline-feedback--error, .fb-dash-form-element__error-text, [data-test-form-element-error], .artdeco-inline-feedback__message',
  ).first();
  return err.isVisible().catch(() => false);
}

async function optionLabels(select) {
  return select.evaluate((el) =>
    [...el.options].map((o) => o.textContent.trim()).filter(Boolean),
  );
}

async function fillSelectWithValue(select, answer) {
  if (!answer) return false;
  const opts = await optionLabels(select);
  try {
    await select.selectOption({ label: answer });
    return true;
  } catch {
    try {
      await select.selectOption({ value: answer });
      return true;
    } catch {
      const match = opts.find((o) => o.toLowerCase() === String(answer).toLowerCase())
        || opts.find((o) => o.toLowerCase().includes(String(answer).toLowerCase()));
      if (!match) return false;
      await select.selectOption({ label: match }).catch(() => null);
      return true;
    }
  }
}

async function fillSelect(select, label, pack) {
  const opts = await optionLabels(select);
  const answer = answerAdditionalQuestion(label, opts, pack);
  return fillSelectWithValue(select, answer);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function applyOneLlmAnswer(page, answer) {
  const root = await modalRoot(page);
  let group = root.locator(`[data-jobscout-id="${answer.id}"]`).first();
  if (!(await group.count()) || !(await group.isVisible().catch(() => false))) {
    const snippet = String(answer.label || '').slice(0, 80);
    if (snippet) {
      group = root.locator(
        '.fb-dash-form-element, .jobs-easy-apply-form-element, fieldset, [data-test-form-element]',
      ).filter({ hasText: snippet }).first();
    }
  }
  if (!(await group.count())) return false;
  const value = String(answer.value || '').trim();
  if (!value) return false;

  const select = group.locator('select:visible').first();
  if (await select.count()) return fillSelectWithValue(select, value);

  if (await group.locator('input[type="radio"]:visible').count()) {
    const radio = group.getByRole('radio', { name: new RegExp(`^${escapeRe(value)}$`, 'i') }).first();
    const safe = value.replace(/["\\]/g, '');
    const alt = group.locator(`label:has-text("${safe}")`).first();
    const hit = (await radio.count()) ? radio : alt;
    if (await hit.isVisible().catch(() => false)) {
      await hit.evaluate((el) => el.click()).catch(() => hit.click());
      return true;
    }
    return false;
  }
  const combo = group.locator('[role="combobox"]:visible, input[aria-autocomplete="list"]:visible').first();
  if (await combo.count()) {
    return fillCombobox(page, combo, value);
  }
  const input = group.locator('input:visible, textarea:visible').first();
  if (await input.count()) {
    await input.fill(value).catch(() => null);
    return true;
  }
  return false;
}

async function applyLlmAnswers(page, answers) {
  let filled = 0;
  for (const answer of answers) {
    if (await applyOneLlmAnswer(page, answer)) filled += 1;
  }
  return filled;
}

async function tryLlmFallback(page, pack, options, notes) {
  const fields = await snapshotUnansweredFields(page).catch(() => []);
  if (!fields.length) return { filled: 0, used: false, asked: false };
  notes.push(`Asking Prep agent about ${fields.length} unanswered question(s)…`);
  const planned = await askFillFallback({
    fields,
    pack: slimPackForFill(pack),
    provider: options?.agentProvider,
    model: options?.agentModel,
  });
  if (!planned.used) {
    notes.push(planned.reason
      ? `Prep agent skipped (${planned.reason}).`
      : 'Prep agent skipped.');
    return { filled: 0, used: false, asked: false };
  }
  if (!planned.answers.length) {
    notes.push('Prep agent had no safe answers for the remaining questions.');
    return { filled: 0, used: true, asked: true };
  }
  const n = await applyLlmAnswers(page, planned.answers);
  notes.push(`Prep agent filled ${n} extra field(s).`);
  return { filled: n, used: true, asked: true };
}

async function fillCombobox(page, box, value) {
  if (!value) return false;
  await box.evaluate((el) => el.click());
  await pause(200);
  try {
    await box.fill(String(value));
  } catch {
    await page.keyboard.type(String(value), { delay: 20 });
  }
  await pause(350);
  const opt = page.locator('[role="option"], .artdeco-listbox li, .basic-typeahead__selectable').first();
  if (await opt.isVisible().catch(() => false)) {
    await opt.evaluate((el) => el.click());
    return true;
  }
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  return true;
}

async function fillModalFields(page, pack) {
  const slim = slimPackForFill(pack);
  const root = await modalRoot(page);
  let filled = await fillNamedContactFields(page, pack);

  const groups = root.locator(
    '.jobs-easy-apply-form-section__grouping, .fb-dash-form-element, .jobs-easy-apply-form-element, fieldset, [data-test-form-element]',
  );
  const groupCount = await groups.count();
  if (groupCount) {
    for (let i = 0; i < groupCount; i++) {
      const group = groups.nth(i);
      const label = (await group.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
      const select = group.locator('select:visible').first();
      if (await select.count()) {
        const current = await select.inputValue().catch(() => '');
        if (isPlaceholderValue(current)) {
          if (await fillSelect(select, label, slim)) filled += 1;
        }
      }
      const combo = group.locator('[role="combobox"]:visible, input[aria-autocomplete="list"]:visible').first();
      if (await combo.count()) {
        const current = await combo.inputValue().catch(() => '');
        if (isPlaceholderValue(current)) {
          const answer = answerAdditionalQuestion(label, [], slim)
            || valueForField({ label, type: 'text' }, slim);
          if (answer && (await fillCombobox(page, combo, answer))) filled += 1;
        }
      }
      const radios = group.locator('input[type="radio"]:visible');
      if (await radios.count()) {
        const yn = yesNoForQuestion(label, slim);
        if (yn) {
          const target = group.getByRole('radio', { name: new RegExp(`^${yn}$`, 'i') }).first();
          const alt = group.locator(`label:has-text("${yn === 'yes' ? 'Yes' : 'No'}"), label:has-text("${yn === 'yes' ? 'Ja' : 'Nein'}")`).first();
          const hit = (await target.count()) ? target : alt;
          if (await hit.isVisible().catch(() => false)) {
            await hit.evaluate((el) => el.click()).catch(() => hit.click());
            filled += 1;
          }
        }
        continue;
      }
      const inputs = group.locator('input:visible, textarea:visible');
      const inputN = await inputs.count();
      for (let j = 0; j < inputN; j++) {
        const input = inputs.nth(j);
        const type = (await input.getAttribute('type') || '').toLowerCase();
        if (['hidden', 'file', 'submit', 'button', 'checkbox', 'radio', 'password'].includes(type)) continue;
        if (await input.isDisabled().catch(() => false)) continue;
        const role = (await input.getAttribute('role') || '').toLowerCase();
        if (role === 'combobox') continue;
        const current = await input.inputValue().catch(() => '');
        if (!isPlaceholderValue(current)) continue;
        const meta = await describeInput(input);
        let value = valueForField(meta, slim);
        if (!value) value = valueForField({ label: meta.label || label, type: type || 'text' }, slim);
        if (!value && /year|jahre|experience|erfahrung/.test((meta.label || label).toLowerCase())) {
          const y = yearsForQuestion(meta.label || label, slim);
          if (y != null) value = String(y);
        }
        if (!value) value = answerAdditionalQuestion(meta.label || label, [], slim);
        if (!value) continue;
        if (await fillTextInput(input, value)) filled += 1;
      }
    }
  }

  const leftovers = root.locator('select:visible');
  const leftoverN = await leftovers.count();
  for (let i = 0; i < leftoverN; i++) {
    const select = leftovers.nth(i);
    const current = await select.inputValue().catch(() => '');
    if (!isPlaceholderValue(current)) continue;
    const meta = await describeInput(select);
    if (await fillSelect(select, meta.label || '', slim)) filled += 1;
  }

  filled += await fillYesNo(page, pack);

  const rawInputs = root.locator('input:visible, textarea:visible');
  const rawN = await rawInputs.count();
  for (let i = 0; i < rawN; i++) {
    const input = rawInputs.nth(i);
    const type = (await input.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'file', 'submit', 'button', 'checkbox', 'radio', 'password'].includes(type)) continue;
    if (await input.isDisabled().catch(() => false)) continue;
    const current = await input.inputValue().catch(() => '');
    if (!isPlaceholderValue(current)) continue;
    const meta = await describeInput(input);
    let value = valueForField(meta, slim);
    if (!value && /year|jahre|experience|erfahrung/.test((meta.label || '').toLowerCase())) {
      const y = yearsForQuestion(meta.label, slim);
      if (y != null) value = String(y);
    }
    if (!value) continue;
    if (await fillTextInput(input, value)) filled += 1;
  }
  return { filled };
}

async function fillYesNo(page, pack) {
  const root = await modalRoot(page);
  const groups = root.locator('fieldset, .fb-dash-form-element, .jobs-easy-apply-form-section');
  const n = await groups.count();
  let filled = 0;
  for (let i = 0; i < n; i++) {
    const group = groups.nth(i);
    const label = (await group.innerText().catch(() => '')).slice(0, 400);
    const answer = yesNoForQuestion(label, pack);
    if (!answer) continue;
    const radio = group.getByRole('radio', { name: new RegExp(`^${answer}$`, 'i') });
    const alt = group.locator(`label:has-text("${answer === 'yes' ? 'Yes' : 'No'}"), label:has-text("${answer === 'yes' ? 'Ja' : 'Nein'}")`);
    const target = (await radio.count()) ? radio.first() : alt.first();
    if (await target.isVisible().catch(() => false)) {
      await target.click().catch(() => null);
      filled += 1;
    }
  }
  return filled;
}

async function uploadInModal(page, pack) {
  const cv = pack.files?.cvPdf;
  if (!cv) return 0;
  const root = await modalRoot(page);
  const files = root.locator('input[type="file"]');
  const n = await files.count();
  let uploaded = 0;
  for (let i = 0; i < n; i++) {
    try {
      await files.nth(i).setInputFiles(cv);
      uploaded += 1;
    } catch {
      /* LinkedIn sometimes uses a custom uploader */
    }
  }
  return uploaded;
}

async function findActionButton(page) {
  const root = await modalRoot(page);
  const submit = await firstVisible(
    root.getByRole('button', { name: /submit application|bewerbung absenden|absenden/i }),
  );
  if (submit) return { kind: 'submit', button: submit };
  const review = await firstVisible(
    root.getByRole('button', { name: /review your application|review|prüfen|überprüfen/i }),
  );
  if (review && !(await review.isDisabled().catch(() => false))) {
    return { kind: 'next', button: review };
  }
  const next = await firstVisible(
    root.getByRole('button', { name: /next|continue|weiter|continue to next step/i }),
  ) || await firstVisible(
    root.locator('button[aria-label="Continue to next step"]'),
  );
  if (next) {
    const disabled = await next.isDisabled().catch(() => false);
    return { kind: disabled ? 'blocked' : 'next', button: next };
  }
  return { kind: 'none', button: null };
}

async function submittedSuccess(page) {
  const ok = page.getByText(/application sent|bewerbung gesendet|your application was sent/i).first();
  return ok.isVisible().catch(() => false);
}

export async function runLinkedInEasyApply(page, pack, options = {}) {
  const notes = [];
  let llmUsed = false;
  let llmCalls = 0;
  await attachCookieHandler(page);
  const cookies = await dismissCookieWall(page);
  if (cookies.via) notes.push(`Cookies: ${cookies.via}`);
  const session = await waitForLinkedInSession(page);
  if (!session.loggedIn) {
    return {
      ok: true,
      needsLogin: true,
      submitted: false,
      filled: 0,
      uploaded: 0,
      llmUsed: false,
      notes: ['Log into LinkedIn in the Chrome window, then click Fill again.'],
    };
  }
  if (session.waited) await pause(1000);
  await dismissCookieWall(page);

  if (await alreadyApplied(page)) {
    return { ok: true, alreadyApplied: true, submitted: true, filled: 0, uploaded: 0, llmUsed: false, notes: ['Already applied.'] };
  }

  if (await cookieWallPresent(page)) {
    notes.push('Cookie dialog is still on screen — click Accept in Chrome, then Fill again.');
    return { ok: true, submitted: false, needsCookies: true, filled: 0, uploaded: 0, llmUsed: false, notes };
  }

  const mode = await clickEasyApply(page);
  await dismissCookieWall(page);
  if (!mode) {
    notes.push('No Easy Apply / Apply button on this listing.');
    return { ok: false, submitted: false, filled: 0, uploaded: 0, llmUsed: false, notes };
  }
  if (mode === 'external') {
    notes.push('This posting uses an external apply page (not Easy Apply). Filled that page if a form appeared.');
    return { ok: true, external: true, submitted: false, filled: 0, uploaded: 0, llmUsed: false, notes };
  }

  await page.locator('.jobs-easy-apply-modal, .jobs-easy-apply-content').first()
    .waitFor({ timeout: 12_000 })
    .catch(() => null);

  let filled = 0;
  let uploaded = 0;
  for (let step = 0; step < 14; step++) {
    await pause(500);
    const extra = await fillModalFields(page, pack);
    filled += extra.filled;
    uploaded += await uploadInModal(page, pack);

    if (await submittedSuccess(page)) {
      return { ok: true, submitted: true, filled, uploaded, llmUsed, notes };
    }

    // LinkedIn almost never disables Next. Only ask the agent when required
    // fields are still empty (or after Next if the form shows an error).
    if (llmCalls < FILL_LLM_MAX_STEPS) {
      const pending = await snapshotUnansweredFields(page).catch(() => []);
      if (pending.some((f) => f.required)) {
        try {
          const llm = await tryLlmFallback(page, pack, options, notes);
          if (llm.asked) llmCalls += 1;
          llmUsed = llmUsed || llm.used;
          filled += llm.filled;
          if (llm.filled) {
            filled += (await fillModalFields(page, pack)).filled;
          }
        } catch (err) {
          llmCalls += 1;
          notes.push(`Prep agent fallback failed: ${String(err.message || err).slice(0, 180)}`);
        }
      }
    }

    let action = await findActionButton(page);
    if (action.kind === 'blocked') {
      const retry = await fillModalFields(page, pack);
      filled += retry.filled;
      await pause(400);
      action = await findActionButton(page);
    }
    if (action.kind === 'blocked') {
      notes.push('A required Easy Apply question is unanswered — finish it in Chrome, then Submit.');
      return { ok: true, submitted: false, needsReview: true, filled, uploaded, llmUsed, notes };
    }
    if (action.kind === 'submit') {
      await action.button.evaluate((el) => el.click()).catch(() => action.button.click());
      await pause(1200);
      await clickIfVisible(page, 'button:has-text("Done")', 2500);
      await clickIfVisible(page, 'button[aria-label="Dismiss"]', 1500);
      const sent = await submittedSuccess(page) || true;
      notes.push('Submitted LinkedIn Easy Apply.');
      return { ok: true, submitted: sent, filled, uploaded, llmUsed, notes };
    }
    if (action.kind === 'next') {
      await action.button.evaluate((el) => el.click()).catch(() => action.button.click());
      await pause(700);
      if (await hasEasyApplyErrors(page) && llmCalls < FILL_LLM_MAX_STEPS) {
        notes.push('Next stayed on this step (validation error) — asking Prep agent.');
        try {
          const llm = await tryLlmFallback(page, pack, options, notes);
          if (llm.asked) llmCalls += 1;
          llmUsed = llmUsed || llm.used;
          filled += llm.filled;
          filled += (await fillModalFields(page, pack)).filled;
        } catch (err) {
          llmCalls += 1;
          notes.push(`Prep agent fallback failed: ${String(err.message || err).slice(0, 180)}`);
        }
      }
      continue;
    }
    break;
  }

  notes.push('Reached the end of the Easy Apply form without a Submit button.');
  return { ok: true, submitted: false, needsReview: true, filled, uploaded, llmUsed, notes };
}
