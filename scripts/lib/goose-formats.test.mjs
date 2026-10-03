import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCvFormats } from './goose-formats.mjs';

const templates = ['a', 'b', 'c'].map(id => ({ id }));

test('CV formats overlap at most two workers and retain selection order', async () => {
  const started = templates.map(() => Promise.withResolvers());
  const releases = templates.map(() => Promise.withResolvers());
  let active = 0, peak = 0;
  const run = prepareCvFormats(templates, async template => {
    const index = templates.indexOf(template);
    peak = Math.max(peak, ++active);
    started[index].resolve();
    await releases[index].promise;
    active--;
    return { id: template.id };
  });
  await Promise.all([started[0].promise, started[1].promise]);
  assert.equal(active, 2);
  releases[1].resolve();
  await started[2].promise;
  releases[2].resolve();
  releases[0].resolve();
  assert.deepEqual((await run).map(result => result.id), ['a', 'b', 'c']);
  assert.equal(peak, 2);
});

test('the parent default pack finishes before any template subfolder starts', async () => {
  const events = [];
  const result = await prepareCvFormats([templates[0], { id: 'default' }, templates[1]], async template => {
    events.push(`start:${template.id}`);
    await Promise.resolve();
    events.push(`end:${template.id}`);
    return { id: template.id };
  });
  assert.deepEqual(events.slice(0, 2), ['start:default', 'end:default']);
  assert.deepEqual(result.map(item => item.id), ['a', 'default', 'b']);
});

for (const outcome of ['failure', 'needs-review', 'cancelled']) {
  test(`CV format ${outcome} stops queued work and waits for active workers`, async () => {
    const secondStarted = Promise.withResolvers();
    const releaseSecond = Promise.withResolvers();
    const controller = new AbortController();
    const started = [];
    let secondFinished = false;
    const run = prepareCvFormats(templates, async template => {
      started.push(template.id);
      if (template.id === 'a') {
        await secondStarted.promise;
        if (outcome === 'cancelled') controller.abort(new Error('cancelled'));
        if (outcome !== 'needs-review') throw new Error(outcome);
        return { needsReview: true };
      }
      secondStarted.resolve();
      await releaseSecond.promise;
      secondFinished = true;
      return {};
    }, { signal: controller.signal });
    const checked = outcome === 'needs-review' ? run : assert.rejects(run, new RegExp(outcome));
    await secondStarted.promise;
    // Let the first worker observe failure before releasing the other worker.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(secondFinished, false);
    releaseSecond.resolve();
    await checked;
    assert.equal(secondFinished, true);
    assert.deepEqual(started, ['a', 'b']);
  });
}
