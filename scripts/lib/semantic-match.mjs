import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from './common.mjs';
import { readPrivate, writePrivate } from './private-store.mjs';
import { scoreJob, jobTitleAboveProfileSeniority } from './fit.mjs';

export function cosine(a, b) {
  if (a.length !== b.length || !a.length || [...a, ...b].some(n => !Number.isFinite(n))) throw new Error('Invalid embedding dimensions');
  const denominator = Math.hypot(...a) * Math.hypot(...b);
  if (!denominator) throw new Error('Empty embedding');
  return a.reduce((sum, n, i) => sum + n * b[i], 0) / denominator;
}
export async function embedding(text, config, { root = ROOT, fetchImpl = fetch } = {}) {
  const url = new URL(config.endpoint || 'http://127.0.0.1:11434/api/embed');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password) throw new Error('Embeddings require a local HTTP service.');
  if (!config.model || !config.revision) throw new Error('Set semantic model and revision (change revision when model weights change).');
  const key = createHash('sha256').update(JSON.stringify({ version: 1, endpoint: url.href, model: config.model, revision: config.revision, text })).digest('hex');
  const path = join(root, '.workspace', 'embeddings', key + '.json');
  const cached = await readPrivate(path, null);
  if (cached) { cosine(cached, cached); return cached; }
  const response = await fetchImpl(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, input: text, truncate: false }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Local embedding service HTTP ${response.status}`);
  const vector = (await response.json()).embeddings?.[0];
  if (!Array.isArray(vector) || vector.length > 16384) throw new Error('Invalid embedding response');
  cosine(vector, vector); await writePrivate(path, vector); return vector;
}

/** Similarity is retrieval-only: deterministic fit, evidence and exclusions are unchanged. */
export async function semanticSearch({ jobs, profile, query, config = {}, root = ROOT, embed = embedding }) {
  const ranked = jobs.map(job => ({ job, fit: job.fit || scoreJob(job, profile), similarity: null }));
  const fallback = reason => ({ mode: 'deterministic', reason, results: ranked.sort((a, b) => (b.fit.score || 0) - (a.fit.score || 0)) });
  if (!config.enabled) return fallback('Semantic matching is disabled.');
  try {
    const queryVector = await embed(query, config, { root });
    // Bound on-demand retrieval; no background model installation or downloads.
    for (const row of ranked.slice(0, 250)) {
      row.similarity = cosine(queryVector, await embed(`${row.job.title}\n${row.job.description || ''}`, config, { root }));
    }
    const excluded = row => row.fit.eligibility?.status === 'incompatible' || row.fit.verdict === 'No' || jobTitleAboveProfileSeniority(row.job.title, profile.seniority);
    ranked.sort((a, b) => Number(excluded(a)) - Number(excluded(b)) || (b.similarity ?? -1) - (a.similarity ?? -1));
    return { mode: 'semantic', reason: 'Similarity is not evidence of qualifications. Hard exclusions stay below eligible results.', results: ranked.map(row => ({ ...row, excluded: excluded(row) })) };
  } catch (error) { return fallback(`Embeddings unavailable: ${error.message}`); }
}
