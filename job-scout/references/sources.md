# Sources (multi-country)

No free official national API for most markets. Boards depend on the market preset.

## Strategy

```text
market from search-profile.json / --market
Apify (APIFY_TOKEN + --allow-paid) → fallback JobSpy
```

Bayt has **no JobSpy fallback** (HTTP 403 from cloud IPs) and is only enabled for
markets that set `baytCountry` (e.g. UAE, Saudi Arabia).

| Board | Apify Actor | JobSpy | Notes |
| --- | --- | --- | --- |
| Bayt | `unfenced-group/bayt-scraper` | no | MENA only |
| Indeed | `factden/indeed-jobs-scraper` (`country` from market) | yes (`country_indeed` from market) | |
| LinkedIn | `sourabhbgp/linkedin-jobs-scraper` | yes | location = city / country name |

Queries come from **the user's** `profile.search.titles`, not from this file. Country
codes and city defaults live in `markets/<id>.json`. Swap actors in
`scripts/fetch-jobs.mjs` → `buildApifyBoards` if one flakes.

## Cost (personal use)

| Path | Typical |
| --- | --- |
| JobSpy only | $0 (Bayt skipped) |
| Apify weekly search | usually &lt; $1 |
| Apify free credit | ~$5/month |

## Install free fallback

```bash
pip install -U -r requirements.txt
```
