# Upgrade to Job Scout 2

This is a one-way upgrade. Version 2 supports Goose and the current memory format
only. Older endpoints, Fast mode, direct provider adapters and compatibility-file
generation have been removed.

1. Stop running Job Scout instances. Make a private backup of ignored personal
   files: `state/`, `cv/`, `.env`, `search-profile.json`, downloads and any Overleaf
   checkout. Keep backups outside Git.
2. Update the repository (`git pull` for a clone, or unpack the new release without
   overwriting personal files).
3. Run `npm ci` and `uv sync --locked` using Node >=22.13.
4. Import and clean up old candidate files:

   ```bash
   npm run memory:migrate -- --plan
   npm run memory:migrate -- --cleanup
   ```

   Existing memory is retained. Without it, the importer reads the previous profile,
   saved answers and notes. It archives source bytes and records structured conflicts.
   Review factual disagreements in Memory before generating documents.

   Cleanup archives unique content before removing legacy profile/answers/notes,
   compatibility manifests/backups, old generated evidence snapshots and the retired
   personal CV-skill overlay.
   Supplementary reference text moves out of active memory into the private
   migration archive. Repeating cleanup is safe. CV masters, credentials, search
   settings, application history and installed tools are retained.
5. On Windows run `./setup.ps1` to check/install Goose and prerequisites. Configure
   with `./goose.ps1 configure` (or `goose configure` elsewhere), then start
   with `./start.ps1` or `npm start`.

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
