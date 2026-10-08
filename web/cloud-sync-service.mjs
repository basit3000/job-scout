import { CloudTracker, configuredOrigin } from '../scripts/lib/cloud-tracker.mjs';
import { syncApplications, syncState } from '../scripts/lib/cloud-sync.mjs';
import { onApplicationApplied } from '../scripts/lib/decisions.mjs';
import { ROOT } from '../scripts/lib/common.mjs';
import { resolve } from 'node:path';

// Serialize UI writes and timer runs within this server. The existing private
// file lock still protects against another process using the same connection.
export function createCloudSyncService({ root, allowLoopbackHttp = false, now = () => Date.now(),
  open = options => CloudTracker.open(options), configured = () => configuredOrigin(root), invalidate = () => {} } = {}) {
  let queue = Promise.resolve(), active = null, syncing = false, timer, unsubscribe, stopped = false, checking = false;
  const run = (task, baseUrl) => {
    const work = queue.catch(() => {}).then(async () => {
      active = await open({ root, baseUrl, allowLoopbackHttp });
      try { return await task(active); }
      finally { const previous = active; active = null; await previous.close(); }
    });
    queue = work; return work;
  };
  const cycle = async (adapter, options) => {
    syncing = true;
    try { return await syncApplications(adapter, options); }
    finally { syncing = false; invalidate(); }
  };
  async function applied({ root: recordRoot, id }) {
    if (stopped || resolve(recordRoot) !== resolve(root || ROOT) || !await configured()) return;
    await run(async adapter => {
      if (!syncState(adapter).onApplied || !adapter.state.token || adapter.state.revoked) return;
      await cycle(adapter, { localId: id });
    });
  }
  async function tick() {
    if (stopped || active || checking) return;
    checking = true;
    try {
      if (!await configured()) return;
      await run(async adapter => {
        const state = syncState(adapter);
        if (!state.enabled || !adapter.state.token || adapter.state.revoked) return;
        const due = (Date.parse(state.lastAttempt) || 0) + state.intervalMinutes * 60000;
        if (now() >= due) await cycle(adapter);
      });
    } catch { /* Durable sync status exposes errors; the timer keeps its interval. */ }
    finally { checking = false; }
  }
  return {
    run, tick, cycle, applied,
    async status() {
      if (!await configured()) return { configured: false, paired: false, local: [], remote: [], issues: [], optionalFields: [], pending: 0 };
      const result = active ? await active.status() : await run(adapter => adapter.status());
      return { ...result, syncing };
    },
    start() {
      stopped = false;
      unsubscribe ||= onApplicationApplied(applied);
      if (!timer) { timer = setInterval(() => { void tick(); }, 10000); timer.unref(); }
      void tick();
    },
    async stop() { stopped = true; clearInterval(timer); timer = null; unsubscribe?.(); unsubscribe = null; await queue.catch(() => {}); },
  };
}
