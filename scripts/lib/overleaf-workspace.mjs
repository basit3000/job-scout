import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from './common.mjs';

const workspaces = new AsyncLocalStorage();
export function jobOverleafDir(jobId, root = ROOT) {
  return join(root, '.workspace', 'overleaf-jobs', createHash('sha256').update(jobId).digest('hex'), 'overleaf');
}
export function overleafDir(root = ROOT) {
  const current = workspaces.getStore();
  return current?.root === root ? current.dir : join(root, '.workspace', 'overleaf');
}
export function withJobOverleaf(jobId, fn, root = ROOT) {
  return workspaces.run({ root, dir: jobOverleafDir(jobId, root) }, fn);
}
