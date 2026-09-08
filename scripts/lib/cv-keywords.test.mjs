import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeKeywordGaps,
  cleanJobTitle,
  honestHeadlineTitle,
  isGermanPosting,
  detectPostingLanguage,
  detectGermanRequirement,
  postingWrittenLanguage,
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

  it('does not treat umlauts in a city or company as a German-language ad', () => {
    const job = {
      title: 'Software Developer ServiceNow (all genders) - Düsseldorf',
      description: 'You will implement ServiceNow modules with our international team. English is the working language.',
    };
    assert.equal(postingWrittenLanguage(job), 'en');
    assert.equal(isGermanPosting(job), false);
    assert.equal(detectPostingLanguage(job), 'en');
  });

  it('puts English ads that require C1/fluent German in the German filter', () => {
    const c1 = {
      title: 'Forward Deployed AI Engineer',
      description: 'You will own APIs and ship with customers. Fluent German and strong English are required.',
    };
    assert.equal(postingWrittenLanguage(c1), 'en');
    assert.equal(detectGermanRequirement(c1), 'required');
    assert.equal(detectPostingLanguage(c1), 'de');
    assert.equal(jobMatchesLanguageFilter(c1, 'en'), false);
    assert.equal(jobMatchesLanguageFilter(c1, 'de'), true);

    const niveau = {
      title: 'Software Engineer',
      description: 'Excellent communication skills in English and German (C1 or above). You will own APIs.',
    };
    assert.equal(detectPostingLanguage(niveau), 'de');
  });

  it('keeps English ads when German is only a plus or either language is fine', () => {
    const plus = {
      title: 'Backend Engineer',
      description: 'English is the working language. German is a plus. You will own APIs.',
    };
    assert.equal(detectGermanRequirement(plus), 'optional');
    assert.equal(detectPostingLanguage(plus), 'en');

    const either = {
      title: 'Software Engineer',
      description: 'You will own APIs. English or German is fine for daily communication.',
    };
    assert.equal(detectPostingLanguage(either), 'en');
  });
});
