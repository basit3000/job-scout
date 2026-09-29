import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCvTemplateApi } from '../../web/cv-template-routes.mjs';
import { withPromptSettings } from './prompt-settings.mjs';
import { ROOT } from './common.mjs';

async function request(path, { method = 'GET', origin, busy = false, body = {} } = {}) {
  const result = {};
  const response = { writeHead(status, headers) { Object.assign(result, { status, headers }); }, end(text) { result.text = text; } };
  result.handled = await handleCvTemplateApi({ method, headers: { host: 'localhost:4040', origin } }, response,
    new URL(path, 'http://localhost:4040'), { busy, json(_res, status, data) { Object.assign(result, { status, data }); }, readBody: async () => body });
  return result;
}

test('template routes validate access and return standalone previews and rules', async () => {
  await withPromptSettings(async () => {
    assert.equal((await request('/api/jobs')).handled, false);
    assert.equal((await request('/api/cv-templates')).data.templates[0].id, 'default');
    const preview = await request('/api/cv-templates/preview?id=default');
    assert.equal(preview.status, 200);
    assert.match(preview.text, /Sample Candidate/);
    assert.doesNotMatch(preview.text, /class="toolbar"|class="pack-note"|class="foot"/);
    assert.equal((await request('/api/cv-templates/rules?id=default')).status, 200);
    assert.equal((await request('/api/cv-templates/rules?id=../private')).status, 400);
    assert.equal((await request('/api/cv-templates', { method: 'DELETE' })).status, 405);
    assert.equal((await request('/api/cv-templates', { method: 'POST', busy: true })).status, 409);
    assert.equal((await request('/api/cv-templates', { method: 'POST', origin: 'https://example.com' })).status, 403);
    assert.equal((await request('/api/cv-templates', { method: 'POST', body: {} })).status, 400);
  }, ROOT, {});
});
