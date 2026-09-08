/** Read `{...}` starting at `openIdx` (must point at `{`). Returns `{ arg, end }` or null. */
export function readBraceGroup(src, openIdx) {
  const text = String(src ?? '');
  if (text[openIdx] !== '{') return null;
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { arg: text.slice(openIdx + 1, i), end: i + 1 };
    }
  }
  return null;
}
