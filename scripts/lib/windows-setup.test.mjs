import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, copyFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ROOT, run } from './common.mjs';

const windows = process.platform === 'win32';
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
async function fixture(t) {
  const parent = join(ROOT, '.workspace', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "setup with spaces and 'quote "));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ['setup.ps1', 'scripts/windows/common.ps1', 'package.json', 'toolchain.windows.json']) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(join(ROOT, file), join(root, file));
  }
  return root;
}
async function powershell(command) {
  // PowerShell 7's inherited module paths can hide Windows PowerShell 5.1 modules.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PSMODULEPATH'));
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 20000, env });
}

test('installer preview respects optional flags and leaves the target unchanged', { skip: !windows }, async (t) => {
  const root = await fixture(t);
  const before = await readdir(root, { recursive: true });
  const { stdout } = await powershell(`& ${quote(join(root, 'setup.ps1'))} -Plan -All`);
  assert.match(stdout, /Goose: True/);
  assert.match(stdout, /Start: False/);
  assert.deepEqual(await readdir(root, { recursive: true }), before);
  const base = await powershell(`& ${quote(join(root, 'setup.ps1'))} -Plan -NonInteractive`);
  assert.match(base.stdout, /Goose: True/);
});

test('installer stops when a native command exits unsuccessfully', { skip: !windows }, async (t) => {
  const root = await fixture(t);
  const script = `
    $ErrorActionPreference = 'Stop'
    . ${quote(join(root, 'scripts/windows/common.ps1'))}
    try { Invoke-Checked ${quote(process.execPath)} @('-e', 'process.exit(7)') }
    catch { Write-Output 'Stopped as expected'; exit 0 }
    exit 1
  `;
  assert.match((await powershell(script)).stdout, /Stopped as expected/);
});

test('download checksum mismatch prevents extraction and execution', { skip: !windows }, async (t) => {
  const root = await fixture(t);
  const script = `
    $ErrorActionPreference = 'Stop'
    . ${quote(join(root, 'scripts/windows/common.ps1'))}
    Initialize-JobScout ${quote(root)}
    function Invoke-WebRequest { param([switch]$UseBasicParsing, $Uri, $OutFile, $TimeoutSec); Set-Content -LiteralPath $OutFile -Value 'corrupt download' }
    try { Install-LocalTool 'uv' }
    catch {
      if ($_.Exception.Message -notmatch 'Checksum mismatch') { throw }
      if (Test-Path -LiteralPath (Get-LocalToolPath 'uv')) { throw 'Unexpected executable' }
      Write-Output 'Rejected corrupted download'; exit 0
    }
    exit 1
  `;
  assert.match((await powershell(script)).stdout, /Rejected corrupted download/);
});
