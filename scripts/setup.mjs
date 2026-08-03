#!/usr/bin/env node
// First-run setup for a new person (you or a friend).
// Copies example templates → local gitignored files. Never overwrites existing ones.
//
//   npm run setup
//   npm run setup -- --quiet   # used by npm start

import { ensureLocalTemplates, getSetupStatus } from './lib/setup-state.mjs';

const quiet = process.argv.includes('--quiet');

async function main() {
  if (!quiet) console.log('Job Scout setup — local files only (gitignored)\n');

  const created = await ensureLocalTemplates({ quiet });
  const status = await getSetupStatus();

  if (quiet) {
    if (status.needsSetup) {
      console.log('Job Scout: first-run setup needed → open http://localhost:4040 and fill the form.');
    }
    return;
  }

  console.log(`\n${created ? `Created ${created} file(s).` : 'Everything already in place.'}`);

  if (status.needsSetup) {
    console.log(`
Not configured yet. Easiest path:
  npm start
  # → open http://localhost:4040 and complete the first-run form
  #    (name, role, market, titles — writes your local profile)

Or edit manually:
  1. profile.json
  2. search-profile.json  → "market"
  3. cv/resume.md
`);
  } else {
    console.log(`
Ready for ${status.candidate} (${status.targetRole}) · market ${status.market}.

  npm start
  # → http://localhost:4040
`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
