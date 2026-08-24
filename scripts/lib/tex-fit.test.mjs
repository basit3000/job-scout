import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePdfPageCount } from './pdf.mjs';
import {
  injectSpacingFit,
  tightenTypography,
  compressFillerWording,
  dropInterestsSection,
  applyNextFitPass,
  experienceItemCount,
  FIT_MARKER_START,
} from './tex-fit.mjs';

const SAMPLE = String.raw`
\documentclass[11pt,a4paper]{moderncv}
\usepackage[margin=0.8in]{geometry}
\begin{document}
\section{Experience}
\begin{itemize}
  \item Successfully built Python REST APIs; migrated Flask to FastAPI.
  \item Designed pytest unit tests.
\end{itemize}
\section{Projects}
\begin{itemize}
  \item Built a league site.
\end{itemize}
\section{Interests}
Chess, cooking.
\end{document}
`;

test('parsePdfPageCount reads /Type /Pages /Count', () => {
  const pdf = Buffer.from(
    '%PDF-1.1\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n'
      + '2 0 obj<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>endobj\n'
      + 'trailer<< /Root 1 0 R >>\n%%EOF\n',
    'latin1',
  );
  assert.equal(parsePdfPageCount(pdf), 2);
});

test('injectSpacingFit is idempotent and keeps Experience items', () => {
  const before = experienceItemCount(SAMPLE);
  const once = injectSpacingFit(SAMPLE);
  assert.equal(once.changed, true);
  assert.match(once.tex, new RegExp(FIT_MARKER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const twice = injectSpacingFit(once.tex);
  assert.equal(twice.changed, false);
  assert.equal(experienceItemCount(once.tex), before);
});

test('tightenTypography floors at 10pt and 0.5in', () => {
  const { tex, changed } = tightenTypography(SAMPLE);
  assert.equal(changed, true);
  assert.match(tex, /\\documentclass\[10pt,a4paper\]/);
  assert.match(tex, /margin=0\.70in/);
  const again = tightenTypography('\\documentclass[10pt]{article}\\usepackage[margin=0.5in]{geometry}');
  assert.equal(again.changed, false);
});

test('compressFillerWording keeps the same duties', () => {
  const { tex, changed } = compressFillerWording(SAMPLE);
  assert.equal(changed, true);
  assert.match(tex, /built Python REST APIs/);
  assert.doesNotMatch(tex, /Successfully/);
  assert.equal(experienceItemCount(tex), experienceItemCount(SAMPLE));
});

test('dropInterestsSection never touches Experience', () => {
  const before = experienceItemCount(SAMPLE);
  const { tex, changed } = dropInterestsSection(SAMPLE);
  assert.equal(changed, true);
  assert.doesNotMatch(tex, /\\section\{Interests\}/);
  assert.match(tex, /\\section\{Experience\}/);
  assert.equal(experienceItemCount(tex), before);
});

test('applyNextFitPass walks spacing then typography', () => {
  const a = applyNextFitPass(SAMPLE, []);
  assert.equal(a.pass, 'spacing');
  const b = applyNextFitPass(a.tex, ['spacing']);
  assert.equal(b.pass, 'typography');
});
