import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { validateCvOptions } from './cv-preferences.mjs';
import { validateTemplateIds } from './cv-template-schema.mjs';

const noArgs = { type: 'object', properties: {}, additionalProperties: false };
export const GOOSE_TOOLS = [
  { name: 'inspect_job', label: 'Read job requirements', description: 'Read the current job posting and fit assessment.' },
  { name: 'inspect_cv', label: 'Read CV and evidence', description: 'Read the candidate CV, profile and existing evidence. These are the factual sources.' },
  { name: 'keyword_gaps', label: 'Analyze keyword gaps', description: 'Compare the posting with the CV and evidence; distinguish supported skills from gaps.' },
  { name: 'prepare_cv', label: 'Prepare CV + review / repair', description: 'Use Goose to tailor a CV for this job, render it, verify facts, review and repair once if needed. Preserves previous accepted documents on failure.', writes: true },
  { name: 'prepare_letter', label: 'Prepare cover letter + review / repair', description: 'Use Goose to write a cover letter, render it, verify facts, review and repair once if needed. Uses the current tailored CV when available.', writes: true },
  { name: 'inspect_reviews', label: 'Read review findings', description: 'Read existing CV and letter review findings and document status.' },
].map((tool) => ({ ...tool, inputSchema: noArgs }));

export function validateGooseRequest(body) {
  if (!Array.isArray(body.tools) || !body.tools.length || body.tools.length > GOOSE_TOOLS.length
    || body.tools.some((name) => !GOOSE_TOOLS.some((tool) => tool.name === name))) {
    throw new Error('Select at least one supported Job Scout tool.');
  }
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) {
    throw new Error('Enter a prompt of 1–4000 characters.');
  }
  if (body.pushToOverleaf !== undefined && typeof body.pushToOverleaf !== 'boolean') throw new Error('Push to Overleaf must be an explicit checkbox choice.');
  if (body.pushToOverleaf && !body.tools.includes('prepare_cv')) throw new Error('Select Prepare CV before enabling Push to Overleaf.');
  return { tools: [...new Set(body.tools)], prompt: body.prompt.trim(),
    ...(body.templateIds === undefined ? {} : { templateIds: validateTemplateIds(body.templateIds) }),
    ...(body.pushToOverleaf === undefined ? {} : { pushToOverleaf: body.pushToOverleaf }),
    ...(body.cvOptions === undefined ? {} : { cvOptions: validateCvOptions(body.cvOptions) }) };
}

// A per-run, loopback-only MCP endpoint. The unguessable path expires when the
// run ends. Both tools/list and tools/call enforce the same server-side allowlist.
export async function createGooseToolBridge({ tools, handlers, signal, onEvent = () => {}, maxCalls = 12 }) {
  const selected = GOOSE_TOOLS.filter((tool) => tools.includes(tool.name));
  const secretPath = `/mcp/${randomBytes(32).toString('hex')}`;
  const calls = [];
  const completedWrites = new Map();
  const pending = new Set();
  let busy = false;
  let accepting = true;
  const callTool = async (name, args = {}) => {
    signal?.throwIfAborted();
    if (!accepting) throw new Error('Goose tool session has finished accepting calls');
    const tool = selected.find((t) => t.name === name);
    if (!tool || typeof handlers[name] !== 'function') throw new Error('Tool is not enabled for this run');
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length) throw new Error('This tool takes no arguments');
    // Retries cannot silently regenerate and replace the same documents twice.
    if (completedWrites.has(name)) return completedWrites.get(name);
    if (busy) throw new Error('Another tool is running. Call tools sequentially.');
    if (calls.length >= maxCalls) throw new Error('Tool call limit reached');
    busy = true;
    const entry = { tool: name, status: 'running', startedAt: new Date().toISOString() };
    calls.push(entry);
    onEvent({ stream: 'meta', line: `Goose tool: ${tool.label}`, t: Date.now() });
    try {
      const result = await handlers[name]();
      signal?.throwIfAborted();
      entry.status = 'done';
      if (tool.writes) completedWrites.set(name, result);
      onEvent({ stream: 'meta', line: `Goose tool finished: ${tool.label}`, t: Date.now() });
      return result;
    } catch (error) {
      entry.status = 'failed'; entry.error = error.message;
      onEvent({ stream: 'stderr', line: `Goose tool failed: ${tool.label}: ${error.message}`, t: Date.now() });
      throw error;
    } finally { entry.finishedAt = new Date().toISOString(); busy = false; }
  };
  const server = createServer(async (req, res) => {
    const reply = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(payload == null ? '' : JSON.stringify(payload));
    };
    if (req.url !== secretPath || req.headers.origin) return reply(403, { error: 'Forbidden' });
    if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
    let request;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 32_000) return reply(413, { error: 'Request too large' });
      }
      request = JSON.parse(body);
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new Error('Invalid JSON-RPC request');
      if (request.id == null) return reply(202, null);
      let result;
      if (request.method === 'initialize') result = {
        protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'job-scout', version: '1.0.0' },
      };
      else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools: selected.map(({ name, description, inputSchema, writes }) =>
        ({ name, description, inputSchema, annotations: { readOnlyHint: !writes, destructiveHint: false, openWorldHint: false } })) };
      else if (request.method === 'tools/call') {
        const task = callTool(request.params?.name, request.params?.arguments);
        pending.add(task);
        try { result = { content: [{ type: 'text', text: JSON.stringify(await task) }] }; }
        catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message }] }; }
        finally { pending.delete(task); }
      } else return reply(200, { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method' } });
      reply(200, { jsonrpc: '2.0', id: request.id, result });
    } catch (error) { reply(400, { jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32600, message: error.message } }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}${secretPath}`, calls,
    async finish() {
      // A disconnected MCP client does not mean its host work has finished.
      accepting = false;
      await Promise.allSettled([...pending]);
    },
    async close() {
      accepting = false;
      const closed = new Promise((resolve) => server.close(resolve));
      await Promise.allSettled([...pending]);
      server.closeAllConnections(); await closed;
    } };
}
