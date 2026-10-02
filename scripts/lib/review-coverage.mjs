/** Structured, human-readable evidence coverage in the reviewer Markdown contract. */
export const COVERAGE_HEADER = '| Requirement | Priority | Status | Candidate evidence | Document evidence |';
export const COVERAGE_SEPARATOR = '| --- | --- | --- | --- | --- |';
const PRIORITIES = new Set(['required', 'preferred', 'unknown']);
const STATUSES = new Set(['supported', 'partial', 'gap', 'unknown', 'unsupported-claim']);
const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '')
  .split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
const emptyEvidence = text => !text || /^(?:[-—–]|none|n\/a|unknown|not (?:available|evidenced|provided))\.?$/i.test(text);

export function parseRequirementCoverage(markdown) {
  const sections = [...String(markdown || '').matchAll(/^##\s+Requirement coverage\s*\r?$/gm)];
  if (sections.length !== 1) return { rows: [], error: 'Review must contain one Requirement coverage table' };
  const body = String(markdown).slice(sections[0].index + sections[0][0].length).split(/^##\s/m)[0].trim();
  const lines = body.split(/\r?\n/).filter(s => s.trim());
  const rows = [];
  if (JSON.stringify(cells(lines[0] || '')) !== JSON.stringify(cells(COVERAGE_HEADER))
    || cells(lines[1] || '').length !== 5 || !cells(lines[1] || '').every(s => /^:?-{3,}:?$/.test(s))) {
    return { rows, error: 'Requirement coverage table has missing or invalid columns' };
  }
  for (const line of lines.slice(2)) {
    const fields = cells(line);
    if (!line.trim().startsWith('|') || fields.length !== 5) return { rows, error: 'Malformed requirement coverage row; escape literal pipes as \\|' };
    const [requirement, priority, status, evidence, document] = fields;
    if (!requirement || !PRIORITIES.has(priority) || !STATUSES.has(status) || !evidence || !document) {
      return { rows, error: 'Requirement coverage needs a requirement, valid priority/status, and evidence or an explicit unknown' };
    }
    if (['supported', 'partial'].includes(status) && emptyEvidence(evidence)) return { rows, error: 'Supported or partial requirements need a candidate evidence citation' };
    if (status === 'unsupported-claim' && emptyEvidence(document)) return { rows, error: 'Unsupported claims need a document quotation or location' };
    rows.push({ requirement, priority, status, evidence, document });
  }
  return { rows, error: rows.length ? null : 'Requirement coverage must include at least one row (use unknown if the posting is unavailable)' };
}
