// Structured controls edit the same JSON draft; persistence always uses preview/confirm.
const DEFAULTS = {
  facts: { name: '', headline: '', targetRole: '', links: { email: '', phone: '', linkedin: '', github: '', portfolio: '' },
    skills: { strong: [] }, experience: [], education: [], background: {} },
  preferences: { writingRules: '', tailoringNotes: '' },
  answers: { workAuthorization: '', needsSponsorship: '', salaryExpectation: '', noticePeriod: '', earliestStart: '' },
};
const ROWS = { experience: { title: '', org: '', from: '', to: '', bullets: [] }, education: { degree: '', school: '', from: '', to: '' } };
export function renderStructuredMemory(container, sections, onChange) {
  container.replaceChildren();
  const values = structuredClone(sections);
  function field(parent, object, key, value, path) {
    const groupValue = value && typeof value === 'object' && (!Array.isArray(value) || ROWS[key] || value.some(item => typeof item !== 'string'));
    const label = document.createElement(groupValue ? 'div' : 'label'); label.className = 'prep-modal-field';
    const title = document.createElement('span'); title.textContent = key.replace(/([A-Z])/g, ' $1'); label.append(title);
    parent.append(label);
    if (Array.isArray(value) && !ROWS[key] && value.every(item => typeof item === 'string')) {
      const input = document.createElement('textarea'); input.rows = 3; input.value = value.join('\n'); label.append(input);
      input.oninput = () => { object[key] = input.value.split('\n').filter(Boolean); onChange(values); };
    } else if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        const group = document.createElement('fieldset'); label.append(group);
        for (const [name, child] of Object.entries(item)) field(group, item, name, child, [...path, name]);
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove entry'; group.append(remove);
        remove.onclick = () => { value.splice(index, 1); onChange(values); renderStructuredMemory(container, values, onChange); };
      }
    } else if (value && typeof value === 'object') {
      const group = document.createElement('fieldset'); label.append(group);
      for (const [name, child] of Object.entries(value)) field(group, value, name, child, [...path, name]);
    } else {
      const multiline = /rules|notes|background|resume|description|bullet/i.test(key) || String(value || '').length > 100;
      const input = document.createElement(multiline ? 'textarea' : 'input');
      if (typeof value === 'boolean') { input.type = 'checkbox'; input.checked = value; }
      else { if (multiline) input.rows = 3; else input.type = typeof value === 'number' ? 'number' : 'text'; input.value = value ?? ''; }
      label.append(input);
      input.oninput = () => { object[key] = typeof value === 'boolean' ? input.checked : typeof value === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value; onChange(values); };
    }
    if (ROWS[key]) {
      const add = document.createElement('button'); add.type = 'button'; add.textContent = `Add ${key}`; label.append(add);
      add.onclick = () => { (object[key] ||= []).push(structuredClone(ROWS[key])); onChange(values); renderStructuredMemory(container, values, onChange); };
    }
  }
  for (const section of Object.keys(DEFAULTS)) {
    const group = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = section; group.append(legend); container.append(group);
    values[section] = { ...structuredClone(DEFAULTS[section]), ...values[section] };
    if (section === 'facts') values.facts.links = { ...DEFAULTS.facts.links, ...values.facts.links };
    for (const [key, value] of Object.entries(values[section])) field(group, values[section], key, value, [section, key]);
  }
}
