import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { polishCoverLetter, assembleCoverLetter, trimLetterToOnePage } from './cover-letter.mjs';

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
:::motive sample-a sample-a widget
YOUR_ONE_SENTENCE_OF_BACKGROUND
:::
:::motive sample-b sample-b gadget
YOUR_OTHER_SENTENCE_OF_BACKGROUND
:::
`;
    const a = assembleCoverLetter(
      template,
      { title: 'Widget Developer', company: 'Acme', description: 'Build the widget service.' },
      {},
    );
    assert.match(a.letter, /YOUR_ONE_SENTENCE_OF_BACKGROUND/);
    assert.doesNotMatch(a.letter, /YOUR_OTHER_SENTENCE_OF_BACKGROUND/);
    assert.equal(a.included.some((b) => b.id === 'sample-a' && b.slot === 'motive'), true);

    const b = assembleCoverLetter(
      template,
      { title: 'Gadget Engineer', company: 'Acme', description: 'Own the gadget stack.' },
      {},
    );
    assert.match(b.letter, /YOUR_OTHER_SENTENCE_OF_BACKGROUND/);
    assert.doesNotMatch(b.letter, /YOUR_ONE_SENTENCE_OF_BACKGROUND/);
  });

  it('inserts matching past and project sentences without dummy intros', () => {
    const template = `Application for [Role]

Core.

<!-- include:past -->

<!-- include:projects -->

<!-- optional-blocks -->
:::past acme postgres
At Acme I built PostgreSQL models.
:::
:::project widget fastapi
Widget is a FastAPI service.
:::
`;
    const { letter } = assembleCoverLetter(
      template,
      { title: 'Backend', company: 'Co', description: 'FastAPI and postgres APIs.' },
      {},
    );
    assert.match(letter, /At Acme I built PostgreSQL models/);
    assert.match(letter, /Widget is a FastAPI service/);
    assert.doesNotMatch(letter, /Earlier:/);
    assert.doesNotMatch(letter, /I also built similar things myself/);
  });
});

describe('trimLetterToOnePage', () => {
  it('keeps the greeting and drops a low-relevance extra paragraph', () => {
    const letter = [
      'Application for Backend Engineer',
      '',
      'Dear hiring team,',
      '',
      'I want to keep building FastAPI REST APIs like the ones I ship at work.',
      '',
      'I also enjoy cooking and hiking on weekends with no relation to this role.',
      '',
      'Kind regards,',
      '',
      'Alex Example',
    ].join('\n');
    const r = trimLetterToOnePage(letter, {
      title: 'Backend Engineer',
      description: 'FastAPI REST APIs Python Docker',
    }, { force: true });
    assert.match(r.letter, /Dear hiring team/);
    assert.match(r.letter, /Kind regards/);
    assert.match(r.letter, /FastAPI/);
    assert.doesNotMatch(r.letter, /hiking/);
  });
});
