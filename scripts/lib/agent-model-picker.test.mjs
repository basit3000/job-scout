import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelPicker, CUSTOM_MODEL } from '../../web/public/agent-model-picker.js';

function element(value = '') {
  const handlers = {};
  return { value, options: [], selectedIndex: 0, hidden: false, disabled: false, textContent: '',
    ownerDocument: { createElement: () => ({}) },
    replaceChildren(...options) { this.options = options; },
    addEventListener(name, handler) { handlers[name] = handler; },
    fire(name, event = {}) { handlers[name]?.(event); },
    focus() {},
  };
}
function setup(fetchCatalog, saveModel = async () => {}) {
  const controls = { select: element(), provider: element('codex'), customInput: element(), hint: element(), refreshButton: element() };
  const errors = [];
  const picker = createModelPicker({ ...controls, fetchCatalog, saveModel, onError: (e) => errors.push(e) });
  return { ...controls, picker, errors };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('slow catalog responses cannot overwrite a newly selected provider', async () => {
  const responses = {};
  const ui = setup((p) => new Promise((resolve) => { responses[p] = resolve; }));
  const codex = ui.picker.load('codex', 'old-saved-model');
  assert.equal(ui.select.disabled, true);
  ui.provider.value = 'claude-code';
  const claude = ui.picker.load('claude-code', 'sonnet');
  responses['claude-code']({ models: [{ id: 'sonnet', displayName: 'Sonnet' }] });
  await claude;
  responses.codex({ models: [{ id: 'new-codex' }] });
  await codex;
  assert.equal(ui.select.value, 'sonnet');
  assert.equal(ui.select.disabled, false);
  assert.ok(!ui.select.options.some((o) => o.value === 'new-codex'));
});

test('saved selections survive unavailable catalogs and errors are visible', async () => {
  const ui = setup(async () => { throw new Error('offline'); });
  await ui.picker.load('codex', 'saved-model');
  assert.equal(ui.select.value, 'saved-model');
  assert.match(ui.select.options.find((o) => o.value === 'saved-model').textContent, /not listed/);
  assert.match(ui.hint.textContent, /offline/);
  assert.equal(ui.refreshButton.disabled, false);
});

test('refresh bypasses the cache and custom models are saved for the current provider', async () => {
  const calls = [];
  const saves = [];
  const ui = setup(async (p, refresh) => { calls.push([p, refresh]); return { models: [{ id: 'known' }] }; }, async (...args) => saves.push(args));
  await ui.picker.load('codex', 'known');
  ui.refreshButton.fire('click');
  await tick();
  assert.deepEqual(calls.at(-1), ['codex', true]);
  assert.equal(ui.select.value, 'known');
  ui.select.value = CUSTOM_MODEL;
  ui.select.fire('change');
  assert.equal(ui.customInput.hidden, false);
  ui.customInput.value = 'custom-model[1m]';
  ui.customInput.fire('keydown', { key: 'Enter', preventDefault() {} });
  await tick();
  assert.deepEqual(saves, [['codex', 'custom-model[1m]']]);
  assert.equal(ui.select.value, 'custom-model[1m]');
  assert.equal(ui.customInput.hidden, true);
});
