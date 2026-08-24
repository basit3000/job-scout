import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emphasizeBulletClauses,
  emphasizeItemizeBlock,
  enrichProjectBullet,
  enrichProjectsBody,
  reorderItemizeItems,
  scoreText,
} from './tex-bullets.mjs';

test('scoreText counts keyword hits', () => {
  assert.equal(scoreText('Built Python REST APIs on FastAPI', ['python', 'fastapi', 'java']), 2);
});

test('emphasizeBulletClauses keeps the verb clause first', () => {
  const before =
    'Built Python REST APIs on the production AI backend; migrated Flask to FastAPI; added pytest coverage';
  const { text, changed } = emphasizeBulletClauses(before, ['pytest', 'coverage']);
  assert.equal(changed, true);
  assert.match(text, /^Built Python REST APIs/);
  assert.ok(text.indexOf('pytest') < text.indexOf('migrated Flask'));
});

test('emphasizeBulletClauses is a no-op when already ordered', () => {
  const before = 'Migrated Flask to FastAPI; also documented the REST APIs';
  const { changed } = emphasizeBulletClauses(before, ['flask', 'fastapi']);
  assert.equal(changed, false);
});

test('reorderItemizeItems never drops a bullet', () => {
  const items = [
    '\\item Designed pytest unit tests.\n',
    '\\item Migrated Flask to FastAPI.\n',
    '\\item Built REST APIs for the frontend.\n',
  ];
  const { items: next, changed } = reorderItemizeItems(items, ['frontend', 'rest']);
  assert.equal(changed, true);
  assert.equal(next.length, 3);
  assert.match(next[0], /frontend/);
});

test('emphasizeItemizeBlock reorders items inside itemize', () => {
  const block = `\\begin{itemize}
  \\item Built Python REST APIs and PostgreSQL-backed features; debugged an unfamiliar codebase.
  \\item Migrated legacy Flask services to FastAPI.
  \\item Designed pytest unit tests, reaching up to 100\\% coverage.
\\end{itemize}`;
  const { block: out, changed } = emphasizeItemizeBlock(block, ['pytest', 'coverage']);
  assert.equal(changed, true);
  assert.match(out, /\\begin\{itemize\}/);
  assert.match(out, /pytest/);
  const firstItem = out.split('\\item')[1];
  assert.match(firstItem, /pytest/);
});

test('enrichProjectBullet adds at most one posting-named tag', () => {
  const project = { title: 'PD-League', tags: ['Python', 'FastAPI', 'Discord', 'Docker'] };
  const { text, changed } = enrichProjectBullet(
    'Designed end to end: one FastAPI service on PostgreSQL.',
    project,
    ['docker'],
  );
  assert.equal(changed, true);
  assert.match(text, /Docker/);
  assert.doesNotMatch(text, /Discord/);
});

test('enrichProjectBullet does not invent tags the posting did not name', () => {
  const project = { title: 'PD-League', tags: ['Python', 'Discord'] };
  const { changed } = enrichProjectBullet(
    'Designed a FastAPI service on PostgreSQL.',
    project,
    ['kubernetes'],
  );
  assert.equal(changed, false);
});

test('enrichProjectsBody handles nested \\cvitem labels', () => {
  const body =
    '\\cvitem{\\href{https://pkdota.com}{PD-League}}{Designed a FastAPI service on PostgreSQL.}';
  const { body: out, changed } = enrichProjectsBody(
    body,
    ['docker'],
    [{ title: 'PD-League', tags: ['Docker'] }],
  );
  assert.equal(changed, true);
  assert.match(out, /Docker/);
  assert.match(out, /\\href\{https:\/\/pkdota.com\}\{PD-League\}/);
});
