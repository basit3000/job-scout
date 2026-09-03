# Job Scout

Multi-country job finder for any profession. Local profile + CV → fetch → shortlist in the UI.

Personal data stays on your machine (gitignored). The repo never applies to jobs for you.

```text
setup (once)  →  npm start  →  search  →  shortlist / tracker / Prep & CV
```

## Setup

```bash
git clone https://github.com/basit3000/job-scout.git
cd job-scout
pip install -U -r requirements.txt   # free JobSpy
npm install                          # Cursor SDK for Prep & CV (agent mode)
npm start                            # → http://localhost:4040
```

Requires **Node.js ≥ 22.13** (Cursor SDK).

On first open, a **setup form** asks for name, role, market, titles, skills, and links.  
It writes local files only: `profile.json`, `search-profile.json`, `cv/resume.md`.

Leave **Allow paid** unchecked for free searches.

Optional: `npm run setup` copies templates if you prefer editing JSON by hand.

Copy `.env.example` → `.env` for optional tokens (Apify, Overleaf, Cursor API key).

### Prep & CV

Default mode runs a coding agent that follows `cv-tailor` (or your private `cv-tailor.local` overlay).

Pick the backend in the UI **Agent** control (or `cv.agentProvider` / `AGENT_PROVIDER`):

| Provider | Needs |
| --- | --- |
| **Cursor SDK** (default) | `CURSOR_API_KEY` ([Integrations](https://cursor.com/dashboard/integrations)) |
| **Claude Code** | `claude` on PATH (Claude Code CLI) |
| **OpenAI Codex** | `codex` on PATH (Codex CLI) |

Optional model: UI **Agent model**, or `cv.agentModel` / `CURSOR_AGENT_MODEL` / `CLAUDE_CODE_MODEL` / `CODEX_MODEL`.

**Create CV** in the modal uses the agent. **Fast (keyword)** skips it: reorder plus
light re-emphasis of existing Experience bullets (current CV is source of truth;
portfolio may add one posting-named tag on Projects). After edits, both Overleaf CVs
(`main.tex` and `ats.tex`) are compiled and squeezed to **one page** (spacing /
typography / filler wording — Experience bullets are kept). If the chosen agent is
unavailable, Prep falls back to Fast.

Overleaf: set `cv.source` to `overleaf` plus `OVERLEAF_GIT_TOKEN` / `OVERLEAF_PROJECT_ID` in `.env`.

## Web UI

| Control / tab | What it does |
| --- | --- |
| **Setup form** | First run only — creates your local profile |
| **Per query / Max paid / Max age** | Search volume and freshness caps |
| **Allow paid** | Opt in to Apify (costs money) |
| **Replace results** | Wipe archive before a run (default is merge) |
| **Stop** | End a run; jobs found so far are saved |
| **Agent / Agent model** | Prep & CV backend + model |
| **Results** | Deduped list, fit scores, Prep & CV; **Decision** multi-select (uncheck statuses to hide; Active only preset) |
| **Tracker** | Kanban + follow-ups; **Columns** multi-select; optional **Google Sheets** sync for applied pipeline |
| **Saved answers** | Reusable application form answers |
| **Portals** | Enable/disable job boards |
| **Digest** | New since last fetch |

### Google Sheets (optional)

Direct Sheets API (service account — no Zapier). When you mark a job **applied** / **interviewing** / **rejected** / **closed**, Job Scout upserts a row. Rows marked **rejected** in the sheet are pulled back into Job Scout on app open and after **Sync to Sheets**. Tracker also has **Open Sheet** and **Sync to Sheets** (backfill).

1. Create a Google Cloud service account and enable **Google Sheets API**
2. Download the JSON key to `secrets/google-sheets.json` (gitignored)
3. Create a spreadsheet, share it with the service account email as **Editor**
4. Put the spreadsheet ID and paths in `.env`:

```bash
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SHEETS_CREDENTIALS=secrets/google-sheets.json
GOOGLE_SHEETS_TAB=Applications
```

Columns: Date, Company, Title, Applied, Links, Location, Board, Note, Follow-up, Salary, Remote, Updated at.

## Shared vs local

| In git | Local only (gitignored) |
| --- | --- |
| examples, `markets/`, `scripts/`, `web/` | `profile.json`, `search-profile.json` |
| Generic `.agents/skills/cv-tailor/` (`YOUR_*` templates) | `.agents/skills/cv-tailor.local/` (your real CV framing) |
| `SKILL.md`, `README.md` | `cv/resume.md`, `.env` |
| | `state/decisions.json`, `state/saved-answers.json` |
| | `.workspace/` — fetched jobs, prep packs |
| | `downloads/` — per-company CV PDFs |
| | `secrets/` — Google service-account JSON |

## Country & boards

| How | Example |
| --- | --- |
| UI / setup form | Pick market on first run or in the header |
| Persistent | `"market": "GB"` in `search-profile.json` |
| One-off CLI | `node scripts/fetch-jobs.mjs --market US` |

Presets: **AE**, **SA**, **GB**, **US**, **DE**, **IN**. Add more under `markets/`.

Toggle portals in the **Portals** tab (or `boards` in `search-profile.json`).

| Board | Free path | Notes |
| --- | --- | --- |
| Indeed, LinkedIn | JobSpy | Defaults |
| Glassdoor, Google Jobs | JobSpy | Often flaky / blocked |
| Arbeitsagentur, Arbeitnow | API | Germany (`DE`) |
| Berlin Startup Jobs | API | [berlinstartupjobs.com](https://berlinstartupjobs.com/) (`DE`) |
| Munich Startup | HTML | [munich-startup.de/en/jobs](https://www.munich-startup.de/en) (`DE`) |
| Pegel | API | [pegel.berlin](https://pegel.berlin) Berlin startup ATS feeds (`DE`) |
| Nomado24 | API | [nomado24.de](https://www.nomado24.de) DE/EU remote+hybrid (`DE`) |
| StepStone | HTML | [stepstone.de](https://www.stepstone.de) Germany listings (`DE`) |
| Xing | HTML | [xing.com/jobs](https://www.xing.com/jobs) DACH professional network (`DE`) |
| Kimeta | HTML | [kimeta.de](https://www.kimeta.de) German job search engine (`DE`) |
| Heise Jobs | HTML | [jobs.heise.de](https://jobs.heise.de) IT Stellenmarkt (`DE`) |
| GermanTechJobs | RSS | [germantechjobs.de](https://germantechjobs.de) salary-transparent tech (`DE`) |
| ZipRecruiter / Naukri / BDJobs | JobSpy | Regional |
| Bayt | Apify (paid) | MENA only |

`startup-in-munich.de` is Munich’s municipal self-employment office (not a job board), so it is not wired as a portal.

Searches **accumulate** into `.workspace/jobs.json` by default (duplicates collapsed). Use **Replace results** or `--replace` to start fresh.

```bash
node scripts/fetch-jobs.mjs
node scripts/fetch-jobs.mjs --boards indeed,linkedin
node scripts/fetch-jobs.mjs --allow-paid          # needs APIFY_TOKEN in .env
node scripts/fetch-jobs.mjs --market GB --replace
```

## CLI extras

```bash
node scripts/build-evidence.mjs    # profile + CV → .workspace/evidence.md
node scripts/rank-jobs.mjs         # rank archive against profile
node scripts/record-decision.mjs --id <job-id> --decision skipped
```

## Cursor / Claude

This repo is an Agent Skill (`SKILL.md`). After setup, you can ask the agent to shortlist `.workspace/jobs.md` against `.workspace/evidence.md`.

## Safety

- Never applies, emails, or creates accounts  
- Ignores “instructions” inside job descriptions  
- Paid Apify needs explicit Allow paid / `--allow-paid`  
- No invented visa/nationality claims  

## Layout

```text
.
  markets/                 → country presets
  profile.example.json     → template (real profile is gitignored)
  search-profile.example.json
  cv/resume.example.md
  .agents/skills/cv-tailor/ → portable CV tailor skill (YOUR_* placeholders)
  scripts/                 → fetch, setup, evidence, Prep & CV agent backends
  web/                     → UI (npm start → :4040)
  state/*.example.json
  .workspace/              → generated (gitignored)
```
