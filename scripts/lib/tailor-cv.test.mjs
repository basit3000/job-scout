import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseResumeMarkdown } from './resume-md.mjs';
import { cvMarkdownToHtml, cvModelFromMarkdown } from './tailor-cv.mjs';

const md = `# Jane Doe

Bristol, UK | jane@example.com | https://example.com

Software Engineer, Platform - TypeScript, Node.js, REST API

Available from 1 June 2030 - Open to relocation within the UK

Available for hybrid work

## Experience

### Software Developer - Example Company
07/2028 - Present | Bristol, UK

- Maintain TypeScript REST APIs for a sample inventory application.

### Placement Software Developer - Example Company
07/2027 - 06/2028 | Bristol, UK

- Added integration tests for inventory updates.

## Education

**M.Sc. in Software Engineering** - Example Graduate University (09/2028 - Present)
Taught modules completed; dissertation remaining.

**B.Sc. in Computing** - Example University (09/2023 - 06/2027)

## Projects

### Inventory Demo (Personal project)
https://example.com/inventory-demo

- Built a Node.js application for tracking sample stock items.

## Skills

Backend: TypeScript, JavaScript (Node.js), Python (FastAPI)
Delivery: Docker, Jenkins, AWS EC2
`;

describe('cvMarkdownToHtml', () => {
  it('keeps agent wording and prints compact ATS HTML instead of preformatted markdown', () => {
    const parsed = parseResumeMarkdown(md);
    assert.equal(parsed.headline, 'Software Engineer, Platform - TypeScript, Node.js, REST API');
    assert.deepEqual(parsed.notes, [
      'Available from 1 June 2030 - Open to relocation within the UK',
      'Available for hybrid work',
    ]);

    const model = cvModelFromMarkdown(md, {
      job: { id: 'job-1', title: 'Platform Engineer', company: 'Sample Company' },
      profile: { name: 'Jane Doe' },
    });
    assert.equal(model.experience.length, 2);
    assert.equal(model.experience[0].org, 'Example Company');
    assert.match(model.education[0].degree, /M.Sc. in Software Engineering/);
    assert.match(model.education[0].bullets.join(' '), /dissertation remaining/);

    const html = cvMarkdownToHtml(md, {
      job: { id: 'job-1', title: 'Platform Engineer', company: 'Sample Company' },
      profile: { name: 'Jane Doe' },
    });
    assert.match(html, /@page \{ size: A4;/);
    assert.match(html, /<h1>Jane Doe<\/h1>/);
    assert.match(html, /<h2>Experience<\/h2>/);
    assert.match(html, /Available for hybrid work/);
    assert.match(html, /dissertation remaining/);
    assert.doesNotMatch(html, /white-space:\s*pre-wrap/);
    assert.doesNotMatch(html, /<body># Jane Doe/);
  });
});
