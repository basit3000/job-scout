import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './common.mjs';
import { pythonCandidates, runPython } from './python-runtime.mjs';
import { startJobspyWorkerFromBins } from './fetch-pool.mjs';

async function fixture(t) {
  const parent = join(ROOT, '.workspace', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'python with spaces '));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('venv wins over a system Python without JobSpy on either platform', () => {
  for (const platform of ['win32', 'linux']) {
    const root = join(ROOT, 'example with spaces');
    const exe = join(root, '.venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    assert.deepEqual(pythonCandidates({ root, env: {}, platform, exists: (path) => path === exe }), [{ command: exe, args: [] }]);
  }
});

test('explicit interpreter has priority and an invalid path is not silently ignored', async (t) => {
  const root = await fixture(t);
  const exe = join(root, 'chosen python.exe');
  await writeFile(exe, 'stub');
  assert.deepEqual(pythonCandidates({ root, env: { JOB_SCOUT_PYTHON: exe } }), [{ command: exe, args: [] }]);
  assert.throws(() => pythonCandidates({ root, env: { JOB_SCOUT_PYTHON: './missing.exe' } }), /JOB_SCOUT_PYTHON/);
  let calls = 0;
  await assert.rejects(runPython(['-c', 'pass'], { env: { JOB_SCOUT_PYTHON: 'missing-python' } }, {
    runImpl: async () => { calls++; throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
  }), /missing/);
  assert.equal(calls, 1);
});

test('a missing Windows launcher falls back with Python 3 selected explicitly', async () => {
  const calls = [];
  await runPython(['-c', 'pass'], { env: {} }, {
    platform: 'win32', exists: () => false,
    runImpl: async (command, args) => {
      calls.push([command, args]);
      if (command === 'py') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return { stdout: 'ok' };
    },
  });
  assert.deepEqual(calls, [['py', ['-3', '-c', 'pass']], ['python', ['-c', 'pass']]]);
});

test('an import failure does not run the job again under another Python', async () => {
  const calls = [];
  await assert.rejects(runPython(['script.py'], { env: {} }, {
    platform: 'win32', exists: () => false,
    runImpl: async (command) => { calls.push(command); throw new Error('ModuleNotFoundError: jobspy'); },
  }), /ModuleNotFoundError/);
  assert.deepEqual(calls, ['py']);
});

test('warm worker and one-shot use the same venv executable, including spaces', async (t) => {
  const root = await fixture(t);
  const exe = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  await mkdir(join(exe, '..'), { recursive: true });
  await writeFile(exe, 'stub');
  const calls = [];
  await runPython(['jobspy.py', '--config', 'input.json'], { env: {} }, {
    root, runImpl: async (command, args) => { calls.push([command, args]); return { stdout: '{}' }; },
  });
  const worker = await startJobspyWorkerFromBins({
    root, env: { ...process.env, JOB_SCOUT_PYTHON: '' }, script: 'jobspy.py',
    spawnImpl: (command, args, options) => {
      calls.push([command, args]);
      return spawn(process.execPath, [join(ROOT, 'scripts/lib/fetch-pool-mock-worker.mjs')], options);
    },
  });
  try { assert.equal((await worker.request({ what: 'Test' })).ok, true); }
  finally { await worker.close(); }
  assert.deepEqual(calls, [[exe, ['jobspy.py', '--config', 'input.json']], [exe, ['jobspy.py', '--worker']]]);
});
