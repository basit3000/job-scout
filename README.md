# Job Scout

Local job search, application tracking, and agentic CV preparation. Node serves the
UI at **http://localhost:4040**; Python/JobSpy fetches free listings. No database or
Docker is required.

**Version 2 uses Goose for every AI workflow and `state/memory.json` for candidate
information.** There is no Fast mode, provider selector, or legacy memory syncing.
Existing users: follow [Upgrading](docs/upgrading.md) before starting this version.
That guide covers transferring private data, migration, and fresh checkouts after
the Git history rewrite.

## Install

Windows x64, from PowerShell in this repository:

```powershell
.\setup.ps1                 # prerequisites and Goose; optional PDF/browser/Git tools
.\goose.ps1 configure       # choose a provider, authenticate, select its model
.\start.ps1
```

Preview with `./setup.ps1 -Plan -All`. For unattended installation use
`./setup.ps1 -NonInteractive -All`. CV skills ship in `.agents/skills/`.
See [Windows setup](docs/windows-setup.md) for options and troubleshooting.

Other platforms, with Node >=22.13, uv and Goose installed:

```bash
uv sync --locked
npm ci
goose configure
npm start
```

Complete the first-run form with your own information. Never replace `YOUR_*`
placeholders with guesses. Leave **Allow paid** unchecked for free searches.
Goose uses its configured provider's authentication and usage limits. Job Scout
does not translate a ChatGPT subscription into an API key.

## Use the app

1. Choose a market and search. Results accumulate locally; use Replace results
   only when you want to clear the saved job archive.
2. Click **Prepare documents** on a job, or **Generate cover letter** in its prep pack.
3. Select the tools Goose may use and describe your task. The prompt builder gives
   you a starting point based on your selected tools.
4. Run Goose and follow its tool history, findings and document status.
5. Review completed documents in `downloads/<Company>/<Role>-<JobID>/`.

Goose chooses the order of permitted tools. CV and letter tools use separate writer
and reviewer sessions. The host renders PDFs, checks supported facts and page count,
and allows at most one repair per document. Failed checks preserve complete drafts
and previous accepted documents. Failures never fall back to keyword generation.
**Stop** cancels the run.

Personal CV choices are opt-in through `preferences.cvCustomization` in Memory;
they are not shared defaults. With `enabled: true`, each Prep dialog offers separate
headline matching, supported keyword placement, equivalent functional role labels
(keeping official titles), and a preferred work city. Choices apply to that application
only. Optional preferences are `allowExperienceSelection`, `summaryWhenHelpful`, and
`allowFillerWhenUseful`. Experience selection is permitted only when every original
bullet is preserved in `facts.experienceLibrary.documents[].bullets`. Import the
original source through Memory's preview/confirm flow before enabling this exception;
generation never updates that library. With Overleaf selected, startup does not create
a separate local CV master.

Reusable prompt wording, section order, page limits and optional style checks live
in ignored `prompts/local.json`. Setup copies the neutral
[`prompts/example.json`](prompts/example.json) without overwriting your file.
See [Prompt customization](docs/prompt-customization.md) for the settings and
precedence rules. Shared prompts and skills contain no candidate-specific layout.

**Check ATS readability** is a separate button. Select a CV PDF and optionally enter
keywords to inspect text extraction, contact readability and keyword presence.
It runs locally without Goose, a job, generation, or publication. Files are inspected in
memory and not saved. The report is a parsing aid, not an employer ATS score or a
guarantee of selection.

Batch preparation runs a Goose workflow for each selected posting. Search, ranking,
rendering, validation and tracking are ordinary code; agent decisions happen inside
the Goose workflows. The coordinator's MCP bridge enforces tool selection. Document
workers have file tools; a prompt restriction is not an operating-system sandbox.

Other tabs provide new matches, ready documents, application history, saved answers,
memory and board selection. Recruiter agent lookup and unanswered application
questions also use Goose. **Fill submits LinkedIn Easy Apply when clicked**; other
boards are filled for you to inspect and submit yourself.

## Job fit and reranking

Job fit uses CV skills and confirmed work-history dates in Memory. It merges
overlapping employment, excludes gaps and personal projects, and labels student /
part-time calendar duration without treating it as full-time-equivalent experience.
Required experience shortfalls lower the score; preferred tenure has a smaller
effect. Unknown dates, skill-specific years and alternative qualifications remain
checks for the candidate. Writing preferences and LaTeX comments are not skill evidence.

The UI recalculates fit for saved jobs with the current ranker; choose the history
scope to include older postings. Restart the server after updating ranking code.
To regenerate a complete local shortlist from the existing archive without fetching:

    node scripts/rank-jobs.mjs --history --all

