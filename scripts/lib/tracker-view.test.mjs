import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateKey, validDateKey, followUpState, trackerSummary, filterTracker } from '../../web/public/tracker-view.js';

const items = [
  { id: 'a', decision: 'applied', title: 'Engineer', company: 'One', followUpDate: '2026-09-08', note: 'Ask Taylor', at: 10 },
  { id: 'b', decision: 'interviewing', title: 'Developer', company: 'Two', followUpDate: '2026-09-09', at: 20 },
  { id: 'c', decision: 'rejected', title: 'Engineer', followUpDate: '2026-09-01', at: 30 },
  { id: 'd', decision: 'shortlisted', title: 'Designer', followUpDate: '2026-09-12', at: 40 },
];

test('follow-up dates are calendar dates; closed applications never become due', () => {
  assert.equal(localDateKey(new Date(2026, 8, 9, 0, 5)), '2026-09-09');
  assert.equal(validDateKey('2026-02-30'), false);
  assert.equal(validDateKey('2028-02-29'), true);
  assert.equal(followUpState(items[0], '2026-09-09'), 'overdue');
  assert.equal(followUpState(items[1], '2026-09-09'), 'today');
  assert.equal(followUpState(items[2], '2026-09-09'), null);
  assert.equal(followUpState({ decision: 'applied', followUpDate: 'garbage' }), null);
  assert.deepEqual(trackerSummary(items, '2026-09-09'), { total: 4, active: 3, interviewing: 1, due: 2 });
});

test('follow-up queue puts oldest due dates first and search includes notes', () => {
  assert.deepEqual(filterTracker(items, { dueOnly: true, today: '2026-09-09' }).map((i) => i.id), ['a', 'b']);
  assert.deepEqual(filterTracker(items, { query: ' TAYLOR ' }).map((i) => i.id), ['a']);
  assert.deepEqual(filterTracker(items, { statuses: ['rejected'] }).map((i) => i.id), ['c']);
  assert.deepEqual(filterTracker(items).map((i) => i.id), ['d', 'b', 'a']);
  assert.deepEqual(filterTracker(items, { sort: 'oldest' }).map((i) => i.id), ['a', 'b', 'd']);
  assert.equal(filterTracker(items, { query: 'missing' }).length, 0);
  assert.equal(items[0].id, 'a');
});
