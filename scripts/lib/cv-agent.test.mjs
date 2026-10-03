import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentPrompt,
  buildAgentBrief,
  buildCoverLetterAgentPrompt,
  buildCoverLetterAgentBrief,
  buildReviewerBrief,
  buildReviewerPrompt,
  buildRepairBrief,
  inlineReviewContext,
} from './cv-prompts.mjs';

const base = {
  job: { title: 'Full Stack Engineer', company: 'Acme', url: 'https://example.com/job' },
  prepRel: '.workspace/prep/job1',
  jobPostingRel: '.workspace/prep/job1/job-posting.md',
  instructionsRel: '.workspace/prep/job1/instructions.md',
  briefRel: '.workspace/prep/job1/agent-brief.md',
  evidenceRel: '.cv-workspace/evidence.md',
  gapsRel: '.workspace/prep/job1/keyword-gaps.md',
  writingRulesRel: '.agents/skills/cv-tailor/references/writing-rules.md',
  overleafRel: '.workspace/overleaf',
  profileName: 'Alex Example',
  extraInstructions: '',
};

describe('buildAgentPrompt', () => {
  it('does not send the agent on a research scavenger hunt', () => {
    const prompt = buildAgentPrompt({ ...base, cvSource: 'overleaf' });
    assert.match(prompt, /supplied evidence and constraints/);
    assert.match(prompt, /agent-brief\.md/);
    assert.match(prompt, /keyword-gaps\.md/);
    assert.match(prompt, /\.workspace\/overleaf\/main\.tex/);
    assert.doesNotMatch(prompt, /SKILL\.md/);
    assert.doesNotMatch(prompt, /gather-evidence/);
    assert.doesNotMatch(prompt, /format-benchmarks/);
    assert.doesNotMatch(prompt, /check-onepage/);
    assert.doesNotMatch(prompt, /git:\$OVERLEAF_GIT_TOKEN/);
    assert.match(prompt, /host handles rendering, review and publication/);
  });

  it('local mode writes cv.md instead of Overleaf', () => {
    const prompt = buildAgentPrompt({ ...base, cvSource: 'local' });
    assert.match(prompt, /cv\.md/);
    assert.doesNotMatch(prompt, /Surgically edit/);
  });
});

describe('buildAgentBrief', () => {
  it('keeps shared instructions neutral and concise', () => {
    const brief = buildAgentBrief({ localRules: '' });
    assert.doesNotMatch(brief, /SKILL\.md|four section|Experience.*Education.*Projects.*Skills|Kind regards|native|First screen/);
    assert.match(brief, /Report missing or conflicting evidence/);
    assert.match(brief, /host renders, validates and publishes/);
    assert.ok(brief.length < 2500);
  });

  it('keeps candidate-specific rules out of the public brief', () => {
    const brief = buildAgentBrief({ cvSource: 'overleaf', localRules: '' });
    assert.doesNotMatch(brief, /Candidate-specific rules/);
    assert.doesNotMatch(brief, /e\.solutions/);
    assert.doesNotMatch(brief, /A-levels/);
    const letter = buildCoverLetterAgentBrief({ localRules: '' });
    assert.doesNotMatch(letter, /e\.solutions/);
    assert.doesNotMatch(letter, /A-levels/);
    assert.doesNotMatch(letter, /Claude Code,/);
  });

  it('appends candidate-specific rules from the local overlay', () => {
    const brief = buildAgentBrief({
      cvSource: 'overleaf',
      localRules: '- Current employer is ~90% backend.',
    });
    assert.match(brief, /Candidate-specific rules \(local overlay\)/);
    assert.match(brief, /~90% backend/);
  });
});

describe('buildCoverLetterAgentPrompt', () => {
  it('describes the current failure policy without promising a keyword fallback', () => {
    const brief = buildCoverLetterAgentBrief({ localRules: '' });
    assert.match(brief, /preserve previously accepted documents/);
    assert.doesNotMatch(brief, /keyword draft ships|ships the keyword draft/);
  });

  it('edits the letter with the same evidence files as the CV', () => {
    const prompt = buildCoverLetterAgentPrompt({
      ...base,
      letterRel: '.workspace/prep/job1/cover-letter.md',
      cvRel: '.workspace/prep/job1/cv.md',
      notesRel: '.workspace/prep/job1/cover-letter-notes.md',
      extraInstructions: 'Lead with backend / FastAPI / APIs',
    });
    assert.match(prompt, /consistent with the supplied CV and evidence/);
    assert.match(prompt, /cover-letter\.md/);
    assert.match(prompt, /keyword-gaps\.md/);
    assert.match(prompt, /writing-rules\.md/);
    assert.match(prompt, /Lead with backend/);
    assert.match(prompt, /cover-letter-notes\.md/);
    assert.doesNotMatch(prompt, /Surgically edit \.workspace\/overleaf/);
  });
});

describe('buildCoverLetterAgentBrief', () => {
  it('uses the source letter template without prescribing a personal sign-off', () => {
    const brief = buildCoverLetterAgentBrief({ localRules: '' });
    assert.match(brief, /source template and configured preferences/);
    assert.match(brief, /Leave the CV unchanged/);
    assert.doesNotMatch(brief, /Kind regards|Application for|native|SKILL\.md/);
  });
});

