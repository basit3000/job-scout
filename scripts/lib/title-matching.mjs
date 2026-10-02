/** Conservative spelling/wording aliases. Keep the original title and every qualifier. */
export function titleVariants(title) {
  const original = String(title || '').trim();
  const canonical = original
    .replace(/\bsoftware[-\s]+dev(?:elopment)?[-\s]+engineer\b/gi, 'Software Engineer')
    .replace(/\b(back|front)[-\s]+end\b/gi, '$1end')
    .replace(/\bfull[-\s]*stack\b/gi, 'Full Stack')
    .replace(/\bsoftware[-\s]*entwickler(in)?\b/gi, 'Softwareentwickler$1');
  return [...new Set([original, canonical])];
}

export function matchesTitlePatterns(title, patterns) {
  return titleVariants(title).some(value => patterns.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  }));
}

/** Search common spelling variants too; no unrelated role families or new seniority. */
export function expandSearchTitles(titles) {
  return [...new Set(titles.flatMap(title => {
    if (!/\bsoftware engineer\b/i.test(title)) return [title];
    return [title, title.replace(/\bsoftware engineer\b/i, 'Software Development Engineer')];
  }))];
}