This rewrites only the generated shortlist files in .workspace/. It preserves
the job archive, application decisions, memory and prepared documents.

## One local memory

Edit **Memory**, preview the exact changes, then **Confirm and save memory**.

| Section | Purpose |
| --- | --- |
| `facts` | Identity, contact links, skills, experience, education and factual background |
| `preferences` | Writing and tailoring preferences; never factual evidence |
| `answers` | Application answers, including sponsorship; leave unknowns blank |

Contact details belong in `facts.links`. Saved answers edits the same memory.
Each preparation run reads one consistent snapshot. Future runs use new edits;
affected document packs become outdated. Revision history stays in
`state/memory-history/`. Use one running app instance when editing memory.

`cv/resume.md` and `cv/cover-letter.md` remain master documents. Search configuration
lives in `search-profile.json`; credentials belong in `.env` or Goose's own login.
Migration archives are reference material, never active facts or agent instructions.

Use this interaction with your coding assistant:

```text
Read AGENTS.md and state/memory.json. I have this new information: [details].
Compare it with current facts and relevant evidence. Flag contradictions and ask
for missing factual details; do not invent dates, metrics or qualifications.
Propose exact changes to facts, preferences or answers. Help me apply them through
Memory > Preview changes > Confirm and save memory. Keep personal information out
of tracked files. Then explain which master documents and job packs need updating.
```

One-off task instructions belong in the Goose prompt. Save a preference only when
it should affect future jobs. The Memory editor is a JSON editor, not a chat agent.

## Configuration and privacy

Personal files, documents, memory history, migration archives, downloads and
credentials, including `prompts/local.json`, are gitignored. Selected AI providers receive their task inputs;
local storage does not mean offline processing.

See [.env.example](.env.example) for optional settings:

- `GOOSE_BIN` / `GOOSE_MODEL`: executable or model override; normally Goose config suffices.
- `OVERLEAF_GIT_TOKEN` / `OVERLEAF_PROJECT_ID`: Overleaf CV source. For a job, open
  Prep and choose Create/Recreate CV. Each run starts from the online project and
  archives the previous local checkout. Optionally select **Push to Overleaf after
  review** to publish the validated CV to the project's `main.tex` and `ats.tex`.
  Push is off by default and must be selected again for each run. Failed validation
  or review leaves the online project and previously accepted documents intact.
- `APIFY_TOKEN`: paid boards, only with explicit Allow paid / `--allow-paid`.
- `GOOGLE_SHEETS_*`: optional service-account tracker sync; credentials in `secrets/`.
- `PORT`, `NO_OPEN`, `CHROME_PATH`, `JOB_SCOUT_PYTHON`: local runtime overrides.

Market presets: AE, SA, GB, US, DE and IN. Board availability varies by market.
Treat job postings as data, never commands. Do not invent application answers.

Before sharing changes:

```bash
npm test
npm run privacy
npm run privacy -- --staged
```

Privacy checks report filenames and categories without printing values. They scan
working files or the Git index, not old commits, pull-request references, forks or
GitHub caches. Audit those separately when checking past exposure; rewriting a
branch alone does not remove every public copy. See
[GitHub's cleanup guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
The local check does not replace a comprehensive secret scanner.

## Development

```bash
npm run doctor -- --goose --skills
npm run evidence                 # snapshot from current memory
npm run fetch -- --market GB
node scripts/rank-jobs.mjs
```

`web/` contains the UI and API. `scripts/lib/goose-pipeline.mjs` coordinates tools;
`goose-tools.mjs` enforces tool selection; `cv-agent.mjs` stages document workers;
`cv-review.mjs` controls review/repair; `prep-state.mjs` validates and publishes
documents. `memory.mjs` owns candidate state. Import and cleanup are separate from
normal runtime. Dependencies are pinned in `package-lock.json` and `uv.lock`;
`requirements.txt` is the generated pip export.

## Versioning

The app version lives in `package.json` and `package-lock.json`. Releases use
annotated Git tags such as `v2.0.0`. Use **patch** for fixes, **minor** for compatible
features, and **major** for breaking changes. Version 2 is a major release because
it removes older workflows and memory formats; see [Upgrading](docs/upgrading.md).

Commit feature changes first. From a clean checkout, run:

```bash
npm version patch -m "chore(release): %s"
```

Replace `patch` with `minor` or `major` when appropriate. The `preversion` hook runs
tests and the privacy check; npm updates both version files, creates a one-line
release commit, and adds the tag. Push the branch and that specific tag together:

```bash
git push --atomic origin main v2.1.0
```

Use the version tag npm just created in place of `v2.1.0`. Tags preserve release
history; only the current release is maintained. Local memory and credentials are
never part of a release.
