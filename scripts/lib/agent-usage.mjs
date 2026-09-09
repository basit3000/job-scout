// Preserve every attempt, including failed and cancelled runs. Provider counters
// are reported as received; cache/reasoning counters are not added to totals.
export function summarizeUsage(attempts = []) {
  const known = attempts.filter((a) => Number.isFinite(a.usage?.inputTokens) && Number.isFinite(a.usage?.outputTokens));
  const counters = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens', 'reasoningTokens'];
  return {
    attempts: attempts.length,
    measuredAttempts: known.length,
    complete: known.length === attempts.length,
    counters: Object.fromEntries(counters.map((key) => [key,
      known.some((a) => Number.isFinite(a.usage[key]))
        ? known.reduce((sum, a) => sum + (Number.isFinite(a.usage[key]) ? a.usage[key] : 0), 0) : null])),
    durationMs: attempts.reduce((sum, a) => sum + (a.durationMs || 0), 0),
  };
}

export function appendAgentAttempt(previous, meta, stage) {
  const attempts = [...(previous?.attempts || []), { ...meta, stage }];
  return { ...previous, [stage]: meta, attempts, usageSummary: summarizeUsage(attempts), updatedAt: new Date().toISOString() };
}
