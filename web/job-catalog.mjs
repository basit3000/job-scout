import { Worker } from 'node:worker_threads';

// Only the requested page crosses back to the HTTP thread. Static assets and
// lightweight settings remain available even during a cold archive scan.
export function createJobCatalog() {
  let worker, sequence = 0, closed = false;
  const pending = new Map();
  function start() {
    if (closed) throw new Error('Job catalog is closed');
    if (worker) return worker;
    const current = new Worker(new URL('./job-catalog-worker.mjs', import.meta.url));
    worker = current;
    const fail = error => {
      if (worker !== current) return;
      worker = null;
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    };
    current.on('message', ({ id, result, error }) => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      if (error) request.reject(new Error(error));
      else request.resolve(result);
      if (!pending.size) current.unref();
    });
    current.on('error', fail);
    current.on('exit', code => fail(new Error(`Job catalog stopped (${code}). Retry loading the page.`)));
    current.unref();
    return current;
  }
  return {
    request(kind, search = '') {
      return new Promise((resolve, reject) => {
        const current = start(), id = ++sequence;
        pending.set(id, { resolve, reject });
        current.ref();
        current.postMessage({ id, kind, search });
      });
    },
    invalidate() { worker?.postMessage({ kind: 'invalidate' }); },
    async close() {
      closed = true;
      await worker?.terminate();
    },
  };
}
