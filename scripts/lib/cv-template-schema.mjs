export function validateTemplateIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 6
    || ids.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id))) {
    throw new Error('Select between one and six CV templates.');
  }
  return [...new Set(ids)];
}

export function validateCvTemplate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid CV template.');
  validateTemplateIds([value.id]);
  if (value.id === 'default') throw new Error('The default template is reserved.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100) throw new Error('Enter a template name of 1–100 characters.');
  const layout = value.layout;
  if (!layout || typeof layout !== 'object') throw new Error('Template formatting is required.');
  const limits = { widthMm: [100, 400], heightMm: [100, 500], marginTopMm: [0, 60], marginBottomMm: [0, 60],
    marginLeftMm: [0, 60], marginRightMm: [0, 60], bodyPt: [8, 24], namePt: [10, 48], headingPt: [8, 28],
    contactPt: [8, 24], lineHeight: [1, 2], paragraphAfterPt: [0, 24], sectionBeforePt: [0, 30], bulletIndentPt: [8, 72] };
  const clean = {};
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (!Number.isFinite(layout[key]) || layout[key] < min || layout[key] > max) throw new Error(`Unsupported template measurement: ${key}`);
    clean[key] = layout[key];
  }
  if (clean.widthMm - clean.marginLeftMm - clean.marginRightMm < 50
    || clean.heightMm - clean.marginTopMm - clean.marginBottomMm < 50) throw new Error('Template margins leave too little space for text.');
  if (!/^[\p{L}\p{N} ._-]{1,80}$/u.test(layout.font || '')) throw new Error('Unsupported template font name.');
  if (!/^[0-9a-f]{6}$/i.test(layout.color || '')) throw new Error('Invalid template text color.');
  if (!['left', 'center', 'right'].includes(layout.headerAlign)) throw new Error('Invalid template alignment.');
  if (typeof layout.headingUppercase !== 'boolean' || typeof layout.headingRule !== 'boolean') throw new Error('Invalid heading formatting.');
  Object.assign(clean, { font: layout.font, color: layout.color, headerAlign: layout.headerAlign,
    headingUppercase: layout.headingUppercase, headingRule: layout.headingRule });
  const allowed = ['Education', 'Experience', 'Projects', 'Skills', 'Summary', 'Certifications', 'Languages', 'Awards', 'Publications', 'Volunteering'];
  if (!Array.isArray(value.sectionOrder) || value.sectionOrder.some(x => !allowed.includes(x))) throw new Error('Unsupported template section order.');
  if (!Number.isInteger(value.maxPages) || value.maxPages < 1 || value.maxPages > 10) throw new Error('Template page limit must be 1–10.');
  return { id: value.id, name: value.name.trim(), layout: clean, sectionOrder: [...new Set(value.sectionOrder)], maxPages: value.maxPages };
}
