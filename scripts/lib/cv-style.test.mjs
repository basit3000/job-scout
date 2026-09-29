import test from 'node:test';
import assert from 'node:assert/strict';
import { findStyleIssues, scrubFiller, styleRulesMarkdown, wordCount } from './cv-style.mjs';
import { validatePromptSettings } from './prompt-settings.mjs';

const settings = validatePromptSettings({ style: { filler: ['robust', 'successfully'],
  discouragedPhrases: ['leverage'], weakOpeners: ['responsible for'], maxBulletChars: 50, avoidDashes: true } });

test('neutral style does not label an author voice or leadership as a failure', () => {
  assert.deepEqual(findStyleIssues('Successfully led a robust team!'), []);
  assert.equal(styleRulesMarkdown(), '');
  assert.equal(scrubFiller('Successfully built the service.').text, 'Successfully built the service.');
});

test('configured wording checks are advisory and use complete words', () => {
  const issues = findStyleIssues('Leverage a robust service.', { settings });
  assert.deepEqual(issues.map(i => i.kind).sort(), ['filler', 'wording']);
  assert.ok(issues.every(i => i.severity === 'soft'));
  assert.deepEqual(findStyleIssues('The robust-tool is complete.', { settings }), []);
});

test('configured bullet limits and openers apply only to bullets', () => {
  const text = 'Responsible for ' + 'long text '.repeat(10);
  assert.deepEqual(findStyleIssues(text, { settings }), []);
  assert.deepEqual(findStyleIssues(text, { settings, bullet: true }).map(i => i.kind), ['weak-opener', 'length']);
});

test('explicit filler scrubbing preserves non-matching text and never empties content', () => {
  assert.equal(scrubFiller('Successfully built robust APIs.', settings.style.filler).text, 'Built APIs.');
  assert.equal(scrubFiller('Robust', settings.style.filler).text, 'Robust');
  assert.equal(scrubFiller('Advanced Data Systems', settings.style.filler).text, 'Advanced Data Systems');
});

test('the style brief uses the same local settings as the checker', () => {
  const brief = styleRulesMarkdown({ settings });
  assert.match(brief, /leverage/);
  assert.match(brief, /robust/);
  assert.match(brief, /50 characters/);
  assert.doesNotMatch(brief, /\b(?:native|ChatGPT|Banned)\b/);
});

test('word counting ignores LaTeX commands', () => {
  assert.equal(wordCount(String.raw`\item Built the \textbf{service} in Go.`), 5);
});
