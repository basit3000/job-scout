import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { explicitTokenUsage } from './agent-usage.mjs';
import { dirname, delimiter, join } from 'node:path';
import { ROOT, run } from './common.mjs';

const context = new AsyncLocalStorage();
const children = new Set();
export const withGooseContext = (signal, fn) => context.run({ signal }, fn);

export async function resolveGooseBinary() {
  if (process.env.GOOSE_BIN?.trim()) return process.env.GOOSE_BIN.trim();
  const manifest = join(ROOT, 'toolchain.windows.json');
  if (process.platform === 'win32' && existsSync(manifest)) {
    const pin = JSON.parse(readFileSync(manifest, 'utf8')).goose;
    const local = join(ROOT, '.workspace', 'tools', `goose-${pin.version}`, pin.executable);
    if (existsSync(local)) return local;
  }
  try {
    const found = await run(process.platform === 'win32' ? 'where' : 'which', ['goose']);
    return found.stdout.trim().split(/\r?\n/)[0] || null;
  } catch { return null; }
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); }
  }
}

export function cancelGooseRuns() {
  for (const child of children) killTree(child);
  return children.size > 0;
}

// File/stdin prompts avoid Windows command-line limits. Each invocation is a
// fresh Goose session, using the user's existing provider and authentication.
export async function runGoose({ prompt, cwd = ROOT, model = '', extensionUrl,
  onEvent = () => {}, onUsage = () => {}, signal = context.getStore()?.signal, timeoutMs = 20 * 60_000,
  maxTurns = 12, binary, env = {}, spawnImpl = spawn, builtins = true } = {}) {
  signal?.throwIfAborted();
  const bin = binary || await resolveGooseBinary();
  onEvent = typeof onEvent === 'function' ? onEvent : () => {};
  if (!bin) throw new Error('Goose is not installed. Run ./setup.ps1, then ./goose.ps1 configure.');
  const args = ['run', '--no-profile', '--no-session', '--output-format', 'stream-json',
    '--max-turns', String(maxTurns), '--max-tool-repetitions', '2', '--instructions', '-'];
  if (extensionUrl) args.push('--with-streamable-http-extension', `${extensionUrl} timeout=1800`);
  else if (builtins) args.push('--with-builtin', 'developer');
  if (model) args.push('--model', model);
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  const extraPath = [dirname(process.execPath), process.env.APPDATA && join(process.env.APPDATA, 'npm')].filter(Boolean);
  return new Promise((resolve, reject) => {
    const child = spawnImpl(bin, args, { cwd, windowsHide: true, shell: false,
      detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, [pathKey]: [...extraPath, process.env[pathKey] || ''].join(delimiter),
        GOOSE_MODE: 'smart_approve', ...env } });
    children.add(child);
    let output = '', stderr = '', pending = '', display = '', failure;
    const flushDisplay = () => {
      if (display.trim()) onEvent({ stream: 'stdout', line: display.trim(), t: Date.now() });
      display = '';
    };
    const stop = (reason) => { failure = reason; killTree(child); };
    const abort = () => stop(new Error('Goose run cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => stop(new Error('Goose run timed out')), timeoutMs);
    const emitLine = (line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        const usage = explicitTokenUsage(event.usage);
        if (usage) onUsage(usage);
        // Only display assistant text; tool inputs can contain whole private packets.
        const message = event.message;
        if (message?.content?.some((block) => block.type === 'toolRequest' || block.type === 'toolResponse')) {
          flushDisplay();
          if (output && !output.endsWith('\n\n')) output += '\n\n';
        }
        if (message?.role === 'assistant') {
          for (const block of message.content || []) if (block.type === 'text' && block.text) {
            output = (output + block.text).slice(-32_000);
            display += block.text;
            if (display.includes('\n') || display.length > 500) flushDisplay();
          }
        }
        if (event.type === 'error') failure = new Error(event.error || event.message || 'Goose failed');
      } catch { /* Goose startup banners are not JSON events. */ }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk.toString();
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        emitLine(pending.slice(0, newline)); pending = pending.slice(newline + 1);
      }
      if (pending.length > 2_000_000) stop(new Error('Goose output exceeded the message limit'));
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.stdin.on('error', () => {}); // Exit/error handlers report startup failures.
    child.stdin.end(prompt);
    child.on('error', (error) => { failure = error; });
    child.on('close', (code) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); children.delete(child);
      emitLine(pending);
      flushDisplay();
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Goose exited with code ${code}: ${stderr.replace(/\x1b\[[0-9;]*m/g, '').slice(-1000)}`));
      else resolve(output.trim());
    });
  });
}
