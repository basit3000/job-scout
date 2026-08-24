# CV writing rules

The brief: **sell hard, invent nothing.** Every line should make the candidate look as
good as the truth allows, and should survive an interviewer opening the repo mid-sentence.

## The test for every claim

Before a bullet goes in, ask: *if the interviewer opens the GitHub repo while reading this,
do they nod or wince?*

- Nod → keep it.
- Wince → the claim outran the evidence. Rewrite it down to what is real, or cut it.

There is no third option where it stays because it sounds good.

## What "glaze" is allowed to mean

Confidence comes from **specificity and ownership**, not from adjectives or numbers that
were never measured. These upgrades are always legitimate:

| Move | Weak version | Strong and still true |
| --- | --- | --- |
| Name the architecture | "Made a website" | "One FastAPI service backing a website, REST API, and Discord bot" |
| Claim real ownership | "Worked on a platform" | "Designed and shipped end to end, sole author" |
| Show breadth | "Built a shuffle tool" | "Shipped the same tool as a Python CLI, a local web UI, and a Kotlin Android app" |
| Use the hard part | "Built a league site" | "Captain snake draft, ready-checks, cooldowns, and rating updates kept in sync" |
| Show consistency | "Enjoys coding" | "N public commits, with code shipped every year since YYYY" |
| Name the real constraint | "Used Redis" | "Serverless view counter on Vercel with Upstash Redis, degrading silently when the API fails" |

The pattern: replace vague verbs with the specific system that was actually built. That
reads as senior without adding a single unverifiable word.

## What is never allowed

- **Invented numbers.** No user counts, latency wins, percentage improvements, uptime, or
  "reduced X by Y%" unless the evidence pack contains the measurement.
- **Implied employment.** Personal projects must never be phrased to suggest a team, a
  client, or production traffic. No "in production for thousands of users".
- **Seniority inflation.** Not "led", "mentored", "owned the roadmap", or "architected for
  scale" on solo side projects. "Designed and built" is the honest ceiling, and it is
  plenty strong.
- **Buzzword laundering.** One FastAPI service is not "microservices". A Postgres table is
  not "data engineering". A Discord bot is not "distributed systems".
- **Borrowed prestige.** A course repo is a course repo. A hiring assignment is a hiring
  assignment unless the user says otherwise — never list it as work experience.
- **Metrics that undersell.** Star counts of 0 or 1 prove nothing; leave them off entirely
  rather than volunteering weakness.

## Verified vs self-reported

The evidence pack labels every fact. The label changes the phrasing:

- **[verified]** — GitHub API, git history, or a credential URL. State it flatly:
  "Kotlin Android client", "Docker across four repos", "commits every year since 2023".
- **[self-reported]** — portfolio or blog copy the candidate wrote. Still usable, but
  describe the *build*, not the *outcome*. "Optional Steam lobby automation ties a match
  room to a real Dota lobby" is fine. "Automation that saved organisers hours every week"
  is not, because nobody measured it.

When a project's description exists only in portfolio copy and has no public repo, it can
still go on the CV. Describe what was built, avoid impact claims, and expect it to be
discussed in the interview rather than verified beforehand.

## Worked examples

**Sample project (replace with the candidate’s real evidence)**

> Bad: Built a platform serving thousands of competitive players, improving match
> organisation efficiency by 40%.

Invented scale, invented metric, unverifiable.

> Good: **Project name** — one FastAPI service backs the website, REST API, and Discord
> bot. Registration, queueing with ready-checks, match rooms, and rating updates, on
> PostgreSQL and Docker.

Same impression of scope, every clause backed by the evidence pack.

**Skills line**

> Bad: Expert in Python, JavaScript, Kotlin, Java, PHP, C, Assembly, TypeScript, Shell...

Listing every language ever touched dilutes the strong ones and invites questions about the
weak ones.

