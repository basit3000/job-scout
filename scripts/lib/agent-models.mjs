/** Provider catalogs only: no prompts, inference, or CV content is sent. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function updateAgentSelection(cv, body) {
  const current = cv.agentProvider || 'cursor';
  const provider = body.agentProvider == null ? current : String(body.agentProvider).trim().toLowerCase();
  if (!['cursor', 'claude-code', 'codex'].includes(provider)) throw new Error('Unknown agent provider.');
  const saved = { ...cv.agentModelsByProvider };
  saved[current] = cv.agentModel || '';
  const model = body.agentModel == null
    ? (provider === current ? cv.agentModel || '' : saved[provider] || '')
    : String(body.agentModel).trim();
  // Claude's catalog includes context aliases such as opus[1m].
  if (model.length > 160 || (model && !/^[a-zA-Z0-9][a-zA-Z0-9._+:/\[\]-]*$/.test(model))) {
    throw new Error('Invalid model ID. Use letters, digits, or ._+:/[]- without spaces.');
  }
  saved[provider] = model;
  return { ...cv, agentProvider: provider, agentModel: model, agentModelsByProvider: saved };
}

export function normalizeModels(items, provider) {
  if (!Array.isArray(items)) throw new Error('Provider returned an invalid model catalog.');
  const models = new Map();
  for (const item of items) {
    if (!item || item.hidden || (item.visibility && item.visibility !== 'list')) continue;
    const raw = provider === 'codex' ? (item.model || item.id)
      : provider === 'claude-code' ? item.value : (item.id || item.model?.id);
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const id = raw.trim();
    // The configured-default option is supplied separately for every provider.
    if (id === 'default' || models.has(id)) continue;
    models.set(id, {
      id,
      displayName: item.displayName || item.model?.displayName || id,
      description: item.description || '',
    });
  }
  if (!models.size) throw new Error('Provider returned no selectable models.');
  return [...models.values()];
}

// npm's Windows .cmd shims cannot be spawned without a shell. Run their known
// JavaScript entrypoints directly instead of interpolating JSON into cmd.exe.
export function catalogCommand(bin, provider, exists = existsSync) {
  if (!/\.(cmd|bat)$/i.test(bin)) return { bin, prefix: [] };
  const dir = dirname(bin);
  const entry = provider === 'codex'
    ? join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    : join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
  if (!exists(entry)) throw new Error('Cannot resolve this CLI wrapper. Set the provider binary to its native executable.');
  const node = join(dir, 'node.exe');
  return { bin: exists(node) ? node : process.execPath, prefix: [entry] };
}

function stopCatalogProcess(child) {
  child.stdin?.end();
  if (process.platform === 'win32' && child.pid) {
    // Also stop the native process behind an npm launcher.
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore',
    });
    killer.on('error', () => child.kill());
    killer.unref();
  } else if (child.pid && process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); }
  } else child.kill();
}

function catalogSession(bin, args, onStart, onMessage, {
  cwd, timeoutMs = 20_000, spawnImpl = spawn,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(bin, args, {
      cwd, windowsHide: true, detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let settled = false;
    let buffer = '';
    let bytes = 0;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stopCatalogProcess(child);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Model discovery timed out. Check the CLI login and connection.')), timeoutMs);
    const send = (message) => { if (!settled) child.stdin.write(`${JSON.stringify(message)}\n`); };
    child.stdin.on('error', () => finish(new Error('The CLI closed the model discovery connection.')));
    child.on('error', () => finish(new Error('Could not start the provider CLI. Check its installation.')));
    child.on('close', () => finish(new Error('The CLI exited before returning models. Check its version and login.')));
    // Drain diagnostics, but never expose arbitrary CLI stderr (may contain credentials).
    child.stderr.on('data', () => {});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > 4 * 1024 * 1024) return finish(new Error('Provider catalog exceeded the discovery size limit.'));
      buffer += chunk;
      let end;
      while (!settled && (end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        try { onMessage(message, send, finish); } catch (error) { finish(error); }
      }
    });
    try { onStart(send); } catch (error) { finish(error); }
  });
}

export async function discoverCodexModels(bin, options = {}) {
  const command = catalogCommand(bin, 'codex');
  let requestId = 2;
  const models = [];
  const cursors = new Set();
  // https://developers.openai.com/codex/app-server#models
  return catalogSession(command.bin, [...command.prefix, 'app-server'], (send) => {
    send({ id: 1, method: 'initialize', params: {
      clientInfo: { name: 'job_scout', version: '1.0.0' },
      capabilities: { experimentalApi: false },
    } });
  }, (message, send, finish) => {
    if (message.id !== 1 && message.id !== requestId) return;
    if (message.error) throw new Error('Codex rejected model discovery. Update the CLI and check its login.');
    if (message.id === 1) {
      send({ method: 'initialized' });
      send({ id: requestId, method: 'model/list', params: { limit: 100, includeHidden: false } });
      return;
    }
    const result = message.result;
    if (!Array.isArray(result?.data)) throw new Error('Codex returned an invalid model catalog.');
    models.push(...result.data);
    if (result.nextCursor) {
      if (cursors.has(result.nextCursor) || cursors.size >= 20) throw new Error('Codex returned invalid catalog pagination.');
      cursors.add(result.nextCursor);
      send({ id: ++requestId, method: 'model/list', params: { limit: 100, includeHidden: false, cursor: result.nextCursor } });
    } else finish(null, normalizeModels(models, 'codex'));
  }, options);
}

export async function discoverClaudeModels(bin, options = {}) {
  const command = catalogCommand(bin, 'claude-code');
  // Claude Agent SDK's initialize response contains supportedModels(). We only
  // initialize its streaming protocol; no user turn or tool execution follows.
  return catalogSession(command.bin, [...command.prefix,
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json',
    '--verbose', '--no-session-persistence', '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}', '--settings', '{"disableAllHooks":true}',
  ], (send) => {
    send({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } });
  }, (message, _send, finish) => {
    if (message.type !== 'control_response' || message.response?.request_id !== 'models') return;
    if (message.response.subtype !== 'success') throw new Error('Claude Code rejected model discovery. Check its version and login.');
    finish(null, normalizeModels(message.response.response?.models, 'claude-code'));
  }, options);
}

export function createModelCatalog(load, { now = Date.now, ttlMs = 300_000, retryMs = 15_000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async (provider, { refresh = false } = {}) => {
    const previous = cache.get(provider);
    if (pending.has(provider)) return pending.get(provider);
    if (!refresh && previous && previous.expires > now()) return previous.result;
    const request = (async () => {
      const defaultModel = { id: '', displayName: 'Configured default', description: 'Use your configured model without a per-run override.' };
      let result;
      try {
        const models = await load(provider);
        if (!models.length) throw new Error('Provider returned no selectable models.');
        result = { provider, models: [defaultModel, ...models], source: provider, fetchedAt: new Date(now()).toISOString() };
        cache.set(provider, { result, lastGood: result, expires: now() + ttlMs });
      } catch (error) {
        const lastGood = previous?.lastGood;
        result = { provider, models: lastGood?.models || [defaultModel],
          source: lastGood ? 'stale' : 'unavailable', fetchedAt: lastGood?.fetchedAt || null,
          error: error.message || 'Model discovery failed.' };
        cache.set(provider, { result, lastGood, expires: now() + retryMs });
      }
      return result;
    })();
    pending.set(provider, request);
    try { return await request; } finally { pending.delete(provider); }
  };
}
