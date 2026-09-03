# Put your CV here

## Local mode (default)

Edit **`resume.md`** — Prep & CV reorders this file for each job (does not invent facts).

| File | Notes |
| --- | --- |
| `resume.md` | Preferred — plain markdown |
| `cover-letter.md` | Master cover letter. Keep `[Company]`, `[Role]`, `[Date]`. Optional `:::past` / `:::project` blocks at the bottom are inserted only when the posting mentions their keywords. **Cover letter** in the UI writes PDF + markdown into `downloads/<Company>/`. |
| `resume.txt` | Plain text export from Word/PDF |
| `resume.tex` | Single-file LaTeX CV (evidence only unless Overleaf mode) |

First-run UI can create a starter `resume.md`. Personal CV files are gitignored.

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
