/** Run independent template packs two at a time, draining active work on failure. */
export async function prepareCvFormats(templates, prepare, { signal } = {}) {
  const results = new Array(templates.length);
  let stopped = false;
  let failure;
  const run = async index => {
    if (stopped) return;
    try {
      signal?.throwIfAborted();
      const result = await prepare(templates[index]);
      results[index] = result;
      if (result.needsReview) stopped = true;
    } catch (error) {
      stopped = true;
      failure ||= error;
    }
  };
  // The default pack contains the template subfolders. Finish its directory
  // replacement before any child pack can be published.
  const defaultIndex = templates.findIndex(template => template.id === 'default');
  if (defaultIndex >= 0) await run(defaultIndex);
  const remaining = templates.map((_, index) => index).filter(index => index !== defaultIndex);
  let next = 0;
  const worker = async () => {
    while (!stopped && next < remaining.length) await run(remaining[next++]);
  };
  await Promise.all([worker(), worker()]);
  signal?.throwIfAborted();
  if (failure) throw failure;
  return results.filter(Boolean);
}
