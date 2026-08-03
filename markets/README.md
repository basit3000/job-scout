# Markets

Each file is a country (or market) the scout can search.

## Switch country

In `search-profile.json`:

```json
"market": "GB"
```

Or one-off:

```bash
node scripts/fetch-jobs.mjs --market US
```

## Included presets

| Id | Country | Default boards |
| --- | --- | --- |
| `AE` | United Arab Emirates (default) | Bayt, Indeed, LinkedIn |
| `SA` | Saudi Arabia | Bayt, Indeed, LinkedIn |
| `GB` | United Kingdom | Indeed, LinkedIn |
| `US` | United States | Indeed, LinkedIn |
| `DE` | Germany | Indeed, LinkedIn |
| `IN` | India | Indeed, LinkedIn |

## Add your own

Copy an existing file, change `id` / cities / location patterns, save as `markets/XX.json`, then set `"market": "XX"`.

Required fields: `id`, `name`, `shortName`, `indeedCountryCode`, `jobspyCountryIndeed`, `currency`, `defaultLocation`, `cities`, `locationPatterns`, `boards`.
