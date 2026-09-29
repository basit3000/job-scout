const $ = id => document.getElementById(id);
export const selectedCvTemplates = (container = $('cvTemplateChoices')) => [...container.querySelectorAll('input:checked')].map(input => input.value);

export function renderCvTemplates(templates, container = $('cvTemplateChoices'), selected = []) {
  container.replaceChildren();
  for (const template of templates) {
    const row = document.createElement('div');
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = template.id;
    input.checked = selected.includes(template.id) || (templates.length === 1 && template.id === 'default');
    label.append(input, ` ${template.name}`); row.append(label);
    if (template.layout) {
      const link = document.createElement('a');
      link.href = `/api/cv-templates/preview?id=${encodeURIComponent(template.id)}`;
      link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Preview'; link.className = 'btn small';
      row.append(' ', link);
      const rules = document.createElement('a');
      rules.href = `/api/cv-templates/rules?id=${encodeURIComponent(template.id)}`;
      rules.target = '_blank'; rules.rel = 'noopener'; rules.textContent = 'Rules'; rules.className = 'btn small';
      row.append(' ', rules);
      const details = document.createElement('small');
      details.textContent = `${template.layout.font}, ${template.layout.bodyPt} pt · ${template.maxPages} page limit · ${template.sectionOrder.join(' → ')}`;
      row.append(details);
    }
    container.append(row);
  }
}

export function bindTemplateImport(api, onChange, isClosed) {
  $('cvTemplateImport').onclick = async () => {
    const file = $('cvTemplateFile').files[0];
    const name = $('cvTemplateName').value.trim() || file?.name.replace(/\.docx$/i, '');
    const maxPages = Number($('cvTemplatePages').value);
    const status = $('cvTemplateStatus');
    if (!file || !/\.docx$/i.test(file.name) || file.size > 8 * 1024 * 1024) { status.textContent = 'Choose a Word .docx file up to 8 MB.'; return; }
    const button = $('cvTemplateImport'); button.disabled = true; status.textContent = 'Extracting formatting…';
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file);
      });
      if (isClosed()) return;
      const imported = await api('/api/cv-templates', { method: 'POST', body: JSON.stringify({ filename: file.name,
        name, maxPages, base64 }) });
      const { templates } = await api('/api/cv-templates');
      if (isClosed()) return;
      renderCvTemplates(templates, $('cvTemplateChoices'), [...selectedCvTemplates(), imported.template.id]);
      status.textContent = `Saved ${imported.template.name}. ${imported.warnings.join(' ')}`;
      onChange();
    } catch (error) { if (!isClosed()) status.textContent = error.message; }
    finally { if (!isClosed()) button.disabled = false; }
  };
}
