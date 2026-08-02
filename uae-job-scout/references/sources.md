# UAE sources

No free official national API. **Bayt** is the main board; **Indeed.ae** and **LinkedIn**
are the second tier.

## Strategy

```text
Apify (APIFY_TOKEN + --allow-paid) → fallback JobSpy
```

Bayt has **no JobSpy fallback** (HTTP 403 from cloud IPs).

| Board | Apify Actor | JobSpy |
| --- | --- | --- |
| Bayt | `unfenced-group/bayt-scraper` | no |
| Indeed.ae | `factden/indeed-jobs-scraper` (`country: AE`) | yes |
| LinkedIn | `sourabhbgp/linkedin-jobs-scraper` | yes |

Queries come from **the user's** `profile.search.titles`, not from this file. Swap actors
in `scripts/fetch-jobs.mjs` → `APIFY_BOARDS` if one flakes.

## Cost (personal use)

| Path | Typical |
| --- | --- |
| JobSpy only | $0 (Bayt skipped) |
| Apify weekly UAE search | usually &lt; $1 |
| Apify free credit | ~$5/month |

## Install free fallback

```bash
pip install -U -r requirements.txt
```
