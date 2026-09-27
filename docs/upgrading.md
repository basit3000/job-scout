# Upgrade to Job Scout 2

This is a one-way upgrade. Version 2 supports Goose and the current memory format
only. Older endpoints, Fast mode, direct provider adapters and compatibility-file
generation have been removed.

## Keep your data and get the current code

1. Stop all running Job Scout instances. Keep a private backup of the old checkout,
   including ignored files, until the new installation works. A Git commit or stash
   alone does not back up ignored candidate files.
2. **For a clone from before the history rewrite, create a fresh checkout.** Older
   commit IDs changed, so a normal pull may report divergent or unrelated history.
   Replace `YOUR_REPOSITORY_URL` with the old checkout's `git remote get-url origin`:

   ```bash
   git clone YOUR_REPOSITORY_URL job-scout-v2
   cd job-scout-v2
   ```

   Keep the old folder intact. Do not merge its old history back into the new clone.
   Reapply any intentional source-code changes separately. A ZIP download into a
   new folder works too, but does not provide Git-based updates.

   For subsequent upgrades on the current history, `git pull --ff-only` is enough
   when there are no conflicting local changes. If it refuses, preserve your work
   and use the fresh-checkout route; do not force a merge or reset away local edits.
3. Copy **personal data only** from the backup into the matching paths in the new
   folder. Do this **before setup, migration, or the first app launch**:

   | Local data | What to transfer |
   | --- | --- |
   | Candidate information | `profile.json` if present, and private files/directories under `state/`, including existing `memory.json`, saved answers, decisions, history and archives |
   | CV sources | Personal files under `cv/`, including the master resume, letter, LaTeX and old notes |
   | Configuration | `.env` and `search-profile.json`; check absolute paths for the new folder |
   | Legacy evidence | `.agents/skills/cv-tailor.local/` and `.cv-workspace/` if present; migration archives their relevant contents |
   | Jobs and drafts | `.workspace` data files, `prep/`, `prep-history/`, the Overleaf checkout, and `downloads/` if you want to retain them |

   Keep the new tracked examples, README files and generic skills. Do not copy the
   old repository-root `.git`, `node_modules`, `.venv`, or managed tool directories into the new
   checkout. Dependencies and tools are installed again below.

## Migrate before starting the app

4. With Node >=22.13 available, install Node dependencies and migrate the copied data:

   ```bash
   npm ci
   npm run memory:migrate -- --plan
   npm run memory:migrate -- --cleanup
   ```

   Existing memory is retained. Without it, the importer reads the previous profile,
   saved answers and notes. It archives source bytes and records structured conflicts.
   Review factual disagreements in Memory before generating documents.

   If you accidentally started a fresh setup before copying legacy data, its new
   memory will also be retained. Use another fresh folder and follow the order above
   instead of expecting migration to replace that memory or overwrite your backup.

   Cleanup archives unique content before removing legacy profile/answers/notes,
   compatibility manifests/backups, old generated evidence snapshots and the retired
   personal CV-skill overlay.
   Supplementary reference text moves out of active memory into the private
   migration archive. Repeating cleanup is safe. CV masters, credentials, search
   settings, application history and installed tools are retained.
5. On Windows run `./setup.ps1` to install/check the locked Python environment,
   Goose and prerequisites. Configure with `./goose.ps1 configure`, then run
   `./start.ps1`. On other platforms, install uv and Goose, run `uv sync --locked`,
   then `goose configure` and `npm start`.
6. Verify your name, role, facts, saved answers, CV source, market and application
   history in the UI before generating new documents. Keep the private backup until
   this check is complete. Leave **Allow paid** unchecked for free searches.

Goose is always included. `-WithGoose` and `-WithSkills` are no longer installer
options; skills ship in the repo. Browser, Git and LaTeX remain optional. Old
`AGENT_PROVIDER`, Cursor/Claude/Codex model settings and search-profile provider
fields have no effect. Configure the provider in Goose.

New users skip migration: install, configure Goose, start, and complete the setup
form. `state/memory.example.json` supplies the neutral initial structure.

## Update custom integrations

- Read `state/memory.json`, or import `loadCandidateProfile()` / `loadSavedAnswers()`
  from the runtime modules. Do not read or write retired `profile.json` copies.
- Submit `POST /api/prep` with `{ id, tools, prompt }`. Tool names come from
  `GET /api/goose`. Follow `/api/prep/stream` for results.
- Letters use the same endpoint with `prepare_letter` selected. Batches use
  `/api/prep/batch`; all batches run Goose.
- There is no export to earlier schemas or two-way synchronization. To return to
  an older release, restore its code and your pre-upgrade private backup. Later
  memory edits need manual reconciliation.

Inspect `state/memory-cleanup-report.json` and `state/memory-migration/` for retired
files. Both are private and gitignored. Recreate old preparation packs before
applying; current inputs and workflow determine document freshness.
