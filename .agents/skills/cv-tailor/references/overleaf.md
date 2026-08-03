# Overleaf access and toolchain

## One-time credential setup

Overleaf's git integration is a premium feature (personal Premium, or an institutional
subscription that grants premium at the account level).

1. Generate a token: [Overleaf Account Settings](https://www.overleaf.com/user/settings) →
   Project Synchronisation → Git Integration → **Generate token**. It is shown once. Up to
   ten tokens can exist at a time, and each expires after a year.
2. Find the project ID: open the project → **Menu → Sync → Git**. The dialog shows
   `git clone https://git.overleaf.com/<PROJECT_ID>`.
3. Store the token as a cloud agent secret named `OVERLEAF_GIT_TOKEN`
   (Cursor Dashboard → Cloud Agents → Secrets), and/or in a local `.env` that is gitignored.

Secrets are injected when a cloud agent VM boots, so a run that started before the secret
was added will not see it. Start a fresh agent after adding it.

## Clone, edit, push

```bash
git clone https://git:$OVERLEAF_GIT_TOKEN@git.overleaf.com/$OVERLEAF_PROJECT_ID \
  .cv-workspace/overleaf

cd .cv-workspace/overleaf
# ...edit the .tex...
git add -A
git commit -m "Tailor CV for <role>"
git push
```

The username is literally `git`; the token is the password. Never write the token into a
file, a commit, or the CV itself, and never echo it in command output.

Pull before editing if the clone has been sitting around — Overleaf is a live editor and
the browser copy may have moved:

```bash
git -C .cv-workspace/overleaf pull --rebase
```

### Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Authentication failed` | Missing, wrong, or expired token | Regenerate in Account Settings |
| `Repository not found` | Wrong project ID, or git integration not on that account | Re-copy the URL from Menu → Sync → Git |
| Push rejected, non-fast-forward | Project edited in the browser meanwhile | `git pull --rebase` then push again |
| Clone succeeds but is empty | Project genuinely has no files | Bootstrap from `assets/cv-template.tex` |

## LaTeX toolchain

Cloud agent VMs have no LaTeX preinstalled. Install one before running the page check.

Tectonic is the fast option — a single binary that fetches only the packages the document
needs:

```bash
curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh
sudo mv tectonic /usr/local/bin/
```

TeX Live is heavier but matches Overleaf's own behaviour more closely, which matters if
the CV uses an unusual class file:

```bash
sudo apt-get update
sudo apt-get install -y latexmk texlive-latex-recommended texlive-latex-extra \
     texlive-fonts-recommended
```

Page counting needs one of `poppler-utils` (provides `pdfinfo`), `qpdf`, or Python's
`pypdf`:

```bash
sudo apt-get install -y poppler-utils
```

`scripts/check-onepage.sh` picks whichever of these exists, so installing any working
combination is enough.

## A caution about compiling

A document that compiles locally can still differ from Overleaf's output if the project
pins a TeX Live version or ships its own `.cls`. Cloned `.cls` and `.sty` files sit next to
the `.tex`, so compiling from inside the clone directory — which the script does — is
usually faithful. If the local page count and Overleaf's rendered PDF disagree, trust
Overleaf and say so in the report.
