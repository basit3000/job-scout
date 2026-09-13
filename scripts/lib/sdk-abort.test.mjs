import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAbortError } from './sdk-abort.mjs';

describe('isAbortError', () => {
  it('matches DOMException-style AbortError and ABORT_ERR', () => {
    const abort = new Error('This operation was aborted');
    abort.name = 'AbortError';
    assert.equal(isAbortError(abort), true);

    const coded = new Error('aborted');
    coded.code = 'ABORT_ERR';
    assert.equal(isAbortError(coded), true);
  });

  it('rejects ordinary errors and empty values', () => {
    assert.equal(isAbortError(new Error('boom')), false);
    assert.equal(isAbortError(null), false);
    assert.equal(isAbortError('AbortError'), false);
  });
});
