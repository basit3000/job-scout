#!/usr/bin/env node
/** Mock JobSpy worker for fetch-pool tests — JSON lines in, JSON lines out. */
import readline from 'node:readline';

console.log(JSON.stringify({ ready: true }));

const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  const text = String(line || '').trim();
  if (!text) continue;
  const msg = JSON.parse(text);
  if (msg.cmd === 'quit') break;
  console.log(JSON.stringify({
    ok: true,
    jobs: [{ title: msg.what || 'unknown', board: (msg.boards || [])[0] || 'indeed' }],
    count: 1,
  }));
}
