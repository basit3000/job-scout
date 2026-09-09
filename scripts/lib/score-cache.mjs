/** Reuse deterministic fit scores; profile, evidence, or posting changes invalidate them. */
export function createScoreCache(score, limit = 5000) {
  let signature, entries;
  return (profile, evidence) => {
    const next = JSON.stringify([profile, evidence]);
    if (next !== signature) { signature = next; entries = new Map(); }
    const current = entries;
    return job => {
      const key = JSON.stringify(job);
      const cached = current.get(job.id);
      if (cached?.key === key) return cached.value;
      const value = score(job, profile, evidence);
      current.set(job.id, { key, value });
      if (current.size > limit) current.delete(current.keys().next().value);
      return value;
    };
  };
}
