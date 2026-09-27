# Windows setup

Requires Windows x64. Open PowerShell in the repository.

```powershell
.\setup.ps1
.\goose.ps1 configure
.\start.ps1
```

The installer manages Node, uv, Python 3.12, locked dependencies and Goose. Git,
Chrome/Edge and LaTeX tools are optional prompts. Skills are included in the repo.
Existing personal files are preserved; older installations must first follow
[Upgrading](upgrading.md) to replace legacy candidate inputs with memory.

For a preview: `./setup.ps1 -Plan -All`. For all optional components without prompts:
`./setup.ps1 -NonInteractive -All`. Individual options are `-WithGit`,
`-WithBrowser`, `-WithCvTools` and `-Start`. Goose is always installed/checked.
For a session with scripts disabled, use PowerShell's process-scoped execution
policy rather than changing the machine-wide policy.

The wrapper `goose.ps1` uses the portable Goose installation or your existing CLI.
Configure its provider, authentication and model with `./goose.ps1 configure`.
The web UI uses that configuration. Missing Goose or failed model calls stop AI
work; there is no alternative keyword workflow.

## Checks

```powershell
npm run doctor -- --goose --skills
npm run doctor -- --browser --render-html --cv-tools
npm test
```

Doctor does not make model calls or scrape boards. Rendering checks create synthetic
artifacts. Tectonic may download its standard packages on first use.

- Missing browser: install Chrome/Edge; search still works, but PDF export and Fill need it.
- Python import failure: run `.\.venv\Scripts\python.exe -c "import jobspy"`.
- Missing Goose login/provider: run `./goose.ps1 configure`.
- Busy port: stop the old app or set `PORT` in your private `.env`.
- Older profile detected: run the migration in [Upgrading](upgrading.md).
- Checksum failure: rerun after fixing the download/network issue; never bypass the hash.

Portable tool pins are in `toolchain.windows.json`. Python dependencies live in
`pyproject.toml` and `uv.lock`; Node dependencies in `package-lock.json`.
After intentionally updating Python constraints, regenerate the pip export:

```powershell
uv lock --upgrade
uv export --locked --format requirements-txt --no-dev --no-emit-project --output-file requirements.txt
```

Keep pins and checksums together. Stop the app before rerunning dependency installs.
