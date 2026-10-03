import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { revealDownloadsFolder } from './cv-downloads.mjs';

test('folder launcher passes Windows paths as one argument and reports asynchronous errors', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'job-scout folder & test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let detached = false;
  const result = await revealDownloadsFolder(dir, { platform: 'win32', spawnImpl(command, args, options) {
    assert.equal(command, 'explorer.exe');
    assert.deepEqual(args, [resolve(dir)]);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, false, 'the requested Explorer window must be visible');
    const child = new EventEmitter();
    child.unref = () => { detached = true; };
    setImmediate(() => child.emit('spawn'));
    return child;
  } });
  assert.equal(result.ok, true);
  assert.equal(detached, true);
  const failure = await revealDownloadsFolder(dir, { spawnImpl() {
    const child = new EventEmitter();
    setImmediate(() => child.emit('error', new Error('Synthetic launch failure')));
    return child;
  } });
  assert.equal(failure.ok, false);
  assert.match(failure.error, /Synthetic launch failure/);
});
