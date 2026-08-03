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

**Create CV** in the modal uses the agent. **Fast (keyword)** skips it (reorder-only). If the chosen agent is unavailable, Prep falls back to Fast.

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
| **Results** | Deduped list, fit scores, Prep & CV; decision filter includes **Hide applied** (`not:applied`) |
| **Tracker** | Kanban + follow-ups; optional **Hide applied** column |
| **Saved answers** | Reusable application form answers |
| **Portals** | Enable/disable job boards |
| **Digest** | New since last fetch |

## Shared vs local

| In git | Local only (gitignored) |
| --- | --- |
| examples, `markets/`, `scripts/`, `web/` | `profile.json`, `search-profile.json` |
| Generic `.agents/skills/cv-tailor/` (`YOUR_*` templates) | `.agents/skills/cv-tailor.local/` (your real CV framing) |
| `SKILL.md`, `README.md` | `cv/resume.md`, `.env` |
| | `state/decisions.json`, `state/saved-answers.json` |
| | `.workspace/` — fetched jobs, prep packs |
| | `downloads/` — per-company CV PDFs |

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
| ZipRecruiter / Naukri / BDJobs | JobSpy | Regional |
| Bayt | Apify (paid) | MENA only |

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
