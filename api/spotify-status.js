const SPOTIFY_UID = process.env.SPOTIFY_UID || process.env.VITE_SPOTIFY_UID || 'ic9zxmbzknyeuiza6yh988k8n';

const SPOTIFY_VIEW_URL = new URL('https://spotify-github-profile.kittinanx.com/api/view');
SPOTIFY_VIEW_URL.searchParams.set('uid', SPOTIFY_UID);
SPOTIFY_VIEW_URL.searchParams.set('cover_image', 'false');
SPOTIFY_VIEW_URL.searchParams.set('theme', 'compact');
SPOTIFY_VIEW_URL.searchParams.set('show_offline', 'true');
SPOTIFY_VIEW_URL.searchParams.set('background_color', '121212');

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseTrack(svg) {
  const artistMatch = svg.match(/class="artist"[^>]*>([^<]+)</i);
  const songMatch = svg.match(/class="song"[^>]*>([^<]+)</i);

  if (artistMatch && songMatch) {
    const artist = decodeHtml(artistMatch[1].trim());
    const song = decodeHtml(songMatch[1].trim());
    const isPlaying = artist !== 'Offline'
      && !/not playing/i.test(song)
      && !/nothing playing/i.test(song);

    return { artist, song, isPlaying };
  }

  if (/nothing playing on spotify/i.test(svg)) {
    return {
      artist: 'Spotify',
      song: 'Nothing playing right now',
      isPlaying: false,
    };
  }

  return null;
}

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
    const response = await fetch(SPOTIFY_VIEW_URL.toString(), {
      headers: { 'User-Agent': 'basitzaheer-portfolio/1.0' },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Spotify status unavailable' });
    }

    const svg = await response.text();
    const track = parseTrack(svg);

    if (!track) {
      return res.status(502).json({ error: 'Could not parse Spotify status' });
    }

    return res.status(200).json(track);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch Spotify status' });
  }
}
