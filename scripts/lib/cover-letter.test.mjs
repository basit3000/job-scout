import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { polishCoverLetter, assembleCoverLetter } from './cover-letter.mjs';

describe('polishCoverLetter', () => {
  it('removes em dashes and spaced hyphen asides', () => {
    const out = polishCoverLetter('That mix — production APIs - is the work');
    assert.doesNotMatch(out, /—/);
    assert.doesNotMatch(out, / - /);
    assert.match(out, /That mix, production APIs, is the work/);
  });
});

describe('assembleCoverLetter', () => {
  it('fills role and company', () => {
    const { letter } = assembleCoverLetter(
      'Application for [Role]\n\nI am applying for the [Role] position at [Company].\n',
      { title: 'Backend Engineer', company: 'Acme' },
      {},
    );
    assert.match(letter, /Application for Backend Engineer/);
    assert.match(letter, /at Acme/);
  });
});
