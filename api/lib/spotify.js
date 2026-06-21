const SPOTIFY_UID = process.env.SPOTIFY_UID || process.env.VITE_SPOTIFY_UID || 'ic9zxmbzknyeuiza6yh988k8n';

const SPOTIFY_VIEW_URL = new URL('https://spotify-github-profile.kittinanx.com/api/view');
SPOTIFY_VIEW_URL.searchParams.set('uid', SPOTIFY_UID);
SPOTIFY_VIEW_URL.searchParams.set('cover_image', 'false');
SPOTIFY_VIEW_URL.searchParams.set('theme', 'compact');
SPOTIFY_VIEW_URL.searchParams.set('show_offline', 'true');
SPOTIFY_VIEW_URL.searchParams.set('background_color', '121212');

const SPOTIFY_ICON_PATH =
  'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z';

const SPOTIFY_ICON_SCALE = 28 / 24;

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
  <g transform="translate(28, 42) scale(${SPOTIFY_ICON_SCALE})">
    <path fill="#1db954" d="${SPOTIFY_ICON_PATH}"/>
  </g>
  <text x="84" y="44" fill="#ffffff" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="18" font-weight="700">${artistText}</text>
  <text x="84" y="68" fill="#b3b3b3" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="16">${songText}</text>
  ${equalizer}
</svg>`;
}