> Good: Python (FastAPI, Django), JavaScript/React, Kotlin, SQL (PostgreSQL), Docker, Git.

Rule: only list a language if there is a repo behind it and the candidate would take a
question on it. Order by real depth from the language footprint in the evidence pack, not
alphabetically.

## Job-aware bullet edits (light touch)

When a job posting is supplied, **edit the bullets** — do not stop at reordering projects
or updating the skills line. Ground every change in the portfolio project descriptions and
verified GitHub facts from the evidence pack.

**Stay on theme.** The existing CV has a voice: concrete systems, short active sentences,
tech named in-line. New wording must sound like the same author wrote a slightly sharper
version of the same bullet — not a different resume template.

**Experience source of truth.** The bullets already on the CV (especially current
employment) are the duties you may re-emphasise. Portfolio copy is extra evidence for
**Projects** and for naming stack that those project entries already list. Do not invent
a new e.solutions (or any other) story from the portfolio.

| Allowed | Not allowed |
| --- | --- |
| Move the job-relevant clause earlier in the sentence | Rewrite the bullet into a new story |
| Name a stack item the portfolio already lists for that project | Add tech the project never used |
| Mirror a posting synonym for something already true ("REST API" ↔ "HTTP API") | Buzzword-upgrade ("service" → "microservices platform") |
| Swap which project feature leads when the portfolio supports both | Invent features, metrics, or team roles |
| Leave a bullet alone if it already fits | Touch every line "for consistency" |

Worked pattern — same project, same facts, posting cares about APIs and Docker:

> Before: Built a league site with registration, drafts, and match rooms on PostgreSQL.
>
> After: Shipped a FastAPI REST backend (Docker, PostgreSQL) for registration, captain
> draft, and match rooms, shared by the web app and Discord bot.

Same theme and length; emphasis follows the posting; every clause is in the portfolio.

**Budget:** for a typical tailor pass, change roughly a third to half of Experience and
Projects bullets; leave the rest. Prefer clause reordering over full sentence replacement.
Experience bullets may re-emphasise duties that already appear on the CV; never invent
duties, tools, or scope the existing CV did not state and the evidence pack cannot verify.
Do not drop Experience bullets to make room for keyword stuffing — keep the current set
and only trim if the one-page check fails.

## Tone and mechanics

- Past tense, active voice, no first-person pronouns.
- Start bullets with a concrete verb: built, shipped, designed, replaced, automated,
  integrated, migrated. Not "responsible for", "helped with", "worked on".
- One line per bullet wherever possible; two is the maximum.
- Name the technology inside the sentence, not as a trailing "(Python, Docker)" tag.
- No exclamation marks, no "passionate", no "results-driven", no "team player".
- British or American spelling — match whatever the existing CV already uses.

## Section order (hard rule — both `main.tex` and `ats.tex`)

**Experience is always first** after the header. Do not put Education above Experience —
not for ATS and not for portals. Same order in both Overleaf files:

1. **Header** — name, role headline (current role + core tech), email, LinkedIn, GitHub,
   portfolio site (`main.tex` also has the photo).
2. **Experience** — reverse chronological (Present / most recent first). Lead with current
   full-time employment from the existing CV. Never synthesise employers, titles, or dates.
3. **Education** — keep whatever degrees and dates the existing CV states, unchanged.
4. **Projects** — personal/side work for keyword fit; three to five, best-fit first. Never
   imply these are employment.
5. **Skills** — grouped, honest, ordered by depth / job fit.
6. **Certifications** — trim to the ones relevant to the target job; six on a one-page CV
   is usually two too many.
7. **Interests** — at most one line; first thing cut for space.

Read employment and education from the existing CV / `profile.json`. Frame the CV as a
**working professional** when the candidate has full-time experience — Experience leads;
Education is supporting context, not the story. If they are primarily a student with little
employment, still keep Experience first when any real employment exists; do not invent a
"student CV" format that puts Education above Experience.
