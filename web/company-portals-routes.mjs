import {
  loadCompanyPortals,
  setCompanyPortalEnabled,
  removeCompanyPortal,
} from '../scripts/lib/company-portals.mjs';

export async function handleCompanyPortalsApi(req, res, url, { json, readBody }) {
  if (!url.pathname.startsWith('/api/company-portals')) return false;

  try {
    if (url.pathname === '/api/company-portals' && req.method === 'GET') {
      const data = await loadCompanyPortals();
      return json(res, 200, data);
    }

    if (url.pathname === '/api/company-portals/toggle' && req.method === 'PATCH') {
      const body = await readBody(req);
      if (!body.id || typeof body.enabled !== 'boolean') {
        return json(res, 400, { error: 'id and enabled (boolean) are required' });
      }
      const data = await setCompanyPortalEnabled(body.id, body.enabled);
      return json(res, 200, { ok: true, portals: data.portals });
    }

    if (url.pathname === '/api/company-portals' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json(res, 400, { error: 'id query parameter is required' });
      const data = await removeCompanyPortal(id);
      return json(res, 200, { ok: true, portals: data.portals });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return json(res, /not found/i.test(err.message) ? 404 : 400, { error: err.message });
  }
}
