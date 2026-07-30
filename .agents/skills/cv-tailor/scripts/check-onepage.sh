#!/usr/bin/env bash
# Compiles a LaTeX CV and asserts it is exactly one page.
#
# Usage: check-onepage.sh <path-to-main.tex> [--keep]
#
# Exit codes: 0 = exactly one page, 1 = wrong page count, 2 = setup or compile failure.
# Prints the page count on stdout so a caller can read it back.

set -uo pipefail

TEX_PATH="${1:-}"
KEEP="${2:-}"

if [[ -z "$TEX_PATH" ]]; then
  echo "usage: check-onepage.sh <path-to-main.tex> [--keep]" >&2
  exit 2
fi

if [[ ! -f "$TEX_PATH" ]]; then
  echo "error: no such file: $TEX_PATH" >&2
  exit 2
fi

TEX_DIR="$(cd "$(dirname "$TEX_PATH")" && pwd)"
TEX_FILE="$(basename "$TEX_PATH")"
TEX_STEM="${TEX_FILE%.tex}"
BUILD_DIR="$TEX_DIR/.cv-build"

setup_hint() {
  cat >&2 <<'EOF'

No LaTeX toolchain found. Install one of these first:

  # smallest, self-contained, downloads packages on demand
  curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh
  sudo mv tectonic /usr/local/bin/

  # or a TeX Live subset
  sudo apt-get update && sudo apt-get install -y latexmk texlive-latex-recommended \
       texlive-latex-extra texlive-fonts-recommended

Page counting also needs poppler-utils (preferred) or Python with pypdf:

  sudo apt-get install -y poppler-utils
EOF
}

# --- compile -------------------------------------------------------------
mkdir -p "$BUILD_DIR"
cd "$TEX_DIR" || exit 2

PDF_PATH=""
if command -v latexmk >/dev/null 2>&1; then
  echo "Compiling with latexmk..."
  if ! latexmk -pdf -interaction=nonstopmode -halt-on-error \
       -outdir="$BUILD_DIR" "$TEX_FILE" >"$BUILD_DIR/compile.log" 2>&1; then
    echo "error: latexmk failed. Last 40 lines:" >&2
    tail -40 "$BUILD_DIR/compile.log" >&2
    exit 2
  fi
  PDF_PATH="$BUILD_DIR/$TEX_STEM.pdf"
elif command -v tectonic >/dev/null 2>&1; then
  echo "Compiling with tectonic..."
  if ! tectonic -o "$BUILD_DIR" --keep-logs "$TEX_FILE" >"$BUILD_DIR/compile.log" 2>&1; then
    echo "error: tectonic failed. Last 40 lines:" >&2
    tail -40 "$BUILD_DIR/compile.log" >&2
    exit 2
  fi
  PDF_PATH="$BUILD_DIR/$TEX_STEM.pdf"
elif command -v pdflatex >/dev/null 2>&1; then
  echo "Compiling with pdflatex (twice, for refs)..."
  for _ in 1 2; do
    if ! pdflatex -interaction=nonstopmode -halt-on-error \
         -output-directory="$BUILD_DIR" "$TEX_FILE" >"$BUILD_DIR/compile.log" 2>&1; then
      echo "error: pdflatex failed. Last 40 lines:" >&2
      tail -40 "$BUILD_DIR/compile.log" >&2
      exit 2
    fi
  done
  PDF_PATH="$BUILD_DIR/$TEX_STEM.pdf"
else
  setup_hint
  exit 2
fi

if [[ ! -f "$PDF_PATH" ]]; then
  echo "error: compile reported success but produced no PDF at $PDF_PATH" >&2
  exit 2
fi

# --- count pages ---------------------------------------------------------
PAGES=""
if command -v pdfinfo >/dev/null 2>&1; then
  PAGES="$(pdfinfo "$PDF_PATH" 2>/dev/null | awk '/^Pages:/ {print $2}')"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import pypdf" >/dev/null 2>&1; then
  PAGES="$(python3 -c "import sys,pypdf; print(len(pypdf.PdfReader(sys.argv[1]).pages))" "$PDF_PATH")"
elif command -v qpdf >/dev/null 2>&1; then
  PAGES="$(qpdf --show-npages "$PDF_PATH" 2>/dev/null)"
fi

if [[ -z "$PAGES" ]]; then
  echo "error: could not count pages — install poppler-utils, qpdf, or 'pip install pypdf'" >&2
  echo "PDF is at: $PDF_PATH" >&2
  exit 2
fi

echo "PDF:   $PDF_PATH"
echo "PAGES: $PAGES"

if [[ "$KEEP" != "--keep" ]]; then
  find "$BUILD_DIR" -type f ! -name '*.pdf' ! -name 'compile.log' -delete 2>/dev/null
fi

if [[ "$PAGES" -eq 1 ]]; then
  echo "OK: exactly one page."
  exit 0
fi

echo "FAIL: expected exactly 1 page, got $PAGES. Trim content before typography — see references/writing-rules.md." >&2
exit 1
