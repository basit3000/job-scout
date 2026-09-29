import { listCvTemplates, importCvTemplate, resolveCvTemplates, templateFormattingRules, withSelectedTemplate } from '../scripts/lib/cv-templates.mjs';
import { cvMarkdownToHtml } from '../scripts/lib/tailor-cv.mjs';

const PREVIEW = `# Sample Candidate

Professional title

sample@example.test | Sample City

## Education
### Example University | 2020–2024
Degree and field of study

## Experience
### Role at Example Organization | 2024–Present
- Describe a supported contribution and its outcome.
- Use clear, factual bullets relevant to the role.

## Projects
### Example Project
- Describe the project and your contribution.

## Skills
Category: supported skills and tools
`;

export async function handleCvTemplateApi(req, res, url, { json, readBody, busy }) {
  const path = url.pathname;
  if (!['/api/cv-templates', '/api/cv-templates/rules', '/api/cv-templates/preview'].includes(path)) return false;
  try {
    if (req.method === 'POST' && path === '/api/cv-templates') {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
        json(res, 403, { error: 'Import templates from the Job Scout app.' });
      } else if (busy) {
        json(res, 409, { error: 'Wait for preparation to finish before importing a template.' });
      } else {
        json(res, 201, await importCvTemplate(await readBody(req, 12 * 1024 * 1024)));
      }
    } else if (req.method !== 'GET') {
      json(res, 405, { error: 'Unsupported method.' });
    } else if (path === '/api/cv-templates') {
      json(res, 200, { templates: listCvTemplates() });
    } else if (path.endsWith('/rules')) {
      const [template] = resolveCvTemplates([url.searchParams.get('id')]);
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(templateFormattingRules(template));
    } else {
      const html = await withSelectedTemplate(url.searchParams.get('id'), () => cvMarkdownToHtml(PREVIEW));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html.replace(/<div class="toolbar">[\s\S]*?<\/div>/, '')
        .replace(/<p class="(?:pack-note|foot)">[\s\S]*?<\/p>/g, ''));
    }
  } catch (error) { json(res, 400, { error: error.message }); }
  return true;
}
