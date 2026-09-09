import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, digestItems } from './list-pagination.mjs';

test('pagination bounds invalid inputs and covers every result exactly once', () => {
  const rows = Array.from({ length: 63 }, (_, id) => ({ id }));
  const pages = [1, 2, 3, 4].map(page => paginate(rows, new URL(`http://local/?page=${page}&pageSize=20`)));
  assert.deepEqual(pages.flatMap(page => page.items), rows);
  assert.equal(pages[3].items.length, 3);
  assert.equal(paginate(rows, new URL('http://local/?page=999')).page, 7);
  for (const value of ['NaN', 'Infinity', '-5', '0', '0.2', '1.8']) {
    const result = paginate(rows, new URL(`http://local/?page=${value}&pageSize=${value}`));
    assert.ok(result.page >= 1 && result.pageSize >= 5 && result.items.length > 0);
  }
  assert.equal(paginate(rows, new URL('http://local/?pageSize=1000')).items.length, 50);
  assert.deepEqual(paginate([], new URL('http://local/')).items, []);
});

test('digest filters before pagination and excludes applications already in progress', () => {
  const jobs = ['none', 'shortlisted', 'applied', 'interviewing', 'offer', 'accepted', 'skipped'].map((status, id) => ({ id, isNew: true, currentSearch: { current: true }, decision: { decision: status } }));
  jobs.push({ id: 7, isNew: false, currentSearch: { current: true } }, { id: 8, isNew: true, currentSearch: { current: false } });
  assert.deepEqual(digestItems(jobs, new URL('http://local/?hide=skipped')).map(job => job.id), [0, 1]);
});
