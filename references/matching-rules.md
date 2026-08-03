# What "fits" means — any country, any profession

Test: **if this person walks into the interview, does the posting match what their
evidence pack can show?**

The pack is whatever they put in `profile.json` + `cv/`. There is no default profession.
The target country is whatever `search-profile.json` → `market` (or `--market`) selected.

## Before you rank

1. Read `.workspace/evidence.md` in full  
2. If it still contains `YOUR_*`, stop and finish setup — do not invent  
3. Note `targetRole` and `search.titles` — that is the field you are matching for  
4. Note the market in `.workspace/jobs.json` (`market` / `marketId`)  

## Market-specific hard gates

| Signal | Action |
| --- | --- |
| Nationals-only / citizens-only (per market patterns) | Drop when `dropNationalsOnly` is true (default on for AE/SA). |
| "N years local/country experience" | Not the same as N years in the profession. Stretch at best; usually No. |
| Immediate joiner / already in-country | Flag. Ask before calling Strong. |
| Visa silence on a local-only role | Ask. Never assume sponsorship. |

Auto-flags from fetch: `nationals-only`, `local-experience-required`, `mentions-visa`, `immediate-joiner`.

Patterns for nationals-only and local experience live in `markets/<id>.json`.

## Requirements are not equal

| Kind | Weight |
| --- | --- |
| Hard gate (nationals-only, license they lack, local-years they lack) | Fails alone |
| Core skill / credential named in title or top responsibilities | Needs evidence |
| Listed nice-to-have | Two or three missing is normal |

## Evidence labels

- **[profile]** / **[cv]** — what they wrote; usable, but don't oversell  
- **[github]** — only if they set `githubUsername` and it is relevant to the role  

If a requirement is not in the pack, it is a **gap**. Say so.

## Writing the verdict

> **Worth a shot** — they want a Staff Nurse with ER experience; the CV shows 2 years
> ER at City Hospital. Gap: posting asks for local experience / license — confirm status.

Not: "Strong — great match!"

## Thin markets

Three honest candidates beat twenty padded ones. If the field is quiet in this market
this week, say so — do not widen into a different profession or country unless asked.
