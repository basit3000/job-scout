import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentPrompt,
  buildAgentBrief,
  buildCoverLetterAgentPrompt,
  buildCoverLetterAgentBrief,
} from './cv-agent.mjs';

const base = {
  job: { title: 'Full Stack Engineer', company: 'Acme', url: 'https://example.com/job' },
  prepRel: '.workspace/prep/job1',
  jobPostingRel: '.workspace/prep/job1/job-posting.md',
  instructionsRel: '.workspace/prep/job1/instructions.md',
  briefRel: '.workspace/prep/job1/agent-brief.md',
  evidenceRel: '.cv-workspace/evidence.md',
  techStackRel: 'cv/tech-stack.md',
  gapsRel: '.workspace/prep/job1/keyword-gaps.md',
  writingRulesRel: '.agents/skills/cv-tailor/references/writing-rules.md',
  overleafRel: '.workspace/overleaf',
  profileName: 'Muhammad Basit Zaheer',
  extraInstructions: '',
};

describe('buildAgentPrompt', () => {
  it('does not send the agent on a research scavenger hunt', () => {
    const prompt = buildAgentPrompt({ ...base, cvSource: 'overleaf' });
    assert.match(prompt, /execute, do not research/);
    assert.match(prompt, /agent-brief\.md/);
    assert.match(prompt, /keyword-gaps\.md/);
    assert.match(prompt, /\.workspace\/overleaf\/main\.tex/);
    assert.doesNotMatch(prompt, /SKILL\.md/);
    assert.doesNotMatch(prompt, /gather-evidence/);
    assert.doesNotMatch(prompt, /format-benchmarks/);
    assert.doesNotMatch(prompt, /check-onepage/);
    assert.doesNotMatch(prompt, /git:\$OVERLEAF_GIT_TOKEN/);
    assert.match(prompt, /Do not clone, compile, commit, or push/);
  });

  it('local mode writes cv.md instead of Overleaf', () => {
    const prompt = buildAgentPrompt({ ...base, cvSource: 'local' });
    assert.match(prompt, /cv\.md/);
    assert.doesNotMatch(prompt, /Surgically edit/);
  });
});

describe('buildAgentBrief', () => {
  it('forbids the expensive skill steps', () => {
    const brief = buildAgentBrief({ cvSource: 'overleaf' });
    assert.match(brief, /Do not read SKILL\.md/);
    assert.match(brief, /Do not run gather-evidence/);
    assert.match(brief, /Do not git clone Overleaf/);
    assert.match(brief, /Do not compile LaTeX/);
    assert.match(brief, /\.workspace\/overleaf/);
    assert.doesNotMatch(brief, /Spend a couple of searches/);
    assert.match(brief, /First screen/);
    assert.match(brief, /keyword-gaps\.md/);
    assert.match(brief, /evidence sentence/);
  });
});

describe('buildCoverLetterAgentPrompt', () => {
  it('edits the letter with the same evidence files as the CV', () => {
    const prompt = buildCoverLetterAgentPrompt({
      ...base,
      letterRel: '.workspace/prep/job1/cover-letter.md',
      cvRel: '.workspace/prep/job1/cv.md',
      extraInstructions: 'Lead with backend / FastAPI / APIs',
    });
    assert.match(prompt, /same skill rules and extra instructions/);
    assert.match(prompt, /cover-letter\.md/);
    assert.match(prompt, /keyword-gaps\.md/);
    assert.match(prompt, /writing-rules\.md/);
    assert.match(prompt, /Lead with backend/);
    assert.doesNotMatch(prompt, /Surgically edit \.workspace\/overleaf/);
  });
});

describe('buildCoverLetterAgentBrief', () => {
  it('reuses CV skill rules and letter layout', () => {
    const brief = buildCoverLetterAgentBrief();
    assert.match(brief, /No invented facts/);
    assert.match(brief, /keyword-gaps\.md/);
    assert.match(brief, /Kind regards/);
    assert.match(brief, /edit the CV files/);
    assert.match(brief, /em dashes/);
  });
});
