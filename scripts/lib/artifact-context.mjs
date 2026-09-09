import { AsyncLocalStorage } from 'node:async_hooks';

// Only the generation request sees its staging directory. Readers keep using
// the accepted pack until the replacement is complete.
export const artifactContext = new AsyncLocalStorage();
