import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { recordDecision, patchDecision, loadDecisions, decisionsPath } from './decisions.mjs';
import { applicationFields } from './application-fields.mjs';
import { addApplicationAttachment, applicationAttachment, MAX_ATTACHMENT_BYTES } from './application-attachments.mjs';
import { followUpState } from '../../web/public/tracker-view.js';

async function temporary(t) {
  const parent = resolve(tmpdir());
  const root = await mkdtemp(join(parent, 'scout-records-'));
  assert.ok(resolve(root).startsWith(parent + sep));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('application date, contacts and attachments survive every status transition', async (t) => {
  const root = await temporary(t);
  const application = { company: 'Example', title: 'Engineer', appliedDate: '2026-08-01', contactName: 'Alex', salary: '60000 EUR', attachments: [{ id: 'saved' }] };
  await recordDecision('job:1', 'applied', 'Original notes', { root, application });
  const created = (await loadDecisions(root)).decisions[0];
  await recordDecision('job:1', 'interviewing', '', { root, job: { title: 'Changed posting title' } });
  await patchDecision('job:1', { decision: 'offer', followUpDate: '2026-09-10' }, { root });
  let entry = (await loadDecisions(root)).decisions[0];
  assert.equal(entry.appliedDate, '2026-08-01');
  assert.equal(entry.date, created.date);
  assert.equal(entry.contactName, 'Alex');
  assert.equal(entry.title, 'Engineer');
  assert.equal(entry.note, 'Original notes');
  assert.deepEqual(entry.attachments, [{ id: 'saved' }]);
  assert.deepEqual(entry.statusHistory.map((h) => h.to), ['applied', 'interviewing', 'offer']);
  assert.equal(followUpState(entry, '2026-09-10'), 'today');
  entry = await patchDecision('job:1', { decision: 'accepted' }, { root });
  assert.equal(entry.followUpDate, null);
  assert.equal(followUpState(entry, '2026-09-10'), null);
  await patchDecision('job:1', { note: '' }, { root });
  assert.equal((await loadDecisions(root)).decisions[0].note, '');
});

test('legacy dates are retained without inventing an application date', async (t) => {
  const root = await temporary(t);
  await mkdir(join(root, 'state'));
  await writeFile(decisionsPath(root), JSON.stringify({ decisions: [{ id: 'legacy', decision: 'applied', date: '2020-01-01', note: 'Keep me' }] }));
  const entry = await patchDecision('legacy', { decision: 'interviewing' }, { root });
  assert.equal(entry.appliedDate, undefined);
  assert.equal(entry.date, '2020-01-01');
  assert.equal(entry.statusHistory[0].from, 'applied');
});

test('parallel updates preserve every record and every attachment append', async (t) => {
  const root = await temporary(t);
  await Promise.all(Array.from({ length: 20 }, (_, index) => recordDecision(`job:${index}`, 'shortlisted', '', { root })));
  assert.equal((await loadDecisions(root)).decisions.length, 20);
  await Promise.all(Array.from({ length: 10 }, (_, index) => patchDecision('job:0', (entry) => ({ attachments: [...(entry.attachments || []), { id: index }] }), { root })));
  assert.equal((await loadDecisions(root)).decisions.find((entry) => entry.id === 'job:0').attachments.length, 10);
});

test('invalid JSON is never overwritten by a new decision', async (t) => {
  const root = await temporary(t);
  await mkdir(join(root, 'state'));
  await writeFile(decisionsPath(root), '{broken');
  await assert.rejects(recordDecision('new', 'applied', '', { root }));
  assert.equal(await readFile(decisionsPath(root), 'utf8'), '{broken');
});

test('application fields validate dates, links, statuses and required text', () => {
  assert.throws(() => applicationFields({ company: '', title: 'Dev' }, { creating: true }));
  assert.throws(() => applicationFields({ url: 'javascript:alert(1)' }));
  assert.throws(() => applicationFields({ url: 'https://user:password@example.com' }));
  assert.throws(() => applicationFields({ appliedDate: '2026-02-30' }));
  assert.throws(() => applicationFields({ decision: 'made-up' }));
  assert.throws(() => applicationFields({ contactEmail: 'not-an-email' }));
  assert.deepEqual(applicationFields({ company: ' Example ', title: ' Dev ', decision: 'offer', appliedDate: '', attachments: ['injected'] }, { creating: true }), { company: 'Example', title: 'Dev', appliedDate: null, decision: 'offer' });
});

test('submitted attachments preserve bytes, are scoped by application and validate uploads', async (t) => {
  const root = await temporary(t);
  await recordDecision('job:1', 'applied', '', { root });
  const payload = { name: 'Submitted CV.txt', kind: 'cv', data: Buffer.from('Exact submitted version').toString('base64') };
  const file = await addApplicationAttachment('job:1', payload, { root });
  const stored = await applicationAttachment('job:1', file.id, { root });
  assert.equal(await readFile(stored.path, 'utf8'), 'Exact submitted version');
  await assert.rejects(applicationAttachment('other', file.id, { root }), /not found/);
  await assert.rejects(applicationAttachment('job:1', '../decisions.json', { root }), /not found/);
  await assert.rejects(addApplicationAttachment('job:1', { ...payload, name: '../cv.txt' }, { root }));
  await assert.rejects(addApplicationAttachment('job:1', { ...payload, name: 'cv.exe' }, { root }));
  await assert.rejects(addApplicationAttachment('job:1', { ...payload, name: 'cv.pdf' }, { root }));
  await assert.rejects(addApplicationAttachment('job:1', { ...payload, data: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString('base64') }, { root }));
  await assert.rejects(addApplicationAttachment('missing', payload, { root }));
  assert.equal((await readdir(join(root, 'state/attachments'))).length, 1, 'failed upload leaves no orphan');
});
