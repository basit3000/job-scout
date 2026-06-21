const SPOTIFY_UID = process.env.SPOTIFY_UID || process.env.VITE_SPOTIFY_UID || 'ic9zxmbzknyeuiza6yh988k8n';

const SPOTIFY_VIEW_URL = new URL('https://spotify-github-profile.kittinanx.com/api/view');
SPOTIFY_VIEW_URL.searchParams.set('uid', SPOTIFY_UID);
SPOTIFY_VIEW_URL.searchParams.set('cover_image', 'false');
SPOTIFY_VIEW_URL.searchParams.set('theme', 'compact');
SPOTIFY_VIEW_URL.searchParams.set('show_offline', 'true');
SPOTIFY_VIEW_URL.searchParams.set('background_color', '121212');

const SPOTIFY_LOGO_PATH =
  'M248 8C111.1 8 0 119.1 0 256s111.1 248 248 248 248-111.1 248-248S384.9 8 248 8zm100.7 364.9'
  + 'c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 0.6-12.3-3.3-1.2-2.6-2.6-4.9-3.6-7.3-1.2-4.2-.4-9.8 4.5-12.8'
  + ' 3.1-1.9 6.6-2.9 10.1-3.7 78.5-20.3 155.7-14.6 219.3-8.5 19.8 2.2 39.9 6.2 56.7 12.7 3.1 1.2 5.5 3 7.5 6.1'
  + ' 2.7 4.8 2.4 9.8-1.1 13.8-2.5 2.9-6.1 4.6-10.3 5.1zm9.4-49.9c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 0.6-12.3-3.3-1.2-2.6-2.6-4.9-3.6-7.3-2.7-4.8-2.4-9.8'
  + ' 1.1-13.8 2.5-2.9 6.1-4.6 10.3-5.1 72.2-14.8 147.9-6.2 212.3-8.5 20.8-2.2 41.7-1.3 62.9 5.4 3.1 1.2 5.5 3 7.5 6.1'
  + ' 2.7 4.8 2.4 9.8-1.1 13.8-2.5 2.9-6.1 4.6-10.3 5.1-62 12.8-127.7 14.6-195.7 5.4zm8.4-49.6c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 0.6-12.3-3.3-1.2-2.6-2.6-4.9-3.6-7.3-2.7-4.8-2.4-9.8'
  + ' 1.1-13.8 2.5-2.9 6.1-4.6 10.3-5.1 72.2-14.8 147.9-6.2 212.3-8.5 20.8-2.2 41.7-1.3 62.9 5.4 3.1 1.2 5.5 3 7.5 6.1 2.7 4.8 2.4 9.8-1.1 13.8-2.5 2.9-6.1 4.6-10.3 5.1-62 12.8-127.7 14.6-195.7 5.4z';

const EQ_BAR_COUNT = 70;

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

export function parseTrack(svg) {
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

export async function fetchSpotifyTrack() {
  const response = await fetch(SPOTIFY_VIEW_URL.toString(), {
    headers: { 'User-Agent': 'basitzaheer-portfolio/1.0' },
  });

  if (!response.ok) {
    throw new Error('Spotify status unavailable');
  }

  const svg = await response.text();
  const track = parseTrack(svg);

  if (!track) {
    throw new Error('Could not parse Spotify status');
  }

  return track;
}

function buildEqualizerSvg(active) {
  if (!active) return '';

  const left = 20;
  const width = 300;
  const gap = 2;
  const bottom = 104;
  const barWidth = (width - gap * (EQ_BAR_COUNT - 1)) / EQ_BAR_COUNT;
  const bars = [];

  for (let index = 0; index < EQ_BAR_COUNT; index += 1) {
    const duration = 350 + (index * 13) % 150;
    const delay = (index * 41) % 280;
    const x = left + index * (barWidth + gap);
    bars.push(
      `<rect x="${x.toFixed(2)}" y="${(bottom - 3).toFixed(2)}" `
      + `width="${barWidth.toFixed(2)}" height="3" rx="1" fill="#1db954">`
      + `<animate attributeName="height" values="3;14;3" dur="${duration}ms" begin="${delay}ms" repeatCount="indefinite"/>`
      + `<animate attributeName="y" values="${(bottom - 3).toFixed(2)};${(bottom - 14).toFixed(2)};${(bottom - 3).toFixed(2)}" `
      + `dur="${duration}ms" begin="${delay}ms" repeatCount="indefinite"/>`
      + `<animate attributeName="opacity" values="0.35;1;0.35" dur="${duration}ms" begin="${delay}ms" repeatCount="indefinite"/>`
      + '</rect>',
    );
  }

  return bars.join('\n  ');
}

export function buildSpotifyWidgetSvg({ artist, song, isPlaying }) {
  const artistText = escapeXml(truncate(artist, 28));
  const songText = escapeXml(truncate(song, 32));
  const equalizer = buildEqualizerSvg(isPlaying);

  return `<svg width="340" height="112" viewBox="0 0 340 112" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Now Playing">
  <title>Spotify Now Playing</title>
  <rect x="0.5" y="0.5" width="339" height="111" rx="10" fill="#121212" stroke="#2a2a2a"/>
  <g transform="translate(27, 41) scale(0.059)">
    <path fill="#1db954" d="${SPOTIFY_LOGO_PATH}"/>
  </g>
  <text x="84" y="44" fill="#ffffff" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="18" font-weight="700">${artistText}</text>
  <text x="84" y="68" fill="#b3b3b3" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="16">${songText}</text>
  ${equalizer}
</svg>`;
}
