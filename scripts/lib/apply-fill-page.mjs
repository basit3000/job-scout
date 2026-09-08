/**
 * In-page form filler. Serialized into bookmarklets and Playwright.
 * Fills matching fields, never clicks Apply / Submit.
 */

import { fieldBlob, shouldSkipField, valueForField } from './apply-fill-match.mjs';

export function applyFillOnDocument(pack, doc) {
  const document = doc;
  if (!pack || !document) return { filled: 0, skipped: 0, message: 'No pack' };

  const SUBMIT_RE = /\b(submit|apply now|send application|absenden|bewerben|jetzt bewerben)\b/i;

  function labelFor(el) {
    if (el.id && typeof CSS !== 'undefined' && CSS.escape) {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (byFor) return byFor.textContent;
    }
    const parent = el.closest?.('label');
    if (parent) return parent.textContent;
    const wrap = el.closest?.('div, li, p, td, fieldset');
    const nearby = wrap?.querySelector('label');
    return nearby?.textContent || el.getAttribute?.('aria-label') || '';
  }

  function metaFor(el) {
    return {
      name: el.getAttribute?.('name') || '',
      id: el.id || '',
      type: (el.getAttribute?.('type') || el.tagName || '').toLowerCase(),
      label: labelFor(el) || '',
      placeholder: el.getAttribute?.('placeholder') || '',
      autocomplete: el.getAttribute?.('autocomplete') || '',
      ariaLabel: el.getAttribute?.('aria-label') || '',
    };
  }

  function setValue(el, value) {
    if (String(el.tagName).toUpperCase() === 'SELECT') {
      const want = String(value).toLowerCase();
      let matched = false;
      for (const opt of el.options || []) {
        const t = `${opt.text} ${opt.value}`.toLowerCase();
        if (t.includes(want) || want.includes(String(opt.text || '').trim().toLowerCase())) {
          el.value = opt.value;
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    } else {
      el.focus?.();
      el.value = value;
    }
    el.dispatchEvent?.(new Event('input', { bubbles: true }));
    el.dispatchEvent?.(new Event('change', { bubbles: true }));
    if (el.style) el.style.outline = '2px solid #0d8f7b';
    return true;
  }

  const nodes = document.querySelectorAll?.('input, textarea, select') || [];
  let filled = 0;
  let skipped = 0;
  for (const el of nodes) {
    if (el.disabled || el.readOnly) {
      skipped += 1;
      continue;
    }
    const meta = metaFor(el);
    if (SUBMIT_RE.test(`${meta.name} ${meta.id} ${meta.label}`)) {
      skipped += 1;
      continue;
    }
    if (shouldSkipField(meta)) {
      skipped += 1;
      continue;
    }
    const value = valueForField(meta, pack);
    if (!value) continue;
    if (setValue(el, value)) filled += 1;
  }

  const bannerId = 'job-scout-fill-banner';
  document.getElementById?.(bannerId)?.remove?.();
  if (document.body?.appendChild) {
    const banner = document.createElement('div');
    banner.id = bannerId;
    banner.setAttribute('role', 'status');
    banner.style.cssText =
      'position:fixed;z-index:2147483647;top:12px;right:12px;max-width:22rem;padding:10px 12px;background:#10232b;color:#f4fafa;font:13px/1.4 system-ui,sans-serif;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25)';
    banner.textContent = filled
      ? `Job Scout filled ${filled} field(s). Review, attach CV if needed, then you click Submit.`
      : 'Job Scout found no matching fields on this page. Copy pack and paste, or open the real apply form first.';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 12000);
  }

  return { filled, skipped, neverSubmit: true };
}

export function browserFillFunction() {
  return new Function(
    'pack',
    'doc',
    `"use strict";
      const fieldBlob = ${fieldBlob.toString()};
      const shouldSkipField = ${shouldSkipField.toString()};
      const valueForField = ${valueForField.toString()};
      const applyFillOnDocument = ${applyFillOnDocument.toString()};
      return applyFillOnDocument(pack, doc || document);`,
  );
}

export function bookmarkletForPack(pack) {
  const fn = browserFillFunction();
  const src = `(${fn.toString()})(${JSON.stringify(pack)}, document)`;
  return `javascript:${encodeURIComponent(src)}`;
}
