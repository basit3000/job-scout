import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeKeywordGaps,
  cleanJobTitle,
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
    assert.ok(analysis.gaps.includes('Ruby')); // required, not evidenced → must not be invented
    assert.match(analysis.headline, /Python/);
    assert.doesNotMatch(analysis.headline, /Senior/);
  });

  it('cleans recruiter noise out of titles before using them as a headline', () => {
    assert.equal(cleanJobTitle('Fullstack Entwickler*in (m/w/d) - Remote'), 'Fullstack Entwickler');
    assert.equal(cleanJobTitle('Software Engineer (all genders) | Berlin'), 'Software Engineer');
    assert.equal(cleanJobTitle('Backend Developer Python 100% Vollzeit'), 'Backend Developer Python');
    assert.equal(honestHeadlineTitle('Lead Engineer (m/w/d)', 'Software Developer'), 'Software Developer');
  });

  it('picks up stack names the lexicon does not know', () => {
    const analysis = analyzeKeywordGaps({
      job: {
        title: 'Backend Engineer',
        description: [
          'Requirements',
          '- Experience with Phoenix, Elixir and ClickHouse',
          '- You have worked with Temporal.io',
          'Benefits',
          '- 30 days holiday',
        ].join('\n'),
      },
      cvText: 'Python',
      evidenceText: '',
      profile: {},
    });
    assert.ok(analysis.gaps.includes('Phoenix'));
    assert.ok(analysis.gaps.includes('Elixir'));
    assert.ok(analysis.gaps.includes('ClickHouse'));
    assert.ok(analysis.gaps.includes('Temporal.io'));
    assert.ok(analysis.requirements.some((r) => /ClickHouse/.test(r)));
    assert.ok(!analysis.requirements.some((r) => /holiday/.test(r)));
  });

  it('matches whole words only', () => {
    const analysis = analyzeKeywordGaps({
      job: { title: 'Developer', description: 'Scalable reactive services; Scala is a plus.' },
      cvText: 'We built scalable reactive services.',
    });
    assert.ok(analysis.gaps.includes('Scala'));
    assert.ok(!analysis.onCv.includes('React'));
    assert.ok(analysis.optional.includes('Scala'));
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
