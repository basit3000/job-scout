import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ROOT } from './common.mjs';
import { pdfFixture } from '../test-helpers/pdf-fixture.mjs';

test('HTTP workflow filters history, exports per job, regenerates stale packs and preserves a good CV on overflow', { timeout: 60000 }, async (t) => {
  const parent = join(ROOT, '.workspace', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'http-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode == null && child.signalCode == null) {
      const exit = once(child, 'exit');
      if (child.kill()) await exit;
    }
    await rm(root, { recursive: true, force: true });
  });
  for (const dir of ['scripts/lib', 'web', 'markets', '.agents/skills/cv-tailor']) await cp(join(ROOT, dir), join(root, dir), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  for (const dir of ['cv', 'state', '.workspace']) await mkdir(join(root, dir), { recursive: true });
  const profile = { name: 'Test Candidate', headline: 'Backend Engineer', targetRole: 'Backend Engineer', seniority: 'mid',
    search: { titles: ['Backend Engineer'], includeTitlePatterns: ['Backend'] }, skills: { strong: ['Python', 'SQL'] },
    links: { email: 'candidate@example.com' }, experience:[{title:'Engineer',org:'Example',from:'2022',to:'present'}],education:[{degree:'Computer Science',school:'University',to:'2020'}] };
  await writeFile(join(root, 'state/memory.json'), JSON.stringify({schemaVersion:1,revision:1,facts:profile,preferences:{},answers:{}}));
  await writeFile(join(root, 'search-profile.json'), JSON.stringify({ market: 'DE', filters: { maxAgeDays: 14 }, cv: { source: 'local' } }));
  const resume = '# Test Candidate\ncandidate@example.com\n\n## Experience\n### Engineer | Example\n2022 – Present\n- Built Python services and SQL databases.\n\n## Education\n### Computer Science | University\n2020\n\n## Skills\nPython, SQL\n';
  await writeFile(join(root, 'cv', 'resume.md'), resume);
  const job = { id: 'fixture:1', title: 'Backend Engineer', company: 'Example', location: 'Berlin, Germany', description: 'Build Python services and SQL databases.', postedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), url: 'https://example.com/job/1' };
  await writeFile(join(root, '.workspace', 'jobs.json'), JSON.stringify({ jobs: [job, { ...job, id: 'fixture:2', title: 'Backend Engineer Platform', url: 'https://example.com/job/2' }, { ...job, id: 'old', title: 'Backend Engineer Legacy', url: 'https://example.com/job/old', postedAt: '2020-01-01' }] }));
  await writeFile(join(root, 'state', 'decisions.json'), JSON.stringify({ decisions: [{ id: 'old', decision: 'applied', title: 'Backend Engineer Legacy', date: '2020-01-01' }] }));

  // Substitute only the external renderer in the isolated copy. Routes, tailoring,
  // PDF inspection, manifests, staging, and exports use the production modules.
  const pdfPath = join(root, 'scripts/lib/pdf.mjs');
  const pdf = await readFile(pdfPath, 'utf8');
  const begin = pdf.indexOf('export async function htmlFileToPdf(');
  const end = pdf.indexOf('\nasync function pathIfRunnable', begin);
  assert.ok(begin >= 0 && end > begin);
  const fixture = (text) => pdfFixture(text).toString('base64');
  const renderer = `export async function htmlFileToPdf(htmlPath, pdfPath) {
    const requestedOverflow = await readFile(join(ROOT, '.workspace', 'overflow'), 'utf8').catch(() => '');
    const { currentCvTemplateId } = await import('./cv-template-context.mjs');
    const overflow = requestedOverflow === '1' || requestedOverflow === currentCvTemplateId();
    await writeFile(pdfPath, Buffer.from(overflow ? '${fixture(['First page', 'Experience on page two'])}' : '${fixture(['Complete test CV'])}', 'base64'));
    return { ok: true, path: pdfPath, via: 'test renderer' };
  }\n`;
  await writeFile(pdfPath, pdf.slice(0, begin) + renderer + pdf.slice(end));
  const letterPath = join(root, 'scripts/lib/cover-letter.mjs');
  const letterSource = await readFile(letterPath, 'utf8');
  const wordStart = letterSource.indexOf('function docxToPdfViaWord(');
  const wordEnd = letterSource.indexOf('\nasync function writeCoverLetterArtifacts', wordStart);
  assert.ok(wordStart >= 0 && wordEnd > wordStart);
  await writeFile(letterPath, letterSource.slice(0, wordStart)
    + 'function docxToPdfViaWord() { return { ok: false }; }\n' + letterSource.slice(wordEnd));
  // Fake only model processes; keep the MCP bridge, document gates and publication real.
  await writeFile(join(root, 'scripts/lib/goose-runtime.mjs'), `
    import { readFile, writeFile } from 'node:fs/promises';
    import { ROOT } from './common.mjs';
    import { join } from 'node:path';
    export const resolveGooseBinary = async () => process.execPath;
    export const withGooseContext = (signal, fn) => fn();
    export const cancelGooseRuns = () => false;
    export async function runGoose({prompt,extensionUrl}) {
      if (await readFile(join(ROOT,'.workspace/fail-agent'),'utf8').catch(()=>'')) throw new Error('Synthetic Goose failure');
      if (!extensionUrl) {
        const dir = join(ROOT, prompt.match(/\\.workspace\\/prep-staging\\/[a-f0-9-]+/)[0]);
        if (prompt.includes('review-context.md')) {
          const letter = prompt.includes('letter-review-context.md');
          await writeFile(join(dir, letter ? 'cover-letter-review.md' : 'review.md'),
            'Verdict: pass\\nATS: 9/10\\nPosting fit: 9/10\\nRecruiter scan: 9/10\\nCover letter: 9/10\\n\\n## Must fix\\n- _none_\\n');
        } else if (!prompt.startsWith('Cover letter tailor')) {
          await writeFile(join(dir,'cv.md'), await readFile(join(ROOT,'cv/resume.md'),'utf8'));
        }
        return 'Worker completed.';
      }
      const names=prompt.match(/Available Job Scout tools: (.*)\\./)[1].split(', ');
      for (const name of names) {
        const response=await fetch(extensionUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:name,method:'tools/call',params:{name,arguments:{}}})});
        const result=await response.json();
        if (result.error || result.result?.isError) throw new Error('Synthetic tool failed: '+JSON.stringify(result));
      }
      return 'Selected tools completed.';
    }
  `);
  const serverPath = join(root, 'web/server.mjs');
  await writeFile(serverPath, (await readFile(serverPath, 'utf8')).replace('server.listen(PORT, () => {', 'server.listen(PORT, () => { process.send({ port: server.address().port });'));
  child = spawn(process.execPath, [serverPath], { cwd: root, windowsHide: true,
    env: { ...process.env, PORT: '0', NO_OPEN: '1', GOOGLE_SHEETS_SPREADSHEET_ID: '', APIFY_TOKEN: '', OVERLEAF_GIT_TOKEN: '', OVERLEAF_PROJECT_ID: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let logs = '';
  child.stderr.on('data', (b) => { logs += b; });
  child.stdout.resume();
  const [{ port }] = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(`Server exited: ${logs}`); })]);
  async function request(path, body, method = body ? 'POST' : 'GET') {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    assert.ok(res.ok, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  assert.equal((await request('/api/jobs')).pagination.total, 2);
  assert.equal((await request('/api/jobs?scope=history')).pagination.total, 3);
  assert.equal((await request('/api/tracker')).total, 1);
  async function prep(id, tools = ['inspect_job','inspect_cv','prepare_cv','inspect_reviews'], templateIds) {
    const started=await request('/api/prep',{id,tools,templateIds,prompt:'Prepare and review the selected documents using only supported candidate facts.'});
    const response=await fetch(`http://127.0.0.1:${port}/api/prep/stream`);
    const reader=response.body.getReader();let text='';
    try {
      while(true) {
        const {value,done}=await reader.read(); if(done)throw new Error('Missing completion');
        text+=new TextDecoder().decode(value);
        const match=text.match(/event: done\r?\ndata: ([^\r\n]+)/);
        if(match)return JSON.parse(match[1]);
      }
    } finally {await reader.cancel();}
  }
  const first=await prep('fixture:1');
  assert.equal(first.ok,true,first.error);
  assert.equal(first.pack.needsReview,false);
  assert.ok((await readdir(first.pack.downloadFolderAbs)).includes('Test Candidate CV.pdf'));
  const second=await prep('fixture:2');
  assert.equal(second.ok,true,second.error);
  assert.notEqual(first.pack.downloadFolderAbs,second.pack.downloadFolderAbs);
  assert.equal((await request('/api/ready')).total,2);
  const oldMode=await fetch(`http://127.0.0.1:${port}/api/prep`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'fixture:1',mode:'fast'})});
  assert.equal(oldMode.status,400);
  const legacyProvider=await fetch(`http://127.0.0.1:${port}/api/settings`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentProvider:'cursor'})});
  assert.equal(legacyProvider.status,400);
  await writeFile(join(root,'cv/resume.md'),resume+'\nAdditional project: Python API.\n');
  await request('/api/settings',{maxAgeDays:14},'PUT');
  assert.equal((await request('/api/ready')).total,0);
  const regenerated=await prep('fixture:1');
  assert.equal(regenerated.ok,true,regenerated.error);
  const bytes=await readFile(join(regenerated.pack.dir,'cv.pdf'));
  await writeFile(join(root,'.workspace/fail-agent'),'1');
  const failed=await prep('fixture:1');
  assert.equal(failed.ok,false);
  assert.deepEqual(await readFile(join(regenerated.pack.dir,'cv.pdf')),bytes,'agent failure cannot overwrite accepted CV');
  await writeFile(join(root,'.workspace/fail-agent'),'');
  await writeFile(join(root,'.workspace/overflow'),'1');
  const overflow=await prep('fixture:1');
  assert.equal(overflow.ok,true,overflow.error);
  assert.equal(overflow.pack.needsReview,true);
  assert.deepEqual(await readFile(join(regenerated.pack.dir,'cv.pdf')),bytes,'overflow preserves previous accepted CV');
  await writeFile(join(root,'.workspace/overflow'),'');
  await request('/api/prep/batch',{ids:['fixture:2'],includeCoverLetter:false,skipExisting:false});
  let batch;
  for(let i=0;i<200;i++) {batch=await request('/api/prep/batch');if(!batch.running)break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(batch.items[0].status,'done',batch.items[0].error);
  // Multiple formats use real host rendering/review/publication and isolated files.
  const compact = { id: 'compact', name: 'Compact', sectionOrder: [], maxPages: 1,
    layout: { widthMm: 210, heightMm: 297, marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10,
      font: 'Arial', color: '282828', bodyPt: 9, namePt: 24, headingPt: 10, contactPt: 10, headerAlign: 'left',
      headingUppercase: true, headingRule: true, lineHeight: 1.15, paragraphAfterPt: 0, sectionBeforePt: 8, bulletIndentPt: 24 } };
  await mkdir(join(root, 'prompts'), { recursive: true });
  await writeFile(join(root, 'prompts/local.json'), JSON.stringify({ templates: [compact] }));
  assert.equal((await request('/api/goose')).templates.length, 2);
  const missingSelection = await fetch(`http://127.0.0.1:${port}/api/prep`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: job.id, tools: ['prepare_cv'], prompt: 'Create CV' }) });
  assert.equal(missingSelection.status, 400);
  const multiple = await prep(job.id, undefined, ['compact', 'default']);
  assert.equal(multiple.ok, true, multiple.error);
  assert.equal(multiple.pack.variants.length, 2);
  const [custom, original] = multiple.pack.variants;
  assert.equal(custom.needsReview, false);
  assert.notEqual(custom.dir, original.dir);
  assert.notEqual(custom.downloadFolderAbs, original.downloadFolderAbs);
  const customHtml = await (await fetch(`http://127.0.0.1:${port}${custom.downloadCvHtml}`)).text();
  assert.match(customHtml, /font-size: 24pt/);
  const originalHtml = await (await fetch(`http://127.0.0.1:${port}${original.downloadCvHtml}`)).text();
  assert.doesNotMatch(originalHtml, /Selected CV formatting profile/);
  const reopened = await request(`/api/prep/${encodeURIComponent(job.id)}`);
  assert.equal(reopened.variants.length, 2);
  assert.equal(reopened.templateId, 'compact');
  assert.equal((await request('/api/ready')).total, 2, 'current custom format remains ready after reopening');
  const snapshot = await readFile(join(custom.dir, 'cv.pdf'));
  await writeFile(join(root, '.workspace/overflow'), '1');
  const replacement = await prep(job.id, undefined, ['compact']);
  assert.equal(replacement.ok, true, replacement.error);
  assert.equal(replacement.pack.needsReview, true);
  assert.deepEqual(await readFile(join(custom.dir, 'cv.pdf')), snapshot);
  assert.deepEqual(await readFile(join(original.dir, 'cv.pdf')), snapshot);
  await writeFile(join(root, '.workspace/overflow'), '');
  await request('/api/prep/batch', { ids: ['fixture:2'], templateIds: ['compact'], includeCoverLetter: false, skipExisting: false });
  for (let i = 0; i < 200; i++) { batch = await request('/api/prep/batch'); if (!batch.running) break; await new Promise(r => setTimeout(r, 20)); }
  assert.equal(batch.items[0].status, 'done', batch.items[0].error);
  assert.equal((await request('/api/prep/fixture%3A2')).templateId, 'compact');
  const letter = await prep('fixture:2', ['prepare_letter']);
  assert.equal(letter.ok, true, letter.error);
  assert.equal(letter.pack.templateId, 'compact', 'cover letter uses the selected primary CV');
  // Reusing already reviewed files must still honor the selected primary format.
  await request('/api/prep/batch', { ids: ['fixture:2'], templateIds: ['default'], includeCoverLetter: false, skipExisting: true });
  for (let i = 0; i < 200; i++) { batch = await request('/api/prep/batch'); if (!batch.running) break; await new Promise(r => setTimeout(r, 20)); }
  assert.equal(batch.items[0].status, 'skipped', batch.items[0].error);
  assert.equal((await request('/api/prep/fixture%3A2')).templateId, 'default');
  // A later variant requiring review cannot report the whole request as ready.
  await writeFile(join(root, '.workspace/overflow'), 'default');
  const partial = await prep('fixture:2', undefined, ['compact', 'default']);
  assert.equal(partial.ok, true, partial.error);
  assert.equal(partial.pack.variants[0].needsReview, false);
  assert.equal(partial.pack.variants[1].needsReview, true);
  assert.equal(partial.pack.needsReview, true);
  assert.equal((await request('/api/prep/fixture%3A2')).templateId, 'default', 'failed multi-format run preserves previous primary selection');
});
