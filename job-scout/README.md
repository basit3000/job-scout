# Job Scout

Portable, **multi-country** job finder for **any profession** — nursing, accounting, marketing, engineering, design, whatever the person actually does.

Hand this folder to a friend. They pick a country, replace the `YOUR_*` placeholders, drop in their CV, and run. It never applies to anything.

```text
profile.json + CV  →  fetch jobs in chosen market  →  shortlist to choose from
                      Apify first
                      JobSpy fallback
```

Default market is **UAE**. Change it anytime.

## Setup (about 5 minutes)

```bash
cd job-scout
pip install -U -r requirements.txt

cp profile.example.json profile.json
cp cv/resume.example.md cv/resume.md

# 1) Pick a country in search-profile.json → "market": "AE" | "GB" | "US" | "DE" | "IN" | "SA"
# 2) Edit profile.json + cv/resume.md — replace every YOUR_* value
# Then:
node scripts/build-evidence.mjs
node scripts/fetch-jobs.mjs
```

If any `YOUR_*` string is left, the scripts **refuse to run** on purpose (so you never search for the literal text `YOUR_JOB_TITLE`).

### Change country

| How | Example |
| --- | --- |
| Persistent | `"market": "GB"` in `search-profile.json` |
| One-off | `node scripts/fetch-jobs.mjs --market US` |
| New country | Copy `markets/AE.json` → `markets/XX.json`, edit, set `"market": "XX"` |

Presets ship in `markets/`: **AE** (UAE), **SA** (Saudi Arabia), **GB**, **US**, **DE**, **IN**.

Optional: override cities in `search-profile.json` or `profile.location.targets` instead of using the market defaults.

### CV options

| Method | How |
| --- | --- |
| Markdown / text | Save as `cv/resume.md` or `cv/resume.txt` |
| LaTeX file | Save as `cv/resume.tex` |
| Overleaf project | `export OVERLEAF_GIT_TOKEN=… OVERLEAF_PROJECT_ID=…` then `./scripts/pull-overleaf.sh` |

`profile.json` and `cv/*` (except examples) are gitignored.

## What `YOUR_*` means

Every example value looks like `YOUR_FULL_NAME` or `YOUR_JOB_TITLE_QUERY_1`.

| Field | Replace with |
| --- | --- |
| `name` / `headline` / `targetRole` | Who they are and what they want |
| `search.titles` | Queries to type into Bayt/Indeed/LinkedIn |
| `search.includeTitlePatterns` | Regexes that keep titles in their field |
| `search.excludeTitlePatterns` | Regexes that drop noise |
| `skills` / `experience` / `education` | Their real background |
| `constraints.notes` | Visa, join date, languages, salary floor |

**Agents:** if you see `YOUR_*`, ask the user. Do not invent a profession.

### Example (nurse — illustrative only)

```json
"targetRole": "Staff Nurse",
"search": {
  "titles": ["Staff Nurse", "Registered Nurse", "ER Nurse"],
  "includeTitlePatterns": ["nurse|nursing|rn\\b"],
  "excludeTitlePatterns": ["veterinary|dentist|sales"]
}
```

### Example (accountant — illustrative only)

```json
"targetRole": "Accountant",
"search": {
  "titles": ["Accountant", "Accounts Executive", "Junior Accountant"],
  "includeTitlePatterns": ["accountan|accounts executive|bookkeep"],
  "excludeTitlePatterns": ["sales|engineer|nurse"]
}
```

## Boards

| Board | Apify (primary) | JobSpy (free fallback) | Markets |
| --- | --- | --- | --- |
| Bayt | yes | no (HTTP 403 from cloud IPs) | MENA (`AE`, `SA`, …) |
| Indeed | yes | yes | all presets |
| LinkedIn | yes | yes | all presets |

```bash
# Free path (Indeed + LinkedIn)
node scripts/fetch-jobs.mjs

# Full path including Bayt (MENA)
export APIFY_TOKEN=apify_api_...   # from console.apify.com
node scripts/fetch-jobs.mjs --allow-paid

# Different country for this run only
node scripts/fetch-jobs.mjs --market GB
```

Personal Apify runs are usually well under $1; free plan credit often covers them.

## Using with Cursor / Claude

This folder is an Agent Skill (`SKILL.md`). In a repo that symlinks it under `.agents/skills/` or `.claude/skills/`, say:

> Set up the job scout for UK nursing roles — I'll answer the YOUR_* fields.

Or run the scripts yourself and ask the agent to shortlist `.workspace/jobs.md` against `.workspace/evidence.md`.

## This folder is its own git repo

`git init` is already done here. To put it on GitHub under your account:

```bash
# on your machine, with YOUR GitHub login:
cd job-scout
gh auth login          # if needed
./publish-to-github.sh
# → https://github.com/basit3000/job-scout
```

Or create an empty repo at https://github.com/new?name=job-scout then:

```bash
git remote add origin https://github.com/basit3000/job-scout.git
git push -u origin main
```

Your friend clones that URL — they never need the portfolio, only this repo plus their own CV.

## Safety

- Never applies, emails, or creates accounts  
- Ignores “instructions” inside job descriptions  
- Paid Apify needs explicit `--allow-paid`  
- No invented visa/nationality claims  

## Layout

```text
job-scout/
  markets/               → country presets (AE, GB, US, …)
  profile.example.json   → copy to profile.json, replace YOUR_*
  cv/resume.example.md   → copy to cv/resume.md, replace YOUR_*
  search-profile.json    → "market" + optional board/city overrides
  scripts/               → build-evidence, fetch-jobs, pull-overleaf, …
  SKILL.md               → instructions for AI agents
  state/decisions.json   → skips/applies memory
  .workspace/            → generated evidence + jobs (gitignored)
```
