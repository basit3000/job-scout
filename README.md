# Job Scout

Multi-country job finder for any profession. Local profile + CV → fetch → shortlist in the UI.

Personal data stays on your machine (gitignored). The repo never applies to jobs for you.

```text
setup (once)  →  npm start  →  search  →  shortlist / tracker
```

## Setup

```bash
git clone https://github.com/basit3000/job-scout.git
cd job-scout
pip install -U -r requirements.txt   # free JobSpy
npm start                            # → http://localhost:4040
```

On first open, a **setup form** asks for name, role, market, titles, skills, and links.  
It writes local files only: `profile.json`, `search-profile.json`, `cv/resume.md`.

Leave **Allow paid** unchecked for free searches.

Optional: `npm run setup` copies templates if you prefer editing JSON by hand.

## Web UI

| Control / tab | What it does |
| --- | --- |
| **Setup form** | First run only — creates your local profile |
| **Per query / Max paid / Max age** | Search volume and freshness caps |
| **Allow paid** | Opt in to Apify (costs money) |
| **Replace results** | Wipe archive before a run (default is merge) |
| **Stop** | End a run; jobs found so far are saved |
| **Results** | Deduped list, fit scores, prep packs |
| **Tracker** | Kanban + follow-ups |
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
  scripts/                 → fetch, setup, evidence, …
  web/                     → UI (npm start → :4040)
  state/*.example.json
  .workspace/              → generated (gitignored)
```
