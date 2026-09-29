# Overleaf in Job Scout

Configure `OVERLEAF_GIT_TOKEN` and `OVERLEAF_PROJECT_ID` in the ignored `.env`.
Keep credentials out of prompts, logs and tracked files.

The current integration uses `main.tex` and `ats.tex`. The host refreshes
`.workspace/overleaf` from the online project and archives the previous checkout.
Workers edit staged sources; the host compiles and checks them against local
prompt settings and candidate evidence.

Push to Overleaf is off by default for each job. The host publishes only after
final PDF validation and a matching review. A rejected push preserves the local
result. Recreate from the updated project rather than force-pushing over online
changes.

Run `npm run doctor` for tool availability. Report compilation or authentication
failures directly; do not claim success without returned check results.
