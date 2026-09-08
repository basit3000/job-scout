import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findStyleIssues,
  scrubFiller,
  styleRulesMarkdown,
  wordCount,
  FILLER,
  AI_TELLS,
} from './cv-style.mjs';

describe('cv-style', () => {
  it('flags generated-sounding phrases and filler, case-insensitively', () => {
    const issues = findStyleIssues('Leveraged a robust, cutting-edge stack to Spearhead delivery.');
    const kinds = issues.map((i) => `${i.kind}:${i.phrase.toLowerCase()}`);
    assert.ok(kinds.includes('ai-tell:leveraged'));
    assert.ok(kinds.includes('ai-tell:spearhead'));
    assert.ok(kinds.includes('filler:robust'));
    assert.ok(kinds.includes('filler:cutting-edge'));
  });

  it('does not match inside longer words or hyphenated names', () => {
    const issues = findStyleIssues('Built the journeyman-tool and the reactive-landscape-viewer.');
    assert.equal(issues.filter((i) => i.kind === 'ai-tell').length, 0);
  });

  it('treats inflation as hard only on personal projects', () => {
    const text = 'Led a team of engineers on the service.';
    assert.equal(findStyleIssues(text, { personalProject: false }).filter((i) => i.kind === 'inflation').length, 0);
    const proj = findStyleIssues(text, { personalProject: true }).filter((i) => i.kind === 'inflation');
    assert.ok(proj.length >= 1);
    assert.ok(proj.every((i) => i.severity === 'hard'));
  });

  it('reports weak openers and over-long bullets only in bullet mode', () => {
    const weak = findStyleIssues('Responsible for the API.', { bullet: true });
    assert.ok(weak.some((i) => i.kind === 'weak-opener'));
    assert.equal(findStyleIssues('Responsible for the API.').filter((i) => i.kind === 'weak-opener').length, 0);
    const long = findStyleIssues(`Built ${'x'.repeat(240)}.`, { bullet: true });
    assert.ok(long.some((i) => i.kind === 'length'));
  });

  it('flags exclamation marks but not HTML comment markers', () => {
    assert.ok(findStyleIssues('Great fit!').some((i) => i.kind === 'exclamation'));
    assert.equal(findStyleIssues('<!-- include:past -->').filter((i) => i.kind === 'exclamation').length, 0);
  });

  it('scrubs filler without touching facts or names', () => {
    const { text, removed } = scrubFiller('Successfully migrated the robust Flask services to FastAPI.');
    assert.equal(text, 'Migrated the Flask services to FastAPI.');
    assert.deepEqual(removed.map((w) => w.toLowerCase()), ['successfully', 'robust']);
    const untouched = scrubFiller('Courses: Advanced Database Systems; Dynamic IP Updater.');
    assert.equal(untouched.removed.length, 0);
    assert.ok(!FILLER.includes('advanced') && !FILLER.includes('dynamic'));
  });

  it('never empties a string made only of filler', () => {
    assert.equal(scrubFiller('Robust').text, 'Robust');
  });

  it('brief markdown lists the same phrases the verifier checks', () => {
    const md = styleRulesMarkdown({ context: 'letter' });
    for (const p of AI_TELLS.slice(0, 5)) assert.ok(md.includes(p), p);
    assert.match(md, /Body \d+–\d+ words/);
    assert.ok(!styleRulesMarkdown({ context: 'cv' }).includes('Body '));
  });

  it('counts words ignoring LaTeX macros', () => {
    assert.equal(wordCount('\\item Built the \\textbf{service} in Go.'), 5);
  });
});
