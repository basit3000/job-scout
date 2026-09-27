# Master documents

Keep your base CV in resume.md and your letter template in cover-letter.md.
The first-run form creates a starter CV; replace placeholders with supported facts.
These documents are gitignored. Factual background and writing preferences belong
in the app's Memory tab, not separate notes files.

Goose prepares job-specific drafts, renders PDFs, and runs validation and review.
It preserves the master documents. Outputs live in downloads/<Company>/<Role>-<JobID>/.
Keep [Company], [Role] and [Date] placeholders in the letter template. Optional
blocks in the example template provide starting material for the writer.

For Overleaf, configure OVERLEAF_GIT_TOKEN and OVERLEAF_PROJECT_ID in .env and select
Overleaf as the CV source. Preparation uses the local checkout and does not push.
See [README](../README.md) and [Upgrading](../docs/upgrading.md).
