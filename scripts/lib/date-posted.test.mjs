import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apifyDatePostedAttempts,
  indeedDatePostedLadder,
  linkedInDatePostedLadder,
  mapIndeedDatePosted,
  mapLinkedInDatePosted,
} from './date-posted.mjs';

test('LinkedIn prefers pastWeek, then pastMonth when maxAge is a month', () => {
  assert.equal(mapLinkedInDatePosted(30), 'pastWeek');
  assert.deepEqual(linkedInDatePostedLadder(30), ['pastWeek', 'pastMonth']);
});

test('LinkedIn does not widen past the local max-age window', () => {
  assert.deepEqual(linkedInDatePostedLadder(7), ['pastWeek']);
  assert.deepEqual(linkedInDatePostedLadder(1), ['past24h', 'pastWeek']);
});

test('LinkedIn pinned datePosted disables the ladder', () => {
  assert.deepEqual(linkedInDatePostedLadder(30, 'pastMonth'), ['pastMonth']);
  assert.deepEqual(
    apifyDatePostedAttempts('linkedin', 30, { input: { datePosted: 'pastMonth' } }),
    ['pastMonth'],
  );
});

test('Indeed prefers 7 days then 14 when maxAge is a month', () => {
  assert.equal(mapIndeedDatePosted(30), '14');
  assert.deepEqual(indeedDatePostedLadder(30), ['7', '14']);
  assert.deepEqual(indeedDatePostedLadder(7), ['7']);
});

test('other boards have a single unscoped attempt', () => {
  assert.deepEqual(apifyDatePostedAttempts('bayt', 30, {}), [undefined]);
});
