import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overleafDir, jobOverleafDir, withJobOverleaf } from './overleaf-workspace.mjs';
import { loadPrepInputs } from './prep-state.mjs';
import { verifyCvAfterAgent } from './cv-verify.mjs';

test('concurrent job checkouts, fingerprints and gate rollback remain isolated', async t => {
  const root = await mkdtemp(join(tmpdir(), 'scout-overleaf-jobs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = String.raw`\documentclass{article}
\begin{document}
\section{Experience}
\role{Engineer}{Example}{2024 -- Present}
\end{document}`;
  const global = overleafDir(root);
  await mkdir(global, { recursive: true });
  await writeFile(join(global, 'main.tex'), 'shared source must stay unchanged');
  const barrier = Promise.withResolvers();
  let staged = 0;
  const results = await Promise.all(['job:a', 'job:b'].map(id => withJobOverleaf(id, async () => {
    const checkout = overleafDir(root);
    assert.equal(checkout, jobOverleafDir(id, root));
    const prepDir = join(root, id.endsWith('a') ? 'prep-a' : 'prep-b');
    await mkdir(checkout, { recursive: true });
    await mkdir(join(prepDir, 'before'), { recursive: true });
    for (const name of ['main.tex', 'ats.tex']) {
      await writeFile(join(prepDir, 'before', name), source);
      await writeFile(join(checkout, name), id.endsWith('a') ? source.replace('Example', 'Invented') : source);
    }
    if (++staged === 2) barrier.resolve();
    await barrier.promise;
    const inputs = await loadPrepInputs({ source: 'overleaf' }, root);
    assert.equal(inputs['.workspace/overleaf/main.tex'].includes('Invented'), id.endsWith('a'));
    const result = await verifyCvAfterAgent({ root, prepDir, cvSource: 'overleaf', job: { title: 'Engineer', company: 'Example' } });
    assert.equal(await readFile(join(checkout, 'main.tex'), 'utf8'), source);
    return result;
  }, root)));
  assert.equal(results[0].reverted, true);
  assert.equal(results[1].ok, true);
  assert.equal(overleafDir(root), global);
  assert.equal(await readFile(join(global, 'main.tex'), 'utf8'), 'shared source must stay unchanged');
});
