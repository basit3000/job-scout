import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  texEscape,
  parseCvMarkdown,
  buildCvTex,
  CV_GEOMETRY,
} from './latex-cv.mjs';

const SAMPLE = `# Ada Lovelace

ada@example.com | +49 173 1614951 | Mainz, Germany | [LinkedIn](https://example.com/in/ada) | [GitHub](https://github.com/ada)

Software Engineer — Python, SQL

## Experience

### Software Engineer — Dudaev Systems UG
Mar 2026 – Present · Berlin, Germany

- Built REST APIs with **Python** and FastAPI
- Shipped CI with 100% coverage & no regressions

### Founder — OrganizeAI

- Took the product to launch

## Education

**M.Sc. Computer Science** — Bingen (Oct 2022 – Aug 2026)
- Thesis graded 1.0

## Technical Skills

**Programming Languages:** Python, SQL
**Frontend:** Next.js, React
`;

const doc = parseCvMarkdown(SAMPLE);
const tex = buildCvTex(doc);

describe('texEscape', () => {
  it('escapes the characters LaTeX would otherwise eat', () => {
    assert.equal(texEscape('100% & C_x #1 {a}'), '100\\% \\& C\\_x \\#1 \\{a\\}');
  });

  it('maps unicode dashes and separators to LaTeX equivalents', () => {
    assert.equal(texEscape('a – b — c · d'), 'a -- b --- c \\textperiodcentered{} d');
  });
});

describe('parseCvMarkdown', () => {
  it('pulls the name, headline, and contact row apart', () => {
    assert.equal(doc.name, 'Ada Lovelace');
    assert.equal(doc.headline, 'Software Engineer — Python, SQL');
    assert.equal(doc.contact.length, 5);
    assert.ok(doc.contact.includes('ada@example.com'));
  });

  it('keeps sections in document order without assuming their names', () => {
    assert.deepEqual(
      doc.sections.map((s) => s.title),
      ['Experience', 'Education', 'Technical Skills'],
    );
  });

  it('reads entry dates from the line under the heading', () => {
    const first = doc.sections[0].entries[0];
    assert.equal(first.title, 'Software Engineer — Dudaev Systems UG');
    assert.equal(first.meta, 'Mar 2026 – Present · Berlin, Germany');
    assert.equal(first.bullets.length, 2);
  });

  it('treats an entry with no date line as having no meta', () => {
    assert.equal(doc.sections[0].entries[1].meta, '');
  });

  it('collects section-level lines that belong to no entry', () => {
    assert.equal(doc.sections[2].loose.length, 2);
    assert.match(doc.sections[2].loose[0].text, /Programming Languages/);
  });
});

describe('buildCvTex', () => {
  it('emits a compilable single-column document', () => {
    assert.match(tex, /\\documentclass\[10pt,a4paper\]\{article\}/);
    assert.match(tex, /\\begin\{document\}/);
    assert.match(tex, /\\end\{document\}/);
  });

  it('uses the margins measured from the reference CV', () => {
    assert.match(tex, /left=13mm,right=13mm,top=13mm,bottom=12mm/);
  });

  it('lays the entry row out as dates gutter, org, then location', () => {
    assert.match(
      tex,
      /\\jsEntry\{Mar 2026 to Present\}\{Dudaev Systems UG\}\{, Software Engineer\}\{Berlin, Germany\}/,
    );
    // The date column is a length now, so a long date widens it for the whole
    // document instead of overprinting the title.
    assert.ok(
      tex.includes('\\makebox[\\jsDateCol][l]{#1}\\textbf{#2}#3\\hfill\\hspace*{\\jsGutterSep}#4'),
      tex,
    );
  });

  it('never emits an em or en dash anywhere on the page', () => {
    const body = tex.slice(tex.indexOf('\\begin{document}'));
    assert.doesNotMatch(body, /[‒-―−]/);
    assert.doesNotMatch(body, /---|(?<!-)--(?!-)/);
  });

  it('keeps compound hyphens inside words', () => {
    const withCompounds = buildCvTex(parseCvMarkdown(
      '# A\n\n## Experience\n\n### R — O\n2020 – 2021 · X\n\n- real-time AI-native SAT-based work\n',
    ));
    assert.match(withCompounds, /real-time AI-native SAT-based work/);
    assert.match(withCompounds, /\\jsEntry\{2020 to 2021\}/);
  });

  it('places the portrait only when one is available', () => {
    assert.doesNotMatch(tex, /includegraphics/);
    const withPhoto = buildCvTex(doc, { photo: true });
    assert.match(withPhoto, /\\includegraphics\[width=\d+pt\]\{photo\.png\}/);
    assert.match(withPhoto, /\\usepackage\{graphicx\}/);
  });

  it('puts the bullet column where the reference has it', () => {
    // Bullets hang off the same measured column as the entry rows.
    assert.ok(tex.includes('labelindent=\\jsDateCol'), tex);
    assert.ok(tex.includes('leftmargin=\\jsBulletText'), tex);
    assert.ok(tex.includes('labelwidth=\\jsLabelW'), tex);
    // …and that column starts at the measured reference gutter.
    assert.match(tex, new RegExp(`\\\\newcommand\{\\\\jsGutter\}\{${CV_GEOMETRY.gutter}pt\}`));
    assert.ok(tex.includes('\\setlength{\\jsDateCol}{\\jsGutter}'), tex);
  });

  it('measures every date before the first entry is typeset', () => {
    // TeX has the font metrics; JS does not. Each distinct date is measured up
    // front so the column is already wide enough when the entries are set.
    const body = tex.slice(tex.indexOf('\\begin{document}'));
    assert.ok(body.includes('\\jsMeasure{Mar 2026 to Present}'), body);
    // Education here is the loose "**Degree** — School (dates)" style, which has
    // no date field — only dated entries reach the column.
    assert.ok(!body.includes('\\jsMeasure{Oct 2022'), body);
    assert.ok(
      body.indexOf('\\jsSyncColumns') < body.indexOf('\\jsEntry{Mar 2026'),
      'columns must be sized before the first entry',
    );
  });

  it('is ragged right and never hyphenates, like the reference', () => {
    assert.match(tex, /\\raggedright/);
    assert.match(tex, /\\hyphenpenalty=10000/);
  });

  it('renders a markdown link as its label, not a bare URL', () => {
    assert.match(tex, /\\href\{https:\/\/github\.com\/ada\}\{GitHub\}/);
    assert.doesNotMatch(tex, /\[GitHub\]/);
  });

  it('keeps inline bold as LaTeX bold, not literal asterisks', () => {
    assert.match(tex, /\\textbf\{Python\}/);
    assert.doesNotMatch(tex, /\*\*/);
  });

  it('renders a skills section as full-width prose, not dated entries', () => {
    assert.match(tex, /\\jsSection\{Technical Skills\}/);
    assert.match(tex, /\\textbf\{Programming Languages:\} Python, SQL\\par/);
  });

  it('escapes special characters coming from bullet text', () => {
    assert.match(tex, /100\\% coverage \\& no regressions/);
    assert.doesNotMatch(tex, /textbackslash/);
  });
});
