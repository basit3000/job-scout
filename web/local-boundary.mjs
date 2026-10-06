/** One boundary for static files, personal reads, streams and mutations. */
export function localRequestError(req) {
  const address = req.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return 'Loopback clients only.';
  const port = req.socket.localPort;
  const allowedHosts = ['localhost', '127.0.0.1', '[::1]'].map(host => `${host}:${port}`);
  const host = req.headers.host;
  if (!allowedHosts.includes(host)) return 'Invalid local Host.';
  if (req.headers.origin && req.headers.origin !== `http://${host}`) return 'Use the Job Scout app origin.';
  if (['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) return 'Cross-origin requests are not allowed.';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    && !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return 'Mutations require application/json.';
  if (!req.url?.startsWith('/') || req.url.startsWith('//')) return 'Invalid request target.';
  return null;
}

export function enforceLocalBoundary(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  const error = localRequestError(req);
  if (!error) return true;
  res.writeHead(403, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error }));
  return false;
}
