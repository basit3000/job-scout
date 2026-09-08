import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './common.mjs';

async function readRel(rel) {
  return readFile(join(ROOT, rel), 'utf8');
}

describe('skill copies stay in sync', () => {
  it('job-scout SKILL.md matches root SKILL.md', async () => {
    const canonical = await readRel('SKILL.md');
    const agents = await readRel('.agents/skills/job-scout/SKILL.md');
    const claude = await readRel('.claude/skills/job-scout/SKILL.md');
    assert.equal(agents, canonical, 'Copy root SKILL.md → .agents/skills/job-scout/SKILL.md');
    assert.equal(claude, canonical, 'Copy root SKILL.md → .claude/skills/job-scout/SKILL.md');
  });

  it('job-scout skill READMEs match each other', async () => {
    const agents = await readRel('.agents/skills/job-scout/README.md');
    const claude = await readRel('.claude/skills/job-scout/README.md');
    assert.equal(claude, agents, 'Keep .agents and .claude job-scout README.md identical');
  });
});
