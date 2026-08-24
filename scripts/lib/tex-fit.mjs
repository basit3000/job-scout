/**
 * Fit Overleaf CVs to exactly one page without dropping important facts.
 *
 * Order: compile-check → squeeze spacing → typography floors → compress
 * filler wording → drop Interests only. Never delete Experience bullets,
 * Education, or project headlines.
 */

export const FIT_MARKER_START = '% BEGIN job-scout one-page-fit';
export const FIT_MARKER_END = '% END job-scout one-page-fit';

const SPACING_BLOCK = `${FIT_MARKER_START}
\\linespread{0.95}\\selectfont
\\setlength{\\parskip}{0pt}
\\setlength{\\itemsep}{0pt}
\\setlength{\\parsep}{0pt}
\\setlength{\\topsep}{1pt}
\\setlength{\\partopsep}{0pt}
${FIT_MARKER_END}
`;

const FILLER =
  /\b(successfully|effectively|efficiently|highly|various|multiple|several|robust|comprehensive|passionate|results-driven|proven)\b/gi;

function toInches(n, unit) {
  const u = String(unit || 'in').toLowerCase();
  if (u === 'cm') return n / 2.54;
  if (u === 'mm') return n / 25.4;
  if (u === 'pt') return n / 72;
  return n;
}

/** Insert spacing squeeze immediately after \\begin{document}. Idempotent. */
export function injectSpacingFit(tex) {
  const src = String(tex ?? '');
  if (src.includes(FIT_MARKER_START)) return { tex: src, changed: false };
  if (!/\\begin\{document\}/.test(src)) return { tex: src, changed: false };
  return {
    tex: src.replace(/\\begin\{document\}/, `\\begin{document}\n${SPACING_BLOCK}`),
    changed: true,
  };
}

/**
 * Body ≥ 10pt, margins ≥ 0.5in, geometry scale ≤ 0.90.
 * Shrinks 11/12pt → 10pt and reduces oversized margins one step.
 */
export function tightenTypography(tex) {
  let out = String(tex ?? '');
  let changed = false;

  out = out.replace(/\\documentclass\[([^\]]*)\]/, (full, opts) => {
    const next = opts.replace(/\b1[12]pt\b/, '10pt');
    if (next !== opts) changed = true;
    return `\\documentclass[${next}]`;
  });

  out = out.replace(/margin\s*=\s*([\d.]+)\s*(in|cm|mm|pt)/gi, (full, n, unit) => {
    const inches = toInches(Number(n), unit);
    if (!Number.isFinite(inches) || inches <= 0.5 + 1e-6) return full;
    changed = true;
    const next = Math.max(0.5, inches - 0.1);
    return `margin=${next.toFixed(2)}in`;
  });

  out = out.replace(
    /\\usepackage\[([^\]]*scale\s*=\s*)([\d.]+)([^\]]*)\]\{geometry\}/i,
    (full, pre, n, post) => {
      const v = Number(n);
      if (!Number.isFinite(v) || v >= 0.9) return full;
      changed = true;
      return `\\usepackage[${pre}${Math.min(0.9, v + 0.05).toFixed(2)}${post}]{geometry}`;
    },
  );

  return { tex: out, changed };
}

/** Drop filler adjectives inside \\item lines. Facts stay. */
export function compressFillerWording(tex) {
  let changed = false;
  const next = String(tex ?? '').replace(/(\\item[ \t]*)([^\n]+)/g, (full, lead, rest) => {
    const cleaned = rest.replace(FILLER, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1');
    if (cleaned !== rest) changed = true;
    return lead + cleaned;
  });
  return { tex: next, changed };
}

/** Drop Interests / Hobbies only — never Experience, Education, or Projects. */
export function dropInterestsSection(tex) {
  const src = String(tex ?? '');
  const re =
    /\\section\*?\{[^}]*(?:Interests|Hobbies)[^}]*\}[\s\S]*?(?=\\section|\s*\\end\{document\})/i;
  if (!re.test(src)) return { tex: src, changed: false };
  return { tex: src.replace(re, '\n'), changed: true };
}

export function experienceItemCount(tex) {
  const m = String(tex ?? '').match(
    /\\section\*?\{[^}]*(?:Experience|Employment)[^}]*\}([\s\S]*?)(?=\\section|\s*\\end\{document\})/i,
  );
  if (!m) return 0;
  return (m[1].match(/\\item\b/g) || []).length;
}

const PASSES = [
  { id: 'spacing', apply: injectSpacingFit },
  { id: 'typography', apply: tightenTypography },
  { id: 'wording', apply: compressFillerWording },
  { id: 'interests', apply: dropInterestsSection },
];

/**
 * Apply the next unused fit pass. Returns { tex, changed, pass }.
 */
export function applyNextFitPass(tex, already = []) {
  const done = new Set(already);
  for (const pass of PASSES) {
    if (done.has(pass.id)) continue;
    const r = pass.apply(tex);
    if (r.changed) return { tex: r.tex, changed: true, pass: pass.id };
  }
  return { tex, changed: false, pass: null };
}

export { PASSES as FIT_PASSES };
