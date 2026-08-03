#!/usr/bin/env bash
# Checks that a CV survives machine reading: compiles it, extracts the text layer the way
# a parser would, and flags the damage patterns that layout tricks cause.
#
# Usage: check-ats.sh <path-to.tex-or.pdf> [--quiet]
#
# Exit codes: 0 = no problems found, 1 = problems found, 2 = setup or compile failure.
#
# Without --quiet the full extraction is printed. Read it. The automated checks catch the
# obvious breakage; only your eyes catch reading order that is subtly wrong.

set -uo pipefail

SRC="${1:-}"
QUIET="${2:-}"

if [[ -z "$SRC" ]]; then
  echo "usage: check-ats.sh <path-to.tex-or.pdf> [--quiet]" >&2
  exit 2
fi

if [[ ! -f "$SRC" ]]; then
  echo "error: no such file: $SRC" >&2
  exit 2
fi

# --- get a PDF -----------------------------------------------------------
if [[ "$SRC" == *.pdf ]]; then
  PDF_PATH="$SRC"
else
  TEX_DIR="$(cd "$(dirname "$SRC")" && pwd)"
  TEX_FILE="$(basename "$SRC")"
  TEX_STEM="${TEX_FILE%.tex}"
  BUILD_DIR="$TEX_DIR/.cv-build"
  mkdir -p "$BUILD_DIR"
  cd "$TEX_DIR" || exit 2

  if command -v latexmk >/dev/null 2>&1; then
    latexmk -pdf -interaction=nonstopmode -halt-on-error \
      -outdir="$BUILD_DIR" "$TEX_FILE" >"$BUILD_DIR/ats-compile.log" 2>&1
  elif command -v tectonic >/dev/null 2>&1; then
    tectonic -o "$BUILD_DIR" "$TEX_FILE" >"$BUILD_DIR/ats-compile.log" 2>&1
  elif command -v pdflatex >/dev/null 2>&1; then
    pdflatex -interaction=nonstopmode -halt-on-error \
      -output-directory="$BUILD_DIR" "$TEX_FILE" >"$BUILD_DIR/ats-compile.log" 2>&1
  else
    echo "error: no LaTeX toolchain. See references/overleaf.md." >&2
    exit 2
  fi

  PDF_PATH="$BUILD_DIR/$TEX_STEM.pdf"
  if [[ ! -f "$PDF_PATH" ]]; then
    echo "error: compile produced no PDF. Last 40 lines:" >&2
    tail -40 "$BUILD_DIR/ats-compile.log" >&2
    exit 2
  fi
fi

if ! command -v pdftotext >/dev/null 2>&1; then
  echo "error: pdftotext not found — install poppler-utils." >&2
  exit 2
fi

# Default mode, not -layout: this approximates what a parser reading the text stream sees.
TXT="$(pdftotext "$PDF_PATH" - 2>/dev/null)"

PROBLEMS=0
note() { echo "FAIL: $*"; PROBLEMS=$((PROBLEMS + 1)); }
pass() { echo "ok:   $*"; }

# --- 1. is there a text layer at all -------------------------------------
WORDS="$(printf '%s' "$TXT" | wc -w | tr -d ' ')"
if [[ "$WORDS" -lt 100 ]]; then
  note "only $WORDS words extracted — the PDF may be an image, or fonts are not embedded as text."
else
  pass "text layer present ($WORDS words)."
fi

# --- 2. contact details survive ------------------------------------------
if printf '%s' "$TXT" | grep -qE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'; then
  pass "email address is readable as text."
else
  note "no email address found in the text layer."
fi

for host in linkedin github; do
  if printf '%s' "$TXT" | grep -qi "$host\..*/"; then
    pass "$host appears as a URL."
  else
    note "$host does not appear as a full URL — a parser sees no link, only an icon or a bare username."
  fi
done

# --- 3. standard section headings ----------------------------------------
for heading in Experience Education Skills; do
  if printf '%s' "$TXT" | grep -qE "^[[:space:]]*${heading}[[:space:]]*$"; then
    pass "section heading '$heading' is on its own line."
  else
    note "section heading '$heading' missing or not on its own line."
  fi
done

if printf '%s' "$TXT" | grep -qiE '^[[:space:]]*(Professional Experience|Technical Skills)'; then
  note "non-standard heading in use — prefer 'Experience' and 'Skills'."
fi

# --- 4. labels separated from their values -------------------------------
# A line that is nothing but a label means the value was typeset in another column and the
# parser cannot pair the two.
ORPHANS="$(printf '%s' "$TXT" | grep -cE '^[[:space:]]*[A-Za-z][A-Za-z ]{2,20}:[[:space:]]*$')"
if [[ "$ORPHANS" -gt 0 ]]; then
  note "$ORPHANS label(s) extract with no value on the line — two-column layout is splitting label from value."
  printf '%s' "$TXT" | grep -nE '^[[:space:]]*[A-Za-z][A-Za-z ]{2,20}:[[:space:]]*$' | sed 's/^/        /'
else
  pass "labels stay attached to their values."
fi

# --- 5. icon and bullet glyph noise --------------------------------------
# Symbol-font glyphs decode as stray single letters, usually leading a line or dangling
# after a list.
GLYPHS="$(printf '%s' "$TXT" | grep -cE '(^[[:space:]]*[a-zA-Z][[:space:]]*$)|(^[[:space:]]*[a-zA-Z][[:space:]]+[A-Z])')"
if [[ "$GLYPHS" -gt 2 ]]; then
  note "$GLYPHS line(s) start with or consist of a stray single letter — icon or bullet glyphs are decoding as text."
  printf '%s' "$TXT" | grep -nE '(^[[:space:]]*[a-zA-Z][[:space:]]*$)|(^[[:space:]]*[a-zA-Z][[:space:]]+[A-Z])' \
    | head -8 | sed 's/^/        /'
else
  pass "no significant glyph noise."
fi

# --- 6. words running together across a gap ------------------------------
if printf '%s' "$TXT" | grep -qE '[a-z][0-9]{2}/[0-9]{4}'; then
  note "a date is glued to the preceding word — a \\hfill line overflowed."
else
  pass "no dates glued to adjacent text."
fi

# --- report --------------------------------------------------------------
echo
if [[ "$QUIET" != "--quiet" ]]; then
  echo "----- extracted text (read this, do not just trust the checks) -----"
  printf '%s\n' "$TXT"
  echo "--------------------------------------------------------------------"
  echo
fi

if [[ "$PROBLEMS" -eq 0 ]]; then
  echo "OK: no machine-reading problems found in $(basename "$PDF_PATH")."
  exit 0
fi

echo "$PROBLEMS problem(s) found in $(basename "$PDF_PATH")." >&2
echo "A photo-and-columns CV will always fail some of these; that is why ats.tex exists." >&2
exit 1
