/**
 * Snapshot unanswered fields in a LinkedIn Easy Apply modal (or the page).
 * Stamps data-jobscout-id on each group so the LLM answers can be applied.
 */

/** Serialized into page.evaluate — no imports, no outer scope. */
export const COLLECT_UNANSWERED_FIELDS_SRC = function collectUnansweredFieldsInRoot(root) {
  function placeholder(value) {
    const s = String(value || '').trim().toLowerCase();
    return !s || /^(select an option|select|please select|choose|bitte w[aä]hlen|w[aä]hlen sie|w[aä]hlen|-|n\/a)$/i.test(s);
  }
  function textOf(el) {
    return String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const view = el.ownerDocument?.defaultView;
    if (view) {
      const st = view.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  const selector = '.jobs-easy-apply-form-section__grouping, .fb-dash-form-element, .jobs-easy-apply-form-element, fieldset, [data-test-form-element]';
  const candidates = [...root.querySelectorAll(selector)].filter(isVisible);
  const groups = candidates.filter(
    (el) => !candidates.some((other) => other !== el && el.contains(other)),
  );

  const fields = [];
  let n = 0;
  for (const group of groups) {
    const select = [...group.querySelectorAll('select')].find(isVisible);
    const radios = [...group.querySelectorAll('input[type="radio"]')].filter(isVisible);
    const combo = [...group.querySelectorAll('[role="combobox"], input[aria-autocomplete="list"]')].find(isVisible);
    const input = [...group.querySelectorAll('input, textarea')].find((el) => {
      if (!isVisible(el)) return false;
      const t = (el.getAttribute('type') || el.tagName || '').toLowerCase();
      return !['hidden', 'file', 'submit', 'button', 'checkbox', 'radio', 'password'].includes(t) && !el.disabled;
    });
    if (!select && !radios.length && !combo && !input) continue;

    const legend = group.querySelector('legend, label, .fb-dash-form-element__label');
    let label = textOf(legend);
    if (!label) label = textOf(group).slice(0, 280);

    let kind = 'text';
    let current = '';
    let options = [];

    if (select) {
      kind = 'select';
      current = select.value || textOf(select.options[select.selectedIndex]);
      options = [...select.options].map((o) => textOf(o)).filter(Boolean);
    } else if (radios.length) {
      kind = 'radio';
      const checked = radios.find((r) => r.checked);
      current = checked
        ? (checked.value || textOf(checked.closest('label') || checked.parentElement))
        : '';
      options = radios.map((r) => {
        const lab = r.id
          ? group.querySelector(`label[for="${CSS.escape(r.id)}"]`)
          : null;
        return textOf(lab || r.closest('label') || r.parentElement) || r.value || '';
      }).filter(Boolean);
    } else if (combo) {
      kind = 'combobox';
      current = combo.value || '';
    } else if (input) {
      kind = (input.tagName || '').toLowerCase() === 'textarea' ? 'textarea' : 'text';
      current = input.value || '';
    }

    if (!placeholder(current)) continue;

    const required = Boolean(
      group.querySelector('[required], [aria-required="true"]')
      || /\*/.test(label)
      || /required|pflicht/i.test(label)
      || /first name|last name|vorname|nachname|given name|family name/i.test(label),
    );
    const id = `f${n++}`;
    group.setAttribute('data-jobscout-id', id);
    fields.push({
      id,
      kind,
      label: label.slice(0, 400),
      required,
      current,
      options: options.slice(0, 40),
    });
  }
  return fields;
}.toString();

export async function snapshotUnansweredFields(page) {
  return page.evaluate((src) => {
    const collect = eval(`(${src})`);
    const root = document.querySelector(
      '.jobs-easy-apply-modal, .jobs-easy-apply-content, [data-test-modal-id="easy-apply-modal"]',
    ) || document.body;
    return collect(root);
  }, COLLECT_UNANSWERED_FIELDS_SRC);
}
