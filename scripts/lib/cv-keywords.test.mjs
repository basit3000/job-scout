import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeKeywordGaps,
  honestHeadlineTitle,
  isGermanPosting,
  detectPostingLanguage,
  jobMatchesLanguageFilter,
  formatKeywordGapsMarkdown,
} from './cv-keywords.mjs';

describe('cv-keywords', () => {
  it('does not promote a Senior title the candidate does not hold', () => {
    assert.equal(
      honestHeadlineTitle('Senior Software Engineer', 'Full-Stack Software Developer'),
      'Full-Stack Software Developer',
    );
    assert.match(honestHeadlineTitle('Full Stack Engineer', 'Software Developer'), /Full Stack Engineer/i);
  });

  it('splits posting phrases into on-CV / promote / gap', () => {
    const analysis = analyzeKeywordGaps({
      job: {
        title: 'Full Stack Engineer',
        description: 'Python, FastAPI, Docker, Kubernetes, REST APIs, and Ruby required.',
      },
      cvText: 'Python FastAPI REST APIs MongoDB',
      evidenceText: 'Docker Jenkins',
      profile: {
        targetRole: 'Full-Stack Software Developer',
        skills: { strong: ['Python', 'FastAPI'], familiar: ['Docker'] },
      },
    });
    assert.ok(analysis.onCv.includes('Python'));
    assert.ok(analysis.onCv.includes('FastAPI'));
    assert.ok(analysis.promote.includes('Docker'));
    assert.ok(analysis.gaps.includes('Kubernetes'));
    assert.ok(analysis.gaps.includes('Ruby') === false); // Ruby is not in the phrase lexicon
    assert.match(analysis.headline, /Python/);
    assert.doesNotMatch(analysis.headline, /Senior/);
  });

  it('flags German postings for bilingual pairing', () => {
    assert.equal(
      isGermanPosting({ title: 'Softwareentwickler', description: 'Berufserfahrung mit REST-APIs' }),
      true,
    );
    const md = formatKeywordGapsMarkdown(
      { onCv: ['Python'], promote: ['Docker'], gaps: ['Kubernetes'], headline: 'Software Developer — Python', german: true },
      { title: 'Softwareentwickler', company: 'Acme' },
    );
    assert.match(md, /German/);
    assert.match(md, /do not invent/i);
    assert.match(md, /evidence sentence/);
  });

  it('classifies posting language for the Results filter', () => {
    assert.equal(detectPostingLanguage({ title: 'Softwareentwickler (m/w/d)' }), 'de');
    assert.equal(detectPostingLanguage({ title: 'Software Engineer', description: 'You will own APIs.' }), 'en');
    assert.equal(jobMatchesLanguageFilter({ language: 'de' }, 'all'), true);
    assert.equal(jobMatchesLanguageFilter({ language: 'de' }, 'de'), true);
    assert.equal(jobMatchesLanguageFilter({ language: 'de' }, 'en'), false);
    assert.equal(jobMatchesLanguageFilter({ title: 'Backend Engineer' }, 'en'), true);
  });
});
