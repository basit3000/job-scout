import { parentPort } from 'node:worker_threads';
import { queryCatalog, invalidateJobsCache } from './job-catalog-data.mjs';

parentPort.on('message', async ({ id, kind, search }) => {
  if (kind === 'invalidate') { invalidateJobsCache(); return; }
  try { parentPort.postMessage({ id, result: await queryCatalog(kind, search) }); }
  catch (error) { parentPort.postMessage({ id, error: error.message || 'Could not load jobs' }); }
});
