#!/usr/bin/env node
// Record a ruling so the next run does not resurface the same posting.
//
//   node scripts/record-decision.mjs --id uae:indeed:abc123 --decision skipped --note "…"
//   node scripts/record-decision.mjs --id uk:linkedin:abc123 --decision skipped --note "…"

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ROOT, loadJson, workspaceDir, value } from './lib/common.mjs';

const LOG_PATH = join(ROOT, 'state', 'decisions.json');
const VALID = ['applied', 'skipped', 'shortlisted', 'interviewing', 'rejected', 'closed'];

const id = value('--id');
const decision = value('--decision');
const note = value('--note', '');

if (!id || !decision) {
  console.error(`Usage: record-decision.mjs --id <job-id> --decision <${VALID.join('|')}> [--note "..."]`);
  process.exit(1);
}
if (!VALID.includes(decision)) {
  console.error(`Unknown decision "${decision}". Use one of: ${VALID.join(', ')}`);
  process.exit(1);
}

async function main() {
  const log = await loadJson(LOG_PATH, { decisions: [] });
  const fetched = await loadJson(join(workspaceDir(), 'jobs.json'), { jobs: [] });
  const job = fetched.jobs.find((j) => j.id === id);

  const existingIndex = log.decisions.findIndex((d) => d.id === id);
  const entry = {
    id,
    decision,
    date: new Date().toISOString().slice(0, 10),
    title: job?.title ?? log.decisions[existingIndex]?.title ?? null,
    company: job?.company ?? log.decisions[existingIndex]?.company ?? null,
    url: job?.url ?? log.decisions[existingIndex]?.url ?? null,
    board: job?.board ?? log.decisions[existingIndex]?.board ?? null,
    note: note || null,
  };

  if (existingIndex !== -1) {
    const previous = log.decisions[existingIndex];
    log.decisions[existingIndex] = { ...entry, previousDecision: previous.decision };
    console.log(`Updated ${id}: ${previous.decision} → ${decision}`);
  } else {
    log.decisions.push(entry);
    console.log(`Recorded ${id} as ${decision}`);
  }

  await mkdir(dirname(LOG_PATH), { recursive: true });
  await writeFile(LOG_PATH, `${JSON.stringify(log, null, 2)}\n`);
  console.log('Commit state/decisions.json if you want the next clone to remember this.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
