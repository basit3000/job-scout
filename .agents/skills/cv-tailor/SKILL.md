---
name: cv-tailor
description: Update and tailor Muhammad Basit Zaheer's LaTeX CV, which lives in an Overleaf project reachable over git. Gathers evidence from this portfolio repo and public GitHub activity, optionally tailors the CV to a specific job posting, keeps it to exactly one page, and pushes the result back to Overleaf. Use when asked to update the CV or resume, tailor it to a job description or job ad, refresh it after shipping new projects, or check that it still fits on one page.
---

# CV tailor

Rewrites a one-page LaTeX CV from verified evidence, optionally aimed at a specific job.

The CV lives in Overleaf, not in this repo. This repo is the **evidence source**: the
projects, certifications, profile, and blog data under `src/data/` and `src/pages/`, plus
the public GitHub account they describe.

## Inputs

| Input | How it arrives | Required |
| --- | --- | --- |
| Overleaf project ID | Task prompt, or `OVERLEAF_PROJECT_ID` | Yes |
| Overleaf git token | `OVERLEAF_GIT_TOKEN` env var | Yes |
| Job posting | Pasted in the prompt, or a path to a file | No |
| GitHub username | Defaults to `basit3000` | No |

If the token is missing, stop and say so rather than guessing at credentials. See
`references/overleaf.md` for how it gets set.

## Workflow

### 1. Gather evidence first, always

```bash
node .agents/skills/cv-tailor/scripts/gather-evidence.mjs
```

Writes `.cv-workspace/evidence.json` and `.cv-workspace/evidence.md` (both gitignored).
Read `evidence.md` in full before writing a single line of CV copy. Never write from
memory of a previous run — repos and commit counts move.

The pack labels every fact `[verified]` (GitHub API, git history, or a credential URL) or
`[self-reported]` (copy Basit wrote about himself). That distinction drives the phrasing
rules in `references/writing-rules.md`.

It also ends with a **Gaps worth asking about** section: public repos with no portfolio
entry, and portfolio projects with no public repo. Skim it — it is usually where the
newest CV material is hiding.

### 2. Get the current CV

```bash
git clone https://git:$OVERLEAF_GIT_TOKEN@git.overleaf.com/<PROJECT_ID> .cv-workspace/overleaf
```

Read the whole `.tex` source before editing. The existing CV is the source of truth for
anything this repo cannot see: employment history, dates, degree titles, languages
spoken, location. **Never invent, extend, or "improve" those facts.** If a job posting
demands something only the user can confirm, list it as an open question in the final
report instead of writing it in.

### 3. If a job posting was supplied, map it

Build a requirement-to-evidence table before touching the CV:

| Requirement | Evidence | Confidence | Action |
| --- | --- | --- | --- |
| "REST APIs in Python" | PD-League FastAPI backend; `fastapi`, `trainapplication` repos | verified | Lead with it |
| "Docker" | Dockerfiles in 4 repos; Learning Docker cert | verified | Promote to skills line |
| "5 years commercial Java" | Mood-tracker only; no employment evidence | none | Do not claim; flag as gap |

Rules for the table:

- A requirement with no evidence gets **no CV line**. Report it as a gap instead.
- Reorder and re-weight what is already true; that is what tailoring means here.
- Mirror the posting's vocabulary only where it describes the same thing. If they say
  "microservices" and the evidence is one FastAPI service, do not call it microservices.

### 4. Edit the `.tex` surgically

Use exact-match string replacement on the LaTeX source. Do not regenerate the whole
document — the existing formatting, class file, and spacing tweaks are load-bearing for
the one-page fit.

Follow `references/writing-rules.md` for what the bullets may claim and how confident the
tone may be. That file is the substance of this skill; read it before drafting.

If the Overleaf project turns out to be empty or has no usable CV, `assets/cv-template.tex`
is a self-contained one-page starting point. Only use it when there is nothing to preserve.

### 5. Prove it is one page

```bash
.agents/skills/cv-tailor/scripts/check-onepage.sh .cv-workspace/overleaf/<main>.tex
```

The script compiles the document and prints the page count, exiting non-zero on anything
other than exactly 1. Do not report success on an uncompiled document, and do not assume
a trim worked — rerun it.

When it overflows, cut in this order, stopping as soon as it fits:

1. Oldest and weakest bullets (coursework-grade repos, duplicate tools).
2. Whole projects that the target job does not care about.
3. Second and third bullets on projects that keep their headline.
4. Wording: compress long bullets to one line each, drop filler adjectives.
5. Only then typography — and only down to these floors: body text ≥ 10pt, page margins
   ≥ 0.5in, line spacing ≥ 0.95. A CV that fits because it is unreadable has failed.

If it still will not fit at those floors, stop and report which content the user should
cut. Do not shrink past the floors.

### 6. Push and report

```bash
cd .cv-workspace/overleaf && git add -A && git commit -m "Tailor CV for <role>" && git push
```

Then report to the user:

- What changed, bullet by bullet, each with the evidence it came from.
- The requirement-to-evidence table if a job was supplied.
- **Gaps**: requirements with no evidence, and open questions only the user can answer.
- Confirmation of the page count from step 5.

Never push a CV that failed the page check without saying so explicitly.

## Hard rules

- **No invented facts.** No metrics, user counts, percentages, team sizes, dates, job
  titles, or employers that are not in the evidence pack or the existing CV. If a number
  is not measured, it does not go on the CV.
- **No stolen credit.** Personal projects are personal projects; never phrase them to
  imply commercial or team delivery.
- **Confident, not inflated.** See `references/writing-rules.md` — the goal is the
  strongest *true* framing, phrased so an interviewer who opens the repo agrees with it.
- **Ask rather than guess.** Missing facts become questions in the report, never
  placeholder text in the CV.
