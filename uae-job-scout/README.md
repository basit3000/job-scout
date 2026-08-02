# UAE Job Scout

Portable, **UAE-only** job finder for **any profession** — nursing, accounting, marketing, engineering, design, whatever the person actually does.

Hand this folder to a friend. They replace the `YOUR_*` placeholders, drop in their CV, and run. It never applies to anything.

```text
profile.json + CV  →  fetch UAE jobs  →  shortlist to choose from
                      Apify first
                      JobSpy fallback
```

## Setup (about 5 minutes)

```bash
cd uae-job-scout
pip install -U -r requirements.txt

cp profile.example.json profile.json
cp cv/resume.example.md cv/resume.md

# Edit both files — replace every YOUR_* value with real ones for THIS person.
# Then:
node scripts/build-evidence.mjs
node scripts/fetch-jobs.mjs
```

If any `YOUR_*` string is left, the scripts **refuse to run** on purpose (so you never search for the literal text `YOUR_JOB_TITLE`).

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

| Board | Apify (primary) | JobSpy (free fallback) |
| --- | --- | --- |
| Bayt | yes — main UAE board | no (HTTP 403 from cloud IPs) |
| Indeed.ae | yes | yes |
| LinkedIn | yes | yes |

```bash
# Free path (Indeed + LinkedIn)
node scripts/fetch-jobs.mjs

# Full path including Bayt
export APIFY_TOKEN=apify_api_...   # from console.apify.com
node scripts/fetch-jobs.mjs --allow-paid
```

Personal Apify runs are usually well under $1; free plan credit often covers them.

## Using with Cursor / Claude

This folder is an Agent Skill (`SKILL.md`). In a repo that symlinks it under `.agents/skills/` or `.claude/skills/`, say:

> Set up the UAE job scout for me — I'll answer the YOUR_* fields.

Or run the scripts yourself and ask the agent to shortlist `.workspace/jobs.md` against `.workspace/evidence.md`.

## Share as its own repo

```bash
cd uae-job-scout
git init
git add -A && git commit -m "UAE job scout"
# create empty GitHub repo, then push
```

Your friend never needs anyone else's portfolio — only this folder plus their own CV.

## Safety

- Never applies, emails, or creates accounts  
- Ignores “instructions” inside job descriptions  
- Paid Apify needs explicit `--allow-paid`  
- No invented visa/nationality claims  

## Layout

```text
uae-job-scout/
  profile.example.json   → copy to profile.json, replace YOUR_*
  cv/resume.example.md   → copy to cv/resume.md, replace YOUR_*
  search-profile.json    → board wiring (profession-agnostic)
  scripts/               → build-evidence, fetch-jobs, pull-overleaf, …
  SKILL.md               → instructions for AI agents
  state/decisions.json   → skips/applies memory
  .workspace/            → generated evidence + jobs (gitignored)
```
