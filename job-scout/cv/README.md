# Put your CV here

1. `cp resume.example.md resume.md`
2. Replace every `YOUR_*` placeholder with the real CV (any profession)
3. Or use Overleaf / `.tex` / `.txt` as below

| File | Notes |
| --- | --- |
| `resume.md` | Preferred — plain markdown |
| `resume.txt` | Plain text export from Word/PDF |
| `resume.tex` | Single-file LaTeX CV |
| `overleaf/` | Whole Overleaf project from `../scripts/pull-overleaf.sh` |

Personal CV files are gitignored (examples stay). Safe to share the repo.

```bash
export OVERLEAF_GIT_TOKEN=...
export OVERLEAF_PROJECT_ID=...
../scripts/pull-overleaf.sh
```
