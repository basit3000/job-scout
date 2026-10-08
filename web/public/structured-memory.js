// Structured controls edit the same JSON draft; persistence always uses preview/confirm.
const DEFAULTS = {
  facts: { name: '', headline: '', targetRole: '', links: { email: '', phone: '', linkedin: '', github: '', portfolio: '' },
    skills: { strong: [] }, experience: [], education: [], background: {} },
  preferences: { writingRules: '', tailoringNotes: '' },
  answers: { workAuthorization: '', needsSponsorship: '', salaryExpectation: '', noticePeriod: '', earliestStart: '' },
};
const ROWS = { experience: { title: '', org: '', from: '', to: '', bullets: [] }, education: { degree: '', school: '', from: '', to: '' } };
const SECTION_LABELS = { facts: 'Profile & experience', preferences: 'Writing preferences', answers: 'Application answers' };
const FIELD_LABELS = { name: 'Full name', org: 'Employer / organization', from: 'Start date', to: 'End date', links: 'Contact details & links', strong: 'Core skills', bullets: 'Experience details (one per line)', needsSponsorship: 'Sponsorship requirements', workAuthorization: 'Work authorization', cvDisplay: 'Location shown on CV', showOnCv: 'Show location on CV', targets: 'Target locations', openToRemote: 'Open to remote work', willingToRelocate: 'Willing to relocate' };
export const memoryFieldLabel = key => FIELD_LABELS[key] || (String(key).charAt(0).toUpperCase() + String(key).slice(1)).replace(/([a-z])([A-Z])/g, '$1 $2');
const fieldLabel = memoryFieldLabel;
const SECTION_HINTS = { facts: 'Keep your contact details, skills and experience accurate. Leave anything unknown blank.', preferences: 'Set how your applications should sound and what the writer should focus on.', answers: 'Keep reusable application answers here. Leave uncertain answers blank.' };
export function renderStructuredMemory(container, sections, onChange) {
  container.replaceChildren();
  const values = structuredClone(sections);
  // Empty controls are placeholders, not new candidate facts. Editing one field
  // must not turn every untouched placeholder into a proposed change.
  const draft = () => {
    const prune = (value, original) => {
      if (Array.isArray(value)) return structuredClone(value);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
        const next = prune(item, original?.[key]);
        const empty = next === '' || (next && typeof next === 'object' && !Object.keys(next).length);
        return !Object.hasOwn(original || {}, key) && empty ? [] : [[key, next]];
      }));
    };
    return prune(values, sections);
  };
  const change = () => onChange(draft());
  function field(parent, object, key, value, path) {
    const groupValue = value && typeof value === 'object' && (!Array.isArray(value) || ROWS[key] || value.some(item => typeof item !== 'string'));
    const label = document.createElement(groupValue ? 'div' : 'label'); label.className = 'prep-modal-field';
    const title = document.createElement('span'); title.textContent = fieldLabel(key); label.append(title);
    parent.append(label);
    if (Array.isArray(value) && !ROWS[key] && value.every(item => typeof item === 'string')) {
      const input = document.createElement('textarea'); input.rows = Math.max(2, Math.min(4, value.length)); input.value = value.join('\n'); label.append(input);
      label.classList.add('memory-field-wide', 'memory-list-field');
      if (key === 'targets') input.placeholder = 'One city or country per line';
      input.setAttribute('aria-label', path.map(fieldLabel).join(' / '));
      input.oninput = () => { object[key] = input.value.split('\n').filter(Boolean); change(); };
    } else if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        const group = document.createElement('fieldset'); label.append(group);
        const legend = document.createElement('legend'); legend.textContent = `${key === 'experience' ? 'Role' : key === 'education' ? 'Education' : 'Entry'} ${index + 1}`; group.append(legend);
        for (const [name, child] of Object.entries(item)) field(group, item, name, child, [...path, name]);
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove entry'; group.append(remove);
        remove.onclick = () => { value.splice(index, 1); change(); renderStructuredMemory(container, draft(), onChange); };
      }
    } else if (value && typeof value === 'object') {
      const group = document.createElement('fieldset'); label.append(group);
      for (const [name, child] of Object.entries(value)) field(group, value, name, child, [...path, name]);
    } else {
      const multiline = typeof value !== 'boolean' && (/rules|notes|background|resume|description|bullet/i.test(key) || String(value || '').length > 100);
      const input = document.createElement(multiline ? 'textarea' : 'input');
      if (multiline) label.classList.add('memory-field-wide');
      input.setAttribute('aria-label', path.map(fieldLabel).join(' / '));
      if (typeof value === 'boolean') { input.type = 'checkbox'; input.checked = value; label.classList.add('memory-checkbox-field'); }
      else { if (multiline) input.rows = 3; else input.type = typeof value === 'number' ? 'number' : 'text'; input.value = value ?? ''; }
      if (typeof value === 'boolean') label.prepend(input);
      else label.append(input);
      input.oninput = () => { object[key] = typeof value === 'boolean' ? input.checked : typeof value === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value; change(); };
    }
    if (ROWS[key]) {
      const add = document.createElement('button'); add.type = 'button'; add.textContent = `Add ${key}`; label.append(add);
      add.onclick = () => { (object[key] ||= []).push(structuredClone(ROWS[key])); change(); renderStructuredMemory(container, draft(), onChange); };
    }
  }
  const navigation = document.createElement('div'); navigation.className = 'memory-sections'; navigation.setAttribute('role', 'group'); navigation.setAttribute('aria-label', 'Memory sections'); container.append(navigation);
  const show = section => {
    container.dataset.section = section;
    container.querySelectorAll(':scope > fieldset').forEach(group => { group.hidden = group.dataset.section !== section; });
    navigation.querySelectorAll('button').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.section === section)); });
  };
  for (const section of Object.keys(DEFAULTS)) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'btn'; tab.dataset.section = section; tab.textContent = SECTION_LABELS[section]; tab.onclick = () => show(section); navigation.append(tab);
    const group = document.createElement('fieldset'); group.dataset.section = section; group.className = 'memory-section'; const legend = document.createElement('legend'); legend.textContent = SECTION_LABELS[section]; group.append(legend); container.append(group);
    const hint = document.createElement('p'); hint.className = 'memory-section-help'; hint.textContent = SECTION_HINTS[section]; group.append(hint);
    values[section] = { ...structuredClone(DEFAULTS[section]), ...values[section] };
    if (section === 'facts') values.facts.links = { ...DEFAULTS.facts.links, ...values.facts.links };
    for (const [key, value] of Object.entries(values[section])) field(group, values[section], key, value, [section, key]);
  }
  show(container.dataset.section || 'facts');
}
