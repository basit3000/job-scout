# CV writing rules (mirrored from cv-tailor)

Job Scout’s per-job CV generator follows the same **substance and format** rules as the
Overleaf **cv-tailor** skill (`writing-rules.md` + `format-benchmarks.md`).

## Hard rules (same as cv-tailor)

- **No invented facts.** No metrics, user counts, percentages, team sizes, dates, titles,
  or employers that are not already in the profile.
- **No implied employment.** Personal projects stay personal — never client / production /
  “thousands of users” language unless the profile already states it.
- **No buzzword laundering.** One FastAPI service is not “microservices”.
- **Reorder, re-weight, and lightly re-emphasise.** Tailoring puts the best-fit true
  content first *within* a section. Experience bullets on the current CV are the source
  of truth: reorder clauses / which duty leads, but do not replace them with a new story
  or drop them. Portfolio copy may enrich **Projects** (stack the project already lists).
- A requirement with **no evidence** gets **no CV line** — it goes in `requirements.md` as a gap.

## Section order (hard rule — Main and ATS)

**Experience is always first** after the header. Both Overleaf files and local packs:

1. **Header** — name, role headline (current role + core tech), contact (`main.tex` + photo)
2. **Experience** — reverse chronological; lead with current full-time role
3. **Education** — supporting context (Master’s in progress is fine under Experience)
4. **Projects** — personal/side work; best-fit first; never imply employment
5. **Skills**

Frame as a **working professional**, not a student CV. Standard headings only:
`Experience`, `Education`, `Projects`, `Skills`.

**No objective / summary paragraph.** Headline under the name is enough.

## Tone

- Past tense, active voice; no first-person on bullets  
- Prefer concrete verbs: built, shipped, designed, replaced, automated, integrated  
- Avoid: worked on, helped with, assisted, responsible for, utilised  
- Name technology inside the sentence  

## Sources in Job Scout

| UI **CV source** | Behaviour |
| --- | --- |
| **Local resume.md** | Reorder `cv/resume.md` into the prep pack (Experience first) |
| **Overleaf** | Pull → reorder sections/entries, lightly re-emphasise Experience bullets (current CV is source of truth), optionally add one posting-named portfolio tag on Projects → PDF in prep pack |

## What this is not

Full agentic **cv-tailor** (GitHub evidence gather, one-page shell checks, surgical prose
rewrites) still lives with the Overleaf skill. Job Scout Fast mode reorders and
re-emphasises existing bullets; it does not invent new duties or metrics.
