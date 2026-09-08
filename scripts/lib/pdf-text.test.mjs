import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAtsText } from './pdf-text.mjs';

const CLEAN = `Jane Doe
Software Developer – Python, Docker
Germany · jane@example.com · +49 170 1234567
Experience
Software Developer, Acme GmbH 05/2024 – Present
• Maintain the FastAPI backend on PostgreSQL.
Education
TU Berlin 10/2022 – Present
Projects
• Tool – CLI in Go.
Skills
Python, Go, Docker, PostgreSQL
`;

test('a clean text layer passes with the contact facts intact', () => {
  const r = checkAtsText(CLEAN, { email: 'jane@example.com', phone: '+49 170 1234567', name: 'Jane Doe' });
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
});

test('kerning splits, private-use glyphs and missing headings are problems', () => {
  const broken = CLEAN
    .replace('Software Developer, Acme', 'W orking Student, Acme')
    .replace('Skills', 'Skil\uE001s')
    .replace('jane@example.com', 'jane@ example.com');
  const r = checkAtsText(broken, { email: 'jane@example.com' });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /W orking/.test(p)));
  assert.ok(r.problems.some((p) => /unmapped glyph/.test(p)));
  assert.ok(r.problems.some((p) => /e-mail/.test(p)));
  assert.ok(r.problems.some((p) => /Skills/.test(p)));
});

test('ligature code points and missing expected words are warnings, not failures', () => {
  const r = checkAtsText(CLEAN.replace('Maintain', 'Con\uFB01gure'), { expectWords: ['Kubernetes'] });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /ligature/.test(w)));
  assert.ok(r.warnings.some((w) => /Kubernetes/.test(w)));
});

test('an empty text layer is the worst case', () => {
  const r = checkAtsText('');
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /image-only/);
});
