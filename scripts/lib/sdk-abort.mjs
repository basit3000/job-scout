/**
 * @cursor/sdk aborts in-flight local work from AbortSignal listeners.
 * Those throws are uncaught exceptions (not rejected promises), so they
 * kill the Node process unless we swallow this specific error.
 */

export function isAbortError(err) {
  if (!err || typeof err !== 'object') return false;
  return err.name === 'AbortError' || err.code === 'ABORT_ERR';
}

export function installSdkAbortGuard(onAbort) {
  if (installSdkAbortGuard.installed) return;
  installSdkAbortGuard.installed = true;

  process.on('uncaughtException', (err) => {
    if (isAbortError(err)) {
      onAbort?.(err, 'uncaughtException');
      return;
    }
    console.error(err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    if (isAbortError(reason)) {
      onAbort?.(reason, 'unhandledRejection');
      return;
    }
    console.error('Unhandled promise rejection:', reason);
    process.exit(1);
  });
}
