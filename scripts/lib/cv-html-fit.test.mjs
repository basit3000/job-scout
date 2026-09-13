import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';
import {
  isPreformattedCvHtml,
  needsCompactCvHtml,
  tightenCvPrintCss,
  ensureLocalCvFits,
} from './cv-html-fit.mjs';

const md = `# Jane Doe

jane@example.com | https://example.com

Software Engineer - TypeScript, Node.js

## Experience

### Engineer - Example GmbH
2026 - Present

- Built TypeScript REST APIs.

## Education

**B.Sc.** - Example University (2018 - 2022)

## Projects

### Tool (Personal project)
https://github.com/example/tool

- Built a Node.js CLI.

## Skills

TypeScript, Node.js, REST APIs
`;

const prewrap = `<!doctype html><html><head><meta charset="utf-8"><title>CV</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;line-height:1.45;white-space:pre-wrap}</style>
</head><body>${md}</body></html>`;

describe('local CV HTML fit', () => {
  it('detects the preformatted Markdown dump that prints to two pages', () => {
    assert.equal(isPreformattedCvHtml(prewrap), true);
    assert.equal(needsCompactCvHtml(prewrap), true);
    assert.equal(needsCompactCvHtml('<style>@page { size: A4; }</style><h1>Jane</h1>'), false);
  });

  it('rebuilds compact ATS HTML before the first print', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-html-fit-'));
    const htmlPath = join(dir, 'cv.html');
    const pdfPath = join(dir, 'cv.pdf');
    let printedFrom = '';
    const notes = [];
    const result = await ensureLocalCvFits({
      html: prewrap,
      markdown: md,
      job: { id: 'job-1', title: 'Engineer', company: 'Example' },
      profile: { name: 'Jane Doe' },
      htmlPath,
      pdfPath,
      onEvent: (e) => notes.push(e.line),
      print: async (htmlFile, pdfFile) => {
        printedFrom = await readFile(htmlFile, 'utf8');
        await writeFile(pdfFile, pdfFixture(['Jane Doe CV']));
        return { ok: true, path: pdfFile };
      },
      countPages: async () => 1,
    });
    assert.doesNotMatch(printedFrom, /white-space:\s*pre-wrap/);
    assert.match(printedFrom, /<h1>Jane Doe<\/h1>/);
    assert.match(printedFrom, /@page \{ size: A4;/);
    assert.equal(result.pages, 1);
    assert.match(notes.join(' '), /one-page print/);
    assert.equal(await readFile(htmlPath, 'utf8'), printedFrom.endsWith('\n') ? printedFrom : `${printedFrom}\n`);
  });

  it('tightens print CSS once if the compact CV still overflows', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-html-fit-'));
    let prints = 0;
    const compact = `<style>@page { size: A4; margin: 12mm 14mm; }
    @media print { body { font-size: 10pt; line-height: 1.22; } }</style><h1>Jane</h1>`;
    const result = await ensureLocalCvFits({
      html: compact,
      markdown: md,
      htmlPath: join(dir, 'cv.html'),
      pdfPath: join(dir, 'cv.pdf'),
      print: async (_htmlFile, pdfFile) => {
        prints += 1;
        await writeFile(pdfFile, pdfFixture(prints === 1 ? ['One', 'Two'] : ['One']));
        return { ok: true, path: pdfFile };
      },
      countPages: async () => (prints === 1 ? 2 : 1),
    });
    assert.equal(prints, 2);
    assert.match(result.html, /job-scout-print-tight/);
    assert.equal(result.pages, 1);
    assert.equal(tightenCvPrintCss(result.html), result.html);
  });
});
