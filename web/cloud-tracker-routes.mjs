import { CloudTracker, configuredOrigin } from '../scripts/lib/cloud-tracker.mjs';
import { configureSync, syncApplications } from '../scripts/lib/cloud-sync.mjs';

export async function handleCloudTrackerApi(req, res, url, { readBody, json, invalidate, root, syncService, allowLoopbackHttp = process.env.ALLOW_INSECURE_LOCAL_TRACKER === 'true' }) {
  if (!url.pathname.startsWith('/api/cloud-tracker')) return false;
  let adapter;
  try {
    const action = url.pathname.slice('/api/cloud-tracker'.length);
    if ((action === '' && req.method !== 'GET') || (action !== '' && req.method !== 'POST')) {
      json(res, 405, { error: 'Method not allowed' });
      return true;
    }
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (action === '' && syncService) { json(res, 200, await syncService.status()); return true; }
    if (action === '' && !await configuredOrigin(root)) {
      json(res, 200, { configured: false, paired: false, local: [], remote: [], issues: [], optionalFields: [], pending: 0 });
      return true;
    }
    const execute = async connection => {
      adapter = connection;
      let result;
      switch (action) {
        case '': result = await adapter.status(); break;
        case '/pair':
          if (adapter.adapter.journal) throw new Error('Finish or cancel import recovery before pairing.');
          result = await adapter.client.beginPairing(); break;
        case '/redeem': result = await adapter.redeem(); break;
        case '/pull': result = await adapter.pull(); break;
        case '/sync': result = await adapter.sync(); break;
        case '/sync-now': result = syncService ? await syncService.cycle(adapter) : await syncApplications(adapter); invalidate(); break;
        case '/settings': result = await configureSync(adapter, body); break;
        case '/cancel-preview': adapter.adapter.previews = {}; await adapter.persist(); result = await adapter.status(); break;
        case '/preview': result = await adapter.preview(body); break;
        case '/confirm': result = await adapter.confirm(body.previewId); invalidate(); break;
        case '/recover': await adapter.recover(); invalidate(); result = await adapter.status(); break;
        case '/cancel-recovery': result = await adapter.cancelRecovery(); break;
        case '/dismiss': result = await adapter.dismissIssue(body.id); break;
        case '/reset-snapshot': await adapter.client.resetSnapshot(); result = await adapter.pull(); break;
        case '/disconnect':
          if (adapter.adapter.journal) throw new Error('Finish or cancel import recovery before disconnecting.');
          if (adapter.adapter.automatic) adapter.adapter.automatic.enabled = false;
          await adapter.client.disconnect(); result = await adapter.status(); break;
        default: json(res, 404, { error: 'Unknown tracker action' }); return true;
      }
      if (['/pull', '/sync', '/reset-snapshot'].includes(action)) invalidate();
      json(res, 200, result);
    };
    if (syncService) await syncService.run(execute, action === '/pair' ? body.origin : undefined);
    else { adapter = await CloudTracker.open({ root, baseUrl: action === '/pair' ? body.origin : undefined, allowLoopbackHttp }); await execute(adapter); }
  } catch (error) {
    json(res, 400, { error: error.message });
  } finally { if (!syncService) await adapter?.close(); }
  return true;
}
