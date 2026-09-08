import assert from 'node:assert/strict';
import test from 'node:test';
import { readBraceGroup } from './tex-parse.mjs';

test('readBraceGroup reads a simple group', () => {
  assert.deepEqual(readBraceGroup('{hello}', 0), { arg: 'hello', end: 7 });
});

test('readBraceGroup tracks nested braces and skips escaped chars', () => {
  const src = String.raw`{a {b} c\} d}`;
  const g = readBraceGroup(src, 0);
  assert.equal(g.arg, String.raw`a {b} c\} d`);
  assert.equal(g.end, src.length);
});

test('readBraceGroup returns null when it does not start at {', () => {
  assert.equal(readBraceGroup('x{y}', 0), null);
  assert.equal(readBraceGroup('', 0), null);
});
