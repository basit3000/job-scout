import { buildSpotifyWidgetSvg, fetchSpotifyTrack } from './lib/spotify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const track = await fetchSpotifyTrack();
    const svg = buildSpotifyWidgetSvg(track);

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    return res.status(200).send(svg);
  } catch {
    return res.status(502).json({ error: 'Failed to fetch Spotify status' });
  }
}
