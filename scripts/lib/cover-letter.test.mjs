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

  it('inserts a motive block only when the posting mentions its keywords', () => {
    const template = `Application for [Role]

Core.

<!-- include:motive -->

<!-- optional-blocks -->
:::motive python python django
I first used Python in school.
:::
:::motive java java spring
University Java coursework.
:::
`;
    const py = assembleCoverLetter(
      template,
      { title: 'Python Developer', company: 'Acme', description: 'Python services and Django.' },
      {},
    );
    assert.match(py.letter, /Python in school/);
    assert.doesNotMatch(py.letter, /University Java/);
    assert.equal(py.included.some((b) => b.id === 'python' && b.slot === 'motive'), true);

    const java = assembleCoverLetter(
      template,
      { title: 'Java Engineer', company: 'Acme', description: 'Spring Boot on the JVM.' },
      {},
    );
    assert.match(java.letter, /University Java/);
    assert.doesNotMatch(java.letter, /Python in school/);
  });
});
