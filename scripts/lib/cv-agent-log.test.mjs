import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  redactSecrets,
  formatToolDetail,
  formatAgentEvent,
  formatFinishLine,
  formatUsageShort,
} from './cv-agent-log.mjs';

describe('cv-agent-log', () => {
  it('redacts git tokens in clone URLs', () => {
    assert.equal(
      redactSecrets('git clone https://git:secret-token@git.overleaf.com/abc'),
      'git clone https://git:***@git.overleaf.com/abc',
    );
  });

  it('formats read/shell/search tool details', () => {
    assert.equal(formatToolDetail('read', { path: '.workspace/overleaf/ats.tex' }), '.workspace/overleaf/ats.tex');
    assert.equal(
      formatToolDetail('shell', { command: 'git clone https://git:tok@git.overleaf.com/x' }),
      'git clone https://git:***@git.overleaf.com/x',
    );
    assert.equal(formatToolDetail('grep', { pattern: 'LiteLLM' }), 'LiteLLM');
  });

  it('logs a tool once on running and skips the completed echo', () => {
    const stats = { tools: 0, started: new Set() };
    const start = formatAgentEvent(
      { type: 'tool_call', call_id: '1', name: 'read', status: 'running', args: { path: 'cv/tech-stack.md' } },
      stats,
    );
    const done = formatAgentEvent(
      { type: 'tool_call', call_id: '1', name: 'read', status: 'completed', args: { path: 'cv/tech-stack.md' } },
      stats,
    );
    assert.deepEqual(start, { line: '→ read  cv/tech-stack.md', stream: 'tool' });
    assert.equal(done, null);
    assert.equal(stats.tools, 1);
  });

  it('skips assistant prose so the log is not a token dump', () => {
    const line = formatAgentEvent({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'I will now read the entire skill and search the web.' }] },
    });
    assert.equal(line, null);
  });

  it('summarises finish with duration, tools, and tokens', () => {
    assert.equal(
      formatFinishLine({
        durationMs: 233000,
        tools: 24,
        usage: { inputTokens: 18000, outputTokens: 2200, cacheReadTokens: 4000 },
      }),
      'Agent finished · 3m 53s · 24 tools · 18,000 in / 2,200 out (4,000 cached)',
    );
    assert.equal(formatUsageShort(null), '');
  });
});
