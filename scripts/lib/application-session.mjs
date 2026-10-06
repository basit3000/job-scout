import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './common.mjs';
import { readPrivate, writePrivate } from './private-store.mjs';
import { urlDedupeKey } from './dedupe.mjs';

export const SUPPORTED_APPLICATION_PORTALS = ['linkedin', 'greenhouse', 'lever', 'ashby'];
const active = new Map();
const activeVacancies = new Set();
const hash = value => createHash('sha256').update(value).digest('hex');
const pathFor = (id, root) => join(root, 'state', 'apply-sessions', `${hash(id)}.json`);

export async function previousApplicationLock(pack, root = ROOT) {
  const same = job => job?.id === pack.jobId || Boolean(job?.url && pack.applyUrl && urlDedupeKey(job.url) === urlDedupeKey(pack.applyUrl));
  // Preserve old application ledgers without migrating or treating their answers as evidence.
  const legacy = await readPrivate(join(root, 'state', 'auto-apply.json'), { runs: [] });
  if ((legacy.runs || []).some(run => same(run.job) && (['submitted', 'submission_unknown', 'submitting'].includes(run.state)
    || (run.history || []).some(event => ['submitting', 'submission_unknown', 'submitted'].includes(event.to))))) return 'Existing auto-apply ledger records a submitted or uncertain application.';
  const decisions = await readPrivate(join(root, 'state', 'decisions.json'), { decisions: [] });
  if (decisions.decisions.some(item => same(item) && ['applied', 'interviewing', 'offer', 'accepted', 'rejected', 'closed'].includes(item.decision))) return 'Tracker already records an application for this vacancy.';
  const directory = join(root, 'state', 'apply-sessions');
  const files = await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  for (const filename of files.filter(file => /^[a-f0-9]{64}\.json$/.test(file))) {
    const session = await readPrivate(join(directory, filename), null);
    if (session && ['submitted','submitting','submission_unknown'].includes(session.status)
      && (session.jobId === pack.jobId || (session.urlKey && session.urlKey === urlDedupeKey(pack.applyUrl)))) return 'A prior session records a submitted or uncertain application.';
  }
  return null;
}

export async function applicationFingerprint(pack) {
  const documents = {};
  for (const key of ['cvPdf', 'coverLetterPdf', 'coverLetterDocx']) {
    if (pack.files?.[key]) documents[key] = hash(await readFile(pack.files[key]));
  }
  return hash(JSON.stringify({ pack, documents }));
}

export async function readApplicationSession(id, root = ROOT) {
  const session = await readPrivate(pathFor(id, root), null);
  if (session && !active.has(pathFor(id, root)) && ['running', 'submitting'].includes(session.status)) {
    session.status = session.status === 'submitting' ? 'submission_unknown' : 'paused';
    session.reason = 'Interrupted run. Inspect the portal before continuing.';
    await writePrivate(pathFor(id, root), session);
  }
  return session;
}

export function cancelApplicationSession(id, root = ROOT) {
  const controller = active.get(pathFor(id, root)); controller?.abort(); return Boolean(controller);
}

/** Durable write-before-click. An uncertain outcome is deliberately non-retryable. */
export async function runApplicationSession({ pack, adapter, dryRun = true, authorizeSubmit = false,
  freshness = async () => !pack.documentsNeedReview, root = ROOT, signal }) {
  if (!pack.jobId) throw new Error('Application needs a job ID');
  const path = pathFor(pack.jobId, root);
  const vacancyKey = `${root}:${urlDedupeKey(pack.applyUrl) || pack.jobId}`;
  if (active.has(path) || activeVacancies.has(vacancyKey)) throw new Error('Application already running');
  const previous = await readApplicationSession(pack.jobId, root);
  const priorLock = await previousApplicationLock(pack, root);
  if (priorLock) throw new Error(`Application locked: ${priorLock} Never automatically resubmit.`);
  if (active.has(path) || activeVacancies.has(vacancyKey)) throw new Error('Application already running');
  if (['submitted', 'submission_unknown', 'submitting'].includes(previous?.status)) throw new Error(`Application locked: ${previous.status}. Never automatically resubmit.`);
  const controller = new AbortController(); active.set(path, controller); activeVacancies.add(vacancyKey);
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const session = { jobId: pack.jobId, urlKey: urlDedupeKey(pack.applyUrl), portal: pack.ats?.id, dryRun, status: 'running', startedAt: new Date().toISOString(), steps: 0 };
  const save = async (status, reason, extra = {}) => {
    Object.assign(session, { status, reason, updatedAt: new Date().toISOString() }, extra);
    await writePrivate(path, session); return { ...session };
  };
  try {
    if (!SUPPORTED_APPLICATION_PORTALS.includes(pack.ats?.id)) return await save('paused', 'Unsupported portal: use manual assistance.');
    const fingerprint = await applicationFingerprint(pack);
    const check = async () => {
      controller.signal.throwIfAborted();
      if (!(await freshness()) || await applicationFingerprint(pack) !== fingerprint) throw new Error('Documents or answers changed; recreate reviewed preparation before continuing.');
    };
    await check(); await save('running', 'Opening application', { fingerprint });
    await adapter.open({ signal: controller.signal });
    for (let step = 0; step < 20; step++) {
      await check(); session.steps = step + 1;
      const form = await adapter.fillAndInspect(pack);
      await check();
      if (form.login) return await save('paused', 'Log in in the application window, then resume.');
      if (form.confirmed) return await save('submitted', 'Portal shows an existing application confirmation.');
      if (form.missing?.length) return await save('paused', 'Required answers or unsupported controls need attention.', { missing: form.missing });
      if (form.action === 'submit') {
        if (dryRun || !authorizeSubmit || pack.ats.id !== 'linkedin') return await save('ready', 'Dry run complete. Review the portal; other boards require manual submission.');
        await check(); await save('submitting', 'Submission attempted; awaiting positive confirmation.');
        // No retry here, including when click/navigation itself throws.
        await adapter.submit();
        const confirmed = await adapter.confirmation();
        return await save(confirmed ? 'submitted' : 'submission_unknown', confirmed ? 'Portal confirmed submission.' : 'No positive confirmation. Inspect portal; automatic retry is blocked.');
      }
      if (form.action !== 'next') return await save('paused', 'No supported next/review/submit control. Inspect the form.');
      await adapter.next(); await save('running', 'Advanced to next step');
    }
    return await save('paused', 'Step limit reached. Inspect the form before resuming.');
  } catch (error) {
    return await save(session.status === 'submitting' ? 'submission_unknown' : controller.signal.aborted ? 'cancelled' : 'paused', error.message);
  } finally { active.delete(path); activeVacancies.delete(vacancyKey); signal?.removeEventListener('abort', abort); }
}