describe('buildReviewerBrief', () => {
  it('forbids rewriting and asks for a verdict file', () => {
    const brief = buildReviewerBrief({ scope: 'cv', localRules: '' });
    assert.match(brief, /Review the CV/);
    assert.match(brief, /Write only the review file/);
    assert.match(brief, /Verdict/);
    assert.match(brief, /Must fix/);
    assert.doesNotMatch(brief, /Surgically edit/);
  });

  it('letter scope checks letter shape', () => {
    const brief = buildReviewerBrief({ scope: 'letter', localRules: '' });
    assert.match(brief, /cover letter/i);
    assert.doesNotMatch(brief, /Kind regards/);
  });
});

describe('buildReviewerPrompt', () => {
  it('writes review.md and does not edit Overleaf', () => {
    const prompt = buildReviewerPrompt({
      ...base,
      qualityRel: '.workspace/prep/job1/quality-report.md',
      cvRel: '.workspace/prep/job1/cv.md',
      letterRel: '.workspace/prep/job1/cover-letter.md',
      scope: 'cv',
    });
    assert.match(prompt, /reviewer/);
    assert.match(prompt, /review\.md/);
    assert.match(prompt, /Verdict: pass/);
    assert.match(prompt, /Do not edit any other file/);
    assert.doesNotMatch(prompt, /Surgically edit/);
  });

  it('letter review writes cover-letter-review.md', () => {
    const prompt = buildReviewerPrompt({
      ...base,
      qualityRel: '.workspace/prep/job1/quality-report.md',
      cvRel: '.workspace/prep/job1/cv.md',
      letterRel: '.workspace/prep/job1/cover-letter.md',
      scope: 'letter',
    });
    assert.match(prompt, /cover-letter-review\.md/);
    assert.match(prompt, /cover-letter\.md/);
  });
});

describe('buildAgentPrompt extraReads', () => {
  it('prefers the tailored cv.md when present', () => {
    const prompt = buildAgentPrompt({
      ...base,
      cvSource: 'local',
      cvRel: '.workspace/prep/job1/cv.md',
      extraReads: ['.workspace/prep/job1/review.md'],
    });
    assert.match(prompt, /\.workspace\/prep\/job1\/cv\.md/);
    assert.match(prompt, /review\.md/);
  });
});

describe('review context and repair boundaries', () => {
  it('gives reviewers candidate instructions, letter notes and final PDF text with relevant scores', () => {
    const options = { ...base, extraInstructions: 'Keep simple English', notesRel: 'notes.md', finalTextRel: 'final.md' };
    const cv = buildReviewerPrompt({ ...options, scope: 'cv' });
    assert.match(cv, /Keep simple English/);
    assert.match(cv, /final.md/);
    assert.doesNotMatch(cv, /Cover letter: n\/10/);
    const letter = buildReviewerPrompt({ ...options, scope: 'letter', letterRel: 'letter.md' });
    assert.match(letter, /notes.md/);
    assert.match(letter, /Cover letter: n\/10/);
    assert.doesNotMatch(letter, /ATS: n\/10/);
  });

  it('inlines each input once and rejects oversized context before a model call', async () => {
    const prompt = buildReviewerPrompt({ ...base, cvSource: 'overleaf', finalTextRel: 'final.md' });
    const reads = [];
    const packed = await inlineReviewContext(prompt, async (path) => { reads.push(path); return `Facts for ${path}`; });
    assert.equal(new Set(reads).size, reads.length);
    assert.ok(reads.includes('.workspace/overleaf/main.tex'));
    assert.ok(reads.includes('.workspace/overleaf/ats.tex'));
    assert.match(packed, /Do not read files or run shell commands/);
    assert.match(packed, /Facts for final.md/);
    await assert.rejects(inlineReviewContext(prompt, async () => 'x'.repeat(180_001)), /exceeds/);
  });

  it('repair has no full rewrite quota and keeps unsupported requests out', () => {
    const repair = buildRepairBrief({ letter: true });
    assert.match(repair, /Apply ONLY/);
    assert.match(repair, /never evidence/);
    assert.doesNotMatch(repair, /third to half|Every.*phrase|First screen/);
    assert.doesNotMatch(buildAgentBrief({ localRules: '' }), /Change about a third to half/);
  });

  it('omits unavailable optional context without hiding missing primary evidence', async () => {
    const options = { ...base, finalTextRel: 'final.md', notesRel: 'notes.md', scope: 'letter', letterRel: 'letter.md' };
    const prompt = buildReviewerPrompt(options);
    const missing = async path => {
      if (['notes.md', base.gapsRel].includes(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return `Primary input ${path}`;
    };
    const packet = await inlineReviewContext(prompt, missing, { optionalPaths: ['notes.md', base.gapsRel] });
    assert.match(packet, /Optional input unavailable/);
    assert.match(packet, /Primary input final.md/);
    assert.match(packet, /Primary input letter.md/);
    for (const path of [base.evidenceRel, 'final.md', 'letter.md']) {
      await assert.rejects(inlineReviewContext(prompt, async p => {
        if (p === path) throw Object.assign(new Error('essential missing'), { code: 'ENOENT' });
        return 'input';
      }, { optionalPaths: ['notes.md'] }), /essential missing/);
    }
    await assert.rejects(inlineReviewContext(prompt, async () => {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    }, { optionalPaths: [base.briefRel] }), /permission denied/);
  });
});
