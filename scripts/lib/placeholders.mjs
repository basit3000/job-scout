// Detect unset template values so we never search for the literal string "YOUR_JOB_TITLE".

const PLACEHOLDER = /\bYOUR_[A-Z0-9_]+\b/;

export function isPlaceholder(value) {
  if (value == null) return false;
  if (typeof value === 'boolean' || typeof value === 'number') return false;
  return PLACEHOLDER.test(String(value));
}

export function findPlaceholders(value, path = '') {
  const hits = [];
  if (value == null) return hits;
  if (typeof value === 'string') {
    if (isPlaceholder(value)) hits.push({ path: path || '(root)', value });
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...findPlaceholders(item, `${path}[${i}]`)));
    return hits;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('_')) continue; // documentation keys
      hits.push(...findPlaceholders(v, path ? `${path}.${k}` : k));
    }
  }
  return hits;
}

export function assertNoPlaceholders(label, obj) {
  const hits = findPlaceholders(obj);
  if (!hits.length) return;
  console.error(`${label} still has unset YOUR_* placeholders:`);
  for (const h of hits.slice(0, 20)) console.error(`  - ${h.path}: ${JSON.stringify(h.value)}`);
  if (hits.length > 20) console.error(`  …and ${hits.length - 20} more`);
  console.error('Replace them in profile.json / cv/resume.md before running. Ask the user if unknown.');
  process.exit(1);
}
