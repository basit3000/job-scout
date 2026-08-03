#!/usr/bin/env node
// Record a ruling so the next run does not resurface the same posting.
//
//   node scripts/record-decision.mjs --id uae:indeed:abc123 --decision skipped --note "…"
//   node scripts/record-decision.mjs --id uk:linkedin:abc123 --decision skipped --note "…"

import { value } from './lib/common.mjs';
import { recordDecision, VALID_DECISIONS } from './lib/decisions.mjs';

const id = value('--id');
const decision = value('--decision');
const note = value('--note', '');

if (!id || !decision) {
  console.error(`Usage: record-decision.mjs --id <job-id> --decision <${VALID_DECISIONS.join('|')}> [--note "..."]`);
  process.exit(1);
}

try {
  const { updated, previous, entry } = await recordDecision(id, decision, note);
  if (updated) console.log(`Updated ${id}: ${previous} → ${entry.decision}`);
  else console.log(`Recorded ${id} as ${entry.decision}`);
  console.log('Commit state/decisions.json if you want the next clone to remember this.');
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
