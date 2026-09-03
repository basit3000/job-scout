# Put your CV and cover letter here

## Local mode (default)

Edit **`resume.md`** — Prep & CV reorders this file for each job (does not invent facts).

| File | Notes |
| --- | --- |
| `resume.md` | Preferred — plain markdown |
| `cover-letter.md` | Master cover letter (see below) |
| `resume.txt` | Plain text export from Word/PDF |
| `resume.tex` | Single-file LaTeX CV (evidence only unless Overleaf mode) |

First-run setup copies `resume.example.md` → `resume.md` and `cover-letter.example.md` → `cover-letter.md`. Personal files are gitignored.

### Cover letter template

Keep `[Company]`, `[Role]`, and `[Date]` — Prep / **Cover letter** fill those in. Replace every `YOUR_*` or generation falls back to a generic letter from `profile.json`.

1. Write the **core** (always included): current job, what you want, education/location, sign-off.
2. Leave `<!-- include:past -->` and `<!-- include:projects -->` where optional paragraphs should go.
3. After `<!-- optional-blocks`, add earlier jobs and side projects. A block is inserted only when the posting mentions at least one of its keywords (up to two `:::past` and two `:::project`).

```md
:::past employer-id keyword-one "multi word phrase"
One true sentence about that job.
:::

:::project project-id fastapi postgres
One true sentence about that project.
:::
```

Quoted phrases match as a whole (`"machine learning"`); unquoted words match on word boundaries. Do not invent metrics.

**Create CV** writes the letter on first run. **Cover letter** on a result, or **Generate cover letter** in the prep pack, regenerates it. Outputs: `downloads/<Company>/<Your Name> Cover Letter.pdf` (+ `.docx`, `.md`).

Optional: set `"cv": { "updateMaster": true }` in `search-profile.json` to write the tailored order back into `resume.md` (otherwise only the prep pack is updated).

## Overleaf mode

1. Put credentials in `.env` (never commit):

```env
OVERLEAF_GIT_TOKEN=...
OVERLEAF_PROJECT_ID=...
```

Token: Overleaf → Account Settings → Git Integration.  
Project ID: project → Menu → Sync → Git.

2. In the Job Scout UI header, set **CV source → Overleaf** (and **Push Overleaf** if you want remote updates).

3. **Prep & CV** will: pull → reorder Projects/Skills in `ats.tex` / `main.tex` → push → save **PDF** into the prep pack for download.

PDF falls back to Chrome/Edge print of the HTML CV if LaTeX (`tectonic` / `pdflatex`) is not installed.
