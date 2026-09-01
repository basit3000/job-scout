/**
 * Format Cursor SDK stream events for the Job Scout run log.
 * Keeps the website readable: tools + tokens, not dumped thinking.
 */

const DETAIL_KEYS = [
  'path',
  'file',
  'file_path',
  'target_file',
  'command',
  'pattern',
  'glob_pattern',
  'query',
  'search_term',
  'url',
];

export function redactSecrets(text) {
  return String(text ?? '')
    .replace(/git:[^@\s]+@/gi, 'git:***@')
    .replace(/(OVERLEAF_GIT_TOKEN|CURSOR_API_KEY|GITHUB_TOKEN|GH_TOKEN)=[^\s]+/gi, '$1=***');
}

export function truncate(text, max = 100) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function formatToolDetail(name, args) {
  if (args == null) return '';
  if (typeof args === 'string') return truncate(redactSecrets(args));
  if (typeof args !== 'object') return '';
  for (const key of DETAIL_KEYS) {
    if (args[key]) return truncate(redactSecrets(args[key]));
  }
  if (args.args && typeof args.args === 'object') {
    return formatToolDetail(name, args.args);
  }
  return '';
}

export function formatUsageLine(usage) {
  if (!usage || typeof usage !== 'object') return '';
  const inT = Number(usage.inputTokens) || 0;
  const outT = Number(usage.outputTokens) || 0;
  const cache = Number(usage.cacheReadTokens) || 0;
  const total = Number(usage.totalTokens) || inT + outT;
  const bits = [`tokens  ${total.toLocaleString()} total`, `${inT.toLocaleString()} in`, `${outT.toLocaleString()} out`];
  if (cache) bits.push(`${cache.toLocaleString()} cache`);
  return bits.join(' · ');
}

export function formatUsageShort(usage) {
  if (!usage || typeof usage !== 'object') return '';
  const inT = Number(usage.inputTokens) || 0;
  const outT = Number(usage.outputTokens) || 0;
  const cache = Number(usage.cacheReadTokens) || 0;
  let s = `${inT.toLocaleString()} in / ${outT.toLocaleString()} out`;
  if (cache) s += ` (${cache.toLocaleString()} cached)`;
  return s;
}

export function formatDuration(ms) {
  const n = Number(ms) || 0;
  if (n < 1000) return `${n}ms`;
  const sec = Math.round(n / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function formatFinishLine({ durationMs, tools, usage } = {}) {
  const parts = ['Agent finished'];
  if (durationMs) parts.push(formatDuration(durationMs));
  if (tools) parts.push(`${tools} tool${tools === 1 ? '' : 's'}`);
  const u = formatUsageShort(usage);
  if (u) parts.push(u);
  return parts.join(' · ');
}

/**
 * Turn one SDK stream event into a log line, or null to skip.
 * Mutates `stats` ({ tools, started: Set, usage }).
 */
export function formatAgentEvent(event, stats = {}) {
  if (!event || typeof event !== 'object') return null;
  const type = event.type;

  if (type === 'tool_call' || type === 'tool-call') {
    const status = event.status || 'running';
    const name = event.name || event.toolName || 'tool';
    const detail = formatToolDetail(name, event.args);
    const id = event.call_id || event.id || `${name}:${detail}`;
    if (!stats.started) stats.started = new Set();
    if (status === 'completed' && stats.started.has(id)) return null;
    if (status === 'running' || (status === 'completed' && !stats.started.has(id))) {
      stats.started.add(id);
      stats.tools = (stats.tools || 0) + 1;
    }
    if (status === 'error') {
      return { line: `✗ ${name}${detail ? `  ${detail}` : ''}`, stream: 'stderr' };
    }
    return { line: `→ ${name}${detail ? `  ${detail}` : ''}`, stream: 'tool' };
  }

  if (type === 'assistant' && event.message?.content) {
    // Prefer the dedicated tool_call events; skip tool_use blocks and dumped prose.
    return null;
  }

  if (type === 'usage' && event.usage) {
    stats.usage = event.usage;
    const line = formatUsageLine(event.usage);
    return line ? { line, stream: 'meta' } : null;
  }

  if (type === 'status' && event.status && !['RUNNING', 'CREATING'].includes(event.status)) {
    return { line: `Agent ${String(event.status).toLowerCase()}`, stream: 'meta' };
  }

  return null;
}
