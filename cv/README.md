# Master documents

Keep your base CV in resume.md and your letter template in cover-letter.md.
The first-run form creates a starter CV; replace placeholders with supported facts.
These documents are gitignored. Factual background and writing preferences belong
in the app's Memory tab, not separate notes files.
Reusable prompt wording and layout settings belong in ignored `prompts/local.json`;
see [customization](../docs/prompt-customization.md). The example documents are
starting points, not mandatory section names or letter wording.

Goose prepares job-specific drafts, renders PDFs, and runs validation and review.
It preserves the master documents. Outputs live in downloads/<Company>/<Role>-<JobID>/.
Keep [Company], [Role] and [Date] placeholders in the letter template. Optional
blocks in the example template provide starting material for the writer.

For Overleaf, configure OVERLEAF_GIT_TOKEN and OVERLEAF_PROJECT_ID in .env and select
Overleaf as the CV source. Each recreation starts from the online project. The
per-job Push to Overleaf option publishes only after final validation and review.
See [README](../README.md) and [Upgrading](../docs/upgrading.md).
