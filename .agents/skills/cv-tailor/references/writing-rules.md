# CV writing rules

The brief: **sell hard, invent nothing.** Every line should make Basit look as good as the
truth allows, and should survive an interviewer opening the repo mid-sentence.

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
| Name the architecture | "Made a Dota website" | "One FastAPI service backing a website, REST API, and Discord bot" |
| Claim real ownership | "Worked on a league platform" | "Designed and shipped end to end, sole author" |
| Show breadth | "Built a shuffle tool" | "Shipped the same tool as a Python CLI, a local web UI, and a Kotlin Android app" |
| Use the hard part | "Built a league site" | "Captain snake draft, ready-checks, cooldowns, and rating updates kept in sync between Discord and the web app" |
| Show consistency | "Enjoys coding" | "258 public commits, with code shipped every year since 2023" |
| Name the real constraint | "Used Redis" | "Serverless view counter on Vercel with Upstash Redis, degrading silently when the API fails" |

The pattern: replace vague verbs with the specific system that was actually built. That
reads as senior without adding a single unverifiable word.

## What is never allowed

- **Invented numbers.** No user counts, latency wins, percentage improvements, uptime, or
  "reduced X by Y%" unless the evidence pack contains the measurement. It does not.
- **Implied employment.** Personal projects must never be phrased to suggest a team, a
  client, or production traffic. No "in production for thousands of users".
- **Seniority inflation.** Not "led", "mentored", "owned the roadmap", or "architected for
  scale" on solo side projects. "Designed and built" is the honest ceiling, and it is
  plenty strong.
- **Buzzword laundering.** One FastAPI service is not "microservices". A Postgres table is
  not "data engineering". A Discord bot is not "distributed systems".
- **Borrowed prestige.** A course repo is a course repo. `Banxware-assignment` is a hiring
  assignment unless the user says otherwise — never list it as work experience.
- **Metrics that undersell.** Star counts of 0 or 1 prove nothing; leave them off entirely
  rather than volunteering weakness.

## Verified vs self-reported

The evidence pack labels every fact. The label changes the phrasing:

- **[verified]** — GitHub API, git history, or a credential URL. State it flatly:
  "Kotlin Android client", "Docker across four repos", "commits every year since 2023".
- **[self-reported]** — portfolio or blog copy Basit wrote. Still usable, but describe the
  *build*, not the *outcome*. "Optional Steam lobby automation ties a match room to a real
  Dota lobby" is fine. "Automation that saved organisers hours every week" is not, because
  nobody measured it.

When a project's description exists only in portfolio copy and has no public repo — PD-League,
FIFA Cup, Work Hours — it can still go on the CV. Describe what was built, avoid impact
claims, and expect it to be discussed in the interview rather than verified beforehand.

## Worked examples

**PD-League**

> Bad: Built a Dota 2 league platform serving thousands of competitive players, improving
> match organisation efficiency by 40%.

Invented scale, invented metric, unverifiable.

> Good: **PD-League** — Dota 2 league platform where one FastAPI service backs the website,
> REST API, and Discord bot. Registration and Steam linking, queueing with ready-checks, a
> captain snake draft, match rooms, and rating updates, on PostgreSQL and Docker.

Same impression of scope, every clause backed by the evidence pack.

**Spotify True Random**

> Bad: Optimised Spotify's shuffle algorithm for 60% better randomness.

Meaningless metric, and it was not Spotify's algorithm that changed.

> Good: **Spotify True Random** — replaced Spotify's repeat-prone shuffle with a Fisher–Yates
> implementation that plays every track once before any repeat. Shipped as a Python CLI, a
> local web UI, and a Kotlin Android app against the Spotify Web API.

**Skills line**

> Bad: Expert in Python, JavaScript, Kotlin, Java, PHP, C, Assembly, TypeScript, Shell...

Listing every language ever touched dilutes the strong ones and invites questions about the
weak ones.

> Good: Python (FastAPI, Django), JavaScript/React, Kotlin, SQL (PostgreSQL), Docker, Git.

Rule: only list a language if there is a repo behind it and Basit would take a question on
it. Order by real depth from the language footprint in the evidence pack, not alphabetically.

## Tone and mechanics

- Past tense, active voice, no first-person pronouns.
- Start bullets with a concrete verb: built, shipped, designed, replaced, automated,
  integrated, migrated. Not "responsible for", "helped with", "worked on".
- One line per bullet wherever possible; two is the maximum.
- Name the technology inside the sentence, not as a trailing "(Python, Docker)" tag.
- No exclamation marks, no "passionate", no "results-driven", no "team player".
- British or American spelling — match whatever the existing CV already uses.

## Student-CV specifics

Basit is a Master's student at TU Ilmenau with strong project evidence and no verified
commercial history in this repo. That shapes the layout:

1. **Header** — name, one-line positioning, email, LinkedIn, GitHub, portfolio site.
2. **Education** — TU Ilmenau first; keep whatever dates and degree titles the existing CV
   states, unchanged.
3. **Projects** — the strongest section, and the one tailoring should reshuffle. Three to
   five, best-fit first.
4. **Skills** — grouped, honest, ordered by depth.
5. **Experience** — only what the existing CV or the user provides. Never synthesised.
6. **Certifications** — trim to the ones relevant to the target job; six on a one-page CV
   is usually two too many.
7. **Interests** — at most one line. Competitive Dota 2 is genuinely on-brand for the
   portfolio and fine to keep if there is room, but it is the first thing cut for space.
