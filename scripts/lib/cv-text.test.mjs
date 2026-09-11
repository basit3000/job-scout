import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDashes } from './cv-text.mjs';

describe('sanitizeDashes — date ranges', () => {
  it('turns an en dash range into "to"', () => {
    assert.equal(sanitizeDashes('Mar 2026 – Present'), 'Mar 2026 to Present');
    assert.equal(sanitizeDashes('Oct 2022 – Aug 2026'), 'Oct 2022 to Aug 2026');
  });

  it('handles a bare year range with no spaces', () => {
    assert.equal(sanitizeDashes('2022–2026'), '2022 to 2026');
  });

  it('handles a plain hyphen range', () => {
    assert.equal(sanitizeDashes('Aug 2021 - Jul 2022'), 'Aug 2021 to Jul 2022');
  });

  it('accepts German month names and open ends', () => {
    assert.equal(sanitizeDashes('Mär 2026 – heute'), 'Mär 2026 to heute');
  });
});

describe('sanitizeDashes — asides', () => {
  it('replaces an em dash aside with a comma', () => {
    assert.equal(
      sanitizeDashes('graded 1.0 — the highest grade — on the German scale'),
      'graded 1.0, the highest grade, on the German scale',
    );
  });

  it('replaces a spaced hyphen aside with a comma', () => {
    assert.equal(sanitizeDashes('a spaced - hyphen aside'), 'a spaced, hyphen aside');
  });

  it('uses a colon after a bold label, where a comma would read wrong', () => {
    assert.equal(
      sanitizeDashes('**Churn Analysis** — Predictive models in Python.'),
      '**Churn Analysis**: Predictive models in Python.',
    );
  });

  it('drops a dash that only opens the line', () => {
    assert.equal(sanitizeDashes('— leading aside'), 'leading aside');
  });

  it('does not leave doubled punctuation behind', () => {
    assert.equal(sanitizeDashes('Python, — FastAPI'), 'Python, FastAPI');
  });
});

describe('sanitizeDashes — what it must not touch', () => {
  it('keeps compound hyphens inside words', () => {
    const s = 'real-time AI-native SAT-based context-aware non-technical work';
    assert.equal(sanitizeDashes(s), s);
  });

  it('keeps slashes and other punctuation alone', () => {
    const s = 'CI/CD, ruff/mypy, TypeScript/JavaScript';
    assert.equal(sanitizeDashes(s), s);
  });

  it('is a no-op on text that already obeys the rule', () => {
    const s = 'Built backend services and REST APIs with Python and FastAPI.';
    assert.equal(sanitizeDashes(s), s);
  });

  it('handles empty and nullish input', () => {
    assert.equal(sanitizeDashes(''), '');
    assert.equal(sanitizeDashes(null), '');
    assert.equal(sanitizeDashes(undefined), '');
  });
});
